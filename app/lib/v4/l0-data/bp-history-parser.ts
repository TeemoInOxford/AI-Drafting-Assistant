/**
 * v4-1 L0 BP History Parser
 *
 * Parses historical BP sequences from series data files.
 * Maintains patch/version context and extracts ban patterns and pick sequences.
 */

import fs from 'fs';
import path from 'path';
import { BPSequence, BPAction, L0Config, DEFAULT_L0_CONFIG } from '../types/l0-types';

interface SeriesData {
  id: string;
  startedAt?: string;
  tournament?: {
    id: string;
    name: string;
  };
  teams: SeriesTeamData[];
  games: GameData[];
}

interface SeriesTeamData {
  id: string;
  name: string;
  players: SeriesPlayerData[];
}

interface SeriesPlayerData {
  id: string;
  name: string;
}

interface GameData {
  id: string;
  draftActions: DraftActionData[];
  teams: TeamData[];
}

interface DraftActionData {
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

interface TeamData {
  id: string;
  side: 'blue' | 'red';
  won: boolean;
}

/**
 * Parse BP sequences from series data files
 */
export async function parseBPHistory(
  config: L0Config = DEFAULT_L0_CONFIG
): Promise<BPSequence[]> {
  const seriesDataDir = path.join(process.cwd(), 'data', 'lol', 'series_data');

  if (!fs.existsSync(seriesDataDir)) {
    console.warn('Series data directory not found:', seriesDataDir);
    return [];
  }

  const files = fs.readdirSync(seriesDataDir)
    .filter(f => f.startsWith('series_') && f.endsWith('.json'));

  console.log(`Parsing BP history from ${files.length} series files...`);

  const sequences: BPSequence[] = [];
  let totalGamesProcessed = 0;

  for (const file of files) {
    const filePath = path.join(seriesDataDir, file);

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const seriesData: SeriesData = JSON.parse(content);

      // Process each game in the series
      for (const game of seriesData.games || []) {
        totalGamesProcessed++;
        const sequence = parseGameBPSequence(game, seriesData);
        if (sequence) {
          sequences.push(sequence);
        }
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }

  console.log(`Parsed ${sequences.length} BP sequences from ${totalGamesProcessed} games`);

  return sequences;
}

/**
 * Parse BP sequence from a single game
 */
function parseGameBPSequence(
  game: GameData,
  seriesData: SeriesData
): BPSequence | null {
  if (!game.draftActions || game.draftActions.length === 0) {
    return null;
  }

  // Determine winner
  const winningTeam = game.teams.find(t => t.won);
  if (!winningTeam) {
    return null;
  }

  // Map team IDs to sides
  const teamSideMap = new Map<string, 'blue' | 'red'>();
  for (const team of game.teams) {
    teamSideMap.set(team.id, team.side);
  }

  // Parse draft actions
  const actions: BPAction[] = [];

  for (const draftAction of game.draftActions) {
    const team = teamSideMap.get(draftAction.drafter.id);
    if (!team) continue;

    const turn = parseInt(draftAction.sequenceNumber, 10) - 1; // Convert to 0-indexed
    const phase = determinePhase(turn);

    actions.push({
      type: draftAction.type,
      championId: draftAction.draftable.id,
      team,
      turn,
      phase,
    });
  }

  // Sort actions by turn
  actions.sort((a, b) => a.turn - b.turn);

  // Extract player IDs
  const playerIds: string[] = [];
  if (seriesData.teams) {
    for (const team of seriesData.teams) {
      if (team.players) {
        playerIds.push(...team.players.map(p => p.id));
      }
    }
  }

  return {
    gameId: game.id,
    seriesId: seriesData.id,
    tournamentId: seriesData.tournament?.id || '',
    actions,
    winner: winningTeam.side,
    gameDate: seriesData.startedAt ? new Date(seriesData.startedAt) : new Date(),
    blueTeamId: game.teams.find(t => t.side === 'blue')?.id,
    redTeamId: game.teams.find(t => t.side === 'red')?.id,
    playerIds: playerIds.length > 0 ? playerIds : undefined,
  };
}

/**
 * Determine BP phase from turn number
 */
function determinePhase(turn: number): 'ban1' | 'pick1' | 'ban2' | 'pick2' {
  if (turn < 6) return 'ban1';
  if (turn < 12) return 'pick1';
  if (turn < 16) return 'ban2';
  return 'pick2';
}

/**
 * Get BP sequences for a specific tournament
 */
export function getSequencesByTournament(
  tournamentId: string,
  sequences: BPSequence[]
): BPSequence[] {
  return sequences.filter(s => s.tournamentId === tournamentId);
}

/**
 * Get BP sequences for a specific team
 */
export function getSequencesByTeam(
  teamId: string,
  sequences: BPSequence[]
): BPSequence[] {
  return sequences.filter(
    s => s.blueTeamId === teamId || s.redTeamId === teamId
  );
}

/**
 * Get BP sequences within a date range
 */
export function getSequencesByDateRange(
  startDate: Date,
  endDate: Date,
  sequences: BPSequence[]
): BPSequence[] {
  return sequences.filter(
    s => s.gameDate >= startDate && s.gameDate <= endDate
  );
}

/**
 * Get first pick/ban statistics
 */
export function getFirstPickStats(
  sequences: BPSequence[]
): Map<string, { count: number; winRate: number }> {
  const stats = new Map<string, { picks: number; wins: number }>();

  for (const seq of sequences) {
    // Find first pick (turn 6)
    const firstPick = seq.actions.find(a => a.type === 'pick' && a.turn === 6);
    if (!firstPick) continue;

    const championId = firstPick.championId;
    const won = seq.winner === firstPick.team;

    const existing = stats.get(championId) || { picks: 0, wins: 0 };
    existing.picks++;
    if (won) existing.wins++;
    stats.set(championId, existing);
  }

  // Convert to final format
  const result = new Map<string, { count: number; winRate: number }>();
  for (const [championId, data] of stats.entries()) {
    result.set(championId, {
      count: data.picks,
      winRate: data.picks > 0 ? data.wins / data.picks : 0,
    });
  }

  return result;
}

/**
 * Get ban priority statistics (how often champions are banned in first ban phase)
 */
export function getBanPriorityStats(
  sequences: BPSequence[]
): Map<string, { count: number; avgTurn: number }> {
  const stats = new Map<string, { count: number; totalTurn: number }>();

  for (const seq of sequences) {
    // Get first ban phase bans (turns 0-5)
    const firstBans = seq.actions.filter(a => a.type === 'ban' && a.turn < 6);

    for (const ban of firstBans) {
      const championId = ban.championId;
      const existing = stats.get(championId) || { count: 0, totalTurn: 0 };
      existing.count++;
      existing.totalTurn += ban.turn;
      stats.set(championId, existing);
    }
  }

  // Convert to final format
  const result = new Map<string, { count: number; avgTurn: number }>();
  for (const [championId, data] of stats.entries()) {
    result.set(championId, {
      count: data.count,
      avgTurn: data.count > 0 ? data.totalTurn / data.count : 0,
    });
  }

  return result;
}

/**
 * Get pick sequence patterns (common pick orders)
 */
export function getPickSequencePatterns(
  sequences: BPSequence[],
  minOccurrences: number = 5
): Array<{ pattern: string[]; count: number; winRate: number }> {
  const patterns = new Map<string, { count: number; wins: number }>();

  for (const seq of sequences) {
    // Get first 3 picks for blue team (turns 6, 9, 10)
    const bluePicks = seq.actions
      .filter(a => a.type === 'pick' && a.team === 'blue' && a.turn < 12)
      .sort((a, b) => a.turn - b.turn)
      .map(a => a.championId);

    if (bluePicks.length >= 3) {
      const patternKey = bluePicks.slice(0, 3).join(',');
      const existing = patterns.get(patternKey) || { count: 0, wins: 0 };
      existing.count++;
      if (seq.winner === 'blue') existing.wins++;
      patterns.set(patternKey, existing);
    }

    // Get first 3 picks for red team (turns 7, 8, 11)
    const redPicks = seq.actions
      .filter(a => a.type === 'pick' && a.team === 'red' && a.turn < 12)
      .sort((a, b) => a.turn - b.turn)
      .map(a => a.championId);

    if (redPicks.length >= 3) {
      const patternKey = redPicks.slice(0, 3).join(',');
      const existing = patterns.get(patternKey) || { count: 0, wins: 0 };
      existing.count++;
      if (seq.winner === 'red') existing.wins++;
      patterns.set(patternKey, existing);
    }
  }

  // Convert to array and filter by minimum occurrences
  const result: Array<{ pattern: string[]; count: number; winRate: number }> = [];

  for (const [patternKey, data] of patterns.entries()) {
    if (data.count >= minOccurrences) {
      result.push({
        pattern: patternKey.split(','),
        count: data.count,
        winRate: data.count > 0 ? data.wins / data.count : 0,
      });
    }
  }

  return result.sort((a, b) => b.count - a.count);
}

/**
 * Analyze ban targeting (which champions are banned together)
 */
export function analyzeBanTargeting(
  sequences: BPSequence[],
  minCoOccurrence: number = 5
): Map<string, Map<string, number>> {
  const coOccurrence = new Map<string, Map<string, number>>();

  for (const seq of sequences) {
    // Get all bans for each team
    const blueBans = seq.actions
      .filter(a => a.type === 'ban' && a.team === 'blue')
      .map(a => a.championId);

    const redBans = seq.actions
      .filter(a => a.type === 'ban' && a.team === 'red')
      .map(a => a.championId);

    // Analyze blue team ban patterns
    for (let i = 0; i < blueBans.length; i++) {
      for (let j = i + 1; j < blueBans.length; j++) {
        const champA = blueBans[i];
        const champB = blueBans[j];

        if (!coOccurrence.has(champA)) {
          coOccurrence.set(champA, new Map());
        }
        const champAMap = coOccurrence.get(champA)!;
        champAMap.set(champB, (champAMap.get(champB) || 0) + 1);

        if (!coOccurrence.has(champB)) {
          coOccurrence.set(champB, new Map());
        }
        const champBMap = coOccurrence.get(champB)!;
        champBMap.set(champA, (champBMap.get(champA) || 0) + 1);
      }
    }

    // Analyze red team ban patterns
    for (let i = 0; i < redBans.length; i++) {
      for (let j = i + 1; j < redBans.length; j++) {
        const champA = redBans[i];
        const champB = redBans[j];

        if (!coOccurrence.has(champA)) {
          coOccurrence.set(champA, new Map());
        }
        const champAMap = coOccurrence.get(champA)!;
        champAMap.set(champB, (champAMap.get(champB) || 0) + 1);

        if (!coOccurrence.has(champB)) {
          coOccurrence.set(champB, new Map());
        }
        const champBMap = coOccurrence.get(champB)!;
        champBMap.set(champA, (champBMap.get(champA) || 0) + 1);
      }
    }
  }

  // Filter by minimum co-occurrence
  for (const [champA, champBMap] of coOccurrence.entries()) {
    for (const [champB, count] of champBMap.entries()) {
      if (count < minCoOccurrence) {
        champBMap.delete(champB);
      }
    }
    if (champBMap.size === 0) {
      coOccurrence.delete(champA);
    }
  }

  return coOccurrence;
}
