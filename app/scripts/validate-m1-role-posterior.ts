/**
 * M1 Role Posterior Validation
 *
 * Validates the Bayesian role posterior model through:
 * 1. Temporal split validation (train early, test late)
 * 2. Calibration analysis with ECE
 * 3. Alpha sensitivity analysis
 *
 * Usage: npx tsx app/scripts/validate-m1-role-posterior.ts
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
  temporalSplit: {
    trainPeriod: { start: string; end: string; games: number };
    testPeriod: { start: string; end: string; games: number };
    metrics: {
      logLoss: number;
      brierScore: number;
      accuracy: number;
    };
    perChampionMetrics: Array<{
      champion: string;
      testGames: number;
      logLoss: number;
      brierScore: number;
      accuracy: number;
    }>;
  };
  calibration: {
    buckets: Array<{
      range: string;
      predictedMean: number;
      observedFrequency: number;
      count: number;
      gap: number;
    }>;
    ece: number;
    mce: number;
  };
  alphaSensitivity: {
    alphaValues: number[];
    results: Array<{
      alpha: number;
      logLoss: number;
      meanEntropy: number;
      stabilityScore: number;
    }>;
    recommendation: string;
  };
}

interface GameRecord {
  gameId: string;
  patch: string;
  blueTeam: {
    picks: Array<{ championId: string; position: string }>;
  };
  redTeam: {
    picks: Array<{ championId: string; position: string }>;
  };
}

interface RolePosterior {
  posterior: Record<string, number>;
  observedMatches: number;
  alpha: number;
}

// ============ Utility Functions ============

function logLoss(predicted: number, actual: number): number {
  const eps = 1e-15;
  const p = Math.max(eps, Math.min(1 - eps, predicted));
  return actual === 1 ? -Math.log(p) : -Math.log(1 - p);
}

function brierScore(predicted: number, actual: number): number {
  return Math.pow(predicted - actual, 2);
}

function calculateEntropy(probs: number[]): number {
  let entropy = 0;
  for (const p of probs) {
    if (p > 0) {
      entropy -= p * Math.log(p);
    }
  }
  return entropy / Math.log(5); // Normalize by ln(5)
}

function patchToNumber(patch: string): number {
  const parts = patch.split('.');
  return parseInt(parts[0]) * 100 + parseInt(parts[1]);
}

// ============ Core Validation Functions ============

function buildPosteriorFromGames(
  games: GameRecord[],
  alpha: number
): Record<string, RolePosterior> {
  const counts: Record<string, Record<string, number>> = {};
  const totalGames: Record<string, number> = {};

  for (const game of games) {
    const allPicks = [
      ...(game.blueTeam?.picks || []),
      ...(game.redTeam?.picks || []),
    ];

    for (const pick of allPicks) {
      if (!pick.championId || !pick.position) continue;

      const champId = pick.championId;
      const pos = pick.position.toLowerCase();

      if (!counts[champId]) {
        counts[champId] = { top: 0, jungle: 0, mid: 0, bot: 0, support: 0 };
        totalGames[champId] = 0;
      }

      if (counts[champId][pos] !== undefined) {
        counts[champId][pos]++;
        totalGames[champId]++;
      }
    }
  }

  const posteriors: Record<string, RolePosterior> = {};
  const roles = ['top', 'jungle', 'mid', 'bot', 'support'];

  for (const [champId, roleCounts] of Object.entries(counts)) {
    const n = totalGames[champId];
    const posterior: Record<string, number> = {};

    for (const role of roles) {
      const count = roleCounts[role] || 0;
      posterior[role] = (count + alpha / 5) / (n + alpha);
    }

    posteriors[champId] = {
      posterior,
      observedMatches: n,
      alpha,
    };
  }

  return posteriors;
}

function evaluatePosterior(
  posteriors: Record<string, RolePosterior>,
  testGames: GameRecord[]
): { logLoss: number; brierScore: number; accuracy: number; perChampion: any[] } {
  let totalLogLoss = 0;
  let totalBrier = 0;
  let correct = 0;
  let total = 0;

  const perChampion: Record<string, { logLoss: number[]; brier: number[]; correct: number; total: number }> = {};

  for (const game of testGames) {
    const allPicks = [
      ...(game.blueTeam?.picks || []),
      ...(game.redTeam?.picks || []),
    ];

    for (const pick of allPicks) {
      if (!pick.championId || !pick.position) continue;

      const champId = pick.championId;
      const actualRole = pick.position.toLowerCase();
      const post = posteriors[champId];

      if (!post || !post.posterior[actualRole]) continue;

      const predictedProb = post.posterior[actualRole];
      const ll = logLoss(predictedProb, 1);
      const bs = brierScore(predictedProb, 1);

      totalLogLoss += ll;
      totalBrier += bs;
      total++;

      // Check if predicted role matches actual
      const predictedRole = Object.entries(post.posterior)
        .sort((a, b) => b[1] - a[1])[0][0];
      if (predictedRole === actualRole) correct++;

      // Per-champion tracking
      if (!perChampion[champId]) {
        perChampion[champId] = { logLoss: [], brier: [], correct: 0, total: 0 };
      }
      perChampion[champId].logLoss.push(ll);
      perChampion[champId].brier.push(bs);
      perChampion[champId].total++;
      if (predictedRole === actualRole) perChampion[champId].correct++;
    }
  }

  const perChampionResults = Object.entries(perChampion)
    .map(([champId, data]) => ({
      champion: champId,
      testGames: data.total,
      logLoss: data.logLoss.reduce((a, b) => a + b, 0) / data.logLoss.length,
      brierScore: data.brier.reduce((a, b) => a + b, 0) / data.brier.length,
      accuracy: data.correct / data.total,
    }))
    .sort((a, b) => b.testGames - a.testGames);

  return {
    logLoss: total > 0 ? totalLogLoss / total : 0,
    brierScore: total > 0 ? totalBrier / total : 0,
    accuracy: total > 0 ? correct / total : 0,
    perChampion: perChampionResults,
  };
}

function computeCalibration(
  posteriors: Record<string, RolePosterior>,
  testGames: GameRecord[]
): { buckets: any[]; ece: number; mce: number } {
  const bucketBounds = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const buckets: Array<{ predictions: number[]; actuals: number[] }> = [];

  for (let i = 0; i < bucketBounds.length - 1; i++) {
    buckets.push({ predictions: [], actuals: [] });
  }

  for (const game of testGames) {
    const allPicks = [
      ...(game.blueTeam?.picks || []),
      ...(game.redTeam?.picks || []),
    ];

    for (const pick of allPicks) {
      if (!pick.championId || !pick.position) continue;

      const champId = pick.championId;
      const actualRole = pick.position.toLowerCase();
      const post = posteriors[champId];

      if (!post) continue;

      // For each role, add prediction and actual
      for (const [role, prob] of Object.entries(post.posterior)) {
        const actual = role === actualRole ? 1 : 0;
        const bucketIdx = Math.min(Math.floor(prob * 10), 9);
        buckets[bucketIdx].predictions.push(prob);
        buckets[bucketIdx].actuals.push(actual);
      }
    }
  }

  const bucketResults = buckets.map((bucket, i) => {
    const count = bucket.predictions.length;
    if (count === 0) {
      return {
        range: `${bucketBounds[i].toFixed(1)}-${bucketBounds[i + 1].toFixed(1)}`,
        predictedMean: 0,
        observedFrequency: 0,
        count: 0,
        gap: 0,
      };
    }

    const predictedMean = bucket.predictions.reduce((a, b) => a + b, 0) / count;
    const observedFrequency = bucket.actuals.reduce((a, b) => a + b, 0) / count;
    const gap = Math.abs(predictedMean - observedFrequency);

    return {
      range: `${bucketBounds[i].toFixed(1)}-${bucketBounds[i + 1].toFixed(1)}`,
      predictedMean,
      observedFrequency,
      count,
      gap,
    };
  });

  // ECE: weighted average of gaps
  const totalSamples = bucketResults.reduce((a, b) => a + b.count, 0);
  const ece = bucketResults.reduce((acc, b) => acc + (b.count / totalSamples) * b.gap, 0);

  // MCE: maximum gap
  const mce = Math.max(...bucketResults.map(b => b.gap));

  return { buckets: bucketResults, ece, mce };
}

function alphaSensitivityAnalysis(
  trainGames: GameRecord[],
  testGames: GameRecord[],
  alphaValues: number[]
): any[] {
  const results = [];

  for (const alpha of alphaValues) {
    const posteriors = buildPosteriorFromGames(trainGames, alpha);
    const eval_ = evaluatePosterior(posteriors, testGames);

    // Calculate mean entropy
    const entropies = Object.values(posteriors).map(p =>
      calculateEntropy(Object.values(p.posterior))
    );
    const meanEntropy = entropies.reduce((a, b) => a + b, 0) / entropies.length;

    // Stability score: inverse of entropy variance
    const entropyVariance = entropies.reduce((acc, e) => acc + Math.pow(e - meanEntropy, 2), 0) / entropies.length;
    const stabilityScore = 1 / (1 + entropyVariance);

    results.push({
      alpha,
      logLoss: eval_.logLoss,
      meanEntropy,
      stabilityScore,
    });
  }

  return results;
}

// ============ Main Function ============

async function runValidation(): Promise<ValidationResult> {
  const dataDir = path.join(process.cwd(), 'data/lol');

  console.log('='.repeat(70));
  console.log('M1 ROLE POSTERIOR VALIDATION');
  console.log('='.repeat(70));
  console.log(`Run Date: ${new Date().toISOString()}`);
  console.log('');

  // Load states data
  console.log('Loading states.json...');
  const statesRaw = fs.readFileSync(path.join(dataDir, 'states.json'), 'utf-8');
  const statesObj = JSON.parse(statesRaw);

  // Convert object to array if needed
  const series = Array.isArray(statesObj) ? statesObj : Object.values(statesObj);

  // Extract games from series
  const games: GameRecord[] = [];
  const positions = ['top', 'jungle', 'mid', 'bot', 'support'];

  for (const s of series as any[]) {
    if (!s.games) continue;

    for (const game of s.games) {
      if (!game.teams || game.teams.length < 2) continue;

      // Determine patch from series startedAt date
      const startDate = s.startedAt ? new Date(s.startedAt) : new Date('2024-01-01');
      const year = startDate.getFullYear();
      const month = startDate.getMonth() + 1;
      // Approximate patch from date
      const patchMajor = year === 2024 ? 14 : 15;
      const patchMinor = Math.min(Math.max(1, month), 18);
      const patch = `${patchMajor}.${patchMinor}`;

      const blueTeam = game.teams[0];
      const redTeam = game.teams[1];

      const bluePicks = (blueTeam.players || []).map((p: any, idx: number) => ({
        championId: p.character?.name || '',
        position: positions[idx] || 'unknown',
      }));

      const redPicks = (redTeam.players || []).map((p: any, idx: number) => ({
        championId: p.character?.name || '',
        position: positions[idx] || 'unknown',
      }));

      games.push({
        gameId: game.id || s.id,
        patch,
        blueTeam: { picks: bluePicks },
        redTeam: { picks: redPicks },
      });
    }
  }

  console.log(`Loaded ${games.length} games`);

  // Sort by patch and split temporally
  const sortedGames = games.sort((a, b) => patchToNumber(a.patch) - patchToNumber(b.patch));
  const splitIdx = Math.floor(sortedGames.length * 0.7);
  const trainGames = sortedGames.slice(0, splitIdx);
  const testGames = sortedGames.slice(splitIdx);

  const trainPatches = [...new Set(trainGames.map(g => g.patch))].sort();
  const testPatches = [...new Set(testGames.map(g => g.patch))].sort();

  console.log(`Train: ${trainGames.length} games (${trainPatches[0]} to ${trainPatches[trainPatches.length - 1]})`);
  console.log(`Test: ${testGames.length} games (${testPatches[0]} to ${testPatches[testPatches.length - 1]})`);
  console.log('');

  // Build posteriors on training data
  console.log('Building posteriors on training data (alpha=50)...');
  const posteriors = buildPosteriorFromGames(trainGames, 50);
  console.log(`Built posteriors for ${Object.keys(posteriors).length} champions`);

  // Evaluate on test data
  console.log('Evaluating on test data...');
  const evalResult = evaluatePosterior(posteriors, testGames);
  console.log(`Log Loss: ${evalResult.logLoss.toFixed(4)}`);
  console.log(`Brier Score: ${evalResult.brierScore.toFixed(4)}`);
  console.log(`Accuracy: ${(evalResult.accuracy * 100).toFixed(1)}%`);
  console.log('');

  // Calibration analysis
  console.log('Computing calibration...');
  const calibration = computeCalibration(posteriors, testGames);
  console.log(`ECE: ${calibration.ece.toFixed(4)}`);
  console.log(`MCE: ${calibration.mce.toFixed(4)}`);
  console.log('');

  // Alpha sensitivity
  console.log('Running alpha sensitivity analysis...');
  const alphaValues = [10, 25, 50, 100];
  const alphaSensitivity = alphaSensitivityAnalysis(trainGames, testGames, alphaValues);

  for (const result of alphaSensitivity) {
    console.log(`  alpha=${result.alpha}: logLoss=${result.logLoss.toFixed(4)}, entropy=${result.meanEntropy.toFixed(4)}`);
  }

  // Find best alpha
  const bestAlpha = alphaSensitivity.reduce((best, curr) =>
    curr.logLoss < best.logLoss ? curr : best
  );

  const result: ValidationResult = {
    meta: {
      runDate: new Date().toISOString(),
      description: 'Bayesian role posterior validation with temporal split',
      dataSource: 'states.json',
    },
    temporalSplit: {
      trainPeriod: {
        start: trainPatches[0],
        end: trainPatches[trainPatches.length - 1],
        games: trainGames.length,
      },
      testPeriod: {
        start: testPatches[0],
        end: testPatches[testPatches.length - 1],
        games: testGames.length,
      },
      metrics: {
        logLoss: evalResult.logLoss,
        brierScore: evalResult.brierScore,
        accuracy: evalResult.accuracy,
      },
      perChampionMetrics: evalResult.perChampion.slice(0, 20),
    },
    calibration: {
      buckets: calibration.buckets,
      ece: calibration.ece,
      mce: calibration.mce,
    },
    alphaSensitivity: {
      alphaValues,
      results: alphaSensitivity,
      recommendation: `alpha=${bestAlpha.alpha} achieves lowest log loss (${bestAlpha.logLoss.toFixed(4)})`,
    },
  };

  // Write outputs
  const outputDir = path.join(process.cwd(), 'app/docs/validation');
  fs.mkdirSync(outputDir, { recursive: true });

  const jsonPath = path.join(outputDir, 'm1-role-posterior.json');
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  console.log(`\nJSON written to: ${jsonPath}`);

  const mdPath = path.join(outputDir, 'm1-role-posterior.md');
  fs.writeFileSync(mdPath, generateMarkdown(result));
  console.log(`Markdown written to: ${mdPath}`);

  return result;
}

function generateMarkdown(result: ValidationResult): string {
  const lines: string[] = [];

  lines.push('# M1: Role Posterior Validation');
  lines.push('');
  lines.push('## What is Tested');
  lines.push('');
  lines.push('This validation assesses the Bayesian role posterior model that estimates the probability');
  lines.push('distribution of roles for each champion. The model uses a Dirichlet-Multinomial conjugate');
  lines.push('prior with strength parameter alpha.');
  lines.push('');
  lines.push('## Why It Matters');
  lines.push('');
  lines.push('Role posteriors are foundational to the system. They determine:');
  lines.push('- Role flexibility evidence (entropy-based)');
  lines.push('- Context filter adjustments');
  lines.push('- Draft state interpretation');
  lines.push('');
  lines.push('Poor calibration would lead to overconfident or underconfident role predictions.');
  lines.push('');
  lines.push('## Method');
  lines.push('');
  lines.push('### Temporal Split Validation');
  lines.push('');
  lines.push('1. Sort all games by patch version');
  lines.push('2. Use first 70% for training, last 30% for testing');
  lines.push('3. Build posteriors on training data only');
  lines.push('4. Evaluate predictions on held-out test data');
  lines.push('');
  lines.push('### Metrics');
  lines.push('');
  lines.push('- **Log Loss**: Measures prediction confidence calibration');
  lines.push('- **Brier Score**: Measures probability accuracy');
  lines.push('- **Accuracy**: Top-1 role prediction accuracy');
  lines.push('- **ECE**: Expected Calibration Error');
  lines.push('- **MCE**: Maximum Calibration Error');
  lines.push('');
  lines.push('## Results');
  lines.push('');
  lines.push('### Temporal Split');
  lines.push('');
  lines.push('| Period | Patches | Games |');
  lines.push('|--------|---------|-------|');
  lines.push(`| Train | ${result.temporalSplit.trainPeriod.start} - ${result.temporalSplit.trainPeriod.end} | ${result.temporalSplit.trainPeriod.games.toLocaleString()} |`);
  lines.push(`| Test | ${result.temporalSplit.testPeriod.start} - ${result.temporalSplit.testPeriod.end} | ${result.temporalSplit.testPeriod.games.toLocaleString()} |`);
  lines.push('');
  lines.push('### Overall Metrics');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Log Loss | ${result.temporalSplit.metrics.logLoss.toFixed(4)} |`);
  lines.push(`| Brier Score | ${result.temporalSplit.metrics.brierScore.toFixed(4)} |`);
  lines.push(`| Accuracy | ${(result.temporalSplit.metrics.accuracy * 100).toFixed(1)}% |`);
  lines.push('');
  lines.push('### Calibration');
  lines.push('');
  lines.push('| Metric | Value | Interpretation |');
  lines.push('|--------|-------|----------------|');
  lines.push(`| ECE | ${result.calibration.ece.toFixed(4)} | ${result.calibration.ece < 0.05 ? 'Well calibrated' : result.calibration.ece < 0.1 ? 'Acceptable' : 'Needs improvement'} |`);
  lines.push(`| MCE | ${result.calibration.mce.toFixed(4)} | Maximum bucket deviation |`);
  lines.push('');
  lines.push('#### Calibration Buckets');
  lines.push('');
  lines.push('| Predicted Range | Predicted Mean | Observed Freq | Count | Gap |');
  lines.push('|-----------------|----------------|---------------|-------|-----|');
  for (const bucket of result.calibration.buckets) {
    if (bucket.count > 0) {
      lines.push(`| ${bucket.range} | ${bucket.predictedMean.toFixed(3)} | ${bucket.observedFrequency.toFixed(3)} | ${bucket.count} | ${bucket.gap.toFixed(3)} |`);
    }
  }
  lines.push('');
  lines.push('### Alpha Sensitivity');
  lines.push('');
  lines.push('| Alpha | Log Loss | Mean Entropy | Stability |');
  lines.push('|-------|----------|--------------|-----------|');
  for (const r of result.alphaSensitivity.results) {
    lines.push(`| ${r.alpha} | ${r.logLoss.toFixed(4)} | ${r.meanEntropy.toFixed(4)} | ${r.stabilityScore.toFixed(4)} |`);
  }
  lines.push('');
  lines.push(`**Recommendation:** ${result.alphaSensitivity.recommendation}`);
  lines.push('');
  lines.push('### Top Champions by Test Games');
  lines.push('');
  lines.push('| Champion | Test Games | Log Loss | Brier | Accuracy |');
  lines.push('|----------|------------|----------|-------|----------|');
  for (const c of result.temporalSplit.perChampionMetrics.slice(0, 10)) {
    lines.push(`| ${c.champion} | ${c.testGames} | ${c.logLoss.toFixed(4)} | ${c.brierScore.toFixed(4)} | ${(c.accuracy * 100).toFixed(1)}% |`);
  }
  lines.push('');
  lines.push('## Limitations');
  lines.push('');
  lines.push('- Temporal split assumes patch ordering reflects time; actual dates not used');
  lines.push('- Champions with few test games have high variance in per-champion metrics');
  lines.push('- This validation does not assess context filter adjustments');
  lines.push('');
  lines.push('---');
  lines.push(`*Generated: ${result.meta.runDate}*`);

  return lines.join('\n');
}

// Run
runValidation().catch(console.error);
