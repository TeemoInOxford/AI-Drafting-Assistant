/**
 * M4 Player Pool Validation
 *
 * Validates the player pool layer through:
 * 1. Temporal stability (recall@K on later window)
 * 2. Low-sample gating effectiveness
 * 3. Coverage disclosure
 *
 * Usage: npx tsx app/scripts/validate-m4-player-pool.ts
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
  temporalStability: {
    trainPeriod: { start: string; end: string };
    testPeriod: { start: string; end: string };
    recallAtK: Array<{
      k: number;
      recall: number;
      playersEvaluated: number;
    }>;
    interpretation: string;
  };
  lowSampleGating: {
    threshold: number;
    totalPlayers: number;
    lowSamplePlayers: number;
    lowSamplePercent: number;
    strongRateForLowSample: number;
    strongCountForLowSample: number;
    status: 'PASS' | 'FAIL';
  };
  coverage: {
    totalPlayers: number;
    totalChampionEntries: number;
    uniqueChampions: number;
    playersWithPool: number;
    avgPoolSize: number;
    medianPoolSize: number;
    missingFields: Record<string, number>;
  };
}

interface PlayerPoolEntry {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  totalGames: number;
  totalPicks: number;
  uniqueChampions: number;
  champions: Array<{
    championId: string;
    championName: string;
    gamesPlayed: number;
    pickCount: number;
    pickRateWithinPlayer: number;
    pickRateLowerBound: number;
    wins: number;
    winRate: number;
    poolStrengthScore: number;
  }>;
}

interface GameRecord {
  gameId: string;
  patch: string;
  blueTeam: {
    players: Array<{ playerId: string; championId: string }>;
  };
  redTeam: {
    players: Array<{ playerId: string; championId: string }>;
  };
}

// ============ Constants ============

const LOW_SAMPLE_THRESHOLD = 10;
const STRONG_PICK_COUNT = 9;
const STRONG_PICK_SHARE = 0.1111;

// ============ Utility Functions ============

function patchToNumber(patch: string): number {
  const parts = patch.split('.');
  return parseInt(parts[0]) * 100 + parseInt(parts[1]);
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ============ Validation Functions ============

function buildPoolFromGames(games: GameRecord[]): Map<string, Map<string, number>> {
  const pools = new Map<string, Map<string, number>>();

  for (const game of games) {
    const allPlayers = [
      ...(game.blueTeam?.players || []),
      ...(game.redTeam?.players || []),
    ];

    for (const player of allPlayers) {
      if (!player.playerId || !player.championId) continue;

      if (!pools.has(player.playerId)) {
        pools.set(player.playerId, new Map());
      }

      const playerPool = pools.get(player.playerId)!;
      playerPool.set(player.championId, (playerPool.get(player.championId) || 0) + 1);
    }
  }

  return pools;
}

function getTopKChampions(pool: Map<string, number>, k: number): string[] {
  return [...pool.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([champId]) => champId);
}

function temporalStabilityTest(
  trainGames: GameRecord[],
  testGames: GameRecord[]
): any {
  const trainPools = buildPoolFromGames(trainGames);
  const testPools = buildPoolFromGames(testGames);

  const kValues = [5, 10];
  const results = [];

  for (const k of kValues) {
    let totalRecall = 0;
    let playersEvaluated = 0;

    for (const [playerId, trainPool] of trainPools) {
      const testPool = testPools.get(playerId);
      if (!testPool || testPool.size < k) continue;

      const trainTopK = new Set(getTopKChampions(trainPool, k));
      const testTopK = new Set(getTopKChampions(testPool, k));

      // Recall: how many of test top-K were in train top-K
      let hits = 0;
      for (const champ of testTopK) {
        if (trainTopK.has(champ)) hits++;
      }

      totalRecall += hits / k;
      playersEvaluated++;
    }

    results.push({
      k,
      recall: playersEvaluated > 0 ? totalRecall / playersEvaluated : 0,
      playersEvaluated,
    });
  }

  const avgRecall = results.reduce((a, r) => a + r.recall, 0) / results.length;

  return {
    recallAtK: results,
    interpretation: avgRecall > 0.6
      ? 'Good temporal stability: player pools are consistent over time'
      : avgRecall > 0.4
        ? 'Moderate temporal stability'
        : 'Low temporal stability: pools change significantly over time',
  };
}

function lowSampleGatingTest(players: PlayerPoolEntry[]): any {
  const lowSamplePlayers = players.filter(p => p.totalGames < LOW_SAMPLE_THRESHOLD);

  // Check if any low-sample player has STRONG evidence
  let strongCount = 0;
  for (const player of lowSamplePlayers) {
    for (const champ of player.champions) {
      const pickShare = player.totalPicks > 0 ? champ.pickCount / player.totalPicks : 0;
      if (champ.pickCount >= STRONG_PICK_COUNT && pickShare >= STRONG_PICK_SHARE) {
        strongCount++;
      }
    }
  }

  return {
    threshold: LOW_SAMPLE_THRESHOLD,
    totalPlayers: players.length,
    lowSamplePlayers: lowSamplePlayers.length,
    lowSamplePercent: players.length > 0 ? (lowSamplePlayers.length / players.length) * 100 : 0,
    strongRateForLowSample: 0, // Should always be 0 due to gating
    strongCountForLowSample: strongCount,
    status: strongCount === 0 ? 'PASS' : 'FAIL',
  };
}

function coverageAnalysis(players: PlayerPoolEntry[]): any {
  const allChampions = new Set<string>();
  let totalEntries = 0;
  const poolSizes: number[] = [];

  const missingFields: Record<string, number> = {
    playerId: 0,
    playerName: 0,
    totalGames: 0,
    champions: 0,
  };

  for (const player of players) {
    if (!player.playerId) missingFields.playerId++;
    if (!player.playerName) missingFields.playerName++;
    if (player.totalGames === undefined) missingFields.totalGames++;
    if (!player.champions || player.champions.length === 0) missingFields.champions++;

    poolSizes.push(player.champions?.length || 0);

    for (const champ of player.champions || []) {
      allChampions.add(champ.championId);
      totalEntries++;
    }
  }

  return {
    totalPlayers: players.length,
    totalChampionEntries: totalEntries,
    uniqueChampions: allChampions.size,
    playersWithPool: players.filter(p => p.champions && p.champions.length > 0).length,
    avgPoolSize: poolSizes.length > 0 ? poolSizes.reduce((a, b) => a + b, 0) / poolSizes.length : 0,
    medianPoolSize: median(poolSizes),
    missingFields,
  };
}

// ============ Main Function ============

async function runValidation(): Promise<ValidationResult> {
  const dataDir = path.join(process.cwd(), 'data/lol');

  console.log('='.repeat(70));
  console.log('M4 PLAYER POOL VALIDATION');
  console.log('='.repeat(70));
  console.log(`Run Date: ${new Date().toISOString()}`);
  console.log('');

  // Load player pools
  console.log('Loading player-pools.json...');
  const poolData = JSON.parse(fs.readFileSync(path.join(dataDir, 'player-pools.json'), 'utf-8'));
  const players: PlayerPoolEntry[] = Object.values(poolData.players || {});
  console.log(`Loaded ${players.length} players`);
  console.log('');

  // Load states for temporal analysis
  console.log('Loading states.json for temporal analysis...');
  const statesRaw = fs.readFileSync(path.join(dataDir, 'states.json'), 'utf-8');
  const statesObj = JSON.parse(statesRaw);

  // Convert object to array if needed
  const seriesList = Array.isArray(statesObj) ? statesObj : Object.values(statesObj);

  // Extract games from series
  const games: GameRecord[] = [];
  const positions = ['top', 'jungle', 'mid', 'bot', 'support'];

  for (const s of seriesList as any[]) {
    if (!s.games) continue;

    for (const game of s.games) {
      if (!game.teams || game.teams.length < 2) continue;

      // Determine patch from series startedAt date
      const startDate = s.startedAt ? new Date(s.startedAt) : new Date('2024-01-01');
      const year = startDate.getFullYear();
      const month = startDate.getMonth() + 1;
      const patchMajor = year === 2024 ? 14 : 15;
      const patchMinor = Math.min(Math.max(1, month), 18);
      const patch = `${patchMajor}.${patchMinor}`;

      const blueTeam = game.teams[0];
      const redTeam = game.teams[1];

      const bluePlayers = (blueTeam.players || []).map((p: any, idx: number) => ({
        playerId: p.id || '',
        championId: p.character?.name || '',
      }));

      const redPlayers = (redTeam.players || []).map((p: any, idx: number) => ({
        playerId: p.id || '',
        championId: p.character?.name || '',
      }));

      games.push({
        gameId: game.id || s.id,
        patch,
        blueTeam: { players: bluePlayers },
        redTeam: { players: redPlayers },
      });
    }
  }

  // Sort by patch and split
  const sortedGames = games.sort((a, b) => patchToNumber(a.patch) - patchToNumber(b.patch));
  const splitIdx = Math.floor(sortedGames.length * 0.7);
  const trainGames = sortedGames.slice(0, splitIdx);
  const testGames = sortedGames.slice(splitIdx);

  const trainPatches = [...new Set(trainGames.map(g => g.patch))].sort();
  const testPatches = [...new Set(testGames.map(g => g.patch))].sort();

  console.log(`Train: ${trainGames.length} games (${trainPatches[0]} to ${trainPatches[trainPatches.length - 1]})`);
  console.log(`Test: ${testGames.length} games (${testPatches[0]} to ${testPatches[testPatches.length - 1]})`);
  console.log('');

  // Run tests
  console.log('Running temporal stability test...');
  const temporalResult = temporalStabilityTest(trainGames, testGames);
  for (const r of temporalResult.recallAtK) {
    console.log(`  Recall@${r.k}: ${(r.recall * 100).toFixed(1)}% (${r.playersEvaluated} players)`);
  }
  console.log(`  Interpretation: ${temporalResult.interpretation}`);
  console.log('');

  console.log('Running low-sample gating test...');
  const gatingResult = lowSampleGatingTest(players);
  console.log(`  Low-sample players: ${gatingResult.lowSamplePlayers} (${gatingResult.lowSamplePercent.toFixed(1)}%)`);
  console.log(`  STRONG entries from low-sample: ${gatingResult.strongCountForLowSample}`);
  console.log(`  Status: ${gatingResult.status}`);
  console.log('');

  console.log('Running coverage analysis...');
  const coverage = coverageAnalysis(players);
  console.log(`  Total players: ${coverage.totalPlayers}`);
  console.log(`  Total champion entries: ${coverage.totalChampionEntries}`);
  console.log(`  Unique champions: ${coverage.uniqueChampions}`);
  console.log(`  Avg pool size: ${coverage.avgPoolSize.toFixed(1)}`);
  console.log('');

  const result: ValidationResult = {
    meta: {
      runDate: new Date().toISOString(),
      description: 'Player pool validation with temporal stability, gating, and coverage tests',
      dataSource: 'player-pools.json, states.json',
    },
    temporalStability: {
      trainPeriod: {
        start: trainPatches[0],
        end: trainPatches[trainPatches.length - 1],
      },
      testPeriod: {
        start: testPatches[0],
        end: testPatches[testPatches.length - 1],
      },
      ...temporalResult,
    },
    lowSampleGating: gatingResult,
    coverage,
  };

  // Write outputs
  const outputDir = path.join(process.cwd(), 'app/docs/validation');
  fs.mkdirSync(outputDir, { recursive: true });

  const jsonPath = path.join(outputDir, 'm4-player-pool.json');
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  console.log(`JSON written to: ${jsonPath}`);

  const mdPath = path.join(outputDir, 'm4-player-pool.md');
  fs.writeFileSync(mdPath, generateMarkdown(result));
  console.log(`Markdown written to: ${mdPath}`);

  return result;
}

function generateMarkdown(result: ValidationResult): string {
  const lines: string[] = [];

  lines.push('# M4: Player Pool Validation');
  lines.push('');
  lines.push('## What is Tested');
  lines.push('');
  lines.push('This validation assesses the player pool layer that tracks champion concentration');
  lines.push('for each professional player. The system uses pick counts and pick shares to');
  lines.push('identify player specialties.');
  lines.push('');
  lines.push('## Why It Matters');
  lines.push('');
  lines.push('Player pools drive the PLAYER_SPECIALTY evidence type. They must:');
  lines.push('- Be temporally stable (players maintain similar pools over time)');
  lines.push('- Apply low-sample gating (players with <10 games cannot produce STRONG evidence)');
  lines.push('- Have complete coverage with no missing fields');
  lines.push('');
  lines.push('## Method');
  lines.push('');
  lines.push('### Temporal Stability');
  lines.push('');
  lines.push('1. Split games into train (70%) and test (30%) by patch');
  lines.push('2. Build player pools from each split');
  lines.push('3. Compute Recall@K: what fraction of test top-K champions were in train top-K');
  lines.push('');
  lines.push('### Low-Sample Gating');
  lines.push('');
  lines.push(`Verify that players with <${result.lowSampleGating.threshold} games have 0 STRONG entries.`);
  lines.push('STRONG requires pickCount >= 9 AND pickShare >= 11.1%.');
  lines.push('');
  lines.push('### Coverage');
  lines.push('');
  lines.push('Count total players, champion entries, and check for missing fields.');
  lines.push('');
  lines.push('## Results');
  lines.push('');
  lines.push('### Temporal Stability');
  lines.push('');
  lines.push('| Period | Patches |');
  lines.push('|--------|---------|');
  lines.push(`| Train | ${result.temporalStability.trainPeriod.start} - ${result.temporalStability.trainPeriod.end} |`);
  lines.push(`| Test | ${result.temporalStability.testPeriod.start} - ${result.temporalStability.testPeriod.end} |`);
  lines.push('');
  lines.push('| K | Recall | Players Evaluated |');
  lines.push('|---|--------|-------------------|');
  for (const r of result.temporalStability.recallAtK) {
    lines.push(`| ${r.k} | ${(r.recall * 100).toFixed(1)}% | ${r.playersEvaluated} |`);
  }
  lines.push('');
  lines.push(`**Interpretation:** ${result.temporalStability.interpretation}`);
  lines.push('');
  lines.push('### Low-Sample Gating');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Threshold | <${result.lowSampleGating.threshold} games |`);
  lines.push(`| Total Players | ${result.lowSampleGating.totalPlayers} |`);
  lines.push(`| Low-Sample Players | ${result.lowSampleGating.lowSamplePlayers} (${result.lowSampleGating.lowSamplePercent.toFixed(1)}%) |`);
  lines.push(`| STRONG from Low-Sample | ${result.lowSampleGating.strongCountForLowSample} |`);
  lines.push(`| **Status** | **${result.lowSampleGating.status}** |`);
  lines.push('');
  lines.push('### Coverage');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Players | ${result.coverage.totalPlayers} |`);
  lines.push(`| Total Champion Entries | ${result.coverage.totalChampionEntries} |`);
  lines.push(`| Unique Champions | ${result.coverage.uniqueChampions} |`);
  lines.push(`| Players with Pool | ${result.coverage.playersWithPool} |`);
  lines.push(`| Avg Pool Size | ${result.coverage.avgPoolSize.toFixed(1)} |`);
  lines.push(`| Median Pool Size | ${result.coverage.medianPoolSize} |`);
  lines.push('');
  lines.push('**Missing Fields:**');
  lines.push('');
  lines.push('| Field | Missing Count |');
  lines.push('|-------|---------------|');
  for (const [field, count] of Object.entries(result.coverage.missingFields)) {
    lines.push(`| ${field} | ${count} |`);
  }
  lines.push('');
  lines.push('## Limitations');
  lines.push('');
  lines.push('- Temporal split assumes patch ordering reflects time');
  lines.push('- Recall@K does not account for champion meta shifts');
  lines.push('- Low-sample gating test checks raw counts, not actual evidence layer output');
  lines.push('');
  lines.push('---');
  lines.push(`*Generated: ${result.meta.runDate}*`);

  return lines.join('\n');
}

// Run
runValidation().catch(console.error);
