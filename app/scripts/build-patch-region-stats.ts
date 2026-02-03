/**
 * Build Patch and Region Statistics for Role Adjustment
 *
 * This script extracts patch and region-specific role frequencies
 * to enable lightweight adjustment of the base Bayesian posteriors.
 */

import fs from 'fs';
import path from 'path';
import { CHAMPION_POSITIONS } from '../lib/positions';

type Position = 'top' | 'jungle' | 'mid' | 'bot' | 'support';

interface MatchRecord {
  seriesId: string;
  gameId: string;
  date: Date;
  patch: string;
  region: string;
  playerId: string;
  playerName: string;
  championName: string;
  inferredPosition: Position;
}

// LOL Patch version mapping (2024-2025)
// Based on https://leagueoflegends.fandom.com/wiki/Patch_(League_of_Legends)
const PATCH_TIMELINE: Array<{ start: Date; end: Date; version: string }> = [
  { start: new Date('2024-01-10'), end: new Date('2024-01-23'), version: '14.1' },
  { start: new Date('2024-01-24'), end: new Date('2024-02-06'), version: '14.2' },
  { start: new Date('2024-02-07'), end: new Date('2024-02-20'), version: '14.3' },
  { start: new Date('2024-02-21'), end: new Date('2024-03-05'), version: '14.4' },
  { start: new Date('2024-03-06'), end: new Date('2024-03-19'), version: '14.5' },
  { start: new Date('2024-03-20'), end: new Date('2024-04-02'), version: '14.6' },
  { start: new Date('2024-04-03'), end: new Date('2024-04-16'), version: '14.7' },
  { start: new Date('2024-04-17'), end: new Date('2024-04-30'), version: '14.8' },
  { start: new Date('2024-05-01'), end: new Date('2024-05-14'), version: '14.9' },
  { start: new Date('2024-05-15'), end: new Date('2024-05-28'), version: '14.10' },
  { start: new Date('2024-05-29'), end: new Date('2024-06-11'), version: '14.11' },
  { start: new Date('2024-06-12'), end: new Date('2024-06-25'), version: '14.12' },
  { start: new Date('2024-06-26'), end: new Date('2024-07-16'), version: '14.13' },
  { start: new Date('2024-07-17'), end: new Date('2024-07-30'), version: '14.14' },
  { start: new Date('2024-07-31'), end: new Date('2024-08-13'), version: '14.15' },
  { start: new Date('2024-08-14'), end: new Date('2024-08-27'), version: '14.16' },
  { start: new Date('2024-08-28'), end: new Date('2024-09-10'), version: '14.17' },
  { start: new Date('2024-09-11'), end: new Date('2024-09-24'), version: '14.18' },
  { start: new Date('2024-09-25'), end: new Date('2024-10-08'), version: '14.19' },
  { start: new Date('2024-10-09'), end: new Date('2024-10-22'), version: '14.20' },
  { start: new Date('2024-10-23'), end: new Date('2024-11-05'), version: '14.21' },
  { start: new Date('2024-11-06'), end: new Date('2024-11-19'), version: '14.22' },
  { start: new Date('2024-11-20'), end: new Date('2024-12-10'), version: '14.23' },
  { start: new Date('2024-12-11'), end: new Date('2025-01-07'), version: '14.24' },
  { start: new Date('2025-01-08'), end: new Date('2025-01-21'), version: '15.1' },
  { start: new Date('2025-01-22'), end: new Date('2025-02-04'), version: '15.2' },
  { start: new Date('2025-02-05'), end: new Date('2025-02-18'), version: '15.3' },
  { start: new Date('2025-02-19'), end: new Date('2025-03-04'), version: '15.4' },
  { start: new Date('2025-03-05'), end: new Date('2025-03-18'), version: '15.5' },
  { start: new Date('2025-03-19'), end: new Date('2025-04-01'), version: '15.6' },
  { start: new Date('2025-04-02'), end: new Date('2025-04-15'), version: '15.7' },
  { start: new Date('2025-04-16'), end: new Date('2025-04-29'), version: '15.8' },
  { start: new Date('2025-04-30'), end: new Date('2025-05-13'), version: '15.9' },
  { start: new Date('2025-05-14'), end: new Date('2025-05-27'), version: '15.10' },
  { start: new Date('2025-05-28'), end: new Date('2025-06-10'), version: '15.11' },
  { start: new Date('2025-06-11'), end: new Date('2025-06-24'), version: '15.12' },
  { start: new Date('2025-06-25'), end: new Date('2025-07-15'), version: '15.13' },
  { start: new Date('2025-07-16'), end: new Date('2025-07-29'), version: '15.14' },
  { start: new Date('2025-07-30'), end: new Date('2025-08-12'), version: '15.15' },
  { start: new Date('2025-08-13'), end: new Date('2025-08-26'), version: '15.16' },
  { start: new Date('2025-08-27'), end: new Date('2025-09-09'), version: '15.17' },
  { start: new Date('2025-09-10'), end: new Date('2025-09-30'), version: '15.18' },
];

// Region extraction from tournament names
const REGION_PATTERNS: Array<{ pattern: RegExp; region: string }> = [
  { pattern: /LCK|Korea/i, region: 'LCK' },
  { pattern: /LPL|China/i, region: 'LPL' },
  { pattern: /LEC|Europe/i, region: 'LEC' },
  { pattern: /LCS|North America/i, region: 'LCS' },
  { pattern: /LTA|Latin America/i, region: 'LTA' },
  { pattern: /PCS|Pacific/i, region: 'PCS' },
  { pattern: /VCS|Vietnam/i, region: 'VCS' },
  { pattern: /CBLOL|Brazil/i, region: 'CBLOL' },
  { pattern: /LJL|Japan/i, region: 'LJL' },
  { pattern: /TCL|Turkey/i, region: 'TCL' },
  { pattern: /Worlds|MSI|International/i, region: 'International' },
];

function getPatchVersion(date: Date): string {
  for (const patch of PATCH_TIMELINE) {
    if (date >= patch.start && date <= patch.end) {
      return patch.version;
    }
  }
  // Default to closest patch
  if (date < PATCH_TIMELINE[0].start) return PATCH_TIMELINE[0].version;
  return PATCH_TIMELINE[PATCH_TIMELINE.length - 1].version;
}

function extractRegion(tournamentName: string): string {
  for (const { pattern, region } of REGION_PATTERNS) {
    if (pattern.test(tournamentName)) {
      return region;
    }
  }
  return 'Other';
}

function loadMatchData(): MatchRecord[] {
  console.log('Loading match data with patch and region info...');

  const statesPath = path.join(process.cwd(), 'data/lol/states.json');
  const seriesPath = path.join(process.cwd(), 'data/lol/series.json');

  const states = JSON.parse(fs.readFileSync(statesPath, 'utf-8'));
  const seriesList = JSON.parse(fs.readFileSync(seriesPath, 'utf-8'));

  // Build series metadata map
  const seriesMetadata = new Map<string, { tournament: string }>();
  for (const series of seriesList) {
    seriesMetadata.set(series.id, {
      tournament: series.tournament?.name || 'Unknown',
    });
  }

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

  // Infer player positions
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

  // Second pass: create match records with patch and region
  for (const seriesId in states) {
    const series = states[seriesId];
    if (!series.games || !series.startedAt) continue;

    const date = new Date(series.startedAt);
    const patch = getPatchVersion(date);
    const metadata = seriesMetadata.get(seriesId);
    const region = metadata ? extractRegion(metadata.tournament) : 'Other';

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
            patch,
            region,
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

interface ChampionRoleStats {
  championName: string;
  global: Record<Position, number>;
  byPatch: Record<string, Record<Position, number>>;
  byRegion: Record<string, Record<Position, number>>;
  totalGames: number;
  gamesByPatch: Record<string, number>;
  gamesByRegion: Record<string, number>;
}

function buildStatistics(records: MatchRecord[]): Map<string, ChampionRoleStats> {
  console.log('\nBuilding patch and region statistics...');

  const stats = new Map<string, ChampionRoleStats>();

  for (const record of records) {
    if (!stats.has(record.championName)) {
      stats.set(record.championName, {
        championName: record.championName,
        global: { top: 0, jungle: 0, mid: 0, bot: 0, support: 0 },
        byPatch: {},
        byRegion: {},
        totalGames: 0,
        gamesByPatch: {},
        gamesByRegion: {},
      });
    }

    const championStats = stats.get(record.championName)!;

    // Global stats
    championStats.global[record.inferredPosition]++;
    championStats.totalGames++;

    // Patch stats
    if (!championStats.byPatch[record.patch]) {
      championStats.byPatch[record.patch] = { top: 0, jungle: 0, mid: 0, bot: 0, support: 0 };
      championStats.gamesByPatch[record.patch] = 0;
    }
    championStats.byPatch[record.patch][record.inferredPosition]++;
    championStats.gamesByPatch[record.patch]++;

    // Region stats
    if (!championStats.byRegion[record.region]) {
      championStats.byRegion[record.region] = { top: 0, jungle: 0, mid: 0, bot: 0, support: 0 };
      championStats.gamesByRegion[record.region] = 0;
    }
    championStats.byRegion[record.region][record.inferredPosition]++;
    championStats.gamesByRegion[record.region]++;
  }

  // Convert counts to frequencies
  for (const [championName, championStats] of stats) {
    // Global frequencies
    for (const pos of ['top', 'jungle', 'mid', 'bot', 'support'] as Position[]) {
      championStats.global[pos] /= championStats.totalGames;
    }

    // Patch frequencies
    for (const patch in championStats.byPatch) {
      const total = championStats.gamesByPatch[patch];
      for (const pos of ['top', 'jungle', 'mid', 'bot', 'support'] as Position[]) {
        championStats.byPatch[patch][pos] /= total;
      }
    }

    // Region frequencies
    for (const region in championStats.byRegion) {
      const total = championStats.gamesByRegion[region];
      for (const pos of ['top', 'jungle', 'mid', 'bot', 'support'] as Position[]) {
        championStats.byRegion[region][pos] /= total;
      }
    }
  }

  console.log(`  ${stats.size} unique champions`);

  // Print sample statistics
  const sampleChampion = Array.from(stats.values())[0];
  console.log(`\nSample (${sampleChampion.championName}):`);
  console.log(`  Total games: ${sampleChampion.totalGames}`);
  console.log(`  Patches: ${Object.keys(sampleChampion.byPatch).length}`);
  console.log(`  Regions: ${Object.keys(sampleChampion.byRegion).length}`);

  return stats;
}

async function main() {
  console.log('=== PATCH AND REGION STATISTICS BUILDER ===\n');

  const records = loadMatchData();
  const stats = buildStatistics(records);

  // Convert to JSON-friendly format
  const output: Record<string, any> = {};
  for (const [championName, championStats] of stats) {
    output[championName] = {
      global: championStats.global,
      byPatch: championStats.byPatch,
      byRegion: championStats.byRegion,
      totalGames: championStats.totalGames,
      gamesByPatch: championStats.gamesByPatch,
      gamesByRegion: championStats.gamesByRegion,
    };
  }

  // Save to file
  const outputPath = path.join(process.cwd(), 'data/lol/patch-region-stats.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\n✓ Saved to ${outputPath}`);
  console.log(`  ${Object.keys(output).length} champions with patch/region statistics`);

  // Print summary
  const patches = new Set<string>();
  const regions = new Set<string>();
  for (const championStats of Object.values(output)) {
    Object.keys(championStats.byPatch).forEach(p => patches.add(p));
    Object.keys(championStats.byRegion).forEach(r => regions.add(r));
  }

  console.log(`\nCoverage:`);
  console.log(`  Patches: ${Array.from(patches).sort().join(', ')}`);
  console.log(`  Regions: ${Array.from(regions).sort().join(', ')}`);

  console.log('\n=== COMPLETE ===\n');
}

main().catch(console.error);
