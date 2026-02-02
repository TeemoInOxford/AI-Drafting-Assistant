/**
 * v4-1 L3 Game Optimizer & Confidence Gate
 *
 * Calculates strategic value and applies confidence gating.
 * Only provides bounded adjustments when confidence is sufficient.
 */

import { Champion } from '../../types';
import { DraftState } from '../types/common-types';
import { L0DataCache } from '../types/l0-types';
import { L1ChampionEvaluation } from '../types/l1-types';
import {
  GameOptimizationResult,
  StrategicValue,
  L3Adjustments,
  L3Config,
  DEFAULT_L3_CONFIG,
  OpponentPredictionResult,
  BPSimulationResult,
} from '../types/l3-types';
import { getRemainingRolesForTeam } from '../core/draft-state';

/**
 * Calculate strategic value for a champion
 */
export function calculateStrategicValue(
  champion: Champion,
  draftState: DraftState,
  l0Data: L0DataCache,
  l1Evaluation: L1ChampionEvaluation,
  config: L3Config = DEFAULT_L3_CONFIG
): GameOptimizationResult {
  // Calculate strategic value components
  const flexValue = calculateFlexValue(champion, draftState, l0Data);
  const informationValue = calculateInformationValue(champion, draftState);
  const counterplayValue = calculateCounterplayValue(champion, l0Data, l1Evaluation);
  const tempoValue = calculateTempoValue(champion, draftState, l1Evaluation);

  const strategicValue: StrategicValue = {
    flexValue,
    informationValue,
    counterplayValue,
    tempoValue,
  };

  // Calculate total value (weighted)
  const weights = config.strategicWeights;
  const totalValue =
    flexValue * weights.flex +
    informationValue * weights.information +
    counterplayValue * weights.counterplay +
    tempoValue * weights.tempo;

  // Calculate confidence (based on data quality)
  const confidence = Math.min(
    l1Evaluation.confidence,
    l0Data.championStats.get(champion.id)?.confidence || 0.5
  );

  // Generate explanation
  const explanation = generateStrategicExplanation(strategicValue, totalValue);

  return {
    championId: champion.id,
    strategicValue,
    totalValue,
    confidence,
    explanation,
  };
}

/**
 * Calculate flex value
 * Champions that can play multiple roles have higher flex value
 */
function calculateFlexValue(
  champion: Champion,
  draftState: DraftState,
  l0Data: L0DataCache
): number {
  const ourRoles = getRemainingRolesForTeam(draftState, draftState.side);

  if (ourRoles.length === 0) return 0;

  // Check how many remaining roles this champion can fill
  const canFillRoles = champion.positions.filter(pos => ourRoles.includes(pos));

  if (canFillRoles.length === 0) return 0;

  // Get role distribution from stats
  const championStats = l0Data.championStats.get(champion.id);
  let roleFlexibility = 0;

  if (championStats) {
    for (const role of canFillRoles) {
      const roleProb = championStats.roleDistribution[role] || 0;
      if (roleProb > 0.1) {
        roleFlexibility += roleProb;
      }
    }
  } else {
    // Fallback: use position count
    roleFlexibility = canFillRoles.length / 3;
  }

  return Math.min(1.0, roleFlexibility);
}

/**
 * Calculate information value
 * Hiding our strategy has value
 */
function calculateInformationValue(
  champion: Champion,
  draftState: DraftState
): number {
  // Early picks have more information value (hide strategy)
  const pickCount = draftState.side === 'blue'
    ? draftState.bluePicks.length
    : draftState.redPicks.length;

  const earlyPickBonus = Math.max(0, 1 - pickCount / 5);

  // Flex picks have higher information value
  const flexBonus = Math.min(1.0, champion.positions.length / 3);

  return (earlyPickBonus * 0.6 + flexBonus * 0.4);
}

/**
 * Calculate counterplay value
 * Future options to counter opponent
 */
function calculateCounterplayValue(
  champion: Champion,
  l0Data: L0DataCache,
  l1Evaluation: L1ChampionEvaluation
): number {
  // Champions with good counter potential have higher counterplay value
  const counterPotential = l1Evaluation.counter.counterPotential;

  // Champions that are not heavily countered have more options
  const notCountered = 1 - l1Evaluation.counter.overallCounterScore;

  return (counterPotential * 0.6 + notCountered * 0.4);
}

/**
 * Calculate tempo value
 * Seizing draft initiative
 */
function calculateTempoValue(
  champion: Champion,
  draftState: DraftState,
  l1Evaluation: L1ChampionEvaluation
): number {
  // High PTS champions have tempo value (deny opponent)
  const ptsValue = l1Evaluation.pts.totalPTS / 100;

  // High deny value champions have tempo value
  const denyValue = l1Evaluation.deny.denyValue;

  // Early phase has more tempo value
  const phaseBonus = draftState.phaseContext.isEarly ? 1.2 : 1.0;

  return Math.min(1.0, (ptsValue * 0.5 + denyValue * 0.5) * phaseBonus);
}

/**
 * Generate strategic explanation
 */
function generateStrategicExplanation(
  strategicValue: StrategicValue,
  totalValue: number
): string {
  const parts: string[] = [];

  if (strategicValue.flexValue >= 0.6) {
    parts.push('High draft flexibility');
  }

  if (strategicValue.informationValue >= 0.6) {
    parts.push('Hides strategy');
  }

  if (strategicValue.counterplayValue >= 0.6) {
    parts.push('Good future counterplay');
  }

  if (strategicValue.tempoValue >= 0.6) {
    parts.push('Seizes draft tempo');
  }

  if (parts.length === 0) {
    return totalValue >= 0.5
      ? 'Moderate strategic value'
      : 'Limited strategic value';
  }

  return parts.join(', ');
}

/**
 * Get strategic adjustment
 */
export function getStrategicAdjustment(
  optimization: GameOptimizationResult,
  config: L3Config = DEFAULT_L3_CONFIG
): number {
  if (optimization.confidence < config.minOptimizationConfidence) {
    return 0;
  }

  // Convert strategic value to adjustment
  // Value range: 0-1
  // Adjustment range: -maxAdjustment to +maxAdjustment
  // Center at 0.5 (neutral)
  const adjustment = (optimization.totalValue - 0.5) * 2 * config.maxStrategicValueAdjustment;

  return Math.max(
    -config.maxStrategicValueAdjustment,
    Math.min(config.maxStrategicValueAdjustment, adjustment)
  );
}

// ============ Confidence Gate ============

/**
 * Apply confidence gate to L3 adjustments
 * Only allows adjustments if confidence is sufficient
 */
export function applyConfidenceGate(
  adjustments: L3Adjustments,
  config: L3Config = DEFAULT_L3_CONFIG
): L3Adjustments {
  // Check overall confidence
  if (adjustments.adjustmentConfidence < config.minConfidence) {
    return {
      ...adjustments,
      opponentPredictionAdjustment: 0,
      simulationAdjustment: 0,
      strategicValueAdjustment: 0,
      adjustmentConfidence: adjustments.adjustmentConfidence,
      opponentPredictionReason: 'Confidence too low',
      simulationReason: 'Confidence too low',
      strategicReason: 'Confidence too low',
    };
  }

  // Gate individual adjustments
  let gatedAdjustments = { ...adjustments };

  // Gate opponent prediction
  if (adjustments.opponentPrediction) {
    if (adjustments.opponentPrediction.confidence < config.minOpponentPredictionConfidence) {
      gatedAdjustments.opponentPredictionAdjustment = 0;
      gatedAdjustments.opponentPredictionReason = 'Prediction confidence too low';
    }
  }

  // Gate simulation
  if (adjustments.simulation) {
    if (adjustments.simulation.confidence < config.minSimulationConfidence) {
      gatedAdjustments.simulationAdjustment = 0;
      gatedAdjustments.simulationReason = 'Simulation confidence too low';
    }
  }

  // Gate optimization
  if (adjustments.optimization) {
    if (adjustments.optimization.confidence < config.minOptimizationConfidence) {
      gatedAdjustments.strategicValueAdjustment = 0;
      gatedAdjustments.strategicReason = 'Optimization confidence too low';
    }
  }

  // Bound total adjustment
  const totalAdjustment =
    gatedAdjustments.opponentPredictionAdjustment +
    gatedAdjustments.simulationAdjustment +
    gatedAdjustments.strategicValueAdjustment;

  if (Math.abs(totalAdjustment) > config.maxAdjustment) {
    const scale = config.maxAdjustment / Math.abs(totalAdjustment);
    gatedAdjustments.opponentPredictionAdjustment *= scale;
    gatedAdjustments.simulationAdjustment *= scale;
    gatedAdjustments.strategicValueAdjustment *= scale;
  }

  return gatedAdjustments;
}

/**
 * Check if L3 should be applied
 */
export function shouldApplyL3(
  adjustments: L3Adjustments,
  config: L3Config = DEFAULT_L3_CONFIG
): boolean {
  if (!config.enabled) return false;

  if (adjustments.adjustmentConfidence < config.minConfidence) {
    return false;
  }

  const totalAdjustment = Math.abs(
    adjustments.opponentPredictionAdjustment +
    adjustments.simulationAdjustment +
    adjustments.strategicValueAdjustment
  );

  // Only apply if adjustment is meaningful
  return totalAdjustment > 0.01;
}
