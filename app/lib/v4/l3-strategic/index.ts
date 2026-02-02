/**
 * v4-1 L3 Strategic Layer Public API
 *
 * Unified interface for strategic analysis and adjustments.
 * Provides bounded game-theoretic optimization with confidence gating.
 */

import { Champion } from '../../types';
import { DraftState } from '../types/common-types';
import { L0DataCache } from '../types/l0-types';
import { L1ChampionEvaluation } from '../types/l1-types';
import {
  L3Adjustments,
  L3AnalysisResult,
  L3Config,
  DEFAULT_L3_CONFIG,
} from '../types/l3-types';

import { predictOpponentPicks } from './opponent-predictor';
import { simulateBPPaths, getSimulationAdjustment } from './bp-simulator';
import {
  calculateStrategicValue,
  getStrategicAdjustment,
  applyConfidenceGate,
} from './game-optimizer';

/**
 * Calculate L3 strategic adjustments for all champions
 */
export async function calculateStrategicAdjustments(
  draftState: DraftState,
  availableChampions: Champion[],
  l0Data: L0DataCache,
  l1Evaluations: Map<string, L1ChampionEvaluation>,
  opponentPlayerIds?: string[],
  config: L3Config = DEFAULT_L3_CONFIG
): Promise<L3AnalysisResult> {
  if (!config.enabled) {
    return {
      adjustments: new Map(),
      opponentPrediction: {
        predictions: [],
        totalEntropy: 1.0,
        confidence: 0,
        predictedNext: [],
      },
      overallConfidence: 0,
      timestamp: new Date(),
    };
  }

  // Step 1: Predict opponent picks
  const opponentPrediction = predictOpponentPicks(
    draftState,
    availableChampions,
    l0Data,
    l1Evaluations,
    opponentPlayerIds,
    config
  );

  // Step 2: Calculate adjustments for each champion
  const adjustments = new Map<string, L3Adjustments>();
  const confidences: number[] = [];

  for (const champion of availableChampions) {
    const l1Eval = l1Evaluations.get(champion.id);
    if (!l1Eval) continue;

    const adjustment = await calculateChampionAdjustments(
      champion,
      draftState,
      availableChampions,
      l0Data,
      l1Eval,
      l1Evaluations,
      opponentPrediction,
      config
    );

    adjustments.set(champion.id, adjustment);
    confidences.push(adjustment.adjustmentConfidence);
  }

  // Calculate overall confidence
  const overallConfidence = confidences.length > 0
    ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
    : 0;

  return {
    adjustments,
    opponentPrediction,
    overallConfidence,
    timestamp: new Date(),
  };
}

/**
 * Calculate adjustments for a single champion
 */
async function calculateChampionAdjustments(
  champion: Champion,
  draftState: DraftState,
  availableChampions: Champion[],
  l0Data: L0DataCache,
  l1Evaluation: L1ChampionEvaluation,
  l1Evaluations: Map<string, L1ChampionEvaluation>,
  opponentPrediction: any,
  config: L3Config
): Promise<L3Adjustments> {
  // Component 1: Opponent prediction adjustment
  let opponentPredictionAdjustment = 0;
  let opponentPredictionReason = '';

  const prediction = opponentPrediction.predictions.find(
    (p: any) => p.championId === champion.id
  );

  if (prediction && prediction.probability > 0.3) {
    // High probability opponent will pick this
    opponentPredictionAdjustment = prediction.probability * config.maxOpponentPredictionAdjustment;
    opponentPredictionReason = `Opponent likely to pick (${(prediction.probability * 100).toFixed(0)}% probability)`;
  } else {
    opponentPredictionReason = 'Low opponent pick probability';
  }

  // Component 2: Simulation adjustment
  let simulationAdjustment = 0;
  let simulationReason = '';
  let simulation = null;

  try {
    simulation = simulateBPPaths(
      champion.id,
      draftState,
      availableChampions,
      l0Data,
      l1Evaluations,
      opponentPrediction,
      config
    );

    simulationAdjustment = getSimulationAdjustment(simulation, config);

    if (simulation.avgAdvantage > 0.1) {
      simulationReason = `Positive future advantage (+${(simulation.avgAdvantage * 100).toFixed(0)}%)`;
    } else if (simulation.avgAdvantage < -0.1) {
      simulationReason = `Negative future advantage (${(simulation.avgAdvantage * 100).toFixed(0)}%)`;
    } else {
      simulationReason = 'Neutral future advantage';
    }
  } catch (error) {
    simulationReason = 'Simulation unavailable';
  }

  // Component 3: Strategic value adjustment
  const optimization = calculateStrategicValue(
    champion,
    draftState,
    l0Data,
    l1Evaluation,
    config
  );

  const strategicValueAdjustment = getStrategicAdjustment(optimization, config);
  const strategicReason = optimization.explanation;

  // Calculate overall confidence
  const adjustmentConfidence = Math.min(
    opponentPrediction.confidence,
    simulation?.confidence || 0.5,
    optimization.confidence
  );

  // Create raw adjustments
  let adjustments: L3Adjustments = {
    championId: champion.id,
    opponentPredictionAdjustment,
    simulationAdjustment,
    strategicValueAdjustment,
    adjustmentConfidence,
    opponentPredictionReason,
    simulationReason,
    strategicReason,
    opponentPrediction,
    simulation: simulation || undefined,
    optimization,
  };

  // Apply confidence gate
  adjustments = applyConfidenceGate(adjustments, config);

  return adjustments;
}

/**
 * Get top strategic picks
 */
export function getTopStrategicPicks(
  result: L3AnalysisResult,
  topN: number = 10
): L3Adjustments[] {
  const adjustments = Array.from(result.adjustments.values());

  return adjustments
    .sort((a, b) => {
      const totalA = a.opponentPredictionAdjustment + a.simulationAdjustment + a.strategicValueAdjustment;
      const totalB = b.opponentPredictionAdjustment + b.simulationAdjustment + b.strategicValueAdjustment;
      return totalB - totalA;
    })
    .slice(0, topN);
}

/**
 * Get high confidence adjustments
 */
export function getHighConfidenceAdjustments(
  result: L3AnalysisResult,
  minConfidence: number = 0.6
): L3Adjustments[] {
  return Array.from(result.adjustments.values())
    .filter(a => a.adjustmentConfidence >= minConfidence);
}

// Export all L3 modules
export * from './opponent-predictor';
export * from './bp-simulator';
export * from './game-optimizer';
