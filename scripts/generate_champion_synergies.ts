#!/usr/bin/env npx tsx
/**
 * Generate Champion Synergies
 *
 * Computes pair synergy (two-champion combinations) from series_*.json game data.
 * Uses beta/gamma weighting for time decay and patch maturity.
 *
 * Output: data/grid_v2/champion_synergies.json
 *
 * Usage: npx tsx scripts/generate_champion_synergies.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Configuration
// ============================================================================

const BETA = 0.5; // Time decay factor per patch
const GAMMA = 2; // Patch maturity factor
const TARGET_PATCH_INDEX = 1518; // 15.18
const MIN_GAMES_WEIGHTED = 3; // Minimum weighted games to include pair
const MIN_SAMPLE_SIZE = 5; // Minimum raw sample size

// ============================================================================
// Types
// ============================================================================

interface DraftAction {
  id: string;
  type: 'ban' | 'pick';
  sequenceNumber: string;
  drafter: { id: string; type: string };
  draftable: { id: string; type: string; name: string };
}

interface GameTeam {
  id: string;
  name: string;
  side: 'blue' | 'red';
  won: boolean;
  players: Array<{
    id: string;
    name: string;
    character?: { id: string; name: string };
  }>;
}

interface Game {
  id: string;
  teams: GameTeam[];
  draftActions?: DraftAction[];
  startedAt?: string;
}

interface Series {
  id: string;
  startedAt?: string;
  games: Game[];
}

interface PairStats {
  wins: number;
  total: number;
  weightedWins: number;
  weightedTotal: number;
}

interface SynergyEntry {
  champions: [string, string];
  side: 'BLUE' | 'RED' | 'ANY';
  games_weighted: number;
  win_rate_weighted: number;
  lift: number;
  sample_size: number;
}

// ============================================================================
// Utility Functions
// ============================================================================

function getPatchIndexFromDate(dateStr: string): number {
  // Simplified: estimate patch from date
  // Patch 14.1 started ~Jan 2024
  // Each patch is ~2 weeks
  const date = new Date(dateStr);
  const baseDate = new Date('2024-01-10'); // Patch 14.1
  const daysDiff = Math.floor((date.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
  const patchesSince = Math.floor(daysDiff / 14);

  // Calculate patch: 14.1 + patches
  const basePatch = 1401;
  let patch = basePatch + patchesSince;

  // Handle season rollover (14.24 -> 15.1)
  const major = Math.floor(patch / 100);
  const minor = patch % 100;
  if (minor > 24) {
    patch = (major + 1) * 100 + (minor - 24);
  }

  return Math.min(patch, TARGET_PATCH_INDEX);
}

function calculateWeight(patchIndex: number): number {
  const deltaPatch = Math.min(TARGET_PATCH_INDEX - patchIndex, 16);
  const betaWeight = Math.pow(BETA, deltaPatch);

  // Maturity: patches closer to start of season have less data
  const patchInSeason = patchIndex % 100;
  const maturity = Math.min(patchInSeason / GAMMA, 1);

  return betaWeight * Math.max(maturity, 0.1);
}

function generatePairs(champions: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  const sorted = [...champions].sort();

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      pairs.push([sorted[i], sorted[j]]);
    }
  }

  return pairs;
}

function pairKey(pair: [string, string], side: string): string {
  return `${pair[0]}|${pair[1]}|${side}`;
}

// ============================================================================
// Main Processing
// ============================================================================

async function main() {
  const dataDir = path.join(process.cwd(), 'data', 'grid_v2');
  const seriesFiles = fs.readdirSync(dataDir).filter(f => f.startsWith('series_') && f.endsWith('.json'));

  console.log(`Found ${seriesFiles.length} series files`);
  console.log(`Using BETA=${BETA}, GAMMA=${GAMMA}, TARGET_PATCH=${TARGET_PATCH_INDEX}`);

  // Aggregation maps
  const pairStats = new Map<string, PairStats>();
  const championGames = new Map<string, { wins: number; total: number; weightedWins: number; weightedTotal: number }>();

  let processedGames = 0;
  let skippedGames = 0;

  for (const file of seriesFiles) {
    try {
      const filePath = path.join(dataDir, file);
      const series: Series = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const seriesDate = series.startedAt || '';
      const patchIndex = getPatchIndexFromDate(seriesDate);
      const weight = calculateWeight(patchIndex);

      for (const game of series.games || []) {
        // Get both teams' rosters
        if (!game.teams || game.teams.length !== 2) {
          skippedGames++;
          continue;
        }

        for (const team of game.teams) {
          // Extract champions from players
          const champions: string[] = [];
          for (const player of team.players || []) {
            if (player.character?.name) {
              champions.push(player.character.name);
            }
          }

          if (champions.length !== 5) {
            continue; // Incomplete roster
          }

          const won = team.won;
          const side = team.side?.toUpperCase() || 'ANY';

          // Update champion base rates
          for (const champ of champions) {
            if (!championGames.has(champ)) {
              championGames.set(champ, { wins: 0, total: 0, weightedWins: 0, weightedTotal: 0 });
            }
            const stats = championGames.get(champ)!;
            stats.total++;
            stats.weightedTotal += weight;
            if (won) {
              stats.wins++;
              stats.weightedWins += weight;
            }
          }

          // Generate all pairs
          const pairs = generatePairs(champions);

          for (const pair of pairs) {
            // Track by side and ANY
            for (const s of [side, 'ANY']) {
              const key = pairKey(pair, s);
              if (!pairStats.has(key)) {
                pairStats.set(key, { wins: 0, total: 0, weightedWins: 0, weightedTotal: 0 });
              }
              const stats = pairStats.get(key)!;
              stats.total++;
              stats.weightedTotal += weight;
              if (won) {
                stats.wins++;
                stats.weightedWins += weight;
              }
            }
          }

          processedGames++;
        }
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }

  console.log(`\nProcessed ${processedGames} team-games, skipped ${skippedGames}`);
  console.log(`Found ${pairStats.size} unique pair-side combinations`);
  console.log(`Found ${championGames.size} unique champions`);

  // Calculate global average win rate
  let totalWeightedWins = 0;
  let totalWeightedGames = 0;
  for (const stats of championGames.values()) {
    totalWeightedWins += stats.weightedWins;
    totalWeightedGames += stats.weightedTotal;
  }
  const globalWinRate = totalWeightedWins / totalWeightedGames; // Should be ~0.5

  // Convert to output format with filtering
  const entries: SynergyEntry[] = [];

  for (const [key, stats] of pairStats) {
    if (stats.weightedTotal < MIN_GAMES_WEIGHTED || stats.total < MIN_SAMPLE_SIZE) {
      continue;
    }

    const [champ1, champ2, side] = key.split('|');
    const winRateWeighted = stats.weightedTotal > 0 ? stats.weightedWins / stats.weightedTotal : 0;

    // Calculate expected win rate based on individual champion rates
    const champ1Stats = championGames.get(champ1);
    const champ2Stats = championGames.get(champ2);
    const champ1WR = champ1Stats && champ1Stats.weightedTotal > 0
      ? champ1Stats.weightedWins / champ1Stats.weightedTotal
      : globalWinRate;
    const champ2WR = champ2Stats && champ2Stats.weightedTotal > 0
      ? champ2Stats.weightedWins / champ2Stats.weightedTotal
      : globalWinRate;

    // Expected win rate if independent (simplified)
    const expectedWR = (champ1WR + champ2WR) / 2;
    const lift = winRateWeighted - expectedWR;

    entries.push({
      champions: [champ1, champ2],
      side: side as 'BLUE' | 'RED' | 'ANY',
      games_weighted: Math.round(stats.weightedTotal * 1000) / 1000,
      win_rate_weighted: Math.round(winRateWeighted * 10000) / 10000,
      lift: Math.round(lift * 10000) / 10000,
      sample_size: stats.total,
    });
  }

  // Sort by games_weighted descending
  entries.sort((a, b) => b.games_weighted - a.games_weighted);

  console.log(`\nFiltered to ${entries.length} entries (min ${MIN_GAMES_WEIGHTED} weighted games, ${MIN_SAMPLE_SIZE} sample)`);

  // Output
  const output = {
    generated_at: new Date().toISOString(),
    beta: BETA,
    gamma: GAMMA,
    target_patch_index: TARGET_PATCH_INDEX,
    min_games_weighted: MIN_GAMES_WEIGHTED,
    min_sample_size: MIN_SAMPLE_SIZE,
    total_entries: entries.length,
    entries,
  };

  const outputPath = path.join(dataDir, 'champion_synergies.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\nOutput written to ${outputPath}`);

  // Print sample
  console.log('\n=== Top 10 Synergy Pairs (ANY side) ===');
  const anyPairs = entries.filter(e => e.side === 'ANY').slice(0, 10);
  for (const e of anyPairs) {
    console.log(`  ${e.champions[0]} + ${e.champions[1]}: ${(e.win_rate_weighted * 100).toFixed(1)}% WR (${e.sample_size} games, lift=${(e.lift * 100).toFixed(1)}%)`);
  }

  console.log('\n=== Top 5 High-Lift Pairs (ANY side, min 10 games) ===');
  const highLift = entries
    .filter(e => e.side === 'ANY' && e.sample_size >= 10)
    .sort((a, b) => b.lift - a.lift)
    .slice(0, 5);
  for (const e of highLift) {
    console.log(`  ${e.champions[0]} + ${e.champions[1]}: lift=${(e.lift * 100).toFixed(1)}%, ${(e.win_rate_weighted * 100).toFixed(1)}% WR (${e.sample_size} games)`);
  }
}

main().catch(console.error);
