/**
 * Core type definitions for CFR-based Ban/Pick Engine
 */

import { Champion, Team, BPState } from '../types';

// Re-export types for use in CFR engine modules
export type { Champion, Team };

// ============================================================================
// Game State Types
// ============================================================================

export interface CFRBanPickState {
  phase: 'ban' | 'pick';
  round: number;
  ourBans: Champion[];
  theirBans: Champion[];
  ourPicks: Champion[];
  theirPicks: Champion[];
  availableChampions: Champion[];
  currentTurn: Team;
}

export interface GameNode {
  state: CFRBanPickState;
  player: Team;
  isTerminal: boolean;
  utility?: number;
  children: Map<string, GameNode>; // action -> child node
}

// ============================================================================
// Information Set Types
// ============================================================================

export interface InformationSet {
  id: string;
  player: Team;
  state: CFRBanPickState;
  legalActions: string[]; // champion IDs
  regretSum: Map<string, number>; // action -> cumulative regret
  strategySum: Map<string, number>; // action -> cumulative strategy
  visitCount: number;
}

// ============================================================================
// Strategy Types
// ============================================================================

export interface StrategyProfile {
  infoSetId: string;
  strategy: Map<string, number>; // action -> probability
  averageStrategy: Map<string, number>; // action -> average probability
}

export interface CFRStrategy {
  profiles: Map<string, StrategyProfile>; // infoSetId -> profile
  iteration: number;
  exploitability?: number;
}

// ============================================================================
// Opponent Model Types
// ============================================================================

export type OpponentStyle =
  | 'aggressive'      // Prioritizes carry champions
  | 'defensive'       // Prioritizes tanks/supports
  | 'meta_follower'   // Follows version strength
  | 'counter_focused' // Prefers counter picks
  | 'flex_master'     // Prefers multi-role champions
  | 'unknown';        // Insufficient data

export interface OpponentBelief {
  style: OpponentStyle;
  probability: number;
}

export interface OpponentModel {
  beliefs: Map<OpponentStyle, number>; // style -> probability
  observedActions: Array<{
    champion: Champion;
    phase: 'ban' | 'pick';
    round: number;
  }>;
  championPreferences: Map<string, number>; // championId -> frequency
  rolePreferences: Map<string, number>; // role -> frequency
  lastUpdated: number;
}

// ============================================================================
// Search Types
// ============================================================================

export interface SearchNode {
  state: CFRBanPickState;
  action: string | null; // champion ID or null for root
  parent: SearchNode | null;
  children: SearchNode[];
  visits: number;
  value: number;
  depth: number;
}

export interface LookaheadResult {
  bestAction: string; // champion ID
  expectedValue: number;
  searchTree: SearchNode;
  evaluatedActions: Map<string, number>; // action -> value
  confidence: number;
}

// ============================================================================
// CFR Training Types
// ============================================================================

export interface CFRConfig {
  iterations: number;
  mcSamples: number;
  explorationRate: number;
  discountFactor: number;
  pruningThreshold: number;
}

export interface TrainingScenario {
  name: string;
  description: string;
  initialState: CFRBanPickState;
  maxDepth: number;
}

export interface TrainingResult {
  scenario: string;
  strategy: CFRStrategy;
  iterations: number;
  finalExploitability: number;
  convergenceHistory: number[];
  trainingTime: number;
}

// ============================================================================
// Engine Types
// ============================================================================

export interface OnlineDecisionContext {
  state: CFRBanPickState;
  opponentModel: OpponentModel;
  availableChampions: Champion[];
  timeLimit: number; // milliseconds
  lookaheadDepth: number;
}

export interface OnlineDecisionResult {
  action: string; // champion ID
  value: number;
  reasoning: string[];
  confidence: number;
  alternativeActions: Array<{
    action: string;
    value: number;
    reason: string;
  }>;
  computeTime: number;
}

export interface OfflineTrainingContext {
  scenarios: TrainingScenario[];
  config: CFRConfig;
  parallelWorkers: number;
}

export interface HybridDecisionContext {
  state: CFRBanPickState;
  opponentModel: OpponentModel;
  availableChampions: Champion[];
  offlineStrategy?: CFRStrategy;
  useOffline: boolean;
  timeLimit: number;
}

export interface HybridDecisionResult {
  action: string;
  value: number;
  source: 'offline' | 'online' | 'hybrid';
  reasoning: string[];
  confidence: number;
  offlineContribution?: number;
  onlineContribution?: number;
  computeTime: number;
}

// ============================================================================
// Abstraction Types
// ============================================================================

export type ChampionTier = 'S' | 'A' | 'B' | 'C' | 'D';
export type CompositionType = 'poke' | 'teamfight' | 'splitpush' | 'pick' | 'siege' | 'balanced';

export interface AbstractedChampion {
  tier: ChampionTier;
  roles: string[];
  primaryRole: string;
  tags: string[];
  flexValue: number; // 0-1, how flexible the champion is
}

export interface AbstractedState {
  phase: 'early_ban' | 'early_pick' | 'mid_ban' | 'mid_pick' | 'late_ban' | 'late_pick';
  ourComposition: CompositionType;
  theirComposition: CompositionType;
  ourRolesFilled: Set<string>;
  theirRolesFilled: Set<string>;
  ourTierDistribution: Map<ChampionTier, number>;
  theirTierDistribution: Map<ChampionTier, number>;
  priorityChampionsRemaining: number;
}

// ============================================================================
// Performance Monitoring Types
// ============================================================================

export interface PerformanceMetrics {
  operationName: string;
  startTime: number;
  endTime: number;
  duration: number;
  memoryUsed?: number;
  metadata?: Record<string, any>;
}

export interface PerformanceReport {
  totalOperations: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
  operations: PerformanceMetrics[];
}

// ============================================================================
// Utility Types
// ============================================================================

export interface BeliefUpdateParams {
  priorBeliefs: Map<OpponentStyle, number>;
  observedAction: {
    champion: Champion;
    phase: 'ban' | 'pick';
    context: CFRBanPickState;
  };
  learningRate: number;
}

export interface BeliefUpdateResult {
  posteriorBeliefs: Map<OpponentStyle, number>;
  likelihood: Map<OpponentStyle, number>;
  surpriseScore: number; // How unexpected was this action?
  confidence: number;
}
