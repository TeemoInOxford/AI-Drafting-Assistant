/**
 * v4-1 L3 Strategic Layer Types
 *
 * L3 provides bounded game-theoretic optimization.
 * Only provides score adjustments, not final rankings.
 */

import { Champion } from '../../types';
import { DraftState } from './common-types';

// ============ Opponent Prediction ============

/**
 * Predicted opponent pick with probability
 */
export interface OpponentPrediction {
  championId: string;
  probability: number;        // 0-1: Probability of opponent picking this
  entropy: number;            // 0-1: Uncertainty in prediction
  confidence: number;         // 0-1: Confidence in prediction
  reasons: string[];          // Why we predict this
}

/**
 * Opponent prediction result
 */
export interface OpponentPredictionResult {
  predictions: OpponentPrediction[];
  totalEntropy: number;       // 0-1: Overall prediction uncertainty
  confidence: number;         // 0-1: Overall confidence
  predictedNext: string[];    // Top 3 predicted picks
}

// ============ BP Simulation ============

/**
 * Simulated draft action
 */
export interface SimulatedAction {
  turn: number;
  team: 'blue' | 'red';
  championId: string;
  probability: number;        // 0-1: Probability of this action
}

/**
 * Simulated draft path
 */
export interface SimulatedPath {
  actions: SimulatedAction[];
  probability: number;        // 0-1: Probability of this path
  ourFinalScore: number;      // 0-1: Our team score at end
  opponentFinalScore: number; // 0-1: Opponent team score at end
  advantage: number;          // -1 to +1: Our advantage
}

/**
 * BP simulation result
 */
export interface BPSimulationResult {
  championId: string;
  paths: SimulatedPath[];     // Top N simulated paths
  avgAdvantage: number;       // -1 to +1: Average advantage
  winProbability: number;     // 0-1: Estimated win probability
  confidence: number;         // 0-1: Confidence in simulation
  bestPath: SimulatedPath;    // Most likely path
  worstPath: SimulatedPath;   // Worst case path
}

// ============ Game Optimization ============

/**
 * Strategic value components
 */
export interface StrategicValue {
  flexValue: number;          // 0-1: Draft flexibility value
  informationValue: number;   // 0-1: Information hiding value
  counterplayValue: number;   // 0-1: Future counterplay options
  tempoValue: number;         // 0-1: Draft tempo advantage
}

/**
 * Game optimization result
 */
export interface GameOptimizationResult {
  championId: string;
  strategicValue: StrategicValue;
  totalValue: number;         // 0-1: Total strategic value
  confidence: number;         // 0-1: Confidence in optimization
  explanation: string;        // Why this has strategic value
}

// ============ L3 Adjustments (Output) ============

/**
 * L3 strategic adjustments for a champion
 * These are BOUNDED adjustments, not final scores
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

  // Supporting data
  opponentPrediction?: OpponentPredictionResult;
  simulation?: BPSimulationResult;
  optimization?: GameOptimizationResult;
}

// ============ L3 Configuration ============

/**
 * L3 strategic layer configuration
 */
export interface L3Config {
  // Enable/disable L3
  enabled: boolean;                      // Default: true

  // Confidence thresholds
  minConfidence: number;                 // Default: 0.50
  minOpponentPredictionConfidence: number; // Default: 0.40
  minSimulationConfidence: number;       // Default: 0.40
  minOptimizationConfidence: number;     // Default: 0.40

  // Adjustment bounds
  maxAdjustment: number;                 // Default: 0.20
  maxOpponentPredictionAdjustment: number; // Default: 0.10
  maxSimulationAdjustment: number;       // Default: 0.10
  maxStrategicValueAdjustment: number;   // Default: 0.10

  // Simulation parameters
  simulationDepth: number;               // Default: 2 (2-3 turns)
  simulationPaths: number;               // Default: 5 (top N paths)
  simulationSamples: number;             // Default: 100 (Monte Carlo samples)

  // Opponent prediction parameters
  predictionTopN: number;                // Default: 5
  predictionMinProbability: number;      // Default: 0.05

  // Strategic value weights
  strategicWeights: {
    flex: number;                        // Default: 0.3
    information: number;                 // Default: 0.2
    counterplay: number;                 // Default: 0.3
    tempo: number;                       // Default: 0.2
  };
}

/**
 * Default L3 configuration
 */
export const DEFAULT_L3_CONFIG: L3Config = {
  enabled: true,

  minConfidence: 0.50,
  minOpponentPredictionConfidence: 0.40,
  minSimulationConfidence: 0.40,
  minOptimizationConfidence: 0.40,

  maxAdjustment: 0.20,
  maxOpponentPredictionAdjustment: 0.10,
  maxSimulationAdjustment: 0.10,
  maxStrategicValueAdjustment: 0.10,

  simulationDepth: 2,
  simulationPaths: 5,
  simulationSamples: 100,

  predictionTopN: 5,
  predictionMinProbability: 0.05,

  strategicWeights: {
    flex: 0.3,
    information: 0.2,
    counterplay: 0.3,
    tempo: 0.2,
  },
};

// ============ L3 Result ============

/**
 * Complete L3 strategic analysis result
 */
export interface L3AnalysisResult {
  adjustments: Map<string, L3Adjustments>;
  opponentPrediction: OpponentPredictionResult;
  overallConfidence: number;
  timestamp: Date;
}
