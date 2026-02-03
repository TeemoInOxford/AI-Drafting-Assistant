/**
 * Ban Candidate Engine
 *
 * Generates ban candidates for the Drafting Assistant during ban phase (steps 0-5).
 * Implements PTS v1 scoring with percentile-based ranking (no hardcoded constants).
 *
 * Data Sources:
 * - MetaCandidates: today_* (ban_rate, presence) top 10
 * - ThreatCandidates: TEAM_DENIAL + PLAYER_SPECIALTY top 10 each
 * - PredictionCandidates: next-ban prediction top 5
 *
 * PTS v1 Formula (percentile-based):
 * For each dimension, rank within candidates → percentile ∈ [0, 1]
 * pts_raw = meta_rank + threat_rank + predict_rank + flex_rank
 * share = rank / sum(ranks)
 *
 * Output: 12-20 candidates sorted by pts_score with why-ban reasons
 */

// ============================================================================
// Types
// ============================================================================

export type ReasonType = 'META' | 'TEAM_DENIAL' | 'PLAYER_SPECIALTY' | 'PREDICT_DENY' | 'FLEX_PRESSURE';

export interface BanReason {
  type: ReasonType;
  label: string;
  shortLabel: string;
  value: number;
  rank?: number;        // rank within candidates (1 = best)
  rankTotal?: number;   // total candidates ranked
  details: {
    // META details
    presence?: number;
    banRate?: number;
    // TEAM_DENIAL details
    score?: number;
    opponentBanShare?: number;
    topOpponents?: Array<{ team_name: string; count: number }>;
    sampleSize?: number;
    // PLAYER_SPECIALTY details
    topPlayers?: Array<{ player_name: string; games_weighted: number; win_rate_weighted?: number }>;
    playersCount?: number;
    totalGamesWeighted?: number;
    // PREDICT_DENY details
    probability?: number;
    // FLEX_PRESSURE details
    flexScore?: number;
    roles?: string[];
  };
}

export interface PTSComponents {
  // Raw values (original scale)
  raw_meta: number;
  raw_threat: number;
  raw_predict: number;
  raw_flex: number;
  // Percentile ranks within candidates (0-1, higher = better)
  rank_meta: number;
  rank_threat: number;
  rank_predict: number;
  rank_flex: number;
  // Contribution shares
  share_meta: number;
  share_threat: number;
  share_predict: number;
  share_flex: number;
}

export interface BanCandidate {
  championName: string;
  championId?: string;
  championImage?: string;
  pts_score: number;
  pts_components: PTSComponents;
  reasons: BanReason[];
  source: 'meta' | 'threat' | 'predict' | 'flex' | 'combined';
  // Raw data for evidence modal
  teamDenialData?: any;
  playerSpecData?: any;
  predictionData?: { probability: number };
  metaData?: { presence: number; banRate: number };
  flexData?: { flexScore: number; roles: string[] };
}

export interface CandidateGenerationInput {
  opponentTeamId: string | null;
  alreadyBanned: string[];
  league?: string;
  // Pre-fetched data (optional, will fetch if not provided)
  metaData?: Array<{ name: string; presence: number; banRate: number }>;
  teamDenialData?: Record<string, any>;
  playerSpecData?: Record<string, any>;
  predictionData?: Array<{ champion: string; probability: number }>;
  flexData?: Record<string, { flexScore: number; roles: string[] }>;
  // Fix 1: Changed to use champion IDs instead of names
  // Additional disabled champion IDs (e.g., fearless pool) - merged with alreadyBanned
  additionalDisabledIds?: string[];
  // Champion ID mapping: lowercase name -> championId (required for ID-based filtering)
  championIdMap?: Map<string, string>;
}

export interface CandidateGenerationResult {
  candidates: BanCandidate[];
  meta: {
    totalCandidates: number;
    fromMeta: number;
    fromThreat: number;
    fromPredict: number;
    filteredBanned: number;
  };
}

// ============================================================================
// Reason Labels
// ============================================================================

export const REASON_LABELS: Record<ReasonType, { label: string; shortLabel: string; icon: string; color: string }> = {
  META: {
    label: 'Meta Priority',
    shortLabel: 'Meta',
    icon: '📊',
    color: 'text-slate-300 bg-slate-500/20 border-slate-500/40',
  },
  TEAM_DENIAL: {
    label: 'Team Denial',
    shortLabel: 'Denial',
    icon: '🎯',
    color: 'text-blue-300 bg-blue-500/20 border-blue-500/40',
  },
  PLAYER_SPECIALTY: {
    label: 'Player Pool',
    shortLabel: 'Player',
    icon: '👤',
    color: 'text-purple-300 bg-purple-500/20 border-purple-500/40',
  },
  PREDICT_DENY: {
    label: 'Predicted Ban',
    shortLabel: 'Predict',
    icon: '🔮',
    color: 'text-cyan-300 bg-cyan-500/20 border-cyan-500/40',
  },
  FLEX_PRESSURE: {
    label: 'Flex Threat',
    shortLabel: 'Flex',
    icon: '🔄',
    color: 'text-amber-300 bg-amber-500/20 border-amber-500/40',
  },
};

// ============================================================================
// Percentile Rank Calculation
// ============================================================================

/**
 * Calculate percentile rank for a value within an array.
 * Returns 0-1 where 1 = highest value.
 *
 * Uses: (count of values <= this value) / total
 */
function percentileRank(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 0;
  if (value === 0) return 0; // Zero values get rank 0

  const countLessOrEqual = allValues.filter(v => v <= value).length;
  return countLessOrEqual / allValues.length;
}

/**
 * Calculate integer rank (1 = best, N = worst).
 */
function integerRank(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 0;

  // Sort descending
  const sorted = [...allValues].sort((a, b) => b - a);
  const idx = sorted.findIndex(v => v === value);
  return idx >= 0 ? idx + 1 : allValues.length;
}

// ============================================================================
// Reason Generation
// ============================================================================

/**
 * Generate why-ban reasons for a candidate based on raw data.
 * Each reason MUST have details for ThreatEvidenceV2 modal.
 */
function generateReasons(
  components: PTSComponents,
  data: {
    metaData?: { presence: number; banRate: number };
    teamDenialData?: any;
    playerSpecData?: any;
    predictionData?: { probability: number };
    flexData?: { flexScore: number; roles: string[] };
  },
  totalCandidates: number
): BanReason[] {
  const reasons: BanReason[] = [];

  // META reason
  if (components.raw_meta > 0 && data.metaData) {
    const rank = Math.round((1 - components.rank_meta) * totalCandidates) + 1;
    reasons.push({
      type: 'META',
      label: `Meta presence ${(data.metaData.presence * 100).toFixed(0)}%, ban rate ${(data.metaData.banRate * 100).toFixed(0)}%`,
      shortLabel: `${(data.metaData.banRate * 100).toFixed(0)}% ban`,
      value: components.share_meta,
      rank,
      rankTotal: totalCandidates,
      details: {
        presence: data.metaData.presence,
        banRate: data.metaData.banRate,
      },
    });
  }

  // TEAM_DENIAL reason
  if (data.teamDenialData && data.teamDenialData.score > 0) {
    const opponentShare = data.teamDenialData.components?.OPPONENT_BAN || 0;
    const topOpps = data.teamDenialData.evidence?.top_opponent_teams?.slice(0, 3) || [];
    const sampleSize = data.teamDenialData.sample_size || 0;

    reasons.push({
      type: 'TEAM_DENIAL',
      label: `Denied ${sampleSize}x vs this team (${(opponentShare * 100).toFixed(0)}% opponent-driven)`,
      shortLabel: `${sampleSize}x denied`,
      value: components.share_threat * 0.6,
      details: {
        score: data.teamDenialData.score,
        opponentBanShare: opponentShare,
        topOpponents: topOpps,
        sampleSize,
      },
    });
  }

  // PLAYER_SPECIALTY reason
  if (data.playerSpecData && data.playerSpecData.score > 0) {
    const topPlayers = data.playerSpecData.evidence?.top_players?.slice(0, 3) || [];
    const playersCount = data.playerSpecData.players_count || 0;
    const totalGamesWeighted = data.playerSpecData.evidence?.raw_scores?.team_pool || 0;

    if (topPlayers.length > 0) {
      const topPlayer = topPlayers[0];
      reasons.push({
        type: 'PLAYER_SPECIALTY',
        label: `${topPlayer.player_name} specialty (${topPlayer.games_weighted.toFixed(1)} weighted games)`,
        shortLabel: topPlayer.player_name,
        value: components.share_threat * 0.4,
        details: {
          topPlayers: topPlayers.map((p: any) => ({
            player_name: p.player_name,
            games_weighted: p.games_weighted,
            win_rate_weighted: p.win_rate_weighted,
          })),
          playersCount,
          totalGamesWeighted,
        },
      });
    }
  }

  // PREDICT_DENY reason
  if (components.raw_predict > 0 && data.predictionData) {
    const rank = Math.round((1 - components.rank_predict) * totalCandidates) + 1;
    reasons.push({
      type: 'PREDICT_DENY',
      label: `Predicted ban (${(data.predictionData.probability * 100).toFixed(0)}% likelihood)`,
      shortLabel: `${(data.predictionData.probability * 100).toFixed(0)}%`,
      value: components.share_predict,
      rank,
      rankTotal: totalCandidates,
      details: {
        probability: data.predictionData.probability,
      },
    });
  }

  // FLEX_PRESSURE reason
  if (components.raw_flex > 0.1 && data.flexData && data.flexData.roles.length >= 2) {
    const rank = Math.round((1 - components.rank_flex) * totalCandidates) + 1;
    reasons.push({
      type: 'FLEX_PRESSURE',
      label: `Flex threat (${data.flexData.roles.slice(0, 2).join('/')})`,
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

  // Sort by value descending
  reasons.sort((a, b) => b.value - a.value);

  // Ensure at least one reason with proper details
  if (reasons.length === 0) {
    reasons.push({
      type: 'META',
      label: 'General meta presence',
      shortLabel: 'Meta',
      value: 1,
      details: {
        presence: data.metaData?.presence || 0,
        banRate: data.metaData?.banRate || 0,
      },
    });
  }

  return reasons.slice(0, 4);
}

// ============================================================================
// Candidate Generation
// ============================================================================

/**
 * Generate ban candidates from all data sources.
 *
 * Steps:
 * 1. Collect candidates from all sources
 * 2. Merge and dedupe
 * 3. Calculate raw scores for each dimension
 * 4. Compute percentile ranks within candidates
 * 5. Calculate PTS v1 = sum(ranks)
 * 6. Generate reasons with proper details
 * 7. Sort by pts_score, filter banned
 * 8. Return 12-20 candidates
 */
export function generateBanCandidates(input: CandidateGenerationInput): CandidateGenerationResult {
  const {
    alreadyBanned,
    metaData = [],
    teamDenialData = {},
    playerSpecData = {},
    predictionData = [],
    flexData = {},
    additionalDisabledIds = [],
    championIdMap = new Map(),
  } = input;

  // Fix 1: Build unavailableIdSet based on championId (not name)
  const unavailableIdSet = new Set<string>();
  let idMappingWarningCount = 0;
  const MAX_ID_WARNINGS = 10;

  // Convert alreadyBanned names to IDs using championIdMap
  for (const name of alreadyBanned) {
    if (typeof name !== 'string' || !name.trim()) continue;
    const id = championIdMap.get(name.toLowerCase());
    if (id) {
      unavailableIdSet.add(id);
    } else {
      // Fallback: treat name as potential ID
      unavailableIdSet.add(name);
    }
  }

  // additionalDisabledIds are already IDs
  for (const id of additionalDisabledIds) {
    if (typeof id === 'string' && id.trim()) {
      unavailableIdSet.add(id);
    }
  }

  // Helper: get championId from name, warn if not found
  const getChampionId = (name: string): string | null => {
    const id = championIdMap.get(name.toLowerCase());
    if (!id) {
      if (idMappingWarningCount < MAX_ID_WARNINGS) {
        idMappingWarningCount++;
        console.warn(`[ban-candidate-engine] No championId mapping for "${name}", candidate discarded`);
      }
      return null;
    }
    return id;
  };

  // Intermediate structure to collect raw data - now includes championId
  interface RawCandidate {
    championName: string;
    championId: string; // Required for ID-based filtering
    source: 'meta' | 'threat' | 'predict' | 'combined';
    metaData?: { presence: number; banRate: number };
    teamDenialData?: any;
    playerSpecData?: any;
    predictionData?: { probability: number };
    flexData?: { flexScore: number; roles: string[] };
    // Raw scores (before ranking)
    raw_meta: number;
    raw_threat: number;
    raw_predict: number;
    raw_flex: number;
  }

  const candidateMap = new Map<string, RawCandidate>();
  let fromMeta = 0;
  let fromThreat = 0;
  let fromPredict = 0;

  // 1. Add meta candidates (top 10 by ban rate)
  const sortedMeta = [...metaData].sort((a, b) => b.banRate - a.banRate).slice(0, 10);
  for (const meta of sortedMeta) {
    const champId = getChampionId(meta.name);
    if (!champId) continue; // Skip if no ID mapping
    if (unavailableIdSet.has(champId)) continue;

    const key = meta.name.toLowerCase();
    if (!candidateMap.has(key)) {
      candidateMap.set(key, {
        championName: meta.name,
        championId: champId,
        source: 'meta',
        metaData: { presence: meta.presence, banRate: meta.banRate },
        raw_meta: meta.presence + meta.banRate,
        raw_threat: 0,
        raw_predict: 0,
        raw_flex: 0,
      });
      fromMeta++;
    } else {
      const existing = candidateMap.get(key)!;
      existing.metaData = { presence: meta.presence, banRate: meta.banRate };
      existing.raw_meta = meta.presence + meta.banRate;
    }
  }

  // 2. Add TEAM_DENIAL candidates (top 10)
  const teamDenialEntries = Object.entries(teamDenialData)
    .map(([name, data]: [string, any]) => ({ name, data, score: data.score || 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  for (const { name, data } of teamDenialEntries) {
    const champId = getChampionId(name);
    if (!champId) continue;
    if (unavailableIdSet.has(champId)) continue;

    const key = name.toLowerCase();
    if (!candidateMap.has(key)) {
      candidateMap.set(key, {
        championName: name,
        championId: champId,
        source: 'threat',
        teamDenialData: data,
        raw_meta: 0,
        raw_threat: data.score || 0,
        raw_predict: 0,
        raw_flex: 0,
      });
      fromThreat++;
    } else {
      const existing = candidateMap.get(key)!;
      existing.teamDenialData = data;
      existing.raw_threat += data.score || 0;
      if (existing.source === 'meta') existing.source = 'combined';
    }
  }

  // 3. Add PLAYER_SPECIALTY candidates (top 10)
  const playerSpecEntries = Object.entries(playerSpecData)
    .map(([name, data]: [string, any]) => ({ name, data, score: data.score || 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  for (const { name, data } of playerSpecEntries) {
    const champId = getChampionId(name);
    if (!champId) continue;
    if (unavailableIdSet.has(champId)) continue;

    const key = name.toLowerCase();
    if (!candidateMap.has(key)) {
      candidateMap.set(key, {
        championName: name,
        championId: champId,
        source: 'threat',
        playerSpecData: data,
        raw_meta: 0,
        raw_threat: data.score || 0,
        raw_predict: 0,
        raw_flex: 0,
      });
      fromThreat++;
    } else {
      const existing = candidateMap.get(key)!;
      existing.playerSpecData = data;
      existing.raw_threat += data.score || 0;
      if (existing.source === 'meta') existing.source = 'combined';
    }
  }

  // 4. Add prediction candidates (top 5)
  const sortedPredictions = [...predictionData]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5);

  for (const pred of sortedPredictions) {
    const champId = getChampionId(pred.champion);
    if (!champId) continue;
    if (unavailableIdSet.has(champId)) continue;

    const key = pred.champion.toLowerCase();
    if (!candidateMap.has(key)) {
      candidateMap.set(key, {
        championName: pred.champion,
        championId: champId,
        source: 'predict',
        predictionData: { probability: pred.probability },
        raw_meta: 0,
        raw_threat: 0,
        raw_predict: pred.probability,
        raw_flex: 0,
      });
      fromPredict++;
    } else {
      const existing = candidateMap.get(key)!;
      existing.predictionData = { probability: pred.probability };
      existing.raw_predict = pred.probability;
      if (existing.source !== 'combined') existing.source = 'combined';
    }
  }

  // 5. Add flex data to existing candidates
  for (const [name, flex] of Object.entries(flexData)) {
    const key = name.toLowerCase();
    if (candidateMap.has(key)) {
      const existing = candidateMap.get(key)!;
      existing.flexData = flex;
      existing.raw_flex = flex.flexScore;
    }
  }

  // 6. Collect all raw scores for percentile calculation
  const allRawMeta = Array.from(candidateMap.values()).map(c => c.raw_meta);
  const allRawThreat = Array.from(candidateMap.values()).map(c => c.raw_threat);
  const allRawPredict = Array.from(candidateMap.values()).map(c => c.raw_predict);
  const allRawFlex = Array.from(candidateMap.values()).map(c => c.raw_flex);

  const totalCandidates = candidateMap.size;

  // 7. Calculate PTS v1 with percentile ranking
  const finalCandidates: BanCandidate[] = [];

  for (const raw of candidateMap.values()) {
    // Calculate percentile ranks
    const rank_meta = percentileRank(raw.raw_meta, allRawMeta);
    const rank_threat = percentileRank(raw.raw_threat, allRawThreat);
    const rank_predict = percentileRank(raw.raw_predict, allRawPredict);
    const rank_flex = percentileRank(raw.raw_flex, allRawFlex);

    // PTS = sum of ranks
    const pts_score = rank_meta + rank_threat + rank_predict + rank_flex;

    // Calculate shares
    const total = pts_score > 0 ? pts_score : 1;
    const share_meta = rank_meta / total;
    const share_threat = rank_threat / total;
    const share_predict = rank_predict / total;
    const share_flex = rank_flex / total;

    const pts_components: PTSComponents = {
      raw_meta: raw.raw_meta,
      raw_threat: raw.raw_threat,
      raw_predict: raw.raw_predict,
      raw_flex: raw.raw_flex,
      rank_meta,
      rank_threat,
      rank_predict,
      rank_flex,
      share_meta,
      share_threat,
      share_predict,
      share_flex,
    };

    // Generate reasons with full details
    const reasons = generateReasons(pts_components, {
      metaData: raw.metaData,
      teamDenialData: raw.teamDenialData,
      playerSpecData: raw.playerSpecData,
      predictionData: raw.predictionData,
      flexData: raw.flexData,
    }, totalCandidates);

    finalCandidates.push({
      championName: raw.championName,
      championId: raw.championId, // Now required from RawCandidate
      pts_score,
      pts_components,
      reasons,
      source: raw.source,
      teamDenialData: raw.teamDenialData,
      playerSpecData: raw.playerSpecData,
      predictionData: raw.predictionData,
      metaData: raw.metaData,
      flexData: raw.flexData,
    });
  }

  // 8. Filter by unavailable IDs (safety net) and sort by pts_score
  let candidates = finalCandidates.filter(c => c.championId && !unavailableIdSet.has(c.championId));
  const filteredBanned = finalCandidates.length - candidates.length;

  candidates.sort((a, b) => b.pts_score - a.pts_score);

  // 9. Ensure 12-20 candidates
  candidates = candidates.slice(0, 20);

  return {
    candidates,
    meta: {
      totalCandidates: candidates.length,
      fromMeta,
      fromThreat,
      fromPredict,
      filteredBanned,
    },
  };
}

// ============================================================================
// Tier Classification
// ============================================================================

export type CandidateTier = 'critical' | 'high' | 'moderate' | 'low';

/**
 * Classify a candidate into a tier based on pts_score.
 */
export function getCandidateTier(pts_score: number, allScores: number[]): CandidateTier {
  if (allScores.length === 0) return 'moderate';

  const sorted = [...allScores].sort((a, b) => b - a);
  const criticalThreshold = sorted[Math.floor(sorted.length * 0.1)] || sorted[0];
  const highThreshold = sorted[Math.floor(sorted.length * 0.3)] || sorted[0];
  const moderateThreshold = sorted[Math.floor(sorted.length * 0.6)] || sorted[0];

  if (pts_score >= criticalThreshold) return 'critical';
  if (pts_score >= highThreshold) return 'high';
  if (pts_score >= moderateThreshold) return 'moderate';
  return 'low';
}

/**
 * Get tier display info.
 */
export function getTierDisplay(tier: CandidateTier): { label: string; color: string } {
  switch (tier) {
    case 'critical':
      return { label: 'Critical', color: 'text-red-400 bg-red-500/20 border-red-500/50' };
    case 'high':
      return { label: 'High', color: 'text-orange-400 bg-orange-500/20 border-orange-500/50' };
    case 'moderate':
      return { label: 'Moderate', color: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/50' };
    case 'low':
      return { label: 'Low', color: 'text-slate-400 bg-slate-500/20 border-slate-500/50' };
  }
}
