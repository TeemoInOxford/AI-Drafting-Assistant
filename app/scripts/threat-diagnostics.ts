/**
 * Threat Scoring Diagnostics
 *
 * Analyzes the threat-signals.json to identify potential issues with the scoring system:
 * - Score distribution
 * - 100-score saturation
 * - Low baseline exp analysis
 * - Per-team saturation sanity check
 * - Small-sample inflation check (NEW)
 * - Big gap examples (NEW)
 */

import * as fs from 'fs';
import * as path from 'path';

// Paths
const DATA_DIR = path.join(process.cwd(), 'data', 'lol');
const THREAT_SIGNALS_PATH = path.join(DATA_DIR, 'threat-signals.json');
const BAN_BASELINES_PATH = path.join(DATA_DIR, 'ban-baselines.json');
const OUTPUT_PATH = path.join(DATA_DIR, 'threat-diagnostics.json');

// Types
interface ThreatSignal {
  championId: string;
  championName: string;
  observed: number;
  obsLower?: number;
  expected: number;
  ratio: number;
  rawObs?: number;
  rawLower?: number;
  raw?: number;  // Legacy field
  confidence: number;
  score: number;
  gamesPlayed: number;
  banCount: number;
  context: string;
  credibleLevel?: number;
  priorStrengthM?: number;
  a0?: number;
  b0?: number;
}

interface ThreatSignalsMeta {
  teamN0: number;
  playerN0: number;
  generatedAt: string;
  smoothingFactor?: number;
  scoringVersion?: string;
  k?: number;
  raw_p90?: number;
  credibleLevel?: number;
  priorStrengthM?: number;
}

interface ThreatSignalsData {
  meta: ThreatSignalsMeta;
  team: Record<string, Record<string, Record<string, ThreatSignal>>>;
  player: Record<string, Record<string, Record<string, ThreatSignal>>>;
}

interface BanBaselines {
  global: Record<string, Record<string, { banRate: number; games: number }>>;
  early: Record<string, Record<string, { banRate: number; games: number }>>;
}

interface ScoreDistribution {
  bins: Record<string, { count: number; percentage: number }>;
  total: number;
}

interface ChampionCount {
  championName: string;
  count: number;
}

interface ExpBucket {
  range: string;
  entryCount: number;
  score100Percentage: number;
  medianScore: number;
  p90Score: number;
}

interface SampleSizeBucket {
  range: string;
  entryCount: number;
  medianScore: number;
  p90Score: number;
  medianObsGap: number;
}

// NEW: Enhanced bucket stats for Step 3.5
interface EnhancedBucketStats {
  range: string;
  entries: number;
  pctScoreGt0: number;
  medianScore: number;
  p90Score: number;
  medianRawLower: number;
  p90RawLower: number;
  medianObsGap: number;
}

// NEW Step 3.6: Positive-only distribution stats
interface PositiveOnlyStats {
  entries: number;
  medianScore: number;
  p50Score: number;
  p75Score: number;
  p90Score: number;
  p95Score: number;
  p99Score: number;
  medianRaw: number;
  p90Raw: number;
  medianRawLower: number;
  p90RawLower: number;
}

// NEW Step 3.6: Tier coverage stats
interface TierCoverageStats {
  totalPositive: number;
  pctGte30: number;
  pctGte50: number;
  pctGte70: number;
  cutoffTop1Pct: number;
  cutoffTop05Pct: number;
  cutoffTop02Pct: number;
}

// NEW: Sanity summary for Step 3.5
interface EntitySanitySummary {
  totalEntries: number;
  entriesWithXGt0: number;
  entriesWithRawObsGt0: number;
  entriesWithScoreGt0: number;
  entriesWithScoreGte50: number;
}

interface BigGapEntry {
  targetId: string;
  championName: string;
  x: number;
  n: number;
  obs: number;
  obsLower: number;
  gap: number;
  exp: number;
  rawObs: number;
  rawLower: number;
  score: number;
}

interface TeamSample {
  teamId: string;
  gamesPlayed: number;
  score100Count: number;
  totalChampions: number;
  top10: Array<{
    championName: string;
    score: number;
    observed: number;
    obsLower?: number;
    expected: number;
    ratio: number;
    rawObs?: number;
    rawLower?: number;
    gamesPlayed: number;
  }>;
}

interface DiagnosticsReport {
  generatedAt: string;
  scoringVersion: string;
  scoringParams: {
    k?: number;
    raw_p90?: number;
    smoothingFactor?: number;
    credibleLevel?: number;
    priorStrengthM?: number;
  };
  scoreDistribution: {
    team: ScoreDistribution;
    player: ScoreDistribution;
  };
  saturation100: {
    team: {
      percentage: number;
      count: number;
      total: number;
      top20Champions: ChampionCount[];
    };
    player: {
      percentage: number;
      count: number;
      total: number;
      top20Champions: ChampionCount[];
    };
  };
  lowExpAnalysis: {
    buckets: ExpBucket[];
  };
  perTeamSanityCheck: {
    samples: TeamSample[];
  };
  smallSampleAnalysis: {
    team: {
      all: EnhancedBucketStats[];
      candidate: EnhancedBucketStats[];
    };
    player: {
      all: EnhancedBucketStats[];
      candidate: EnhancedBucketStats[];
    };
  };
  bigGapExamples: BigGapEntry[];
}

// Helper: Calculate median
function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Helper: Calculate percentile
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

// Helper: Get score bin label
function getScoreBin(score: number): string {
  if (score === 0) return '0';
  if (score >= 99.9) return '100';
  if (score <= 10) return '(0-10]';
  if (score <= 20) return '(10-20]';
  if (score <= 30) return '(20-30]';
  if (score <= 40) return '(30-40]';
  if (score <= 50) return '(40-50]';
  if (score <= 60) return '(50-60]';
  if (score <= 70) return '(60-70]';
  if (score <= 80) return '(70-80]';
  if (score <= 90) return '(80-90]';
  return '(90-100)';
}

// Helper: Get exp bucket label
function getExpBucket(exp: number): string {
  const expPercent = exp * 100;
  if (expPercent < 0.5) return '<0.5%';
  if (expPercent < 1) return '0.5-1%';
  if (expPercent < 2) return '1-2%';
  if (expPercent < 5) return '2-5%';
  return '>=5%';
}

// Helper: Get sample size bucket label
function getSampleSizeBucket(n: number): string {
  if (n < 20) return '<20';
  if (n < 50) return '20-50';
  if (n < 100) return '50-100';
  if (n < 200) return '100-200';
  return '>=200';
}

// Calculate score distribution
function calculateScoreDistribution(signals: ThreatSignal[]): ScoreDistribution {
  const bins: Record<string, number> = {
    '0': 0,
    '(0-10]': 0,
    '(10-20]': 0,
    '(20-30]': 0,
    '(30-40]': 0,
    '(40-50]': 0,
    '(50-60]': 0,
    '(60-70]': 0,
    '(70-80]': 0,
    '(80-90]': 0,
    '(90-100)': 0,
    '100': 0,
  };

  for (const signal of signals) {
    const bin = getScoreBin(signal.score);
    bins[bin]++;
  }

  const total = signals.length;
  const result: Record<string, { count: number; percentage: number }> = {};
  for (const [bin, count] of Object.entries(bins)) {
    result[bin] = {
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    };
  }

  return { bins: result, total };
}

// Calculate 100-score saturation
function calculate100Saturation(signals: ThreatSignal[]): {
  percentage: number;
  count: number;
  total: number;
  top20Champions: ChampionCount[];
} {
  const score100 = signals.filter(s => s.score >= 99.9);
  const championCounts: Record<string, number> = {};

  for (const signal of score100) {
    championCounts[signal.championName] = (championCounts[signal.championName] || 0) + 1;
  }

  const top20Champions = Object.entries(championCounts)
    .map(([championName, count]) => ({ championName, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return {
    percentage: signals.length > 0 ? (score100.length / signals.length) * 100 : 0,
    count: score100.length,
    total: signals.length,
    top20Champions,
  };
}

// Low exp analysis
function analyzeLowExp(
  teamSignals: ThreatSignal[],
  baselines: BanBaselines
): ExpBucket[] {
  const buckets: Record<string, { scores: number[]; score100Count: number }> = {
    '<0.5%': { scores: [], score100Count: 0 },
    '0.5-1%': { scores: [], score100Count: 0 },
    '1-2%': { scores: [], score100Count: 0 },
    '2-5%': { scores: [], score100Count: 0 },
    '>=5%': { scores: [], score100Count: 0 },
  };

  for (const signal of teamSignals) {
    const exp = signal.expected;
    const bucket = getExpBucket(exp);

    buckets[bucket].scores.push(signal.score);
    if (signal.score >= 99.9) {
      buckets[bucket].score100Count++;
    }
  }

  const result: ExpBucket[] = [];
  for (const [range, data] of Object.entries(buckets)) {
    result.push({
      range,
      entryCount: data.scores.length,
      score100Percentage: data.scores.length > 0 ? (data.score100Count / data.scores.length) * 100 : 0,
      medianScore: median(data.scores),
      p90Score: percentile(data.scores, 90),
    });
  }

  const order = ['<0.5%', '0.5-1%', '1-2%', '2-5%', '>=5%'];
  result.sort((a, b) => order.indexOf(a.range) - order.indexOf(b.range));

  return result;
}

// Small sample analysis (NEW)
function analyzeSmallSamples(signals: ThreatSignal[]): SampleSizeBucket[] {
  const buckets: Record<string, { scores: number[]; obsGaps: number[] }> = {
    '<20': { scores: [], obsGaps: [] },
    '20-50': { scores: [], obsGaps: [] },
    '50-100': { scores: [], obsGaps: [] },
    '100-200': { scores: [], obsGaps: [] },
    '>=200': { scores: [], obsGaps: [] },
  };

  for (const signal of signals) {
    const bucket = getSampleSizeBucket(signal.gamesPlayed);
    buckets[bucket].scores.push(signal.score);

    // Calculate obs - obsLower gap
    if (signal.obsLower !== undefined) {
      const gap = signal.observed - signal.obsLower;
      buckets[bucket].obsGaps.push(gap);
    }
  }

  const result: SampleSizeBucket[] = [];
  for (const [range, data] of Object.entries(buckets)) {
    result.push({
      range,
      entryCount: data.scores.length,
      medianScore: median(data.scores),
      p90Score: percentile(data.scores, 90),
      medianObsGap: median(data.obsGaps),
    });
  }

  const order = ['<20', '20-50', '50-100', '100-200', '>=200'];
  result.sort((a, b) => order.indexOf(a.range) - order.indexOf(b.range));

  return result;
}

// NEW Step 3.5: Compute sanity summary for an entity type
function computeSanitySummary(signals: ThreatSignal[]): EntitySanitySummary {
  let entriesWithXGt0 = 0;
  let entriesWithRawObsGt0 = 0;
  let entriesWithScoreGt0 = 0;
  let entriesWithScoreGte50 = 0;

  for (const s of signals) {
    if (s.banCount > 0) entriesWithXGt0++;
    if ((s.rawObs ?? 0) > 0) entriesWithRawObsGt0++;
    if (s.score > 0) entriesWithScoreGt0++;
    if (s.score >= 50) entriesWithScoreGte50++;
  }

  return {
    totalEntries: signals.length,
    entriesWithXGt0,
    entriesWithRawObsGt0,
    entriesWithScoreGt0,
    entriesWithScoreGte50,
  };
}

// NEW Step 3.5: Enhanced bucket analysis with ALL and CANDIDATE modes
function analyzeEnhancedBuckets(
  signals: ThreatSignal[],
  mode: 'ALL' | 'CANDIDATE'
): EnhancedBucketStats[] {
  // Filter signals based on mode
  const filtered = mode === 'CANDIDATE'
    ? signals.filter(s => s.banCount > 0)
    : signals;

  const buckets: Record<string, {
    scores: number[];
    rawLowers: number[];
    obsGaps: number[];
  }> = {
    '<20': { scores: [], rawLowers: [], obsGaps: [] },
    '20-50': { scores: [], rawLowers: [], obsGaps: [] },
    '50-100': { scores: [], rawLowers: [], obsGaps: [] },
    '100-200': { scores: [], rawLowers: [], obsGaps: [] },
    '>=200': { scores: [], rawLowers: [], obsGaps: [] },
  };

  for (const signal of filtered) {
    const bucket = getSampleSizeBucket(signal.gamesPlayed);
    buckets[bucket].scores.push(signal.score);
    buckets[bucket].rawLowers.push(signal.rawLower ?? 0);
    if (signal.obsLower !== undefined) {
      buckets[bucket].obsGaps.push(signal.observed - signal.obsLower);
    }
  }

  const result: EnhancedBucketStats[] = [];
  const order = ['<20', '20-50', '50-100', '100-200', '>=200'];

  for (const range of order) {
    const data = buckets[range];
    const scoreGt0Count = data.scores.filter(s => s > 0).length;

    result.push({
      range,
      entries: data.scores.length,
      pctScoreGt0: data.scores.length > 0 ? (scoreGt0Count / data.scores.length) * 100 : 0,
      medianScore: median(data.scores),
      p90Score: percentile(data.scores, 90),
      medianRawLower: median(data.rawLowers),
      p90RawLower: percentile(data.rawLowers, 90),
      medianObsGap: median(data.obsGaps),
    });
  }

  return result;
}

// NEW Step 3.5: Print enhanced section E for one entity type
function printEnhancedSectionE(
  entityType: 'Team' | 'Player',
  signals: ThreatSignal[]
): void {
  console.log(`\n>>> ${entityType.toUpperCase()} ANALYSIS <<<`);

  // Sanity summary
  const summary = computeSanitySummary(signals);
  console.log(`\n  Sanity Summary:`);
  console.log(`    Total entries:        ${summary.totalEntries}`);
  console.log(`    Entries with x>0:     ${summary.entriesWithXGt0} (${(summary.entriesWithXGt0 / summary.totalEntries * 100).toFixed(2)}%)`);
  console.log(`    Entries with rawObs>0:${summary.entriesWithRawObsGt0.toString().padStart(6)} (${(summary.entriesWithRawObsGt0 / summary.totalEntries * 100).toFixed(2)}%)`);
  console.log(`    Entries with score>0: ${summary.entriesWithScoreGt0} (${(summary.entriesWithScoreGt0 / summary.totalEntries * 100).toFixed(2)}%)`);
  console.log(`    Entries with score>=50:${summary.entriesWithScoreGte50.toString().padStart(5)} (${(summary.entriesWithScoreGte50 / summary.totalEntries * 100).toFixed(2)}%)`);

  // Mode ALL
  console.log(`\n  Mode ALL (all entries):`);
  console.log(`    Note: P90 score can be 0 when >=90% of entries are zero; use POSITIVE-ONLY for threat strength distribution.`);
  const allBuckets = analyzeEnhancedBuckets(signals, 'ALL');
  printEnhancedBucketTable(allBuckets);

  // Mode POSITIVE-ONLY (Step 3.6)
  console.log(`\n  Mode POSITIVE-ONLY (score>0 entries only):`);
  const positiveStats = computePositiveOnlyStats(signals);
  printPositiveOnlyStats(positiveStats);

  // Tier Coverage (Step 3.6)
  console.log(`\n  Tier Coverage:`);
  const tierCoverage = computeTierCoverage(signals);
  printTierCoverage(tierCoverage);
}

// Helper to print enhanced bucket table
function printEnhancedBucketTable(buckets: EnhancedBucketStats[]): void {
  console.log('    n Range  | Entries | %score>0 | Med Score | P90 Score | Med rawLower | P90 rawLower | Med(obs-obsL)');
  console.log('    ---------|---------|----------|-----------|-----------|--------------|--------------|-------------');
  for (const b of buckets) {
    console.log(
      `    ${b.range.padEnd(8)} | ${b.entries.toString().padStart(7)} | ${b.pctScoreGt0.toFixed(1).padStart(7)}% | ${b.medianScore.toFixed(1).padStart(9)} | ${b.p90Score.toFixed(1).padStart(9)} | ${b.medianRawLower.toFixed(3).padStart(12)} | ${b.p90RawLower.toFixed(3).padStart(12)} | ${(b.medianObsGap * 100).toFixed(2).padStart(10)}%`
    );
  }
}

// NEW Step 3.6: Compute positive-only distribution stats
function computePositiveOnlyStats(signals: ThreatSignal[]): PositiveOnlyStats {
  const positive = signals.filter(s => s.score > 0);
  const scores = positive.map(s => s.score);
  const raws = positive.map(s => s.rawObs ?? 0);
  const rawLowers = positive.map(s => s.rawLower ?? 0);

  return {
    entries: positive.length,
    medianScore: median(scores),
    p50Score: percentile(scores, 50),
    p75Score: percentile(scores, 75),
    p90Score: percentile(scores, 90),
    p95Score: percentile(scores, 95),
    p99Score: percentile(scores, 99),
    medianRaw: median(raws),
    p90Raw: percentile(raws, 90),
    medianRawLower: median(rawLowers),
    p90RawLower: percentile(rawLowers, 90),
  };
}

// NEW Step 3.6: Compute tier coverage stats
function computeTierCoverage(signals: ThreatSignal[]): TierCoverageStats {
  const positive = signals.filter(s => s.score > 0);
  const n = positive.length;

  if (n === 0) {
    return {
      totalPositive: 0,
      pctGte30: 0,
      pctGte50: 0,
      pctGte70: 0,
      cutoffTop1Pct: 0,
      cutoffTop05Pct: 0,
      cutoffTop02Pct: 0,
    };
  }

  const gte30 = positive.filter(s => s.score >= 30).length;
  const gte50 = positive.filter(s => s.score >= 50).length;
  const gte70 = positive.filter(s => s.score >= 70).length;

  // Sort descending to find top X% cutoffs
  const sortedDesc = positive.map(s => s.score).sort((a, b) => b - a);

  // Top 1% means the score at index floor(n * 0.01)
  const cutoffTop1Pct = sortedDesc[Math.max(0, Math.floor(n * 0.01) - 1)] || sortedDesc[0];
  const cutoffTop05Pct = sortedDesc[Math.max(0, Math.floor(n * 0.005) - 1)] || sortedDesc[0];
  const cutoffTop02Pct = sortedDesc[Math.max(0, Math.floor(n * 0.002) - 1)] || sortedDesc[0];

  return {
    totalPositive: n,
    pctGte30: (gte30 / n) * 100,
    pctGte50: (gte50 / n) * 100,
    pctGte70: (gte70 / n) * 100,
    cutoffTop1Pct,
    cutoffTop05Pct,
    cutoffTop02Pct,
  };
}

// NEW Step 3.6: Print positive-only stats
function printPositiveOnlyStats(stats: PositiveOnlyStats): void {
  console.log(`    Entries (score>0): ${stats.entries}`);
  console.log(`    Score distribution:`);
  console.log(`      P50 (median): ${stats.p50Score.toFixed(1)}`);
  console.log(`      P75:          ${stats.p75Score.toFixed(1)}`);
  console.log(`      P90:          ${stats.p90Score.toFixed(1)}`);
  console.log(`      P95:          ${stats.p95Score.toFixed(1)}`);
  console.log(`      P99:          ${stats.p99Score.toFixed(1)}`);
  console.log(`    RawLower distribution:`);
  console.log(`      Median: ${stats.medianRawLower.toFixed(3)}`);
  console.log(`      P90:    ${stats.p90RawLower.toFixed(3)}`);
}

// NEW Step 3.6: Print tier coverage
function printTierCoverage(coverage: TierCoverageStats): void {
  console.log(`    Among ${coverage.totalPositive} positive entries:`);
  console.log(`      score >= 30: ${coverage.pctGte30.toFixed(1)}%`);
  console.log(`      score >= 50: ${coverage.pctGte50.toFixed(1)}%`);
  console.log(`      score >= 70: ${coverage.pctGte70.toFixed(1)}%`);
  console.log(`    Top X% cutoffs (among score>0):`);
  console.log(`      Top 1%:   score >= ${coverage.cutoffTop1Pct.toFixed(1)}`);
  console.log(`      Top 0.5%: score >= ${coverage.cutoffTop05Pct.toFixed(1)}`);
  console.log(`      Top 0.2%: score >= ${coverage.cutoffTop02Pct.toFixed(1)}`);
}

// Big gap examples (NEW)
function findBigGapExamples(
  teamData: Record<string, Record<string, Record<string, ThreatSignal>>>
): BigGapEntry[] {
  const entries: BigGapEntry[] = [];

  const globalContext = teamData['GLOBAL::GLOBAL'] || {};

  for (const [targetId, champions] of Object.entries(globalContext)) {
    for (const signal of Object.values(champions)) {
      if (signal.observed > 0 && signal.obsLower !== undefined) {
        const gap = signal.observed - signal.obsLower;
        entries.push({
          targetId,
          championName: signal.championName,
          x: signal.banCount,
          n: signal.gamesPlayed,
          obs: signal.observed,
          obsLower: signal.obsLower,
          gap,
          exp: signal.expected,
          rawObs: signal.rawObs || 0,
          rawLower: signal.rawLower || 0,
          score: signal.score,
        });
      }
    }
  }

  // Sort by gap descending and take top 20
  entries.sort((a, b) => b.gap - a.gap);
  return entries.slice(0, 20);
}

// Per-team sanity check
function perTeamSanityCheck(
  teamData: Record<string, Record<string, Record<string, ThreatSignal>>>
): TeamSample[] {
  const globalContext = teamData['GLOBAL::GLOBAL'] || {};

  const teamGames: Array<{ teamId: string; gamesPlayed: number; signals: ThreatSignal[] }> = [];

  for (const [teamId, champions] of Object.entries(globalContext)) {
    const signals = Object.values(champions);
    if (signals.length > 0) {
      teamGames.push({
        teamId,
        gamesPlayed: signals[0].gamesPlayed,
        signals,
      });
    }
  }

  teamGames.sort((a, b) => b.gamesPlayed - a.gamesPlayed);
  const top10Teams = teamGames.slice(0, 10);

  const samples: TeamSample[] = [];
  for (const team of top10Teams) {
    const score100Signals = team.signals.filter(s => s.score >= 99.9);
    const sortedSignals = [...team.signals].sort((a, b) => b.score - a.score);

    samples.push({
      teamId: team.teamId,
      gamesPlayed: team.gamesPlayed,
      score100Count: score100Signals.length,
      totalChampions: team.signals.length,
      top10: sortedSignals.slice(0, 10).map(s => ({
        championName: s.championName,
        score: s.score,
        observed: s.observed,
        obsLower: s.obsLower,
        expected: s.expected,
        ratio: s.ratio,
        rawObs: s.rawObs,
        rawLower: s.rawLower,
        gamesPlayed: s.gamesPlayed,
      })),
    });
  }

  return samples;
}

// Flatten signals from nested structure
function flattenSignals(
  data: Record<string, Record<string, Record<string, ThreatSignal>>>
): ThreatSignal[] {
  const signals: ThreatSignal[] = [];
  for (const context of Object.values(data)) {
    for (const entity of Object.values(context)) {
      for (const signal of Object.values(entity)) {
        signals.push(signal);
      }
    }
  }
  return signals;
}

// Main
async function main() {
  console.log('='.repeat(60));
  console.log('THREAT SCORING DIAGNOSTICS');
  console.log('='.repeat(60));
  console.log();

  // Load data
  console.log('Loading data...');
  const threatSignals: ThreatSignalsData = JSON.parse(
    fs.readFileSync(THREAT_SIGNALS_PATH, 'utf-8')
  );
  const banBaselines: BanBaselines = JSON.parse(
    fs.readFileSync(BAN_BASELINES_PATH, 'utf-8')
  );

  // Print scoring version info
  const scoringVersion = threatSignals.meta.scoringVersion || 'legacy';
  console.log(`\nScoring Version: ${scoringVersion}`);
  if (threatSignals.meta.k !== undefined) {
    console.log(`  k (sigmoid steepness): ${threatSignals.meta.k.toFixed(4)}`);
  }
  if (threatSignals.meta.raw_p90 !== undefined) {
    console.log(`  raw_p90: ${threatSignals.meta.raw_p90.toFixed(4)}`);
  }
  if (threatSignals.meta.smoothingFactor !== undefined) {
    console.log(`  smoothingFactor (s): ${threatSignals.meta.smoothingFactor}`);
  }
  if (threatSignals.meta.credibleLevel !== undefined) {
    console.log(`  credibleLevel: ${threatSignals.meta.credibleLevel}`);
  }
  if (threatSignals.meta.priorStrengthM !== undefined) {
    console.log(`  priorStrengthM: ${threatSignals.meta.priorStrengthM}`);
  }

  // Flatten signals
  const teamSignals = flattenSignals(threatSignals.team);
  const playerSignals = flattenSignals(threatSignals.player);

  console.log(`\nLoaded ${teamSignals.length} team signals, ${playerSignals.length} player signals`);
  console.log();

  // A) Score Distribution
  console.log('-'.repeat(60));
  console.log('A) SCORE DISTRIBUTION');
  console.log('-'.repeat(60));

  const teamDistribution = calculateScoreDistribution(teamSignals);
  const playerDistribution = calculateScoreDistribution(playerSignals);

  console.log('\nTeam-level:');
  console.log('  Bin          | Count    | Percentage');
  console.log('  -------------|----------|----------');
  for (const [bin, data] of Object.entries(teamDistribution.bins)) {
    console.log(`  ${bin.padEnd(12)} | ${data.count.toString().padStart(8)} | ${data.percentage.toFixed(2).padStart(6)}%`);
  }
  console.log(`  Total: ${teamDistribution.total}`);

  console.log('\nPlayer-level:');
  console.log('  Bin          | Count    | Percentage');
  console.log('  -------------|----------|----------');
  for (const [bin, data] of Object.entries(playerDistribution.bins)) {
    console.log(`  ${bin.padEnd(12)} | ${data.count.toString().padStart(8)} | ${data.percentage.toFixed(2).padStart(6)}%`);
  }
  console.log(`  Total: ${playerDistribution.total}`);

  // B) 100-Score Saturation
  console.log();
  console.log('-'.repeat(60));
  console.log('B) 100-SCORE SATURATION');
  console.log('-'.repeat(60));

  const teamSaturation = calculate100Saturation(teamSignals);
  const playerSaturation = calculate100Saturation(playerSignals);

  console.log('\nTeam-level:');
  console.log(`  Score>=99.9: ${teamSaturation.count} / ${teamSaturation.total} (${teamSaturation.percentage.toFixed(2)}%)`);
  if (teamSaturation.top20Champions.length > 0) {
    console.log('\n  Top 20 Champions with score>=99.9:');
    console.log('  Rank | Champion         | Count');
    console.log('  -----|------------------|------');
    teamSaturation.top20Champions.forEach((c, i) => {
      console.log(`  ${(i + 1).toString().padStart(4)} | ${c.championName.padEnd(16)} | ${c.count}`);
    });
  }

  console.log('\nPlayer-level:');
  console.log(`  Score>=99.9: ${playerSaturation.count} / ${playerSaturation.total} (${playerSaturation.percentage.toFixed(2)}%)`);
  if (playerSaturation.top20Champions.length > 0) {
    console.log('\n  Top 20 Champions with score>=99.9:');
    console.log('  Rank | Champion         | Count');
    console.log('  -----|------------------|------');
    playerSaturation.top20Champions.forEach((c, i) => {
      console.log(`  ${(i + 1).toString().padStart(4)} | ${c.championName.padEnd(16)} | ${c.count}`);
    });
  }

  // C) Low Exp Analysis
  console.log();
  console.log('-'.repeat(60));
  console.log('C) LOW BASELINE EXP ANALYSIS (Team-level)');
  console.log('-'.repeat(60));

  const expBuckets = analyzeLowExp(teamSignals, banBaselines);

  console.log('\n  Exp Range | Entries  | Score>=99.9% | Median Score | P90 Score');
  console.log('  ----------|----------|--------------|--------------|----------');
  for (const bucket of expBuckets) {
    console.log(
      `  ${bucket.range.padEnd(9)} | ${bucket.entryCount.toString().padStart(8)} | ${bucket.score100Percentage.toFixed(2).padStart(11)}% | ${bucket.medianScore.toFixed(1).padStart(12)} | ${bucket.p90Score.toFixed(1).padStart(9)}`
    );
  }

  // D) Per-Team Sanity Check
  console.log();
  console.log('-'.repeat(60));
  console.log('D) PER-TEAM SATURATION SANITY CHECK');
  console.log('-'.repeat(60));
  console.log('(Top 10 teams by games played in GLOBAL::GLOBAL context)');

  const teamSamples = perTeamSanityCheck(threatSignals.team);

  for (const sample of teamSamples) {
    console.log(`\n  Team ${sample.teamId} (${sample.gamesPlayed} games):`);
    console.log(`    Score>=99.9 champions: ${sample.score100Count} / ${sample.totalChampions}`);
    console.log('    Top 10 champions:');
    const hasObsLower = sample.top10[0]?.obsLower !== undefined;
    if (hasObsLower) {
      console.log('      Champion         | Score  | Obs%   | ObsLower% | Exp%   | RawLower');
      console.log('      -----------------|--------|--------|-----------|--------|--------');
    } else {
      console.log('      Champion         | Score  | Obs%   | Exp%   | Ratio  | Raw');
      console.log('      -----------------|--------|--------|--------|--------|------');
    }
    for (const champ of sample.top10) {
      if (hasObsLower) {
        const rawLowerStr = champ.rawLower !== undefined ? champ.rawLower.toFixed(3) : 'N/A';
        console.log(
          `      ${champ.championName.padEnd(16)} | ${champ.score.toFixed(1).padStart(6)} | ${(champ.observed * 100).toFixed(2).padStart(5)}% | ${((champ.obsLower || 0) * 100).toFixed(2).padStart(8)}% | ${(champ.expected * 100).toFixed(2).padStart(5)}% | ${rawLowerStr.padStart(7)}`
        );
      } else {
        const rawStr = champ.rawObs !== undefined ? champ.rawObs.toFixed(3) : 'N/A';
        console.log(
          `      ${champ.championName.padEnd(16)} | ${champ.score.toFixed(1).padStart(6)} | ${(champ.observed * 100).toFixed(2).padStart(5)}% | ${(champ.expected * 100).toFixed(2).padStart(5)}% | ${champ.ratio.toFixed(2).padStart(6)} | ${rawStr.padStart(6)}`
        );
      }
    }
  }

  // E) Small-Sample Analysis (ENHANCED for Step 3.5)
  console.log();
  console.log('-'.repeat(60));
  console.log('E) SMALL-SAMPLE ANALYSIS (Enhanced Step 3.5)');
  console.log('-'.repeat(60));

  // Team analysis
  printEnhancedSectionE('Team', teamSignals);

  // Player analysis
  printEnhancedSectionE('Player', playerSignals);

  // F) Big Gap Examples (NEW)
  console.log();
  console.log('-'.repeat(60));
  console.log('F) BIG GAP EXAMPLES (obs - obsLower)');
  console.log('-'.repeat(60));
  console.log('(Top 20 entries by gap where obs > 0, from GLOBAL::GLOBAL)');

  const bigGapExamples = findBigGapExamples(threatSignals.team);

  console.log('\n  Target | Champion         | x/n      | Obs%   | ObsLower% | Gap%   | Score');
  console.log('  -------|------------------|----------|--------|-----------|--------|------');
  for (const entry of bigGapExamples) {
    console.log(
      `  ${entry.targetId.padEnd(6)} | ${entry.championName.padEnd(16)} | ${entry.x}/${entry.n.toString().padEnd(4)} | ${(entry.obs * 100).toFixed(1).padStart(5)}% | ${(entry.obsLower * 100).toFixed(1).padStart(8)}% | ${(entry.gap * 100).toFixed(1).padStart(5)}% | ${entry.score.toFixed(1).padStart(5)}`
    );
  }

  // Build report
  const report: DiagnosticsReport = {
    generatedAt: new Date().toISOString(),
    scoringVersion,
    scoringParams: {
      k: threatSignals.meta.k,
      raw_p90: threatSignals.meta.raw_p90,
      smoothingFactor: threatSignals.meta.smoothingFactor,
      credibleLevel: threatSignals.meta.credibleLevel,
      priorStrengthM: threatSignals.meta.priorStrengthM,
    },
    scoreDistribution: {
      team: teamDistribution,
      player: playerDistribution,
    },
    saturation100: {
      team: teamSaturation,
      player: playerSaturation,
    },
    lowExpAnalysis: {
      buckets: expBuckets,
    },
    perTeamSanityCheck: {
      samples: teamSamples,
    },
    smallSampleAnalysis: {
      team: {
        all: analyzeEnhancedBuckets(teamSignals, 'ALL'),
        candidate: analyzeEnhancedBuckets(teamSignals, 'CANDIDATE'),
      },
      player: {
        all: analyzeEnhancedBuckets(playerSignals, 'ALL'),
        candidate: analyzeEnhancedBuckets(playerSignals, 'CANDIDATE'),
      },
    },
    bigGapExamples,
  };

  // Write output
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));
  console.log();
  console.log('='.repeat(60));
  console.log(`Diagnostics report saved to: ${OUTPUT_PATH}`);
  console.log('='.repeat(60));
}

main().catch(console.error);
