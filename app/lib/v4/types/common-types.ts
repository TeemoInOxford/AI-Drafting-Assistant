/**
 * v4-1 Common Types
 *
 * Foundation types for the four-layer architecture (L0-L3).
 * All evaluations must include confidence scores.
 */

import { Position, Team, BPStep } from '../../types';

// ============ Core Confidence-Based Scoring ============

/**
 * All scores must include confidence values
 * Confidence ranges from 0 (no data) to 1 (high certainty)
 */
export interface ScoredValue {
  score: number;
  confidence: number;
  metadata?: Record<string, any>;
}

// ============ Phase Context ============

/**
 * BP phases with semantic meaning
 * - ban1: First ban phase (steps 0-5)
 * - pick1: First pick phase (steps 6-11)
 * - ban2: Second ban phase (steps 12-15)
 * - pick2: Second pick phase (steps 16-19)
 */
export type BPPhase = 'ban1' | 'pick1' | 'ban2' | 'pick2';

/**
 * Phase context for phase-aware evaluation
 * PTS semantics change across Early/Mid/Late phases
 */
export interface PhaseContext {
  phase: BPPhase;
  turn: number;
  isEarly: boolean;  // ban1, pick1 first 3
  isMid: boolean;    // pick1 last 3, ban2
  isLate: boolean;   // pick2
}

// ============ Draft State (v4-1) ============

/**
 * Immutable draft state for v4-1 evaluation
 * Converted from BPState for layer processing
 */
export interface DraftState {
  // Phase information
  phase: BPPhase;
  turn: number;
  phaseContext: PhaseContext;

  // Current side being evaluated
  side: Team;
  currentStep: BPStep;

  // Team compositions
  bluePicks: string[];   // Champion IDs
  redPicks: string[];
  blueBans: string[];
  redBans: string[];

  // Role tracking
  blueRemainingRoles: Position[];
  redRemainingRoles: Position[];

  // Used champions
  usedChampions: Set<string>;
}

// ============ Confidence Calculation ============

/**
 * Calculate confidence from sample size using sigmoid function
 * High confidence when n > 50, low when n < 10
 */
export function calculateSampleConfidence(
  sampleSize: number,
  threshold: number = 50,
  steepness: number = 0.1
): number {
  return 1 / (1 + Math.exp(-steepness * (sampleSize - threshold)));
}

/**
 * Calculate time decay weight for historical data
 * Recent matches weighted higher
 */
export function calculateTimeDecay(
  matchDate: Date,
  currentDate: Date,
  halfLifeDays: number = 30
): number {
  const daysDiff = (currentDate.getTime() - matchDate.getTime()) / (1000 * 60 * 60 * 24);
  const lambda = Math.log(2) / halfLifeDays;
  return Math.exp(-lambda * daysDiff);
}

/**
 * Combine multiple confidence values
 * Uses geometric mean to penalize low confidence
 */
export function combineConfidences(confidences: number[]): number {
  if (confidences.length === 0) return 0;
  const product = confidences.reduce((acc, c) => acc * c, 1);
  return Math.pow(product, 1 / confidences.length);
}

/**
 * Weight confidence by importance
 * More important signals have higher weight
 */
export function weightedConfidence(
  confidences: number[],
  weights: number[]
): number {
  if (confidences.length !== weights.length) {
    throw new Error('Confidences and weights must have same length');
  }

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight === 0) return 0;

  const weightedSum = confidences.reduce(
    (sum, c, i) => sum + c * weights[i],
    0
  );

  return weightedSum / totalWeight;
}
