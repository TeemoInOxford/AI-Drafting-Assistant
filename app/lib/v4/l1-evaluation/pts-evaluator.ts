/**
 * v4-1 L1 Phase-Aware PTS Module
 *
 * Calculates Pick Threat Score with phase-aware weighting.
 * PTS semantics change across Early/Mid/Late phases.
 */

import { Champion, Position } from '../../types';
import { DraftState } from '../types/common-types';
import { L0DataCache } from '../types/l0-types';
import {
  PTSOutput,
  PTSSubScores,
  ThreatLevel,
  PhaseWeights,
  L1Config,
  DEFAULT_L1_CONFIG,
} from '../types/l1-types';
import { combineConfidences } from '../types/common-types';
import { getOpponentTeam, getRemainingRolesForTeam } from '../core/draft-state';

/**
 * Calculate phase-aware PTS for a champion
 */
export function calculatePhasePTS(
  champion: Champion,
  draftState: DraftState,
  l0Data: L0DataCache,
  config: L1Config = DEFAULT_L1_CONFIG
): PTSOutput {
  // Get phase-specific weights
  const phaseWeights = getPhaseWeights(draftState.phaseContext, config);

  // Calculate sub-scores
  const roleVacancy = calculateRoleVacancy(champion, draftState, l0Data);
  const metaPresence = calculateMetaPresence(champion, l0Data);
  const recentTrend = calculateRecentTrend(champion, l0Data);
  const synergyBan = calculateSynergyBan(champion, draftState, l0Data);

  const breakdown: PTSSubScores = {
    roleVacancy,
    metaPresence,
    recentTrend,
    synergyBan,
  };

  // Calculate weighted PTS
  const totalPTS =
    roleVacancy.score * phaseWeights.roleVacancy +
    metaPresence.score * phaseWeights.metaPresence +
    recentTrend.score * phaseWeights.recentTrend +
    synergyBan.score * phaseWeights.synergyBan;

  // Scale to 0-100
  const scaledPTS = totalPTS * 100;

  // Calculate overall confidence
  const confidence = combineConfidences([
    roleVacancy.confidence,
    metaPresence.confidence,
    recentTrend.confidence,
    synergyBan.confidence,
  ]);

  // Determine threat level
  const threatLevel = determineThreatLevel(scaledPTS, config);

  // Generate explanation
  const explanation = generatePTSExplanation(
    champion,
    scaledPTS,
    threatLevel,
    breakdown,
    phaseWeights
  );

  return {
    championId: champion.id,
    totalPTS: scaledPTS,
    confidence,
    threatLevel,
    breakdown,
    explanation,
  };
}

/**
 * Get phase-specific weights
 */
function getPhaseWeights(
  phaseContext: DraftState['phaseContext'],
  config: L1Config
): PhaseWeights {
  if (phaseContext.isEarly) {
    return config.earlyPhaseWeights;
  } else if (phaseContext.isMid) {
    return config.midPhaseWeights;
  } else {
    return config.latePhaseWeights;
  }
}

/**
 * Calculate role vacancy score
 * How much does opponent need this role?
 */
function calculateRoleVacancy(
  champion: Champion,
  draftState: DraftState,
  l0Data: L0DataCache
): { score: number; confidence: number } {
  const opponentTeam = getOpponentTeam(draftState.side);
  const opponentRoles = getRemainingRolesForTeam(draftState, opponentTeam);

  // If opponent has no remaining roles, score is 0
  if (opponentRoles.length === 0) {
    return { score: 0, confidence: 1.0 };
  }

  // Check if champion can fill any opponent role
  const canFillRoles = champion.positions.filter(pos =>
    opponentRoles.includes(pos)
  );

  if (canFillRoles.length === 0) {
    return { score: 0, confidence: 1.0 };
  }

  // Get champion stats for role distribution confidence
  const championStats = l0Data.championStats.get(champion.id);
  const statsConfidence = championStats?.confidence || 0.5;

  // Calculate urgency based on remaining roles
  // Fewer roles = higher urgency (non-linear scaling)
  // Uses exponential decay: 1 role = 1.0, 2 = 0.85, 3 = 0.7, 4 = 0.55, 5 = 0.4
  const urgencyMultiplier = Math.pow(6 - opponentRoles.length, 1.5) / Math.pow(5, 1.5);

  // Calculate flexibility bonus
  // Champions that can fill multiple opponent roles are more valuable
  const flexibilityBonus = Math.min(canFillRoles.length / 3, 1.0);

  // Calculate role distribution weight
  // Higher if champion is commonly played in needed roles
  let roleWeight = 0;
  if (championStats) {
    for (const role of canFillRoles) {
      roleWeight += championStats.roleDistribution[role] || 0;
    }
    roleWeight = roleWeight / canFillRoles.length;
  } else {
    roleWeight = 0.5; // Default if no stats
  }

  // Improved scoring formula with better base score
  // Base score starts higher (0.4) and scales with urgency
  const baseScore = 0.4;
  const flexScore = flexibilityBonus * 0.25;
  const roleScore = roleWeight * 0.35;

  const score = Math.min(
    1.0,
    baseScore + (flexScore + roleScore) * urgencyMultiplier
  );

  return {
    score,
    confidence: statsConfidence,
  };
}

/**
 * Calculate meta presence score
 * How meta is this champion?
 */
function calculateMetaPresence(
  champion: Champion,
  l0Data: L0DataCache
): { score: number; confidence: number } {
  const championStats = l0Data.championStats.get(champion.id);

  if (!championStats) {
    return { score: 0.5, confidence: 0 };
  }

  // Meta presence is combination of pick rate and ban rate
  const pickRate = championStats.pickRate;
  const banRate = championStats.banRate;

  // High pick rate or ban rate indicates meta relevance
  const metaScore = Math.min(1.0, (pickRate + banRate) * 1.5);

  return {
    score: metaScore,
    confidence: championStats.confidence,
  };
}

/**
 * Calculate recent trend score
 * Is this champion trending up or down?
 */
function calculateRecentTrend(
  champion: Champion,
  l0Data: L0DataCache
): { score: number; confidence: number } {
  const championStats = l0Data.championStats.get(champion.id);

  if (!championStats) {
    return { score: 0.5, confidence: 0 };
  }

  // Use time decay weight as proxy for recent trend
  // Higher time decay weight = more recent picks
  const trendScore = championStats.timeDecayWeight;

  // Combine with pick rate for overall trend
  const combinedScore = (trendScore * 0.6 + championStats.pickRate * 0.4);

  return {
    score: Math.min(1.0, combinedScore),
    confidence: championStats.confidence,
  };
}

/**
 * Calculate synergy ban signal
 * Did opponent ban champions that synergize with this one?
 */
function calculateSynergyBan(
  champion: Champion,
  draftState: DraftState,
  l0Data: L0DataCache
): { score: number; confidence: number } {
  const opponentTeam = getOpponentTeam(draftState.side);
  const opponentBans =
    opponentTeam === 'blue' ? draftState.blueBans : draftState.redBans;

  if (opponentBans.length === 0) {
    return { score: 0, confidence: 1.0 };
  }

  // Get champion synergies
  const synergies = l0Data.synergyMatrix.get(champion.id) || [];

  if (synergies.length === 0) {
    return { score: 0.2, confidence: 0.5 };
  }

  // Check how many synergy partners were banned
  let bannedSynergies = 0;
  let totalSynergyScore = 0;
  let totalConfidence = 0;
  let synergyCount = 0;

  for (const synergy of synergies) {
    if (opponentBans.includes(synergy.championB)) {
      bannedSynergies++;
      totalSynergyScore += synergy.score;
      totalConfidence += synergy.confidence;
      synergyCount++;
    }
  }

  if (bannedSynergies === 0) {
    return { score: 0.2, confidence: 0.8 };
  }

  // Calculate signal strength
  // More banned synergies = stronger signal
  const banRatio = bannedSynergies / Math.min(synergies.length, 5);
  const avgSynergyScore = totalSynergyScore / synergyCount;
  const avgConfidence = totalConfidence / synergyCount;

  const score = Math.min(1.0, banRatio * 0.5 + avgSynergyScore * 0.5);

  return {
    score,
    confidence: avgConfidence,
  };
}

/**
 * Determine threat level from PTS score
 */
function determineThreatLevel(pts: number, config: L1Config): ThreatLevel {
  if (pts >= config.ptsThresholds.critical) return 'critical';
  if (pts >= config.ptsThresholds.high) return 'high';
  if (pts >= config.ptsThresholds.moderate) return 'moderate';
  return 'low';
}

/**
 * Generate human-readable PTS explanation
 */
function generatePTSExplanation(
  champion: Champion,
  pts: number,
  threatLevel: ThreatLevel,
  breakdown: PTSSubScores,
  weights: PhaseWeights
): string {
  const parts: string[] = [];

  // Threat level prefix
  if (threatLevel === 'critical') {
    parts.push('CRITICAL THREAT:');
  } else if (threatLevel === 'high') {
    parts.push('HIGH THREAT:');
  }

  // Find dominant factor
  const factors = [
    { name: 'role vacancy', score: breakdown.roleVacancy.score, weight: weights.roleVacancy },
    { name: 'meta presence', score: breakdown.metaPresence.score, weight: weights.metaPresence },
    { name: 'recent trend', score: breakdown.recentTrend.score, weight: weights.recentTrend },
    { name: 'synergy ban', score: breakdown.synergyBan.score, weight: weights.synergyBan },
  ];

  const dominantFactor = factors.reduce((max, factor) =>
    factor.score * factor.weight > max.score * max.weight ? factor : max
  );

  // Add dominant factor explanation
  if (dominantFactor.name === 'role vacancy' && dominantFactor.score > 0.6) {
    parts.push('Opponent needs this role urgently.');
  } else if (dominantFactor.name === 'meta presence' && dominantFactor.score > 0.7) {
    parts.push('High meta priority champion.');
  } else if (dominantFactor.name === 'recent trend' && dominantFactor.score > 0.7) {
    parts.push('Trending champion in recent games.');
  } else if (dominantFactor.name === 'synergy ban' && dominantFactor.score > 0.6) {
    parts.push('Opponent banned synergy partners.');
  }

  // Add urgency statement
  if (threatLevel === 'critical' || threatLevel === 'high') {
    parts.push('High risk if opponent picks this.');
  }

  return parts.join(' ');
}

/**
 * Calculate PTS for all available champions
 */
export function calculatePTSForAll(
  availableChampions: Champion[],
  draftState: DraftState,
  l0Data: L0DataCache,
  config: L1Config = DEFAULT_L1_CONFIG
): PTSOutput[] {
  const results: PTSOutput[] = [];

  for (const champion of availableChampions) {
    const pts = calculatePhasePTS(champion, draftState, l0Data, config);
    results.push(pts);
  }

  // Sort by PTS descending
  return results.sort((a, b) => b.totalPTS - a.totalPTS);
}

/**
 * Get top N champions by PTS
 */
export function getTopPTSChampions(
  availableChampions: Champion[],
  draftState: DraftState,
  l0Data: L0DataCache,
  topN: number = 10,
  config: L1Config = DEFAULT_L1_CONFIG
): PTSOutput[] {
  const allPTS = calculatePTSForAll(availableChampions, draftState, l0Data, config);
  return allPTS.slice(0, topN);
}
