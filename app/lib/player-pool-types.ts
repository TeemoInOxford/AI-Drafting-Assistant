/**
 * Player Pool Types
 *
 * Step 5: Player Champion Pool Layer
 */

/**
 * Champion pool entry for a player
 */
export interface ChampionPoolEntry {
  championId: string;
  championName: string;
  // Pick stats
  gamesPlayed: number;
  pickCount: number;
  pickRateWithinPlayer: number;
  pickRateLowerBound: number;
  // Win stats
  wins: number;
  winRate: number;
  winRateLowerBound: number;
  winRateUncertainty: number;
  // Ban-against stats
  banAgainstCount: number;
  banAgainstRate: number;
  banAgainstLowerBound: number;
  // Derived score
  poolStrengthScore: number;
  // Explanatory notes
  notes: string[];
}

/**
 * Player's champion pool
 */
export interface PlayerPool {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  totalGames: number;
  totalPicks: number;
  uniqueChampions: number;
  champions: ChampionPoolEntry[];
}

/**
 * Metadata for player pools dataset
 */
export interface PlayerPoolsMeta {
  generatedAt: string;
  totalPlayers: number;
  totalGames: number;
  // Calibration parameters
  dirichletAlpha: number;
  betaPriorStrength: number;
  globalWinRate: number;
  // Percentile calibration
  scoreP50: number;
  scoreP75: number;
  scoreP90: number;
  scoreP95: number;
  scoreP99: number;
}

/**
 * Pool strength tier based on percentile calibration
 */
export type PoolStrengthTier = 'signature' | 'strong' | 'moderate' | 'occasional';

/**
 * Get pool strength tier from score
 *
 * Tiers based on percentile calibration:
 * - signature: score >= 90 (top ~10%)
 * - strong: score >= 75 (top ~25%)
 * - moderate: score >= 50 (top ~50%)
 * - occasional: score < 50
 */
export function getPoolStrengthTier(score: number): PoolStrengthTier {
  if (score >= 90) return 'signature';
  if (score >= 75) return 'strong';
  if (score >= 50) return 'moderate';
  return 'occasional';
}

/**
 * Get color class for pool strength tier
 */
export function getPoolStrengthColor(tier: PoolStrengthTier): string {
  switch (tier) {
    case 'signature':
      return 'text-red-400 bg-red-500/20 border-red-500/50';
    case 'strong':
      return 'text-orange-400 bg-orange-500/20 border-orange-500/50';
    case 'moderate':
      return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/50';
    case 'occasional':
      return 'text-gray-400 bg-gray-500/20 border-gray-500/50';
  }
}

/**
 * Get tier label
 */
export function getPoolStrengthLabel(tier: PoolStrengthTier): string {
  switch (tier) {
    case 'signature':
      return 'SIGNATURE';
    case 'strong':
      return 'STRONG';
    case 'moderate':
      return 'MODERATE';
    case 'occasional':
      return 'OCCASIONAL';
  }
}
