/**
 * v4-1 L3 BP Simulator
 *
 * Simulates 2-3 turns ahead to evaluate strategic value.
 * Uses Monte Carlo sampling for efficiency.
 */

import { Champion } from '../../types';
import { DraftState } from '../types/common-types';
import { L0DataCache } from '../types/l0-types';
import { L1ChampionEvaluation } from '../types/l1-types';
import {
  BPSimulationResult,
  SimulatedPath,
  SimulatedAction,
  L3Config,
  DEFAULT_L3_CONFIG,
  OpponentPredictionResult,
} from '../types/l3-types';

/**
 * Simulate BP paths for a champion pick
 */
export function simulateBPPaths(
  championId: string,
  draftState: DraftState,
  availableChampions: Champion[],
  l0Data: L0DataCache,
  l1Evaluations: Map<string, L1ChampionEvaluation>,
  opponentPrediction: OpponentPredictionResult,
  config: L3Config = DEFAULT_L3_CONFIG
): BPSimulationResult {
  const paths: SimulatedPath[] = [];

  // Generate N simulated paths using Monte Carlo sampling
  for (let i = 0; i < config.simulationSamples; i++) {
    const path = simulateSinglePath(
      championId,
      draftState,
      availableChampions,
      l1Evaluations,
      opponentPrediction,
      config
    );

    if (path) {
      paths.push(path);
    }
  }

  // Aggregate paths
  const aggregatedPaths = aggregatePaths(paths, config.simulationPaths);

  // Calculate average advantage
  const avgAdvantage = paths.length > 0
    ? paths.reduce((sum, p) => sum + p.advantage, 0) / paths.length
    : 0;

  // Calculate win probability (sigmoid of advantage)
  const winProbability = 1 / (1 + Math.exp(-avgAdvantage * 5));

  // Find best and worst paths
  const sortedPaths = [...aggregatedPaths].sort((a, b) => b.advantage - a.advantage);
  const bestPath = sortedPaths[0] || createEmptyPath();
  const worstPath = sortedPaths[sortedPaths.length - 1] || createEmptyPath();

  // Calculate confidence based on path variance
  const confidence = calculateSimulationConfidence(paths);

  return {
    championId,
    paths: aggregatedPaths,
    avgAdvantage,
    winProbability,
    confidence,
    bestPath,
    worstPath,
  };
}

/**
 * Simulate a single path
 */
function simulateSinglePath(
  initialChampionId: string,
  draftState: DraftState,
  availableChampions: Champion[],
  l1Evaluations: Map<string, L1ChampionEvaluation>,
  opponentPrediction: OpponentPredictionResult,
  config: L3Config
): SimulatedPath | null {
  const actions: SimulatedAction[] = [];
  let currentTurn = draftState.turn;
  const usedChampions = new Set(draftState.usedChampions);

  // Add our initial pick
  actions.push({
    turn: currentTurn,
    team: draftState.side,
    championId: initialChampionId,
    probability: 1.0,
  });
  usedChampions.add(initialChampionId);
  currentTurn++;

  // Simulate next N turns
  for (let i = 0; i < config.simulationDepth; i++) {
    // Determine whose turn it is (simplified - assumes alternating)
    const isOurTurn = (currentTurn - draftState.turn) % 2 === 0;
    const team = isOurTurn ? draftState.side : (draftState.side === 'blue' ? 'red' : 'blue');

    // Pick a champion for this turn
    let pickedChampion: string | null = null;
    let pickProbability = 0;

    if (isOurTurn) {
      // Our turn: pick highest scoring available champion
      const available = availableChampions.filter(c => !usedChampions.has(c.id));
      if (available.length === 0) break;

      const sorted = available
        .map(c => ({
          id: c.id,
          score: l1Evaluations.get(c.id)?.overallScore || 0.5,
        }))
        .sort((a, b) => b.score - a.score);

      pickedChampion = sorted[0].id;
      pickProbability = 0.8; // High probability for our picks
    } else {
      // Opponent turn: sample from prediction distribution
      const available = opponentPrediction.predictions.filter(
        p => !usedChampions.has(p.championId)
      );

      if (available.length === 0) break;

      // Sample based on probability
      const totalProb = available.reduce((sum, p) => sum + p.probability, 0);
      let random = Math.random() * totalProb;

      for (const pred of available) {
        random -= pred.probability;
        if (random <= 0) {
          pickedChampion = pred.championId;
          pickProbability = pred.probability / totalProb;
          break;
        }
      }

      if (!pickedChampion) {
        pickedChampion = available[0].championId;
        pickProbability = available[0].probability / totalProb;
      }
    }

    if (!pickedChampion) break;

    actions.push({
      turn: currentTurn,
      team,
      championId: pickedChampion,
      probability: pickProbability,
    });

    usedChampions.add(pickedChampion);
    currentTurn++;
  }

  // Calculate final scores (simplified)
  const ourPicks = actions.filter(a => a.team === draftState.side);
  const opponentPicks = actions.filter(a => a.team !== draftState.side);

  const ourFinalScore = calculateTeamScore(ourPicks, l1Evaluations);
  const opponentFinalScore = calculateTeamScore(opponentPicks, l1Evaluations);

  const advantage = ourFinalScore - opponentFinalScore;

  // Calculate path probability
  const pathProbability = actions.reduce((prod, a) => prod * a.probability, 1);

  return {
    actions,
    probability: pathProbability,
    ourFinalScore,
    opponentFinalScore,
    advantage,
  };
}

/**
 * Calculate team score from picks
 */
function calculateTeamScore(
  picks: SimulatedAction[],
  l1Evaluations: Map<string, L1ChampionEvaluation>
): number {
  if (picks.length === 0) return 0.5;

  let totalScore = 0;
  for (const pick of picks) {
    const evaluation = l1Evaluations.get(pick.championId);
    totalScore += evaluation?.overallScore || 0.5;
  }

  return totalScore / picks.length;
}

/**
 * Aggregate similar paths
 */
function aggregatePaths(
  paths: SimulatedPath[],
  topN: number
): SimulatedPath[] {
  if (paths.length === 0) return [];

  // Group paths by advantage range
  const buckets = new Map<number, SimulatedPath[]>();

  for (const path of paths) {
    const bucket = Math.floor(path.advantage * 10) / 10; // Round to 0.1
    if (!buckets.has(bucket)) {
      buckets.set(bucket, []);
    }
    buckets.get(bucket)!.push(path);
  }

  // Get representative path from each bucket
  const aggregated: SimulatedPath[] = [];

  for (const [bucket, bucketPaths] of buckets.entries()) {
    // Average the paths in this bucket
    const avgPath: SimulatedPath = {
      actions: bucketPaths[0].actions, // Use first path's actions as representative
      probability: bucketPaths.reduce((sum, p) => sum + p.probability, 0) / bucketPaths.length,
      ourFinalScore: bucketPaths.reduce((sum, p) => sum + p.ourFinalScore, 0) / bucketPaths.length,
      opponentFinalScore: bucketPaths.reduce((sum, p) => sum + p.opponentFinalScore, 0) / bucketPaths.length,
      advantage: bucketPaths.reduce((sum, p) => sum + p.advantage, 0) / bucketPaths.length,
    };

    aggregated.push(avgPath);
  }

  // Sort by advantage and return top N
  return aggregated
    .sort((a, b) => b.advantage - a.advantage)
    .slice(0, topN);
}

/**
 * Calculate simulation confidence
 */
function calculateSimulationConfidence(paths: SimulatedPath[]): number {
  if (paths.length < 10) return 0.3; // Low confidence with few samples

  // Calculate variance in advantages
  const advantages = paths.map(p => p.advantage);
  const mean = advantages.reduce((sum, a) => sum + a, 0) / advantages.length;
  const variance = advantages.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / advantages.length;
  const stdDev = Math.sqrt(variance);

  // Lower variance = higher confidence
  const confidence = Math.max(0, 1 - stdDev * 2);

  return confidence;
}

/**
 * Create empty path
 */
function createEmptyPath(): SimulatedPath {
  return {
    actions: [],
    probability: 0,
    ourFinalScore: 0.5,
    opponentFinalScore: 0.5,
    advantage: 0,
  };
}

/**
 * Get simulation adjustment
 * Converts simulation result to score adjustment
 */
export function getSimulationAdjustment(
  simulation: BPSimulationResult,
  config: L3Config = DEFAULT_L3_CONFIG
): number {
  if (simulation.confidence < config.minSimulationConfidence) {
    return 0; // Don't adjust if confidence too low
  }

  // Convert advantage to adjustment
  // Advantage range: -1 to +1
  // Adjustment range: -maxAdjustment to +maxAdjustment
  const adjustment = simulation.avgAdvantage * config.maxSimulationAdjustment;

  return Math.max(
    -config.maxSimulationAdjustment,
    Math.min(config.maxSimulationAdjustment, adjustment)
  );
}
