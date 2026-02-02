/**
 * v4-1 L1 Composition Evaluator
 *
 * Evaluates team composition balance and quality.
 * Analyzes role balance, damage types, range, tankiness, engage/disengage.
 */

import { Champion, Position, Team } from '../../types';
import { DraftState } from '../types/common-types';
import { L0DataCache } from '../types/l0-types';
import {
  CompositionOutput,
  CompositionBalance,
} from '../types/l1-types';
import { combineConfidences } from '../types/common-types';
import { getPicksForTeam, getRemainingRolesForTeam } from '../core/draft-state';
import { getChampionAttributes, calculateTeamAverage } from '../l0-data/champion-attributes';

/**
 * Evaluate team composition
 */
export function evaluateComposition(
  team: Team,
  draftState: DraftState,
  champions: Champion[],
  l0Data: L0DataCache
): CompositionOutput {
  // Get team picks
  const teamPickIds = getPicksForTeam(draftState, team);
  const teamChampions = teamPickIds
    .map(id => champions.find(c => c.id === id))
    .filter((c): c is Champion => c !== undefined);

  // Calculate balance metrics
  const roleBalance = calculateRoleBalance(team, draftState);
  const damageBalance = calculateDamageBalance(teamChampions);
  const rangeBalance = calculateRangeBalance(teamChampions);
  const tankiness = calculateTankiness(teamChampions);
  const engage = calculateEngage(teamChampions);
  const disengage = calculateDisengage(teamChampions);

  const balance: CompositionBalance = {
    roleBalance,
    damageBalance,
    rangeBalance,
    tankiness,
    engage,
    disengage,
  };

  // Calculate overall score
  const overallScore = calculateOverallScore(balance);

  // Calculate overall confidence
  const confidence = combineConfidences([
    roleBalance.confidence,
    damageBalance.confidence,
    rangeBalance.confidence,
    tankiness.confidence,
    engage.confidence,
    disengage.confidence,
  ]);

  // Identify strengths and weaknesses
  const strengths = identifyStrengths(balance);
  const weaknesses = identifyWeaknesses(balance);
  const suggestions = generateSuggestions(balance, draftState, team);

  return {
    teamSide: team,
    overallScore,
    confidence,
    balance,
    strengths,
    weaknesses,
    suggestions,
  };
}

/**
 * Calculate role balance
 * Are all roles filled appropriately?
 */
function calculateRoleBalance(
  team: Team,
  draftState: DraftState
): { score: number; confidence: number } {
  const remainingRoles = getRemainingRolesForTeam(draftState, team);
  const totalRoles = 5;
  const filledRoles = totalRoles - remainingRoles.length;

  // Score based on how many roles are filled
  const score = filledRoles / totalRoles;

  // Confidence is high (we know exactly which roles are filled)
  const confidence = 1.0;

  return { score, confidence };
}

/**
 * Calculate damage balance
 * Physical vs Magic damage distribution
 * Now uses actual champion attribute data instead of position heuristics
 */
function calculateDamageBalance(
  champions: Champion[]
): { score: number; confidence: number } {
  if (champions.length === 0) {
    return { score: 0.5, confidence: 0 };
  }

  // Use champion attributes for accurate damage calculation
  const championIds = champions.map(c => c.id);
  const physicalResult = calculateTeamAverage(
    championIds,
    attr => attr.physicalDamageRatio
  );
  const magicResult = calculateTeamAverage(
    championIds,
    attr => attr.magicDamageRatio
  );

  const physicalRatio = physicalResult.value;
  const magicRatio = magicResult.value;
  const avgConfidence = (physicalResult.confidence + magicResult.confidence) / 2;

  // Calculate total damage ratio (should be close to 1.0)
  const totalRatio = physicalRatio + magicRatio;

  if (totalRatio === 0) {
    return { score: 0.5, confidence: 0.5 };
  }

  // Normalize ratios
  const normalizedPhysical = physicalRatio / totalRatio;
  const normalizedMagic = magicRatio / totalRatio;

  // Ideal balance is around 50/50, but 40/60 to 60/40 is acceptable
  // Calculate score based on how close to balanced we are
  const balanceDeviation = Math.abs(normalizedPhysical - 0.5);

  let score: number;
  if (balanceDeviation <= 0.1) {
    score = 1.0; // Excellent balance (45/55 to 55/45)
  } else if (balanceDeviation <= 0.2) {
    score = 0.8; // Good balance (40/60 to 60/40)
  } else if (balanceDeviation <= 0.3) {
    score = 0.6; // Acceptable (30/70 to 70/30)
  } else {
    score = 0.4; // Poor balance
  }

  return { score, confidence: avgConfidence };
}

/**
 * Calculate range balance
 * Melee vs Ranged distribution
 * Now uses actual champion attribute data
 */
function calculateRangeBalance(
  champions: Champion[]
): { score: number; confidence: number } {
  if (champions.length === 0) {
    return { score: 0.5, confidence: 0 };
  }

  // Use champion attributes for accurate range calculation
  const championIds = champions.map(c => c.id);
  const rangeResult = calculateTeamAverage(
    championIds,
    attr => attr.effectiveRange
  );

  const avgRange = rangeResult.value;
  const confidence = rangeResult.confidence;

  // Ideal is a mix of melee and ranged (avg around 0.4-0.6)
  // Too much melee (< 0.3) or too much ranged (> 0.7) is problematic
  let score: number;

  if (avgRange >= 0.35 && avgRange <= 0.65) {
    score = 1.0; // Good balance
  } else if (avgRange >= 0.25 && avgRange <= 0.75) {
    score = 0.7; // Acceptable
  } else {
    score = 0.4; // Poor balance
  }

  return { score, confidence };
}

/**
 * Calculate tankiness
 * Does team have enough frontline?
 * Now uses actual champion attribute data
 */
function calculateTankiness(
  champions: Champion[]
): { score: number; confidence: number } {
  if (champions.length === 0) {
    return { score: 0, confidence: 0 };
  }

  // Use champion attributes for accurate tankiness calculation
  const championIds = champions.map(c => c.id);
  const tankinessResult = calculateTeamAverage(
    championIds,
    attr => attr.frontlineCapability
  );

  // Score is directly the average frontline capability
  return {
    score: tankinessResult.value,
    confidence: tankinessResult.confidence,
  };
}

/**
 * Calculate engage potential
 * Can team initiate fights?
 * Now uses actual champion attribute data
 */
function calculateEngage(
  champions: Champion[]
): { score: number; confidence: number } {
  if (champions.length === 0) {
    return { score: 0, confidence: 0 };
  }

  // Use champion attributes for accurate engage calculation
  const championIds = champions.map(c => c.id);
  const engageResult = calculateTeamAverage(
    championIds,
    attr => attr.engagePotential
  );

  // Score is directly the average engage potential
  return {
    score: engageResult.value,
    confidence: engageResult.confidence,
  };
}

/**
 * Calculate disengage potential
 * Can team escape or peel?
 * Now uses actual champion attribute data
 */
function calculateDisengage(
  champions: Champion[]
): { score: number; confidence: number } {
  if (champions.length === 0) {
    return { score: 0, confidence: 0 };
  }

  // Use champion attributes for accurate disengage calculation
  const championIds = champions.map(c => c.id);
  const disengageResult = calculateTeamAverage(
    championIds,
    attr => attr.disengagePotential
  );

  // Score is directly the average disengage potential
  return {
    score: disengageResult.value,
    confidence: disengageResult.confidence,
  };
}

/**
 * Calculate overall composition score
 */
function calculateOverallScore(balance: CompositionBalance): number {
  // Weighted average of all balance metrics
  const weights = {
    roleBalance: 0.3,
    damageBalance: 0.2,
    rangeBalance: 0.15,
    tankiness: 0.15,
    engage: 0.1,
    disengage: 0.1,
  };

  return (
    balance.roleBalance.score * weights.roleBalance +
    balance.damageBalance.score * weights.damageBalance +
    balance.rangeBalance.score * weights.rangeBalance +
    balance.tankiness.score * weights.tankiness +
    balance.engage.score * weights.engage +
    balance.disengage.score * weights.disengage
  );
}

/**
 * Identify composition strengths
 */
function identifyStrengths(balance: CompositionBalance): string[] {
  const strengths: string[] = [];

  if (balance.roleBalance.score >= 0.8) {
    strengths.push('Well-balanced role distribution');
  }
  if (balance.damageBalance.score >= 0.8) {
    strengths.push('Good physical/magic damage balance');
  }
  if (balance.tankiness.score >= 0.7) {
    strengths.push('Strong frontline');
  }
  if (balance.engage.score >= 0.7) {
    strengths.push('Good engage potential');
  }
  if (balance.disengage.score >= 0.7) {
    strengths.push('Strong disengage/peel');
  }

  return strengths;
}

/**
 * Identify composition weaknesses
 */
function identifyWeaknesses(balance: CompositionBalance): string[] {
  const weaknesses: string[] = [];

  if (balance.roleBalance.score < 0.6) {
    weaknesses.push('Missing key roles');
  }
  if (balance.damageBalance.score < 0.5) {
    weaknesses.push('Unbalanced damage types');
  }
  if (balance.tankiness.score < 0.4) {
    weaknesses.push('Lacks frontline');
  }
  if (balance.engage.score < 0.4) {
    weaknesses.push('Limited engage options');
  }
  if (balance.disengage.score < 0.4) {
    weaknesses.push('Weak disengage/peel');
  }

  return weaknesses;
}

/**
 * Generate improvement suggestions
 */
function generateSuggestions(
  balance: CompositionBalance,
  draftState: DraftState,
  team: Team
): string[] {
  const suggestions: string[] = [];
  const remainingRoles = getRemainingRolesForTeam(draftState, team);

  // Role-based suggestions
  if (remainingRoles.length > 0) {
    suggestions.push(`Need to fill: ${remainingRoles.join(', ')}`);
  }

  // Balance-based suggestions
  if (balance.tankiness.score < 0.5 && remainingRoles.length > 0) {
    suggestions.push('Consider picking a tanky champion');
  }

  if (balance.engage.score < 0.5 && remainingRoles.length > 0) {
    suggestions.push('Need more engage tools');
  }

  if (balance.damageBalance.score < 0.5) {
    suggestions.push('Balance physical and magic damage');
  }

  return suggestions;
}
