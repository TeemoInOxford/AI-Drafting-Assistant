/**
 * v4-1 L2 Recommendation Classifier
 *
 * Classifies recommendations into tiers: MustPick, Strong, Stable, Situational, Avoid.
 * Considers both score and confidence.
 */

import { RecommendationTier, L2Config, DEFAULT_L2_CONFIG } from '../types/l2-types';
import { AggregatedScore } from './score-aggregator';
import { L1ChampionEvaluation } from '../types/l1-types';

/**
 * Classification result
 */
export interface ClassificationResult {
  tier: RecommendationTier;
  reason: string;
  urgency: number;          // 0-1: How urgent is this pick
  risk: number;             // 0-1: How risky is this pick
}

/**
 * Classify recommendation into tier
 */
export function classifyRecommendation(
  aggregatedScore: AggregatedScore,
  l1Evaluation: L1ChampionEvaluation,
  config: L2Config = DEFAULT_L2_CONFIG
): ClassificationResult {
  const score = aggregatedScore.finalScore;
  const confidence = aggregatedScore.confidence;

  // Extract key metrics
  const ptsScore = aggregatedScore.breakdown.pts.score;
  const ptsConfidence = aggregatedScore.breakdown.pts.confidence;
  const counterScore = aggregatedScore.breakdown.counter.score;

  // Calculate urgency (based on PTS)
  const urgency = calculateUrgency(ptsScore, ptsConfidence, l1Evaluation);

  // Calculate risk (based on counter and confidence)
  const risk = calculateRisk(counterScore, confidence, aggregatedScore);

  // Classify into tier
  let tier: RecommendationTier;
  let reason: string;

  // MustPick: High score + High urgency OR Very high score
  if (
    (score >= config.tierThresholds.mustPick && urgency >= 0.7) ||
    score >= 0.90
  ) {
    tier = 'MustPick';
    reason = urgency >= 0.7
      ? 'Critical priority with high urgency'
      : 'Exceptional overall value';
  }
  // Strong: High score + Good confidence
  else if (
    score >= config.tierThresholds.strong &&
    confidence >= config.confidenceThresholds.medium
  ) {
    tier = 'Strong';
    reason = 'Highly recommended with good confidence';
  }
  // Stable: Good score + Low risk
  else if (
    score >= config.tierThresholds.stable &&
    risk <= 0.4
  ) {
    tier = 'Stable';
    reason = 'Solid choice with low risk';
  }
  // Situational: Moderate score OR High risk
  else if (
    score >= config.tierThresholds.situational ||
    (score >= 0.40 && confidence >= config.confidenceThresholds.low)
  ) {
    tier = 'Situational';
    reason = risk > 0.6
      ? 'Context-dependent, higher risk'
      : 'Moderate value, situation-dependent';
  }
  // Avoid: Low score or very high risk
  else {
    tier = 'Avoid';
    reason = score < 0.30
      ? 'Low overall value'
      : 'High risk, not recommended';
  }

  return {
    tier,
    reason,
    urgency,
    risk,
  };
}

/**
 * Calculate urgency score
 * Based on PTS threat level and phase
 */
function calculateUrgency(
  ptsScore: number,
  ptsConfidence: number,
  l1Evaluation: L1ChampionEvaluation
): number {
  // Base urgency from PTS
  let urgency = ptsScore;

  // Boost urgency if threat level is critical/high
  const threatLevel = l1Evaluation.pts.threatLevel;
  if (threatLevel === 'critical') {
    urgency = Math.min(1.0, urgency * 1.3);
  } else if (threatLevel === 'high') {
    urgency = Math.min(1.0, urgency * 1.15);
  }

  // Reduce urgency if confidence is low
  if (ptsConfidence < 0.5) {
    urgency *= 0.8;
  }

  return Math.max(0, Math.min(1, urgency));
}

/**
 * Calculate risk score
 * Based on counter matchups and confidence
 */
function calculateRisk(
  counterScore: number,
  confidence: number,
  aggregatedScore: AggregatedScore
): number {
  // Base risk from counter score (inverted - high counter = high risk)
  let risk = 1 - counterScore;

  // Increase risk if confidence is low
  if (confidence < 0.5) {
    risk = Math.min(1.0, risk * 1.2);
  }

  // Increase risk if there are hard counters
  const l1Counter = aggregatedScore.breakdown.counter;
  if (l1Counter.score < 0.3) {
    risk = Math.min(1.0, risk * 1.3);
  }

  return Math.max(0, Math.min(1, risk));
}

/**
 * Classify multiple recommendations
 */
export function classifyRecommendations(
  aggregatedScores: AggregatedScore[],
  l1Evaluations: Map<string, L1ChampionEvaluation>,
  config: L2Config = DEFAULT_L2_CONFIG
): Map<string, ClassificationResult> {
  const classifications = new Map<string, ClassificationResult>();

  for (const score of aggregatedScores) {
    const l1Eval = l1Evaluations.get(score.championId);
    if (!l1Eval) continue;

    const classification = classifyRecommendation(score, l1Eval, config);
    classifications.set(score.championId, classification);
  }

  return classifications;
}

/**
 * Get tier distribution
 */
export function getTierDistribution(
  classifications: Map<string, ClassificationResult>
): Record<RecommendationTier, number> {
  const distribution: Record<RecommendationTier, number> = {
    MustPick: 0,
    Strong: 0,
    Stable: 0,
    Situational: 0,
    Avoid: 0,
  };

  for (const classification of classifications.values()) {
    distribution[classification.tier]++;
  }

  return distribution;
}

/**
 * Filter recommendations by tier
 */
export function filterByTier(
  aggregatedScores: AggregatedScore[],
  classifications: Map<string, ClassificationResult>,
  tiers: RecommendationTier[]
): AggregatedScore[] {
  return aggregatedScores.filter(score => {
    const classification = classifications.get(score.championId);
    return classification && tiers.includes(classification.tier);
  });
}

/**
 * Get top recommendations by tier
 */
export function getTopByTier(
  aggregatedScores: AggregatedScore[],
  classifications: Map<string, ClassificationResult>,
  tier: RecommendationTier,
  topN: number = 5
): AggregatedScore[] {
  return aggregatedScores
    .filter(score => {
      const classification = classifications.get(score.championId);
      return classification && classification.tier === tier;
    })
    .slice(0, topN);
}

/**
 * Adjust tier based on context
 * Can upgrade/downgrade tier based on specific conditions
 */
export function adjustTierForContext(
  tier: RecommendationTier,
  aggregatedScore: AggregatedScore,
  l1Evaluation: L1ChampionEvaluation,
  context: {
    isLastPick?: boolean;
    roleUrgent?: boolean;
    behindInDraft?: boolean;
  }
): RecommendationTier {
  let adjustedTier = tier;

  // Upgrade if last pick and role is urgent
  if (context.isLastPick && context.roleUrgent) {
    if (tier === 'Strong') adjustedTier = 'MustPick';
    if (tier === 'Stable') adjustedTier = 'Strong';
  }

  // Upgrade if behind in draft and high deny value
  if (context.behindInDraft && l1Evaluation.deny.denyValue >= 0.7) {
    if (tier === 'Strong') adjustedTier = 'MustPick';
  }

  // Downgrade if very low confidence
  if (aggregatedScore.confidence < 0.3) {
    if (tier === 'MustPick') adjustedTier = 'Strong';
    if (tier === 'Strong') adjustedTier = 'Stable';
  }

  return adjustedTier;
}

/**
 * Get tier color for UI
 */
export function getTierColor(tier: RecommendationTier): string {
  switch (tier) {
    case 'MustPick':
      return '#ff4444'; // Red
    case 'Strong':
      return '#ff9944'; // Orange
    case 'Stable':
      return '#44ff44'; // Green
    case 'Situational':
      return '#ffff44'; // Yellow
    case 'Avoid':
      return '#888888'; // Gray
  }
}

/**
 * Get tier priority (for sorting)
 */
export function getTierPriority(tier: RecommendationTier): number {
  switch (tier) {
    case 'MustPick':
      return 5;
    case 'Strong':
      return 4;
    case 'Stable':
      return 3;
    case 'Situational':
      return 2;
    case 'Avoid':
      return 1;
  }
}
