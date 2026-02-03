/**
 * Entropy Utilities (Step 4.2)
 *
 * Canonical entropy calculation functions for evidence attribution.
 * All evidence logic should use these functions to ensure consistency.
 */

import { Position } from './types';

/**
 * Role probability distribution type
 * Maps each position to its probability (0-1)
 */
export type RoleProbabilityMap = Record<Position, number>;

/**
 * Role probability array type (alternative format)
 */
export interface RoleProbabilityEntry {
  role: Position;
  probability: number;
}

/**
 * Number of roles in League of Legends
 */
export const NUM_ROLES = 5;

/**
 * Maximum possible entropy for 5 roles (uniform distribution)
 * H_max = ln(5) ≈ 1.609
 */
export const MAX_ENTROPY = Math.log(NUM_ROLES);

/**
 * Calculate Shannon entropy from role probability distribution
 *
 * H = -Σ p * ln(p) for p > 0
 *
 * @param probabilities - Array of probabilities (must sum to 1)
 * @returns Raw Shannon entropy (0 to ln(5))
 */
export function calculateShannonEntropy(probabilities: number[]): number {
  let entropy = 0;
  for (const p of probabilities) {
    if (p > 0) {
      entropy -= p * Math.log(p);
    }
  }
  return entropy;
}

/**
 * Calculate normalized entropy from role probability distribution
 *
 * H_norm = H / ln(5), range [0, 1]
 * - 0 = single role (no ambiguity)
 * - 1 = uniform distribution (maximum ambiguity)
 *
 * This is the canonical function for evidence attribution.
 *
 * @param distribution - Role probability map or array
 * @returns Normalized entropy [0, 1]
 */
export function calculateNormalizedRoleEntropy(
  distribution: RoleProbabilityMap | RoleProbabilityEntry[] | number[]
): number {
  let probabilities: number[];

  if (Array.isArray(distribution)) {
    if (distribution.length === 0) return 0;

    // Check if it's RoleProbabilityEntry[] or number[]
    if (typeof distribution[0] === 'number') {
      probabilities = distribution as number[];
    } else {
      probabilities = (distribution as RoleProbabilityEntry[]).map(d => d.probability);
    }
  } else {
    // RoleProbabilityMap
    probabilities = Object.values(distribution);
  }

  const rawEntropy = calculateShannonEntropy(probabilities);
  return rawEntropy / MAX_ENTROPY;
}

/**
 * Calculate normalized entropy from posterior object
 * (Format used in weighted-role-posteriors.json role_probabilities)
 *
 * @param posterior - Object with role keys and probability values
 * @returns Normalized entropy [0, 1]
 */
export function calculateEntropyFromPosterior(
  posterior: { top: number; jungle: number; mid: number; bot: number; support: number }
): number {
  const probabilities = [
    posterior.top,
    posterior.jungle,
    posterior.mid,
    posterior.bot,
    posterior.support,
  ];
  return calculateNormalizedRoleEntropy(probabilities);
}

/**
 * Entropy interpretation helper
 *
 * @param normalizedEntropy - H_norm value [0, 1]
 * @returns Human-readable interpretation
 */
export function interpretEntropy(normalizedEntropy: number): string {
  if (normalizedEntropy < 0.2) return 'Single-role dominant';
  if (normalizedEntropy < 0.4) return 'Primary role with minor flex';
  if (normalizedEntropy < 0.6) return 'Moderate flex';
  if (normalizedEntropy < 0.8) return 'High flex';
  return 'Maximum ambiguity';
}
