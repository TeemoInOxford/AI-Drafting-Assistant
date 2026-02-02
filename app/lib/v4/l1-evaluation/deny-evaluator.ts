/**
 * v4-1 L1 Deny Evaluator
 *
 * Evaluates pick-to-deny value for champions.
 * Considers player pools, meta priority, synergy denial, and flex denial.
 */

import { Champion, Team } from '../../types';
import { DraftState } from '../types/common-types';
import { L0DataCache } from '../types/l0-types';
import { DenyOutput } from '../types/l1-types';
import { combineConfidences, weightedConfidence } from '../types/common-types';
import { getOpponentTeam, getRemainingRolesForTeam } from '../core/draft-state';
import { getChampionFrequency } from '../l0-data/player-pools';

/**
 * Evaluate pick-to-deny value for a champion
 */
export function evaluateDenyValue(
  champion: Champion,
  team: Team,
  draftState: DraftState,
  l0Data: L0DataCache,
  opponentPlayerIds?: string[]
): DenyOutput {
  const reasons: DenyOutput['reasons'] = [];

  // 1. Player pool denial
  const playerPoolDeny = calculatePlayerPoolDeny(
    champion,
    opponentPlayerIds,
    l0Data
  );
  if (playerPoolDeny.score > 0) {
    reasons.push({
      type: 'player_pool',
      score: playerPoolDeny.score,
      confidence: playerPoolDeny.confidence,
      explanation: playerPoolDeny.explanation,
    });
  }

  // 2. Meta priority denial
  const metaPriorityDeny = calculateMetaPriorityDeny(champion, l0Data);
  if (metaPriorityDeny.score > 0) {
    reasons.push({
      type: 'meta_priority',
      score: metaPriorityDeny.score,
      confidence: metaPriorityDeny.confidence,
      explanation: metaPriorityDeny.explanation,
    });
  }

  // 3. Synergy denial
  const synergyDeny = calculateSynergyDenial(
    champion,
    team,
    draftState,
    l0Data
  );
  if (synergyDeny.score > 0) {
    reasons.push({
      type: 'synergy_denial',
      score: synergyDeny.score,
      confidence: synergyDeny.confidence,
      explanation: synergyDeny.explanation,
    });
  }

  // 4. Flex denial
  const flexDeny = calculateFlexDenial(champion, team, draftState, l0Data);
  if (flexDeny.score > 0) {
    reasons.push({
      type: 'flex_denial',
      score: flexDeny.score,
      confidence: flexDeny.confidence,
      explanation: flexDeny.explanation,
    });
  }

  // Calculate overall deny value
  const weights = [0.35, 0.25, 0.25, 0.15]; // player_pool, meta, synergy, flex
  let denyValue = 0;
  const confidences: number[] = [];

  reasons.forEach((reason, index) => {
    denyValue += reason.score * weights[index];
    confidences.push(reason.confidence);
  });

  // If no reasons, use low default
  if (reasons.length === 0) {
    denyValue = 0.2;
    confidences.push(0.5);
  }

  // Calculate overall confidence
  const confidence = weightedConfidence(confidences, weights.slice(0, reasons.length));

  // Generate explanation
  const explanation = generateDenyExplanation(champion, denyValue, reasons);

  return {
    championId: champion.id,
    denyValue,
    confidence,
    reasons,
    explanation,
  };
}

/**
 * Calculate player pool denial value
 * How often do opponent players pick this champion?
 */
function calculatePlayerPoolDeny(
  champion: Champion,
  opponentPlayerIds: string[] | undefined,
  l0Data: L0DataCache
): { score: number; confidence: number; explanation: string } {
  if (!opponentPlayerIds || opponentPlayerIds.length === 0) {
    return {
      score: 0,
      confidence: 0,
      explanation: 'No opponent player data',
    };
  }

  let maxFrequency = 0;
  let totalFrequency = 0;
  const confidences: number[] = [];

  for (const playerId of opponentPlayerIds) {
    const frequency = getChampionFrequency(playerId, champion.id, l0Data.playerPools);
    const pool = l0Data.playerPools.get(playerId);

    if (frequency > 0) {
      maxFrequency = Math.max(maxFrequency, frequency);
      totalFrequency += frequency;

      if (pool) {
        confidences.push(pool.confidence);
      }
    }
  }

  if (maxFrequency === 0) {
    return {
      score: 0,
      confidence: 0.5,
      explanation: 'Not in opponent player pools',
    };
  }

  // Score based on max frequency (one player plays it a lot)
  // and average frequency (multiple players play it)
  const avgFrequency = totalFrequency / opponentPlayerIds.length;
  const score = Math.min(1.0, maxFrequency * 0.7 + avgFrequency * 0.3);

  const confidence = confidences.length > 0
    ? combineConfidences(confidences)
    : 0.5;

  let explanation = '';
  if (maxFrequency >= 0.2) {
    explanation = 'High priority in opponent player pool';
  } else if (maxFrequency >= 0.1) {
    explanation = 'Moderate priority in opponent player pool';
  } else {
    explanation = 'Low priority in opponent player pool';
  }

  return { score, confidence, explanation };
}

/**
 * Calculate meta priority denial value
 * How meta is this champion?
 */
function calculateMetaPriorityDeny(
  champion: Champion,
  l0Data: L0DataCache
): { score: number; confidence: number; explanation: string } {
  const championStats = l0Data.championStats.get(champion.id);

  if (!championStats) {
    return {
      score: 0.3,
      confidence: 0,
      explanation: 'No meta data available',
    };
  }

  // Meta priority is combination of pick rate and ban rate
  const pickRate = championStats.pickRate;
  const banRate = championStats.banRate;

  // High pick/ban rate = high deny value
  const score = Math.min(1.0, (pickRate + banRate) * 1.2);

  let explanation = '';
  if (score >= 0.7) {
    explanation = 'High meta priority champion';
  } else if (score >= 0.5) {
    explanation = 'Moderate meta priority';
  } else {
    explanation = 'Low meta priority';
  }

  return {
    score,
    confidence: championStats.confidence,
    explanation,
  };
}

/**
 * Calculate synergy denial value
 * Does this champion synergize with opponent picks?
 */
function calculateSynergyDenial(
  champion: Champion,
  team: Team,
  draftState: DraftState,
  l0Data: L0DataCache
): { score: number; confidence: number; explanation: string } {
  const opponentTeam = getOpponentTeam(team);
  const opponentPickIds = draftState.side === team
    ? (opponentTeam === 'blue' ? draftState.bluePicks : draftState.redPicks)
    : (opponentTeam === 'blue' ? draftState.bluePicks : draftState.redPicks);

  if (opponentPickIds.length === 0) {
    return {
      score: 0,
      confidence: 0,
      explanation: 'No opponent picks yet',
    };
  }

  // Get champion synergies
  const synergies = l0Data.synergyMatrix.get(champion.id) || [];

  if (synergies.length === 0) {
    return {
      score: 0.2,
      confidence: 0.5,
      explanation: 'No synergy data',
    };
  }

  // Check synergy with opponent picks
  let totalSynergyScore = 0;
  let synergyCount = 0;
  const confidences: number[] = [];

  for (const oppPickId of opponentPickIds) {
    const synergy = synergies.find(s => s.championB === oppPickId);
    if (synergy) {
      totalSynergyScore += synergy.score;
      confidences.push(synergy.confidence);
      synergyCount++;
    }
  }

  if (synergyCount === 0) {
    return {
      score: 0.2,
      confidence: 0.5,
      explanation: 'No synergy with opponent picks',
    };
  }

  const avgSynergyScore = totalSynergyScore / synergyCount;
  const confidence = combineConfidences(confidences);

  let explanation = '';
  if (avgSynergyScore >= 0.7) {
    explanation = 'Strong synergy with opponent team';
  } else if (avgSynergyScore >= 0.5) {
    explanation = 'Moderate synergy with opponent team';
  } else {
    explanation = 'Weak synergy with opponent team';
  }

  return {
    score: avgSynergyScore,
    confidence,
    explanation,
  };
}

/**
 * Calculate flex denial value
 * Is this a flex pick that gives opponent draft flexibility?
 */
function calculateFlexDenial(
  champion: Champion,
  team: Team,
  draftState: DraftState,
  l0Data: L0DataCache
): { score: number; confidence: number; explanation: string } {
  const opponentTeam = getOpponentTeam(team);
  const opponentRoles = getRemainingRolesForTeam(draftState, opponentTeam);

  if (opponentRoles.length === 0) {
    return {
      score: 0,
      confidence: 1.0,
      explanation: 'Opponent has no remaining roles',
    };
  }

  // Get champion stats for role distribution
  const championStats = l0Data.championStats.get(champion.id);

  if (!championStats) {
    // Use position count as proxy
    const flexScore = Math.min(1.0, champion.positions.length / 3);
    return {
      score: flexScore * 0.5,
      confidence: 0.3,
      explanation: champion.positions.length >= 2
        ? 'Flex pick (limited data)'
        : 'Not a flex pick',
    };
  }

  // Count how many opponent roles this champion can fill
  let rolesFilled = 0;
  let totalRoleProb = 0;

  for (const role of opponentRoles) {
    const roleProb = championStats.roleDistribution[role] || 0;
    if (roleProb > 0.1) {
      // Champion can reasonably play this role
      rolesFilled++;
      totalRoleProb += roleProb;
    }
  }

  if (rolesFilled === 0) {
    return {
      score: 0,
      confidence: championStats.confidence,
      explanation: 'Cannot fill opponent roles',
    };
  }

  // Score based on flexibility
  const flexScore = Math.min(1.0, (rolesFilled / 3) * 0.6 + (totalRoleProb / rolesFilled) * 0.4);

  let explanation = '';
  if (rolesFilled >= 3) {
    explanation = 'High flex potential for opponent';
  } else if (rolesFilled >= 2) {
    explanation = 'Moderate flex potential';
  } else {
    explanation = 'Limited flex potential';
  }

  return {
    score: flexScore,
    confidence: championStats.confidence,
    explanation,
  };
}

/**
 * Generate deny explanation
 */
function generateDenyExplanation(
  champion: Champion,
  denyValue: number,
  reasons: DenyOutput['reasons']
): string {
  if (reasons.length === 0) {
    return 'Low deny value';
  }

  const parts: string[] = [];

  // Overall assessment
  if (denyValue >= 0.7) {
    parts.push('High deny value.');
  } else if (denyValue >= 0.5) {
    parts.push('Moderate deny value.');
  } else {
    parts.push('Low deny value.');
  }

  // Highlight top reason
  const topReason = reasons.reduce((max, r) => r.score > max.score ? r : max);
  parts.push(topReason.explanation);

  return parts.join(' ');
}

/**
 * Evaluate deny value for all available champions
 */
export function evaluateDenyForAll(
  availableChampions: Champion[],
  team: Team,
  draftState: DraftState,
  l0Data: L0DataCache,
  opponentPlayerIds?: string[]
): DenyOutput[] {
  const results: DenyOutput[] = [];

  for (const champion of availableChampions) {
    const deny = evaluateDenyValue(
      champion,
      team,
      draftState,
      l0Data,
      opponentPlayerIds
    );
    results.push(deny);
  }

  // Sort by deny value descending
  return results.sort((a, b) => b.denyValue - a.denyValue);
}

/**
 * Get top deny picks
 */
export function getTopDenyPicks(
  availableChampions: Champion[],
  team: Team,
  draftState: DraftState,
  l0Data: L0DataCache,
  opponentPlayerIds?: string[],
  topN: number = 10,
  minConfidence: number = 0.3
): DenyOutput[] {
  const allDeny = evaluateDenyForAll(
    availableChampions,
    team,
    draftState,
    l0Data,
    opponentPlayerIds
  );

  return allDeny
    .filter(d => d.confidence >= minConfidence)
    .slice(0, topN);
}
