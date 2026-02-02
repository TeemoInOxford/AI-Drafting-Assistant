/**
 * v4-1 L3 Opponent Predictor
 *
 * Predicts opponent's likely picks with entropy-based uncertainty.
 * Uses player pools, meta data, and draft context.
 */

import { Champion, Team } from '../../types';
import { DraftState } from '../types/common-types';
import { L0DataCache } from '../types/l0-types';
import { L1ChampionEvaluation } from '../types/l1-types';
import {
  OpponentPrediction,
  OpponentPredictionResult,
  L3Config,
  DEFAULT_L3_CONFIG,
} from '../types/l3-types';
import { getOpponentTeam, getRemainingRolesForTeam } from '../core/draft-state';

/**
 * Predict opponent's likely picks
 */
export function predictOpponentPicks(
  draftState: DraftState,
  availableChampions: Champion[],
  l0Data: L0DataCache,
  l1Evaluations: Map<string, L1ChampionEvaluation>,
  opponentPlayerIds?: string[],
  config: L3Config = DEFAULT_L3_CONFIG
): OpponentPredictionResult {
  const opponentTeam = getOpponentTeam(draftState.side);
  const opponentRoles = getRemainingRolesForTeam(draftState, opponentTeam);

  const predictions: OpponentPrediction[] = [];

  // Calculate probability for each available champion
  for (const champion of availableChampions) {
    const prediction = predictChampionProbability(
      champion,
      draftState,
      opponentTeam,
      opponentRoles,
      l0Data,
      l1Evaluations,
      opponentPlayerIds
    );

    if (prediction.probability >= config.predictionMinProbability) {
      predictions.push(prediction);
    }
  }

  // Sort by probability descending
  predictions.sort((a, b) => b.probability - a.probability);

  // Calculate total entropy (prediction uncertainty)
  const totalEntropy = calculatePredictionEntropy(predictions);

  // Calculate overall confidence (inverse of entropy)
  const confidence = Math.max(0, 1 - totalEntropy);

  // Get top N predicted picks
  const predictedNext = predictions
    .slice(0, config.predictionTopN)
    .map(p => p.championId);

  return {
    predictions,
    totalEntropy,
    confidence,
    predictedNext,
  };
}

/**
 * Predict probability for a single champion
 */
function predictChampionProbability(
  champion: Champion,
  draftState: DraftState,
  opponentTeam: Team,
  opponentRoles: string[],
  l0Data: L0DataCache,
  l1Evaluations: Map<string, L1ChampionEvaluation>,
  opponentPlayerIds?: string[]
): OpponentPrediction {
  const reasons: string[] = [];
  let probability = 0;
  const confidences: number[] = [];

  // Factor 1: Player pool frequency (40% weight)
  let playerPoolScore = 0;
  let playerPoolConfidence = 0;

  if (opponentPlayerIds && opponentPlayerIds.length > 0) {
    let maxFreq = 0;
    let totalFreq = 0;
    let poolCount = 0;

    for (const playerId of opponentPlayerIds) {
      const pool = l0Data.playerPools.get(playerId);
      if (pool) {
        const freq = pool.championFrequencies[champion.id] || 0;
        if (freq > 0) {
          maxFreq = Math.max(maxFreq, freq);
          totalFreq += freq;
          poolCount++;
          confidences.push(pool.confidence);
        }
      }
    }

    if (poolCount > 0) {
      playerPoolScore = maxFreq * 0.7 + (totalFreq / opponentPlayerIds.length) * 0.3;
      playerPoolConfidence = confidences.length > 0
        ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
        : 0;

      if (playerPoolScore > 0.1) {
        reasons.push('In opponent player pool');
      }
    }
  }

  probability += playerPoolScore * 0.4;

  // Factor 2: Meta presence (25% weight)
  const championStats = l0Data.championStats.get(champion.id);
  let metaScore = 0;
  let metaConfidence = 0;

  if (championStats) {
    metaScore = Math.min(1.0, (championStats.pickRate + championStats.banRate) * 1.2);
    metaConfidence = championStats.confidence;
    confidences.push(metaConfidence);

    if (metaScore > 0.6) {
      reasons.push('High meta priority');
    }
  }

  probability += metaScore * 0.25;

  // Factor 3: Role fit (20% weight)
  let roleScore = 0;

  if (opponentRoles.length > 0) {
    const canFillRoles = champion.positions.filter(pos => opponentRoles.includes(pos));
    if (canFillRoles.length > 0) {
      roleScore = Math.min(1.0, canFillRoles.length / opponentRoles.length);
      confidences.push(0.9); // High confidence in role matching

      if (roleScore > 0.5) {
        reasons.push('Fills opponent role need');
      }
    }
  }

  probability += roleScore * 0.2;

  // Factor 4: Synergy with opponent picks (15% weight)
  const opponentPickIds = draftState.side === opponentTeam
    ? draftState.bluePicks
    : draftState.redPicks;

  let synergyScore = 0;
  let synergyConfidence = 0;

  if (opponentPickIds.length > 0) {
    const synergies = l0Data.synergyMatrix.get(champion.id) || [];
    let totalSynergy = 0;
    let synergyCount = 0;

    for (const oppPickId of opponentPickIds) {
      const synergy = synergies.find(s => s.championB === oppPickId);
      if (synergy) {
        totalSynergy += synergy.score;
        confidences.push(synergy.confidence);
        synergyCount++;
      }
    }

    if (synergyCount > 0) {
      synergyScore = totalSynergy / synergyCount;
      synergyConfidence = confidences.length > 0
        ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
        : 0;

      if (synergyScore > 0.6) {
        reasons.push('Synergizes with opponent team');
      }
    }
  }

  probability += synergyScore * 0.15;

  // Normalize probability to 0-1
  probability = Math.max(0, Math.min(1, probability));

  // Calculate entropy (uncertainty)
  const entropy = calculateSingleEntropy(probability);

  // Calculate overall confidence
  const confidence = confidences.length > 0
    ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
    : 0.3;

  return {
    championId: champion.id,
    probability,
    entropy,
    confidence,
    reasons,
  };
}

/**
 * Calculate entropy for a single probability
 * Higher entropy = more uncertainty
 */
function calculateSingleEntropy(probability: number): number {
  if (probability === 0 || probability === 1) return 0;

  const p = probability;
  const q = 1 - probability;

  return -(p * Math.log2(p) + q * Math.log2(q));
}

/**
 * Calculate total prediction entropy
 * Measures overall uncertainty in predictions
 */
function calculatePredictionEntropy(predictions: OpponentPrediction[]): number {
  if (predictions.length === 0) return 1.0;

  // Normalize probabilities to sum to 1
  const totalProb = predictions.reduce((sum, p) => sum + p.probability, 0);
  if (totalProb === 0) return 1.0;

  let entropy = 0;
  for (const pred of predictions) {
    const p = pred.probability / totalProb;
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }

  // Normalize to 0-1 (max entropy is log2(n))
  const maxEntropy = Math.log2(predictions.length);
  return maxEntropy > 0 ? entropy / maxEntropy : 0;
}

/**
 * Get most likely opponent pick
 */
export function getMostLikelyPick(
  result: OpponentPredictionResult
): OpponentPrediction | null {
  return result.predictions.length > 0 ? result.predictions[0] : null;
}

/**
 * Get high probability picks
 */
export function getHighProbabilityPicks(
  result: OpponentPredictionResult,
  minProbability: number = 0.3
): OpponentPrediction[] {
  return result.predictions.filter(p => p.probability >= minProbability);
}

/**
 * Check if prediction is reliable
 */
export function isPredictionReliable(
  result: OpponentPredictionResult,
  minConfidence: number = 0.5
): boolean {
  return result.confidence >= minConfidence && result.totalEntropy < 0.7;
}
