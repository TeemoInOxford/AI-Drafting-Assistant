/**
 * v4-1 Draft State Management
 *
 * Converts BPState to immutable DraftState for v4-1 evaluation.
 * Provides phase detection and role tracking utilities.
 */

import { BPState, BPStep, Team, Champion, Position } from '../../types';
import { DraftState, BPPhase, PhaseContext } from '../types/common-types';

/**
 * Convert BPState to DraftState for v4-1 evaluation
 */
export function bpStateToDraftState(
  bpState: BPState,
  currentStep: BPStep,
  side: Team,
  champions: Champion[]
): DraftState {
  const turn = bpState.currentStep;
  const phaseContext = detectPhase(turn);

  // Extract champion IDs from picks and bans
  const bluePicks = bpState.bluePicks
    .filter((p): p is Champion => p !== null)
    .map(p => p.id);

  const redPicks = bpState.redPicks
    .filter((p): p is Champion => p !== null)
    .map(p => p.id);

  const blueBans = bpState.blueBans
    .filter(b => b.champion !== null)
    .map(b => b.champion!.id);

  const redBans = bpState.redBans
    .filter(b => b.champion !== null)
    .map(b => b.champion!.id);

  // Calculate remaining roles
  const blueRemainingRoles = calculateRemainingRoles(bpState.bluePicks, champions);
  const redRemainingRoles = calculateRemainingRoles(bpState.redPicks, champions);

  return {
    phase: phaseContext.phase,
    turn,
    phaseContext,
    side,
    currentStep,
    bluePicks,
    redPicks,
    blueBans,
    redBans,
    blueRemainingRoles,
    redRemainingRoles,
    usedChampions: new Set(bpState.usedChampions),
  };
}

/**
 * Detect BP phase from turn number
 * - ban1: turns 0-5 (6 bans)
 * - pick1: turns 6-11 (6 picks)
 * - ban2: turns 12-15 (4 bans)
 * - pick2: turns 16-19 (4 picks)
 */
export function detectPhase(turn: number): PhaseContext {
  let phase: BPPhase;
  let isEarly: boolean;
  let isMid: boolean;
  let isLate: boolean;

  if (turn < 6) {
    // Ban Phase 1
    phase = 'ban1';
    isEarly = true;
    isMid = false;
    isLate = false;
  } else if (turn < 12) {
    // Pick Phase 1
    phase = 'pick1';
    // First 3 picks (turns 6-8) are early, last 3 (turns 9-11) are mid
    isEarly = turn < 9;
    isMid = turn >= 9;
    isLate = false;
  } else if (turn < 16) {
    // Ban Phase 2
    phase = 'ban2';
    isEarly = false;
    isMid = true;
    isLate = false;
  } else {
    // Pick Phase 2
    phase = 'pick2';
    isEarly = false;
    isMid = false;
    isLate = true;
  }

  return {
    phase,
    turn,
    isEarly,
    isMid,
    isLate,
  };
}

/**
 * Calculate remaining roles that need to be filled
 * Uses champion position data to determine which roles are filled
 */
export function calculateRemainingRoles(
  picks: (Champion | null)[],
  champions: Champion[]
): Position[] {
  const allRoles: Position[] = ['top', 'jungle', 'mid', 'bot', 'support'];
  const filledRoles = new Set<Position>();

  // Analyze each pick to determine which role it fills
  picks.forEach((pick, index) => {
    if (pick) {
      // Try to match pick to a role based on position
      // Priority: exact match at index, then any available role
      const expectedRole = allRoles[index];

      if (pick.positions.includes(expectedRole) && !filledRoles.has(expectedRole)) {
        filledRoles.add(expectedRole);
      } else {
        // Find first available role this champion can fill
        const availableRole = pick.positions.find(pos => !filledRoles.has(pos));
        if (availableRole) {
          filledRoles.add(availableRole);
        }
      }
    }
  });

  return allRoles.filter(role => !filledRoles.has(role));
}

/**
 * Get opponent team
 */
export function getOpponentTeam(team: Team): Team {
  return team === 'blue' ? 'red' : 'blue';
}

/**
 * Get remaining roles for a specific team
 */
export function getRemainingRolesForTeam(
  draftState: DraftState,
  team: Team
): Position[] {
  return team === 'blue'
    ? draftState.blueRemainingRoles
    : draftState.redRemainingRoles;
}

/**
 * Get picks for a specific team
 */
export function getPicksForTeam(
  draftState: DraftState,
  team: Team
): string[] {
  return team === 'blue' ? draftState.bluePicks : draftState.redPicks;
}

/**
 * Get bans for a specific team
 */
export function getBansForTeam(
  draftState: DraftState,
  team: Team
): string[] {
  return team === 'blue' ? draftState.blueBans : draftState.redBans;
}

/**
 * Check if a champion is available (not picked or banned)
 */
export function isChampionAvailable(
  draftState: DraftState,
  championId: string
): boolean {
  return !draftState.usedChampions.has(championId);
}

/**
 * Get phase description for UI
 */
export function getPhaseDescription(phase: BPPhase): string {
  switch (phase) {
    case 'ban1':
      return 'Ban Phase 1';
    case 'pick1':
      return 'Pick Phase 1';
    case 'ban2':
      return 'Ban Phase 2';
    case 'pick2':
      return 'Pick Phase 2';
  }
}

/**
 * Check if draft is in early game phase
 */
export function isEarlyPhase(draftState: DraftState): boolean {
  return draftState.phaseContext.isEarly;
}

/**
 * Check if draft is in mid game phase
 */
export function isMidPhase(draftState: DraftState): boolean {
  return draftState.phaseContext.isMid;
}

/**
 * Check if draft is in late game phase
 */
export function isLatePhase(draftState: DraftState): boolean {
  return draftState.phaseContext.isLate;
}

/**
 * Get number of picks made by a team
 */
export function getPickCount(draftState: DraftState, team: Team): number {
  return team === 'blue'
    ? draftState.bluePicks.length
    : draftState.redPicks.length;
}

/**
 * Get number of bans made by a team
 */
export function getBanCount(draftState: DraftState, team: Team): number {
  return team === 'blue'
    ? draftState.blueBans.length
    : draftState.redBans.length;
}
