/**
 * Draft Actions Adapter
 *
 * Unified parser for draft actions from match data.
 * Converts raw game data to standardized DraftAction[] format.
 *
 * Key responsibilities:
 * 1. Parse draftActions from game JSON
 * 2. Infer side (blue/red) from sequence number if not provided
 * 3. Attribute picks to players via character matching
 * 4. Validate 20-action constraint
 */

// ============ Types ============

export interface StandardizedDraftAction {
  actionType: 'ban' | 'pick';
  seq: number;                    // 1..20
  teamId: string;                 // drafter.id
  championName: string;           // draftable.name
  championId: string;             // draftable.id
  inferredSide: 'blue' | 'red';   // from data or inferred from seq
  playerId: string | null;        // for picks: matched from team.players[].character
  sideSource: 'data' | 'inferred'; // whether side came from data or was inferred
}

export interface RawDraftAction {
  type: 'ban' | 'pick';
  sequenceNumber: string;
  drafter: {
    id: string;
    type: string;
  };
  draftable: {
    id: string;
    type: string;
    name: string;
  };
}

export interface RawGamePlayer {
  id: string;
  name: string;
  character?: {
    id: string;
    name: string;
  };
  participationStatus?: string;
}

export interface RawGameTeam {
  id: string;
  name: string;
  side?: 'blue' | 'red';
  won?: boolean;
  players?: RawGamePlayer[];
}

export interface RawGame {
  id: string;
  sequenceNumber: number;
  started?: boolean;
  finished?: boolean;
  draftActions?: RawDraftAction[];
  teams?: RawGameTeam[];
}

export interface AdapterResult {
  actions: StandardizedDraftAction[];
  validation: {
    totalActions: number;
    bans: number;
    picks: number;
    isValid: boolean;           // exactly 20 actions
    hasSequenceGaps: boolean;   // missing sequence numbers
    duplicateSequences: number[];
    picksWithPlayer: number;    // picks successfully attributed to player
    picksWithoutPlayer: number; // picks that couldn't be attributed
    unmatchedChampions: string[]; // champion names that couldn't be matched
  };
  warnings: string[];
}

// ============ Constants ============

/**
 * Standard draft sequence:
 * - 1-6: Early bans (Blue: 1,3,5 | Red: 2,4,6)
 * - 7-12: First picks (Blue: 7,9,10 | Red: 8,11,12)
 * - 13-16: Late bans (Blue: 13,15 | Red: 14,16)
 * - 17-20: Final picks (Blue: 17,20 | Red: 18,19)
 */
const BLUE_SEQUENCES = [1, 3, 5, 7, 9, 10, 13, 15, 17, 20];
const RED_SEQUENCES = [2, 4, 6, 8, 11, 12, 14, 16, 18, 19];

const BAN_SEQUENCES = [1, 2, 3, 4, 5, 6, 13, 14, 15, 16];
const PICK_SEQUENCES = [7, 8, 9, 10, 11, 12, 17, 18, 19, 20];

// ============ Adapter Functions ============

/**
 * Infer side from sequence number using standard draft order
 */
function inferSideFromSequence(seq: number): 'blue' | 'red' {
  return BLUE_SEQUENCES.includes(seq) ? 'blue' : 'red';
}

/**
 * Parse a single game's draft actions into standardized format
 */
export function parseDraftActions(game: RawGame): AdapterResult {
  const warnings: string[] = [];
  const actions: StandardizedDraftAction[] = [];

  const validation = {
    totalActions: 0,
    bans: 0,
    picks: 0,
    isValid: false,
    hasSequenceGaps: false,
    duplicateSequences: [] as number[],
    picksWithPlayer: 0,
    picksWithoutPlayer: 0,
    unmatchedChampions: [] as string[],
  };

  if (!game.draftActions || game.draftActions.length === 0) {
    warnings.push('No draft actions found');
    return { actions, validation, warnings };
  }

  // Build team side map from game.teams
  const teamSideMap = new Map<string, 'blue' | 'red'>();
  const teamPlayersMap = new Map<string, RawGamePlayer[]>();

  if (game.teams) {
    for (const team of game.teams) {
      if (team.side) {
        teamSideMap.set(team.id, team.side);
      }
      if (team.players) {
        teamPlayersMap.set(team.id, team.players);
      }
    }
  }

  // If teams don't have side info, infer from first ban (seq 1 = blue)
  if (teamSideMap.size < 2 && game.teams && game.teams.length >= 2) {
    const firstBan = game.draftActions.find(a => a.type === 'ban' && a.sequenceNumber === '1');
    if (firstBan) {
      const blueTeamId = firstBan.drafter.id;
      teamSideMap.set(blueTeamId, 'blue');
      const redTeam = game.teams.find(t => t.id !== blueTeamId);
      if (redTeam) {
        teamSideMap.set(redTeam.id, 'red');
      }
      warnings.push('Side inferred from draft order (seq 1 = blue)');
    }
  }

  // Build champion -> player map for pick attribution
  // Key: championName (lowercase), Value: playerId
  const championToPlayerMap = new Map<string, { playerId: string; teamId: string }>();

  for (const [teamId, players] of teamPlayersMap) {
    for (const player of players) {
      if (player.character?.name) {
        const champKey = player.character.name.toLowerCase();
        championToPlayerMap.set(champKey, { playerId: player.id, teamId });
      }
    }
  }

  // Track seen sequences for duplicate detection
  const seenSequences = new Set<number>();

  // Process each draft action
  for (const action of game.draftActions) {
    const seq = parseInt(action.sequenceNumber, 10);
    if (isNaN(seq) || seq < 1 || seq > 20) {
      warnings.push(`Invalid sequence number: ${action.sequenceNumber}`);
      continue;
    }

    // Check for duplicates
    if (seenSequences.has(seq)) {
      validation.duplicateSequences.push(seq);
    }
    seenSequences.add(seq);

    // Determine side
    let inferredSide: 'blue' | 'red';
    let sideSource: 'data' | 'inferred';

    const teamSide = teamSideMap.get(action.drafter.id);
    if (teamSide) {
      inferredSide = teamSide;
      sideSource = 'data';
    } else {
      inferredSide = inferSideFromSequence(seq);
      sideSource = 'inferred';
    }

    // Attribute player for picks
    let playerId: string | null = null;

    if (action.type === 'pick') {
      const champKey = action.draftable.name.toLowerCase();
      const playerInfo = championToPlayerMap.get(champKey);

      if (playerInfo && playerInfo.teamId === action.drafter.id) {
        playerId = playerInfo.playerId;
        validation.picksWithPlayer++;
      } else {
        validation.picksWithoutPlayer++;
        if (!validation.unmatchedChampions.includes(action.draftable.name)) {
          validation.unmatchedChampions.push(action.draftable.name);
        }
      }
    }

    actions.push({
      actionType: action.type,
      seq,
      teamId: action.drafter.id,
      championName: action.draftable.name,
      championId: action.draftable.id,
      inferredSide,
      playerId,
      sideSource,
    });

    validation.totalActions++;
    if (action.type === 'ban') {
      validation.bans++;
    } else {
      validation.picks++;
    }
  }

  // Sort by sequence
  actions.sort((a, b) => a.seq - b.seq);

  // Validate sequence completeness
  const expectedSequences = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  const missingSequences: number[] = [];
  for (const seq of expectedSequences) {
    if (!seenSequences.has(seq)) {
      missingSequences.push(seq);
    }
  }
  validation.hasSequenceGaps = missingSequences.length > 0;

  if (missingSequences.length > 0) {
    warnings.push(`Missing sequences: ${missingSequences.join(', ')}`);
  }

  // Final validation
  validation.isValid = validation.totalActions === 20 &&
    validation.bans === 10 &&
    validation.picks === 10 &&
    !validation.hasSequenceGaps &&
    validation.duplicateSequences.length === 0;

  return { actions, validation, warnings };
}

/**
 * Parse all games from states data
 */
export function parseAllGames(states: Record<string, { games?: RawGame[] }>): {
  allActions: Map<string, StandardizedDraftAction[]>;  // gameId -> actions
  summary: {
    totalSeries: number;
    totalGames: number;
    validGames: number;
    invalidGames: number;
    totalBans: number;
    totalPicks: number;
    picksWithPlayer: number;
    picksWithoutPlayer: number;
    unmatchedChampions: Map<string, number>;  // championName -> count
    invalidGameIds: string[];
  };
} {
  const allActions = new Map<string, StandardizedDraftAction[]>();
  const summary = {
    totalSeries: 0,
    totalGames: 0,
    validGames: 0,
    invalidGames: 0,
    totalBans: 0,
    totalPicks: 0,
    picksWithPlayer: 0,
    picksWithoutPlayer: 0,
    unmatchedChampions: new Map<string, number>(),
    invalidGameIds: [] as string[],
  };

  for (const seriesId in states) {
    summary.totalSeries++;
    const series = states[seriesId];

    if (!series.games) continue;

    for (const game of series.games) {
      summary.totalGames++;

      const result = parseDraftActions(game);
      allActions.set(game.id, result.actions);

      if (result.validation.isValid) {
        summary.validGames++;
      } else {
        summary.invalidGames++;
        summary.invalidGameIds.push(game.id);
      }

      summary.totalBans += result.validation.bans;
      summary.totalPicks += result.validation.picks;
      summary.picksWithPlayer += result.validation.picksWithPlayer;
      summary.picksWithoutPlayer += result.validation.picksWithoutPlayer;

      for (const champ of result.validation.unmatchedChampions) {
        summary.unmatchedChampions.set(champ, (summary.unmatchedChampions.get(champ) || 0) + 1);
      }
    }
  }

  return { allActions, summary };
}

/**
 * Get ban actions only
 */
export function getBanActions(actions: StandardizedDraftAction[]): StandardizedDraftAction[] {
  return actions.filter(a => a.actionType === 'ban');
}

/**
 * Get pick actions only
 */
export function getPickActions(actions: StandardizedDraftAction[]): StandardizedDraftAction[] {
  return actions.filter(a => a.actionType === 'pick');
}

/**
 * Get early phase bans (seq 1-6)
 */
export function getEarlyBans(actions: StandardizedDraftAction[]): StandardizedDraftAction[] {
  return actions.filter(a => a.actionType === 'ban' && a.seq >= 1 && a.seq <= 6);
}

/**
 * Get late phase bans (seq 13-16)
 */
export function getLateBans(actions: StandardizedDraftAction[]): StandardizedDraftAction[] {
  return actions.filter(a => a.actionType === 'ban' && a.seq >= 13 && a.seq <= 16);
}

/**
 * Determine phase group from sequence number
 */
export function getPhaseGroup(seq: number): 'early' | 'late' | 'pick' {
  if (seq >= 1 && seq <= 6) return 'early';
  if (seq >= 13 && seq <= 16) return 'late';
  return 'pick';
}

/**
 * Get ban slot (1-10) from sequence number
 */
export function getBanSlot(seq: number): number {
  if (seq >= 1 && seq <= 6) return seq;
  if (seq >= 13 && seq <= 16) return seq - 6;  // 13->7, 14->8, 15->9, 16->10
  return 0;  // Not a ban
}
