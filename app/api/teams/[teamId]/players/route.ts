import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import * as path from 'path';

interface GameRecord {
  player_id: string;
  player_name: string;
  team_id: string;
  date: string;
}

interface PlayerCandidate {
  playerId: string;
  playerName: string;
  games: number;
  lastPlayed: string;
}

// Module-level cache
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

    const records = await loadRecords();

    // Filter records for this team
    const teamRecords = records.filter(r => r.team_id === teamId);

    if (teamRecords.length === 0) {
      return NextResponse.json({ error: 'No records found for team' }, { status: 404 });
    }

    // Group by player_id and aggregate
    const playerMap = new Map<string, {
      playerId: string;
      playerName: string;
      games: number;
      lastPlayed: string;
    }>();

    for (const r of teamRecords) {
      const existing = playerMap.get(r.player_id);
      if (existing) {
        existing.games += 1;
        if (r.date > existing.lastPlayed) {
          existing.lastPlayed = r.date;
          existing.playerName = r.player_name; // Use latest name
        }
      } else {
        playerMap.set(r.player_id, {
          playerId: r.player_id,
          playerName: r.player_name,
          games: 1,
          lastPlayed: r.date,
        });
      }
    }

    // Convert to array and sort by lastPlayed DESC, then games DESC
    const players: PlayerCandidate[] = Array.from(playerMap.values());
    players.sort((a, b) => {
      const dateCompare = b.lastPlayed.localeCompare(a.lastPlayed);
      if (dateCompare !== 0) return dateCompare;
      return b.games - a.games;
    });

    // Format lastPlayed to date only (YYYY-MM-DD)
    const formattedPlayers = players.map(p => ({
      ...p,
      lastPlayed: p.lastPlayed.split('T')[0],
    }));

    return NextResponse.json({
      teamId,
      players: formattedPlayers,
    });
  } catch (err) {
    console.error('Error in team players:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
