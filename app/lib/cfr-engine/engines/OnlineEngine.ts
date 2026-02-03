/**
 * OnlineEngine
 * Real-time decision making using belief update and lookahead search
 */

import { Champion } from '../types';
import {
  CFRBanPickState,
  OnlineDecisionContext,
  OnlineDecisionResult,
  OpponentStyle
} from '../types';
import { OpponentModelManager } from '../models/OpponentModel';
import { BeliefUpdate } from '../algorithms/BeliefUpdate';
import { LookaheadSearch } from '../algorithms/LookaheadSearch';
import { globalPerformanceMonitor } from '../utils/PerformanceMonitor';

export class OnlineEngine {
  private opponentModel: OpponentModelManager;
  private beliefUpdate: BeliefUpdate;
  private lookaheadSearch: LookaheadSearch;

  constructor() {
    this.opponentModel = new OpponentModelManager();
    this.beliefUpdate = new BeliefUpdate(0.1); // Learning rate
    this.lookaheadSearch = new LookaheadSearch(2, 10); // 2-step, top 10 candidates
  }

  /**
   * Make a decision using online algorithms
   */
  public async makeDecision(context: OnlineDecisionContext): Promise<OnlineDecisionResult> {
    const startTime = Date.now();

    // Perform lookahead search
    const searchResult = globalPerformanceMonitor.track(
      'lookahead_search',
      () => this.lookaheadSearch.search(
        context.state,
        context.availableChampions,
        this.opponentModel
      )
    );

    // Generate reasoning
    const reasoning = this.generateReasoning(
      searchResult.bestAction,
      searchResult.expectedValue,
      context
    );

    // Get alternative actions
    const alternativeActions = this.getAlternativeActions(
      searchResult.evaluatedActions,
      searchResult.bestAction,
      context
    );

    const computeTime = Date.now() - startTime;

    return {
      action: searchResult.bestAction,
      value: searchResult.expectedValue,
      reasoning,
      confidence: searchResult.confidence,
      alternativeActions,
      computeTime,
    };
  }

  /**
   * Update opponent model with observed action
   */
  public updateOpponentModel(
    champion: Champion,
    phase: 'ban' | 'pick',
    round: number,
    state: CFRBanPickState
  ): void {
    // Record observation
    this.opponentModel.observeAction(champion, phase, round, state);

    // Update beliefs using Bayesian inference
    const updateResult = this.beliefUpdate.update({
      priorBeliefs: this.opponentModel.getBeliefs(),
      observedAction: { champion, phase, context: state },
      learningRate: 0.1,
    });

    // Update opponent model with new beliefs
    this.opponentModel.updateBeliefs(updateResult.posteriorBeliefs);

    console.log(`Opponent model updated. Confidence: ${updateResult.confidence.toFixed(2)}`);
    console.log(`Most likely style: ${this.opponentModel.getMostLikelyStyle()}`);
  }

  /**
   * Generate reasoning for the decision
   */
  private generateReasoning(
    action: string,
    value: number,
    context: OnlineDecisionContext
  ): string[] {
    const reasoning: string[] = [];

    // Get champion
    const champion = context.availableChampions.find(c => c.id === action);
    if (!champion) {
      return ['Champion not found'];
    }

    // Determine phase
    const totalBans = context.state.ourBans.length + context.state.theirBans.length;
    const isBanPhase = totalBans < 10;

    if (isBanPhase) {
      reasoning.push(`Ban ${champion.name} to deny opponent's strategy`);

      // Check opponent preferences
      const opponentPrefs = this.opponentModel.getChampionPreferences();
      const isPreferred = opponentPrefs.some(p => p.championId === champion.id && p.frequency > 0);

      if (isPreferred) {
        reasoning.push(`Opponent has shown preference for this champion`);
      }
    } else {
      reasoning.push(`Pick ${champion.name} for strong composition`);

      // Check role coverage
      const filledRoles = new Set(context.state.ourPicks.flatMap(c => c.positions));
      const fillsNewRole = champion.positions.some(pos => !filledRoles.has(pos));

      if (fillsNewRole) {
        reasoning.push(`Fills needed role: ${champion.positions.join(', ')}`);
      }
    }

    // Add value-based reasoning
    if (value > 10) {
      reasoning.push('High expected value from lookahead analysis');
    } else if (value < -10) {
      reasoning.push('Defensive choice to minimize opponent advantage');
    }

    return reasoning;
  }

  /**
   * Get alternative actions
   */
  private getAlternativeActions(
    evaluatedActions: Map<string, number>,
    bestAction: string,
    context: OnlineDecisionContext
  ): Array<{ action: string; value: number; reason: string }> {
    const alternatives: Array<{ action: string; value: number; reason: string }> = [];

    // Sort by value
    const sorted = Array.from(evaluatedActions.entries())
      .filter(([action]) => action !== bestAction)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3); // Top 3 alternatives

    for (const [action, value] of sorted) {
      const champion = context.availableChampions.find(c => c.id === action);
      if (!champion) continue;

      alternatives.push({
        action,
        value,
        reason: `${champion.name} - Alternative with value ${value.toFixed(1)}`,
      });
    }

    return alternatives;
  }

  /**
   * Get opponent model
   */
  public getOpponentModel(): OpponentModelManager {
    return this.opponentModel;
  }

  /**
   * Reset opponent model
   */
  public resetOpponentModel(): void {
    this.opponentModel.reset();
  }

  /**
   * Set lookahead depth
   */
  public setLookaheadDepth(depth: number): void {
    this.lookaheadSearch.setMaxDepth(depth);
  }

  /**
   * Set candidate limit
   */
  public setCandidateLimit(limit: number): void {
    this.lookaheadSearch.setCandidateLimit(limit);
  }

  /**
   * Set learning rate
   */
  public setLearningRate(rate: number): void {
    this.beliefUpdate.setLearningRate(rate);
  }
}
