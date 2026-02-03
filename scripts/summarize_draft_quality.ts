#!/usr/bin/env tsx
/**
 * summarize_draft_quality.ts
 *
 * Reads draft_quality.jsonl and produces:
 *   1. draft_quality_summary.json  — structured summary
 *   2. draft_quality_summary.csv   — flat table for spreadsheets
 *   3. Console report              — key findings
 *
 * Usage:
 *   npx tsx scripts/summarize_draft_quality.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const DATA_DIR = path.join(process.cwd(), 'data', 'grid_v2');
const INPUT_FILE = path.join(DATA_DIR, 'draft_quality.jsonl');
const OUTPUT_JSON = path.join(DATA_DIR, 'draft_quality_summary.json');
const OUTPUT_CSV = path.join(DATA_DIR, 'draft_quality_summary.csv');

// ============================================================================
// Types
// ============================================================================

interface Row {
  gameId: string;
  patch: string;
  side: string;
  slot: string;
  teamId: string;
  actual_pick: string;
  actual_rank: number;
  actual_score: number;
  best_score: number;
  regret: number;
  percentile: number;
  num_candidates: number;
  outcome: number;
  actual_was_unknown?: boolean;
}

interface BucketStats {
  n: number;
  ranks: number[];
  regrets: number[];
  percentiles: number[];
  outcomes: number[];
  unknowns: number;
}

// ============================================================================
// Helpers
// ============================================================================

function newBucket(): BucketStats {
  return { n: 0, ranks: [], regrets: [], percentiles: [], outcomes: [], unknowns: 0 };
}

function addToBucket(b: BucketStats, r: Row) {
  b.n++;
  b.ranks.push(r.actual_rank);
  b.regrets.push(r.regret);
  b.percentiles.push(r.percentile);
  b.outcomes.push(r.outcome);
  if (r.actual_was_unknown) b.unknowns++;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function topKRate(ranks: number[], k: number): number {
  if (ranks.length === 0) return 0;
  return ranks.filter(r => r <= k).length / ranks.length;
}

/** Point-biserial correlation between continuous x and binary y */
function pointBiserial(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;
  const n1 = y.filter(v => v === 1).length;
  const n0 = n - n1;
  if (n0 === 0 || n1 === 0) return 0;

  let sum0 = 0, sum1 = 0;
  for (let i = 0; i < n; i++) {
    if (y[i] === 1) sum1 += x[i];
    else sum0 += x[i];
  }
  const m1 = sum1 / n1;
  const m0 = sum0 / n0;

  const xMean = mean(x);
  let ssTotal = 0;
  for (let i = 0; i < n; i++) ssTotal += (x[i] - xMean) ** 2;
  const sd = Math.sqrt(ssTotal / n);
  if (sd < 1e-15) return 0;

  return ((m1 - m0) / sd) * Math.sqrt((n1 * n0) / (n * n));
}

function summarizeBucket(b: BucketStats) {
  return {
    n: b.n,
    avg_rank: parseFloat(mean(b.ranks).toFixed(1)),
    median_rank: parseFloat(median(b.ranks).toFixed(1)),
    avg_percentile: parseFloat(mean(b.percentiles).toFixed(1)),
    avg_regret: parseFloat(mean(b.regrets).toFixed(4)),
    median_regret: parseFloat(median(b.regrets).toFixed(4)),
    top1_pct: parseFloat((topKRate(b.ranks, 1) * 100).toFixed(1)),
    top3_pct: parseFloat((topKRate(b.ranks, 3) * 100).toFixed(1)),
    top5_pct: parseFloat((topKRate(b.ranks, 5) * 100).toFixed(1)),
    top10_pct: parseFloat((topKRate(b.ranks, 10) * 100).toFixed(1)),
    win_rate: parseFloat((mean(b.outcomes) * 100).toFixed(1)),
    unknown_rate: parseFloat(((b.unknowns / b.n) * 100).toFixed(2)),
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  // Load all rows
  const rows: Row[] = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(INPUT_FILE, 'utf-8'),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line) as Row);
  }

  // ── Global stats ──
  const globalBucket = newBucket();
  rows.forEach(r => addToBucket(globalBucket, r));

  const gameIds = new Set(rows.map(r => r.gameId));

  // ── Per-slot ──
  const slotBuckets = new Map<string, BucketStats>();
  for (const r of rows) {
    if (!slotBuckets.has(r.slot)) slotBuckets.set(r.slot, newBucket());
    addToBucket(slotBuckets.get(r.slot)!, r);
  }

  // ── Per-patch ──
  const patchBuckets = new Map<string, BucketStats>();
  for (const r of rows) {
    const p = r.patch || 'unknown';
    if (!patchBuckets.has(p)) patchBuckets.set(p, newBucket());
    addToBucket(patchBuckets.get(p)!, r);
  }

  // ── Per-team (N>=200 only) ──
  const teamBuckets = new Map<string, BucketStats>();
  for (const r of rows) {
    if (!teamBuckets.has(r.teamId)) teamBuckets.set(r.teamId, newBucket());
    addToBucket(teamBuckets.get(r.teamId)!, r);
  }

  // ── Quartile validity check per slot ──
  const quartileData: Record<string, Array<{ q: number; n: number; winRate: number }>> = {};
  for (const [slot, b] of slotBuckets) {
    // Sort by percentile, split into 4 quartiles
    const indexed = b.percentiles.map((p, i) => ({ p, outcome: b.outcomes[i] }));
    indexed.sort((a, b_) => b_.p - a.p); // Q1 = best percentile first
    const qSize = Math.ceil(indexed.length / 4);
    const qs: Array<{ q: number; n: number; winRate: number }> = [];
    for (let q = 0; q < 4; q++) {
      const slice = indexed.slice(q * qSize, (q + 1) * qSize);
      const wins = slice.reduce((s, r) => s + r.outcome, 0);
      qs.push({ q: q + 1, n: slice.length, winRate: parseFloat(((wins / slice.length) * 100).toFixed(1)) });
    }
    quartileData[slot] = qs;
  }

  // ── Point-biserial: regret vs outcome ──
  const pbGlobal = pointBiserial(
    rows.map(r => r.regret),
    rows.map(r => r.outcome),
  );
  const pbPerSlot: Record<string, number> = {};
  for (const [slot, b] of slotBuckets) {
    pbPerSlot[slot] = parseFloat(pointBiserial(b.regrets, b.outcomes).toFixed(4));
  }

  // ── Build JSON output ──
  const slotSummary: Record<string, ReturnType<typeof summarizeBucket>> = {};
  for (const slot of ['PICK_1', 'PICK_2', 'PICK_3', 'PICK_4', 'PICK_5']) {
    const b = slotBuckets.get(slot);
    if (b) slotSummary[slot] = summarizeBucket(b);
  }

  const patchSummary: Record<string, ReturnType<typeof summarizeBucket>> = {};
  const patchKeys = [...patchBuckets.keys()].sort();
  for (const p of patchKeys) {
    patchSummary[p] = summarizeBucket(patchBuckets.get(p)!);
  }

  const teamSummary: Record<string, ReturnType<typeof summarizeBucket>> = {};
  for (const [tid, b] of teamBuckets) {
    if (b.n >= 200) teamSummary[tid] = summarizeBucket(b);
  }

  const output = {
    generated_at: new Date().toISOString(),
    global: {
      records: rows.length,
      games: gameIds.size,
      unknown_count: globalBucket.unknowns,
      unknown_rate: parseFloat(((globalBucket.unknowns / rows.length) * 100).toFixed(2)),
      ...summarizeBucket(globalBucket),
    },
    by_slot: slotSummary,
    by_patch: patchSummary,
    by_team: teamSummary,
    validity: {
      quartile_win_rate: quartileData,
      point_biserial_regret_vs_outcome: {
        global: parseFloat(pbGlobal.toFixed(4)),
        by_slot: pbPerSlot,
      },
    },
  };

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2));

  // ── Build CSV ──
  const csvLines: string[] = [];
  // Slot breakdown
  csvLines.push('section,key,n,avg_rank,median_rank,avg_percentile,avg_regret,median_regret,top1%,top3%,top5%,top10%,win_rate,unknown_rate');
  csvLines.push(`global,all,${output.global.n},${output.global.avg_rank},${output.global.median_rank},${output.global.avg_percentile},${output.global.avg_regret},${output.global.median_regret},${output.global.top1_pct},${output.global.top3_pct},${output.global.top5_pct},${output.global.top10_pct},${output.global.win_rate},${output.global.unknown_rate}`);
  for (const slot of ['PICK_1', 'PICK_2', 'PICK_3', 'PICK_4', 'PICK_5']) {
    const s = slotSummary[slot];
    if (s) csvLines.push(`slot,${slot},${s.n},${s.avg_rank},${s.median_rank},${s.avg_percentile},${s.avg_regret},${s.median_regret},${s.top1_pct},${s.top3_pct},${s.top5_pct},${s.top10_pct},${s.win_rate},${s.unknown_rate}`);
  }
  for (const p of patchKeys) {
    const s = patchSummary[p];
    csvLines.push(`patch,${p},${s.n},${s.avg_rank},${s.median_rank},${s.avg_percentile},${s.avg_regret},${s.median_regret},${s.top1_pct},${s.top3_pct},${s.top5_pct},${s.top10_pct},${s.win_rate},${s.unknown_rate}`);
  }
  for (const [tid, s] of Object.entries(teamSummary)) {
    csvLines.push(`team,${tid},${s.n},${s.avg_rank},${s.median_rank},${s.avg_percentile},${s.avg_regret},${s.median_regret},${s.top1_pct},${s.top3_pct},${s.top5_pct},${s.top10_pct},${s.win_rate},${s.unknown_rate}`);
  }
  fs.writeFileSync(OUTPUT_CSV, csvLines.join('\n') + '\n');

  // ── Console report ──
  console.log('='.repeat(70));
  console.log('Draft Quality Summary Report');
  console.log('='.repeat(70));
  console.log();
  console.log(`Records: ${rows.length}  |  Games: ${gameIds.size}  |  Unknown champs: ${globalBucket.unknowns} (${((globalBucket.unknowns / rows.length) * 100).toFixed(1)}%)`);
  console.log();

  console.log('Per-Slot Breakdown:');
  console.log('Slot    |   N   | AvgRank | MedRank | AvgPctl | AvgRegret | Top3%  Top5%  Top10%');
  console.log('-'.repeat(85));
  for (const slot of ['PICK_1', 'PICK_2', 'PICK_3', 'PICK_4', 'PICK_5']) {
    const s = slotSummary[slot];
    if (!s) continue;
    console.log(
      `${slot.padEnd(7)} | ${String(s.n).padStart(5)} | ` +
      `${String(s.avg_rank).padStart(7)} | ${String(s.median_rank).padStart(7)} | ` +
      `${String(s.avg_percentile).padStart(6)}% | ` +
      `${s.avg_regret.toFixed(4).padStart(9)} | ` +
      `${String(s.top3_pct).padStart(5)}% ${String(s.top5_pct).padStart(5)}% ${String(s.top10_pct).padStart(5)}%`
    );
  }

  console.log();
  console.log('Validity: Quartile Win Rate (Q1=best draft rank → Q4=worst):');
  console.log('Slot    |   Q1     Q2     Q3     Q4   | pb_corr');
  console.log('-'.repeat(55));
  for (const slot of ['PICK_1', 'PICK_2', 'PICK_3', 'PICK_4', 'PICK_5']) {
    const qs = quartileData[slot];
    const pb = pbPerSlot[slot];
    if (!qs) continue;
    const qStr = qs.map(q => `${String(q.winRate).padStart(5)}%`).join('  ');
    console.log(`${slot.padEnd(7)} | ${qStr} |  ${pb >= 0 ? '+' : ''}${pb.toFixed(4)}`);
  }
  console.log(`Global point-biserial(regret, outcome) = ${pbGlobal.toFixed(4)}`);

  // Top 5 teams by avg_percentile (N>=200)
  const topTeams = Object.entries(teamSummary)
    .sort((a, b) => b[1].avg_percentile - a[1].avg_percentile)
    .slice(0, 5);
  const worstTeams = Object.entries(teamSummary)
    .sort((a, b) => a[1].avg_percentile - b[1].avg_percentile)
    .slice(0, 5);

  console.log();
  console.log('Top 5 Teams by Draft Quality (avg_percentile, N>=200):');
  for (const [tid, s] of topTeams) {
    console.log(`  ${tid.padEnd(8)} | pctl=${s.avg_percentile}%  regret=${s.avg_regret.toFixed(4)}  top3=${s.top3_pct}%  N=${s.n}`);
  }
  console.log('Bottom 5 Teams:');
  for (const [tid, s] of worstTeams) {
    console.log(`  ${tid.padEnd(8)} | pctl=${s.avg_percentile}%  regret=${s.avg_regret.toFixed(4)}  top3=${s.top3_pct}%  N=${s.n}`);
  }

  // Patch trend (latest 5)
  const recentPatches = patchKeys.slice(-5);
  console.log();
  console.log('Recent Patches:');
  for (const p of recentPatches) {
    const s = patchSummary[p];
    console.log(`  ${p.padEnd(6)} | N=${String(s.n).padStart(5)}  pctl=${String(s.avg_percentile).padStart(5)}%  regret=${s.avg_regret.toFixed(4)}  top3=${s.top3_pct}%`);
  }

  console.log();
  console.log(`Output: ${OUTPUT_JSON}`);
  console.log(`Output: ${OUTPUT_CSV}`);
}

main().catch(console.error);
