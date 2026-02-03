/**
 * League-Aware Posterior Engine
 *
 * Computes champion → role posteriors filtered by league.
 * Loads instance_game_records.json + series.json once at startup,
 * then computes/caches posteriors per league on demand.
 *
 * Uses the same Dirichlet posterior formula as the Python generator:
 *   p(r|c) = (weighted_count(c,r) + κ×q_r) / (weighted_total(c) + κ)
 *
 * For league-specific computation, we use RAW counts (not weighted counts)
 * because the instance_game_records don't have the per-game weights.
 * The global file retains its full weighted posteriors.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import type {
  WeightedRolePosteriorsData,
  ChampionRolePosterior,
  Role,
  RoleDistribution,
  RoleCounts,
} from './weighted-role-types';
import { loadWeightedRolePosteriors } from './weighted-role-loader';
import {
  type LeagueKey,
  TOURNAMENT_TO_LEAGUE,
  UI_LABEL_TO_LEAGUE,
  MIN_LEAGUE_SAMPLE_SIZE,
  isValidLeagueKey,
  LEAGUE_LABELS,
  ALL_LEAGUES,
} from './league-types';

const ROLES: Role[] = ['top', 'jungle', 'mid', 'bot', 'support'];

const ROLE_NORMALIZE: Record<string, Role> = {
  top: 'top',
  jungle: 'jungle',
  mid: 'mid',
  middle: 'mid',
  bot: 'bot',
  bottom: 'bot',
  adc: 'bot',
  support: 'support',
  sup: 'support',
};

// ---------- Raw data types ----------

interface InstanceGameRecord {
  player_name: string;
  team_id: string;
  inferred_role: string;
  champion: string;
  date: string;
  series_id: string;
}

interface SeriesMeta {
  id: string;
  tournament?: {
    name?: string;
    parent?: { name?: string };
  };
}

// ---------- Cache ----------

/**
 * Per-league cache of computed posteriors.
 * Key = LeagueKey string.
 * "global" is always the original loaded file.
 */
const leagueCache = new Map<string, WeightedRolePosteriorsData>();

/** Raw data cache (loaded once) */
let rawDataLoaded = false;
let seriesLeagueMap: Map<string, LeagueKey> | null = null;
let instanceRecords: InstanceGameRecord[] | null = null;
/** champion_name -> champion_id from the global posteriors file */
let championNameToId: Map<string, string> | null = null;

// ---------- Data loading ----------

async function ensureRawDataLoaded(): Promise<void> {
  if (rawDataLoaded) return;

  const dataDir = path.join(process.cwd(), 'data', 'grid_v2');

  // Load series.json for league mapping
  const seriesRaw = await fs.readFile(path.join(dataDir, 'series.json'), 'utf-8');
  const seriesList: SeriesMeta[] = JSON.parse(seriesRaw);

  seriesLeagueMap = new Map();
  for (const s of seriesList) {
    const tournamentName =
      s.tournament?.parent?.name || s.tournament?.name || '';
    let league: LeagueKey | null = null;
    for (const [prefix, l] of Object.entries(TOURNAMENT_TO_LEAGUE)) {
      if (tournamentName.startsWith(prefix)) {
        league = l;
        break;
      }
    }
    if (league && s.id) {
      seriesLeagueMap.set(String(s.id), league);
    }
  }

  // Load instance_game_records.json
  const recordsRaw = await fs.readFile(
    path.join(dataDir, 'instance_game_records.json'),
    'utf-8'
  );
  instanceRecords = JSON.parse(recordsRaw) as InstanceGameRecord[];

  // Build champion_name -> champion_id from global posteriors
  const globalData = await loadWeightedRolePosteriors();
  championNameToId = new Map();
  for (const [name, entry] of Object.entries(globalData.champions)) {
    championNameToId.set(name, entry.champion_id);
  }

  rawDataLoaded = true;
  console.log(
    `[league-posterior-engine] Loaded ${seriesLeagueMap.size} series mappings, ${instanceRecords.length} instance records`
  );
}

// ---------- Posterior computation ----------

function computePosteriorsFromCounts(
  championRoleCounts: Map<string, Map<Role, number>>,
  kappa: number,
  minDisplayThreshold: number
): Record<string, ChampionRolePosterior> {
  // Compute global role distribution q_r
  const roleTotals = new Map<Role, number>();
  let grandTotal = 0;
  for (const roleCounts of championRoleCounts.values()) {
    for (const [role, count] of roleCounts.entries()) {
      roleTotals.set(role, (roleTotals.get(role) || 0) + count);
      grandTotal += count;
    }
  }

  const q: RoleDistribution = {
    top: grandTotal > 0 ? (roleTotals.get('top') || 0) / grandTotal : 0.2,
    jungle: grandTotal > 0 ? (roleTotals.get('jungle') || 0) / grandTotal : 0.2,
    mid: grandTotal > 0 ? (roleTotals.get('mid') || 0) / grandTotal : 0.2,
    bot: grandTotal > 0 ? (roleTotals.get('bot') || 0) / grandTotal : 0.2,
    support: grandTotal > 0 ? (roleTotals.get('support') || 0) / grandTotal : 0.2,
  };

  const champions: Record<string, ChampionRolePosterior> = {};

  for (const [championName, roleCounts] of championRoleCounts.entries()) {
    const totalCount = Array.from(roleCounts.values()).reduce((a, b) => a + b, 0);

    // Compute posterior: p(r|c) = (count(c,r) + κ×q_r) / (total(c) + κ)
    const rawPosterior: Record<string, number> = {};
    for (const role of ROLES) {
      const count = roleCounts.get(role) || 0;
      rawPosterior[role] = (count + kappa * q[role]) / (totalCount + kappa);
    }

    // Normalize
    const posteriorSum = Object.values(rawPosterior).reduce((a, b) => a + b, 0);
    const posterior: RoleDistribution = {
      top: rawPosterior.top / posteriorSum,
      jungle: rawPosterior.jungle / posteriorSum,
      mid: rawPosterior.mid / posteriorSum,
      bot: rawPosterior.bot / posteriorSum,
      support: rawPosterior.support / posteriorSum,
    };

    // Raw counts
    const raw_counts: RoleCounts = {
      top: roleCounts.get('top') || 0,
      jungle: roleCounts.get('jungle') || 0,
      mid: roleCounts.get('mid') || 0,
      bot: roleCounts.get('bot') || 0,
      support: roleCounts.get('support') || 0,
    };

    // Flex metrics
    const significantRoles = ROLES.filter(r => posterior[r] >= minDisplayThreshold);
    const isFlexPick = significantRoles.length > 1;

    // Entropy-based flexibility score
    let entropy = 0;
    for (const role of ROLES) {
      const p = posterior[role];
      if (p > 0) entropy -= p * Math.log2(p);
    }
    const maxEntropy = Math.log2(5);
    const flexibilityScore = maxEntropy > 0 ? entropy / maxEntropy : 0;

    const championId = championNameToId?.get(championName) || '';

    champions[championName] = {
      champion_id: championId,
      champion_name: championName,
      role_probabilities: posterior,
      raw_counts_by_role: raw_counts,
      weighted_counts_by_role: raw_counts, // For league data, weighted = raw
      effective_sample_size: totalCount,
      significantRoles,
      isFlexPick,
      flexibilityScore: Math.round(flexibilityScore * 10000) / 10000,
    };
  }

  return champions;
}

// ---------- Public API ----------

/**
 * Resolve a UI league string (e.g., "LCK", "LPL", "Global", null) to an internal LeagueKey.
 * Always returns a valid LeagueKey, defaulting to 'global'.
 */
export function resolveLeague(uiLeague: string | null | undefined): LeagueKey {
  if (!uiLeague || uiLeague === '') return 'global';

  const trimmed = uiLeague.trim();
  if (!trimmed) return 'global';

  // Try exact match first
  const exactMatch = UI_LABEL_TO_LEAGUE[trimmed];
  if (exactMatch) return exactMatch;

  // Try uppercase match
  const upperMatch = UI_LABEL_TO_LEAGUE[trimmed.toUpperCase()];
  if (upperMatch) return upperMatch;

  // Try lowercase match
  const lowerMatch = UI_LABEL_TO_LEAGUE[trimmed.toLowerCase()];
  if (lowerMatch) return lowerMatch;

  // Check if it's already a valid league key
  if (isValidLeagueKey(trimmed)) return trimmed;
  if (isValidLeagueKey(trimmed.toLowerCase())) return trimmed.toLowerCase() as LeagueKey;

  // Default to global
  return 'global';
}

/**
 * Load weighted role posteriors for a specific league.
 *
 * - "global" returns the original pre-computed posteriors from weighted-role-posteriors.json
 * - Other leagues compute posteriors from instance_game_records.json filtered by league
 * - Results are cached per league
 * - Champions with fewer than MIN_LEAGUE_SAMPLE_SIZE games in the league
 *   are NOT included (caller should fall back to global for those)
 */
export async function loadLeaguePosteriors(
  league: LeagueKey
): Promise<WeightedRolePosteriorsData> {
  // Global = original file
  if (league === 'global') {
    return loadWeightedRolePosteriors();
  }

  // Check cache
  const cached = leagueCache.get(league);
  if (cached) return cached;

  // Ensure raw data is loaded
  await ensureRawDataLoaded();

  if (!seriesLeagueMap || !instanceRecords) {
    // Fallback to global if raw data failed to load
    return loadWeightedRolePosteriors();
  }

  // Filter instance records by league
  const championRoleCounts = new Map<string, Map<Role, number>>();

  for (const record of instanceRecords) {
    const seriesLeague = seriesLeagueMap.get(String(record.series_id));
    if (seriesLeague !== league) continue;

    const champion = record.champion;
    if (!champion) continue;

    const normalizedRole = ROLE_NORMALIZE[record.inferred_role?.toLowerCase()];
    if (!normalizedRole) continue;

    if (!championRoleCounts.has(champion)) {
      championRoleCounts.set(champion, new Map());
    }
    const roleCounts = championRoleCounts.get(champion)!;
    roleCounts.set(normalizedRole, (roleCounts.get(normalizedRole) || 0) + 1);
  }

  // Load global data for metadata reference
  const globalData = await loadWeightedRolePosteriors();

  // Use same kappa and threshold as global
  const kappa = globalData.metadata.parameters.kappa;
  const minDisplayThreshold = globalData.metadata.parameters.min_display_threshold;

  const leagueChampions = computePosteriorsFromCounts(
    championRoleCounts,
    kappa,
    minDisplayThreshold
  );

  // Count total records for this league
  let totalRecords = 0;
  for (const roleCounts of championRoleCounts.values()) {
    for (const count of roleCounts.values()) {
      totalRecords += count;
    }
  }

  const result: WeightedRolePosteriorsData = {
    metadata: {
      ...globalData.metadata,
      // Override total stats for league
      total_effective_weight: totalRecords,
    },
    champions: leagueChampions,
  };

  // Cache it
  leagueCache.set(league, result);
  console.log(
    `[league-posterior-engine] Computed ${league}: ${Object.keys(leagueChampions).length} champions from ${totalRecords} records`
  );

  return result;
}

/**
 * Get posteriors for a specific league with per-champion fallback to global.
 *
 * Returns a merged dataset where:
 * - Champions with enough data in the league use league posteriors
 * - Champions with insufficient data fall back to global posteriors
 * - Each entry has a `leagueSource` field indicating which data was used
 */
export async function loadLeaguePosteriorsWithFallback(
  league: LeagueKey
): Promise<{
  data: WeightedRolePosteriorsData;
  fallbackChampions: Set<string>;
  leagueTotalGames: number;
}> {
  if (league === 'global') {
    const data = await loadWeightedRolePosteriors();
    return { data, fallbackChampions: new Set(), leagueTotalGames: 0 };
  }

  const [globalData, leagueData] = await Promise.all([
    loadWeightedRolePosteriors(),
    loadLeaguePosteriors(league),
  ]);

  const mergedChampions: Record<string, ChampionRolePosterior> = {};
  const fallbackChampions = new Set<string>();

  // Start with all global champions
  for (const [name, globalEntry] of Object.entries(globalData.champions)) {
    const leagueEntry = leagueData.champions[name];

    if (leagueEntry) {
      // Check if league has enough data
      const totalObserved =
        leagueEntry.raw_counts_by_role.top +
        leagueEntry.raw_counts_by_role.jungle +
        leagueEntry.raw_counts_by_role.mid +
        leagueEntry.raw_counts_by_role.bot +
        leagueEntry.raw_counts_by_role.support;

      if (totalObserved >= MIN_LEAGUE_SAMPLE_SIZE) {
        mergedChampions[name] = leagueEntry;
      } else {
        mergedChampions[name] = globalEntry;
        fallbackChampions.add(name);
      }
    } else {
      // Champion not in this league at all — fall back to global
      mergedChampions[name] = globalEntry;
      fallbackChampions.add(name);
    }
  }

  // Also include league-only champions not in global (unlikely but safe)
  for (const [name, leagueEntry] of Object.entries(leagueData.champions)) {
    if (!mergedChampions[name]) {
      mergedChampions[name] = leagueEntry;
    }
  }

  const leagueTotalGames = Math.round(leagueData.metadata.total_effective_weight);

  return {
    data: {
      metadata: globalData.metadata,
      champions: mergedChampions,
    },
    fallbackChampions,
    leagueTotalGames,
  };
}

/**
 * Clear league cache (useful for testing or data refresh)
 */
export function clearLeagueCache(): void {
  leagueCache.clear();
  rawDataLoaded = false;
  seriesLeagueMap = null;
  instanceRecords = null;
  championNameToId = null;
}

/**
 * Get the series_id → LeagueKey mapping.
 * Ensures raw data is loaded first.
 */
export async function getSeriesLeagueMap(): Promise<Map<string, LeagueKey>> {
  await ensureRawDataLoaded();
  return seriesLeagueMap || new Map();
}

// Re-export for convenience
export {
  type LeagueKey,
  LEAGUE_LABELS,
  ALL_LEAGUES,
  isValidLeagueKey,
} from './league-types';
