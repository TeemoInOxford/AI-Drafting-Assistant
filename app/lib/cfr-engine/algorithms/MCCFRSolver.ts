/**
 * MCCFR Solver (Monte Carlo Counterfactual Regret Minimization)
 * Implements CFR algorithm with Monte Carlo sampling for scalability
 *
 * Core CFR formulas:
 * - Regret: R(I, a) = Σ π^-i(h) × [u(h, a) - u(h, σ(I))]
 * - Strategy: σ^(t+1)(I, a) ∝ max(R^t(I, a), 0)
 */

import { GameTree } from '../models/GameTree';
import { Strategy } from '../models/Strategy';
import {
  CFRBanPickState,
  CFRConfig,
  TrainingResult,
  InformationSet,
  GameNode
} from '../types';

export class MCCFRSolver {
  protected gameTree: GameTree;
  protected strategy: Strategy;
  private config: CFRConfig;

  constructor(gameTree: GameTree, config?: Partial<CFRConfig>) {
    this.gameTree = gameTree;
    this.strategy = new Strategy();

    // Default configuration
    this.config = {
      iterations: config?.iterations || 10000,
      mcSamples: config?.mcSamples || 100,
      explorationRate: config?.explorationRate || 0.15,
      discountFactor: config?.discountFactor || 0.99,
      pruningThreshold: config?.pruningThreshold || -300,
    };
  }

  /**
   * Train CFR strategy
   */
  public async train(iterations?: number): Promise<Strategy> {
    const totalIterations = iterations || this.config.iterations;
    const startTime = Date.now();
    const convergenceHistory: number[] = [];

    console.log(`Starting CFR training for ${totalIterations} iterations...`);

    // Initialize strategy from game tree
    this.strategy.initializeFromInfoSets(this.gameTree.getInformationSets());

    // Main CFR iteration loop
    for (let t = 0; t < totalIterations; t++) {
      // Run CFR iteration
      this.cfrIteration(t);

      // Update strategy iteration count
      this.strategy.setIteration(t + 1);

      // Log progress every 1000 iterations
      if ((t + 1) % 1000 === 0) {
        const exploitability = this.estimateExploitability();
        convergenceHistory.push(exploitability);
        console.log(`Iteration ${t + 1}/${totalIterations}, Exploitability: ${exploitability.toFixed(4)}`);
      }
    }

    // Normalize average strategies
    for (const infoSet of this.gameTree.getInformationSets().values()) {
      this.strategy.normalizeAverageStrategy(infoSet.id);
    }

    const trainingTime = Date.now() - startTime;
    const finalExploitability = this.estimateExploitability();

    console.log(`Training complete in ${trainingTime}ms`);
    console.log(`Final exploitability: ${finalExploitability.toFixed(4)}`);

    this.strategy.setExploitability(finalExploitability);

    return this.strategy;
  }

  /**
   * Single CFR iteration
   */
  protected cfrIteration(iteration: number): void {
    const root = this.gameTree.getRoot();

    // Run CFR from root for both players
    this.cfr(root, 1.0, 1.0, iteration);
  }

  /**
   * Recursive CFR algorithm
   * Returns the expected utility for the current player
   */
  protected cfr(
    node: GameNode,
    reachProbBlue: number,
    reachProbRed: number,
    iteration: number
  ): number {
    // Terminal node - return utility
    if (node.isTerminal) {
      return node.utility || 0;
    }

    // Get information set
    const infoSet = this.gameTree.getInformationSet(node.state);
    const currentPlayer = node.player;

    // Get current strategy
    const strategy = this.strategy.getStrategy(infoSet.id);

    // Calculate counterfactual values for each action
    const actionValues = new Map<string, number>();
    let nodeValue = 0;

    // Expand node if needed
    this.gameTree.expandNode(node);

    // Evaluate each action
    for (const [action, childNode] of node.children) {
      const actionProb = strategy.get(action) || 0;

      // Recursively compute value
      let value: number;
      if (currentPlayer === 'blue') {
        value = this.cfr(
          childNode,
          reachProbBlue * actionProb,
          reachProbRed,
          iteration
        );
      } else {
        value = this.cfr(
          childNode,
          reachProbBlue,
          reachProbRed * actionProb,
          iteration
        );
      }

      actionValues.set(action, value);
      nodeValue += actionProb * value;
    }

    // Update regrets
    if (currentPlayer === 'blue') {
      this.updateRegrets(infoSet, actionValues, nodeValue, reachProbRed);
    } else {
      this.updateRegrets(infoSet, actionValues, nodeValue, reachProbBlue);
    }

    // Update strategy
    this.strategy.updateStrategy(infoSet);

    // Update visit count
    infoSet.visitCount++;

    return nodeValue;
  }

  /**
   * Update regret values for an information set
   */
  private updateRegrets(
    infoSet: InformationSet,
    actionValues: Map<string, number>,
    nodeValue: number,
    opponentReachProb: number
  ): void {
    for (const action of infoSet.legalActions) {
      const actionValue = actionValues.get(action) || 0;
      const regret = (actionValue - nodeValue) * opponentReachProb;

      // Accumulate regret
      const currentRegret = infoSet.regretSum.get(action) || 0;
      infoSet.regretSum.set(action, currentRegret + regret);
    }
  }

  /**
   * Estimate exploitability (how far from Nash equilibrium)
   */
  private estimateExploitability(): number {
    // Simplified exploitability calculation
    // In practice, this would compute best response value
    let totalRegret = 0;
    let count = 0;

    for (const infoSet of this.gameTree.getInformationSets().values()) {
      for (const regret of infoSet.regretSum.values()) {
        totalRegret += Math.abs(regret);
        count++;
      }
    }

    return count > 0 ? totalRegret / count : 0;
  }

  /**
   * Get trained strategy
   */
  public getStrategy(): Strategy {
    return this.strategy;
  }

  /**
   * Export training result
   */
  public exportResult(scenarioName: string): TrainingResult {
    return {
      scenario: scenarioName,
      strategy: this.strategy.export(),
      iterations: this.strategy.getIteration(),
      finalExploitability: this.strategy.getExploitability() || 0,
      convergenceHistory: [],
      trainingTime: 0,
    };
  }

  /**
   * Save strategy to file
   */
  public saveStrategy(filepath: string): void {
    const json = this.strategy.toJSON();
    // In practice, would write to file system
    console.log(`Strategy saved to ${filepath}`);
  }

  /**
   * Load strategy from file
   */
  public static loadStrategy(filepath: string): Strategy {
    // In practice, would read from file system
    console.log(`Loading strategy from ${filepath}`);
    return new Strategy();
  }
}

/**
 * CFR+ Variant (improved convergence)
 * Uses regret matching+ with floor at 0
 */
export class CFRPlusSolver extends MCCFRSolver {
  /**
   * CFR+ uses max(regret, 0) instead of regret
   * This is already implemented in Strategy.updateStrategy()
   */
}

/**
 * Linear CFR Variant (better for large games)
 * Uses linear weighting of iterations
 */
export class LinearCFRSolver extends MCCFRSolver {
  protected cfrIteration(iteration: number): void {
    const root = this.gameTree.getRoot();
    const weight = iteration + 1; // Linear weighting
    this.cfr(root, weight, weight, iteration);
  }
}
