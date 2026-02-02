/**
 * v4-1 L2 Score Aggregator
 *
 * Aggregates L1 evaluation scores with L3 strategic adjustments.
 * Applies confidence gating to prevent low-confidence L3 from affecting results.
 */

import { L1ChampionEvaluation } from '../types/l1-types';
import { L3Adjustments, L2Config, DEFAULT_L2_CONFIG } from '../types/l2-types';
import { ScoredValue } from '../types/common-types';

/**
 * Aggregated score result
 */
export interface AggregatedScore {
  championId: string;
  finalScore: number;           // 0-1: Final score after L3 adjustment
  l1Score: number;              // 0-1: Original L1 score
  l3Adjustment: number;         // -0.2 to +0.2: L3 adjustment applied
  confidence: number;           // 0-1: Overall confidence
  breakdown: {
    pts: ScoredValue;
    synergy: ScoredValue;
    counter: ScoredValue;
    deny: ScoredValue;
    l3Strategic: ScoredValue;
  };
}

/**
 * Aggregate L1 and L3 scores
 *
 * NOTE: l1Evaluation.overallScore already incorporates L1 evaluation weights
 * (pts, synergy, counter, deny) as configured in L1Config.evaluationWeights.
 * This function applies L3 strategic adjustments on top of the L1 score.
 */
export function aggregateScores(
  l1Evaluation: L1ChampionEvaluation,
  l3Adjustments: L3Adjustments | null,
  config: L2Config = DEFAULT_L2_CONFIG
): AggregatedScore {
  // L1 score is already weighted by L1Config.evaluationWeights
  const l1Score = l1Evaluation.overallScore;
  const l1Confidence = l1Evaluation.confidence;

  // Apply L3 adjustments with confidence gating
  let l3Adjustment = 0;
  let l3Confidence = 0;
  let l3Applied = false;

  if (config.enableL3 && l3Adjustments) {
    // Check if L3 confidence meets minimum threshold
    if (l3Adjustments.adjustmentConfidence >= config.minL3Confidence) {
      // Calculate total L3 adjustment
      const rawAdjustment =
        l3Adjustments.opponentPredictionAdjustment +
        l3Adjustments.simulationAdjustment +
        l3Adjustments.strategicValueAdjustment;

      // Bound adjustment to max allowed
      l3Adjustment = Math.max(
        -config.maxL3Adjustment,
        Math.min(config.maxL3Adjustment, rawAdjustment)
      );

      l3Confidence = l3Adjustments.adjustmentConfidence;
      l3Applied = true;
    }
  }

  // Calculate final score
  const finalScore = Math.max(
    0,
    Math.min(1, l1Score + l3Adjustment * config.l3Weight)
  );

  // Calculate overall confidence
  // If L3 is applied, combine L1 and L3 confidence
  // Otherwise, use only L1 confidence
  const confidence = l3Applied
    ? l1Confidence * config.l1Weight + l3Confidence * config.l3Weight
    : l1Confidence;

  // Build breakdown
  const breakdown = {
    pts: {
      score: l1Evaluation.pts.totalPTS / 100,
      confidence: l1Evaluation.pts.confidence,
    },
    synergy: {
      score: l1Evaluation.synergy.overallSynergy,
      confidence: l1Evaluation.synergy.confidence,
    },
    counter: {
      score: 1 - l1Evaluation.counter.overallCounterScore, // Invert (lower counter = better)
      confidence: l1Evaluation.counter.confidence,
    },
    deny: {
      score: l1Evaluation.deny.denyValue,
      confidence: l1Evaluation.deny.confidence,
    },
    l3Strategic: {
      score: l3Applied ? l3Adjustment : 0,
      confidence: l3Confidence,
    },
  };

  return {
    championId: l1Evaluation.championId,
    finalScore,
    l1Score,
    l3Adjustment: l3Applied ? l3Adjustment : 0,
    confidence,
    breakdown,
  };
}

/**
 * Aggregate scores for multiple champions
 */
export function aggregateScoresForAll(
  l1Evaluations: L1ChampionEvaluation[],
  l3AdjustmentsMap: Map<string, L3Adjustments>,
  config: L2Config = DEFAULT_L2_CONFIG
): AggregatedScore[] {
  const results: AggregatedScore[] = [];

  for (const l1Eval of l1Evaluations) {
    const l3Adj = l3AdjustmentsMap.get(l1Eval.championId) || null;
    const aggregated = aggregateScores(l1Eval, l3Adj, config);
    results.push(aggregated);
  }

  // Sort by final score descending
  return results.sort((a, b) => b.finalScore - a.finalScore);
}

/**
 * Calculate score variance
 * High variance indicates conflicting signals
 */
export function calculateScoreVariance(breakdown: AggregatedScore['breakdown']): number {
  const scores = [
    breakdown.pts.score,
    breakdown.synergy.score,
    breakdown.counter.score,
    breakdown.deny.score,
  ];

  const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;

  return Math.sqrt(variance); // Return standard deviation
}

/**
 * Detect conflicting signals
 * Returns true if some scores are very high and others very low
 */
export function hasConflictingSignals(
  breakdown: AggregatedScore['breakdown'],
  threshold: number = 0.4
): boolean {
  const scores = [
    breakdown.pts.score,
    breakdown.synergy.score,
    breakdown.counter.score,
    breakdown.deny.score,
  ];

  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);

  // Conflicting if range is large
  return maxScore - minScore > threshold;
}

/**
 * Get dominant score component
 * Returns which component contributes most to the final score
 */
export function getDominantComponent(
  breakdown: AggregatedScore['breakdown']
): { component: string; score: number; confidence: number } {
  const components = [
    { name: 'pts', score: breakdown.pts.score, confidence: breakdown.pts.confidence },
    { name: 'synergy', score: breakdown.synergy.score, confidence: breakdown.synergy.confidence },
    { name: 'counter', score: breakdown.counter.score, confidence: breakdown.counter.confidence },
    { name: 'deny', score: breakdown.deny.score, confidence: breakdown.deny.confidence },
  ];

  // Find component with highest score
  const dominant = components.reduce((max, comp) =>
    comp.score > max.score ? comp : max
  );

  return {
    component: dominant.name,
    score: dominant.score,
    confidence: dominant.confidence,
  };
}

/**
 * Calculate confidence-weighted score
 * Penalizes low-confidence components more aggressively
 *
 * IMPROVED: Now uses exponential confidence penalty to better reflect uncertainty
 */
export function calculateConfidenceWeightedScore(
  breakdown: AggregatedScore['breakdown']
): number {
  const components = [
    { score: breakdown.pts.score, confidence: breakdown.pts.confidence, weight: 0.3 },
    { score: breakdown.synergy.score, confidence: breakdown.synergy.confidence, weight: 0.25 },
    { score: breakdown.counter.score, confidence: breakdown.counter.confidence, weight: 0.25 },
    { score: breakdown.deny.score, confidence: breakdown.deny.confidence, weight: 0.2 },
  ];

  let weightedSum = 0;
  let totalWeight = 0;

  for (const comp of components) {
    // Apply exponential confidence penalty
    // Low confidence (< 0.5) gets penalized more heavily
    const confidencePenalty = Math.pow(comp.confidence, 1.5);

    // Weight by both component weight and confidence penalty
    const effectiveWeight = comp.weight * confidencePenalty;
    weightedSum += comp.score * effectiveWeight;
    totalWeight += effectiveWeight;
  }

  // If total weight is very low (all low confidence), return neutral score
  return totalWeight > 0.1 ? weightedSum / totalWeight : 0.5;
}

/**
 * Normalize scores to 0-1 range
 * Useful for displaying scores consistently
 */
export function normalizeScores(scores: AggregatedScore[]): AggregatedScore[] {
  if (scores.length === 0) return scores;

  const minScore = Math.min(...scores.map(s => s.finalScore));
  const maxScore = Math.max(...scores.map(s => s.finalScore));
  const range = maxScore - minScore;

  if (range === 0) return scores;

  return scores.map(score => ({
    ...score,
    finalScore: (score.finalScore - minScore) / range,
  }));
}

/**
 * Validate L2 configuration
 * Ensures weights and thresholds are consistent
 */
export function validateL2Config(config: L2Config): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check L1/L3 weights sum to 1.0
  const weightSum = config.l1Weight + config.l3Weight;
  if (Math.abs(weightSum - 1.0) > 0.01) {
    errors.push(`L1/L3 weights must sum to 1.0, got ${weightSum.toFixed(3)}`);
  }

  // Check weights are positive
  if (config.l1Weight < 0 || config.l3Weight < 0) {
    errors.push('Weights must be non-negative');
  }

  // Check tier thresholds are in descending order
  const { mustPick, strong, stable, situational } = config.tierThresholds;
  if (mustPick <= strong || strong <= stable || stable <= situational) {
    errors.push('Tier thresholds must be in descending order: mustPick > strong > stable > situational');
  }

  // Check thresholds are in valid range
  if (mustPick > 1.0 || situational < 0) {
    errors.push('Tier thresholds must be in range [0, 1]');
  }

  // Check confidence thresholds
  const { high, medium, low } = config.confidenceThresholds;
  if (high <= medium || medium <= low) {
    errors.push('Confidence thresholds must be in descending order: high > medium > low');
  }

  // Check L3 adjustment bounds
  if (config.maxL3Adjustment < 0 || config.maxL3Adjustment > 0.5) {
    errors.push('maxL3Adjustment should be in range [0, 0.5]');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
