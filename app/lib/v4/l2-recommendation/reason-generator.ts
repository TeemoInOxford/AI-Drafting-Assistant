/**
 * v4-1 L2 Reason Generator
 *
 * Generates human-readable explanations for recommendations.
 * Provides whyPick, whyNot, and whatIf reasoning.
 */

import { Champion } from '../../types';
import { L1ChampionEvaluation } from '../types/l1-types';
import {
  RecommendationReason,
  ReasonCategory,
  L2Config,
  DEFAULT_L2_CONFIG,
  L3Adjustments,
} from '../types/l2-types';
import { AggregatedScore } from './score-aggregator';
import { ClassificationResult } from './recommendation-classifier';
import { DraftState } from '../types/common-types';

/**
 * Generate reasons to pick a champion (with optional AI enhancement)
 */
export async function generateWhyPickReasons(
  champion: Champion,
  aggregatedScore: AggregatedScore,
  l1Evaluation: L1ChampionEvaluation,
  classification: ClassificationResult,
  l3Adjustments: L3Adjustments | null,
  config: L2Config = DEFAULT_L2_CONFIG,
  draftState?: DraftState,
  useAI: boolean = false
): Promise<RecommendationReason[]> {
  // Try AI generation if enabled and draftState is provided
  if (useAI && draftState && process.env.AI_PICK_REASON_ENABLED === 'true') {
    try {
      const aiReasons = await generateWhyPickReasonsWithAI(
        champion,
        aggregatedScore,
        l1Evaluation,
        draftState
      );
      if (aiReasons.length > 0) {
        return aiReasons;
      }
    } catch (error) {
      console.error('[Reason Generator] AI generation failed, falling back to rule-based:', error);
    }
  }

  // Fall back to rule-based generation
  return generateWhyPickReasonsRuleBased(
    champion,
    aggregatedScore,
    l1Evaluation,
    classification,
    l3Adjustments,
    config
  );
}

/**
 * Generate reasons using Claude AI
 */
async function generateWhyPickReasonsWithAI(
  champion: Champion,
  aggregatedScore: AggregatedScore,
  l1Evaluation: L1ChampionEvaluation,
  draftState: DraftState
): Promise<RecommendationReason[]> {
  const { generatePickReasonWithClaude, generatePickReasonWithOpenAI, parsePickReasons } = await import('../../ai-pick-reason-prompt');
  const { buildPickReasonInput } = await import('../../ai-pick-recommendation-service-internal');

  const apiKey = process.env.AI_PICK_REASON_API_KEY || process.env.AI_BAN_REASON_API_KEY;
  const model = process.env.AI_PICK_REASON_MODEL || process.env.AI_BAN_REASON_MODEL || 'claude-3-5-sonnet-20241022';
  const provider = process.env.AI_BAN_REASON_PROVIDER || 'anthropic';
  const endpoint = process.env.AI_BAN_REASON_ENDPOINT || 'https://cf.cpass.cc/v1/chat/completions';

  if (!apiKey) {
    throw new Error('API key not configured');
  }

  // Build input data
  const input = buildPickReasonInput(
    draftState,
    champion,
    aggregatedScore,
    l1Evaluation
  );

  // Call API based on provider
  let aiResponse: string;
  if (provider === 'openai' || provider === 'ollama') {
    console.log(`[Reason Generator] Using OpenAI-compatible API: ${endpoint}`);
    aiResponse = await generatePickReasonWithOpenAI(input, apiKey, model, endpoint);
  } else {
    console.log('[Reason Generator] Using Anthropic API');
    aiResponse = await generatePickReasonWithClaude(input, apiKey, model);
  }

  // Parse reasons
  const reasonTexts = parsePickReasons(aiResponse);

  // Convert to RecommendationReason format
  return reasonTexts.map((text, index) => ({
    category: 'meta' as ReasonCategory,
    importance: 1.0 - (index * 0.1),
    confidence: 0.85,
    text,
  }));
}

/**
 * Generate reasons to pick a champion (rule-based)
 */
function generateWhyPickReasonsRuleBased(
  champion: Champion,
  aggregatedScore: AggregatedScore,
  l1Evaluation: L1ChampionEvaluation,
  classification: ClassificationResult,
  l3Adjustments: L3Adjustments | null,
  config: L2Config = DEFAULT_L2_CONFIG
): RecommendationReason[] {
  const reasons: RecommendationReason[] = [];

  // 1. High PTS threat
  if (l1Evaluation.pts.totalPTS >= 60) {
    reasons.push({
      category: 'threat',
      importance: Math.min(1.0, l1Evaluation.pts.totalPTS / 100),
      confidence: l1Evaluation.pts.confidence,
      text: `High threat: ${l1Evaluation.pts.explanation}`,
    });
  }

  // 2. Strong synergy
  if (l1Evaluation.synergy.overallSynergy >= 0.65) {
    reasons.push({
      category: 'synergy',
      importance: l1Evaluation.synergy.overallSynergy,
      confidence: l1Evaluation.synergy.confidence,
      text: `Strong synergy: ${l1Evaluation.synergy.explanation}`,
    });
  }

  // 3. Good counter potential
  if (l1Evaluation.counter.counterPotential >= 0.6) {
    reasons.push({
      category: 'counter',
      importance: l1Evaluation.counter.counterPotential,
      confidence: l1Evaluation.counter.confidence,
      text: `Good counter: ${l1Evaluation.counter.explanation}`,
    });
  }

  // 4. High deny value
  if (l1Evaluation.deny.denyValue >= 0.65) {
    reasons.push({
      category: 'deny',
      importance: l1Evaluation.deny.denyValue,
      confidence: l1Evaluation.deny.confidence,
      text: `High deny value: ${l1Evaluation.deny.explanation}`,
    });
  }

  // 5. Meta priority
  const metaScore = aggregatedScore.breakdown.pts.score;
  if (metaScore >= 0.7) {
    reasons.push({
      category: 'meta',
      importance: metaScore,
      confidence: aggregatedScore.breakdown.pts.confidence,
      text: 'High meta priority champion',
    });
  }

  // 6. Role necessity
  if (l1Evaluation.pts.breakdown.roleVacancy.score >= 0.7) {
    reasons.push({
      category: 'role',
      importance: l1Evaluation.pts.breakdown.roleVacancy.score,
      confidence: l1Evaluation.pts.breakdown.roleVacancy.confidence,
      text: 'Fills critical role need',
    });
  }

  // 7. Flex pick value
  if (champion.positions.length >= 2) {
    const flexScore = Math.min(1.0, champion.positions.length / 3);
    reasons.push({
      category: 'flex',
      importance: flexScore * 0.7,
      confidence: 0.8,
      text: `Flex pick (${champion.positions.join('/')})`,
    });
  }

  // 8. Safe pick (low counter score)
  if (l1Evaluation.counter.overallCounterScore <= 0.3) {
    reasons.push({
      category: 'safe',
      importance: 1 - l1Evaluation.counter.overallCounterScore,
      confidence: l1Evaluation.counter.confidence,
      text: 'Safe pick with few counters',
    });
  }

  // 9. Strategic advantage (from L3)
  if (l3Adjustments && l3Adjustments.adjustmentConfidence >= 0.5) {
    const totalAdj =
      l3Adjustments.opponentPredictionAdjustment +
      l3Adjustments.simulationAdjustment +
      l3Adjustments.strategicValueAdjustment;

    if (totalAdj > 0.05) {
      reasons.push({
        category: 'strategic',
        importance: Math.min(1.0, totalAdj * 5),
        confidence: l3Adjustments.adjustmentConfidence,
        text: 'Strategic advantage in future turns',
      });
    }
  }

  // Sort by importance and filter
  reasons.sort((a, b) => b.importance - a.importance);

  return reasons
    .filter(r => r.importance >= config.minReasonImportance)
    .slice(0, config.maxWhyPickReasons);
}

/**
 * Generate reasons not to pick a champion
 */
export function generateWhyNotReasons(
  champion: Champion,
  aggregatedScore: AggregatedScore,
  l1Evaluation: L1ChampionEvaluation,
  classification: ClassificationResult,
  config: L2Config = DEFAULT_L2_CONFIG
): RecommendationReason[] {
  const reasons: RecommendationReason[] = [];

  // 1. Heavily countered
  if (l1Evaluation.counter.overallCounterScore >= 0.6) {
    const hardCounters = l1Evaluation.counter.counters.filter(c => c.counterType === 'Hard');
    const text = hardCounters.length > 0
      ? `Heavily countered (${hardCounters.length} hard counter${hardCounters.length > 1 ? 's' : ''})`
      : 'Moderately countered by enemy team';

    reasons.push({
      category: 'counter',
      importance: l1Evaluation.counter.overallCounterScore,
      confidence: l1Evaluation.counter.confidence,
      text,
    });
  }

  // 2. Poor synergy
  if (l1Evaluation.synergy.overallSynergy <= 0.4) {
    reasons.push({
      category: 'synergy',
      importance: 1 - l1Evaluation.synergy.overallSynergy,
      confidence: l1Evaluation.synergy.confidence,
      text: 'Limited synergy with team',
    });
  }

  // 3. Low PTS (not urgent)
  if (l1Evaluation.pts.totalPTS <= 30 && classification.urgency <= 0.3) {
    reasons.push({
      category: 'threat',
      importance: 1 - (l1Evaluation.pts.totalPTS / 100),
      confidence: l1Evaluation.pts.confidence,
      text: 'Low urgency, can wait',
    });
  }

  // 4. Doesn't fill role need
  if (l1Evaluation.pts.breakdown.roleVacancy.score <= 0.3) {
    reasons.push({
      category: 'role',
      importance: 1 - l1Evaluation.pts.breakdown.roleVacancy.score,
      confidence: l1Evaluation.pts.breakdown.roleVacancy.confidence,
      text: 'Does not fill critical role',
    });
  }

  // 5. High risk
  if (classification.risk >= 0.7) {
    reasons.push({
      category: 'safe',
      importance: classification.risk,
      confidence: aggregatedScore.confidence,
      text: 'High risk pick',
    });
  }

  // 6. Low confidence
  if (aggregatedScore.confidence <= 0.4) {
    reasons.push({
      category: 'meta',
      importance: 1 - aggregatedScore.confidence,
      confidence: 0.8,
      text: 'Low confidence in evaluation',
    });
  }

  // Sort by importance and filter
  reasons.sort((a, b) => b.importance - a.importance);

  return reasons
    .filter(r => r.importance >= config.minReasonImportance)
    .slice(0, config.maxWhyNotReasons);
}

/**
 * Generate "what if" scenario
 * Describes what happens if we pick this champion
 */
export function generateWhatIfScenario(
  champion: Champion,
  aggregatedScore: AggregatedScore,
  l1Evaluation: L1ChampionEvaluation,
  classification: ClassificationResult,
  l3Adjustments: L3Adjustments | null
): string {
  const parts: string[] = [];

  // Impact on team composition
  if (l1Evaluation.synergy.overallSynergy >= 0.7) {
    parts.push('Strengthens team synergy.');
  } else if (l1Evaluation.synergy.overallSynergy <= 0.4) {
    parts.push('May weaken team synergy.');
  }

  // Impact on opponent
  if (l1Evaluation.deny.denyValue >= 0.7) {
    parts.push('Denies high-value pick from opponent.');
  }

  if (l1Evaluation.pts.totalPTS >= 70) {
    parts.push('Prevents critical threat.');
  }

  // Counter matchups
  const hardCounters = l1Evaluation.counter.counters.filter(c => c.counterType === 'Hard');
  if (hardCounters.length > 0) {
    parts.push(`Faces ${hardCounters.length} hard counter${hardCounters.length > 1 ? 's' : ''}.`);
  } else if (l1Evaluation.counter.counterPotential >= 0.6) {
    parts.push('Provides good counter potential.');
  }

  // Role completion
  if (l1Evaluation.pts.breakdown.roleVacancy.score >= 0.7) {
    parts.push('Completes critical role.');
  }

  // Strategic implications (from L3)
  if (l3Adjustments && l3Adjustments.adjustmentConfidence >= 0.5) {
    if (l3Adjustments.simulationAdjustment > 0.05) {
      parts.push(l3Adjustments.simulationReason);
    }
    if (l3Adjustments.strategicValueAdjustment > 0.05) {
      parts.push(l3Adjustments.strategicReason);
    }
  }

  // Flex implications
  if (champion.positions.length >= 2) {
    parts.push('Maintains draft flexibility.');
  }

  // Default if no specific implications
  if (parts.length === 0) {
    if (aggregatedScore.finalScore >= 0.7) {
      parts.push('Solid pick with good overall value.');
    } else if (aggregatedScore.finalScore >= 0.5) {
      parts.push('Moderate impact on draft.');
    } else {
      parts.push('Limited impact on draft outcome.');
    }
  }

  return parts.join(' ');
}

/**
 * Generate summary explanation
 * One-line summary of the recommendation
 */
export function generateSummaryExplanation(
  champion: Champion,
  aggregatedScore: AggregatedScore,
  classification: ClassificationResult,
  whyPickReasons: RecommendationReason[]
): string {
  const tier = classification.tier;
  const score = aggregatedScore.finalScore;

  // Get top reason
  const topReason = whyPickReasons.length > 0
    ? whyPickReasons[0]
    : null;

  if (tier === 'MustPick') {
    return topReason
      ? `Critical priority: ${topReason.text}`
      : 'Critical priority pick';
  } else if (tier === 'Strong') {
    return topReason
      ? `Highly recommended: ${topReason.text}`
      : 'Highly recommended';
  } else if (tier === 'Stable') {
    return 'Solid choice with low risk';
  } else if (tier === 'Situational') {
    return 'Context-dependent, consider alternatives';
  } else {
    return 'Not recommended';
  }
}

/**
 * Format reason for display
 */
export function formatReason(reason: RecommendationReason): string {
  const confidenceStr = reason.confidence >= 0.7
    ? ''
    : reason.confidence >= 0.5
    ? ' (moderate confidence)'
    : ' (low confidence)';

  return `${reason.text}${confidenceStr}`;
}

/**
 * Get reason icon/emoji for UI
 */
export function getReasonIcon(category: ReasonCategory): string {
  switch (category) {
    case 'threat':
      return '⚠️';
    case 'synergy':
      return '🤝';
    case 'counter':
      return '⚔️';
    case 'deny':
      return '🚫';
    case 'meta':
      return '📊';
    case 'role':
      return '🎯';
    case 'flex':
      return '🔄';
    case 'safe':
      return '🛡️';
    case 'strategic':
      return '♟️';
  }
}
