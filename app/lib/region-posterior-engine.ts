/**
 * Region-Aware Posterior Engine
 *
 * Computes champion → role posteriors filtered by region.
 * Loads instance_game_records.json + series.json once at startup,
 * then computes/caches posteriors per region on demand.
 *
 * Uses the same Dirichlet posterior formula as the Python generator:
 *   p(r|c) = (weighted_count(c,r) + κ×q_r) / (weighted_total(c) + κ)
 *
 * For region-specific computation, we use RAW counts (not weighted counts)
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
  type RoleRegion,
  TOURNAMENT_TO_REGION,
  UI_REGION_TO_INTERNAL,
  MIN_REGION_SAMPLE_SIZE,
} from './region-types';

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
 * Per-region cache of computed posteriors.
 * Key = RoleRegion string.
 * "global" is always the original loaded file.
 */
const regionCache = new Map<string, WeightedRolePosteriorsData>();

/** Raw data cache (loaded once) */
let rawDataLoaded = false;
let seriesRegionMap: Map<string, RoleRegion> | null = null;
let instanceRecords: InstanceGameRecord[] | null = null;
/** champion_name -> champion_id from the global posteriors file */
let championNameToId: Map<string, string> | null = null;

// ---------- Data loading ----------

async function ensureRawDataLoaded(): Promise<void> {
  if (rawDataLoaded) return;

  const dataDir = path.join(process.cwd(), 'data', 'grid_v2');

  // Load series.json for region mapping
  const seriesRaw = await fs.readFile(path.join(dataDir, 'series.json'), 'utf-8');
  const seriesList: SeriesMeta[] = JSON.parse(seriesRaw);

  seriesRegionMap = new Map();
  for (const s of seriesList) {
    const tournamentName =
      s.tournament?.parent?.name || s.tournament?.name || '';
    let region: RoleRegion | null = null;
    for (const [prefix, r] of Object.entries(TOURNAMENT_TO_REGION)) {
      if (tournamentName.startsWith(prefix)) {
        region = r;
        break;
      }
    }
    if (region && s.id) {
      seriesRegionMap.set(String(s.id), region);
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
    `[region-posterior-engine] Loaded ${seriesRegionMap.size} series mappings, ${instanceRecords.length} instance records`
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
      weighted_counts_by_role: raw_counts, // For region data, weighted = raw
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
 * Resolve a UI region string (e.g., "LCK", "LPL", null) to an internal RoleRegion.
 */
export function resolveRegion(uiRegion: string | null | undefined): RoleRegion {
  if (!uiRegion) return 'global';
  const lower = uiRegion.toLowerCase();
  return (
    UI_REGION_TO_INTERNAL[uiRegion] ||
    UI_REGION_TO_INTERNAL[uiRegion.toUpperCase()] ||
    (lower as RoleRegion) ||
    'global'
  );
}

/**
 * Load weighted role posteriors for a specific region.
 *
 * - "global" returns the original pre-computed posteriors from weighted-role-posteriors.json
 * - Other regions compute posteriors from instance_game_records.json filtered by region
 * - Results are cached per region
 * - Champions with fewer than MIN_REGION_SAMPLE_SIZE games in the region
 *   are NOT included (caller should fall back to global for those)
 */
export async function loadRegionPosteriors(
  region: RoleRegion
): Promise<WeightedRolePosteriorsData> {
  // Global = original file
  if (region === 'global') {
    return loadWeightedRolePosteriors();
  }

  // Check cache
  const cached = regionCache.get(region);
  if (cached) return cached;

  // Ensure raw data is loaded
  await ensureRawDataLoaded();

  if (!seriesRegionMap || !instanceRecords) {
    // Fallback to global if raw data failed to load
    return loadWeightedRolePosteriors();
  }

  // Filter instance records by region
  const championRoleCounts = new Map<string, Map<Role, number>>();

  for (const record of instanceRecords) {
    const seriesRegion = seriesRegionMap.get(String(record.series_id));
    if (seriesRegion !== region) continue;

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

  const regionChampions = computePosteriorsFromCounts(
    championRoleCounts,
    kappa,
    minDisplayThreshold
  );

  // Count total records for this region
  let totalRecords = 0;
  for (const roleCounts of championRoleCounts.values()) {
    for (const count of roleCounts.values()) {
      totalRecords += count;
    }
  }

  const result: WeightedRolePosteriorsData = {
    metadata: {
      ...globalData.metadata,
      // Override total stats for region
      total_effective_weight: totalRecords,
    },
    champions: regionChampions,
  };

  // Cache it
  regionCache.set(region, result);
  console.log(
    `[region-posterior-engine] Computed ${region}: ${Object.keys(regionChampions).length} champions from ${totalRecords} records`
  );

  return result;
}

/**
 * Get posteriors for a specific region with per-champion fallback to global.
 *
 * Returns a merged dataset where:
 * - Champions with enough data in the region use region posteriors
 * - Champions with insufficient data fall back to global posteriors
 * - Each entry has a `regionSource` field indicating which data was used
 */
export async function loadRegionPosteriorsWithFallback(
  region: RoleRegion
): Promise<{
  data: WeightedRolePosteriorsData;
  fallbackChampions: Set<string>;
  regionTotalGames: number;
}> {
  if (region === 'global') {
    const data = await loadWeightedRolePosteriors();
    return { data, fallbackChampions: new Set(), regionTotalGames: 0 };
  }

  const [globalData, regionData] = await Promise.all([
    loadWeightedRolePosteriors(),
    loadRegionPosteriors(region),
  ]);

  const mergedChampions: Record<string, ChampionRolePosterior> = {};
  const fallbackChampions = new Set<string>();

  // Start with all global champions
  for (const [name, globalEntry] of Object.entries(globalData.champions)) {
    const regionEntry = regionData.champions[name];

    if (regionEntry) {
      // Check if region has enough data
      const totalObserved =
        regionEntry.raw_counts_by_role.top +
        regionEntry.raw_counts_by_role.jungle +
        regionEntry.raw_counts_by_role.mid +
        regionEntry.raw_counts_by_role.bot +
        regionEntry.raw_counts_by_role.support;

      if (totalObserved >= MIN_REGION_SAMPLE_SIZE) {
        mergedChampions[name] = regionEntry;
      } else {
        mergedChampions[name] = globalEntry;
        fallbackChampions.add(name);
      }
    } else {
      // Champion not in this region at all — fall back to global
      mergedChampions[name] = globalEntry;
      fallbackChampions.add(name);
    }
  }

  // Also include region-only champions not in global (unlikely but safe)
  for (const [name, regionEntry] of Object.entries(regionData.champions)) {
    if (!mergedChampions[name]) {
      mergedChampions[name] = regionEntry;
    }
  }

  const regionTotalGames = Math.round(regionData.metadata.total_effective_weight);

  return {
    data: {
      metadata: globalData.metadata,
      champions: mergedChampions,
    },
    fallbackChampions,
    regionTotalGames,
  };
}

/**
 * Clear region cache (useful for testing or data refresh)
 */
export function clearRegionCache(): void {
  regionCache.clear();
  rawDataLoaded = false;
  seriesRegionMap = null;
  instanceRecords = null;
  championNameToId = null;
}
