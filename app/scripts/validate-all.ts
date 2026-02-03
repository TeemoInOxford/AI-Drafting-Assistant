/**
 * Validation Suite Runner
 *
 * Runs all validation scripts and generates consolidated reports.
 *
 * Usage: npx tsx app/scripts/validate-all.ts
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface ValidationSummary {
  meta: {
    runDate: string;
    totalModules: number;
    duration: string;
  };
  modules: Array<{
    name: string;
    script: string;
    status: 'PASS' | 'FAIL' | 'ERROR';
    duration: number;
    error?: string;
  }>;
  overallStatus: 'PASS' | 'FAIL';
}

const VALIDATION_SCRIPTS = [
  { name: 'Data QA', script: 'data-qa.ts' },
  { name: 'M1 Role Posterior', script: 'validate-m1-role-posterior.ts' },
  { name: 'M2 Context Filter', script: 'validate-m2-context-filter.ts' },
  { name: 'M3 Threat Signals', script: 'validate-m3-threat-signals.ts' },
  { name: 'M4 Player Pool', script: 'validate-m4-player-pool.ts' },
  { name: 'M5 Evidence Trace', script: 'validate-m5-evidence-trace.ts' },
  { name: 'M6 Draft Decision', script: 'validate-m6-draft-decision.ts' },
];

async function runAllValidations(): Promise<ValidationSummary> {
  const startTime = Date.now();

  console.log('='.repeat(70));
  console.log('VALIDATION SUITE RUNNER');
  console.log('='.repeat(70));
  console.log(`Start Time: ${new Date().toISOString()}`);
  console.log('');

  const summary: ValidationSummary = {
    meta: {
      runDate: new Date().toISOString(),
      totalModules: VALIDATION_SCRIPTS.length,
      duration: '',
    },
    modules: [],
    overallStatus: 'PASS',
  };

  for (const { name, script } of VALIDATION_SCRIPTS) {
    console.log(`Running ${name}...`);
    const moduleStart = Date.now();

    try {
      execSync(`npx tsx app/scripts/${script}`, {
        cwd: process.cwd(),
        stdio: 'pipe',
        timeout: 300000, // 5 minute timeout
      });

      const duration = Date.now() - moduleStart;
      console.log(`  Completed in ${(duration / 1000).toFixed(1)}s`);

      summary.modules.push({
        name,
        script,
        status: 'PASS',
        duration,
      });
    } catch (error: any) {
      const duration = Date.now() - moduleStart;
      console.log(`  FAILED after ${(duration / 1000).toFixed(1)}s`);

      summary.modules.push({
        name,
        script,
        status: 'ERROR',
        duration,
        error: error.message || 'Unknown error',
      });

      summary.overallStatus = 'FAIL';
    }

    console.log('');
  }

  const totalDuration = Date.now() - startTime;
  summary.meta.duration = `${(totalDuration / 1000).toFixed(1)}s`;

  console.log('='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total Duration: ${summary.meta.duration}`);
  console.log(`Overall Status: ${summary.overallStatus}`);
  console.log('');

  for (const module of summary.modules) {
    const statusIcon = module.status === 'PASS' ? '✓' : '✗';
    console.log(`  ${statusIcon} ${module.name}: ${module.status}`);
  }

  // Write summary
  const outputDir = path.join(process.cwd(), 'app/docs/validation');
  fs.mkdirSync(outputDir, { recursive: true });

  const summaryPath = path.join(outputDir, 'summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`\nSummary written to: ${summaryPath}`);

  // Generate index.md
  generateIndexMarkdown(summary, outputDir);

  return summary;
}

function generateIndexMarkdown(summary: ValidationSummary, outputDir: string): void {
  const lines: string[] = [];

  lines.push('# Validation & Diagnostics Index');
  lines.push('');
  lines.push('## Overview');
  lines.push('');
  lines.push('This document provides a comprehensive validation suite for the LoL Draft Assistant system.');
  lines.push('All validations focus on reliability, stability, calibration, and correctness—not win rate prediction.');
  lines.push('');
  lines.push('## What is Tested');
  lines.push('');
  lines.push('| Module | Description | Report |');
  lines.push('|--------|-------------|--------|');
  lines.push('| Data QA | Data integrity, null checks, imputation verification | [data-qa.md](./data-qa.md) |');
  lines.push('| M1 Role Posterior | Bayesian role distribution calibration | [m1-role-posterior.md](./m1-role-posterior.md) |');
  lines.push('| M2 Context Filter | Patch/region reweighting stability | [m2-context-filter.md](./m2-context-filter.md) |');
  lines.push('| M3 Threat Signals | Ban pressure signal validity | [m3-threat-signals.md](./m3-threat-signals.md) |');
  lines.push('| M4 Player Pool | Player champion pool consistency | [m4-player-pool.md](./m4-player-pool.md) |');
  lines.push('| M5 Evidence Trace | Evidence attribution correctness | [m5-evidence-trace.md](./m5-evidence-trace.md) |');
  lines.push('| M6 Draft Decision | Draft state machine safety | [m6-draft-decision.md](./m6-draft-decision.md) |');
  lines.push('');
  lines.push('## Why It Matters');
  lines.push('');
  lines.push('This validation suite ensures:');
  lines.push('');
  lines.push('1. **Data Integrity**: No random imputation, complete coverage disclosure');
  lines.push('2. **Model Calibration**: Predictions match observed frequencies');
  lines.push('3. **Stability**: Outputs are consistent under resampling and temporal shifts');
  lines.push('4. **Safety**: Actions cannot be triggered accidentally');
  lines.push('5. **Conservatism**: Small samples do not produce overconfident outputs');
  lines.push('');
  lines.push('## Latest Run Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Run Date | ${summary.meta.runDate} |`);
  lines.push(`| Total Modules | ${summary.meta.totalModules} |`);
  lines.push(`| Duration | ${summary.meta.duration} |`);
  lines.push(`| **Overall Status** | **${summary.overallStatus}** |`);
  lines.push('');
  lines.push('### Module Results');
  lines.push('');
  lines.push('| Module | Status | Duration |');
  lines.push('|--------|--------|----------|');
  for (const module of summary.modules) {
    const statusIcon = module.status === 'PASS' ? '✓' : '✗';
    lines.push(`| ${module.name} | ${statusIcon} ${module.status} | ${(module.duration / 1000).toFixed(1)}s |`);
  }
  lines.push('');
  lines.push('## Key Results');
  lines.push('');
  lines.push('### M1: Role Posterior');
  lines.push('');
  lines.push('- Temporal split validation with 70/30 train/test');
  lines.push('- Log loss, Brier score, and accuracy metrics');
  lines.push('- ECE (Expected Calibration Error) analysis');
  lines.push('- Alpha sensitivity analysis');
  lines.push('');
  lines.push('### M2: Context Filter');
  lines.push('');
  lines.push('- Small-sample stress test (N=5, 10, 20)');
  lines.push('- Fallback correctness verification (sample < 10 → exact baseline)');
  lines.push('- Bootstrap stability with 95% CI widths');
  lines.push('');
  lines.push('### M3: Threat Signals');
  lines.push('');
  lines.push('- Monotonicity (Spearman correlation between rawLift and score)');
  lines.push('- Low-exposure robustness (cold champions do not dominate)');
  lines.push('- Conservatism analysis (obs vs obsLower gap)');
  lines.push('- Permutation test (real vs shuffled top-K)');
  lines.push('');
  lines.push('### M4: Player Pool');
  lines.push('');
  lines.push('- Temporal stability (Recall@5, Recall@10)');
  lines.push('- Low-sample gating (players < 10 games cannot produce STRONG)');
  lines.push('- Coverage disclosure');
  lines.push('');
  lines.push('### M5: Evidence Trace');
  lines.push('');
  lines.push('- Deterministic unit tests for boundary values');
  lines.push('- Explanation stability (100% deterministic)');
  lines.push('');
  lines.push('### M6: Draft Decision');
  lines.push('');
  lines.push('- State machine tests for all phases');
  lines.push('- Action safety (view never triggers ban)');
  lines.push('- Phase transition validation');
  lines.push('');
  lines.push('## Limitations');
  lines.push('');
  lines.push('This validation suite:');
  lines.push('');
  lines.push('- Does NOT predict win rates or meta shifts');
  lines.push('- Does NOT claim causal relationships');
  lines.push('- Does NOT test UI rendering or network behavior');
  lines.push('- Uses simulated inputs for some tests');
  lines.push('');
  lines.push('## Running the Suite');
  lines.push('');
  lines.push('```bash');
  lines.push('# Run all validations');
  lines.push('npm run validate:all');
  lines.push('');
  lines.push('# Run individual modules');
  lines.push('npx tsx app/scripts/data-qa.ts');
  lines.push('npx tsx app/scripts/validate-m1-role-posterior.ts');
  lines.push('npx tsx app/scripts/validate-m2-context-filter.ts');
  lines.push('npx tsx app/scripts/validate-m3-threat-signals.ts');
  lines.push('npx tsx app/scripts/validate-m4-player-pool.ts');
  lines.push('npx tsx app/scripts/validate-m5-evidence-trace.ts');
  lines.push('npx tsx app/scripts/validate-m6-draft-decision.ts');
  lines.push('```');
  lines.push('');
  lines.push('## Data Coverage');
  lines.push('');
  lines.push('All validations use data from:');
  lines.push('- Professional matches: 2024-01 to 2025-09');
  lines.push('- Patches: 14.1 through 15.18');
  lines.push('- Regions: LCK, LPL, LEC, LCS, LTA, International');
  lines.push('');
  lines.push('---');
  lines.push(`*Generated: ${summary.meta.runDate}*`);

  const indexPath = path.join(outputDir, 'index.md');
  fs.writeFileSync(indexPath, lines.join('\n'));
  console.log(`Index written to: ${indexPath}`);
}

// Run
runAllValidations().catch(console.error);
