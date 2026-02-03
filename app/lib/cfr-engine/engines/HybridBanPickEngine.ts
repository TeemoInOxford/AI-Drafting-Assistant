/**
 * HybridBanPickEngine
 * Orchestrates online and offline engines for optimal Ban/Pick decisions
 *
 * Decision Strategy:
 * - If scenario matches trained offline strategy: Use CFR strategy + online fine-tuning
 * - Otherwise: Use online lookahead search + opponent modeling
 */

import { Champion } from '../types';
import {
  CFRBanPickState,
  HybridDecisionContext,
  HybridDecisionResult
} from '../types';
import { OnlineEngine } from './OnlineEngine';
import { OfflineEngine } from './OfflineEngine';
import { StateAbstraction } from '../utils/StateAbstraction';
import { globalPerformanceMonitor } from '../utils/PerformanceMonitor';

export class HybridBanPickEngine {
  private onlineEngine: OnlineEngine;
  private offlineEngine: OfflineEngine;
  private useOfflineThreshold: number;

  constructor() {
    this.onlineEngine = new OnlineEngine();
    this.offlineEngine = new OfflineEngine();
    this.useOfflineThreshold = 0.7; // Confidence threshold for using offline strategy
  }

  /**
   * Make a decision using hybrid approach
   */
  public async makeDecision(context: HybridDecisionContext): Promise<HybridDecisionResult> {
    const startTime = Date.now();

    // Determine which scenario this state matches
    const scenario = this.identifyScenario(context.state);

    // Check if we have a trained strategy for this scenario
    const hasOfflineStrategy = scenario && this.offlineEngine.hasStrategy(scenario);

    let result: HybridDecisionResult;

    if (hasOfflineStrategy && context.useOffline) {
      // Use hybrid approach: offline strategy + online adjustment
      result = await this.makeHybridDecision(context, scenario!);
    } else {
      // Use pure online approach
      result = await this.makeOnlineDecision(context);
    }

    result.computeTime = Date.now() - startTime;
    return result;
  }

  /**
   * Make decision using hybrid approach
   */
  private async makeHybridDecision(
    context: HybridDecisionContext,
    scenario: string
  ): Promise<HybridDecisionResult> {
    // Get offline strategy recommendation
    const offlineAction = this.offlineEngine.getBestAction(scenario, context.state);

    // Get online engine recommendation
    const onlineResult = await this.onlineEngine.makeDecision({
      state: context.state,
      opponentModel: context.opponentModel,
      availableChampions: context.availableChampions,
      timeLimit: context.timeLimit,
      lookaheadDepth: 2,
    });

    // Combine recommendations
    let finalAction: string;
    let offlineContribution: number;
    let onlineContribution: number;
    let reasoning: string[];

    if (offlineAction && onlineResult.confidence < this.useOfflineThreshold) {
      // Use offline strategy (high confidence)
      finalAction = offlineAction;
      offlineContribution = 0.8;
      onlineContribution = 0.2;
      reasoning = [
        `Using trained CFR strategy for ${scenario}`,
        ...onlineResult.reasoning,
      ];
    } else {
      // Use online strategy (low offline confidence or no offline action)
      finalAction = onlineResult.action;
      offlineContribution = 0.2;
      onlineContribution = 0.8;
      reasoning = [
        `Using online lookahead search`,
        ...onlineResult.reasoning,
      ];
    }

    return {
      action: finalAction,
      value: onlineResult.value,
      source: 'hybrid',
      reasoning,
      confidence: onlineResult.confidence,
      offlineContribution,
      onlineContribution,
      computeTime: 0, // Will be set by caller
    };
  }

  /**
   * Make decision using pure online approach
   */
  private async makeOnlineDecision(
    context: HybridDecisionContext
  ): Promise<HybridDecisionResult> {
    const onlineResult = await this.onlineEngine.makeDecision({
      state: context.state,
      opponentModel: context.opponentModel,
      availableChampions: context.availableChampions,
      timeLimit: context.timeLimit,
      lookaheadDepth: 2,
    });

    return {
      action: onlineResult.action,
      value: onlineResult.value,
      source: 'online',
      reasoning: onlineResult.reasoning,
      confidence: onlineResult.confidence,
      computeTime: 0, // Will be set by caller
    };
  }

  /**
   * Identify which scenario the current state matches
   */
  private identifyScenario(state: CFRBanPickState): string | null {
    const totalBans = state.ourBans.length + state.theirBans.length;
    const totalPicks = state.ourPicks.length + state.theirPicks.length;

    // Early ban phase (first 3 bans)
    if (totalBans < 6 && totalPicks === 0) {
      return 'early_ban_phase';
    }

    // First pick phase
    if (totalBans === 6 && totalPicks < 6) {
      return 'first_pick_phase';
    }

    // Counter pick phase
    if (totalBans === 10 && totalPicks >= 6 && totalPicks < 10) {
      return 'counter_pick_phase';
    }

    // Final pick phase
    if (totalBans === 10 && totalPicks >= 8) {
      return 'final_pick_phase';
    }

    return null;
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
    this.onlineEngine.updateOpponentModel(champion, phase, round, state);
  }

  /**
   * Train offline strategies
   */
  public async trainOfflineStrategies(availableChampions: Champion[]): Promise<void> {
    console.log('Starting offline CFR training...');
    await this.offlineEngine.trainCommonScenarios(availableChampions);
    console.log('Offline training complete!');
  }

  /**
   * Get online engine
   */
  public getOnlineEngine(): OnlineEngine {
    return this.onlineEngine;
  }

  /**
   * Get offline engine
   */
  public getOfflineEngine(): OfflineEngine {
    return this.offlineEngine;
  }

  /**
   * Reset opponent model
   */
  public resetOpponentModel(): void {
    this.onlineEngine.resetOpponentModel();
  }

  /**
   * Set offline usage threshold
   */
  public setOfflineThreshold(threshold: number): void {
    this.useOfflineThreshold = Math.max(0, Math.min(1, threshold));
  }

  /**
   * Get performance report
   */
  public getPerformanceReport(): void {
    globalPerformanceMonitor.printReport();
  }
}
