/**
 * Threat Signal Engine
 *
 * 威胁信号查询引擎，提供带 fallback 逻辑的查询帮助函数
 *
 * NOTE: The `region` parameter in this module is semantically a LeagueKey
 * (e.g., 'lck', 'lpl', 'lec', 'lcs', 'lta_n', 'lta_s').
 * The parameter name is kept as `region` for historical compatibility.
 * Callers should pass normalized LeagueKey values, not raw region strings like "americas".
 *
 * Step 5.1 Update: Player-level threats are now gated by player champion pool.
 * A player-level threat is only returned if the player has played the champion
 * at least MIN_PICKS_FOR_PLAYER_THREAT times.
 */

import fs from 'fs';
import path from 'path';
import {
  ThreatSignal,
  ThreatSignalsData,
  ThreatQueryResult,
  TopThreatsResult,
  TeamThreatQuery,
  PlayerThreatQuery,
  TopTeamThreatsQuery,
  TopPlayerThreatsQuery,
  ThreatLevel,
  makeContextKey,
  GLOBAL_CONTEXT,
  THREAT_CONFIG,
} from './threat-types';

// ============ Configuration ============

/**
 * Minimum picks required for a player to have a threat signal for a champion.
 * This gates player-level attribution to prevent nonsensical associations
 * (e.g., Bard attributed to a top laner).
 */
export const MIN_PICKS_FOR_PLAYER_THREAT = 2;

// ============ Cached Data ============

// Cached threat signals data
let cachedData: ThreatSignalsData | null = null;
let cacheLoadTime: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cached player pools data
interface PlayerPoolsData {
  players: Record<string, {
    playerId: string;
    playerName: string;
    champions: Array<{ championName: string; pickCount: number }>;
  }>;
}
let cachedPlayerPools: PlayerPoolsData | null = null;
let playerPoolsCacheTime: number = 0;

/**
 * Load player pools data with caching
 */
function loadPlayerPools(): PlayerPoolsData | null {
  const now = Date.now();

  if (cachedPlayerPools && (now - playerPoolsCacheTime) < CACHE_TTL) {
    return cachedPlayerPools;
  }

  try {
    const dataPath = path.join(process.cwd(), 'data/lol/player-pools.json');
    if (!fs.existsSync(dataPath)) {
      console.warn('Player pools data not found:', dataPath);
      return null;
    }

    cachedPlayerPools = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    playerPoolsCacheTime = now;
    return cachedPlayerPools;
  } catch (error) {
    console.error('Error loading player pools:', error);
    return null;
  }
}

/**
 * Check if a player has played a champion enough times to warrant a threat signal
 */
export function playerCanPlayChampion(
  playerId: string,
  championName: string,
  minPicks: number = MIN_PICKS_FOR_PLAYER_THREAT
): boolean {
  const pools = loadPlayerPools();
  if (!pools) return false;

  const playerPool = pools.players[playerId];
  if (!playerPool) return false;

  const champEntry = playerPool.champions.find(
    c => c.championName.toLowerCase() === championName.toLowerCase()
  );

  return champEntry ? champEntry.pickCount >= minPicks : false;
}

/**
 * Get the pick count for a player-champion pair
 */
export function getPlayerChampionPickCount(
  playerId: string,
  championName: string
): number {
  const pools = loadPlayerPools();
  if (!pools) return 0;

  const playerPool = pools.players[playerId];
  if (!playerPool) return 0;

  const champEntry = playerPool.champions.find(
    c => c.championName.toLowerCase() === championName.toLowerCase()
  );

  return champEntry?.pickCount || 0;
}

/**
 * Load threat signals data with caching
 */
export function loadThreatSignals(): ThreatSignalsData | null {
  const now = Date.now();

  // Return cached data if still valid
  if (cachedData && (now - cacheLoadTime) < CACHE_TTL) {
    return cachedData;
  }

  try {
    const dataPath = path.join(process.cwd(), 'data/lol/threat-signals.json');
    if (!fs.existsSync(dataPath)) {
      console.warn('Threat signals data not found:', dataPath);
      return null;
    }

    cachedData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    cacheLoadTime = now;
    return cachedData;
  } catch (error) {
    console.error('Error loading threat signals:', error);
    return null;
  }
}

/**
 * Clear the cache (useful for testing or after rebuilding data)
 */
export function clearThreatCache(): void {
  cachedData = null;
  cacheLoadTime = 0;
}

/**
 * Get context key with fallback chain
 * Returns: [specificContext, fallbackContext]
 */
function getContextWithFallback(patch?: string, region?: string): [string, string] {
  const specific = makeContextKey(patch, region);
  return [specific, GLOBAL_CONTEXT];
}

/**
 * Get team threat signal for a specific champion
 */
export function getTeamThreat(query: TeamThreatQuery): ThreatQueryResult {
  const data = loadThreatSignals();
  if (!data) {
    return { signal: null, context: GLOBAL_CONTEXT, isFallback: false };
  }

  const [specificContext, fallbackContext] = getContextWithFallback(query.patch, query.region);

  // Try specific context first
  const specificSignal = data.team[specificContext]?.[query.targetTeamId]?.[query.championId];
  if (specificSignal) {
    return { signal: specificSignal, context: specificContext, isFallback: false };
  }

  // Fallback to global
  const fallbackSignal = data.team[fallbackContext]?.[query.targetTeamId]?.[query.championId];
  if (fallbackSignal) {
    return { signal: fallbackSignal, context: fallbackContext, isFallback: true };
  }

  return { signal: null, context: specificContext, isFallback: false };
}

/**
 * Get player threat signal for a specific champion
 *
 * IMPORTANT: Player-level threats are gated by player champion pool.
 * Returns null if the player has not played this champion >= MIN_PICKS_FOR_PLAYER_THREAT times.
 * This prevents nonsensical attributions (e.g., Bard threat for a top laner).
 */
export function getPlayerThreat(query: PlayerThreatQuery): ThreatQueryResult {
  const data = loadThreatSignals();
  if (!data) {
    return { signal: null, context: GLOBAL_CONTEXT, isFallback: false };
  }

  // GATING: Check if player can realistically play this champion
  if (!playerCanPlayChampion(query.playerId, query.championId)) {
    // Player has not played this champion enough - do not return threat signal
    return { signal: null, context: GLOBAL_CONTEXT, isFallback: false };
  }

  const [specificContext, fallbackContext] = getContextWithFallback(query.patch, query.region);

  // Try specific context first
  const specificSignal = data.player[specificContext]?.[query.playerId]?.[query.championId];
  if (specificSignal) {
    return { signal: specificSignal, context: specificContext, isFallback: false };
  }

  // Fallback to global
  const fallbackSignal = data.player[fallbackContext]?.[query.playerId]?.[query.championId];
  if (fallbackSignal) {
    return { signal: fallbackSignal, context: fallbackContext, isFallback: true };
  }

  return { signal: null, context: specificContext, isFallback: false };
}

/**
 * Get top threats for a target team
 */
export function getTopThreatsForTargetTeam(query: TopTeamThreatsQuery): TopThreatsResult {
  const data = loadThreatSignals();
  const topK = query.topK || THREAT_CONFIG.defaultTopK;

  if (!data) {
    return { threats: [], context: GLOBAL_CONTEXT, isFallback: false };
  }

  const [specificContext, fallbackContext] = getContextWithFallback(query.patch, query.region);

  // Try specific context first
  let teamSignals = data.team[specificContext]?.[query.targetTeamId];
  let usedContext = specificContext;
  let isFallback = false;

  if (!teamSignals || Object.keys(teamSignals).length === 0) {
    teamSignals = data.team[fallbackContext]?.[query.targetTeamId];
    usedContext = fallbackContext;
    isFallback = true;
  }

  if (!teamSignals) {
    return { threats: [], context: usedContext, isFallback };
  }

  // Sort by score descending and take top K
  const threats = Object.values(teamSignals)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return { threats, context: usedContext, isFallback };
}

/**
 * Get top threats for a player
 *
 * IMPORTANT: Results are filtered by player champion pool.
 * Only champions the player has played >= MIN_PICKS_FOR_PLAYER_THREAT times are included.
 */
export function getTopThreatsForPlayer(query: TopPlayerThreatsQuery): TopThreatsResult {
  const data = loadThreatSignals();
  const topK = query.topK || THREAT_CONFIG.defaultTopK;

  if (!data) {
    return { threats: [], context: GLOBAL_CONTEXT, isFallback: false };
  }

  const [specificContext, fallbackContext] = getContextWithFallback(query.patch, query.region);

  // Try specific context first
  let playerSignals = data.player[specificContext]?.[query.playerId];
  let usedContext = specificContext;
  let isFallback = false;

  if (!playerSignals || Object.keys(playerSignals).length === 0) {
    playerSignals = data.player[fallbackContext]?.[query.playerId];
    usedContext = fallbackContext;
    isFallback = true;
  }

  if (!playerSignals) {
    return { threats: [], context: usedContext, isFallback };
  }

  // GATING: Filter to only champions the player can realistically play
  const filteredSignals = Object.values(playerSignals).filter(signal =>
    playerCanPlayChampion(query.playerId, signal.championName)
  );

  // Sort by score descending and take top K
  const threats = filteredSignals
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return { threats, context: usedContext, isFallback };
}

/**
 * Get all threats for a team (all champions)
 */
export function getAllTeamThreats(
  targetTeamId: string,
  patch?: string,
  region?: string
): Record<string, ThreatSignal> {
  const data = loadThreatSignals();
  if (!data) return {};

  const [specificContext, fallbackContext] = getContextWithFallback(patch, region);

  let teamSignals = data.team[specificContext]?.[targetTeamId];
  if (!teamSignals || Object.keys(teamSignals).length === 0) {
    teamSignals = data.team[fallbackContext]?.[targetTeamId];
  }

  return teamSignals || {};
}

/**
 * Get all threats for a player (all champions)
 *
 * IMPORTANT: Results are filtered by player champion pool.
 * Only champions the player has played >= MIN_PICKS_FOR_PLAYER_THREAT times are included.
 */
export function getAllPlayerThreats(
  playerId: string,
  patch?: string,
  region?: string
): Record<string, ThreatSignal> {
  const data = loadThreatSignals();
  if (!data) return {};

  const [specificContext, fallbackContext] = getContextWithFallback(patch, region);

  let playerSignals = data.player[specificContext]?.[playerId];
  if (!playerSignals || Object.keys(playerSignals).length === 0) {
    playerSignals = data.player[fallbackContext]?.[playerId];
  }

  if (!playerSignals) return {};

  // GATING: Filter to only champions the player can realistically play
  const filtered: Record<string, ThreatSignal> = {};
  for (const [champId, signal] of Object.entries(playerSignals)) {
    if (playerCanPlayChampion(playerId, signal.championName)) {
      filtered[champId] = signal;
    }
  }

  return filtered;
}

/**
 * Determine threat level based on score percentile
 * High = top 20%, Moderate = top 40%, Low = rest
 */
export function getThreatLevel(score: number, allScores: number[]): ThreatLevel {
  if (allScores.length === 0) return 'low';

  const sorted = [...allScores].sort((a, b) => b - a);
  const highThreshold = sorted[Math.floor(sorted.length * 0.2)] || 0;
  const moderateThreshold = sorted[Math.floor(sorted.length * 0.4)] || 0;

  if (score >= highThreshold) return 'high';
  if (score >= moderateThreshold) return 'moderate';
  return 'low';
}

/**
 * Get threat level for a specific signal within a team's context
 */
export function getTeamThreatLevel(
  targetTeamId: string,
  championId: string,
  patch?: string,
  region?: string
): ThreatLevel {
  const allThreats = getAllTeamThreats(targetTeamId, patch, region);
  const allScores = Object.values(allThreats).map(t => t.score);
  const signal = allThreats[championId];

  if (!signal) return 'low';
  return getThreatLevel(signal.score, allScores);
}

/**
 * Batch query for multiple champions against a team
 */
export function batchGetTeamThreats(
  targetTeamId: string,
  championIds: string[],
  patch?: string,
  region?: string
): Map<string, ThreatQueryResult> {
  const results = new Map<string, ThreatQueryResult>();
  const allThreats = getAllTeamThreats(targetTeamId, patch, region);
  const [specificContext] = getContextWithFallback(patch, region);

  for (const championId of championIds) {
    const signal = allThreats[championId] || null;
    const isFallback = signal ? signal.context !== specificContext : false;
    results.set(championId, {
      signal,
      context: signal?.context || specificContext,
      isFallback,
    });
  }

  return results;
}

/**
 * Get combined threat evidence for a champion against a team
 * Includes team-level and top player-level threats
 */
export function getCombinedThreatEvidence(
  targetTeamId: string,
  championId: string,
  playerIds: string[],
  patch?: string,
  region?: string
): {
  teamThreat: ThreatSignal | null;
  playerThreats: Array<{ playerId: string; signal: ThreatSignal }>;
} {
  const teamResult = getTeamThreat({
    targetTeamId,
    championId,
    patch,
    region,
  });

  const playerThreats: Array<{ playerId: string; signal: ThreatSignal }> = [];

  for (const playerId of playerIds) {
    const playerResult = getPlayerThreat({
      playerId,
      championId,
      patch,
      region,
    });

    if (playerResult.signal) {
      playerThreats.push({
        playerId,
        signal: playerResult.signal,
      });
    }
  }

  // Sort player threats by score descending
  playerThreats.sort((a, b) => b.signal.score - a.signal.score);

  return {
    teamThreat: teamResult.signal,
    playerThreats: playerThreats.slice(0, 2), // Top 2 players
  };
}

/**
 * Get metadata about the threat signals
 */
export function getThreatMeta(): ThreatSignalsData['meta'] | null {
  const data = loadThreatSignals();
  return data?.meta || null;
}
