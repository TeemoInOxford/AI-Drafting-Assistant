/**
 * v4-1 L0 Player Champion Pools Extractor
 *
 * Extracts player champion pools from historical match data.
 * Includes frequency distribution and recent picks.
 */

import fs from 'fs';
import path from 'path';
import { PlayerPool, L0Config, DEFAULT_L0_CONFIG } from '../types/l0-types';
import { calculateSampleConfidence } from '../types/common-types';

interface SeriesData {
  id: string;
  startedAt?: string;
  games: GameData[];
}

interface GameData {
  id: string;
  teams: TeamData[];
}

interface TeamData {
  id: string;
  side: 'blue' | 'red';
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

interface PlayerPoolAccumulator {
  playerId: string;
  championCounts: Map<string, number>;  // championId -> count
  recentPicks: Array<{ championId: string; gameDate: Date }>;
  totalGames: number;
}

/**
 * Generate player champion pools from series data files
 */
export async function generatePlayerPools(
  playerIds?: string[],
  config: L0Config = DEFAULT_L0_CONFIG
): Promise<Map<string, PlayerPool>> {
  const seriesDataDir = path.join(process.cwd(), 'data', 'lol', 'series_data');

  // Check if directory exists
  if (!fs.existsSync(seriesDataDir)) {
    console.warn('Series data directory not found:', seriesDataDir);
    return new Map();
  }

  const files = fs.readdirSync(seriesDataDir)
    .filter(f => f.startsWith('series_') && f.endsWith('.json'));

  console.log(`Processing ${files.length} series files for player pools...`);

  // Accumulate player data across all games
  const playerMap = new Map<string, PlayerPoolAccumulator>();
  let totalGamesProcessed = 0;

  for (const file of files) {
    const filePath = path.join(seriesDataDir, file);

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const seriesData: SeriesData = JSON.parse(content);

      // Get series date
      const seriesDate = seriesData.startedAt
        ? new Date(seriesData.startedAt)
        : new Date();

      // Process each game in the series
      for (const game of seriesData.games || []) {
        totalGamesProcessed++;
        processGameForPlayers(game, playerMap, seriesDate, playerIds);
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }

  console.log(`Processed ${totalGamesProcessed} games for ${playerMap.size} players`);

  // Convert accumulators to PlayerPool
  const playerPools = new Map<string, PlayerPool>();

  for (const [playerId, acc] of playerMap.entries()) {
    // Skip players with insufficient data
    if (acc.totalGames < config.minPlayerGames) {
      continue;
    }

    // Calculate champion frequencies
    const championFrequencies: Record<string, number> = {};
    for (const [championId, count] of acc.championCounts.entries()) {
      championFrequencies[championId] = count / acc.totalGames;
    }

    // Get recent picks (last 20 games, sorted by date descending)
    const recentPicks = acc.recentPicks
      .sort((a, b) => b.gameDate.getTime() - a.gameDate.getTime())
      .slice(0, 20)
      .map(p => p.championId);

    // Calculate confidence based on sample size
    const confidence = calculateSampleConfidence(
      acc.totalGames,
      config.confidenceThreshold,
      config.confidenceSteepness
    );

    const uniqueChampions = acc.championCounts.size;

    playerPools.set(playerId, {
      playerId,
      championFrequencies,
      recentPicks,
      totalGames: acc.totalGames,
      uniqueChampions,
      confidence,
      lastUpdated: new Date(),
    });
  }

  console.log(`Generated pools for ${playerPools.size} players`);

  return playerPools;
}

/**
 * Process a single game and update player accumulators
 */
function processGameForPlayers(
  game: GameData,
  playerMap: Map<string, PlayerPoolAccumulator>,
  gameDate: Date,
  filterPlayerIds?: string[]
): void {
  for (const team of game.teams) {
    for (const player of team.players) {
      const playerId = player.id;

      // Skip if filtering and player not in filter list
      if (filterPlayerIds && !filterPlayerIds.includes(playerId)) {
        continue;
      }

      const championId = player.character.id;

      // Get or create accumulator
      let acc = playerMap.get(playerId);
      if (!acc) {
        acc = {
          playerId,
          championCounts: new Map(),
          recentPicks: [],
          totalGames: 0,
        };
        playerMap.set(playerId, acc);
      }

      // Update champion count
      const currentCount = acc.championCounts.get(championId) || 0;
      acc.championCounts.set(championId, currentCount + 1);

      // Add to recent picks
      acc.recentPicks.push({ championId, gameDate });

      // Increment total games
      acc.totalGames++;
    }
  }
}

/**
 * Get player pool by ID
 */
export function getPlayerPool(
  playerId: string,
  poolsMap: Map<string, PlayerPool>
): PlayerPool | undefined {
  return poolsMap.get(playerId);
}

/**
 * Get player's most played champions
 */
export function getPlayerTopChampions(
  playerId: string,
  poolsMap: Map<string, PlayerPool>,
  topN: number = 5
): Array<{ championId: string; frequency: number }> {
  const pool = poolsMap.get(playerId);
  if (!pool) return [];

  return Object.entries(pool.championFrequencies)
    .map(([championId, frequency]) => ({ championId, frequency }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, topN);
}

/**
 * Get player's recent champion picks
 */
export function getPlayerRecentPicks(
  playerId: string,
  poolsMap: Map<string, PlayerPool>,
  count: number = 10
): string[] {
  const pool = poolsMap.get(playerId);
  if (!pool) return [];

  return pool.recentPicks.slice(0, count);
}

/**
 * Check if player frequently plays a champion
 */
export function doesPlayerPlayChampion(
  playerId: string,
  championId: string,
  poolsMap: Map<string, PlayerPool>,
  minFrequency: number = 0.05  // 5% of games
): boolean {
  const pool = poolsMap.get(playerId);
  if (!pool) return false;

  const frequency = pool.championFrequencies[championId] || 0;
  return frequency >= minFrequency;
}

/**
 * Get champion frequency for a player
 */
export function getChampionFrequency(
  playerId: string,
  championId: string,
  poolsMap: Map<string, PlayerPool>
): number {
  const pool = poolsMap.get(playerId);
  if (!pool) return 0;

  return pool.championFrequencies[championId] || 0;
}

/**
 * Get players who play a specific champion
 */
export function getPlayersForChampion(
  championId: string,
  poolsMap: Map<string, PlayerPool>,
  minFrequency: number = 0.05
): Array<{ playerId: string; frequency: number }> {
  const result: Array<{ playerId: string; frequency: number }> = [];

  for (const [playerId, pool] of poolsMap.entries()) {
    const frequency = pool.championFrequencies[championId] || 0;
    if (frequency >= minFrequency) {
      result.push({ playerId, frequency });
    }
  }

  return result.sort((a, b) => b.frequency - a.frequency);
}

/**
 * Get player pool diversity score (0-1)
 * Higher score = more diverse champion pool
 */
export function getPlayerDiversityScore(
  playerId: string,
  poolsMap: Map<string, PlayerPool>
): number {
  const pool = poolsMap.get(playerId);
  if (!pool || pool.totalGames === 0) return 0;

  // Use Shannon entropy to measure diversity
  const frequencies = Object.values(pool.championFrequencies);
  let entropy = 0;

  for (const freq of frequencies) {
    if (freq > 0) {
      entropy -= freq * Math.log2(freq);
    }
  }

  // Normalize by maximum possible entropy (log2 of unique champions)
  const maxEntropy = Math.log2(pool.uniqueChampions);
  return maxEntropy > 0 ? entropy / maxEntropy : 0;
}
