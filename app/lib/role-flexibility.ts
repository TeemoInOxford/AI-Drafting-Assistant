/**
 * Role Flexibility UI Helpers
 *
 * This module provides UI transformation utilities for role probability data.
 * All role probabilities come from weighted-role-posteriors.json via the loader.
 *
 * Data flow:
 *   weighted-role-posteriors.json → loadWeightedRolePosteriors() → ChampionRolePosterior
 *   → toRoleFlexibilityDistribution() → RoleFlexibilityDistribution (UI)
 *
 * This module does NOT:
 * - Load or parse raw data (use weighted-role-loader.ts)
 * - Infer or predict roles (roles are observed values in the source data)
 * - Calculate posteriors (already computed in the JSON)
 */

import { Position } from './types';
import type { ChampionRolePosterior, RoleDistribution, RoleCounts, Role } from './weighted-role-types';

// ============================================================================
// Type Definitions (for UI consumption)
// ============================================================================

export interface RoleFlexibilityDistribution {
  championId: string;       // GRID UUID (from ChampionRolePosterior.champion_id)
  championName: string;     // Display name
  distribution: RoleProbability[];
  rawCountsByRole: RoleCounts;
  isFlexPick: boolean;
  primaryRole: Position;
  flexibilityScore: number;
  effectiveSampleSize: number;
  significantRoles: Role[];
}

export interface RoleProbability {
  role: Position;
  probability: number;
  source: 'weighted';
  isViable: boolean;
}

export interface RoleFlexibilityConfig {
  minDisplayThreshold: number;
}

export const DEFAULT_FLEXIBILITY_CONFIG: RoleFlexibilityConfig = {
  minDisplayThreshold: 0.05,
};

const ALL_POSITIONS: Position[] = ['top', 'jungle', 'mid', 'bot', 'support'];

// ============================================================================
// Transformation Functions
// ============================================================================

/**
 * Convert ChampionRolePosterior to RoleFlexibilityDistribution for UI rendering.
 * This is a pure transformation - no data loading or calculation.
 */
export function toRoleFlexibilityDistribution(
  posterior: ChampionRolePosterior,
  filledRoles: Position[] = []
): RoleFlexibilityDistribution {
  // Build distribution array from role_probabilities
  const distribution: RoleProbability[] = ALL_POSITIONS.map(role => ({
    role,
    probability: posterior.role_probabilities[role] || 0,
    source: 'weighted' as const,
    isViable: !filledRoles.includes(role),
  }));

  // Sort by probability descending
  distribution.sort((a, b) => b.probability - a.probability);

  // Primary role is the highest probability role
  const primaryRole = distribution[0].role;

  return {
    championId: posterior.champion_id,
    championName: posterior.champion_name,
    distribution,
    rawCountsByRole: posterior.raw_counts_by_role,
    isFlexPick: posterior.isFlexPick,
    primaryRole,
    flexibilityScore: posterior.flexibilityScore,
    effectiveSampleSize: posterior.effective_sample_size,
    significantRoles: posterior.significantRoles,
  };
}

/**
 * Get primary role from role probabilities (argmax)
 */
export function getPrimaryRoleFromDistribution(probs: RoleDistribution): Position {
  let maxProb = -1;
  let maxRole: Position = 'mid';
  for (const role of ALL_POSITIONS) {
    if (probs[role] > maxProb) {
      maxProb = probs[role];
      maxRole = role;
    }
  }
  return maxRole;
}

/**
 * Update role flexibility based on draft state.
 * Marks filled roles as non-viable but preserves probabilities.
 */
export function updateFlexibilityForDraftState(
  flexibility: RoleFlexibilityDistribution,
  filledRoles: Position[]
): RoleFlexibilityDistribution {
  const updatedDistribution = flexibility.distribution.map(d => ({
    ...d,
    isViable: !filledRoles.includes(d.role),
  }));

  // Recalculate viable primary role
  const viableRoles = updatedDistribution.filter(d => d.isViable && d.probability > 0);
  const primaryRole = viableRoles.length > 0
    ? viableRoles[0].role
    : flexibility.primaryRole;

  return {
    ...flexibility,
    distribution: updatedDistribution,
    primaryRole,
  };
}

/**
 * Format role distribution as display text
 */
export function formatRoleDistribution(
  flexibility: RoleFlexibilityDistribution,
  config: RoleFlexibilityConfig = DEFAULT_FLEXIBILITY_CONFIG
): string {
  return flexibility.distribution
    .filter(d => d.probability >= config.minDisplayThreshold)
    .map(d => `${capitalizeRole(d.role)} ${Math.round(d.probability * 100)}%`)
    .join(' / ');
}

// ============================================================================
// Display Utilities
// ============================================================================

function capitalizeRole(role: Position): string {
  const displayNames: Record<Position, string> = {
    top: 'Top',
    jungle: 'Jng',
    mid: 'Mid',
    bot: 'Bot',
    support: 'Sup',
  };
  return displayNames[role];
}

export function getRoleColor(role: Position): string {
  const colors: Record<Position, string> = {
    top: '#3B82F6',
    jungle: '#22C55E',
    mid: '#F59E0B',
    bot: '#EF4444',
    support: '#A855F7',
  };
  return colors[role];
}

export function getRoleBgColor(role: Position): string {
  const colors: Record<Position, string> = {
    top: 'rgba(59, 130, 246, 0.2)',
    jungle: 'rgba(34, 197, 94, 0.2)',
    mid: 'rgba(245, 158, 11, 0.2)',
    bot: 'rgba(239, 68, 68, 0.2)',
    support: 'rgba(168, 85, 247, 0.2)',
  };
  return colors[role];
}
