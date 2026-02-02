/**
 * v4-1 L2 Recommendation Layer Public API
 *
 * Unified interface for generating final recommendations.
 * Combines L1 evaluations with L3 adjustments to produce human-readable recommendations.
 */

import { Champion } from '../../types';
import { L1ChampionEvaluation } from '../types/l1-types';
import {
  Recommendation,
  RecommendationResult,
  L2Config,
  DEFAULT_L2_CONFIG,
  L3Adjustments,
} from '../types/l2-types';

import { aggregateScores, aggregateScoresForAll, AggregatedScore } from './score-aggregator';
import { classifyRecommendation, classifyRecommendations } from './recommendation-classifier';
import {
  generateWhyPickReasons,
  generateWhyNotReasons,
  generateWhatIfScenario,
  generateSummaryExplanation,
} from './reason-generator';
import { detectUncertainties } from './uncertainty-reporter';

import { DraftState } from '../types/common-types';

/**
 * Generate final recommendations
 */
export async function generateRecommendations(
  l1Evaluations: L1ChampionEvaluation[],
  champions: Champion[],
  l3AdjustmentsMap: Map<string, L3Adjustments> = new Map(),
  config: L2Config = DEFAULT_L2_CONFIG,
  draftState?: DraftState,
  useAI: boolean = false
): Promise<RecommendationResult> {
  // Create champion lookup
  const championMap = new Map(champions.map(c => [c.id, c]));

  // Create L1 evaluation lookup
  const l1EvalMap = new Map(l1Evaluations.map(e => [e.championId, e]));

  // Aggregate scores
  const aggregatedScores = aggregateScoresForAll(l1Evaluations, l3AdjustmentsMap, config);

  // Classify recommendations
  const classifications = classifyRecommendations(aggregatedScores, l1EvalMap, config);

  // Generate recommendations
  const recommendations: Recommendation[] = [];

  for (let i = 0; i < aggregatedScores.length; i++) {
    const aggScore = aggregatedScores[i];
    const champion = championMap.get(aggScore.championId);
    const l1Eval = l1EvalMap.get(aggScore.championId);
    const classification = classifications.get(aggScore.championId);
    const l3Adj = l3AdjustmentsMap.get(aggScore.championId) || null;

    if (!champion || !l1Eval || !classification) continue;

    // Generate reasons (async for AI support)
    const whyPick = await generateWhyPickReasons(
      champion,
      aggScore,
      l1Eval,
      classification,
      l3Adj,
      config,
      draftState,
      useAI
    );

    const whyNot = generateWhyNotReasons(
      champion,
      aggScore,
      l1Eval,
      classification,
      config
    );

    const whatIf = generateWhatIfScenario(
      champion,
      aggScore,
      l1Eval,
      classification,
      l3Adj
    );

    // Detect uncertainties
    const uncertainties = detectUncertainties(aggScore, l1Eval, config);

    recommendations.push({
      champion,
      championId: champion.id,
      finalScore: aggScore.finalScore,
      l1Score: aggScore.l1Score,
      l3Adjustment: aggScore.l3Adjustment,
      confidence: aggScore.confidence,
      tier: classification.tier,
      rank: i + 1,
      whyPick,
      whyNot,
      whatIf,
      uncertainties,
      breakdown: aggScore.breakdown,
      timestamp: new Date(),
    });
  }

  // Calculate summary statistics
  const summary = calculateSummary(recommendations, classifications);

  // Generate team analysis
  const teamAnalysis = generateTeamAnalysis(l1Evaluations, recommendations);

  return {
    recommendations,
    summary,
    teamAnalysis,
    evaluationPhase: l1Evaluations[0]?.pts.breakdown.roleVacancy.score ? 'active' : 'unknown',
    evaluatingSide: 'blue', // TODO: Get from context
    timestamp: new Date(),
  };
}

/**
 * Calculate summary statistics
 */
function calculateSummary(
  recommendations: Recommendation[],
  classifications: Map<string, any>
): RecommendationResult['summary'] {
  const tierCounts = {
    mustPick: 0,
    strong: 0,
    stable: 0,
    situational: 0,
    avoid: 0,
  };

  let totalConfidence = 0;
  let highUncertaintyCount = 0;

  for (const rec of recommendations) {
    // Count tiers
    switch (rec.tier) {
      case 'MustPick':
        tierCounts.mustPick++;
        break;
      case 'Strong':
        tierCounts.strong++;
        break;
      case 'Stable':
        tierCounts.stable++;
        break;
      case 'Situational':
        tierCounts.situational++;
        break;
      case 'Avoid':
        tierCounts.avoid++;
        break;
    }

    totalConfidence += rec.confidence;

    // Count high uncertainty
    if (rec.uncertainties.some(u => u.severity === 'high')) {
      highUncertaintyCount++;
    }
  }

  return {
    totalEvaluated: recommendations.length,
    mustPickCount: tierCounts.mustPick,
    strongCount: tierCounts.strong,
    stableCount: tierCounts.stable,
    situationalCount: tierCounts.situational,
    avoidCount: tierCounts.avoid,
    avgConfidence: recommendations.length > 0 ? totalConfidence / recommendations.length : 0,
    highUncertaintyCount,
  };
}

/**
 * Generate team analysis
 */
function generateTeamAnalysis(
  l1Evaluations: L1ChampionEvaluation[],
  recommendations: Recommendation[]
): RecommendationResult['teamAnalysis'] {
  // Calculate current team strength (placeholder)
  const avgScore = recommendations.length > 0
    ? recommendations.reduce((sum, r) => sum + r.finalScore, 0) / recommendations.length
    : 0.5;

  // Identify composition gaps
  const compositionGaps: string[] = [];

  // Check role vacancy from first evaluation
  if (l1Evaluations.length > 0) {
    const firstEval = l1Evaluations[0];
    if (firstEval.pts.breakdown.roleVacancy.score > 0.7) {
      compositionGaps.push('Critical role needs to be filled');
    }
  }

  // Check synergy
  const avgSynergy = l1Evaluations.length > 0
    ? l1Evaluations.reduce((sum, e) => sum + e.synergy.overallSynergy, 0) / l1Evaluations.length
    : 0.5;

  if (avgSynergy < 0.4) {
    compositionGaps.push('Limited synergy options available');
  }

  // Strategic position
  let strategicPosition = 'Neutral position';
  if (avgScore >= 0.7) {
    strategicPosition = 'Strong position with good options';
  } else if (avgScore >= 0.5) {
    strategicPosition = 'Moderate position';
  } else {
    strategicPosition = 'Challenging position, limited options';
  }

  return {
    currentStrength: avgScore,
    compositionGaps,
    strategicPosition,
  };
}

/**
 * Get top N recommendations
 */
export function getTopRecommendations(
  result: RecommendationResult,
  topN: number = 10
): Recommendation[] {
  return result.recommendations.slice(0, topN);
}

/**
 * Get recommendations by tier
 */
export function getRecommendationsByTier(
  result: RecommendationResult,
  tier: Recommendation['tier']
): Recommendation[] {
  return result.recommendations.filter(r => r.tier === tier);
}

/**
 * Get high confidence recommendations
 */
export function getHighConfidenceRecommendations(
  result: RecommendationResult,
  minConfidence: number = 0.7
): Recommendation[] {
  return result.recommendations.filter(r => r.confidence >= minConfidence);
}

/**
 * Get safe recommendations (low risk)
 */
export function getSafeRecommendations(
  result: RecommendationResult,
  maxUncertainty: number = 0.3
): Recommendation[] {
  return result.recommendations.filter(r => {
    const hasHighUncertainty = r.uncertainties.some(u => u.severity === 'high');
    return !hasHighUncertainty && r.confidence >= 0.6;
  });
}

/**
 * Filter recommendations by criteria
 */
export function filterRecommendations(
  result: RecommendationResult,
  criteria: {
    minScore?: number;
    minConfidence?: number;
    tiers?: Recommendation['tier'][];
    maxUncertainty?: number;
  }
): Recommendation[] {
  return result.recommendations.filter(r => {
    if (criteria.minScore !== undefined && r.finalScore < criteria.minScore) {
      return false;
    }

    if (criteria.minConfidence !== undefined && r.confidence < criteria.minConfidence) {
      return false;
    }

    if (criteria.tiers && !criteria.tiers.includes(r.tier)) {
      return false;
    }

    if (criteria.maxUncertainty !== undefined) {
      const hasHighUncertainty = r.uncertainties.some(u => u.severity === 'high');
      if (hasHighUncertainty) return false;
    }

    return true;
  });
}

// Export all L2 modules
export * from './score-aggregator';
export * from './recommendation-classifier';
export * from './reason-generator';
export * from './uncertainty-reporter';
