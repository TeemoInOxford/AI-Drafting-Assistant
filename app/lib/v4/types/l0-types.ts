/**
 * v4-1 L0 Data Layer Types
 *
 * All L0 data includes confidence scores based on sample size and data quality.
 */

import { Position } from '../../types';
import { ScoredValue } from './common-types';

// ============ Champion Statistics ============

/**
 * Champion statistics with confidence
 * Generated from historical match data
 */
export interface ChampionStats {
  championId: string;

  // Core statistics
  pickRate: number;      // 0-1: picks / total games
  banRate: number;       // 0-1: bans / total games
  winRate: number;       // 0-1: wins / picks

  // Role distribution
  roleDistribution: Record<Position, number>;  // 0-1: probability per role

  // Data quality indicators
  sampleSize: number;           // Total games in sample
  timeDecayWeight: number;      // 0-1: recency weight
  confidence: number;           // 0-1: overall confidence

  // Metadata
  lastUpdated: Date;
  patchVersion?: string;
}

// ============ Player Champion Pools ============

/**
 * Player champion pool with frequency distribution
 * Extracted from historical player picks
 */
export interface PlayerPool {
  playerId: string;

  // Champion frequencies
  championFrequencies: Record<string, number>;  // championId -> frequency (0-1)

  // Recent picks (last 20 games)
  recentPicks: string[];  // championIds in chronological order

  // Data quality
  totalGames: number;
  uniqueChampions: number;
  confidence: number;  // 0-1: based on sample size

  // Metadata
  lastUpdated: Date;
}

// ============ Champion Relations ============

/**
 * Counter relationship types
 * - Hard: Strong statistical counter (WR < 40%)
 * - Soft: Moderate counter (WR 40-45%)
 * - Meta: Meta-dependent counter (WR 45-50%)
 */
export type CounterType = 'Hard' | 'Soft' | 'Meta';

/**
 * Counter relationship between two champions
 * Based on head-to-head matchup data
 */
export interface CounterRelation {
  championA: string;  // The champion
  championB: string;  // The counter

  type: CounterType;
  score: number;      // 0-1: counter strength (1 = hard counter)
  confidence: number; // 0-1: based on sample size

  // Supporting data
  matchupWinRate: number;  // championA win rate vs championB
  sampleSize: number;      // Number of matchups

  // Metadata
  lastUpdated: Date;
}

/**
 * Synergy relationship types
 * - Hard: Strong statistical synergy (WR delta > 10%)
 * - Soft: Moderate synergy (WR delta 5-10%)
 * - Meta: Meta-dependent synergy (WR delta < 5%)
 */
export type SynergyType = 'Hard' | 'Soft' | 'Meta';

/**
 * Synergy relationship between two champions
 * Based on win rate when paired together
 */
export interface SynergyRelation {
  championA: string;
  championB: string;

  type: SynergyType;
  score: number;      // 0-1: synergy strength (1 = strong synergy)
  confidence: number; // 0-1: based on sample size

  // Supporting data
  pairWinRate: number;      // Win rate when paired
  baselineWinRate: number;  // Expected win rate
  winRateDelta: number;     // pairWinRate - baselineWinRate
  sampleSize: number;       // Number of games paired

  // Metadata
  lastUpdated: Date;
}

// ============ BP History ============

/**
 * Historical BP action with context
 */
export interface BPAction {
  type: 'ban' | 'pick';
  championId: string;
  team: 'blue' | 'red';
  turn: number;
  phase: 'ban1' | 'pick1' | 'ban2' | 'pick2';
}

/**
 * Historical BP sequence from a single game
 */
export interface BPSequence {
  gameId: string;
  seriesId: string;
  tournamentId: string;

  // BP actions in order
  actions: BPAction[];

  // Game outcome
  winner: 'blue' | 'red';

  // Context
  patchVersion?: string;
  gameDate: Date;

  // Teams and players
  blueTeamId?: string;
  redTeamId?: string;
  playerIds?: string[];
}

// ============ L0 Data Cache ============

/**
 * Cached L0 data for fast access
 * TTL: 2 hours
 */
export interface L0DataCache {
  // Champion data
  championStats: Map<string, ChampionStats>;

  // Player data
  playerPools: Map<string, PlayerPool>;

  // Relation matrices
  synergyMatrix: Map<string, SynergyRelation[]>;  // championId -> synergies
  counterMatrix: Map<string, CounterRelation[]>;  // championId -> counters

  // BP history
  bpSequences: BPSequence[];

  // Cache metadata
  generatedAt: Date;
  expiresAt: Date;
  version: string;
}

// ============ L0 Configuration ============

/**
 * Configuration for L0 data generation
 */
export interface L0Config {
  // Sample size thresholds
  minChampionGames: number;      // Default: 10
  minPlayerGames: number;        // Default: 5
  minPairings: number;           // Default: 10
  minMatchups: number;           // Default: 10

  // Confidence parameters
  confidenceThreshold: number;   // Default: 50
  confidenceSteepness: number;   // Default: 0.1

  // Time decay parameters
  timeDecayHalfLife: number;     // Default: 30 days

  // Cache settings
  cacheTTL: number;              // Default: 2 hours (in ms)

  // Data filters
  patchVersion?: string;         // Filter by patch
  tournamentIds?: string[];      // Filter by tournaments
  minDate?: Date;                // Filter by date
}

/**
 * Default L0 configuration
 */
export const DEFAULT_L0_CONFIG: L0Config = {
  minChampionGames: 10,
  minPlayerGames: 5,
  minPairings: 10,
  minMatchups: 10,
  confidenceThreshold: 50,
  confidenceSteepness: 0.1,
  timeDecayHalfLife: 30,
  cacheTTL: 2 * 60 * 60 * 1000,  // 2 hours
};
