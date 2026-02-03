#!/usr/bin/env npx tsx
/**
 * Generate Champion Counters
 *
 * Computes same-role counter statistics from series_*.json game data.
 * Uses weighted-role-posteriors to infer champion roles.
 *
 * Output: data/grid_v2/champion_counters.json
 *
 * Usage: npx tsx scripts/generate_champion_counters.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Configuration
// ============================================================================

const BETA = 0.5; // Time decay factor per patch
const GAMMA = 2; // Patch maturity factor
const TARGET_PATCH_INDEX = 1518; // 15.18
const MIN_ROLE_PROB = 0.6; // Minimum role probability to assign role
const MIN_GAMES_WEIGHTED = 2; // Minimum weighted games for counter entry
const MIN_SAMPLE_SIZE = 3; // Minimum raw sample size
const TOP_COUNTERS = 10; // Number of top counters to keep per target

// ============================================================================
// Types
// ============================================================================

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
  startedAt?: string;
}

interface Series {
  id: string;
  startedAt?: string;
  games: Game[];
}

interface RolePosterior {
  champion_name: string;
  role_probabilities: {
    top: number;
    jungle: number;
    mid: number;
    bot: number;
    support: number;
  };
}

interface CounterStats {
  wins: number;
  total: number;
  weightedWins: number;
  weightedTotal: number;
}

interface CounterEntry {
  champion: string;
  games_weighted: number;
  win_rate_weighted: number;
  sample_size: number;
}

interface RoleCounterEntry {
  role: 'TOP' | 'JNG' | 'MID' | 'BOT' | 'SUP';
  target: string;
  counters: CounterEntry[];
}

type RoleKey = 'top' | 'jungle' | 'mid' | 'bot' | 'support';
const ROLE_MAP: Record<RoleKey, 'TOP' | 'JNG' | 'MID' | 'BOT' | 'SUP'> = {
  top: 'TOP',
  jungle: 'JNG',
  mid: 'MID',
  bot: 'BOT',
  support: 'SUP',
};

// ============================================================================
// Utility Functions
// ============================================================================

function getPatchIndexFromDate(dateStr: string): number {
  const date = new Date(dateStr);
  const baseDate = new Date('2024-01-10'); // Patch 14.1
  const daysDiff = Math.floor((date.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
  const patchesSince = Math.floor(daysDiff / 14);

  const basePatch = 1401;
  let patch = basePatch + patchesSince;

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
  const patchInSeason = patchIndex % 100;
  const maturity = Math.min(patchInSeason / GAMMA, 1);
  return betaWeight * Math.max(maturity, 0.1);
}

function getChampionRole(
  championName: string,
  posteriors: Map<string, RolePosterior>
): RoleKey | null {
  const posterior = posteriors.get(championName);
  if (!posterior) return null;

  const probs = posterior.role_probabilities;
  let maxRole: RoleKey = 'mid';
  let maxProb = 0;

  for (const [role, prob] of Object.entries(probs) as [RoleKey, number][]) {
    if (prob > maxProb) {
      maxProb = prob;
      maxRole = role;
    }
  }

  return maxProb >= MIN_ROLE_PROB ? maxRole : null;
}

function counterKey(target: string, counter: string, role: string): string {
  return `${role}|${target}|${counter}`;
}

// ============================================================================
// Main Processing
// ============================================================================

async function main() {
  const dataDir = path.join(process.cwd(), 'data', 'grid_v2');

  // Load role posteriors
  const posteriorsPath = path.join(dataDir, 'weighted-role-posteriors.json');
  if (!fs.existsSync(posteriorsPath)) {
    console.error('Error: weighted-role-posteriors.json not found');
    process.exit(1);
  }

  const posteriorsData = JSON.parse(fs.readFileSync(posteriorsPath, 'utf-8'));
  const posteriors = new Map<string, RolePosterior>();
  for (const [name, data] of Object.entries(posteriorsData.champions || {})) {
    posteriors.set(name, data as RolePosterior);
  }
  console.log(`Loaded role posteriors for ${posteriors.size} champions`);

  // Load series files
  const seriesFiles = fs.readdirSync(dataDir).filter(f => f.startsWith('series_') && f.endsWith('.json'));
  console.log(`Found ${seriesFiles.length} series files`);
  console.log(`Using BETA=${BETA}, GAMMA=${GAMMA}, MIN_ROLE_PROB=${MIN_ROLE_PROB}`);

  // Counter stats: role|target|counter -> stats
  const counterStats = new Map<string, CounterStats>();

  let processedGames = 0;
  let skippedMatchups = 0;

  for (const file of seriesFiles) {
    try {
      const filePath = path.join(dataDir, file);
      const series: Series = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const seriesDate = series.startedAt || '';
      const patchIndex = getPatchIndexFromDate(seriesDate);
      const weight = calculateWeight(patchIndex);

      for (const game of series.games || []) {
        if (!game.teams || game.teams.length !== 2) continue;

        const team1 = game.teams[0];
        const team2 = game.teams[1];

        // Extract champions with roles
        const team1Champs: Array<{ name: string; role: RoleKey | null }> = [];
        const team2Champs: Array<{ name: string; role: RoleKey | null }> = [];

        for (const player of team1.players || []) {
          if (player.character?.name) {
            const role = getChampionRole(player.character.name, posteriors);
            team1Champs.push({ name: player.character.name, role });
          }
        }

        for (const player of team2.players || []) {
          if (player.character?.name) {
            const role = getChampionRole(player.character.name, posteriors);
            team2Champs.push({ name: player.character.name, role });
          }
        }

        // Find same-role matchups
        for (const c1 of team1Champs) {
          if (!c1.role) {
            skippedMatchups++;
            continue;
          }

          for (const c2 of team2Champs) {
            if (c2.role !== c1.role) continue;
            if (c1.name === c2.name) continue; // Same champion (shouldn't happen)

            // c1 vs c2: c1's perspective
            // If team1 won, c1 "countered" c2
            const key1 = counterKey(c2.name, c1.name, c1.role);
            if (!counterStats.has(key1)) {
              counterStats.set(key1, { wins: 0, total: 0, weightedWins: 0, weightedTotal: 0 });
            }
            const stats1 = counterStats.get(key1)!;
            stats1.total++;
            stats1.weightedTotal += weight;
            if (team1.won) {
              stats1.wins++;
              stats1.weightedWins += weight;
            }

            // c2 vs c1: c2's perspective
            const key2 = counterKey(c1.name, c2.name, c1.role);
            if (!counterStats.has(key2)) {
              counterStats.set(key2, { wins: 0, total: 0, weightedWins: 0, weightedTotal: 0 });
            }
            const stats2 = counterStats.get(key2)!;
            stats2.total++;
            stats2.weightedTotal += weight;
            if (team2.won) {
              stats2.wins++;
              stats2.weightedWins += weight;
            }
          }
        }

        processedGames++;
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }

  console.log(`\nProcessed ${processedGames} games`);
  console.log(`Skipped ${skippedMatchups} matchups (low role confidence)`);
  console.log(`Found ${counterStats.size} unique matchup entries`);

  // Group by role and target
  const roleTargetCounters = new Map<string, Map<string, CounterEntry[]>>();

  for (const [key, stats] of counterStats) {
    if (stats.weightedTotal < MIN_GAMES_WEIGHTED || stats.total < MIN_SAMPLE_SIZE) {
      continue;
    }

    const [role, target, counter] = key.split('|');
    const winRateWeighted = stats.weightedTotal > 0 ? stats.weightedWins / stats.weightedTotal : 0;

    if (!roleTargetCounters.has(role)) {
      roleTargetCounters.set(role, new Map());
    }
    const targetMap = roleTargetCounters.get(role)!;
    if (!targetMap.has(target)) {
      targetMap.set(target, []);
    }

    targetMap.get(target)!.push({
      champion: counter,
      games_weighted: Math.round(stats.weightedTotal * 1000) / 1000,
      win_rate_weighted: Math.round(winRateWeighted * 10000) / 10000,
      sample_size: stats.total,
    });
  }

  // Build output entries
  const entries: RoleCounterEntry[] = [];

  for (const [roleKey, targetMap] of roleTargetCounters) {
    const role = ROLE_MAP[roleKey as RoleKey];

    for (const [target, counters] of targetMap) {
      // Sort by win rate descending, take top N
      counters.sort((a, b) => b.win_rate_weighted - a.win_rate_weighted);
      const topCounters = counters.slice(0, TOP_COUNTERS);

      if (topCounters.length > 0) {
        entries.push({
          role,
          target,
          counters: topCounters,
        });
      }
    }
  }

  // Sort entries by role then target
  entries.sort((a, b) => {
    const roleOrder = ['TOP', 'JNG', 'MID', 'BOT', 'SUP'];
    const roleA = roleOrder.indexOf(a.role);
    const roleB = roleOrder.indexOf(b.role);
    if (roleA !== roleB) return roleA - roleB;
    return a.target.localeCompare(b.target);
  });

  console.log(`\nGenerated ${entries.length} role-target entries`);

  // Output
  const output = {
    generated_at: new Date().toISOString(),
    beta: BETA,
    gamma: GAMMA,
    target_patch_index: TARGET_PATCH_INDEX,
    min_role_prob: MIN_ROLE_PROB,
    min_games_weighted: MIN_GAMES_WEIGHTED,
    min_sample_size: MIN_SAMPLE_SIZE,
    top_counters_per_target: TOP_COUNTERS,
    total_entries: entries.length,
    entries,
  };

  const outputPath = path.join(dataDir, 'champion_counters.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\nOutput written to ${outputPath}`);

  // Print samples
  console.log('\n=== Sample Counter Data ===');
  const sampleRoles = ['MID', 'TOP', 'BOT'];
  for (const role of sampleRoles) {
    const roleEntries = entries.filter(e => e.role === role);
    if (roleEntries.length > 0) {
      const sample = roleEntries[Math.floor(Math.random() * roleEntries.length)];
      console.log(`\n${role} - ${sample.target} counters:`);
      for (const c of sample.counters.slice(0, 3)) {
        console.log(`  ${c.champion}: ${(c.win_rate_weighted * 100).toFixed(1)}% WR (${c.sample_size} games)`);
      }
    }
  }
}

main().catch(console.error);
