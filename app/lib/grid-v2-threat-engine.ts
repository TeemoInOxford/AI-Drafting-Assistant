/**
 * Grid V2 Threat Engine
 *
 * New threat signal engine using grid_v2 data files:
 * - team_threat_signals.json for TEAM_DENIAL signals
 * - player_threat_signals.json for PLAYER_SPECIALTY signals
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types - Team Threat (TEAM_DENIAL)
// ============================================================================

export interface ThreatEntry {
  team_id: string;
  team_name: string;
  champion_name: string;
  score: number;
  components: {
    OPPONENT_BAN: number;
    META: number;
    SELF: number;
  };
  sample_size: number;
  evidence: {
    top_opponent_teams: Array<{ team_name: string; count: number }>;
    raw_scores: {
      opponent_ban_weighted: number;
      meta_ban_rate: number;
      self_ban_rate: number;
    };
  };
}

export interface ThreatSignalsData {
  generated_at: string;
  beta: number;
  gamma: number;
  target_patch_index: number;
  total_teams: number;
  total_entries: number;
  entries: ThreatEntry[];
}

export interface GridV2ThreatSignal {
  champion_name: string;
  score: number;
  components: {
    OPPONENT_BAN: number;
    META: number;
    SELF: number;
  };
  sample_size: number;
  evidence: {
    top_opponent_teams: Array<{ team_name: string; count: number }>;
    raw_scores: {
      opponent_ban_weighted: number;
      meta_ban_rate: number;
      self_ban_rate: number;
    };
  };
}

// ============================================================================
// Types - Player Threat (PLAYER_SPECIALTY)
// ============================================================================

export interface TopPlayerEvidence {
  player_id: string;
  player_name: string;
  games_weighted: number;
  win_rate_weighted: number;
  last_played_patch: string;
}

export interface PlayerThreatEntry {
  team_id: string;
  team_name: string;
  champion_name: string;
  score: number;
  components: {
    TEAM_POOL: number;
    TOP_PLAYER: number;
    RECENCY: number;
  };
  sample_size: number;
  players_count: number;
  evidence: {
    top_players: TopPlayerEvidence[];
    raw_scores: {
      team_pool: number;
      top_player: number;
      recency: number;
    };
  };
}

export interface PlayerThreatSignalsData {
  generated_at: string;
  beta: number;
  gamma: number;
  target_patch_index: number;
  source_file: string;
  total_teams: number;
  total_entries: number;
  entries: PlayerThreatEntry[];
}

export interface GridV2PlayerThreatSignal {
  champion_name: string;
  score: number;
  components: {
    TEAM_POOL: number;
    TOP_PLAYER: number;
    RECENCY: number;
  };
  sample_size: number;
  players_count: number;
  evidence: {
    top_players: TopPlayerEvidence[];
    raw_scores: {
      team_pool: number;
      top_player: number;
      recency: number;
    };
  };
}

// ============================================================================
// Cache - Team Threat
// ============================================================================

let cachedData: ThreatSignalsData | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Indexed by team_id -> champion_name -> ThreatEntry
let indexedData: Map<string, Map<string, ThreatEntry>> | null = null;

// ============================================================================
// Cache - Player Threat
// ============================================================================

let cachedPlayerData: PlayerThreatSignalsData | null = null;
let playerCacheTimestamp: number = 0;

// Indexed by team_id -> champion_name -> PlayerThreatEntry
let indexedPlayerData: Map<string, Map<string, PlayerThreatEntry>> | null = null;

// ============================================================================
// Data Loading
// ============================================================================

function loadThreatSignals(): ThreatSignalsData {
  const now = Date.now();

  // Return cached data if still valid
  if (cachedData && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedData;
  }

  const filePath = path.join(process.cwd(), 'data', 'grid_v2', 'team_threat_signals.json');

  if (!fs.existsSync(filePath)) {
    throw new Error('team_threat_signals.json not found. Run generate_team_threat_signals.ts first.');
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  cachedData = JSON.parse(content);
  cacheTimestamp = now;

  // Build index
  indexedData = new Map();
  for (const entry of cachedData!.entries) {
    if (!indexedData.has(entry.team_id)) {
      indexedData.set(entry.team_id, new Map());
    }
    indexedData.get(entry.team_id)!.set(entry.champion_name, entry);
  }

  return cachedData!;
}

/**
 * Load player threat signals with caching
 */
function loadPlayerThreatSignals(): PlayerThreatSignalsData {
  const now = Date.now();

  // Return cached data if still valid
  if (cachedPlayerData && (now - playerCacheTimestamp) < CACHE_TTL_MS) {
    return cachedPlayerData;
  }

  const filePath = path.join(process.cwd(), 'data', 'grid_v2', 'player_threat_signals.json');

  if (!fs.existsSync(filePath)) {
    throw new Error('player_threat_signals.json not found. Run generate_player_threat_signals.ts first.');
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  cachedPlayerData = JSON.parse(content);
  playerCacheTimestamp = now;

  // Build index
  indexedPlayerData = new Map();
  for (const entry of cachedPlayerData!.entries) {
    if (!indexedPlayerData.has(entry.team_id)) {
      indexedPlayerData.set(entry.team_id, new Map());
    }
    indexedPlayerData.get(entry.team_id)!.set(entry.champion_name, entry);
  }

  return cachedPlayerData!;
}

// ============================================================================
// Query Functions - Team Threat (TEAM_DENIAL)
// ============================================================================

/**
 * Get threat signal for a specific team and champion
 */
export function getGridV2TeamThreat(
  targetTeamId: string,
  championName: string
): GridV2ThreatSignal | null {
  loadThreatSignals();

  if (!indexedData) return null;

  const teamMap = indexedData.get(targetTeamId);
  if (!teamMap) return null;

  const entry = teamMap.get(championName);
  if (!entry) return null;

  return {
    champion_name: entry.champion_name,
    score: entry.score,
    components: entry.components,
    sample_size: entry.sample_size,
    evidence: entry.evidence,
  };
}

/**
 * Get all threat signals for a team
 * Returns a map: champion_name -> ThreatSignal
 */
export function getGridV2AllTeamThreats(
  targetTeamId: string
): Record<string, GridV2ThreatSignal> {
  loadThreatSignals();

  if (!indexedData) return {};

  const teamMap = indexedData.get(targetTeamId);
  if (!teamMap) return {};

  const result: Record<string, GridV2ThreatSignal> = {};
  for (const [championName, entry] of teamMap) {
    result[championName] = {
      champion_name: entry.champion_name,
      score: entry.score,
      components: entry.components,
      sample_size: entry.sample_size,
      evidence: entry.evidence,
    };
  }

  return result;
}

/**
 * Get top threats for a team (sorted by score)
 */
export function getGridV2TopTeamThreats(
  targetTeamId: string,
  topK: number = 10
): GridV2ThreatSignal[] {
  loadThreatSignals();

  if (!indexedData) return [];

  const teamMap = indexedData.get(targetTeamId);
  if (!teamMap) return [];

  return Array.from(teamMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(entry => ({
      champion_name: entry.champion_name,
      score: entry.score,
      components: entry.components,
      sample_size: entry.sample_size,
      evidence: entry.evidence,
    }));
}

/**
 * Get metadata about the threat signals data
 */
export function getGridV2ThreatMeta(): {
  generated_at: string;
  beta: number;
  gamma: number;
  target_patch_index: number;
  total_teams: number;
  total_entries: number;
} {
  const data = loadThreatSignals();
  return {
    generated_at: data.generated_at,
    beta: data.beta,
    gamma: data.gamma,
    target_patch_index: data.target_patch_index,
    total_teams: data.total_teams,
    total_entries: data.total_entries,
  };
}

/**
 * Batch get threats for multiple champions
 */
export function batchGetGridV2TeamThreats(
  targetTeamId: string,
  championNames: string[]
): Map<string, GridV2ThreatSignal | null> {
  loadThreatSignals();

  const result = new Map<string, GridV2ThreatSignal | null>();

  if (!indexedData) {
    for (const name of championNames) {
      result.set(name, null);
    }
    return result;
  }

  const teamMap = indexedData.get(targetTeamId);

  for (const name of championNames) {
    if (!teamMap) {
      result.set(name, null);
      continue;
    }

    const entry = teamMap.get(name);
    if (!entry) {
      result.set(name, null);
      continue;
    }

    result.set(name, {
      champion_name: entry.champion_name,
      score: entry.score,
      components: entry.components,
      sample_size: entry.sample_size,
      evidence: entry.evidence,
    });
  }

  return result;
}

// ============================================================================
// Query Functions - Player Threat (PLAYER_SPECIALTY)
// ============================================================================

/**
 * Get player threat signal for a specific team and champion
 */
export function getGridV2PlayerThreat(
  targetTeamId: string,
  championName: string
): GridV2PlayerThreatSignal | null {
  loadPlayerThreatSignals();

  if (!indexedPlayerData) return null;

  const teamMap = indexedPlayerData.get(targetTeamId);
  if (!teamMap) return null;

  const entry = teamMap.get(championName);
  if (!entry) return null;

  return {
    champion_name: entry.champion_name,
    score: entry.score,
    components: entry.components,
    sample_size: entry.sample_size,
    players_count: entry.players_count,
    evidence: entry.evidence,
  };
}

/**
 * Get all player threat signals for a team
 */
export function getGridV2AllPlayerTeamThreats(
  targetTeamId: string
): Record<string, GridV2PlayerThreatSignal> {
  loadPlayerThreatSignals();

  if (!indexedPlayerData) return {};

  const teamMap = indexedPlayerData.get(targetTeamId);
  if (!teamMap) return {};

  const result: Record<string, GridV2PlayerThreatSignal> = {};
  for (const [championName, entry] of teamMap) {
    result[championName] = {
      champion_name: entry.champion_name,
      score: entry.score,
      components: entry.components,
      sample_size: entry.sample_size,
      players_count: entry.players_count,
      evidence: entry.evidence,
    };
  }

  return result;
}

/**
 * Get top player threats for a team (sorted by score)
 */
export function getGridV2TopPlayerTeamThreats(
  targetTeamId: string,
  topK: number = 10
): GridV2PlayerThreatSignal[] {
  loadPlayerThreatSignals();

  if (!indexedPlayerData) return [];

  const teamMap = indexedPlayerData.get(targetTeamId);
  if (!teamMap) return [];

  return Array.from(teamMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(entry => ({
      champion_name: entry.champion_name,
      score: entry.score,
      components: entry.components,
      sample_size: entry.sample_size,
      players_count: entry.players_count,
      evidence: entry.evidence,
    }));
}

/**
 * Get metadata about the player threat signals data
 */
export function getGridV2PlayerThreatMeta(): {
  generated_at: string;
  beta: number;
  gamma: number;
  target_patch_index: number;
  source_file: string;
  total_teams: number;
  total_entries: number;
} {
  const data = loadPlayerThreatSignals();
  return {
    generated_at: data.generated_at,
    beta: data.beta,
    gamma: data.gamma,
    target_patch_index: data.target_patch_index,
    source_file: data.source_file,
    total_teams: data.total_teams,
    total_entries: data.total_entries,
  };
}

/**
 * Batch get player threats for multiple champions
 */
export function batchGetGridV2PlayerTeamThreats(
  targetTeamId: string,
  championNames: string[]
): Map<string, GridV2PlayerThreatSignal | null> {
  loadPlayerThreatSignals();

  const result = new Map<string, GridV2PlayerThreatSignal | null>();

  if (!indexedPlayerData) {
    for (const name of championNames) {
      result.set(name, null);
    }
    return result;
  }

  const teamMap = indexedPlayerData.get(targetTeamId);

  for (const name of championNames) {
    if (!teamMap) {
      result.set(name, null);
      continue;
    }

    const entry = teamMap.get(name);
    if (!entry) {
      result.set(name, null);
      continue;
    }

    result.set(name, {
      champion_name: entry.champion_name,
      score: entry.score,
      components: entry.components,
      sample_size: entry.sample_size,
      players_count: entry.players_count,
      evidence: entry.evidence,
    });
  }

  return result;
}
