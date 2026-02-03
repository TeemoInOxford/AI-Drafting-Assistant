/**
 * Strategy Model
 * Manages CFR strategy profiles and provides strategy queries
 */

import { CFRStrategy, StrategyProfile, InformationSet } from '../types';

export class Strategy {
  private profiles: Map<string, StrategyProfile>;
  private iteration: number;
  private exploitability: number | undefined;

  constructor() {
    this.profiles = new Map();
    this.iteration = 0;
    this.exploitability = undefined;
  }

  /**
   * Initialize strategy from information sets
   */
  public initializeFromInfoSets(infoSets: Map<string, InformationSet>): void {
    for (const [infoSetId, infoSet] of infoSets) {
      const profile: StrategyProfile = {
        infoSetId,
        strategy: this.getUniformStrategy(infoSet.legalActions),
        averageStrategy: new Map(infoSet.legalActions.map(a => [a, 0])),
      };
      this.profiles.set(infoSetId, profile);
    }
  }

  /**
   * Get uniform strategy (equal probability for all actions)
   */
  private getUniformStrategy(actions: string[]): Map<string, number> {
    const prob = 1.0 / actions.length;
    return new Map(actions.map(a => [a, prob]));
  }

  /**
   * Get strategy for an information set
   */
  public getStrategy(infoSetId: string): Map<string, number> {
    const profile = this.profiles.get(infoSetId);
    if (!profile) {
      throw new Error(`No strategy profile for info set ${infoSetId}`);
    }
    return new Map(profile.strategy);
  }

  /**
   * Get average strategy for an information set
   */
  public getAverageStrategy(infoSetId: string): Map<string, number> {
    const profile = this.profiles.get(infoSetId);
    if (!profile) {
      throw new Error(`No strategy profile for info set ${infoSetId}`);
    }
    return new Map(profile.averageStrategy);
  }

  /**
   * Update strategy from regret matching
   */
  public updateStrategy(infoSet: InformationSet): void {
    const profile = this.profiles.get(infoSet.id);
    if (!profile) {
      throw new Error(`No strategy profile for info set ${infoSet.id}`);
    }

    // Regret matching: strategy proportional to positive regrets
    const positiveRegrets = new Map<string, number>();
    let sumPositiveRegret = 0;

    for (const action of infoSet.legalActions) {
      const regret = Math.max(0, infoSet.regretSum.get(action) || 0);
      positiveRegrets.set(action, regret);
      sumPositiveRegret += regret;
    }

    // Update current strategy
    if (sumPositiveRegret > 0) {
      for (const action of infoSet.legalActions) {
        const prob = (positiveRegrets.get(action) || 0) / sumPositiveRegret;
        profile.strategy.set(action, prob);
      }
    } else {
      // If no positive regrets, use uniform strategy
      profile.strategy = this.getUniformStrategy(infoSet.legalActions);
    }

    // Update average strategy (cumulative)
    for (const action of infoSet.legalActions) {
      const currentProb = profile.strategy.get(action) || 0;
      const currentAvg = profile.averageStrategy.get(action) || 0;
      profile.averageStrategy.set(action, currentAvg + currentProb);
    }
  }

  /**
   * Normalize average strategy
   */
  public normalizeAverageStrategy(infoSetId: string): void {
    const profile = this.profiles.get(infoSetId);
    if (!profile) return;

    let sum = 0;
    for (const prob of profile.averageStrategy.values()) {
      sum += prob;
    }

    if (sum > 0) {
      for (const [action, prob] of profile.averageStrategy) {
        profile.averageStrategy.set(action, prob / sum);
      }
    }
  }

  /**
   * Sample action from strategy
   */
  public sampleAction(infoSetId: string, useAverage: boolean = false): string {
    const strategy = useAverage
      ? this.getAverageStrategy(infoSetId)
      : this.getStrategy(infoSetId);

    const actions = Array.from(strategy.keys());
    const probs = Array.from(strategy.values());

    // Cumulative probability sampling
    const rand = Math.random();
    let cumProb = 0;

    for (let i = 0; i < actions.length; i++) {
      cumProb += probs[i];
      if (rand <= cumProb) {
        return actions[i];
      }
    }

    // Fallback to last action
    return actions[actions.length - 1];
  }

  /**
   * Get best action (highest probability)
   */
  public getBestAction(infoSetId: string, useAverage: boolean = false): string {
    const strategy = useAverage
      ? this.getAverageStrategy(infoSetId)
      : this.getStrategy(infoSetId);

    let bestAction = '';
    let bestProb = -1;

    for (const [action, prob] of strategy) {
      if (prob > bestProb) {
        bestProb = prob;
        bestAction = action;
      }
    }

    return bestAction;
  }

  /**
   * Merge another strategy into this one
   */
  public merge(other: CFRStrategy, weight: number = 0.5): void {
    for (const [infoSetId, otherProfile] of other.profiles) {
      const ourProfile = this.profiles.get(infoSetId);

      if (!ourProfile) {
        // If we don't have this info set, just copy it
        this.profiles.set(infoSetId, {
          infoSetId: otherProfile.infoSetId,
          strategy: new Map(otherProfile.strategy),
          averageStrategy: new Map(otherProfile.averageStrategy),
        });
      } else {
        // Weighted merge of average strategies
        for (const [action, otherProb] of otherProfile.averageStrategy) {
          const ourProb = ourProfile.averageStrategy.get(action) || 0;
          const mergedProb = weight * otherProb + (1 - weight) * ourProb;
          ourProfile.averageStrategy.set(action, mergedProb);
        }
      }
    }
  }

  /**
   * Export to CFRStrategy format
   */
  public export(): CFRStrategy {
    return {
      profiles: new Map(this.profiles),
      iteration: this.iteration,
      exploitability: this.exploitability,
    };
  }

  /**
   * Import from CFRStrategy format
   */
  public import(strategy: CFRStrategy): void {
    this.profiles = new Map(strategy.profiles);
    this.iteration = strategy.iteration;
    this.exploitability = strategy.exploitability;
  }

  /**
   * Get all profiles
   */
  public getProfiles(): Map<string, StrategyProfile> {
    return this.profiles;
  }

  /**
   * Set iteration count
   */
  public setIteration(iteration: number): void {
    this.iteration = iteration;
  }

  /**
   * Get iteration count
   */
  public getIteration(): number {
    return this.iteration;
  }

  /**
   * Set exploitability
   */
  public setExploitability(exploitability: number): void {
    this.exploitability = exploitability;
  }

  /**
   * Get exploitability
   */
  public getExploitability(): number | undefined {
    return this.exploitability;
  }

  /**
   * Save to JSON
   */
  public toJSON(): string {
    const data = {
      profiles: Array.from(this.profiles.entries()).map(([id, profile]) => ({
        infoSetId: id,
        strategy: Array.from(profile.strategy.entries()),
        averageStrategy: Array.from(profile.averageStrategy.entries()),
      })),
      iteration: this.iteration,
      exploitability: this.exploitability,
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Load from JSON
   */
  public static fromJSON(json: string): Strategy {
    const data = JSON.parse(json);
    const strategy = new Strategy();

    strategy.iteration = data.iteration;
    strategy.exploitability = data.exploitability;

    for (const profileData of data.profiles) {
      const profile: StrategyProfile = {
        infoSetId: profileData.infoSetId,
        strategy: new Map(profileData.strategy),
        averageStrategy: new Map(profileData.averageStrategy),
      };
      strategy.profiles.set(profile.infoSetId, profile);
    }

    return strategy;
  }
}
