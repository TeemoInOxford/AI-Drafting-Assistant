#!/usr/bin/env tsx
/**
 * train_win_model.ts
 *
 * Phase 2: Train per-slot Logistic Regression win-probability models.
 *
 * Input:  data/grid_v2/win_features.jsonl
 * Output: data/grid_v2/win_models.json
 *
 * Rules:
 *   - One model per PICK_1 … PICK_5
 *   - Chronological 2/3 train · 1/3 val split (by features_source_cutoff)
 *   - Z-score normalization (train-set stats applied to val)
 *   - Hand-rolled logistic regression (batch GD + L2)
 *   - No external ML libs, no new features
 *
 * Usage:
 *   npx tsx scripts/train_win_model.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ============================================================================
// Constants
// ============================================================================

const DATA_DIR = path.join(process.cwd(), 'data', 'grid_v2');
const INPUT_FILE = path.join(DATA_DIR, 'win_features.jsonl');
const OUTPUT_FILE = path.join(DATA_DIR, 'win_models.json');

const FEATURE_NAMES = [
  'our_meta_sum',
  'opp_meta_sum',
  'our_synergy',
  'opp_synergy',
  'counter_for',
  'counter_against',
  'power_diff',
  'role_coverage',
  'pick_progress',
] as const;

type FeatureName = typeof FEATURE_NAMES[number];

const SLOTS = ['PICK_1', 'PICK_2', 'PICK_3', 'PICK_4', 'PICK_5'] as const;

// Hyperparameters
const LR_INIT = 0.5;
const L2_LAMBDA = 0.01;
const MAX_ITER = 2000;
const TOL = 1e-7;

// ============================================================================
// Types
// ============================================================================

interface FeatureRow {
  slot: string;
  cutoff: string; // features_source_cutoff
  x: number[];    // feature vector (same order as FEATURE_NAMES)
  y: number;      // outcome 0|1
}

interface NormStats {
  mean: number[];
  std: number[];
}

interface TrainedModel {
  weights: number[];
  bias: number;
}

interface Metrics {
  accuracy: number;
  log_loss: number;
  brier_score: number;
  auc: number;
  n: number;
  win_rate: number;
}

// ============================================================================
// Logistic Regression
// ============================================================================

function sigmoid(z: number): number {
  if (z > 500) return 1.0;
  if (z < -500) return 0.0;
  return 1.0 / (1.0 + Math.exp(-z));
}

function predict(x: number[], w: number[], b: number): number {
  let z = b;
  for (let j = 0; j < w.length; j++) z += w[j] * x[j];
  return sigmoid(z);
}

function trainLogistic(X: number[][], y: number[]): TrainedModel {
  const n = X.length;
  const dim = X[0].length;
  const w = new Array(dim).fill(0);
  let b = 0;
  let lr = LR_INIT;
  let prevLoss = Infinity;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    // Accumulate gradients
    const gW = new Array(dim).fill(0);
    let gB = 0;
    let loss = 0;

    for (let i = 0; i < n; i++) {
      const p = predict(X[i], w, b);
      const err = p - y[i];
      for (let j = 0; j < dim; j++) gW[j] += err * X[i][j];
      gB += err;

      const eps = 1e-15;
      loss -= y[i] * Math.log(p + eps) + (1 - y[i]) * Math.log(1 - p + eps);
    }

    loss /= n;
    // L2 penalty on loss (for monitoring)
    let l2Penalty = 0;
    for (let j = 0; j < dim; j++) l2Penalty += w[j] * w[j];
    loss += 0.5 * L2_LAMBDA * l2Penalty;

    // Check convergence
    if (Math.abs(prevLoss - loss) < TOL && iter > 10) break;

    // Backtrack if loss increased
    if (loss > prevLoss + 1e-10) {
      lr *= 0.5;
    }

    // Update weights
    for (let j = 0; j < dim; j++) {
      w[j] -= lr * (gW[j] / n + L2_LAMBDA * w[j]);
    }
    b -= lr * (gB / n);

    prevLoss = loss;
  }

  return { weights: w, bias: b };
}

// ============================================================================
// Normalization
// ============================================================================

function computeNormStats(X: number[][]): NormStats {
  const n = X.length;
  const dim = X[0].length;
  const mean = new Array(dim).fill(0);
  const std = new Array(dim).fill(0);

  for (const row of X) {
    for (let j = 0; j < dim; j++) mean[j] += row[j];
  }
  for (let j = 0; j < dim; j++) mean[j] /= n;

  for (const row of X) {
    for (let j = 0; j < dim; j++) std[j] += (row[j] - mean[j]) ** 2;
  }
  for (let j = 0; j < dim; j++) std[j] = Math.sqrt(std[j] / n);

  return { mean, std };
}

function applyNorm(X: number[][], stats: NormStats): number[][] {
  return X.map(row =>
    row.map((v, j) => (stats.std[j] > 1e-10 ? (v - stats.mean[j]) / stats.std[j] : 0))
  );
}

// ============================================================================
// Metrics
// ============================================================================

function computeMetrics(X: number[][], y: number[], w: number[], b: number): Metrics {
  const n = X.length;
  let correct = 0;
  let logLoss = 0;
  let brier = 0;
  let wins = 0;
  const preds: Array<{ p: number; y: number }> = [];

  for (let i = 0; i < n; i++) {
    const p = predict(X[i], w, b);
    if ((p >= 0.5 ? 1 : 0) === y[i]) correct++;

    const eps = 1e-15;
    logLoss -= y[i] * Math.log(p + eps) + (1 - y[i]) * Math.log(1 - p + eps);
    brier += (p - y[i]) ** 2;
    wins += y[i];
    preds.push({ p, y: y[i] });
  }

  // AUC via Mann–Whitney U
  preds.sort((a, b) => b.p - a.p);
  const totalPos = preds.filter(r => r.y === 1).length;
  const totalNeg = n - totalPos;
  let posAbove = 0;
  let auc = 0;
  for (const r of preds) {
    if (r.y === 1) posAbove++;
    else auc += posAbove;
  }
  auc = totalPos > 0 && totalNeg > 0 ? auc / (totalPos * totalNeg) : 0.5;

  return {
    accuracy: correct / n,
    log_loss: logLoss / n,
    brier_score: brier / n,
    auc,
    n,
    win_rate: wins / n,
  };
}

/** 5-bin calibration table */
function calibrationTable(
  X: number[][],
  y: number[],
  w: number[],
  b: number,
): Array<{ bin: string; n: number; predicted: number; actual: number }> {
  const buckets: Array<{ sum_p: number; sum_y: number; n: number }> = [];
  const edges = [0, 0.4, 0.45, 0.5, 0.55, 0.6, 1.01];
  for (let k = 0; k < edges.length - 1; k++) buckets.push({ sum_p: 0, sum_y: 0, n: 0 });

  for (let i = 0; i < X.length; i++) {
    const p = predict(X[i], w, b);
    for (let k = 0; k < edges.length - 1; k++) {
      if (p >= edges[k] && p < edges[k + 1]) {
        buckets[k].sum_p += p;
        buckets[k].sum_y += y[i];
        buckets[k].n++;
        break;
      }
    }
  }

  return buckets.map((bk, k) => ({
    bin: `[${edges[k].toFixed(2)},${edges[k + 1].toFixed(2)})`,
    n: bk.n,
    predicted: bk.n > 0 ? bk.sum_p / bk.n : 0,
    actual: bk.n > 0 ? bk.sum_y / bk.n : 0,
  }));
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('Phase 2: Train Per-Slot Win-Probability Models');
  console.log('='.repeat(70));
  console.log();

  // ── Load data ──
  console.log('Loading win_features.jsonl...');
  const rows: FeatureRow[] = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(INPUT_FILE, 'utf-8'),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    rows.push({
      slot: r.slot,
      cutoff: r.features_source_cutoff,
      x: FEATURE_NAMES.map(f => (r.features as Record<string, number>)[f] ?? 0),
      y: r.outcome as number,
    });
  }
  console.log(`  Total records: ${rows.length}`);

  // ── Per-slot training ──
  const models: Array<Record<string, unknown>> = [];

  for (const slot of SLOTS) {
    console.log();
    console.log('─'.repeat(50));
    console.log(`  ${slot}`);
    console.log('─'.repeat(50));

    // Filter & sort chronologically
    const slotRows = rows
      .filter(r => r.slot === slot)
      .sort((a, b) => a.cutoff.localeCompare(b.cutoff));

    const n = slotRows.length;
    const trainN = Math.floor(n * 2 / 3);
    const trainRows = slotRows.slice(0, trainN);
    const valRows = slotRows.slice(trainN);

    console.log(`  Samples: ${n}  Train: ${trainRows.length}  Val: ${valRows.length}`);
    console.log(`  Train period: ${trainRows[0]?.cutoff.slice(0, 10)} → ${trainRows[trainN - 1]?.cutoff.slice(0, 10)}`);
    console.log(`  Val   period: ${valRows[0]?.cutoff.slice(0, 10)} → ${valRows[valRows.length - 1]?.cutoff.slice(0, 10)}`);

    // Feature matrices
    const trainX = trainRows.map(r => r.x);
    const trainY = trainRows.map(r => r.y);
    const valX = valRows.map(r => r.x);
    const valY = valRows.map(r => r.y);

    // Z-score (train stats only)
    const normStats = computeNormStats(trainX);
    const trainXN = applyNorm(trainX, normStats);
    const valXN = applyNorm(valX, normStats);

    // Train
    const { weights, bias } = trainLogistic(trainXN, trainY);

    // Metrics
    const trainM = computeMetrics(trainXN, trainY, weights, bias);
    const valM = computeMetrics(valXN, valY, weights, bias);

    console.log(`  Train: acc=${(trainM.accuracy * 100).toFixed(1)}%  logLoss=${trainM.log_loss.toFixed(4)}  AUC=${trainM.auc.toFixed(4)}  brier=${trainM.brier_score.toFixed(4)}  winRate=${(trainM.win_rate * 100).toFixed(1)}%`);
    console.log(`  Val:   acc=${(valM.accuracy * 100).toFixed(1)}%  logLoss=${valM.log_loss.toFixed(4)}  AUC=${valM.auc.toFixed(4)}  brier=${valM.brier_score.toFixed(4)}  winRate=${(valM.win_rate * 100).toFixed(1)}%`);

    // Feature importance (absolute weight)
    const featureImportance = FEATURE_NAMES
      .map((f, i) => ({ feature: f, weight: weights[i] }))
      .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

    console.log('  Feature weights (by |w|):');
    for (const fi of featureImportance) {
      const bar = fi.weight > 0 ? '+' : '-';
      console.log(`    ${bar}${Math.abs(fi.weight).toFixed(4).padStart(7)}  ${fi.feature}`);
    }

    // Calibration
    const cal = calibrationTable(valXN, valY, weights, bias);
    console.log('  Calibration (val):');
    console.log('    Bin             N   Predicted  Actual');
    for (const c of cal) {
      console.log(`    ${c.bin.padEnd(14)} ${String(c.n).padStart(5)}   ${(c.predicted * 100).toFixed(1).padStart(6)}%  ${(c.actual * 100).toFixed(1).padStart(6)}%`);
    }

    // Build model entry
    const weightMap: Record<string, number> = {};
    for (let j = 0; j < FEATURE_NAMES.length; j++) {
      weightMap[FEATURE_NAMES[j]] = parseFloat(weights[j].toFixed(6));
    }

    const normMap: Record<string, { mean: number; std: number }> = {};
    for (let j = 0; j < FEATURE_NAMES.length; j++) {
      normMap[FEATURE_NAMES[j]] = {
        mean: parseFloat(normStats.mean[j].toFixed(6)),
        std: parseFloat(normStats.std[j].toFixed(6)),
      };
    }

    models.push({
      slot,
      features: [...FEATURE_NAMES],
      weights: weightMap,
      bias: parseFloat(bias.toFixed(6)),
      normalization: normMap,
      metrics: {
        train: {
          accuracy: parseFloat(trainM.accuracy.toFixed(4)),
          log_loss: parseFloat(trainM.log_loss.toFixed(4)),
          brier_score: parseFloat(trainM.brier_score.toFixed(4)),
          auc: parseFloat(trainM.auc.toFixed(4)),
          n: trainM.n,
          win_rate: parseFloat(trainM.win_rate.toFixed(4)),
        },
        val: {
          accuracy: parseFloat(valM.accuracy.toFixed(4)),
          log_loss: parseFloat(valM.log_loss.toFixed(4)),
          brier_score: parseFloat(valM.brier_score.toFixed(4)),
          auc: parseFloat(valM.auc.toFixed(4)),
          n: valM.n,
          win_rate: parseFloat(valM.win_rate.toFixed(4)),
        },
      },
    });
  }

  // ── Write output ──
  const output = {
    generated_at: new Date().toISOString(),
    feature_names: [...FEATURE_NAMES],
    training_config: {
      learning_rate_init: LR_INIT,
      l2_lambda: L2_LAMBDA,
      max_iterations: MAX_ITER,
      convergence_tol: TOL,
      split_method: 'chronological_2/3_train_1/3_val',
      normalization: 'z_score_from_train_set',
    },
    models,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log();
  console.log('='.repeat(70));
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log('='.repeat(70));
}

main().catch(console.error);
