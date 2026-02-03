/**
 * Pick Candidate Engine
 *
 * Generates pick candidates for the Drafting Assistant during pick phase (steps 6-19).
 * Implements PTS v1 scoring with percentile-based ranking (no hardcoded constants).
 *
 * Data Sources:
 * - MetaCandidates: today_* (presence/pickRate) top 10
 * - ComfortCandidates: player_pool_by_team (our team's player pools) top 10
 * - PredictionCandidates: /api/pick-prediction top 5
 * - DenyCandidates: opponent player_threat (steal their strong picks) top 5
 * - FlexCandidates: role flexibility data
 *
 * PTS v1 Formula (percentile-based):
 * For each dimension, rank within candidates → percentile ∈ [0, 1]
 * pts_raw = meta_rank + comfort_rank + predict_rank + deny_rank + flex_rank
 * share = rank / sum(ranks)
 *
 * Output: 12-20 candidates sorted by pts_score with why-pick reasons
 */

// ============================================================================
// Types
// ============================================================================

export type PickReasonType = 'META' | 'COMFORT' | 'PREDICT' | 'DENY' | 'FLEX' | 'SYNERGY' | 'COUNTER';

export interface PickReason {
  type: PickReasonType;
  label: string;
  shortLabel: string;
  value: number;
  rank?: number;
  rankTotal?: number;
  details: {
    // META details
    presence?: number;
    pickRate?: number;
    // COMFORT details
    playerName?: string;
    gamesWeighted?: number;
    winRate?: number;
    playersCount?: number;
    // PREDICT details
    probability?: number;
    baseRate?: number;
    responseBoost?: number;
    // DENY details
    opponentPlayerName?: string;
    opponentGamesWeighted?: number;
    // FLEX details
    flexScore?: number;
    roles?: string[];
    // SYNERGY details
    synergyPartner?: string;
    synergyLift?: number;
    synergyWinRate?: number;
    synergySampleSize?: number;
    // COUNTER details
    counterTarget?: string;
    counterRole?: string;
    counterWinRate?: number;
    counterSampleSize?: number;
  };
}

export interface PickPTSComponents {
  raw_meta: number;
  raw_comfort: number;
  raw_predict: number;
  raw_deny: number;
  raw_flex: number;
  raw_synergy: number;
  raw_counter: number;
  rank_meta: number;
  rank_comfort: number;
  rank_predict: number;
  rank_deny: number;
  rank_flex: number;
  rank_synergy: number;
  rank_counter: number;
  share_meta: number;
  share_comfort: number;
  share_predict: number;
  share_deny: number;
  share_flex: number;
  share_synergy: number;
  share_counter: number;
}

export interface PickCandidate {
  championName: string;
  championId?: string;
  championImage?: string;
  pts_score: number;
  pts_components: PickPTSComponents;
  reasons: PickReason[];
  source: 'meta' | 'comfort' | 'predict' | 'deny' | 'flex' | 'combined';
  // Raw data for evidence
  metaData?: { presence: number; pickRate: number };
  comfortData?: {
    playerName: string;
    gamesWeighted: number;
    winRate: number;
    playersCount: number;
  };
  predictData?: { probability: number; baseRate?: number; responseBoost?: number };
  denyData?: { opponentPlayerName: string; gamesWeighted: number };
  flexData?: { flexScore: number; roles: string[] };
  synergyData?: { partner: string; lift: number; winRate: number; sampleSize: number };
  counterData?: { target: string; role: string; winRate: number; sampleSize: number };
}

export interface PickCandidateInput {
  ourTeamId: string | null;
  opponentTeamId: string | null;
  alreadyPicked: string[];
  alreadyBanned: string[];
  league?: string;
  // Pre-fetched data
  metaData?: Array<{ name: string; presence: number; pickRate: number }>;
  comfortData?: Record<string, { playerName: string; gamesWeighted: number; winRate: number; playersCount: number }>;
  predictData?: Array<{ champion: string; probability: number; base_rate?: number; response_boost?: number }>;
  denyData?: Record<string, { playerName: string; gamesWeighted: number }>;
  flexData?: Record<string, { flexScore: number; roles: string[] }>;
  // Synergy data: champion -> best synergy with our current allies
  synergyData?: Record<string, { partner: string; lift: number; winRate: number; sampleSize: number }>;
  // Counter data: champion -> counter info against enemy picks (same role)
  counterData?: Record<string, { target: string; role: string; winRate: number; sampleSize: number }>;
  // Context for synergy/counter calculation
  ourAlreadyPicked?: string[];
  enemyAlreadyPicked?: string[];
  // Fix 1: Changed to use champion IDs instead of names
  // Additional disabled champion IDs (e.g., fearless pool) - merged with alreadyPicked + alreadyBanned
  additionalDisabledIds?: string[];
  // Champion ID mapping: lowercase name -> championId (required for ID-based filtering)
  championIdMap?: Map<string, string>;
}

export interface PickCandidateResult {
  candidates: PickCandidate[];
  meta: {
    totalCandidates: number;
    fromMeta: number;
    fromComfort: number;
    fromPredict: number;
    fromDeny: number;
    filteredUsed: number;
  };
}

// ============================================================================
// Reason Labels
// ============================================================================

export const PICK_REASON_LABELS: Record<PickReasonType, { label: string; shortLabel: string; icon: string; color: string }> = {
  META: {
    label: 'Meta Priority',
    shortLabel: 'Meta',
    icon: '📊',
    color: 'text-slate-300 bg-slate-500/20 border-slate-500/40',
  },
  COMFORT: {
    label: 'Player Comfort',
    shortLabel: 'Comfort',
    icon: '💪',
    color: 'text-green-300 bg-green-500/20 border-green-500/40',
  },
  PREDICT: {
    label: 'Predicted Pick',
    shortLabel: 'Predict',
    icon: '🔮',
    color: 'text-cyan-300 bg-cyan-500/20 border-cyan-500/40',
  },
  DENY: {
    label: 'Deny Opponent',
    shortLabel: 'Deny',
    icon: '🚫',
    color: 'text-red-300 bg-red-500/20 border-red-500/40',
  },
  FLEX: {
    label: 'Flex Pick',
    shortLabel: 'Flex',
    icon: '🔄',
    color: 'text-amber-300 bg-amber-500/20 border-amber-500/40',
  },
  SYNERGY: {
    label: 'Team Synergy',
    shortLabel: 'Synergy',
    icon: '🤝',
    color: 'text-purple-300 bg-purple-500/20 border-purple-500/40',
  },
  COUNTER: {
    label: 'Counter Pick',
    shortLabel: 'Counter',
    icon: '⚔️',
    color: 'text-orange-300 bg-orange-500/20 border-orange-500/40',
  },
};

// ============================================================================
// Debug logging (max 10 warnings to avoid spam)
// ============================================================================

let _normalizeWarningCount = 0;
const MAX_NORMALIZE_WARNINGS = 10;

function debugWarnInvalidCandidate(source: string, raw: unknown): void {
  if (process.env.NODE_ENV === 'development' && _normalizeWarningCount < MAX_NORMALIZE_WARNINGS) {
    _normalizeWarningCount++;
    console.warn(`[pick-candidate-engine] Filtered invalid candidate from ${source}:`,
      typeof raw === 'object' && raw !== null
        ? JSON.stringify(raw).slice(0, 200)
        : String(raw)
    );
  }
}

// Reset warning count (for testing)
export function resetNormalizeWarnings(): void {
  _normalizeWarningCount = 0;
}

// ============================================================================
// Input Normalization
// ============================================================================

/**
 * Extract championName from various possible field names.
 * Returns null if no valid name found.
 */
function extractChampionName(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;

  const obj = raw as Record<string, unknown>;

  // Try various field names in order of preference
  const name = obj.championName ?? obj.champion ?? obj.name ?? obj.champion_name;

  // Handle nested champion object: { champion: { name: 'Azir' } }
  if (typeof obj.champion === 'object' && obj.champion !== null) {
    const nested = (obj.champion as Record<string, unknown>).name;
    if (typeof nested === 'string' && nested.trim()) {
      return nested.trim();
    }
  }

  // Handle string value
  if (typeof name === 'string' && name.trim()) {
    return name.trim();
  }

  return null;
}

/**
 * Normalize meta data entry - ensures name field exists
 */
export function normalizeMetaEntry(raw: unknown, source: string): { name: string; presence: number; pickRate: number } | null {
  const name = extractChampionName(raw);
  if (!name) {
    debugWarnInvalidCandidate(source, raw);
    return null;
  }

  const obj = raw as Record<string, unknown>;
  return {
    name,
    presence: typeof obj.presence === 'number' ? obj.presence : 0,
    pickRate: typeof obj.pickRate === 'number' ? obj.pickRate : 0,
  };
}

/**
 * Normalize prediction entry - ensures champion field exists
 */
export function normalizePredictEntry(raw: unknown, source: string): { champion: string; probability: number; base_rate?: number; response_boost?: number } | null {
  const name = extractChampionName(raw);
  if (!name) {
    debugWarnInvalidCandidate(source, raw);
    return null;
  }

  const obj = raw as Record<string, unknown>;
  return {
    champion: name,
    probability: typeof obj.probability === 'number' ? obj.probability : 0,
    base_rate: typeof obj.base_rate === 'number' ? obj.base_rate : undefined,
    response_boost: typeof obj.response_boost === 'number' ? obj.response_boost : undefined,
  };
}

// ============================================================================
// Percentile Rank Calculation
// ============================================================================

function percentileRank(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 0;
  if (value === 0) return 0;

  const countLessOrEqual = allValues.filter(v => v <= value).length;
  return countLessOrEqual / allValues.length;
}

// ============================================================================
// Reason Generation
// ============================================================================

function generatePickReasons(
  components: PickPTSComponents,
  data: {
    metaData?: { presence: number; pickRate: number };
    comfortData?: { playerName: string; gamesWeighted: number; winRate: number; playersCount: number };
    predictData?: { probability: number; baseRate?: number; responseBoost?: number };
    denyData?: { opponentPlayerName: string; gamesWeighted: number };
    flexData?: { flexScore: number; roles: string[] };
    synergyData?: { partner: string; lift: number; winRate: number; sampleSize: number };
    counterData?: { target: string; role: string; winRate: number; sampleSize: number };
  },
  totalCandidates: number
): PickReason[] {
  const reasons: PickReason[] = [];

  // META reason
  if (components.raw_meta > 0 && data.metaData) {
    const rank = Math.round((1 - components.rank_meta) * totalCandidates) + 1;
    reasons.push({
      type: 'META',
      label: `Meta presence ${(data.metaData.presence * 100).toFixed(0)}%, pick rate ${(data.metaData.pickRate * 100).toFixed(0)}%`,
      shortLabel: `${(data.metaData.pickRate * 100).toFixed(0)}% pick`,
      value: components.share_meta,
      rank,
      rankTotal: totalCandidates,
      details: {
        presence: data.metaData.presence,
        pickRate: data.metaData.pickRate,
      },
    });
  }

  // COMFORT reason
  if (components.raw_comfort > 0 && data.comfortData) {
    const rank = Math.round((1 - components.rank_comfort) * totalCandidates) + 1;
    reasons.push({
      type: 'COMFORT',
      label: `${data.comfortData.playerName} comfort (${data.comfortData.gamesWeighted.toFixed(1)} games, ${(data.comfortData.winRate * 100).toFixed(0)}% WR)`,
      shortLabel: data.comfortData.playerName,
      value: components.share_comfort,
      rank,
      rankTotal: totalCandidates,
      details: {
        playerName: data.comfortData.playerName,
        gamesWeighted: data.comfortData.gamesWeighted,
        winRate: data.comfortData.winRate,
        playersCount: data.comfortData.playersCount,
      },
    });
  }

  // PREDICT reason
  if (components.raw_predict > 0 && data.predictData) {
    const rank = Math.round((1 - components.rank_predict) * totalCandidates) + 1;
    const boostText = data.predictData.responseBoost ? ` (+${(data.predictData.responseBoost * 100).toFixed(0)}% response)` : '';
    reasons.push({
      type: 'PREDICT',
      label: `Predicted pick (${(data.predictData.probability * 100).toFixed(0)}% likelihood)${boostText}`,
      shortLabel: `${(data.predictData.probability * 100).toFixed(0)}%`,
      value: components.share_predict,
      rank,
      rankTotal: totalCandidates,
      details: {
        probability: data.predictData.probability,
        baseRate: data.predictData.baseRate,
        responseBoost: data.predictData.responseBoost,
      },
    });
  }

  // DENY reason
  if (components.raw_deny > 0 && data.denyData) {
    const rank = Math.round((1 - components.rank_deny) * totalCandidates) + 1;
    reasons.push({
      type: 'DENY',
      label: `Deny ${data.denyData.opponentPlayerName} (${data.denyData.gamesWeighted.toFixed(1)} weighted games)`,
      shortLabel: `Deny ${data.denyData.opponentPlayerName}`,
      value: components.share_deny,
      rank,
      rankTotal: totalCandidates,
      details: {
        opponentPlayerName: data.denyData.opponentPlayerName,
        opponentGamesWeighted: data.denyData.gamesWeighted,
      },
    });
  }

  // FLEX reason
  if (components.raw_flex > 0.1 && data.flexData && data.flexData.roles.length >= 2) {
    const rank = Math.round((1 - components.rank_flex) * totalCandidates) + 1;
    reasons.push({
      type: 'FLEX',
      label: `Flex pick (${data.flexData.roles.slice(0, 2).join('/')})`,
      shortLabel: data.flexData.roles.slice(0, 2).join('/'),
      value: components.share_flex,
      rank,
      rankTotal: totalCandidates,
      details: {
        flexScore: data.flexData.flexScore,
        roles: data.flexData.roles,
      },
    });
  }

  // SYNERGY reason
  if (components.raw_synergy > 0 && data.synergyData) {
    const rank = Math.round((1 - components.rank_synergy) * totalCandidates) + 1;
    const liftPercent = (data.synergyData.lift * 100).toFixed(1);
    reasons.push({
      type: 'SYNERGY',
      label: `Synergy with ${data.synergyData.partner} (+${liftPercent}% lift)`,
      shortLabel: `+${data.synergyData.partner}`,
      value: components.share_synergy,
      rank,
      rankTotal: totalCandidates,
      details: {
        synergyPartner: data.synergyData.partner,
        synergyLift: data.synergyData.lift,
        synergyWinRate: data.synergyData.winRate,
        synergySampleSize: data.synergyData.sampleSize,
      },
    });
  }

  // COUNTER reason
  if (components.raw_counter > 0 && data.counterData) {
    const rank = Math.round((1 - components.rank_counter) * totalCandidates) + 1;
    const wrPercent = (data.counterData.winRate * 100).toFixed(0);
    reasons.push({
      type: 'COUNTER',
      label: `Counter ${data.counterData.target} (${wrPercent}% WR)`,
      shortLabel: `vs ${data.counterData.target}`,
      value: components.share_counter,
      rank,
      rankTotal: totalCandidates,
      details: {
        counterTarget: data.counterData.target,
        counterRole: data.counterData.role,
        counterWinRate: data.counterData.winRate,
        counterSampleSize: data.counterData.sampleSize,
      },
    });
  }

  // Sort by value descending
  reasons.sort((a, b) => b.value - a.value);

  // Ensure at least one reason
  if (reasons.length === 0) {
    reasons.push({
      type: 'META',
      label: 'General pick',
      shortLabel: 'Pick',
      value: 1,
      details: {
        presence: data.metaData?.presence || 0,
        pickRate: data.metaData?.pickRate || 0,
      },
    });
  }

  return reasons.slice(0, 4);
}

// ============================================================================
// Candidate Generation
// ============================================================================

export function generatePickCandidates(input: PickCandidateInput): PickCandidateResult {
  const {
    alreadyPicked = [],
    alreadyBanned = [],
    metaData = [],
    comfortData = {},
    predictData = [],
    denyData = {},
    flexData = {},
    synergyData = {},
    counterData = {},
    additionalDisabledIds = [],
    championIdMap = new Map(),
  } = input;

  // Normalize and filter input arrays - filter out any null/undefined/invalid entries
  const safeAlreadyPicked = alreadyPicked.filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
  const safeAlreadyBanned = alreadyBanned.filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
  const safeAdditionalDisabledIds = additionalDisabledIds.filter((n): n is string => typeof n === 'string' && n.trim().length > 0);

  // Build unavailable sets - use BOTH ID and lowercase name for robust filtering
  const unavailableIdSet = new Set<string>();
  const unavailableNameSet = new Set<string>(); // Lowercase names for fallback matching

  for (const name of safeAlreadyPicked) {
    unavailableNameSet.add(name.toLowerCase());
    const id = championIdMap.get(name.toLowerCase());
    if (id) {
      unavailableIdSet.add(id);
    }
  }

  for (const name of safeAlreadyBanned) {
    unavailableNameSet.add(name.toLowerCase());
    const id = championIdMap.get(name.toLowerCase());
    if (id) {
      unavailableIdSet.add(id);
    }
  }

  // additionalDisabledIds are already IDs
  for (const id of safeAdditionalDisabledIds) {
    unavailableIdSet.add(id);
  }

  // Helper: check if champion is unavailable (by ID or name)
  const isUnavailable = (champId: string | null, champName: string): boolean => {
    if (champId && unavailableIdSet.has(champId)) return true;
    if (unavailableNameSet.has(champName.toLowerCase())) return true;
    return false;
  };

  // Normalize meta data - filter out entries without valid name
  const safeMetaData = metaData
    .filter(Boolean)
    .map(m => normalizeMetaEntry(m, 'metaData'))
    .filter((m): m is NonNullable<typeof m> => m !== null);

  // Normalize prediction data - filter out entries without valid champion
  const safePredictData = predictData
    .filter(Boolean)
    .map(p => normalizePredictEntry(p, 'predictData'))
    .filter((p): p is NonNullable<typeof p> => p !== null);

  // Safe comfort/deny/flex/synergy/counter data - filter out entries with invalid keys
  const safeComfortData = Object.fromEntries(
    Object.entries(comfortData || {}).filter(([k, v]) => k && typeof k === 'string' && v)
  );
  const safeDenyData = Object.fromEntries(
    Object.entries(denyData || {}).filter(([k, v]) => k && typeof k === 'string' && v)
  );
  const safeFlexData = Object.fromEntries(
    Object.entries(flexData || {}).filter(([k, v]) => k && typeof k === 'string' && v)
  );
  const safeSynergyData = Object.fromEntries(
    Object.entries(synergyData || {}).filter(([k, v]) => k && typeof k === 'string' && v && typeof (v as any).partner === 'string')
  );
  const safeCounterData = Object.fromEntries(
    Object.entries(counterData || {}).filter(([k, v]) => k && typeof k === 'string' && v && typeof (v as any).target === 'string')
  );

  // Intermediate structure - now includes championId
  interface RawCandidate {
    championName: string;
    championId: string; // Required for ID-based filtering
    source: 'meta' | 'comfort' | 'predict' | 'deny' | 'combined';
    metaData?: { presence: number; pickRate: number };
    comfortData?: { playerName: string; gamesWeighted: number; winRate: number; playersCount: number };
    predictData?: { probability: number; baseRate?: number; responseBoost?: number };
    denyData?: { opponentPlayerName: string; gamesWeighted: number };
    flexData?: { flexScore: number; roles: string[] };
    synergyData?: { partner: string; lift: number; winRate: number; sampleSize: number };
    counterData?: { target: string; role: string; winRate: number; sampleSize: number };
    raw_meta: number;
    raw_comfort: number;
    raw_predict: number;
    raw_deny: number;
    raw_flex: number;
    raw_synergy: number;
    raw_counter: number;
  }

  const candidateMap = new Map<string, RawCandidate>();
  let fromMeta = 0;
  let fromComfort = 0;
  let fromPredict = 0;
  let fromDeny = 0;
  let idMappingWarningCount = 0;
  const MAX_ID_WARNINGS = 10;

  // Helper: get championId from name, warn if not found
  const getChampionId = (name: string): string | null => {
    const id = championIdMap.get(name.toLowerCase());
    if (!id) {
      if (idMappingWarningCount < MAX_ID_WARNINGS) {
        idMappingWarningCount++;
        console.warn(`[pick-candidate-engine] No championId mapping for "${name}", candidate discarded`);
      }
      return null;
    }
    return id;
  };

  // 1. Add meta candidates (top 10 by pickRate)
  const sortedMeta = [...safeMetaData]
    .sort((a, b) => b.pickRate - a.pickRate)
    .slice(0, 10);

  for (const meta of sortedMeta) {
    if (!meta.name) continue;
    const champId = getChampionId(meta.name);
    if (isUnavailable(champId, meta.name)) continue; // Skip if unavailable
    if (!champId) continue; // Skip if no ID mapping

    const key = meta.name.toLowerCase();
    if (!candidateMap.has(key)) {
      candidateMap.set(key, {
        championName: meta.name,
        championId: champId,
        source: 'meta',
        metaData: { presence: meta.presence, pickRate: meta.pickRate },
        raw_meta: meta.presence + meta.pickRate,
        raw_comfort: 0,
        raw_predict: 0,
        raw_deny: 0,
        raw_flex: 0,
        raw_synergy: 0,
        raw_counter: 0,
      });
      fromMeta++;
    } else {
      const existing = candidateMap.get(key)!;
      existing.metaData = { presence: meta.presence, pickRate: meta.pickRate };
      existing.raw_meta = meta.presence + meta.pickRate;
    }
  }

  // 2. Add comfort candidates (top 10)
  const comfortEntries = Object.entries(safeComfortData)
    .filter(([name, data]) => name && data && typeof data.gamesWeighted === 'number')
    .map(([name, data]) => ({ name, data, score: data.gamesWeighted }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  for (const { name, data } of comfortEntries) {
    const champId = getChampionId(name);
    if (isUnavailable(champId, name)) continue; // Skip if unavailable
    if (!champId) continue; // Skip if no ID mapping

    const key = name.toLowerCase();
    if (!candidateMap.has(key)) {
      candidateMap.set(key, {
        championName: name,
        championId: champId,
        source: 'comfort',
        comfortData: data,
        raw_meta: 0,
        raw_comfort: data.gamesWeighted,
        raw_predict: 0,
        raw_deny: 0,
        raw_flex: 0,
        raw_synergy: 0,
        raw_counter: 0,
      });
      fromComfort++;
    } else {
      const existing = candidateMap.get(key)!;
      existing.comfortData = data;
      existing.raw_comfort = data.gamesWeighted;
      if (existing.source === 'meta') existing.source = 'combined';
    }
  }

  // 3. Add prediction candidates (top 5)
  const sortedPredictions = [...safePredictData]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5);

  for (const pred of sortedPredictions) {
    if (!pred.champion) continue;
    const champId = getChampionId(pred.champion);
    if (isUnavailable(champId, pred.champion)) continue; // Skip if unavailable
    if (!champId) continue; // Skip if no ID mapping

    const key = pred.champion.toLowerCase();
    if (!candidateMap.has(key)) {
      candidateMap.set(key, {
        championName: pred.champion,
        championId: champId,
        source: 'predict',
        predictData: {
          probability: pred.probability,
          baseRate: pred.base_rate,
          responseBoost: pred.response_boost,
        },
        raw_meta: 0,
        raw_comfort: 0,
        raw_predict: pred.probability,
        raw_deny: 0,
        raw_flex: 0,
        raw_synergy: 0,
        raw_counter: 0,
      });
      fromPredict++;
    } else {
      const existing = candidateMap.get(key)!;
      existing.predictData = {
        probability: pred.probability,
        baseRate: pred.base_rate,
        responseBoost: pred.response_boost,
      };
      existing.raw_predict = pred.probability;
      if (existing.source !== 'combined') existing.source = 'combined';
    }
  }

  // 4. Add deny candidates (top 5 from opponent threats)
  const denyEntries = Object.entries(safeDenyData)
    .filter(([name, data]) => name && data && typeof data.gamesWeighted === 'number')
    .map(([name, data]) => ({ name, data, score: data.gamesWeighted }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  for (const { name, data } of denyEntries) {
    const champId = getChampionId(name);
    if (isUnavailable(champId, name)) continue; // Skip if unavailable
    if (!champId) continue; // Skip if no ID mapping

    const key = name.toLowerCase();
    if (!candidateMap.has(key)) {
      candidateMap.set(key, {
        championName: name,
        championId: champId,
        source: 'deny',
        denyData: { opponentPlayerName: data.playerName, gamesWeighted: data.gamesWeighted },
        raw_meta: 0,
        raw_comfort: 0,
        raw_predict: 0,
        raw_deny: data.gamesWeighted,
        raw_flex: 0,
        raw_synergy: 0,
        raw_counter: 0,
      });
      fromDeny++;
    } else {
      const existing = candidateMap.get(key)!;
      existing.denyData = { opponentPlayerName: data.playerName, gamesWeighted: data.gamesWeighted };
      existing.raw_deny = data.gamesWeighted;
      if (existing.source !== 'combined') existing.source = 'combined';
    }
  }

  // 5. Add flex data to existing candidates
  for (const [name, flex] of Object.entries(safeFlexData)) {
    if (!name || !flex) continue;
    const key = name.toLowerCase();
    if (candidateMap.has(key)) {
      const existing = candidateMap.get(key)!;
      existing.flexData = flex;
      existing.raw_flex = typeof flex.flexScore === 'number' ? flex.flexScore : 0;
    }
  }

  // 6. Add synergy data to existing candidates
  for (const [name, synergy] of Object.entries(safeSynergyData)) {
    if (!name || !synergy || typeof synergy.partner !== 'string') continue;
    const key = name.toLowerCase();
    if (candidateMap.has(key)) {
      const existing = candidateMap.get(key)!;
      existing.synergyData = synergy;
      // Use lift as raw score (positive lift = good synergy)
      const lift = typeof synergy.lift === 'number' ? synergy.lift : 0;
      existing.raw_synergy = Math.max(lift, 0);
    }
  }

  // 7. Add counter data to existing candidates
  for (const [name, counter] of Object.entries(safeCounterData)) {
    if (!name || !counter || typeof counter.target !== 'string') continue;
    const key = name.toLowerCase();
    if (candidateMap.has(key)) {
      const existing = candidateMap.get(key)!;
      existing.counterData = counter;
      // Use win rate above 50% as raw score
      const winRate = typeof counter.winRate === 'number' ? counter.winRate : 0;
      existing.raw_counter = winRate > 0.5 ? winRate - 0.5 : 0;
    }
  }

  // 8. Collect all raw scores for percentile calculation
  const allRawMeta = Array.from(candidateMap.values()).map(c => c.raw_meta);
  const allRawComfort = Array.from(candidateMap.values()).map(c => c.raw_comfort);
  const allRawPredict = Array.from(candidateMap.values()).map(c => c.raw_predict);
  const allRawDeny = Array.from(candidateMap.values()).map(c => c.raw_deny);
  const allRawFlex = Array.from(candidateMap.values()).map(c => c.raw_flex);
  const allRawSynergy = Array.from(candidateMap.values()).map(c => c.raw_synergy);
  const allRawCounter = Array.from(candidateMap.values()).map(c => c.raw_counter);

  const totalCandidates = candidateMap.size;

  // 9. Calculate PTS v1 with percentile ranking
  const finalCandidates: PickCandidate[] = [];

  for (const raw of candidateMap.values()) {
    const rank_meta = percentileRank(raw.raw_meta, allRawMeta);
    const rank_comfort = percentileRank(raw.raw_comfort, allRawComfort);
    const rank_predict = percentileRank(raw.raw_predict, allRawPredict);
    const rank_deny = percentileRank(raw.raw_deny, allRawDeny);
    const rank_flex = percentileRank(raw.raw_flex, allRawFlex);
    const rank_synergy = percentileRank(raw.raw_synergy, allRawSynergy);
    const rank_counter = percentileRank(raw.raw_counter, allRawCounter);

    const pts_score = rank_meta + rank_comfort + rank_predict + rank_deny + rank_flex + rank_synergy + rank_counter;

    const total = pts_score > 0 ? pts_score : 1;
    const share_meta = rank_meta / total;
    const share_comfort = rank_comfort / total;
    const share_predict = rank_predict / total;
    const share_deny = rank_deny / total;
    const share_flex = rank_flex / total;
    const share_synergy = rank_synergy / total;
    const share_counter = rank_counter / total;

    const pts_components: PickPTSComponents = {
      raw_meta: raw.raw_meta,
      raw_comfort: raw.raw_comfort,
      raw_predict: raw.raw_predict,
      raw_deny: raw.raw_deny,
      raw_flex: raw.raw_flex,
      raw_synergy: raw.raw_synergy,
      raw_counter: raw.raw_counter,
      rank_meta,
      rank_comfort,
      rank_predict,
      rank_deny,
      rank_flex,
      rank_synergy,
      rank_counter,
      share_meta,
      share_comfort,
      share_predict,
      share_deny,
      share_flex,
      share_synergy,
      share_counter,
    };

    const reasons = generatePickReasons(pts_components, {
      metaData: raw.metaData,
      comfortData: raw.comfortData,
      predictData: raw.predictData,
      denyData: raw.denyData,
      flexData: raw.flexData,
      synergyData: raw.synergyData,
      counterData: raw.counterData,
    }, totalCandidates);

    finalCandidates.push({
      championName: raw.championName,
      championId: raw.championId, // Now required from RawCandidate
      pts_score,
      pts_components,
      reasons,
      source: raw.source,
      metaData: raw.metaData,
      comfortData: raw.comfortData,
      predictData: raw.predictData,
      denyData: raw.denyData,
      flexData: raw.flexData,
      synergyData: raw.synergyData,
      counterData: raw.counterData,
    });
  }

  // 10. Sort by pts_score
  finalCandidates.sort((a, b) => b.pts_score - a.pts_score);

  // 11. Final safety filter - ensure all candidates have valid championName and championId
  const safeCandidates = finalCandidates.filter(c => {
    if (!c || typeof c.championName !== 'string' || !c.championName.trim()) {
      debugWarnInvalidCandidate('finalCandidates (no name)', c);
      return false;
    }
    if (!c.championId) {
      debugWarnInvalidCandidate('finalCandidates (no id)', c);
      return false;
    }
    return true;
  });

  // 12. Limit to 20
  const candidates = safeCandidates.slice(0, 20);

  return {
    candidates,
    meta: {
      totalCandidates: candidates.length,
      fromMeta,
      fromComfort,
      fromPredict,
      fromDeny,
      filteredUsed: unavailableIdSet.size + unavailableNameSet.size,
    },
  };
}

// ============================================================================
// Tier Classification
// ============================================================================

export type PickCandidateTier = 'optimal' | 'strong' | 'viable' | 'situational';

export function getPickCandidateTier(pts_score: number, allScores: number[]): PickCandidateTier {
  if (allScores.length === 0) return 'viable';

  const sorted = [...allScores].sort((a, b) => b - a);
  const optimalThreshold = sorted[Math.floor(sorted.length * 0.1)] || sorted[0];
  const strongThreshold = sorted[Math.floor(sorted.length * 0.3)] || sorted[0];
  const viableThreshold = sorted[Math.floor(sorted.length * 0.6)] || sorted[0];

  if (pts_score >= optimalThreshold) return 'optimal';
  if (pts_score >= strongThreshold) return 'strong';
  if (pts_score >= viableThreshold) return 'viable';
  return 'situational';
}

export function getPickTierDisplay(tier: PickCandidateTier): { label: string; color: string } {
  switch (tier) {
    case 'optimal':
      return { label: 'Optimal', color: 'text-green-400 bg-green-500/20 border-green-500/50' };
    case 'strong':
      return { label: 'Strong', color: 'text-cyan-400 bg-cyan-500/20 border-cyan-500/50' };
    case 'viable':
      return { label: 'Viable', color: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/50' };
    case 'situational':
      return { label: 'Situational', color: 'text-slate-400 bg-slate-500/20 border-slate-500/50' };
  }
}
