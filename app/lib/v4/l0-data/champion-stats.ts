/**
 * v4-1 L0 Champion Statistics Generator
 *
 * Generates champion statistics with confidence scores from historical match data.
 * Includes pick rate, ban rate, win rate, and role distribution.
 */

import fs from 'fs';
import path from 'path';
import { Position } from '../../types';
import { ChampionStats, L0Config, DEFAULT_L0_CONFIG } from '../types/l0-types';
import { calculateSampleConfidence, calculateTimeDecay } from '../types/common-types';

// Champion name to position mapping (heuristic based on common roles)
// This will be refined with actual data
const CHAMPION_ROLE_HINTS: Record<string, Position[]> = {
  // Top laners
  'Gnar': ['top'],
  'Udyr': ['top', 'jungle'],
  'K\'Sante': ['top'],
  'Jax': ['top', 'jungle'],

  // Junglers
  'Poppy': ['jungle', 'top'],

  // Mid laners
  'Azir': ['mid'],
  'Orianna': ['mid'],
  'LeBlanc': ['mid'],

  // Bot laners
  'Aphelios': ['bot'],
  'Lucian': ['bot', 'mid'],
  'Ashe': ['bot'],
  'Kalista': ['bot'],
  'Varus': ['bot'],

  // Supports
  'Milio': ['support'],
  'Nami': ['support'],
};

interface SeriesData {
  id: string;
  startedAt?: string;
  games: GameData[];
}

interface GameData {
  id: string;
  draftActions: DraftAction[];
  teams: TeamData[];
}

interface DraftAction {
  type: 'ban' | 'pick';
  sequenceNumber: string;
  drafter: {
    id: string;
    type: string;
  };
  draftable: {
    id: string;
    type: string;
    name: string;
  };
}

interface TeamData {
  id: string;
  side: 'blue' | 'red';
  won: boolean;
  players: PlayerData[];
}

interface PlayerData {
  id: string;
  name: string;
  character: {
    id: string;
    name: string;
  };
}

interface ChampionStatsAccumulator {
  championId: string;
  championName: string;
  pickCount: number;
  banCount: number;
  winCount: number;
  lossCount: number;
  roleCount: Record<Position, number>;
  totalGames: number;
  timeDecaySum: number;
}

/**
 * Generate champion statistics from series data files
 */
export async function generateChampionStats(
  config: L0Config = DEFAULT_L0_CONFIG
): Promise<Map<string, ChampionStats>> {
  const seriesDataDir = path.join(process.cwd(), 'data', 'lol', 'series_data');

  // Check if directory exists
  if (!fs.existsSync(seriesDataDir)) {
    console.warn('Series data directory not found:', seriesDataDir);
    return new Map();
  }

  const files = fs.readdirSync(seriesDataDir)
    .filter(f => f.startsWith('series_') && f.endsWith('.json'));

  console.log(`Processing ${files.length} series files...`);

  // Accumulate stats across all games
  const statsMap = new Map<string, ChampionStatsAccumulator>();
  const currentDate = new Date();
  let totalGamesProcessed = 0;

  for (const file of files) {
    const filePath = path.join(seriesDataDir, file);

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const seriesData: SeriesData = JSON.parse(content);

      // Get series date for time decay
      const seriesDate = seriesData.startedAt
        ? new Date(seriesData.startedAt)
        : currentDate;

      const timeDecay = calculateTimeDecay(
        seriesDate,
        currentDate,
        config.timeDecayHalfLife
      );

      // Process each game in the series
      for (const game of seriesData.games || []) {
        totalGamesProcessed++;
        processGame(game, statsMap, timeDecay);
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }

  console.log(`Processed ${totalGamesProcessed} games from ${files.length} series`);

  // Convert accumulators to ChampionStats
  const championStats = new Map<string, ChampionStats>();

  for (const [championId, acc] of statsMap.entries()) {
    // Skip champions with insufficient data
    if (acc.totalGames < config.minChampionGames) {
      continue;
    }

    const pickRate = acc.pickCount / acc.totalGames;
    const banRate = acc.banCount / acc.totalGames;
    const totalPicks = acc.pickCount;
    const winRate = totalPicks > 0 ? acc.winCount / totalPicks : 0.5;

    // Calculate role distribution
    const totalRoleCount = Object.values(acc.roleCount).reduce((sum, c) => sum + c, 0);
    const roleDistribution: Record<Position, number> = {
      top: totalRoleCount > 0 ? acc.roleCount.top / totalRoleCount : 0,
      jungle: totalRoleCount > 0 ? acc.roleCount.jungle / totalRoleCount : 0,
      mid: totalRoleCount > 0 ? acc.roleCount.mid / totalRoleCount : 0,
      bot: totalRoleCount > 0 ? acc.roleCount.bot / totalRoleCount : 0,
      support: totalRoleCount > 0 ? acc.roleCount.support / totalRoleCount : 0,
    };

    // Calculate confidence based on sample size
    const confidence = calculateSampleConfidence(
      totalPicks,
      config.confidenceThreshold,
      config.confidenceSteepness
    );

    // Average time decay weight
    const avgTimeDecay = acc.timeDecaySum / acc.totalGames;

    championStats.set(championId, {
      championId,
      pickRate,
      banRate,
      winRate,
      roleDistribution,
      sampleSize: totalPicks,
      timeDecayWeight: avgTimeDecay,
      confidence,
      lastUpdated: new Date(),
    });
  }

  console.log(`Generated stats for ${championStats.size} champions`);

  return championStats;
}

/**
 * Process a single game and update stats accumulators
 */
function processGame(
  game: GameData,
  statsMap: Map<string, ChampionStatsAccumulator>,
  timeDecay: number
): void {
  // Determine winner
  const winningTeam = game.teams.find(t => t.won);
  if (!winningTeam) return;

  // Process draft actions
  const bans = game.draftActions.filter(a => a.type === 'ban');
  const picks = game.draftActions.filter(a => a.type === 'pick');

  // Track bans
  for (const ban of bans) {
    const championName = ban.draftable.name;
    const championId = ban.draftable.id;

    const acc = getOrCreateAccumulator(statsMap, championId, championName);
    acc.banCount++;
    acc.totalGames++;
    acc.timeDecaySum += timeDecay;
  }

  // Track picks and wins
  for (const team of game.teams) {
    for (let i = 0; i < team.players.length; i++) {
      const player = team.players[i];
      const championName = player.character.name;
      const championId = player.character.id;

      const acc = getOrCreateAccumulator(statsMap, championId, championName);
      acc.pickCount++;
      acc.totalGames++;
      acc.timeDecaySum += timeDecay;

      if (team.won) {
        acc.winCount++;
      } else {
        acc.lossCount++;
      }

      // Infer role from position (0=top, 1=jungle, 2=mid, 3=bot, 4=support)
      const role = inferRole(championName, i);
      acc.roleCount[role]++;
    }
  }
}

/**
 * Get or create stats accumulator for a champion
 */
function getOrCreateAccumulator(
  statsMap: Map<string, ChampionStatsAccumulator>,
  championId: string,
  championName: string
): ChampionStatsAccumulator {
  let acc = statsMap.get(championId);

  if (!acc) {
    acc = {
      championId,
      championName,
      pickCount: 0,
      banCount: 0,
      winCount: 0,
      lossCount: 0,
      roleCount: {
        top: 0,
        jungle: 0,
        mid: 0,
        bot: 0,
        support: 0,
      },
      totalGames: 0,
      timeDecaySum: 0,
    };
    statsMap.set(championId, acc);
  }

  return acc;
}

/**
 * Infer role from champion name and position index
 */
function inferRole(championName: string, positionIndex: number): Position {
  const roles: Position[] = ['top', 'jungle', 'mid', 'bot', 'support'];

  // Use position index as primary indicator
  const defaultRole = roles[positionIndex] || 'mid';

  // Check if champion has known role hints
  const hints = CHAMPION_ROLE_HINTS[championName];
  if (hints && hints.length > 0) {
    // If the default role is in hints, use it
    if (hints.includes(defaultRole)) {
      return defaultRole;
    }
    // Otherwise use the first hint
    return hints[0];
  }

  return defaultRole;
}

/**
 * Get champion stats by ID
 */
export function getChampionStats(
  championId: string,
  statsMap: Map<string, ChampionStats>
): ChampionStats | undefined {
  return statsMap.get(championId);
}

/**
 * Get top N champions by pick rate
 */
export function getTopChampionsByPickRate(
  statsMap: Map<string, ChampionStats>,
  topN: number = 10
): ChampionStats[] {
  return Array.from(statsMap.values())
    .sort((a, b) => b.pickRate - a.pickRate)
    .slice(0, topN);
}

/**
 * Get top N champions by ban rate
 */
export function getTopChampionsByBanRate(
  statsMap: Map<string, ChampionStats>,
  topN: number = 10
): ChampionStats[] {
  return Array.from(statsMap.values())
    .sort((a, b) => b.banRate - a.banRate)
    .slice(0, topN);
}

/**
 * Get top N champions by win rate (with minimum sample size)
 */
export function getTopChampionsByWinRate(
  statsMap: Map<string, ChampionStats>,
  topN: number = 10,
  minSampleSize: number = 20
): ChampionStats[] {
  return Array.from(statsMap.values())
    .filter(s => s.sampleSize >= minSampleSize)
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, topN);
}
