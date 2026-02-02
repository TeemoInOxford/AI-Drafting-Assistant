/**
 * v4-1 L1 Counter Evaluator
 *
 * Evaluates counter matchups for champions.
 * Analyzes how countered a champion is and its counter potential.
 */

import { Champion, Team } from '../../types';
import { DraftState } from '../types/common-types';
import { L0DataCache } from '../types/l0-types';
import { CounterOutput } from '../types/l1-types';
import { combineConfidences } from '../types/common-types';
import { getPicksForTeam, getOpponentTeam } from '../core/draft-state';
import { getCounterBetween, findMultiCounters } from '../l0-data/counter-matrix';

/**
 * Evaluate counter matchups for a champion
 */
export function evaluateCounterMatchups(
  champion: Champion,
  team: Team,
  draftState: DraftState,
  l0Data: L0DataCache
): CounterOutput {
  const opponentTeam = getOpponentTeam(team);
  const opponentPickIds = getPicksForTeam(draftState, opponentTeam);

  if (opponentPickIds.length === 0) {
    return {
      championId: champion.id,
      overallCounterScore: 0,
      confidence: 0,
      counters: [],
      counterPotential: 0.5,
      explanation: 'No opponent picks yet to evaluate counters',
    };
  }

  // Calculate how countered this champion is
  const counters: CounterOutput['counters'] = [];
  let totalCounterScore = 0;
  const confidences: number[] = [];

  for (const oppChampId of opponentPickIds) {
    const counter = getCounterBetween(champion.id, oppChampId, l0Data.counterMatrix);

    if (counter) {
      counters.push({
        counterId: oppChampId,
        counterScore: counter.score,
        counterType: counter.type,
        confidence: counter.confidence,
      });

      totalCounterScore += counter.score;
      confidences.push(counter.confidence);
    } else {
      // No counter data - use neutral score
      totalCounterScore += 0;
      confidences.push(0);
    }
  }

  // Calculate overall counter score (how countered is this champion)
  const overallCounterScore = opponentPickIds.length > 0
    ? totalCounterScore / opponentPickIds.length
    : 0;

  // Calculate counter potential (how well does this counter enemies)
  const counterPotential = calculateCounterPotential(
    champion,
    opponentPickIds,
    l0Data
  );

  // Calculate overall confidence
  const confidence = confidences.length > 0
    ? combineConfidences(confidences)
    : 0;

  // Sort counters by score
  counters.sort((a, b) => b.counterScore - a.counterScore);

  // Generate explanation
  const explanation = generateCounterExplanation(
    champion,
    overallCounterScore,
    counterPotential,
    counters
  );

  return {
    championId: champion.id,
    overallCounterScore,
    confidence,
    counters,
    counterPotential,
    explanation,
  };
}

/**
 * Calculate counter potential
 * How well does this champion counter the enemy team?
 */
function calculateCounterPotential(
  champion: Champion,
  opponentPickIds: string[],
  l0Data: L0DataCache
): number {
  if (opponentPickIds.length === 0) {
    return 0.5;
  }

  let totalCounterScore = 0;

  for (const oppChampId of opponentPickIds) {
    // Check if this champion counters the opponent
    const counter = getCounterBetween(oppChampId, champion.id, l0Data.counterMatrix);

    if (counter) {
      totalCounterScore += counter.score;
    }
  }

  return totalCounterScore / opponentPickIds.length;
}

/**
 * Generate counter explanation
 */
function generateCounterExplanation(
  champion: Champion,
  overallCounterScore: number,
  counterPotential: number,
  counters: CounterOutput['counters']
): string {
  const parts: string[] = [];

  // How countered is this champion?
  if (overallCounterScore >= 0.7) {
    parts.push('Heavily countered by enemy team.');
  } else if (overallCounterScore >= 0.5) {
    parts.push('Moderately countered by enemy team.');
  } else if (overallCounterScore >= 0.3) {
    parts.push('Slightly countered by enemy team.');
  } else {
    parts.push('Not significantly countered.');
  }

  // Highlight hard counters
  const hardCounters = counters.filter(c => c.counterType === 'Hard');
  if (hardCounters.length > 0) {
    parts.push(`${hardCounters.length} hard counter(s) present.`);
  }

  // Counter potential
  if (counterPotential >= 0.6) {
    parts.push('Strong counter potential against enemies.');
  } else if (counterPotential >= 0.4) {
    parts.push('Moderate counter potential.');
  }

  return parts.join(' ');
}

/**
 * Evaluate counters for all available champions
 */
export function evaluateCountersForAll(
  availableChampions: Champion[],
  team: Team,
  draftState: DraftState,
  l0Data: L0DataCache
): CounterOutput[] {
  const results: CounterOutput[] = [];

  for (const champion of availableChampions) {
    const counter = evaluateCounterMatchups(champion, team, draftState, l0Data);
    results.push(counter);
  }

  return results;
}

/**
 * Get champions with best counter potential
 * (Champions that counter multiple enemies)
 */
export function getBestCounterPicks(
  availableChampions: Champion[],
  team: Team,
  draftState: DraftState,
  l0Data: L0DataCache,
  topN: number = 10,
  minConfidence: number = 0.3
): CounterOutput[] {
  const allCounters = evaluateCountersForAll(
    availableChampions,
    team,
    draftState,
    l0Data
  );

  return allCounters
    .filter(c => c.confidence >= minConfidence)
    .sort((a, b) => b.counterPotential - a.counterPotential)
    .slice(0, topN);
}

/**
 * Get champions least countered by enemies
 */
export function getLeastCounteredChampions(
  availableChampions: Champion[],
  team: Team,
  draftState: DraftState,
  l0Data: L0DataCache,
  topN: number = 10,
  minConfidence: number = 0.3
): CounterOutput[] {
  const allCounters = evaluateCountersForAll(
    availableChampions,
    team,
    draftState,
    l0Data
  );

  return allCounters
    .filter(c => c.confidence >= minConfidence)
    .sort((a, b) => a.overallCounterScore - b.overallCounterScore)
    .slice(0, topN);
}

/**
 * Find multi-counter champions
 * Champions that counter multiple enemy picks
 */
export function findMultiCounterChampions(
  availableChampions: Champion[],
  team: Team,
  draftState: DraftState,
  l0Data: L0DataCache,
  minCounters: number = 2
): Array<{ champion: Champion; countersCount: number; avgScore: number }> {
  const opponentTeam = getOpponentTeam(team);
  const opponentPickIds = getPicksForTeam(draftState, opponentTeam);

  if (opponentPickIds.length < minCounters) {
    return [];
  }

  // Use L0 multi-counter detection
  const multiCounters = findMultiCounters(
    opponentPickIds,
    l0Data.counterMatrix,
    minCounters
  );

  // Filter to only available champions
  const availableChampionIds = new Set(availableChampions.map(c => c.id));
  const results: Array<{ champion: Champion; countersCount: number; avgScore: number }> = [];

  for (const mc of multiCounters) {
    if (availableChampionIds.has(mc.championId)) {
      const champion = availableChampions.find(c => c.id === mc.championId);
      if (champion) {
        results.push({
          champion,
          countersCount: mc.countersCount,
          avgScore: mc.avgScore,
        });
      }
    }
  }

  return results;
}
