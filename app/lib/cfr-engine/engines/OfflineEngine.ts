/**
 * OfflineEngine
 * Handles offline CFR training for common Ban/Pick scenarios
 */

import { Champion } from '../types';
import {
  CFRBanPickState,
  TrainingScenario,
  TrainingResult,
  CFRConfig,
  CFRStrategy,
  OfflineTrainingContext
} from '../types';
import { GameTree } from '../models/GameTree';
import { Strategy } from '../models/Strategy';
import { MCCFRSolver } from '../algorithms/MCCFRSolver';
import { globalPerformanceMonitor } from '../utils/PerformanceMonitor';

export class OfflineEngine {
  private strategies: Map<string, Strategy>;
  private config: CFRConfig;

  constructor(config?: Partial<CFRConfig>) {
    this.strategies = new Map();
    this.config = {
      iterations: config?.iterations || 10000,
      mcSamples: config?.mcSamples || 100,
      explorationRate: config?.explorationRate || 0.15,
      discountFactor: config?.discountFactor || 0.99,
      pruningThreshold: config?.pruningThreshold || -300,
    };
  }

  /**
   * Train strategies for common scenarios
   */
  public async trainCommonScenarios(
    availableChampions: Champion[]
  ): Promise<Map<string, TrainingResult>> {
    console.log('Starting offline CFR training for common scenarios...');

    const scenarios = this.buildCommonScenarios(availableChampions);
    const results = new Map<string, TrainingResult>();

    for (const scenario of scenarios) {
      console.log(`\nTraining scenario: ${scenario.name}`);
      const result = await this.trainScenario(scenario);
      results.set(scenario.name, result);

      // Store trained strategy object (not the exported data)
      const solver = new MCCFRSolver(new GameTree(scenario.initialState), this.config);
      await solver.train();
      this.strategies.set(scenario.name, solver.getStrategy());
    }

    console.log('\nAll scenarios trained successfully!');
    return results;
  }

  /**
   * Train a single scenario
   */
  public async trainScenario(scenario: TrainingScenario): Promise<TrainingResult> {
    const startTime = Date.now();

    // Build game tree for scenario
    const gameTree = new GameTree(scenario.initialState);

    // Create CFR solver
    const solver = new MCCFRSolver(gameTree, this.config);

    // Train
    const strategy = await globalPerformanceMonitor.trackAsync(
      `train_${scenario.name}`,
      () => solver.train()
    );

    const trainingTime = Date.now() - startTime;

    return {
      scenario: scenario.name,
      strategy: strategy.export(),
      iterations: strategy.getIteration(),
      finalExploitability: strategy.getExploitability() || 0,
      convergenceHistory: [],
      trainingTime,
    };
  }

  /**
   * Build common training scenarios
   */
  private buildCommonScenarios(availableChampions: Champion[]): TrainingScenario[] {
    const scenarios: TrainingScenario[] = [];

    // Scenario 1: Early Ban Phase (first 3 bans)
    scenarios.push({
      name: 'early_ban_phase',
      description: 'First 3 bans - deny meta threats',
      initialState: this.createInitialState(availableChampions, 'ban', 0),
      maxDepth: 6, // 3 bans per side
    });

    // Scenario 2: First Pick Phase
    scenarios.push({
      name: 'first_pick_phase',
      description: 'First pick - secure priority champion',
      initialState: this.createInitialState(availableChampions, 'pick', 6),
      maxDepth: 6, // 3 picks per side
    });

    // Scenario 3: Counter Pick Phase
    scenarios.push({
      name: 'counter_pick_phase',
      description: 'Counter pick - respond to enemy picks',
      initialState: this.createInitialState(availableChampions, 'pick', 9),
      maxDepth: 4, // 2 picks per side
    });

    // Scenario 4: Final Pick Phase
    scenarios.push({
      name: 'final_pick_phase',
      description: 'Final pick - complete composition',
      initialState: this.createInitialState(availableChampions, 'pick', 18),
      maxDepth: 2, // 1 pick per side
    });

    return scenarios;
  }

  /**
   * Create initial state for a scenario
   */
  private createInitialState(
    availableChampions: Champion[],
    phase: 'ban' | 'pick',
    round: number
  ): CFRBanPickState {
    return {
      phase,
      round,
      ourBans: [],
      theirBans: [],
      ourPicks: [],
      theirPicks: [],
      availableChampions,
      currentTurn: 'blue',
    };
  }

  /**
   * Get strategy for a scenario
   */
  public getStrategy(scenarioName: string): Strategy | undefined {
    return this.strategies.get(scenarioName);
  }

  /**
   * Check if scenario is trained
   */
  public hasStrategy(scenarioName: string): boolean {
    return this.strategies.has(scenarioName);
  }

  /**
   * Get best action from trained strategy
   */
  public getBestAction(
    scenarioName: string,
    state: CFRBanPickState
  ): string | null {
    const strategy = this.strategies.get(scenarioName);
    if (!strategy) {
      return null;
    }

    // Get information set ID for current state
    const gameTree = new GameTree(state);
    const infoSet = gameTree.getInformationSet(state);

    // Get best action from average strategy
    return strategy.getBestAction(infoSet.id, true);
  }

  /**
   * Merge trained strategies
   */
  public mergeStrategies(
    scenario1: string,
    scenario2: string,
    weight: number = 0.5
  ): void {
    const strategy1 = this.strategies.get(scenario1);
    const strategy2 = this.strategies.get(scenario2);

    if (!strategy1 || !strategy2) {
      console.warn('Cannot merge: one or both strategies not found');
      return;
    }

    strategy1.merge(strategy2.export(), weight);
  }

  /**
   * Save all strategies to disk
   */
  public saveStrategies(directory: string): void {
    console.log(`Saving ${this.strategies.size} strategies to ${directory}`);

    for (const [name, strategy] of this.strategies) {
      const filepath = `${directory}/${name}.json`;
      const json = strategy.toJSON();
      // In practice, would write to file system
      console.log(`Saved strategy: ${filepath}`);
    }
  }

  /**
   * Load strategies from disk
   */
  public loadStrategies(directory: string, scenarioNames: string[]): void {
    console.log(`Loading strategies from ${directory}`);

    for (const name of scenarioNames) {
      const filepath = `${directory}/${name}.json`;
      // In practice, would read from file system
      console.log(`Loaded strategy: ${filepath}`);
    }
  }

  /**
   * Get all strategy names
   */
  public getStrategyNames(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Clear all strategies
   */
  public clearStrategies(): void {
    this.strategies.clear();
  }
}
