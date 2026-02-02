/**
 * v4-1 L2 Uncertainty Reporter
 *
 * Detects and reports uncertainty in recommendations.
 * Provides transparent warnings about data quality and conflicting signals.
 */

import { UncertaintyWarning, L2Config, DEFAULT_L2_CONFIG } from '../types/l2-types';
import { AggregatedScore, calculateScoreVariance, hasConflictingSignals } from './score-aggregator';
import { L1ChampionEvaluation } from '../types/l1-types';

/**
 * Detect all uncertainties for a recommendation
 */
export function detectUncertainties(
  aggregatedScore: AggregatedScore,
  l1Evaluation: L1ChampionEvaluation,
  config: L2Config = DEFAULT_L2_CONFIG
): UncertaintyWarning[] {
  const warnings: UncertaintyWarning[] = [];

  // 1. Low confidence warning
  const lowConfWarning = detectLowConfidence(aggregatedScore, config);
  if (lowConfWarning) warnings.push(lowConfWarning);

  // 2. Insufficient data warning
  const insufficientDataWarning = detectInsufficientData(l1Evaluation, config);
  if (insufficientDataWarning) warnings.push(insufficientDataWarning);

  // 3. High variance warning
  const highVarianceWarning = detectHighVariance(aggregatedScore, config);
  if (highVarianceWarning) warnings.push(highVarianceWarning);

  // 4. Conflicting signals warning
  const conflictingSignalsWarning = detectConflictingSignals(aggregatedScore, config);
  if (conflictingSignalsWarning) warnings.push(conflictingSignalsWarning);

  // Sort by severity
  warnings.sort((a, b) => {
    const severityOrder = { high: 3, medium: 2, low: 1 };
    return severityOrder[b.severity] - severityOrder[a.severity];
  });

  return warnings;
}

/**
 * Detect low confidence
 */
function detectLowConfidence(
  aggregatedScore: AggregatedScore,
  config: L2Config
): UncertaintyWarning | null {
  const confidence = aggregatedScore.confidence;

  if (confidence < config.uncertaintyThresholds.lowConfidence) {
    const severity = confidence < 0.25 ? 'high' : confidence < 0.35 ? 'medium' : 'low';

    // Identify which aspects have low confidence
    const affectedAspects: string[] = [];
    if (aggregatedScore.breakdown.pts.confidence < 0.5) affectedAspects.push('PTS');
    if (aggregatedScore.breakdown.synergy.confidence < 0.5) affectedAspects.push('Synergy');
    if (aggregatedScore.breakdown.counter.confidence < 0.5) affectedAspects.push('Counter');
    if (aggregatedScore.breakdown.deny.confidence < 0.5) affectedAspects.push('Deny');

    return {
      type: 'low_confidence',
      severity,
      message: `Low confidence (${(confidence * 100).toFixed(0)}%) in evaluation. Limited historical data available.`,
      affectedAspects,
    };
  }

  return null;
}

/**
 * Detect insufficient data
 */
function detectInsufficientData(
  l1Evaluation: L1ChampionEvaluation,
  config: L2Config
): UncertaintyWarning | null {
  const affectedAspects: string[] = [];

  // Check each component for insufficient data
  if (l1Evaluation.pts.confidence < 0.3) {
    affectedAspects.push('PTS (meta data)');
  }

  if (l1Evaluation.synergy.confidence < 0.3) {
    affectedAspects.push('Synergy');
  }

  if (l1Evaluation.counter.confidence < 0.3) {
    affectedAspects.push('Counter matchups');
  }

  if (l1Evaluation.deny.confidence < 0.3) {
    affectedAspects.push('Deny value');
  }

  if (affectedAspects.length === 0) return null;

  const severity = affectedAspects.length >= 3 ? 'high' : affectedAspects.length >= 2 ? 'medium' : 'low';

  return {
    type: 'insufficient_data',
    severity,
    message: `Insufficient historical data for reliable evaluation. ${affectedAspects.length} aspect${affectedAspects.length > 1 ? 's' : ''} affected.`,
    affectedAspects,
  };
}

/**
 * Detect high variance
 */
function detectHighVariance(
  aggregatedScore: AggregatedScore,
  config: L2Config
): UncertaintyWarning | null {
  const variance = calculateScoreVariance(aggregatedScore.breakdown);

  if (variance > config.uncertaintyThresholds.highVariance) {
    const severity = variance > 0.4 ? 'high' : variance > 0.35 ? 'medium' : 'low';

    // Identify which scores vary most
    const scores = [
      { name: 'PTS', score: aggregatedScore.breakdown.pts.score },
      { name: 'Synergy', score: aggregatedScore.breakdown.synergy.score },
      { name: 'Counter', score: aggregatedScore.breakdown.counter.score },
      { name: 'Deny', score: aggregatedScore.breakdown.deny.score },
    ];

    const mean = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
    const affectedAspects = scores
      .filter(s => Math.abs(s.score - mean) > 0.25)
      .map(s => s.name);

    return {
      type: 'high_variance',
      severity,
      message: `High variance in evaluation scores. Different aspects suggest different priorities.`,
      affectedAspects,
    };
  }

  return null;
}

/**
 * Detect conflicting signals
 */
function detectConflictingSignals(
  aggregatedScore: AggregatedScore,
  config: L2Config
): UncertaintyWarning | null {
  if (hasConflictingSignals(aggregatedScore.breakdown, config.uncertaintyThresholds.conflictingSignals)) {
    const scores = [
      { name: 'PTS', score: aggregatedScore.breakdown.pts.score },
      { name: 'Synergy', score: aggregatedScore.breakdown.synergy.score },
      { name: 'Counter', score: aggregatedScore.breakdown.counter.score },
      { name: 'Deny', score: aggregatedScore.breakdown.deny.score },
    ];

    // Find highest and lowest
    const sorted = [...scores].sort((a, b) => b.score - a.score);
    const highest = sorted[0];
    const lowest = sorted[sorted.length - 1];

    const range = highest.score - lowest.score;
    const severity = range > 0.6 ? 'high' : range > 0.5 ? 'medium' : 'low';

    return {
      type: 'conflicting_signals',
      severity,
      message: `Conflicting signals: ${highest.name} is high (${(highest.score * 100).toFixed(0)}%) but ${lowest.name} is low (${(lowest.score * 100).toFixed(0)}%).`,
      affectedAspects: [highest.name, lowest.name],
    };
  }

  return null;
}

/**
 * Generate uncertainty summary
 */
export function generateUncertaintySummary(
  warnings: UncertaintyWarning[]
): string {
  if (warnings.length === 0) {
    return 'High confidence recommendation';
  }

  const highSeverity = warnings.filter(w => w.severity === 'high');
  const mediumSeverity = warnings.filter(w => w.severity === 'medium');

  if (highSeverity.length > 0) {
    return `⚠️ High uncertainty: ${highSeverity[0].message}`;
  } else if (mediumSeverity.length > 0) {
    return `⚠️ Moderate uncertainty: ${mediumSeverity[0].message}`;
  } else {
    return `ℹ️ Minor uncertainty: ${warnings[0].message}`;
  }
}

/**
 * Check if recommendation should be flagged
 */
export function shouldFlagRecommendation(
  warnings: UncertaintyWarning[]
): boolean {
  return warnings.some(w => w.severity === 'high');
}

/**
 * Get uncertainty level (0-1)
 */
export function getUncertaintyLevel(
  warnings: UncertaintyWarning[]
): number {
  if (warnings.length === 0) return 0;

  const severityScores = {
    high: 1.0,
    medium: 0.6,
    low: 0.3,
  };

  const maxSeverity = Math.max(...warnings.map(w => severityScores[w.severity]));
  return maxSeverity;
}

/**
 * Format uncertainty warning for display
 */
export function formatUncertaintyWarning(warning: UncertaintyWarning): string {
  const icon = warning.severity === 'high' ? '⚠️' : warning.severity === 'medium' ? '⚠️' : 'ℹ️';
  const affected = warning.affectedAspects.length > 0
    ? ` (${warning.affectedAspects.join(', ')})`
    : '';

  return `${icon} ${warning.message}${affected}`;
}

/**
 * Get recommendations for handling uncertainty
 */
export function getUncertaintyRecommendations(
  warnings: UncertaintyWarning[]
): string[] {
  const recommendations: string[] = [];

  for (const warning of warnings) {
    switch (warning.type) {
      case 'low_confidence':
        recommendations.push('Consider picks with higher confidence scores');
        recommendations.push('Verify with additional context or expert judgment');
        break;

      case 'insufficient_data':
        recommendations.push('Limited historical data - use caution');
        recommendations.push('Consider more established picks if risk-averse');
        break;

      case 'high_variance':
        recommendations.push('Evaluate which aspect matters most in current context');
        recommendations.push('Consider situational factors carefully');
        break;

      case 'conflicting_signals':
        recommendations.push('Weigh trade-offs between conflicting aspects');
        recommendations.push('Consider team strategy and priorities');
        break;
    }
  }

  // Remove duplicates
  return [...new Set(recommendations)];
}

/**
 * Calculate overall uncertainty score
 */
export function calculateOverallUncertainty(
  aggregatedScore: AggregatedScore,
  l1Evaluation: L1ChampionEvaluation,
  config: L2Config = DEFAULT_L2_CONFIG
): number {
  const warnings = detectUncertainties(aggregatedScore, l1Evaluation, config);

  // Base uncertainty from confidence
  let uncertainty = 1 - aggregatedScore.confidence;

  // Add penalty for each warning
  for (const warning of warnings) {
    const penalty = warning.severity === 'high' ? 0.2 : warning.severity === 'medium' ? 0.1 : 0.05;
    uncertainty += penalty;
  }

  return Math.min(1, uncertainty);
}
