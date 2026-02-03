/**
 * M3 Threat Signals Validation
 *
 * Validates the ban pressure / threat signal system through:
 * 1. Monotonicity check (Spearman correlation)
 * 2. Low-exposure robustness
 * 3. Conservatism analysis (obs vs obsLower gap)
 * 4. Permutation test
 *
 * Usage: npx tsx app/scripts/validate-m3-threat-signals.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ============ Types ============

interface ValidationResult {
  meta: {
    runDate: string;
    description: string;
    dataSource: string;
  };
  monotonicity: {
    spearmanCorr: number;
    pValue: string;
    sampleSize: number;
    interpretation: string;
  };
  lowExposureRobustness: {
    buckets: Array<{
      expRange: string;
      count: number;
      highScoreCount: number;
      highScoreRate: number;
    }>;
    coldChampionDominance: boolean;
    interpretation: string;
  };
  conservatism: {
    buckets: Array<{
      nRange: string;
      count: number;
      meanObsLowerGap: number;
      maxObsLowerGap: number;
    }>;
    overallMeanGap: number;
    interpretation: string;
  };
  permutationTest: {
    iterations: number;
    realTopKMean: number;
    permutedTopKMean: number;
    permutedTopKStd: number;
    zScore: number;
    interpretation: string;
  };
}

interface ThreatSignal {
  championId: string;
  championName: string;
  entityType: string;
  entityId: string;
  entityName: string;
  score: number;
  rawLift: number;
  obs: number;
  obsLower: number;
  exp: number;
  n: number;
}

// ============ Statistical Functions ============

function spearmanCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) return 0;

  const n = x.length;

  // Rank the values
  const rankX = getRanks(x);
  const rankY = getRanks(y);

  // Compute Spearman correlation
  let sumD2 = 0;
  for (let i = 0; i < n; i++) {
    const d = rankX[i] - rankY[i];
    sumD2 += d * d;
  }

  return 1 - (6 * sumD2) / (n * (n * n - 1));
}

function getRanks(arr: number[]): number[] {
  const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array(arr.length);

  for (let i = 0; i < sorted.length; i++) {
    ranks[sorted[i].i] = i + 1;
  }

  return ranks;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  const variance = arr.reduce((acc, v) => acc + Math.pow(v - m, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ============ Validation Functions ============

function monotonicityTest(signals: ThreatSignal[]): any {
  // Filter to positive scores only
  const positive = signals.filter(s => s.score > 0 && s.rawLift !== undefined);

  if (positive.length < 10) {
    return {
      spearmanCorr: 0,
      pValue: 'N/A (insufficient data)',
      sampleSize: positive.length,
      interpretation: 'Insufficient positive signals for analysis',
    };
  }

  const rawLifts = positive.map(s => s.rawLift);
  const scores = positive.map(s => s.score);

  const corr = spearmanCorrelation(rawLifts, scores);

  // Approximate p-value using t-distribution approximation
  const n = positive.length;
  const t = corr * Math.sqrt((n - 2) / (1 - corr * corr));
  const pValue = Math.abs(t) > 3 ? '< 0.001' : Math.abs(t) > 2 ? '< 0.05' : '> 0.05';

  return {
    spearmanCorr: corr,
    pValue,
    sampleSize: positive.length,
    interpretation: corr > 0.7
      ? 'Strong positive monotonicity: higher raw lift → higher score'
      : corr > 0.4
        ? 'Moderate positive monotonicity'
        : 'Weak or no monotonicity detected',
  };
}

function lowExposureRobustnessTest(signals: ThreatSignal[]): any {
  const positive = signals.filter(s => s.score > 0);

  // Define exposure buckets
  const buckets = [
    { min: 0, max: 0.01, label: '0-1%' },
    { min: 0.01, max: 0.05, label: '1-5%' },
    { min: 0.05, max: 0.10, label: '5-10%' },
    { min: 0.10, max: 0.20, label: '10-20%' },
    { min: 0.20, max: 1.0, label: '20%+' },
  ];

  // High score threshold (top 15%)
  const sortedScores = positive.map(s => s.score).sort((a, b) => b - a);
  const highScoreThreshold = sortedScores[Math.floor(sortedScores.length * 0.15)] || 50;

  const results = buckets.map(bucket => {
    const inBucket = positive.filter(s => s.exp >= bucket.min && s.exp < bucket.max);
    const highScore = inBucket.filter(s => s.score >= highScoreThreshold);

    return {
      expRange: bucket.label,
      count: inBucket.length,
      highScoreCount: highScore.length,
      highScoreRate: inBucket.length > 0 ? highScore.length / inBucket.length : 0,
    };
  });

  // Check if cold champions (low exp) dominate high scores
  const coldBucket = results[0]; // 0-1%
  const warmBuckets = results.slice(2); // 5%+
  const coldDominates = coldBucket.highScoreRate > mean(warmBuckets.map(b => b.highScoreRate)) * 1.5;

  return {
    buckets: results,
    coldChampionDominance: coldDominates,
    interpretation: coldDominates
      ? 'WARNING: Cold champions may be over-represented in high scores'
      : 'Low-exposure champions do not dominate high scores',
  };
}

function conservatismTest(signals: ThreatSignal[]): any {
  const positive = signals.filter(s => s.score > 0 && s.obs !== undefined && s.obsLower !== undefined);

  // Define sample size buckets
  const buckets = [
    { min: 1, max: 10, label: '1-10' },
    { min: 10, max: 50, label: '10-50' },
    { min: 50, max: 100, label: '50-100' },
    { min: 100, max: 500, label: '100-500' },
    { min: 500, max: Infinity, label: '500+' },
  ];

  const results = buckets.map(bucket => {
    const inBucket = positive.filter(s => s.n >= bucket.min && s.n < bucket.max);
    const gaps = inBucket.map(s => s.obs - s.obsLower);

    return {
      nRange: bucket.label,
      count: inBucket.length,
      meanObsLowerGap: gaps.length > 0 ? mean(gaps) : 0,
      maxObsLowerGap: gaps.length > 0 ? Math.max(...gaps) : 0,
    };
  });

  const allGaps = positive.map(s => s.obs - s.obsLower);
  const overallMeanGap = mean(allGaps);

  return {
    buckets: results,
    overallMeanGap,
    interpretation: overallMeanGap > 0
      ? `Conservatism active: obsLower is on average ${(overallMeanGap * 100).toFixed(1)}% below obs`
      : 'No conservatism gap detected',
  };
}

function permutationTest(signals: ThreatSignal[], iterations: number = 100): any {
  const positive = signals.filter(s => s.score > 0);

  if (positive.length < 20) {
    return {
      iterations,
      realTopKMean: 0,
      permutedTopKMean: 0,
      permutedTopKStd: 0,
      zScore: 0,
      interpretation: 'Insufficient data for permutation test',
    };
  }

  // Real top-K mean score
  const K = Math.min(20, Math.floor(positive.length * 0.1));
  const sortedReal = positive.sort((a, b) => b.score - a.score);
  const realTopKMean = mean(sortedReal.slice(0, K).map(s => s.score));

  // Permutation: shuffle entity assignments and recompute
  const permutedMeans: number[] = [];

  for (let i = 0; i < iterations; i++) {
    // Shuffle scores among signals (simulates random entity assignment)
    const shuffledScores = shuffle(positive.map(s => s.score));
    const sortedShuffled = shuffledScores.sort((a, b) => b - a);
    permutedMeans.push(mean(sortedShuffled.slice(0, K)));
  }

  const permutedMean = mean(permutedMeans);
  const permutedStd = std(permutedMeans);
  const zScore = permutedStd > 0 ? (realTopKMean - permutedMean) / permutedStd : 0;

  return {
    iterations,
    realTopKMean,
    permutedTopKMean: permutedMean,
    permutedTopKStd: permutedStd,
    zScore,
    interpretation: zScore > 2
      ? 'Real top-K scores significantly higher than permuted (p < 0.05)'
      : zScore > 1.5
        ? 'Real top-K scores moderately higher than permuted'
        : 'No significant difference from random',
  };
}

// ============ Main Function ============

async function runValidation(): Promise<ValidationResult> {
  const dataDir = path.join(process.cwd(), 'data/lol');

  console.log('='.repeat(70));
  console.log('M3 THREAT SIGNALS VALIDATION');
  console.log('='.repeat(70));
  console.log(`Run Date: ${new Date().toISOString()}`);
  console.log('');

  // Load threat signals
  console.log('Loading threat-signals.json...');
  const data = JSON.parse(fs.readFileSync(path.join(dataDir, 'threat-signals.json'), 'utf-8'));

  // Extract signals from nested structure
  const signals: ThreatSignal[] = [];

  // Process team signals
  if (data.team) {
    for (const [context, teams] of Object.entries(data.team)) {
      for (const [teamId, champions] of Object.entries(teams as any)) {
        for (const [champName, signal] of Object.entries(champions as any)) {
          signals.push({
            championId: (signal as any).championId || champName,
            championName: (signal as any).championName || champName,
            entityType: 'team',
            entityId: teamId,
            entityName: teamId,
            score: (signal as any).score || 0,
            rawLift: (signal as any).rawObs || 0,
            obs: (signal as any).observed || 0,
            obsLower: (signal as any).obsLower || 0,
            exp: (signal as any).expected || 0,
            n: (signal as any).gamesPlayed || 0,
          });
        }
      }
    }
  }

  // Process player signals
  if (data.player) {
    for (const [context, players] of Object.entries(data.player)) {
      for (const [playerId, champions] of Object.entries(players as any)) {
        for (const [champName, signal] of Object.entries(champions as any)) {
          signals.push({
            championId: (signal as any).championId || champName,
            championName: (signal as any).championName || champName,
            entityType: 'player',
            entityId: playerId,
            entityName: playerId,
            score: (signal as any).score || 0,
            rawLift: (signal as any).rawObs || 0,
            obs: (signal as any).observed || 0,
            obsLower: (signal as any).obsLower || 0,
            exp: (signal as any).expected || 0,
            n: (signal as any).gamesPlayed || 0,
          });
        }
      }
    }
  }

  console.log(`Loaded ${signals.length} threat signals`);

  const positiveCount = signals.filter(s => s.score > 0).length;
  console.log(`Positive signals: ${positiveCount}`);
  console.log('');

  // Run tests
  console.log('Running monotonicity test...');
  const monotonicity = monotonicityTest(signals);
  console.log(`  Spearman correlation: ${monotonicity.spearmanCorr.toFixed(4)}`);
  console.log(`  Interpretation: ${monotonicity.interpretation}`);
  console.log('');

  console.log('Running low-exposure robustness test...');
  const lowExposure = lowExposureRobustnessTest(signals);
  console.log(`  Cold champion dominance: ${lowExposure.coldChampionDominance}`);
  console.log(`  Interpretation: ${lowExposure.interpretation}`);
  console.log('');

  console.log('Running conservatism test...');
  const conservatism = conservatismTest(signals);
  console.log(`  Overall mean gap: ${(conservatism.overallMeanGap * 100).toFixed(2)}%`);
  console.log(`  Interpretation: ${conservatism.interpretation}`);
  console.log('');

  console.log('Running permutation test (100 iterations)...');
  const permutation = permutationTest(signals, 100);
  console.log(`  Real top-K mean: ${permutation.realTopKMean.toFixed(2)}`);
  console.log(`  Permuted mean: ${permutation.permutedTopKMean.toFixed(2)}`);
  console.log(`  Z-score: ${permutation.zScore.toFixed(2)}`);
  console.log(`  Interpretation: ${permutation.interpretation}`);
  console.log('');

  const result: ValidationResult = {
    meta: {
      runDate: new Date().toISOString(),
      description: 'Threat signal validation with monotonicity, robustness, conservatism, and permutation tests',
      dataSource: 'threat-signals.json',
    },
    monotonicity,
    lowExposureRobustness: lowExposure,
    conservatism,
    permutationTest: permutation,
  };

  // Write outputs
  const outputDir = path.join(process.cwd(), 'app/docs/validation');
  fs.mkdirSync(outputDir, { recursive: true });

  const jsonPath = path.join(outputDir, 'm3-threat-signals.json');
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  console.log(`JSON written to: ${jsonPath}`);

  const mdPath = path.join(outputDir, 'm3-threat-signals.md');
  fs.writeFileSync(mdPath, generateMarkdown(result));
  console.log(`Markdown written to: ${mdPath}`);

  return result;
}

function generateMarkdown(result: ValidationResult): string {
  const lines: string[] = [];

  lines.push('# M3: Threat Signals Validation');
  lines.push('');
  lines.push('## What is Tested');
  lines.push('');
  lines.push('This validation assesses the ban pressure / threat signal system that identifies');
  lines.push('champions with elevated ban rates against specific teams or players. The system uses');
  lines.push('log-sigmoid scoring with Beta-Binomial conservatism.');
  lines.push('');
  lines.push('## Why It Matters');
  lines.push('');
  lines.push('Threat signals drive the primary evidence layer for ban recommendations. They must:');
  lines.push('- Show monotonic relationship between raw lift and score');
  lines.push('- Not be dominated by low-exposure (cold) champions');
  lines.push('- Apply appropriate conservatism for small samples');
  lines.push('- Produce scores significantly different from random');
  lines.push('');
  lines.push('## Method');
  lines.push('');
  lines.push('### Monotonicity Test');
  lines.push('');
  lines.push('Compute Spearman rank correlation between rawLift and score for positive signals.');
  lines.push('High correlation indicates the scoring function preserves the ordering of raw evidence.');
  lines.push('');
  lines.push('### Low-Exposure Robustness');
  lines.push('');
  lines.push('Bucket signals by expected ban rate (exp%) and check if low-exposure champions');
  lines.push('disproportionately appear in high scores.');
  lines.push('');
  lines.push('### Conservatism Analysis');
  lines.push('');
  lines.push('Measure the gap between observed rate (obs) and conservative lower bound (obsLower)');
  lines.push('across sample size buckets. Larger gaps for small samples indicate appropriate conservatism.');
  lines.push('');
  lines.push('### Permutation Test');
  lines.push('');
  lines.push('Shuffle entity assignments and compare real top-K mean score to permuted distribution.');
  lines.push('Significant difference indicates scores capture real signal, not noise.');
  lines.push('');
  lines.push('## Results');
  lines.push('');
  lines.push('### Monotonicity');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Spearman Correlation | ${result.monotonicity.spearmanCorr.toFixed(4)} |`);
  lines.push(`| P-Value | ${result.monotonicity.pValue} |`);
  lines.push(`| Sample Size | ${result.monotonicity.sampleSize} |`);
  lines.push('');
  lines.push(`**Interpretation:** ${result.monotonicity.interpretation}`);
  lines.push('');
  lines.push('### Low-Exposure Robustness');
  lines.push('');
  lines.push('| Exp Range | Count | High Score Count | High Score Rate |');
  lines.push('|-----------|-------|------------------|-----------------|');
  for (const b of result.lowExposureRobustness.buckets) {
    lines.push(`| ${b.expRange} | ${b.count} | ${b.highScoreCount} | ${(b.highScoreRate * 100).toFixed(1)}% |`);
  }
  lines.push('');
  lines.push(`**Cold Champion Dominance:** ${result.lowExposureRobustness.coldChampionDominance ? 'YES (warning)' : 'NO'}`);
  lines.push('');
  lines.push(`**Interpretation:** ${result.lowExposureRobustness.interpretation}`);
  lines.push('');
  lines.push('### Conservatism');
  lines.push('');
  lines.push('| Sample Size | Count | Mean Gap | Max Gap |');
  lines.push('|-------------|-------|----------|---------|');
  for (const b of result.conservatism.buckets) {
    lines.push(`| ${b.nRange} | ${b.count} | ${(b.meanObsLowerGap * 100).toFixed(2)}% | ${(b.maxObsLowerGap * 100).toFixed(2)}% |`);
  }
  lines.push('');
  lines.push(`**Overall Mean Gap:** ${(result.conservatism.overallMeanGap * 100).toFixed(2)}%`);
  lines.push('');
  lines.push(`**Interpretation:** ${result.conservatism.interpretation}`);
  lines.push('');
  lines.push('### Permutation Test');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Iterations | ${result.permutationTest.iterations} |`);
  lines.push(`| Real Top-K Mean | ${result.permutationTest.realTopKMean.toFixed(2)} |`);
  lines.push(`| Permuted Mean | ${result.permutationTest.permutedTopKMean.toFixed(2)} |`);
  lines.push(`| Permuted Std | ${result.permutationTest.permutedTopKStd.toFixed(2)} |`);
  lines.push(`| Z-Score | ${result.permutationTest.zScore.toFixed(2)} |`);
  lines.push('');
  lines.push(`**Interpretation:** ${result.permutationTest.interpretation}`);
  lines.push('');
  lines.push('## Limitations');
  lines.push('');
  lines.push('- Permutation test uses score shuffling, not full signal recomputation');
  lines.push('- Low-exposure analysis depends on threshold choices');
  lines.push('- Does not validate causal relationship between bans and outcomes');
  lines.push('');
  lines.push('---');
  lines.push(`*Generated: ${result.meta.runDate}*`);

  return lines.join('\n');
}

// Run
runValidation().catch(console.error);
