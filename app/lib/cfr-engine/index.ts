/**
 * CFR-Based Ban/Pick Engine
 *
 * A game-theory-based decision system for League of Legends Ban/Pick phase
 * using Counterfactual Regret Minimization (CFR) and online learning.
 *
 * @module cfr-engine
 */

// Types
export * from './types';

// Models
export { GameTree } from './models/GameTree';
export { Strategy } from './models/Strategy';
export { OpponentModelManager } from './models/OpponentModel';

// Algorithms
export { BeliefUpdate } from './algorithms/BeliefUpdate';
export { LookaheadSearch } from './algorithms/LookaheadSearch';
export { MCCFRSolver, CFRPlusSolver, LinearCFRSolver } from './algorithms/MCCFRSolver';

// Engines
export { OnlineEngine } from './engines/OnlineEngine';
export { OfflineEngine } from './engines/OfflineEngine';
export { HybridBanPickEngine } from './engines/HybridBanPickEngine';

// Utilities
export { StateAbstraction } from './utils/StateAbstraction';
export { PerformanceMonitor, globalPerformanceMonitor } from './utils/PerformanceMonitor';

/**
 * Quick start example:
 *
 * ```typescript
 * import { HybridBanPickEngine } from '@/lib/cfr-engine';
 *
 * // Create engine
 * const engine = new HybridBanPickEngine();
 *
 * // Train offline strategies (optional, one-time)
 * await engine.trainOfflineStrategies(availableChampions);
 *
 * // Make decisions during draft
 * const result = await engine.makeDecision({
 *   state: currentBPState,
 *   opponentModel: engine.getOnlineEngine().getOpponentModel(),
 *   availableChampions: champions,
 *   useOffline: true,
 *   timeLimit: 500,
 * });
 *
 * console.log(`Recommended action: ${result.action}`);
 * console.log(`Reasoning: ${result.reasoning.join(', ')}`);
 *
 * // Update opponent model after observing their action
 * engine.updateOpponentModel(champion, 'pick', round, state);
 * ```
 */
