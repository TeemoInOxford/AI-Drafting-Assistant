/**
 * GameTree Model
 * Represents the game tree for Ban/Pick phase
 */

import { Champion, Team } from '../types';
import { CFRBanPickState, GameNode, InformationSet } from '../types';

export class GameTree {
  private root: GameNode;
  private infoSets: Map<string, InformationSet>;
  private nodeCount: number;

  constructor(initialState: CFRBanPickState) {
    this.root = this.createNode(initialState, null);
    this.infoSets = new Map();
    this.nodeCount = 1;
  }

  /**
   * Create a new game node
   */
  private createNode(state: CFRBanPickState, parent: GameNode | null): GameNode {
    const isTerminal = this.isTerminalState(state);

    return {
      state,
      player: state.currentTurn,
      isTerminal,
      utility: isTerminal ? this.evaluateTerminalState(state) : undefined,
      children: new Map(),
    };
  }

  /**
   * Check if state is terminal (all picks/bans complete)
   */
  private isTerminalState(state: CFRBanPickState): boolean {
    // Standard LoL draft: 6 bans + 5 picks per side
    const totalBans = state.ourBans.length + state.theirBans.length;
    const totalPicks = state.ourPicks.length + state.theirPicks.length;

    return totalBans >= 10 && totalPicks >= 10;
  }

  /**
   * Evaluate terminal state utility
   * Positive = good for 'blue', negative = good for 'red'
   */
  private evaluateTerminalState(state: CFRBanPickState): number {
    // Simple heuristic: sum of champion strengths
    // In practice, this would use composition analysis
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

    return ourStrength - theirStrength;
  }

  /**
   * Get champion strength (placeholder)
   */
  private getChampionStrength(champion: Champion): number {
    // Placeholder - would integrate with existing stats system
    return 50; // Neutral strength
  }

  /**
   * Expand node by generating all legal actions
   */
  public expandNode(node: GameNode): void {
    if (node.isTerminal || node.children.size > 0) {
      return;
    }

    const legalActions = this.getLegalActions(node.state);

    for (const action of legalActions) {
      const childState = this.applyAction(node.state, action);
      const childNode = this.createNode(childState, node);
      node.children.set(action, childNode);
      this.nodeCount++;
    }
  }

  /**
   * Get legal actions (available champions)
   */
  private getLegalActions(state: CFRBanPickState): string[] {
    return state.availableChampions.map(c => c.id);
  }

  /**
   * Apply action to state (immutable)
   */
  private applyAction(state: CFRBanPickState, championId: string): CFRBanPickState {
    const champion = state.availableChampions.find(c => c.id === championId);
    if (!champion) {
      throw new Error(`Champion ${championId} not available`);
    }

    const newState: CFRBanPickState = {
      ...state,
      availableChampions: state.availableChampions.filter(c => c.id !== championId),
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
   * Get or create information set for a state
   */
  public getInformationSet(state: CFRBanPickState): InformationSet {
    const infoSetId = this.getInformationSetId(state);

    if (!this.infoSets.has(infoSetId)) {
      const legalActions = this.getLegalActions(state);
      const infoSet: InformationSet = {
        id: infoSetId,
        player: state.currentTurn,
        state,
        legalActions,
        regretSum: new Map(legalActions.map(a => [a, 0])),
        strategySum: new Map(legalActions.map(a => [a, 0])),
        visitCount: 0,
      };
      this.infoSets.set(infoSetId, infoSet);
    }

    return this.infoSets.get(infoSetId)!;
  }

  /**
   * Generate information set ID
   * Information sets group states that are indistinguishable to the player
   */
  private getInformationSetId(state: CFRBanPickState): string {
    // For Ban/Pick, information is complete, so each state is its own info set
    // In practice, we might abstract similar states together
    const parts = [
      state.phase,
      state.round,
      state.currentTurn,
      state.ourBans.map(c => c.id).sort().join(','),
      state.theirBans.map(c => c.id).sort().join(','),
      state.ourPicks.map(c => c.id).sort().join(','),
      state.theirPicks.map(c => c.id).sort().join(','),
    ];

    return parts.join('|');
  }

  /**
   * Get root node
   */
  public getRoot(): GameNode {
    return this.root;
  }

  /**
   * Get all information sets
   */
  public getInformationSets(): Map<string, InformationSet> {
    return this.infoSets;
  }

  /**
   * Get node count
   */
  public getNodeCount(): number {
    return this.nodeCount;
  }

  /**
   * Traverse tree depth-first
   */
  public* traverseDepthFirst(node: GameNode = this.root): Generator<GameNode> {
    yield node;

    for (const child of node.children.values()) {
      yield* this.traverseDepthFirst(child);
    }
  }

  /**
   * Get path from root to node
   */
  public getPath(node: GameNode): string[] {
    const path: string[] = [];
    let current = node;

    // This is simplified - in practice we'd track parent pointers
    // For now, return empty path
    return path;
  }
}
