import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import * as path from 'path';
import { type LeagueKey, LEAGUE_LABELS } from '@/app/lib/league-types';
import { resolveLeague, getSeriesLeagueMap } from '@/app/lib/league-posterior-engine';

const ROLE_NORMALIZE: Record<string, string> = {
  top: 'top',
  jungle: 'jungle',
  mid: 'mid',
  middle: 'mid',
  bot: 'bot',
  bottom: 'bot',
  adc: 'bot',
  support: 'support',
  sup: 'support',
};

const ROLE_ORDER = ['top', 'jungle', 'mid', 'bot', 'support'];

interface GameRecord {
  instance_id: string;
  player_id: string;
  player_name: string;
  team_id: string;
  inferred_role: string;
  champion: string;
  date: string;
  series_id: string;
}

// Module-level cache for records
let recordsCache: GameRecord[] | null = null;

async function loadRecords(): Promise<GameRecord[]> {
  if (recordsCache) return recordsCache;
  const filePath = path.join(process.cwd(), 'data', 'grid_v2', 'instance_game_records.json');
  const raw = await fs.readFile(filePath, 'utf-8');
  recordsCache = JSON.parse(raw) as GameRecord[];
  return recordsCache;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
): Promise<NextResponse> {
  try {
    const { teamId } = await params;

    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 });
    }

    // Parse league query param using resolveLeague
    const { searchParams } = new URL(request.url);
    const leagueParam = searchParams.get('league');
    const requestedLeague = resolveLeague(leagueParam);

    const [records, seriesLeagueMap] = await Promise.all([
      loadRecords(),
      getSeriesLeagueMap(),
    ]);

    // Filter records for this team
    const teamRecords = records.filter(r => r.team_id === teamId);

    if (teamRecords.length === 0) {
      return NextResponse.json({ error: 'No records found for team' }, { status: 404 });
    }

    // Apply league filter if not global
    let filteredRecords = teamRecords;
    let fallbackToGlobal = false;
    let warning: string | undefined;

    if (requestedLeague !== 'global') {
      const leagueFiltered = teamRecords.filter(r => {
        const seriesLeague = seriesLeagueMap.get(String(r.series_id));
        return seriesLeague === requestedLeague;
      });

      if (leagueFiltered.length === 0) {
        fallbackToGlobal = true;
        warning = `No records found for league ${LEAGUE_LABELS[requestedLeague]}. Using global data.`;
        // Keep filteredRecords as teamRecords (global)
      } else {
        filteredRecords = leagueFiltered;
      }
    }

    // Find the record with max ISO datetime to get latest series_id
    let latestRecord = filteredRecords[0];
    for (const r of filteredRecords) {
      if (r.date > latestRecord.date) {
        latestRecord = r;
      }
    }
    const latestSeriesId = latestRecord.series_id;
    const matchDateTime = latestRecord.date;

    // Get all records with that series_id for this team
    const latestRecords = filteredRecords.filter(r => r.series_id === latestSeriesId);

    // Group by player, count roles
    const playerMap = new Map<string, {
      playerId: string;
      playerName: string;
      roleCounts: Map<string, number>;
    }>();

    for (const r of latestRecords) {
      const normalizedRole = ROLE_NORMALIZE[r.inferred_role?.toLowerCase()] || null;
      if (!normalizedRole) continue;

      if (!playerMap.has(r.player_id)) {
        playerMap.set(r.player_id, {
          playerId: r.player_id,
          playerName: r.player_name,
          roleCounts: new Map(),
        });
      }
      const entry = playerMap.get(r.player_id)!;
      entry.roleCounts.set(normalizedRole, (entry.roleCounts.get(normalizedRole) || 0) + 1);
    }

    // Determine majority role per player with tie-break by ROLE_ORDER
    interface PlayerWithRole {
      playerId: string;
      playerName: string;
      role: string;
      roleCounts: Record<string, number>;
      confidence: number;
    }

    const playersWithRoles: PlayerWithRole[] = [];

    for (const entry of playerMap.values()) {
      let maxRole = 'mid';
      let maxCount = 0;

      // Find majority role with tie-break by ROLE_ORDER (earlier = preferred)
      for (const role of ROLE_ORDER) {
        const count = entry.roleCounts.get(role) || 0;
        if (count > maxCount) {
          maxCount = count;
          maxRole = role;
        }
      }

      // Convert roleCounts Map to Record
      const roleCountsObj: Record<string, number> = {};
      for (const [role, count] of entry.roleCounts.entries()) {
        roleCountsObj[role] = count;
      }

      playersWithRoles.push({
        playerId: entry.playerId,
        playerName: entry.playerName,
        role: maxRole,
        roleCounts: roleCountsObj,
        confidence: maxCount,
      });
    }

    // Assign unique roles - sort by confidence descending, fill roles
    playersWithRoles.sort((a, b) => b.confidence - a.confidence);

    const filledRoles = new Set<string>();
    const roster: PlayerWithRole[] = [];

    // First pass: assign players to their majority role if available
    for (const player of playersWithRoles) {
      if (roster.length >= 5) break;
      if (!filledRoles.has(player.role)) {
        filledRoles.add(player.role);
        roster.push(player);
      }
    }

    // Second pass: fill remaining slots with unassigned players
    for (const player of playersWithRoles) {
      if (roster.length >= 5) break;
      if (roster.some(r => r.playerId === player.playerId)) continue;

      // Find an unfilled role
      const unfilledRole = ROLE_ORDER.find(r => !filledRoles.has(r));
      if (unfilledRole) {
        filledRoles.add(unfilledRole);
        roster.push({
          ...player,
          role: unfilledRole, // Override with the unfilled role
        });
      }
    }

    // Sort by ROLE_ORDER
    roster.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));

    const response: {
      teamId: string;
      leagueUsed: LeagueKey;
      fallbackToGlobal: boolean;
      warning?: string;
      matchDateTime: string;
      seriesId: string;
      players: PlayerWithRole[];
    } = {
      teamId,
      leagueUsed: fallbackToGlobal ? 'global' : requestedLeague,
      fallbackToGlobal,
      matchDateTime,
      seriesId: latestSeriesId,
      players: roster,
    };

    if (warning) {
      response.warning = warning;
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error('Error in latest-roster:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
