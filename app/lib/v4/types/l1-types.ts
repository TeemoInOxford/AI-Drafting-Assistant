/**
 * v4-1 L1 Evaluation Layer Types
 *
 * L1 provides phase-aware evaluation of champions and compositions.
 * All evaluations include confidence scores and detailed breakdowns.
 */

import { Position } from '../../types';
import { ScoredValue, PhaseContext } from './common-types';

// ============ Phase-Aware PTS (Pick Threat Score) ============

/**
 * Phase-specific weight configuration
 * Weights change across Early/Mid/Late phases
 */
export interface PhaseWeights {
  roleVacancy: number;      // How much opponent needs this role
  metaPresence: number;     // How meta is this champion
  recentTrend: number;      // Recent pick/ban trends
  synergyBan: number;       // Did they ban synergies?
}

/**
 * PTS sub-scores with confidence
 */
export interface PTSSubScores {
  roleVacancy: ScoredValue;
  metaPresence: ScoredValue;
  recentTrend: ScoredValue;
  synergyBan: ScoredValue;
}

/**
 * Threat level classification
 */
export type ThreatLevel = 'critical' | 'high' | 'moderate' | 'low';

/**
 * PTS evaluation output
 */
export interface PTSOutput {
  championId: string;
  totalPTS: number;           // 0-100: Final PTS score
  confidence: number;         // 0-1: Overall confidence
  threatLevel: ThreatLevel;   // Risk classification
  breakdown: PTSSubScores;    // Detailed sub-scores
  explanation: string;        // Human-readable explanation
}

// ============ Composition Evaluation ============

/**
 * Team composition balance metrics
 */
export interface CompositionBalance {
  roleBalance: ScoredValue;      // Are all roles filled?
  damageBalance: ScoredValue;    // Physical vs Magic damage
  rangeBalance: ScoredValue;     // Melee vs Ranged
  tankiness: ScoredValue;        // Team tankiness
  engage: ScoredValue;           // Engage potential
  disengage: ScoredValue;        // Disengage potential
}

/**
 * Composition evaluation output
 */
export interface CompositionOutput {
  teamSide: 'blue' | 'red';
  overallScore: number;          // 0-1: Overall composition quality
  confidence: number;            // 0-1: Overall confidence
  balance: CompositionBalance;   // Detailed balance metrics
  strengths: string[];           // Composition strengths
  weaknesses: string[];          // Composition weaknesses
  suggestions: string[];         // Improvement suggestions
}

// ============ Synergy Evaluation ============

/**
 * Champion synergy with team
 */
export interface ChampionSynergyOutput {
  championId: string;
  overallSynergy: number;        // 0-1: Overall synergy score
  confidence: number;            // 0-1: Overall confidence
  synergyPartners: Array<{
    partnerId: string;
    synergyScore: number;
    synergyType: 'Hard' | 'Soft' | 'Meta';
    confidence: number;
  }>;
  explanation: string;           // Why this champion synergizes
}

// ============ Counter Evaluation ============

/**
 * Counter matchup evaluation
 */
export interface CounterOutput {
  championId: string;
  overallCounterScore: number;   // 0-1: How countered is this champion
  confidence: number;            // 0-1: Overall confidence
  counters: Array<{
    counterId: string;
    counterScore: number;
    counterType: 'Hard' | 'Soft' | 'Meta';
    confidence: number;
  }>;
  counterPotential: number;      // 0-1: How well does this counter enemies
  explanation: string;           // Counter matchup summary
}

// ============ Deny Evaluation ============

/**
 * Pick-to-deny value
 */
export interface DenyOutput {
  championId: string;
  denyValue: number;             // 0-1: Value of denying this from opponent
  confidence: number;            // 0-1: Overall confidence
  reasons: Array<{
    type: 'player_pool' | 'meta_priority' | 'synergy_denial' | 'flex_denial';
    score: number;
    confidence: number;
    explanation: string;
  }>;
  explanation: string;           // Why deny this champion
}

// ============ L1 Aggregated Output ============

/**
 * Complete L1 evaluation for a champion
 */
export interface L1ChampionEvaluation {
  championId: string;
  pts: PTSOutput;
  synergy: ChampionSynergyOutput;
  counter: CounterOutput;
  deny: DenyOutput;
  overallScore: number;          // 0-1: Aggregated score
  confidence: number;            // 0-1: Overall confidence
}

/**
 * L1 evaluation for all available champions
 */
export interface L1EvaluationResult {
  draftPhase: PhaseContext;
  evaluatingSide: 'blue' | 'red';
  championEvaluations: L1ChampionEvaluation[];
  teamComposition: CompositionOutput;
  opponentComposition: CompositionOutput;
  timestamp: Date;
}

// ============ L1 Configuration ============

/**
 * L1 evaluation configuration
 */
export interface L1Config {
  // PTS thresholds
  ptsThresholds: {
    critical: number;    // Default: 70
    high: number;        // Default: 50
    moderate: number;    // Default: 30
  };

  // Phase weight configurations
  earlyPhaseWeights: PhaseWeights;
  midPhaseWeights: PhaseWeights;
  latePhaseWeights: PhaseWeights;

  // Minimum confidence thresholds
  minConfidence: {
    pts: number;         // Default: 0.3
    synergy: number;     // Default: 0.3
    counter: number;     // Default: 0.3
    deny: number;        // Default: 0.3
  };

  // Evaluation weights for aggregation
  evaluationWeights: {
    pts: number;         // Default: 0.3
    synergy: number;     // Default: 0.25
    counter: number;     // Default: 0.25
    deny: number;        // Default: 0.2
  };
}

/**
 * Default L1 configuration
 */
export const DEFAULT_L1_CONFIG: L1Config = {
  ptsThresholds: {
    critical: 70,
    high: 50,
    moderate: 30,
  },

  // Early phase: Focus on meta and role vacancy
  earlyPhaseWeights: {
    roleVacancy: 0.3,
    metaPresence: 0.4,
    recentTrend: 0.2,
    synergyBan: 0.1,
  },

  // Mid phase: Balance between role and synergy
  midPhaseWeights: {
    roleVacancy: 0.35,
    metaPresence: 0.2,
    recentTrend: 0.15,
    synergyBan: 0.3,
  },

  // Late phase: Focus on role completion
  latePhaseWeights: {
    roleVacancy: 0.5,
    metaPresence: 0.15,
    recentTrend: 0.25,
    synergyBan: 0.1,
  },

  minConfidence: {
    pts: 0.3,
    synergy: 0.3,
    counter: 0.3,
    deny: 0.3,
  },

  evaluationWeights: {
    pts: 0.3,
    synergy: 0.25,
    counter: 0.25,
    deny: 0.2,
  },
};
