/**
 * M2 Context Filter Validation
 *
 * Validates the context filter (multiplicative reweighting) through:
 * 1. Small-sample stress test
 * 2. Fallback correctness verification
 * 3. Bootstrap stability analysis
 *
 * Usage: npx tsx app/scripts/validate-m2-context-filter.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ============ Types ============

interface ValidationResult {
  meta: {
    runDate: string;
    description: string;
    epsilon: number;
    minSampleThreshold: number;
  };
  smallSampleStress: {
    sampleSizes: number[];
    results: Array<{
      sampleSize: number;
      maxAbsShift: number;
      meanAbsShift: number;
      p95AbsShift: number;
      championsAffected: number;
    }>;
    interpretation: string;
  };
  fallbackCorrectness: {
    totalContexts: number;
    belowThreshold: number;
    fallbackTriggered: number;
    exactMatchCount: number;
    maxDiff: number;
    status: 'PASS' | 'FAIL';
  };
  bootstrapStability: {
    bootstrapIterations: number;
    contexts: Array<{
      context: string;
      sampleSize: number;
      ciWidth: {
        mean: number;
        p95: number;
        max: number;
      };
    }>;
    summary: {
      meanCIWidth: number;
      maxCIWidth: number;
    };
  };
}

interface PatchRegionStats {
  [patch: string]: {
    [region: string]: {
      [champion: string]: {
        games: number;
        roles: Record<string, number>;
      };
    };
  };
}

interface RolePosterior {
  posterior: Record<string, number>;
  observedMatches: number;
  alpha: number;
}

// ============ Context Filter Implementation ============

const EPSILON = 3;
const MIN_SAMPLE = 10;

function applyContextFilter(
  basePosterior: Record<string, number>,
  contextFreq: Record<string, number>,
  globalFreq: Record<string, number>,
  contextSampleSize: number
): Record<string, number> {
  // Fallback if sample too small
  if (contextSampleSize < MIN_SAMPLE) {
    return { ...basePosterior };
  }

  const adjusted: Record<string, number> = {};
  let sum = 0;

  for (const role of Object.keys(basePosterior)) {
    const ctxF = contextFreq[role] || 0;
    const glbF = globalFreq[role] || 0;
    const weight = (ctxF + EPSILON) / (glbF + EPSILON);
    adjusted[role] = basePosterior[role] * weight;
    sum += adjusted[role];
  }

  // Renormalize
  if (sum > 0) {
    for (const role of Object.keys(adjusted)) {
      adjusted[role] /= sum;
    }
  }

  return adjusted;
}

function computeGlobalFreq(
  patchRegionStats: PatchRegionStats,
  champion: string
): Record<string, number> {
  const totalRoles: Record<string, number> = { top: 0, jungle: 0, mid: 0, bot: 0, support: 0 };
  let totalGames = 0;

  for (const regions of Object.values(patchRegionStats)) {
    if (typeof regions !== 'object') continue;
    for (const champions of Object.values(regions)) {
      if (typeof champions !== 'object') continue;
      const champData = champions[champion];
      if (champData && champData.roles) {
        for (const [role, count] of Object.entries(champData.roles)) {
          if (totalRoles[role] !== undefined) {
            totalRoles[role] += count as number;
            totalGames += count as number;
          }
        }
      }
    }
  }

  const freq: Record<string, number> = {};
  for (const role of Object.keys(totalRoles)) {
    freq[role] = totalGames > 0 ? totalRoles[role] / totalGames : 0.2;
  }
  return freq;
}

function computeContextFreq(
  patchRegionStats: PatchRegionStats,
  champion: string,
  patch?: string,
  region?: string
): { freq: Record<string, number>; sampleSize: number } {
  const totalRoles: Record<string, number> = { top: 0, jungle: 0, mid: 0, bot: 0, support: 0 };
  let totalGames = 0;

  for (const [p, regions] of Object.entries(patchRegionStats)) {
    if (patch && p !== patch) continue;
    if (typeof regions !== 'object') continue;

    for (const [r, champions] of Object.entries(regions)) {
      if (region && r !== region) continue;
      if (typeof champions !== 'object') continue;

      const champData = champions[champion];
      if (champData && champData.roles) {
        for (const [role, count] of Object.entries(champData.roles)) {
          if (totalRoles[role] !== undefined) {
            totalRoles[role] += count as number;
            totalGames += count as number;
          }
        }
      }
    }
  }

  const freq: Record<string, number> = {};
  for (const role of Object.keys(totalRoles)) {
    freq[role] = totalGames > 0 ? totalRoles[role] / totalGames : 0;
  }

  return { freq, sampleSize: totalGames };
}

// ============ Validation Functions ============

function smallSampleStressTest(
  posteriors: Record<string, RolePosterior>,
  patchRegionStats: PatchRegionStats
): any {
  const sampleSizes = [5, 10, 20];
  const results = [];

  for (const targetSize of sampleSizes) {
    const shifts: number[] = [];
    let championsAffected = 0;

    for (const [champion, post] of Object.entries(posteriors)) {
      const globalFreq = computeGlobalFreq(patchRegionStats, champion);

      // Find contexts with approximately targetSize samples
      for (const [patch, regions] of Object.entries(patchRegionStats)) {
        if (typeof regions !== 'object') continue;

        for (const [region, champions] of Object.entries(regions)) {
          if (typeof champions !== 'object') continue;

          const champData = champions[champion];
          if (!champData) continue;

          const contextSize = champData.games || 0;
          // Accept contexts within 50% of target
          if (contextSize >= targetSize * 0.5 && contextSize <= targetSize * 1.5) {
            const { freq: contextFreq, sampleSize } = computeContextFreq(
              patchRegionStats, champion, patch, region
            );

            const adjusted = applyContextFilter(
              post.posterior,
              contextFreq,
              globalFreq,
              sampleSize
            );

            // Compute max absolute shift
            let maxShift = 0;
            for (const role of Object.keys(post.posterior)) {
              const shift = Math.abs(adjusted[role] - post.posterior[role]);
              maxShift = Math.max(maxShift, shift);
            }

            if (maxShift > 0) {
              shifts.push(maxShift);
              championsAffected++;
            }
          }
        }
      }
    }

    if (shifts.length > 0) {
      shifts.sort((a, b) => a - b);
      results.push({
        sampleSize: targetSize,
        maxAbsShift: Math.max(...shifts),
        meanAbsShift: shifts.reduce((a, b) => a + b, 0) / shifts.length,
        p95AbsShift: shifts[Math.floor(shifts.length * 0.95)],
        championsAffected,
      });
    } else {
      results.push({
        sampleSize: targetSize,
        maxAbsShift: 0,
        meanAbsShift: 0,
        p95AbsShift: 0,
        championsAffected: 0,
      });
    }
  }

  return {
    sampleSizes,
    results,
    interpretation: results.every(r => r.maxAbsShift < 0.3)
      ? 'Small sample adjustments are bounded and conservative'
      : 'Some large shifts detected in small samples',
  };
}

function fallbackCorrectnessTest(
  posteriors: Record<string, RolePosterior>,
  patchRegionStats: PatchRegionStats
): any {
  let totalContexts = 0;
  let belowThreshold = 0;
  let fallbackTriggered = 0;
  let exactMatchCount = 0;
  let maxDiff = 0;

  for (const [champion, post] of Object.entries(posteriors)) {
    const globalFreq = computeGlobalFreq(patchRegionStats, champion);

    for (const [patch, regions] of Object.entries(patchRegionStats)) {
      if (typeof regions !== 'object') continue;

      for (const [region, champions] of Object.entries(regions)) {
        if (typeof champions !== 'object') continue;

        const champData = champions[champion];
        if (!champData) continue;

        totalContexts++;
        const contextSize = champData.games || 0;

        if (contextSize < MIN_SAMPLE) {
          belowThreshold++;

          const { freq: contextFreq, sampleSize } = computeContextFreq(
            patchRegionStats, champion, patch, region
          );

          const adjusted = applyContextFilter(
            post.posterior,
            contextFreq,
            globalFreq,
            sampleSize
          );

          // Check if adjusted equals base
          let isExactMatch = true;
          let localMaxDiff = 0;
          for (const role of Object.keys(post.posterior)) {
            const diff = Math.abs(adjusted[role] - post.posterior[role]);
            if (diff > 1e-10) {
              isExactMatch = false;
            }
            localMaxDiff = Math.max(localMaxDiff, diff);
          }

          if (isExactMatch) {
            exactMatchCount++;
            fallbackTriggered++;
          }
          maxDiff = Math.max(maxDiff, localMaxDiff);
        }
      }
    }
  }

  return {
    totalContexts,
    belowThreshold,
    fallbackTriggered: exactMatchCount,
    exactMatchCount,
    maxDiff,
    status: exactMatchCount === belowThreshold ? 'PASS' : 'FAIL',
  };
}

function bootstrapStabilityTest(
  posteriors: Record<string, RolePosterior>,
  patchRegionStats: PatchRegionStats,
  iterations: number = 200
): any {
  const contextResults: any[] = [];

  // Select a few representative contexts
  const selectedContexts: Array<{ patch: string; region: string; champion: string }> = [];

  for (const [patch, regions] of Object.entries(patchRegionStats)) {
    if (typeof regions !== 'object') continue;
    if (selectedContexts.length >= 5) break;

    for (const [region, champions] of Object.entries(regions)) {
      if (typeof champions !== 'object') continue;
      if (selectedContexts.length >= 5) break;

      for (const champion of Object.keys(champions)) {
        const champData = champions[champion];
        if (champData && champData.games >= 20 && champData.games <= 100) {
          selectedContexts.push({ patch, region, champion });
          if (selectedContexts.length >= 5) break;
        }
      }
    }
  }

  for (const ctx of selectedContexts) {
    const post = posteriors[ctx.champion];
    if (!post) continue;

    const globalFreq = computeGlobalFreq(patchRegionStats, ctx.champion);
    const { freq: contextFreq, sampleSize } = computeContextFreq(
      patchRegionStats, ctx.champion, ctx.patch, ctx.region
    );

    // Bootstrap: resample and compute adjusted posteriors
    const bootstrapResults: Record<string, number[]> = {
      top: [], jungle: [], mid: [], bot: [], support: []
    };

    for (let i = 0; i < iterations; i++) {
      // Simulate resampling by adding noise proportional to 1/sqrt(n)
      const noise = 1 / Math.sqrt(sampleSize);
      const noisyFreq: Record<string, number> = {};
      let sum = 0;

      for (const role of Object.keys(contextFreq)) {
        noisyFreq[role] = Math.max(0, contextFreq[role] + (Math.random() - 0.5) * noise);
        sum += noisyFreq[role];
      }

      // Normalize
      if (sum > 0) {
        for (const role of Object.keys(noisyFreq)) {
          noisyFreq[role] /= sum;
        }
      }

      const adjusted = applyContextFilter(post.posterior, noisyFreq, globalFreq, sampleSize);

      for (const role of Object.keys(adjusted)) {
        bootstrapResults[role].push(adjusted[role]);
      }
    }

    // Compute CI widths
    const ciWidths: number[] = [];
    for (const role of Object.keys(bootstrapResults)) {
      const values = bootstrapResults[role].sort((a, b) => a - b);
      const lower = values[Math.floor(iterations * 0.025)];
      const upper = values[Math.floor(iterations * 0.975)];
      ciWidths.push(upper - lower);
    }

    contextResults.push({
      context: `${ctx.patch}/${ctx.region}/${ctx.champion}`,
      sampleSize,
      ciWidth: {
        mean: ciWidths.reduce((a, b) => a + b, 0) / ciWidths.length,
        p95: ciWidths.sort((a, b) => a - b)[Math.floor(ciWidths.length * 0.95)],
        max: Math.max(...ciWidths),
      },
    });
  }

  const allMeanWidths = contextResults.map(c => c.ciWidth.mean);

  return {
    bootstrapIterations: iterations,
    contexts: contextResults,
    summary: {
      meanCIWidth: allMeanWidths.length > 0
        ? allMeanWidths.reduce((a, b) => a + b, 0) / allMeanWidths.length
        : 0,
      maxCIWidth: allMeanWidths.length > 0 ? Math.max(...allMeanWidths) : 0,
    },
  };
}

// ============ Main Function ============

async function runValidation(): Promise<ValidationResult> {
  const dataDir = path.join(process.cwd(), 'data/lol');

  console.log('='.repeat(70));
  console.log('M2 CONTEXT FILTER VALIDATION');
  console.log('='.repeat(70));
  console.log(`Run Date: ${new Date().toISOString()}`);
  console.log(`Epsilon: ${EPSILON}, Min Sample: ${MIN_SAMPLE}`);
  console.log('');

  // Load data
  console.log('Loading bayesian-role-posteriors.json...');
  const posteriors: Record<string, RolePosterior> = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'bayesian-role-posteriors.json'), 'utf-8')
  );
  console.log(`Loaded ${Object.keys(posteriors).length} champion posteriors`);

  console.log('Loading patch-region-stats.json...');
  const patchRegionStats: PatchRegionStats = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'patch-region-stats.json'), 'utf-8')
  );
  console.log('Loaded patch-region stats');
  console.log('');

  // Run tests
  console.log('Running small-sample stress test...');
  const stressTest = smallSampleStressTest(posteriors, patchRegionStats);
  for (const r of stressTest.results) {
    console.log(`  N≈${r.sampleSize}: maxShift=${r.maxAbsShift.toFixed(4)}, meanShift=${r.meanAbsShift.toFixed(4)}`);
  }
  console.log('');

  console.log('Running fallback correctness test...');
  const fallbackTest = fallbackCorrectnessTest(posteriors, patchRegionStats);
  console.log(`  Total contexts: ${fallbackTest.totalContexts}`);
  console.log(`  Below threshold: ${fallbackTest.belowThreshold}`);
  console.log(`  Fallback triggered: ${fallbackTest.fallbackTriggered}`);
  console.log(`  Status: ${fallbackTest.status}`);
  console.log('');

  console.log('Running bootstrap stability test (200 iterations)...');
  const bootstrapTest = bootstrapStabilityTest(posteriors, patchRegionStats, 200);
  console.log(`  Mean CI width: ${bootstrapTest.summary.meanCIWidth.toFixed(4)}`);
  console.log(`  Max CI width: ${bootstrapTest.summary.maxCIWidth.toFixed(4)}`);
  console.log('');

  const result: ValidationResult = {
    meta: {
      runDate: new Date().toISOString(),
      description: 'Context filter validation with stress, fallback, and stability tests',
      epsilon: EPSILON,
      minSampleThreshold: MIN_SAMPLE,
    },
    smallSampleStress: stressTest,
    fallbackCorrectness: fallbackTest,
    bootstrapStability: bootstrapTest,
  };

  // Write outputs
  const outputDir = path.join(process.cwd(), 'app/docs/validation');
  fs.mkdirSync(outputDir, { recursive: true });

  const jsonPath = path.join(outputDir, 'm2-context-filter.json');
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  console.log(`JSON written to: ${jsonPath}`);

  const mdPath = path.join(outputDir, 'm2-context-filter.md');
  fs.writeFileSync(mdPath, generateMarkdown(result));
  console.log(`Markdown written to: ${mdPath}`);

  return result;
}

function generateMarkdown(result: ValidationResult): string {
  const lines: string[] = [];

  lines.push('# M2: Context Filter Validation');
  lines.push('');
  lines.push('## What is Tested');
  lines.push('');
  lines.push('This validation assesses the context filter that adjusts role posteriors based on');
  lines.push('patch/region-specific frequencies. The filter uses multiplicative reweighting with');
  lines.push(`epsilon=${result.meta.epsilon} smoothing and a minimum sample threshold of ${result.meta.minSampleThreshold}.`);
  lines.push('');
  lines.push('## Why It Matters');
  lines.push('');
  lines.push('The context filter allows analysts to view role distributions specific to a patch or region.');
  lines.push('It must:');
  lines.push('- Not produce extreme shifts from small samples');
  lines.push('- Fall back to global baseline when data is insufficient');
  lines.push('- Produce stable estimates under resampling');
  lines.push('');
  lines.push('## Method');
  lines.push('');
  lines.push('### Small-Sample Stress Test');
  lines.push('');
  lines.push('For contexts with N≈5, 10, 20 games, measure the maximum absolute probability shift');
  lines.push('from the global baseline. Large shifts indicate instability.');
  lines.push('');
  lines.push('### Fallback Correctness');
  lines.push('');
  lines.push(`Verify that contexts with <${result.meta.minSampleThreshold} games return the exact global baseline`);
  lines.push('(diff=0 for all roles).');
  lines.push('');
  lines.push('### Bootstrap Stability');
  lines.push('');
  lines.push('Resample within selected contexts 200 times and compute 95% CI widths for each role.');
  lines.push('Narrow CIs indicate stable estimates.');
  lines.push('');
  lines.push('## Results');
  lines.push('');
  lines.push('### Small-Sample Stress Test');
  lines.push('');
  lines.push('| Sample Size | Max Shift | Mean Shift | P95 Shift | Champions |');
  lines.push('|-------------|-----------|------------|-----------|-----------|');
  for (const r of result.smallSampleStress.results) {
    lines.push(`| ~${r.sampleSize} | ${r.maxAbsShift.toFixed(4)} | ${r.meanAbsShift.toFixed(4)} | ${r.p95AbsShift.toFixed(4)} | ${r.championsAffected} |`);
  }
  lines.push('');
  lines.push(`**Interpretation:** ${result.smallSampleStress.interpretation}`);
  lines.push('');
  lines.push('### Fallback Correctness');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Contexts | ${result.fallbackCorrectness.totalContexts} |`);
  lines.push(`| Below Threshold (<${result.meta.minSampleThreshold}) | ${result.fallbackCorrectness.belowThreshold} |`);
  lines.push(`| Fallback Triggered | ${result.fallbackCorrectness.fallbackTriggered} |`);
  lines.push(`| Exact Match Count | ${result.fallbackCorrectness.exactMatchCount} |`);
  lines.push(`| Max Diff | ${result.fallbackCorrectness.maxDiff.toFixed(10)} |`);
  lines.push(`| **Status** | **${result.fallbackCorrectness.status}** |`);
  lines.push('');
  lines.push('### Bootstrap Stability');
  lines.push('');
  lines.push(`Bootstrap iterations: ${result.bootstrapStability.bootstrapIterations}`);
  lines.push('');
  lines.push('| Context | Sample Size | Mean CI Width | P95 CI Width | Max CI Width |');
  lines.push('|---------|-------------|---------------|--------------|--------------|');
  for (const ctx of result.bootstrapStability.contexts) {
    lines.push(`| ${ctx.context} | ${ctx.sampleSize} | ${ctx.ciWidth.mean.toFixed(4)} | ${ctx.ciWidth.p95.toFixed(4)} | ${ctx.ciWidth.max.toFixed(4)} |`);
  }
  lines.push('');
  lines.push('**Summary:**');
  lines.push(`- Mean CI Width: ${result.bootstrapStability.summary.meanCIWidth.toFixed(4)}`);
  lines.push(`- Max CI Width: ${result.bootstrapStability.summary.maxCIWidth.toFixed(4)}`);
  lines.push('');
  lines.push('## Limitations');
  lines.push('');
  lines.push('- Bootstrap simulation uses Gaussian noise approximation, not true resampling');
  lines.push('- Only a subset of contexts are tested for bootstrap stability');
  lines.push('- Does not test interaction with other system components');
  lines.push('');
  lines.push('---');
  lines.push(`*Generated: ${result.meta.runDate}*`);

  return lines.join('\n');
}

// Run
runValidation().catch(console.error);
