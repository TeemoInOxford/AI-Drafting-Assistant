/**
 * Draft Data Analyzer - Extracts patterns from real professional match data
 *
 * This module analyzes historical draft data to provide:
 * - Champion pick/ban rates
 * - Win rates for specific champions
 * - Synergy patterns (champions picked together)
 * - Counter patterns (matchup win rates)
 * - Role-specific meta analysis
 */

import { Champion, Position } from './types';
import fs from 'fs';
import path from 'path';

interface DraftAction {
  type: 'ban' | 'pick';
  sequenceNumber: string;
  drafter: { id: string; type: string };
  draftable: { id: string; type: string; name: string };
}

interface GameData {
  id: string;
  sequenceNumber: number;
  finished?: boolean;
  draftActions: DraftAction[];
  teams: Array<{
    id: string;
    name: string;
    side: string;
    won: boolean;
    players: Array<{
      id: string;
      name: string;
      character?: { id: string; name: string };
    }>;
  }>;
}

interface SeriesData {
  id: string;
  teams: Array<{ id: string; name: string; won: boolean }>;
  games: GameData[];
}

// Cache for analyzed data
let championStatsCache: ChampionStats | null = null;
let synergyMapCache: Map<string, Map<string, SynergyData>> | null = null;
let counterMapCache: Map<string, Map<string, CounterData>> | null = null;

// Cache for presence statistics (for normalization)
let presenceStatsCache: PresenceStats | null = null;

export interface PresenceStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  p25: number;  // 25th percentile
  p75: number;  // 75th percentile
}

export interface ChampionStats {
  [championName: string]: {
    pickCount: number;
    banCount: number;
    winCount: number;
    lossCount: number;
    pickRate: number;
    banRate: number;
    winRate: number;
    presence: number; // (picks + bans) / total games
  };
}

export interface SynergyData {
  coPickCount: number;
  coWinCount: number;
  synergyScore: number; // Win rate when picked together
}

export interface CounterData {
  matchupCount: number;
  winsAgainst: number;
  counterScore: number; // Win rate against this champion
}

/**
 * Load and analyze all series data
 */
export function analyzeAllDraftData(): {
  championStats: ChampionStats;
  synergyMap: Map<string, Map<string, SynergyData>>;
  counterMap: Map<string, Map<string, CounterData>>;
} {
  // Return cached data if available
  if (championStatsCache && synergyMapCache && counterMapCache) {
    return {
      championStats: championStatsCache,
      synergyMap: synergyMapCache,
      counterMap: counterMapCache,
    };
  }

  const dataDir = path.join(process.cwd(), 'data', 'lol', 'series_data');

  // Check if running in browser (return empty data)
  if (typeof window !== 'undefined') {
    return {
      championStats: {},
      synergyMap: new Map(),
      counterMap: new Map(),
    };
  }

  const championStats: ChampionStats = {};
  const synergyMap = new Map<string, Map<string, SynergyData>>();
  const counterMap = new Map<string, Map<string, CounterData>>();

  let totalGames = 0;

  try {
    const files = fs.readdirSync(dataDir);

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const filePath = path.join(dataDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const seriesData: SeriesData = JSON.parse(content);

        // Analyze each game in the series
        for (const game of seriesData.games) {
          if (!game.finished || !game.draftActions) continue;

          totalGames++;
          analyzeGame(game, championStats, synergyMap, counterMap);
        }
      } catch (err) {
        console.error(`Error processing file ${file}:`, err);
      }
    }

    // Calculate rates
    for (const champName in championStats) {
      const stats = championStats[champName];
      stats.pickRate = stats.pickCount / totalGames;
      stats.banRate = stats.banCount / totalGames;
      stats.presence = (stats.pickCount + stats.banCount) / totalGames;
      stats.winRate = stats.pickCount > 0
        ? stats.winCount / stats.pickCount
        : 0.5;
    }

    // Calculate presence statistics for normalization
    presenceStatsCache = calculatePresenceStats(championStats);

    // Cache the results
    championStatsCache = championStats;
    synergyMapCache = synergyMap;
    counterMapCache = counterMap;

    console.log(`[Draft Analyzer] Analyzed ${totalGames} games, found ${Object.keys(championStats).length} champions`);
    console.log(`[Draft Analyzer] Presence stats: min=${presenceStatsCache.min.toFixed(3)}, max=${presenceStatsCache.max.toFixed(3)}, mean=${presenceStatsCache.mean.toFixed(3)}, median=${presenceStatsCache.median.toFixed(3)}`);

  } catch (err) {
    console.error('Error analyzing draft data:', err);
  }

  return { championStats, synergyMap, counterMap };
}

/**
 * Analyze a single game
 */
function analyzeGame(
  game: GameData,
  championStats: ChampionStats,
  synergyMap: Map<string, Map<string, SynergyData>>,
  counterMap: Map<string, Map<string, CounterData>>
) {
  const team1Picks: string[] = [];
  const team2Picks: string[] = [];
  const team1Id = game.teams[0].id;
  const team2Id = game.teams[1].id;
  const team1Won = game.teams[0].won;

  // Process draft actions
  for (const action of game.draftActions) {
    const champName = action.draftable.name;
    const teamId = action.drafter.id;

    // Initialize champion stats
    if (!championStats[champName]) {
      championStats[champName] = {
        pickCount: 0,
        banCount: 0,
        winCount: 0,
        lossCount: 0,
        pickRate: 0,
        banRate: 0,
        winRate: 0.5,
        presence: 0,
      };
    }

    if (action.type === 'ban') {
      championStats[champName].banCount++;
    } else if (action.type === 'pick') {
      championStats[champName].pickCount++;

      // Track picks by team
      if (teamId === team1Id) {
        team1Picks.push(champName);
      } else {
        team2Picks.push(champName);
      }
    }
  }

  // Update win/loss counts
  for (const champName of team1Picks) {
    if (team1Won) {
      championStats[champName].winCount++;
    } else {
      championStats[champName].lossCount++;
    }
  }

  for (const champName of team2Picks) {
    if (!team1Won) {
      championStats[champName].winCount++;
    } else {
      championStats[champName].lossCount++;
    }
  }

  // Analyze synergies (same team)
  analyzeSynergies(team1Picks, team1Won, synergyMap);
  analyzeSynergies(team2Picks, !team1Won, synergyMap);

  // Analyze counters (opposing teams)
  analyzeCounters(team1Picks, team2Picks, team1Won, counterMap);
}

/**
 * Analyze synergies between champions on the same team
 */
function analyzeSynergies(
  picks: string[],
  won: boolean,
  synergyMap: Map<string, Map<string, SynergyData>>
) {
  for (let i = 0; i < picks.length; i++) {
    for (let j = i + 1; j < picks.length; j++) {
      const champ1 = picks[i];
      const champ2 = picks[j];

      // Add synergy for champ1 -> champ2
      if (!synergyMap.has(champ1)) {
        synergyMap.set(champ1, new Map());
      }
      const champ1Synergies = synergyMap.get(champ1)!;

      if (!champ1Synergies.has(champ2)) {
        champ1Synergies.set(champ2, {
          coPickCount: 0,
          coWinCount: 0,
          synergyScore: 0.5,
        });
      }

      const synergy = champ1Synergies.get(champ2)!;
      synergy.coPickCount++;
      if (won) synergy.coWinCount++;
      synergy.synergyScore = synergy.coWinCount / synergy.coPickCount;

      // Add reverse synergy for champ2 -> champ1
      if (!synergyMap.has(champ2)) {
        synergyMap.set(champ2, new Map());
      }
      const champ2Synergies = synergyMap.get(champ2)!;

      if (!champ2Synergies.has(champ1)) {
        champ2Synergies.set(champ1, {
          coPickCount: 0,
          coWinCount: 0,
          synergyScore: 0.5,
        });
      }

      const reverseSynergy = champ2Synergies.get(champ1)!;
      reverseSynergy.coPickCount++;
      if (won) reverseSynergy.coWinCount++;
      reverseSynergy.synergyScore = reverseSynergy.coWinCount / reverseSynergy.coPickCount;
    }
  }
}

/**
 * Analyze counter matchups between opposing teams
 */
function analyzeCounters(
  team1Picks: string[],
  team2Picks: string[],
  team1Won: boolean,
  counterMap: Map<string, Map<string, CounterData>>
) {
  // For each champion on team1, record matchups against team2
  for (const champ1 of team1Picks) {
    if (!counterMap.has(champ1)) {
      counterMap.set(champ1, new Map());
    }
    const champ1Counters = counterMap.get(champ1)!;

    for (const champ2 of team2Picks) {
      if (!champ1Counters.has(champ2)) {
        champ1Counters.set(champ2, {
          matchupCount: 0,
          winsAgainst: 0,
          counterScore: 0.5,
        });
      }

      const counter = champ1Counters.get(champ2)!;
      counter.matchupCount++;
      if (team1Won) counter.winsAgainst++;
      counter.counterScore = counter.winsAgainst / counter.matchupCount;
    }
  }

  // For each champion on team2, record matchups against team1
  for (const champ2 of team2Picks) {
    if (!counterMap.has(champ2)) {
      counterMap.set(champ2, new Map());
    }
    const champ2Counters = counterMap.get(champ2)!;

    for (const champ1 of team1Picks) {
      if (!champ2Counters.has(champ1)) {
        champ2Counters.set(champ1, {
          matchupCount: 0,
          winsAgainst: 0,
          counterScore: 0.5,
        });
      }

      const counter = champ2Counters.get(champ1)!;
      counter.matchupCount++;
      if (!team1Won) counter.winsAgainst++;
      counter.counterScore = counter.winsAgainst / counter.matchupCount;
    }
  }
}

/**
 * Get champion statistics
 */
export function getChampionStats(championName: string): ChampionStats[string] | null {
  if (!championStatsCache) {
    analyzeAllDraftData();
  }
  return championStatsCache?.[championName] || null;
}

/**
 * Get synergy score between two champions
 */
export function getSynergyScore(champ1: string, champ2: string): number {
  if (!synergyMapCache) {
    analyzeAllDraftData();
  }

  const synergies = synergyMapCache?.get(champ1);
  if (!synergies) return 0.5; // Neutral if no data

  const synergyData = synergies.get(champ2);
  if (!synergyData || synergyData.coPickCount < 3) return 0.5; // Need at least 3 games

  return synergyData.synergyScore;
}

/**
 * Get counter score (how well champ1 performs against champ2)
 */
export function getCounterScore(champ1: string, champ2: string): number {
  if (!counterMapCache) {
    analyzeAllDraftData();
  }

  const counters = counterMapCache?.get(champ1);
  if (!counters) return 0.5; // Neutral if no data

  const counterData = counters.get(champ2);
  if (!counterData || counterData.matchupCount < 3) return 0.5; // Need at least 3 games

  return counterData.counterScore;
}

/**
 * Calculate presence statistics for normalization
 */
function calculatePresenceStats(championStats: ChampionStats): PresenceStats {
  const presenceValues = Object.values(championStats)
    .map(stats => stats.presence)
    .filter(p => p > 0)  // Filter out champions with 0 presence
    .sort((a, b) => a - b);

  if (presenceValues.length === 0) {
    return { min: 0, max: 1, mean: 0.5, median: 0.5, p25: 0.25, p75: 0.75 };
  }

  const min = presenceValues[0];
  const max = presenceValues[presenceValues.length - 1];
  const mean = presenceValues.reduce((sum, val) => sum + val, 0) / presenceValues.length;

  const medianIndex = Math.floor(presenceValues.length / 2);
  const median = presenceValues.length % 2 === 0
    ? (presenceValues[medianIndex - 1] + presenceValues[medianIndex]) / 2
    : presenceValues[medianIndex];

  const p25Index = Math.floor(presenceValues.length * 0.25);
  const p25 = presenceValues[p25Index];

  const p75Index = Math.floor(presenceValues.length * 0.75);
  const p75 = presenceValues[p75Index];

  return { min, max, mean, median, p25, p75 };
}

/**
 * Get presence statistics (for normalization)
 */
export function getPresenceStats(): PresenceStats | null {
  if (!presenceStatsCache) {
    analyzeAllDraftData();
  }
  return presenceStatsCache;
}

/**
 * Normalize presence value using Min-Max normalization
 * Maps the presence value from [min, max] to [0, 1]
 */
export function normalizePresence(presence: number): number {
  const stats = getPresenceStats();
  if (!stats || stats.max === stats.min) {
    return 0.5; // Fallback if no stats available
  }

  // Min-Max normalization: (value - min) / (max - min)
  const normalized = (presence - stats.min) / (stats.max - stats.min);

  // Clamp to [0, 1] range
  return Math.max(0, Math.min(1, normalized));
}

/**
 * Clear cache (useful for testing or data updates)
 */
export function clearCache() {
  championStatsCache = null;
  synergyMapCache = null;
  counterMapCache = null;
  presenceStatsCache = null;
}
