/**
 * v4-1 L1 Evaluation Layer Public API
 *
 * Unified interface for L1 phase-aware evaluation.
 * Combines PTS, composition, synergy, counter, and deny evaluations.
 */

import { Champion, Team } from '../../types';
import { DraftState } from '../types/common-types';
import { L0DataCache } from '../types/l0-types';
import {
  L1ChampionEvaluation,
  L1EvaluationResult,
  L1Config,
  DEFAULT_L1_CONFIG,
} from '../types/l1-types';
import { weightedConfidence } from '../types/common-types';

import { calculatePhasePTS } from './pts-evaluator';
import { evaluateComposition } from './composition-evaluator';
import { evaluateChampionSynergy } from './synergy-evaluator';
import { evaluateCounterMatchups } from './counter-evaluator';
import { evaluateDenyValue } from './deny-evaluator';

/**
 * Perform complete L1 evaluation for all available champions
 */
export async function evaluateChampions(
  draftState: DraftState,
  availableChampions: Champion[],
  l0Data: L0DataCache,
  opponentPlayerIds?: string[],
  config: L1Config = DEFAULT_L1_CONFIG
): Promise<L1EvaluationResult> {
  const championEvaluations: L1ChampionEvaluation[] = [];

  // Evaluate each champion
  for (const champion of availableChampions) {
    const evaluation = evaluateChampion(
      champion,
      draftState,
      l0Data,
      opponentPlayerIds,
      config
    );
    championEvaluations.push(evaluation);
  }

  // Sort by overall score descending
  championEvaluations.sort((a, b) => b.overallScore - a.overallScore);

  // Evaluate team compositions
  const teamComposition = evaluateComposition(
    draftState.side,
    draftState,
    availableChampions,
    l0Data
  );

  const opponentSide = draftState.side === 'blue' ? 'red' : 'blue';
  const opponentComposition = evaluateComposition(
    opponentSide,
    draftState,
    availableChampions,
    l0Data
  );

  return {
    draftPhase: draftState.phaseContext,
    evaluatingSide: draftState.side,
    championEvaluations,
    teamComposition,
    opponentComposition,
    timestamp: new Date(),
  };
}

/**
 * Evaluate a single champion
 */
export function evaluateChampion(
  champion: Champion,
  draftState: DraftState,
  l0Data: L0DataCache,
  opponentPlayerIds?: string[],
  config: L1Config = DEFAULT_L1_CONFIG
): L1ChampionEvaluation {
  // Calculate all evaluation components
  const pts = calculatePhasePTS(champion, draftState, l0Data, config);
  const synergy = evaluateChampionSynergy(champion, draftState.side, draftState, l0Data);
  const counter = evaluateCounterMatchups(champion, draftState.side, draftState, l0Data);
  const deny = evaluateDenyValue(champion, draftState.side, draftState, l0Data, opponentPlayerIds);

  // Calculate overall score (weighted combination)
  const weights = config.evaluationWeights;
  const overallScore =
    (pts.totalPTS / 100) * weights.pts +
    synergy.overallSynergy * weights.synergy +
    (1 - counter.overallCounterScore) * weights.counter + // Lower counter score is better
    deny.denyValue * weights.deny;

  // Calculate overall confidence
  const confidence = weightedConfidence(
    [pts.confidence, synergy.confidence, counter.confidence, deny.confidence],
    [weights.pts, weights.synergy, weights.counter, weights.deny]
  );

  return {
    championId: champion.id,
    pts,
    synergy,
    counter,
    deny,
    overallScore,
    confidence,
  };
}

/**
 * Get top N recommended champions
 */
export function getTopRecommendations(
  draftState: DraftState,
  availableChampions: Champion[],
  l0Data: L0DataCache,
  topN: number = 10,
  opponentPlayerIds?: string[],
  config: L1Config = DEFAULT_L1_CONFIG
): L1ChampionEvaluation[] {
  const evaluations: L1ChampionEvaluation[] = [];

  for (const champion of availableChampions) {
    const evaluation = evaluateChampion(
      champion,
      draftState,
      l0Data,
      opponentPlayerIds,
      config
    );
    evaluations.push(evaluation);
  }

  // Sort by overall score and return top N
  return evaluations
    .sort((a, b) => b.overallScore - a.overallScore)
    .slice(0, topN);
}

/**
 * Get champions filtered by minimum confidence
 */
export function getHighConfidenceRecommendations(
  draftState: DraftState,
  availableChampions: Champion[],
  l0Data: L0DataCache,
  minConfidence: number = 0.5,
  topN: number = 10,
  opponentPlayerIds?: string[],
  config: L1Config = DEFAULT_L1_CONFIG
): L1ChampionEvaluation[] {
  const evaluations: L1ChampionEvaluation[] = [];

  for (const champion of availableChampions) {
    const evaluation = evaluateChampion(
      champion,
      draftState,
      l0Data,
      opponentPlayerIds,
      config
    );

    if (evaluation.confidence >= minConfidence) {
      evaluations.push(evaluation);
    }
  }

  return evaluations
    .sort((a, b) => b.overallScore - a.overallScore)
    .slice(0, topN);
}

/**
 * Get champions by specific criteria
 */
export function getChampionsByCriteria(
  draftState: DraftState,
  availableChampions: Champion[],
  l0Data: L0DataCache,
  criteria: {
    minPTS?: number;
    minSynergy?: number;
    maxCounterScore?: number;
    minDenyValue?: number;
    minConfidence?: number;
  },
  opponentPlayerIds?: string[],
  config: L1Config = DEFAULT_L1_CONFIG
): L1ChampionEvaluation[] {
  const evaluations: L1ChampionEvaluation[] = [];

  for (const champion of availableChampions) {
    const evaluation = evaluateChampion(
      champion,
      draftState,
      l0Data,
      opponentPlayerIds,
      config
    );

    // Apply filters
    if (criteria.minPTS !== undefined && evaluation.pts.totalPTS < criteria.minPTS) {
      continue;
    }
    if (criteria.minSynergy !== undefined && evaluation.synergy.overallSynergy < criteria.minSynergy) {
      continue;
    }
    if (criteria.maxCounterScore !== undefined && evaluation.counter.overallCounterScore > criteria.maxCounterScore) {
      continue;
    }
    if (criteria.minDenyValue !== undefined && evaluation.deny.denyValue < criteria.minDenyValue) {
      continue;
    }
    if (criteria.minConfidence !== undefined && evaluation.confidence < criteria.minConfidence) {
      continue;
    }

    evaluations.push(evaluation);
  }

  return evaluations.sort((a, b) => b.overallScore - a.overallScore);
}

// Export all L1 modules
export * from './pts-evaluator';
export * from './composition-evaluator';
export * from './synergy-evaluator';
export * from './counter-evaluator';
export * from './deny-evaluator';
