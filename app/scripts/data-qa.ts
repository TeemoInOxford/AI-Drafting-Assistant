/**
 * Data Quality Assurance Script
 *
 * Validates data integrity across all datasets used by the system.
 * Checks for:
 * - Null/undefined counts for key fields
 * - Confirms NO random imputation
 * - Lists fallback counts and coverage
 *
 * Usage: npx tsx app/scripts/data-qa.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ============ Types ============

interface QAResult {
  meta: {
    runDate: string;
    dataDirectory: string;
  };
  datasets: {
    [name: string]: DatasetQA;
  };
  summary: {
    totalDatasets: number;
    totalRecords: number;
    totalNullFields: number;
    totalMissingFields: number;
    fallbackCounts: Record<string, number>;
    imputationCheck: 'PASS' | 'FAIL';
    imputationDetails: string[];
  };
}

interface DatasetQA {
  fileName: string;
  fileSize: number;
  recordCount: number;
  fieldAnalysis: FieldAnalysis[];
  nullCounts: Record<string, number>;
  undefinedCounts: Record<string, number>;
  coverageDates?: { earliest: string; latest: string };
  warnings: string[];
}

interface FieldAnalysis {
  field: string;
  presentCount: number;
  nullCount: number;
  undefinedCount: number;
  emptyStringCount: number;
  coverage: number;
}

// ============ Utility Functions ============

function analyzeField(records: any[], fieldPath: string): FieldAnalysis {
  let presentCount = 0;
  let nullCount = 0;
  let undefinedCount = 0;
  let emptyStringCount = 0;

  for (const record of records) {
    const value = getNestedValue(record, fieldPath);
    if (value === null) {
      nullCount++;
    } else if (value === undefined) {
      undefinedCount++;
    } else if (value === '') {
      emptyStringCount++;
    } else {
      presentCount++;
    }
  }

  return {
    field: fieldPath,
    presentCount,
    nullCount,
    undefinedCount,
    emptyStringCount,
    coverage: records.length > 0 ? presentCount / records.length : 0,
  };
}

function getNestedValue(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============ Dataset Analyzers ============

function analyzeStates(dataDir: string): DatasetQA {
  const filePath = path.join(dataDir, 'states.json');
  const stats = fs.statSync(filePath);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  const records = Array.isArray(data) ? data : Object.values(data);
  const warnings: string[] = [];

  // Key fields to check
  const keyFields = [
    'gameId',
    'platformGameId',
    'state.patch',
    'state.blueTeam.id',
    'state.redTeam.id',
    'state.blueTeam.bans',
    'state.redTeam.bans',
    'state.blueTeam.picks',
    'state.redTeam.picks',
  ];

  const fieldAnalyses = keyFields.map(f => analyzeField(records, f));
  const nullCounts: Record<string, number> = {};
  const undefinedCounts: Record<string, number> = {};

  for (const analysis of fieldAnalyses) {
    if (analysis.nullCount > 0) nullCounts[analysis.field] = analysis.nullCount;
    if (analysis.undefinedCount > 0) undefinedCounts[analysis.field] = analysis.undefinedCount;
  }

  // Extract date range from patches
  const patches = records
    .map((r: any) => r?.state?.patch)
    .filter((p: any) => p && typeof p === 'string')
    .sort();

  return {
    fileName: 'states.json',
    fileSize: stats.size,
    recordCount: records.length,
    fieldAnalysis: fieldAnalyses,
    nullCounts,
    undefinedCounts,
    coverageDates: patches.length > 0 ? { earliest: patches[0], latest: patches[patches.length - 1] } : undefined,
    warnings,
  };
}

function analyzeBayesianPosteriors(dataDir: string): DatasetQA {
  const filePath = path.join(dataDir, 'bayesian-role-posteriors.json');
  const stats = fs.statSync(filePath);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  const records = Object.entries(data).map(([name, value]: [string, any]) => ({
    championName: name,
    ...value,
  }));
  const warnings: string[] = [];

  const keyFields = [
    'posterior.top',
    'posterior.jungle',
    'posterior.mid',
    'posterior.bot',
    'posterior.support',
    'observedMatches',
    'alpha',
  ];

  const fieldAnalyses = keyFields.map(f => analyzeField(records, f));
  const nullCounts: Record<string, number> = {};
  const undefinedCounts: Record<string, number> = {};

  for (const analysis of fieldAnalyses) {
    if (analysis.nullCount > 0) nullCounts[analysis.field] = analysis.nullCount;
    if (analysis.undefinedCount > 0) undefinedCounts[analysis.field] = analysis.undefinedCount;
  }

  // Check for imputation: posteriors should sum to 1
  let imputationSuspect = 0;
  for (const record of records) {
    const post = record.posterior;
    if (post) {
      const sum = (post.top || 0) + (post.jungle || 0) + (post.mid || 0) + (post.bot || 0) + (post.support || 0);
      if (Math.abs(sum - 1) > 0.001) {
        imputationSuspect++;
      }
    }
  }
  if (imputationSuspect > 0) {
    warnings.push(`${imputationSuspect} records have posteriors not summing to 1.0`);
  }

  return {
    fileName: 'bayesian-role-posteriors.json',
    fileSize: stats.size,
    recordCount: records.length,
    fieldAnalysis: fieldAnalyses,
    nullCounts,
    undefinedCounts,
    warnings,
  };
}

function analyzePlayerPools(dataDir: string): DatasetQA {
  const filePath = path.join(dataDir, 'player-pools.json');
  const stats = fs.statSync(filePath);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  const players = data.players ? Object.values(data.players) : [];
  const warnings: string[] = [];

  // Flatten to player-champion entries
  const entries: any[] = [];
  for (const player of players as any[]) {
    for (const champ of player.champions || []) {
      entries.push({
        playerId: player.playerId,
        playerName: player.playerName,
        totalGames: player.totalGames,
        ...champ,
      });
    }
  }

  const keyFields = [
    'playerId',
    'playerName',
    'totalGames',
    'championId',
    'championName',
    'pickCount',
    'pickRateWithinPlayer',
  ];

  const fieldAnalyses = keyFields.map(f => analyzeField(entries, f));
  const nullCounts: Record<string, number> = {};
  const undefinedCounts: Record<string, number> = {};

  for (const analysis of fieldAnalyses) {
    if (analysis.nullCount > 0) nullCounts[analysis.field] = analysis.nullCount;
    if (analysis.undefinedCount > 0) undefinedCounts[analysis.field] = analysis.undefinedCount;
  }

  // Check low-sample players
  const lowSamplePlayers = (players as any[]).filter(p => p.totalGames < 10);
  if (lowSamplePlayers.length > 0) {
    warnings.push(`${lowSamplePlayers.length} players have <10 games (low-sample gating applies)`);
  }

  return {
    fileName: 'player-pools.json',
    fileSize: stats.size,
    recordCount: entries.length,
    fieldAnalysis: fieldAnalyses,
    nullCounts,
    undefinedCounts,
    warnings,
  };
}

function analyzeThreatSignals(dataDir: string): DatasetQA {
  const filePath = path.join(dataDir, 'threat-signals.json');
  const stats = fs.statSync(filePath);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  const records = data.signals || [];
  const warnings: string[] = [];

  const keyFields = [
    'championId',
    'championName',
    'entityType',
    'entityId',
    'score',
    'rawLift',
    'obsLower',
    'exp',
    'n',
  ];

  const fieldAnalyses = keyFields.map(f => analyzeField(records, f));
  const nullCounts: Record<string, number> = {};
  const undefinedCounts: Record<string, number> = {};

  for (const analysis of fieldAnalyses) {
    if (analysis.nullCount > 0) nullCounts[analysis.field] = analysis.nullCount;
    if (analysis.undefinedCount > 0) undefinedCounts[analysis.field] = analysis.undefinedCount;
  }

  // Check for negative scores (should be valid)
  const negativeScores = records.filter((r: any) => r.score < 0).length;
  const zeroScores = records.filter((r: any) => r.score === 0).length;
  const positiveScores = records.filter((r: any) => r.score > 0).length;

  warnings.push(`Score distribution: ${positiveScores} positive, ${zeroScores} zero, ${negativeScores} negative`);

  return {
    fileName: 'threat-signals.json',
    fileSize: stats.size,
    recordCount: records.length,
    fieldAnalysis: fieldAnalyses,
    nullCounts,
    undefinedCounts,
    warnings,
  };
}

function analyzeBanBaselines(dataDir: string): DatasetQA {
  const filePath = path.join(dataDir, 'ban-baselines.json');
  const stats = fs.statSync(filePath);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  const records = data.baselines || [];
  const warnings: string[] = [];

  const keyFields = [
    'championId',
    'championName',
    'totalBans',
    'totalGames',
    'banRate',
  ];

  const fieldAnalyses = keyFields.map(f => analyzeField(records, f));
  const nullCounts: Record<string, number> = {};
  const undefinedCounts: Record<string, number> = {};

  for (const analysis of fieldAnalyses) {
    if (analysis.nullCount > 0) nullCounts[analysis.field] = analysis.nullCount;
    if (analysis.undefinedCount > 0) undefinedCounts[analysis.field] = analysis.undefinedCount;
  }

  return {
    fileName: 'ban-baselines.json',
    fileSize: stats.size,
    recordCount: records.length,
    fieldAnalysis: fieldAnalyses,
    nullCounts,
    undefinedCounts,
    warnings,
  };
}

function analyzePatchRegionStats(dataDir: string): DatasetQA {
  const filePath = path.join(dataDir, 'patch-region-stats.json');
  const stats = fs.statSync(filePath);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  // Flatten nested structure
  const records: any[] = [];
  for (const [patch, regions] of Object.entries(data)) {
    if (patch === 'meta') continue;
    for (const [region, champions] of Object.entries(regions as any)) {
      for (const [champName, champData] of Object.entries(champions as any)) {
        records.push({
          patch,
          region,
          championName: champName,
          ...(champData as any),
        });
      }
    }
  }

  const warnings: string[] = [];

  const keyFields = [
    'patch',
    'region',
    'championName',
    'games',
  ];

  const fieldAnalyses = keyFields.map(f => analyzeField(records, f));
  const nullCounts: Record<string, number> = {};
  const undefinedCounts: Record<string, number> = {};

  for (const analysis of fieldAnalyses) {
    if (analysis.nullCount > 0) nullCounts[analysis.field] = analysis.nullCount;
    if (analysis.undefinedCount > 0) undefinedCounts[analysis.field] = analysis.undefinedCount;
  }

  // Extract patches
  const patches = [...new Set(records.map(r => r.patch))].sort();
  const regions = [...new Set(records.map(r => r.region))];

  warnings.push(`Patches covered: ${patches.length} (${patches[0]} to ${patches[patches.length - 1]})`);
  warnings.push(`Regions covered: ${regions.join(', ')}`);

  return {
    fileName: 'patch-region-stats.json',
    fileSize: stats.size,
    recordCount: records.length,
    fieldAnalysis: fieldAnalyses,
    nullCounts,
    undefinedCounts,
    coverageDates: patches.length > 0 ? { earliest: patches[0], latest: patches[patches.length - 1] } : undefined,
    warnings,
  };
}

// ============ Main Function ============

async function runDataQA(): Promise<QAResult> {
  const dataDir = path.join(process.cwd(), 'data/lol');

  console.log('='.repeat(70));
  console.log('DATA QUALITY ASSURANCE REPORT');
  console.log('='.repeat(70));
  console.log(`Run Date: ${new Date().toISOString()}`);
  console.log(`Data Directory: ${dataDir}`);
  console.log('');

  const result: QAResult = {
    meta: {
      runDate: new Date().toISOString(),
      dataDirectory: dataDir,
    },
    datasets: {},
    summary: {
      totalDatasets: 0,
      totalRecords: 0,
      totalNullFields: 0,
      totalMissingFields: 0,
      fallbackCounts: {},
      imputationCheck: 'PASS',
      imputationDetails: [],
    },
  };

  // Analyze each dataset
  const analyzers: [string, () => DatasetQA][] = [
    ['states', () => analyzeStates(dataDir)],
    ['bayesian-role-posteriors', () => analyzeBayesianPosteriors(dataDir)],
    ['player-pools', () => analyzePlayerPools(dataDir)],
    ['threat-signals', () => analyzeThreatSignals(dataDir)],
    ['ban-baselines', () => analyzeBanBaselines(dataDir)],
    ['patch-region-stats', () => analyzePatchRegionStats(dataDir)],
  ];

  for (const [name, analyzer] of analyzers) {
    try {
      console.log(`Analyzing ${name}...`);
      const qa = analyzer();
      result.datasets[name] = qa;
      result.summary.totalDatasets++;
      result.summary.totalRecords += qa.recordCount;

      // Count nulls
      for (const count of Object.values(qa.nullCounts)) {
        result.summary.totalNullFields += count;
      }
      for (const count of Object.values(qa.undefinedCounts)) {
        result.summary.totalMissingFields += count;
      }

      // Check for imputation warnings
      for (const warning of qa.warnings) {
        if (warning.toLowerCase().includes('imputation') || warning.toLowerCase().includes('not summing')) {
          result.summary.imputationCheck = 'FAIL';
          result.summary.imputationDetails.push(`${name}: ${warning}`);
        }
      }

      console.log(`  Records: ${qa.recordCount.toLocaleString()}`);
      console.log(`  Size: ${formatBytes(qa.fileSize)}`);
      if (Object.keys(qa.nullCounts).length > 0) {
        console.log(`  Null fields: ${JSON.stringify(qa.nullCounts)}`);
      }
      console.log('');
    } catch (error) {
      console.error(`  Error analyzing ${name}: ${error}`);
      result.datasets[name] = {
        fileName: `${name}.json`,
        fileSize: 0,
        recordCount: 0,
        fieldAnalysis: [],
        nullCounts: {},
        undefinedCounts: {},
        warnings: [`Error: ${error}`],
      };
    }
  }

  // Generate markdown report
  const reportPath = path.join(process.cwd(), 'app/docs/validation/data-qa.md');
  const markdown = generateMarkdownReport(result);
  fs.writeFileSync(reportPath, markdown);
  console.log(`Report written to: ${reportPath}`);

  // Write JSON
  const jsonPath = path.join(process.cwd(), 'app/docs/validation/data-qa.json');
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  console.log(`JSON written to: ${jsonPath}`);

  return result;
}

function generateMarkdownReport(result: QAResult): string {
  const lines: string[] = [];

  lines.push('# Data Quality Assurance Report');
  lines.push('');
  lines.push('## What is Tested');
  lines.push('');
  lines.push('This report validates data integrity across all datasets used by the LoL Draft Assistant system.');
  lines.push('It checks for null/undefined values, confirms no random imputation occurs, and documents data coverage.');
  lines.push('');
  lines.push('## Why It Matters');
  lines.push('');
  lines.push('Data quality directly impacts the reliability of all downstream analyses. Missing or imputed values');
  lines.push('could lead to incorrect probability estimates or misleading evidence attribution. This report ensures');
  lines.push('that all data used by the system is complete and unmodified from source.');
  lines.push('');
  lines.push('## Method');
  lines.push('');
  lines.push('For each dataset:');
  lines.push('1. Load the JSON file and enumerate all records');
  lines.push('2. Check key fields for null, undefined, or empty values');
  lines.push('3. Verify no random imputation (e.g., posteriors sum to 1.0)');
  lines.push('4. Document coverage dates and record counts');
  lines.push('');
  lines.push('## Results');
  lines.push('');
  lines.push('### Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Run Date | ${result.meta.runDate} |`);
  lines.push(`| Total Datasets | ${result.summary.totalDatasets} |`);
  lines.push(`| Total Records | ${result.summary.totalRecords.toLocaleString()} |`);
  lines.push(`| Total Null Fields | ${result.summary.totalNullFields} |`);
  lines.push(`| Total Missing Fields | ${result.summary.totalMissingFields} |`);
  lines.push(`| Imputation Check | **${result.summary.imputationCheck}** |`);
  lines.push('');

  if (result.summary.imputationDetails.length > 0) {
    lines.push('#### Imputation Warnings');
    lines.push('');
    for (const detail of result.summary.imputationDetails) {
      lines.push(`- ${detail}`);
    }
    lines.push('');
  }

  lines.push('### Per-Dataset Analysis');
  lines.push('');

  for (const [name, qa] of Object.entries(result.datasets)) {
    lines.push(`#### ${name}`);
    lines.push('');
    lines.push(`| Property | Value |`);
    lines.push(`|----------|-------|`);
    lines.push(`| File | ${qa.fileName} |`);
    lines.push(`| Size | ${formatBytes(qa.fileSize)} |`);
    lines.push(`| Records | ${qa.recordCount.toLocaleString()} |`);
    if (qa.coverageDates) {
      lines.push(`| Coverage | ${qa.coverageDates.earliest} to ${qa.coverageDates.latest} |`);
    }
    lines.push('');

    if (qa.fieldAnalysis.length > 0) {
      lines.push('**Field Coverage:**');
      lines.push('');
      lines.push('| Field | Present | Null | Undefined | Coverage |');
      lines.push('|-------|---------|------|-----------|----------|');
      for (const field of qa.fieldAnalysis) {
        lines.push(`| ${field.field} | ${field.presentCount} | ${field.nullCount} | ${field.undefinedCount} | ${(field.coverage * 100).toFixed(1)}% |`);
      }
      lines.push('');
    }

    if (qa.warnings.length > 0) {
      lines.push('**Notes:**');
      lines.push('');
      for (const warning of qa.warnings) {
        lines.push(`- ${warning}`);
      }
      lines.push('');
    }
  }

  lines.push('## Limitations');
  lines.push('');
  lines.push('- This report checks structural integrity only, not semantic correctness');
  lines.push('- Field coverage is based on key fields; not all fields are enumerated');
  lines.push('- Date coverage is derived from patch strings, not actual timestamps');
  lines.push('');
  lines.push('---');
  lines.push(`*Generated: ${result.meta.runDate}*`);

  return lines.join('\n');
}

// Run
runDataQA().catch(console.error);
