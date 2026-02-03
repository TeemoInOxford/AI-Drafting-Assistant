/**
 * StateAbstraction Utility
 * Reduces state space complexity by abstracting similar states
 */

import { Champion } from '../types';
import {
  CFRBanPickState,
  ChampionTier,
  CompositionType,
  AbstractedChampion,
  AbstractedState
} from '../types';

export class StateAbstraction {
  /**
   * Abstract a champion to reduce state space
   */
  public static abstractChampion(champion: Champion): AbstractedChampion {
    return {
      tier: this.getChampionTier(champion),
      roles: champion.positions,
      primaryRole: champion.positions[0] || 'mid',
      tags: champion.tags,
      flexValue: champion.positions.length / 5, // Normalized flex value
    };
  }

  /**
   * Get champion tier based on strength (placeholder)
   */
  private static getChampionTier(champion: Champion): ChampionTier {
    // Placeholder - would integrate with champion stats
    // For now, return 'A' tier for all
    return 'A';
  }

  /**
   * Abstract a full game state
   */
  public static abstractState(state: CFRBanPickState): AbstractedState {
    const phase = this.getAbstractPhase(state);
    const ourComposition = this.inferCompositionType(state.ourPicks);
    const theirComposition = this.inferCompositionType(state.theirPicks);
    const ourRolesFilled = this.getRolesFilled(state.ourPicks);
    const theirRolesFilled = this.getRolesFilled(state.theirPicks);
    const ourTierDistribution = this.getTierDistribution(state.ourPicks);
    const theirTierDistribution = this.getTierDistribution(state.theirPicks);
    const priorityChampionsRemaining = this.countPriorityChampions(state.availableChampions);

    return {
      phase,
      ourComposition,
      theirComposition,
      ourRolesFilled,
      theirRolesFilled,
      ourTierDistribution,
      theirTierDistribution,
      priorityChampionsRemaining,
    };
  }

  /**
   * Get abstract phase
   */
  private static getAbstractPhase(state: CFRBanPickState):
    'early_ban' | 'early_pick' | 'mid_ban' | 'mid_pick' | 'late_ban' | 'late_pick' {
    const totalBans = state.ourBans.length + state.theirBans.length;
    const totalPicks = state.ourPicks.length + state.theirPicks.length;

    if (totalBans < 6) return 'early_ban';
    if (totalPicks < 3) return 'early_pick';
    if (totalBans < 10) return 'mid_ban';
    if (totalPicks < 8) return 'mid_pick';
    if (totalBans < 10) return 'late_ban';
    return 'late_pick';
  }

  /**
   * Infer composition type from picks
   */
  private static inferCompositionType(picks: Champion[]): CompositionType {
    if (picks.length === 0) return 'balanced';

    // Simple heuristic based on champion tags
    const tags = picks.flatMap(c => c.tags);
    const tagCounts = new Map<string, number>();

    for (const tag of tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }

    // Determine composition type
    if ((tagCounts.get('Marksman') || 0) >= 2) return 'poke';
    if ((tagCounts.get('Tank') || 0) >= 2) return 'teamfight';
    if ((tagCounts.get('Fighter') || 0) >= 2) return 'splitpush';
    if ((tagCounts.get('Assassin') || 0) >= 2) return 'pick';
    if ((tagCounts.get('Mage') || 0) >= 2) return 'siege';

    return 'balanced';
  }

  /**
   * Get filled roles
   */
  private static getRolesFilled(picks: Champion[]): Set<string> {
    const roles = new Set<string>();
    for (const champ of picks) {
      for (const pos of champ.positions) {
        roles.add(pos);
      }
    }
    return roles;
  }

  /**
   * Get tier distribution
   */
  private static getTierDistribution(picks: Champion[]): Map<ChampionTier, number> {
    const distribution = new Map<ChampionTier, number>();
    const tiers: ChampionTier[] = ['S', 'A', 'B', 'C', 'D'];

    for (const tier of tiers) {
      distribution.set(tier, 0);
    }

    for (const champ of picks) {
      const tier = this.getChampionTier(champ);
      distribution.set(tier, (distribution.get(tier) || 0) + 1);
    }

    return distribution;
  }

  /**
   * Count priority champions (S/A tier)
   */
  private static countPriorityChampions(champions: Champion[]): number {
    let count = 0;
    for (const champ of champions) {
      const tier = this.getChampionTier(champ);
      if (tier === 'S' || tier === 'A') {
        count++;
      }
    }
    return count;
  }

  /**
   * Check if two states are similar enough to be abstracted together
   */
  public static areStatesSimilar(
    state1: CFRBanPickState,
    state2: CFRBanPickState,
    threshold: number = 0.8
  ): boolean {
    const abs1 = this.abstractState(state1);
    const abs2 = this.abstractState(state2);

    // Compare abstracted states
    let similarity = 0;
    let totalChecks = 0;

    // Phase similarity
    if (abs1.phase === abs2.phase) similarity++;
    totalChecks++;

    // Composition similarity
    if (abs1.ourComposition === abs2.ourComposition) similarity++;
    if (abs1.theirComposition === abs2.theirComposition) similarity++;
    totalChecks += 2;

    // Role coverage similarity
    const roleOverlap = this.setOverlap(abs1.ourRolesFilled, abs2.ourRolesFilled);
    similarity += roleOverlap;
    totalChecks++;

    return (similarity / totalChecks) >= threshold;
  }

  /**
   * Calculate set overlap (Jaccard similarity)
   */
  private static setOverlap(set1: Set<string>, set2: Set<string>): number {
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Generate abstract state ID for grouping
   */
  public static getAbstractStateId(state: CFRBanPickState): string {
    const abs = this.abstractState(state);

    return [
      abs.phase,
      abs.ourComposition,
      abs.theirComposition,
      Array.from(abs.ourRolesFilled).sort().join(','),
      Array.from(abs.theirRolesFilled).sort().join(','),
    ].join('|');
  }
}
