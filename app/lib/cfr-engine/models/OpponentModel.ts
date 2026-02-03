/**
 * OpponentModel
 * Tracks opponent behavior and maintains belief distribution over opponent styles
 */

import { Champion } from '../types';
import { OpponentModel, OpponentStyle, CFRBanPickState } from '../types';

export class OpponentModelManager {
  private model: OpponentModel;

  constructor() {
    this.model = this.createInitialModel();
  }

  /**
   * Create initial opponent model with uniform beliefs
   */
  private createInitialModel(): OpponentModel {
    const styles: OpponentStyle[] = [
      'aggressive',
      'defensive',
      'meta_follower',
      'counter_focused',
      'flex_master',
      'unknown',
    ];

    const beliefs = new Map<OpponentStyle, number>();
    const uniformProb = 1.0 / styles.length;

    for (const style of styles) {
      beliefs.set(style, uniformProb);
    }

    return {
      beliefs,
      observedActions: [],
      championPreferences: new Map(),
      rolePreferences: new Map(),
      lastUpdated: Date.now(),
    };
  }

  /**
   * Update model with observed action
   */
  public observeAction(
    champion: Champion,
    phase: 'ban' | 'pick',
    round: number,
    state: CFRBanPickState
  ): void {
    // Record action
    this.model.observedActions.push({ champion, phase, round });

    // Update champion preferences
    const currentCount = this.model.championPreferences.get(champion.id) || 0;
    this.model.championPreferences.set(champion.id, currentCount + 1);

    // Update role preferences
    for (const position of champion.positions) {
      const currentRoleCount = this.model.rolePreferences.get(position) || 0;
      this.model.rolePreferences.set(position, currentRoleCount + 1);
    }

    this.model.lastUpdated = Date.now();
  }

  /**
   * Get current belief distribution
   */
  public getBeliefs(): Map<OpponentStyle, number> {
    return new Map(this.model.beliefs);
  }

  /**
   * Get most likely opponent style
   */
  public getMostLikelyStyle(): OpponentStyle {
    let maxProb = -1;
    let mostLikely: OpponentStyle = 'unknown';

    for (const [style, prob] of this.model.beliefs) {
      if (prob > maxProb) {
        maxProb = prob;
        mostLikely = style;
      }
    }

    return mostLikely;
  }

  /**
   * Get champion preferences (sorted by frequency)
   */
  public getChampionPreferences(): Array<{ championId: string; frequency: number }> {
    const prefs = Array.from(this.model.championPreferences.entries())
      .map(([championId, frequency]) => ({ championId, frequency }))
      .sort((a, b) => b.frequency - a.frequency);

    return prefs;
  }

  /**
   * Get role preferences (sorted by frequency)
   */
  public getRolePreferences(): Array<{ role: string; frequency: number }> {
    const prefs = Array.from(this.model.rolePreferences.entries())
      .map(([role, frequency]) => ({ role, frequency }))
      .sort((a, b) => b.frequency - a.frequency);

    return prefs;
  }

  /**
   * Get observed actions
   */
  public getObservedActions(): Array<{
    champion: Champion;
    phase: 'ban' | 'pick';
    round: number;
  }> {
    return [...this.model.observedActions];
  }

  /**
   * Get observation count
   */
  public getObservationCount(): number {
    return this.model.observedActions.length;
  }

  /**
   * Update beliefs (called by BeliefUpdate algorithm)
   */
  public updateBeliefs(newBeliefs: Map<OpponentStyle, number>): void {
    this.model.beliefs = new Map(newBeliefs);
    this.model.lastUpdated = Date.now();
  }

  /**
   * Reset model
   */
  public reset(): void {
    this.model = this.createInitialModel();
  }

  /**
   * Export model
   */
  public export(): OpponentModel {
    return {
      beliefs: new Map(this.model.beliefs),
      observedActions: [...this.model.observedActions],
      championPreferences: new Map(this.model.championPreferences),
      rolePreferences: new Map(this.model.rolePreferences),
      lastUpdated: this.model.lastUpdated,
    };
  }

  /**
   * Import model
   */
  public import(model: OpponentModel): void {
    this.model = {
      beliefs: new Map(model.beliefs),
      observedActions: [...model.observedActions],
      championPreferences: new Map(model.championPreferences),
      rolePreferences: new Map(model.rolePreferences),
      lastUpdated: model.lastUpdated,
    };
  }

  /**
   * Get confidence in current beliefs
   * Higher confidence when beliefs are concentrated
   */
  public getConfidence(): number {
    // Calculate entropy of belief distribution
    let entropy = 0;
    for (const prob of this.model.beliefs.values()) {
      if (prob > 0) {
        entropy -= prob * Math.log2(prob);
      }
    }

    // Normalize entropy to [0, 1]
    const maxEntropy = Math.log2(this.model.beliefs.size);
    const normalizedEntropy = entropy / maxEntropy;

    // Confidence is inverse of entropy
    return 1 - normalizedEntropy;
  }

  /**
   * Predict next pick probability for a champion
   */
  public predictPickProbability(
    champion: Champion,
    state: CFRBanPickState
  ): number {
    // Simple heuristic based on champion preferences and role needs
    const baseFrequency = this.model.championPreferences.get(champion.id) || 0;
    const totalObservations = this.model.observedActions.length || 1;

    let probability = baseFrequency / totalObservations;

    // Boost probability if role is needed
    const filledRoles = new Set(state.theirPicks.flatMap(c => c.positions));
    const hasUnfilledRole = champion.positions.some(pos => !filledRoles.has(pos));

    if (hasUnfilledRole) {
      probability *= 1.5;
    }

    // Normalize to [0, 1]
    return Math.min(1, probability);
  }

  /**
   * Get style-specific features for a champion
   */
  public getStyleFeatures(champion: Champion): Map<OpponentStyle, number> {
    const features = new Map<OpponentStyle, number>();

    // Aggressive: Prefers carries and assassins
    const isCarry = champion.tags.some(tag =>
      ['Assassin', 'Marksman', 'Fighter'].includes(tag)
    );
    features.set('aggressive', isCarry ? 0.8 : 0.2);

    // Defensive: Prefers tanks and supports
    const isTank = champion.tags.some(tag =>
      ['Tank', 'Support'].includes(tag)
    );
    features.set('defensive', isTank ? 0.8 : 0.2);

    // Meta follower: Would need meta data (placeholder)
    features.set('meta_follower', 0.5);

    // Counter focused: Would need matchup data (placeholder)
    features.set('counter_focused', 0.5);

    // Flex master: Prefers multi-role champions
    const isFlexible = champion.positions.length >= 2;
    features.set('flex_master', isFlexible ? 0.8 : 0.2);

    // Unknown: Neutral
    features.set('unknown', 0.5);

    return features;
  }
}
