/**
 * Bayesian Role Flexibility Model - Cross-Validation Pipeline
 *
 * This script implements a statistically grounded approach to role flexibility:
 *
 * Part A: Cross-validated prior strength estimation
 * - Splits data temporally (2024 train, 2025 validation)
 * - Tests α ∈ {1, 5, 10, 20, 50}
 * - Selects α with best validation performance
 *
 * Part B: Bayesian posterior computation
 * - posterior(role) = (α * prior(role) + count(role)) / (α + total)
 * - Automatically adapts to data volume
 * - Preserves uncertainty when data is sparse
 */

import fs from 'fs';
import path from 'path';
import { CHAMPION_POSITIONS } from '../lib/positions';

type Position = 'top' | 'jungle' | 'mid' | 'bot' | 'support';

const ALL_POSITIONS: Position[] = ['top', 'jungle', 'mid', 'bot', 'support'];

interface MatchRecord {
  seriesId: string;
  gameId: string;
  date: Date;
  playerId: string;
  playerName: string;
  championName: string;
  inferredPosition: Position;
}

interface ChampionRoleCounts {
  championName: string;
  roleCounts: Map<Position, number>;
  totalMatches: number;
}

interface ValidationMetrics {
  alpha: number;
  top1Accuracy: number;
  logLoss: number;
  totalPredictions: number;
}

// ============================================================
// STEP 1: Data Loading and Position Inference
// ============================================================

function loadMatchData(): MatchRecord[] {
  console.log('Loading match data...');
  const statesPath = path.join(process.cwd(), 'data/lol/states.json');
  const states = JSON.parse(fs.readFileSync(statesPath, 'utf-8'));

  const records: MatchRecord[] = [];

  // First pass: infer player positions
  const playerChampionUsage = new Map<string, Map<string, number>>();

  for (const seriesId in states) {
    const series = states[seriesId];
    if (!series.games || !series.startedAt) continue;

    for (const game of series.games) {
      if (!game.finished || !game.teams) continue;

      for (const team of game.teams) {
        if (!team.players) continue;

        for (const player of team.players) {
          const playerId = player.id;
          const championName = player.character?.name;
          if (!championName) continue;

          if (!playerChampionUsage.has(playerId)) {
            playerChampionUsage.set(playerId, new Map());
          }
          const usage = playerChampionUsage.get(playerId)!;
          usage.set(championName, (usage.get(championName) || 0) + 1);
        }
      }
    }
  }

  // Infer player positions based on champion usage
  const playerPositions = new Map<string, Position>();
  for (const [playerId, champions] of playerChampionUsage) {
    const positionScores = new Map<Position, number>();

    for (const [championName, count] of champions) {
      const positions = CHAMPION_POSITIONS[championName] || [];
      for (const pos of positions) {
        positionScores.set(pos as Position, (positionScores.get(pos as Position) || 0) + count);
      }
    }

    let maxScore = 0;
    let inferredPosition: Position = 'mid';
    for (const [pos, score] of positionScores) {
      if (score > maxScore) {
        maxScore = score;
        inferredPosition = pos;
      }
    }

    playerPositions.set(playerId, inferredPosition);
  }

  // Second pass: create match records with inferred positions
  for (const seriesId in states) {
    const series = states[seriesId];
    if (!series.games || !series.startedAt) continue;

    const date = new Date(series.startedAt);

    for (const game of series.games) {
      if (!game.finished || !game.teams) continue;

      for (const team of game.teams) {
        if (!team.players) continue;

        for (const player of team.players) {
          const playerId = player.id;
          const playerName = player.name;
          const championName = player.character?.name;
          const position = playerPositions.get(playerId);

          if (!championName || !position) continue;

          records.push({
            seriesId,
            gameId: game.id,
            date,
            playerId,
            playerName,
            championName,
            inferredPosition: position,
          });
        }
      }
    }
  }

  console.log(`Loaded ${records.length} match records`);
  return records;
}

// ============================================================
// STEP 2: Temporal Data Split
// ============================================================

function splitDataTemporally(records: MatchRecord[]): {
  train: MatchRecord[];
  validation: MatchRecord[];
} {
  const train = records.filter(r => r.date.getFullYear() === 2024);
  const validation = records.filter(r => r.date.getFullYear() === 2025);

  console.log(`\nData split:`);
  console.log(`  Train (2024): ${train.length} records`);
  console.log(`  Validation (2025): ${validation.length} records`);

  return { train, validation };
}

// ============================================================
// STEP 3: Prior Definition
// ============================================================

function getDefaultPrior(championName: string): Map<Position, number> {
  const positions = CHAMPION_POSITIONS[championName] || [];
  const prior = new Map<Position, number>();

  if (positions.length === 0) {
    // Unknown champion - uniform distribution
    ALL_POSITIONS.forEach(pos => prior.set(pos, 0.2));
    return prior;
  }

  // Distribute probability across known positions
  // Primary role gets higher weight
  const total = positions.length;
  positions.forEach((pos, index) => {
    if (index === 0) {
      prior.set(pos as Position, total === 1 ? 1.0 : 0.5 + (0.5 / total));
    } else {
      prior.set(pos as Position, (0.5 - (0.5 / total)) / (total - 1));
    }
  });

  // Set zero for positions not in the list
  ALL_POSITIONS.forEach(pos => {
    if (!prior.has(pos)) {
      prior.set(pos, 0);
    }
  });

  return prior;
}

// ============================================================
// STEP 4: Bayesian Posterior Computation
// ============================================================

function computePosterior(
  championName: string,
  roleCounts: Map<Position, number>,
  totalMatches: number,
  alpha: number
): Map<Position, number> {
  const prior = getDefaultPrior(championName);
  const posterior = new Map<Position, number>();

  let sum = 0;
  ALL_POSITIONS.forEach(pos => {
    const priorValue = prior.get(pos) || 0;
    const count = roleCounts.get(pos) || 0;
    const value = (alpha * priorValue + count) / (alpha + totalMatches);
    posterior.set(pos, value);
    sum += value;
  });

  // Normalize (should already be ~1.0, but ensure precision)
  if (sum > 0) {
    ALL_POSITIONS.forEach(pos => {
      posterior.set(pos, (posterior.get(pos) || 0) / sum);
    });
  }

  return posterior;
}

// ============================================================
// STEP 5: Aggregate Training Data
// ============================================================

function aggregateRoleCounts(records: MatchRecord[]): Map<string, ChampionRoleCounts> {
  const championStats = new Map<string, ChampionRoleCounts>();

  for (const record of records) {
    if (!championStats.has(record.championName)) {
      championStats.set(record.championName, {
        championName: record.championName,
        roleCounts: new Map(),
        totalMatches: 0,
      });
    }

    const stats = championStats.get(record.championName)!;
    stats.roleCounts.set(
      record.inferredPosition,
      (stats.roleCounts.get(record.inferredPosition) || 0) + 1
    );
    stats.totalMatches++;
  }

  return championStats;
}

// ============================================================
// STEP 6: Validation Evaluation
// ============================================================

function evaluateAlpha(
  alpha: number,
  trainStats: Map<string, ChampionRoleCounts>,
  validationRecords: MatchRecord[]
): ValidationMetrics {
  let correctTop1 = 0;
  let totalLogLoss = 0;
  let totalPredictions = 0;

  for (const record of validationRecords) {
    const stats = trainStats.get(record.championName);
    if (!stats) {
      // Champion not seen in training - use pure prior
      const prior = getDefaultPrior(record.championName);
      const predictedRole = Array.from(prior.entries())
        .sort((a, b) => b[1] - a[1])[0][0];

      if (predictedRole === record.inferredPosition) {
        correctTop1++;
      }

      const prob = prior.get(record.inferredPosition) || 0.001;
      totalLogLoss += -Math.log(Math.max(prob, 0.001));
      totalPredictions++;
      continue;
    }

    // Compute posterior
    const posterior = computePosterior(
      record.championName,
      stats.roleCounts,
      stats.totalMatches,
      alpha
    );

    // Top-1 accuracy
    const predictedRole = Array.from(posterior.entries())
      .sort((a, b) => b[1] - a[1])[0][0];

    if (predictedRole === record.inferredPosition) {
      correctTop1++;
    }

    // Log loss
    const prob = posterior.get(record.inferredPosition) || 0.001;
    totalLogLoss += -Math.log(Math.max(prob, 0.001));
    totalPredictions++;
  }

  return {
    alpha,
    top1Accuracy: correctTop1 / totalPredictions,
    logLoss: totalLogLoss / totalPredictions,
    totalPredictions,
  };
}

// ============================================================
// STEP 7: Cross-Validation Pipeline
// ============================================================

function runCrossValidation(): { bestAlpha: number; metrics: ValidationMetrics[] } {
  console.log('\n=== BAYESIAN CROSS-VALIDATION PIPELINE ===\n');

  // Load and split data
  const records = loadMatchData();
  const { train, validation } = splitDataTemporally(records);

  // Aggregate training data
  console.log('\nAggregating training data...');
  const trainStats = aggregateRoleCounts(train);
  console.log(`  ${trainStats.size} unique champions in training set`);

  // Test candidate α values
  const candidateAlphas = [1, 5, 10, 20, 50];
  console.log('\nEvaluating candidate α values...');

  const allMetrics: ValidationMetrics[] = [];

  for (const alpha of candidateAlphas) {
    console.log(`\n  Testing α = ${alpha}...`);
    const metrics = evaluateAlpha(alpha, trainStats, validation);
    allMetrics.push(metrics);

    console.log(`    Top-1 Accuracy: ${(metrics.top1Accuracy * 100).toFixed(2)}%`);
    console.log(`    Log Loss: ${metrics.logLoss.toFixed(4)}`);
  }

  // Select best α (prefer log loss, break ties with larger α)
  allMetrics.sort((a, b) => {
    const lossDiff = a.logLoss - b.logLoss;
    if (Math.abs(lossDiff) < 0.01) {
      // Similar performance - prefer larger α for stability
      return b.alpha - a.alpha;
    }
    return lossDiff;
  });

  const bestAlpha = allMetrics[0].alpha;

  console.log('\n=== RESULTS ===');
  console.log(`\nBest α: ${bestAlpha}`);
  console.log(`  Top-1 Accuracy: ${(allMetrics[0].top1Accuracy * 100).toFixed(2)}%`);
  console.log(`  Log Loss: ${allMetrics[0].logLoss.toFixed(4)}`);

  return { bestAlpha, metrics: allMetrics };
}

// ============================================================
// STEP 8: Generate Final Posteriors with Best α
// ============================================================

function generateFinalPosteriors(alpha: number): void {
  console.log(`\n=== GENERATING FINAL POSTERIORS (α = ${alpha}) ===\n`);

  // Load all data
  const records = loadMatchData();
  const allStats = aggregateRoleCounts(records);

  console.log(`Computing posteriors for ${allStats.size} champions...`);

  const output: Record<string, {
    posterior: Record<Position, number>;
    observedMatches: number;
    alpha: number;
  }> = {};

  for (const [championName, stats] of allStats) {
    const posterior = computePosterior(
      championName,
      stats.roleCounts,
      stats.totalMatches,
      alpha
    );

    output[championName] = {
      posterior: Object.fromEntries(posterior) as Record<Position, number>,
      observedMatches: stats.totalMatches,
      alpha,
    };
  }

  // Save to file
  const outputPath = path.join(process.cwd(), 'data/lol/bayesian-role-posteriors.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`✓ Saved to ${outputPath}`);
  console.log(`  ${Object.keys(output).length} champions with Bayesian posteriors`);
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const { bestAlpha, metrics } = runCrossValidation();

  // Save validation metrics
  const metricsPath = path.join(process.cwd(), 'data/lol/cross-validation-metrics.json');
  fs.writeFileSync(metricsPath, JSON.stringify({
    bestAlpha,
    candidateMetrics: metrics,
    timestamp: new Date().toISOString(),
  }, null, 2));

  console.log(`\n✓ Validation metrics saved to ${metricsPath}`);

  // Generate final posteriors
  generateFinalPosteriors(bestAlpha);

  console.log('\n=== PIPELINE COMPLETE ===\n');
}

main().catch(console.error);
