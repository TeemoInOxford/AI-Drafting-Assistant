/**
 * v4-1 L2 Recommendation Layer Types
 *
 * L2 aggregates L1 and L3 scores to generate final recommendations.
 * Provides human-readable explanations and uncertainty reporting.
 */

import { Champion } from '../../types';
import { ScoredValue } from './common-types';
import { L1ChampionEvaluation } from './l1-types';

// ============ Recommendation Classification ============

/**
 * Recommendation tier
 * - MustPick: Critical priority, high urgency
 * - Strong: Highly recommended
 * - Stable: Solid choice, low risk
 * - Situational: Context-dependent
 * - Avoid: Not recommended
 */
export type RecommendationTier = 'MustPick' | 'Strong' | 'Stable' | 'Situational' | 'Avoid';

/**
 * Recommendation reason category
 */
export type ReasonCategory =
  | 'threat'        // High PTS threat
  | 'synergy'       // Strong team synergy
  | 'counter'       // Good counter matchup
  | 'deny'          // High deny value
  | 'meta'          // Meta priority
  | 'role'          // Role necessity
  | 'flex'          // Flex pick value
  | 'safe'          // Safe, low-risk pick
  | 'strategic';    // Strategic advantage

/**
 * Single recommendation reason
 */
export interface RecommendationReason {
  category: ReasonCategory;
  importance: number;      // 0-1: How important is this reason
  confidence: number;      // 0-1: Confidence in this reason
  text: string;           // Human-readable explanation
}

/**
 * Uncertainty warning
 */
export interface UncertaintyWarning {
  type: 'low_confidence' | 'insufficient_data' | 'high_variance' | 'conflicting_signals';
  severity: 'high' | 'medium' | 'low';
  message: string;
  affectedAspects: string[];  // Which evaluation aspects are uncertain
}

// ============ L3 Strategic Adjustments ============

/**
 * L3 strategic score adjustments
 * L3 provides bounded adjustments, not final rankings
 */
export interface L3Adjustments {
  championId: string;

  // Score adjustments (-0.2 to +0.2)
  opponentPredictionAdjustment: number;  // Based on opponent likely picks
  simulationAdjustment: number;          // Based on 2-3 turn simulation
  strategicValueAdjustment: number;      // Based on game theory optimization

  // Confidence in adjustments
  adjustmentConfidence: number;          // 0-1: Overall confidence

  // Explanations
  opponentPredictionReason: string;
  simulationReason: string;
  strategicReason: string;
}

// ============ Final Recommendation ============

/**
 * Complete recommendation for a champion
 */
export interface Recommendation {
  // Champion info
  champion: Champion;
  championId: string;

  // Scores
  finalScore: number;              // 0-1: Final aggregated score
  l1Score: number;                 // 0-1: L1 evaluation score
  l3Adjustment: number;            // -0.2 to +0.2: L3 adjustment
  confidence: number;              // 0-1: Overall confidence

  // Classification
  tier: RecommendationTier;
  rank: number;                    // 1-based ranking

  // Explanations
  whyPick: RecommendationReason[];      // Reasons to pick
  whyNot: RecommendationReason[];       // Reasons not to pick
  whatIf: string;                       // What happens if we pick this

  // Uncertainty
  uncertainties: UncertaintyWarning[];

  // Detailed breakdown
  breakdown: {
    pts: ScoredValue;
    synergy: ScoredValue;
    counter: ScoredValue;
    deny: ScoredValue;
    l3Strategic: ScoredValue;
  };

  // Metadata
  timestamp: Date;
}

/**
 * Complete recommendation result
 */
export interface RecommendationResult {
  // Recommendations sorted by final score
  recommendations: Recommendation[];

  // Summary statistics
  summary: {
    totalEvaluated: number;
    mustPickCount: number;
    strongCount: number;
    stableCount: number;
    situationalCount: number;
    avoidCount: number;
    avgConfidence: number;
    highUncertaintyCount: number;
  };

  // Team analysis
  teamAnalysis: {
    currentStrength: number;        // 0-1: Current team strength
    compositionGaps: string[];      // What's missing
    strategicPosition: string;      // Overall strategic position
  };

  // Metadata
  evaluationPhase: string;
  evaluatingSide: 'blue' | 'red';
  timestamp: Date;
}

// ============ L2 Configuration ============

/**
 * L2 recommendation configuration
 */
export interface L2Config {
  // Score aggregation weights
  l1Weight: number;                // Default: 0.85
  l3Weight: number;                // Default: 0.15

  // Tier thresholds
  tierThresholds: {
    mustPick: number;              // Default: 0.80
    strong: number;                // Default: 0.65
    stable: number;                // Default: 0.50
    situational: number;           // Default: 0.35
  };

  // Confidence thresholds
  confidenceThresholds: {
    high: number;                  // Default: 0.70
    medium: number;                // Default: 0.50
    low: number;                   // Default: 0.30
  };

  // Uncertainty detection
  uncertaintyThresholds: {
    lowConfidence: number;         // Default: 0.40
    highVariance: number;          // Default: 0.30
    conflictingSignals: number;    // Default: 0.25
  };

  // Reason generation
  maxWhyPickReasons: number;       // Default: 3
  maxWhyNotReasons: number;        // Default: 2
  minReasonImportance: number;     // Default: 0.3

  // L3 gating
  enableL3: boolean;               // Default: true
  minL3Confidence: number;         // Default: 0.50
  maxL3Adjustment: number;         // Default: 0.20
}

/**
 * Default L2 configuration
 */
export const DEFAULT_L2_CONFIG: L2Config = {
  l1Weight: 0.85,
  l3Weight: 0.15,

  tierThresholds: {
    mustPick: 0.80,
    strong: 0.65,
    stable: 0.50,
    situational: 0.35,
  },

  confidenceThresholds: {
    high: 0.70,
    medium: 0.50,
    low: 0.30,
  },

  uncertaintyThresholds: {
    lowConfidence: 0.40,
    highVariance: 0.30,
    conflictingSignals: 0.25,
  },

  maxWhyPickReasons: 3,
  maxWhyNotReasons: 2,
  minReasonImportance: 0.3,

  enableL3: true,
  minL3Confidence: 0.50,
  maxL3Adjustment: 0.20,
};
