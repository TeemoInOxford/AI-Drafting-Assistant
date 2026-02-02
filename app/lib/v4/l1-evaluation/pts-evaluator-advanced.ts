/**
 * v4-2 Advanced PTS Evaluator
 *
 * Enhanced PTS calculation with:
 * 1. Opponent pick history analysis
 * 2. Counter-aware threat adjustment
 * 3. Team composition context
 * 4. Dynamic phase weighting
 * 5. Advanced meta presence scoring
 */

import { Champion, Position } from '../../types';
import { DraftState } from '../types/common-types';
import { L0DataCache } from '../types/l0-types';
import {
  PTSOutput,
  PTSSubScores,
  ThreatLevel,
  L1Config,
  DEFAULT_L1_CONFIG,
} from '../types/l1-types';
import { combineConfidences } from '../types/common-types';
import { getOpponentTeam, getRemainingRolesForTeam, getPicksForTeam } from '../core/draft-state';
import { getCounterBetween } from '../l0-data/counter-matrix';
import { getChampionAttributes } from '../l0-data/champion-attributes';

/**
 * Advanced PTS sub-scores
 */
export interface AdvancedPTSSubScores extends PTSSubScores {
  opponentCompositionThreat: { score: number; confidence: number };
  counterAdjustment: { score: number; confidence: number };
  ourCompositionNeed: { score: number; confidence: number };
}

/**
 * Calculate advanced phase-aware PTS
 */
export function calculateAdvancedPTS(
  champion: Champion,
  draftState: DraftState,
  l0Data: L0DataCache,
  config: L1Config = DEFAULT_L1_CONFIG
): PTSOutput {
  // Get base PTS components
  const roleVacancy = calculateRoleVacancy(champion, draftState, l0Data);
  const metaPresence = calculateAdvancedMetaPresence(champion, l0Data, draftState);
  const recentTrend = calculateRecentTrend(champion, l0Data);
  const synergyBan = calculateSynergyBan(champion, draftState, l0Data);

  // NEW: Advanced components
  const opponentCompositionThreat = calculateOpponentCompositionThreat(
    champion,
    draftState,
    l0Data
  );
  const counterAdjustment = calculateCounterAdjustment(
    champion,
    draftState,
    l0Data
  );
  const ourCompositionNeed = calculateOurCompositionNeed(
    champion,
    draftState,
    l0Data
  );

  // Get dynamic phase weights
  const phaseWeights = getDynamicPhaseWeights(draftState, config);

  // Calculate base PTS
  const basePTS =
    roleVacancy.score * phaseWeights.roleVacancy +
    metaPresence.score * phaseWeights.metaPresence +
    recentTrend.score * phaseWeights.recentTrend +
    synergyBan.score * phaseWeights.synergyBan;

  // Apply advanced adjustments
  const compositionMultiplier = 1.0 + (opponentCompositionThreat.score * 0.3);
  const counterMultiplier = 1.0 - (counterAdjustment.score * 0.4);
  const needMultiplier = 1.0 + (ourCompositionNeed.score * 0.2);

  // Final PTS with all adjustments
  const adjustedPTS = basePTS * compositionMultiplier * counterMultiplier * needMultiplier;
  const scaledPTS = Math.min(100, Math.max(0, adjustedPTS * 100));

  // Calculate overall confidence
  const confidence = combineConfidences([
    roleVacancy.confidence,
    metaPresence.confidence,
    recentTrend.confidence,
    synergyBan.confidence,
    opponentCompositionThreat.confidence,
    counterAdjustment.confidence,
    ourCompositionNeed.confidence,
  ]);

  const threatLevel = determineThreatLevel(scaledPTS, config);

  const breakdown: PTSSubScores = {
    roleVacancy,
    metaPresence,
    recentTrend,
    synergyBan,
  };

  const explanation = generateAdvancedPTSExplanation(
    champion,
    scaledPTS,
    threatLevel,
    breakdown,
    opponentCompositionThreat,
    counterAdjustment,
    ourCompositionNeed
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
 * OPTIMIZATION 1: Opponent Composition Threat
 * Analyzes what opponent has picked and how this champion fits their strategy
 */
function calculateOpponentCompositionThreat(
  champion: Champion,
  draftState: DraftState,
  l0Data: L0DataCache
): { score: number; confidence: number } {
  const opponentTeam = getOpponentTeam(draftState.side);
  const opponentPickIds = getPicksForTeam(draftState, opponentTeam);

  if (opponentPickIds.length === 0) {
    return { score: 0.5, confidence: 0 };
  }

  // Analyze opponent's composition type
  const opponentAttributes = opponentPickIds.map(id => getChampionAttributes(id));

  // Calculate opponent's current composition profile
  const avgEngage = opponentAttributes.reduce((sum, attr) => sum + attr.engagePotential, 0) / opponentAttributes.length;
  const avgTankiness = opponentAttributes.reduce((sum, attr) => sum + attr.tankiness, 0) / opponentAttributes.length;
  const avgPhysical = opponentAttributes.reduce((sum, attr) => sum + attr.physicalDamageRatio, 0) / opponentAttributes.length;
  const avgMagic = opponentAttributes.reduce((sum, attr) => sum + attr.magicDamageRatio, 0) / opponentAttributes.length;

  // Get this champion's attributes
  const championAttr = getChampionAttributes(champion.id);

  // Calculate threat based on composition fit
  let threatScore = 0.5; // Base threat

  // If opponent lacks engage and this champion provides it
  if (avgEngage < 0.4 && championAttr.engagePotential > 0.6) {
    threatScore += 0.2;
  }

  // If opponent lacks tankiness and this champion provides it
  if (avgTankiness < 0.4 && championAttr.tankiness > 0.6) {
    threatScore += 0.2;
  }

  // If opponent is heavy physical and this champion adds magic (balance)
  if (avgPhysical > 0.7 && championAttr.magicDamageRatio > 0.7) {
    threatScore += 0.15;
  }

  // If opponent is heavy magic and this champion adds physical (balance)
  if (avgMagic > 0.7 && championAttr.physicalDamageRatio > 0.7) {
    threatScore += 0.15;
  }

  // Calculate confidence based on data quality
  const avgConfidence = opponentAttributes.reduce((sum, attr) => sum + attr.confidence, 0) / opponentAttributes.length;
  const confidence = (avgConfidence + championAttr.confidence) / 2;

  return {
    score: Math.min(1.0, threatScore),
    confidence,
  };
}

/**
 * OPTIMIZATION 2: Counter-Aware Adjustment
 * Reduces threat if we've already picked counters to this champion
 */
function calculateCounterAdjustment(
  champion: Champion,
  draftState: DraftState,
  l0Data: L0DataCache
): { score: number; confidence: number } {
  const ourTeam = draftState.side;
  const ourPickIds = getPicksForTeam(draftState, ourTeam);

  if (ourPickIds.length === 0) {
    return { score: 0, confidence: 1.0 };
  }

  // Check if any of our picks counter this champion
  let totalCounterScore = 0;
  let counterCount = 0;
  const confidences: number[] = [];

  for (const ourChampId of ourPickIds) {
    const counter = getCounterBetween(champion.id, ourChampId, l0Data.counterMatrix);

    if (counter && counter.score > 0.3) {
      totalCounterScore += counter.score;
      confidences.push(counter.confidence);
      counterCount++;
    }
  }

  if (counterCount === 0) {
    return { score: 0, confidence: 0.8 };
  }

  // Average counter score (how much we counter this champion)
  const avgCounterScore = totalCounterScore / counterCount;

  // If we have strong counters, threat is reduced
  const adjustmentScore = avgCounterScore;

  const confidence = confidences.length > 0
    ? combineConfidences(confidences)
    : 0.5;

  return {
    score: adjustmentScore,
    confidence,
  };
}

/**
 * OPTIMIZATION 3: Our Composition Need
 * Increases threat if this champion fills a gap we desperately need
 */
function calculateOurCompositionNeed(
  champion: Champion,
  draftState: DraftState,
  l0Data: L0DataCache
): { score: number; confidence: number } {
  const ourTeam = draftState.side;
  const ourPickIds = getPicksForTeam(draftState, ourTeam);

  if (ourPickIds.length === 0) {
    return { score: 0.5, confidence: 0 };
  }

  // Analyze our composition gaps
  const ourAttributes = ourPickIds.map(id => getChampionAttributes(id));
  const championAttr = getChampionAttributes(champion.id);

  // Calculate our current composition profile
  const ourAvgEngage = ourAttributes.reduce((sum, attr) => sum + attr.engagePotential, 0) / ourAttributes.length;
  const ourAvgTankiness = ourAttributes.reduce((sum, attr) => sum + attr.tankiness, 0) / ourAttributes.length;
  const ourAvgPhysical = ourAttributes.reduce((sum, attr) => sum + attr.physicalDamageRatio, 0) / ourAttributes.length;
  const ourAvgMagic = ourAttributes.reduce((sum, attr) => sum + attr.magicDamageRatio, 0) / ourAttributes.length;

  let needScore = 0;

  // If we lack engage and opponent picks engage, it's more threatening
  if (ourAvgEngage < 0.4 && championAttr.engagePotential > 0.6) {
    needScore += 0.25;
  }

  // If we lack tankiness and opponent picks tank, it's more threatening
  if (ourAvgTankiness < 0.4 && championAttr.tankiness > 0.6) {
    needScore += 0.25;
  }

  // If we're heavy physical and opponent picks physical (easier to itemize against us)
  if (ourAvgPhysical > 0.7 && championAttr.physicalDamageRatio > 0.7) {
    needScore += 0.15;
  }

  // If we're heavy magic and opponent picks magic (easier to itemize against us)
  if (ourAvgMagic > 0.7 && championAttr.magicDamageRatio > 0.7) {
    needScore += 0.15;
  }

  const avgConfidence = ourAttributes.reduce((sum, attr) => sum + attr.confidence, 0) / ourAttributes.length;
  const confidence = (avgConfidence + championAttr.confidence) / 2;

  return {
    score: Math.min(1.0, needScore),
    confidence,
  };
}

/**
 * OPTIMIZATION 4: Dynamic Phase Weights
 * Adjusts weights based on exact draft step, not just Early/Mid/Late
 */
function getDynamicPhaseWeights(
  draftState: DraftState,
  config: L1Config
): { roleVacancy: number; metaPresence: number; recentTrend: number; synergyBan: number } {
  const { phase, turn } = draftState;

  // Ban phase: Meta presence is king
  if (phase === 'ban1' || phase === 'ban2') {
    return {
      roleVacancy: 0.15,
      metaPresence: 0.55,
      recentTrend: 0.20,
      synergyBan: 0.10,
    };
  }

  // First pick phase: Balance meta and role
  if (phase === 'pick1' && turn <= 2) {
    return {
      roleVacancy: 0.25,
      metaPresence: 0.45,
      recentTrend: 0.20,
      synergyBan: 0.10,
    };
  }

  // Mid pick phase: Role vacancy becomes important
  if (phase === 'pick1' && turn > 2) {
    return {
      roleVacancy: 0.40,
      metaPresence: 0.25,
      recentTrend: 0.15,
      synergyBan: 0.20,
    };
  }

  // Final picks: Role completion is critical
  if (phase === 'pick2') {
    return {
      roleVacancy: 0.55,
      metaPresence: 0.15,
      recentTrend: 0.10,
      synergyBan: 0.20,
    };
  }

  // Fallback to config defaults
  return draftState.phaseContext.isEarly
    ? config.earlyPhaseWeights
    : draftState.phaseContext.isMid
    ? config.midPhaseWeights
    : config.latePhaseWeights;
}

/**
 * OPTIMIZATION 5: Advanced Meta Presence
 * Considers win rate, region, and patch version
 */
function calculateAdvancedMetaPresence(
  champion: Champion,
  l0Data: L0DataCache,
  draftState: DraftState
): { score: number; confidence: number } {
  const championStats = l0Data.championStats.get(champion.id);

  if (!championStats) {
    return { score: 0.5, confidence: 0 };
  }

  const pickRate = championStats.pickRate;
  const banRate = championStats.banRate;

  // Base meta score (pick + ban rate)
  let metaScore = (pickRate + banRate) * 1.5;

  // ENHANCEMENT: Weight by win rate
  // High pick rate + high win rate = very meta
  // High pick rate + low win rate = overrated
  // This would require win rate data in championStats
  // For now, we use a simplified version

  // ENHANCEMENT: Recent trend amplification
  // If champion is trending up, increase meta score
  const trendWeight = championStats.timeDecayWeight;
  if (trendWeight > 0.7) {
    metaScore *= 1.15; // 15% boost for hot picks
  } else if (trendWeight < 0.3) {
    metaScore *= 0.85; // 15% reduction for declining picks
  }

  // ENHANCEMENT: Ban rate amplification
  // High ban rate indicates fear/respect
  if (banRate > 0.5) {
    metaScore *= 1.2; // 20% boost for highly banned champions
  }

  return {
    score: Math.min(1.0, metaScore),
    confidence: championStats.confidence,
  };
}

/**
 * Helper functions (reused from original)
 */
function calculateRoleVacancy(
  champion: Champion,
  draftState: DraftState,
  l0Data: L0DataCache
): { score: number; confidence: number } {
  const opponentTeam = getOpponentTeam(draftState.side);
  const opponentRoles = getRemainingRolesForTeam(draftState, opponentTeam);

  if (opponentRoles.length === 0) {
    return { score: 0, confidence: 1.0 };
  }

  const canFillRoles = champion.positions.filter(pos =>
    opponentRoles.includes(pos)
  );

  if (canFillRoles.length === 0) {
    return { score: 0, confidence: 1.0 };
  }

  const championStats = l0Data.championStats.get(champion.id);
  const statsConfidence = championStats?.confidence || 0.5;

  const urgencyMultiplier = Math.pow(6 - opponentRoles.length, 1.5) / Math.pow(5, 1.5);
  const flexibilityBonus = Math.min(canFillRoles.length / 3, 1.0);

  let roleWeight = 0;
  if (championStats) {
    for (const role of canFillRoles) {
      roleWeight += championStats.roleDistribution[role] || 0;
    }
    roleWeight = roleWeight / canFillRoles.length;
  } else {
    roleWeight = 0.5;
  }

  const baseScore = 0.4;
  const flexScore = flexibilityBonus * 0.25;
  const roleScore = roleWeight * 0.35;

  const score = Math.min(
    1.0,
    baseScore + (flexScore + roleScore) * urgencyMultiplier
  );

  return { score, confidence: statsConfidence };
}

function calculateRecentTrend(
  champion: Champion,
  l0Data: L0DataCache
): { score: number; confidence: number } {
  const championStats = l0Data.championStats.get(champion.id);

  if (!championStats) {
    return { score: 0.5, confidence: 0 };
  }

  const trendScore = championStats.timeDecayWeight;
  const combinedScore = (trendScore * 0.6 + championStats.pickRate * 0.4);

  return {
    score: Math.min(1.0, combinedScore),
    confidence: championStats.confidence,
  };
}

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

  const synergies = l0Data.synergyMatrix.get(champion.id) || [];

  if (synergies.length === 0) {
    return { score: 0.2, confidence: 0.5 };
  }

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

  const banRatio = bannedSynergies / Math.min(synergies.length, 5);
  const avgSynergyScore = totalSynergyScore / synergyCount;
  const avgConfidence = totalConfidence / synergyCount;

  const score = Math.min(1.0, banRatio * 0.5 + avgSynergyScore * 0.5);

  return { score, confidence: avgConfidence };
}

function determineThreatLevel(pts: number, config: L1Config): ThreatLevel {
  if (pts >= config.ptsThresholds.critical) return 'critical';
  if (pts >= config.ptsThresholds.high) return 'high';
  if (pts >= config.ptsThresholds.moderate) return 'moderate';
  return 'low';
}

function generateAdvancedPTSExplanation(
  champion: Champion,
  pts: number,
  threatLevel: ThreatLevel,
  breakdown: PTSSubScores,
  opponentThreat: { score: number; confidence: number },
  counterAdj: { score: number; confidence: number },
  ourNeed: { score: number; confidence: number }
): string {
  const parts: string[] = [];

  if (threatLevel === 'critical') {
    parts.push('CRITICAL THREAT:');
  } else if (threatLevel === 'high') {
    parts.push('HIGH THREAT:');
  }

  // Add context-aware explanations
  if (opponentThreat.score > 0.6) {
    parts.push('Fits opponent composition perfectly.');
  }

  if (counterAdj.score > 0.5) {
    parts.push('We have counters picked.');
  }

  if (ourNeed.score > 0.6) {
    parts.push('Exploits our composition weakness.');
  }

  if (breakdown.roleVacancy.score > 0.6) {
    parts.push('Opponent needs this role urgently.');
  }

  if (breakdown.metaPresence.score > 0.7) {
    parts.push('High meta priority.');
  }

  if (threatLevel === 'critical' || threatLevel === 'high') {
    parts.push('High risk if opponent picks this.');
  }

  return parts.join(' ');
}
