/**
 * LookaheadSearch Algorithm
 * Implements N-step forward simulation to evaluate candidate actions
 *
 * Formula: V(s, a) = Σ P(θ) × Σ P(a'|θ) × V(s', a')
 * - s: Current state
 * - a: Candidate action
 * - θ: Opponent strategy
 * - a': Opponent's possible response
 * - V(s', a'): Value of subsequent state
 */

import { Champion } from '../types';
import {
  CFRBanPickState,
  SearchNode,
  LookaheadResult,
  OpponentStyle
} from '../types';
import { OpponentModelManager } from '../models/OpponentModel';

export class LookaheadSearch {
  private maxDepth: number;
  private candidateLimit: number;

  constructor(maxDepth: number = 2, candidateLimit: number = 10) {
    this.maxDepth = maxDepth;
    this.candidateLimit = candidateLimit;
  }

  /**
   * Perform lookahead search from current state
   */
  public search(
    state: CFRBanPickState,
    availableChampions: Champion[],
    opponentModel: OpponentModelManager
  ): LookaheadResult {
    const startTime = Date.now();

    // Create root node
    const root: SearchNode = {
      state,
      action: null,
      parent: null,
      children: [],
      visits: 0,
      value: 0,
      depth: 0,
    };

    // Get candidate actions (limit to top K)
    const candidates = this.getCandidateActions(state, availableChampions);

    // Evaluate each candidate action
    const evaluatedActions = new Map<string, number>();
    let bestAction = '';
    let bestValue = -Infinity;

    for (const championId of candidates) {
      const value = this.evaluateAction(
        state,
        championId,
        availableChampions,
        opponentModel,
        0
      );

      evaluatedActions.set(championId, value);

      if (value > bestValue) {
        bestValue = value;
        bestAction = championId;
      }
    }

    const computeTime = Date.now() - startTime;

    // Calculate confidence based on value spread
    const confidence = this.calculateConfidence(evaluatedActions);

    return {
      bestAction,
      expectedValue: bestValue,
      searchTree: root,
      evaluatedActions,
      confidence,
    };
  }

  /**
   * Get candidate actions (top K champions)
   */
  private getCandidateActions(
    state: CFRBanPickState,
    availableChampions: Champion[]
  ): string[] {
    // For now, return all available champions (limited by candidateLimit)
    // In practice, this would use heuristics to prune the search space
    return availableChampions
      .slice(0, this.candidateLimit)
      .map(c => c.id);
  }

  /**
   * Evaluate a single action using recursive lookahead
   */
  private evaluateAction(
    state: CFRBanPickState,
    championId: string,
    availableChampions: Champion[],
    opponentModel: OpponentModelManager,
    depth: number
  ): number {
    // Apply action to get next state
    const nextState = this.applyAction(state, championId, availableChampions);

    // If terminal or max depth, return heuristic value
    if (this.isTerminal(nextState) || depth >= this.maxDepth) {
      return this.evaluateState(nextState);
    }

    // If opponent's turn, consider their possible responses
    if (nextState.currentTurn !== state.currentTurn) {
      return this.evaluateOpponentTurn(
        nextState,
        availableChampions.filter(c => c.id !== championId),
        opponentModel,
        depth + 1
      );
    }

    // If our turn again, recursively evaluate
    return this.evaluateAction(
      nextState,
      championId,
      availableChampions.filter(c => c.id !== championId),
      opponentModel,
      depth + 1
    );
  }

  /**
   * Evaluate opponent's turn using belief distribution
   */
  private evaluateOpponentTurn(
    state: CFRBanPickState,
    availableChampions: Champion[],
    opponentModel: OpponentModelManager,
    depth: number
  ): number {
    // Get opponent's likely actions
    const opponentActions = this.predictOpponentActions(
      state,
      availableChampions,
      opponentModel
    );

    // Calculate expected value over opponent's actions
    let expectedValue = 0;

    for (const { championId, probability } of opponentActions) {
      const value = this.evaluateAction(
        state,
        championId,
        availableChampions,
        opponentModel,
        depth
      );

      expectedValue += probability * value;
    }

    return expectedValue;
  }

  /**
   * Predict opponent's likely actions
   */
  private predictOpponentActions(
    state: CFRBanPickState,
    availableChampions: Champion[],
    opponentModel: OpponentModelManager
  ): Array<{ championId: string; probability: number }> {
    const predictions: Array<{ championId: string; probability: number }> = [];

    // Get top K candidates based on opponent model
    const candidates = availableChampions.slice(0, 5); // Top 5

    let totalProb = 0;
    for (const champion of candidates) {
      const prob = opponentModel.predictPickProbability(champion, state);
      predictions.push({ championId: champion.id, probability: prob });
      totalProb += prob;
    }

    // Normalize probabilities
    if (totalProb > 0) {
      for (const pred of predictions) {
        pred.probability /= totalProb;
      }
    }

    return predictions;
  }

  /**
   * Apply action to state (immutable)
   */
  private applyAction(
    state: CFRBanPickState,
    championId: string,
    availableChampions: Champion[]
  ): CFRBanPickState {
    const champion = availableChampions.find(c => c.id === championId);
    if (!champion) {
      throw new Error(`Champion ${championId} not available`);
    }

    const newState: CFRBanPickState = {
      ...state,
      availableChampions: availableChampions.filter(c => c.id !== championId),
    };

    // Determine if this is a ban or pick
    const totalBans = state.ourBans.length + state.theirBans.length;
    const isBanPhase = totalBans < 10;

    if (isBanPhase) {
      if (state.currentTurn === 'blue') {
        newState.ourBans = [...state.ourBans, champion];
      } else {
        newState.theirBans = [...state.theirBans, champion];
      }
    } else {
      if (state.currentTurn === 'blue') {
        newState.ourPicks = [...state.ourPicks, champion];
      } else {
        newState.theirPicks = [...state.theirPicks, champion];
      }
    }

    // Switch turn
    newState.currentTurn = state.currentTurn === 'blue' ? 'red' : 'blue';
    newState.round = state.round + 1;

    return newState;
  }

  /**
   * Check if state is terminal
   */
  private isTerminal(state: CFRBanPickState): boolean {
    const totalBans = state.ourBans.length + state.theirBans.length;
    const totalPicks = state.ourPicks.length + state.theirPicks.length;
    return totalBans >= 10 && totalPicks >= 10;
  }

  /**
   * Evaluate state heuristically
   */
  private evaluateState(state: CFRBanPickState): number {
    // Simple heuristic: count champion strength
    // Positive = good for us, negative = good for opponent
    let ourStrength = 0;
    let theirStrength = 0;

    // This is a placeholder - real implementation would use
    // composition evaluator from existing V4 system
    for (const champ of state.ourPicks) {
      ourStrength += this.getChampionStrength(champ);
    }

    for (const champ of state.theirPicks) {
      theirStrength += this.getChampionStrength(champ);
    }

    // Consider role coverage
    const ourRoleCoverage = this.calculateRoleCoverage(state.ourPicks);
    const theirRoleCoverage = this.calculateRoleCoverage(state.theirPicks);

    return (ourStrength + ourRoleCoverage * 10) - (theirStrength + theirRoleCoverage * 10);
  }

  /**
   * Get champion strength (placeholder)
   */
  private getChampionStrength(champion: Champion): number {
    // Placeholder - would integrate with existing stats system
    return 50;
  }

  /**
   * Calculate role coverage (0-5)
   */
  private calculateRoleCoverage(picks: Champion[]): number {
    const roles = new Set<string>();
    for (const champ of picks) {
      for (const pos of champ.positions) {
        roles.add(pos);
      }
    }
    return roles.size;
  }

  /**
   * Calculate confidence based on value spread
   */
  private calculateConfidence(evaluatedActions: Map<string, number>): number {
    if (evaluatedActions.size === 0) return 0;

    const values = Array.from(evaluatedActions.values());
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);

    // If all values are similar, confidence is low
    // If there's a clear winner, confidence is high
    const spread = maxValue - minValue;

    if (spread === 0) return 0.5; // All equal

    // Normalize spread to confidence
    // Larger spread = higher confidence in best action
    return Math.min(1, spread / 100);
  }

  /**
   * Set max depth
   */
  public setMaxDepth(depth: number): void {
    this.maxDepth = Math.max(1, depth);
  }

  /**
   * Set candidate limit
   */
  public setCandidateLimit(limit: number): void {
    this.candidateLimit = Math.max(1, limit);
  }
}
