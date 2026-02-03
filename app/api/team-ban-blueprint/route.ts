import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

// ============================================================================
// Types
// ============================================================================

interface ChampionBanStat {
  champion_id: string;
  champion_name: string;
  count: number;
  rate: number;
}

interface SlotBans {
  slot: 1 | 2 | 3;
  total_bans: number;
  top_bans: ChampionBanStat[];
}

interface PatchTrend {
  patch_index: number;
  top_bans: ChampionBanStat[];
}

interface ResponseBanEntry {
  opponent_banned: string;
  responses: Array<{ champion: string; count: number; rate: number }>;
}

interface SideBanBlueprint {
  total_games: number;
  ban_slots: SlotBans[];
  overall_top_bans: ChampionBanStat[];
  patch_trends: PatchTrend[];
  response_bans: ResponseBanEntry[];
}

interface TeamBanBlueprint {
  team_id: string;
  team_name: string;
  blue_side: SideBanBlueprint;
  red_side: SideBanBlueprint;
}

interface BlueprintOutput {
  generated_at: string;
  data_source: string;
  total_teams: number;
  total_games: number;
  recent_patch_count: number;
  response_ban_top_k: number;
  teams: Record<string, TeamBanBlueprint>;
}

// ============================================================================
// Cache
// ============================================================================

let cachedData: BlueprintOutput | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function loadBlueprintData(): BlueprintOutput | null {
  const now = Date.now();
  if (cachedData && now - cacheTimestamp < CACHE_TTL) {
    return cachedData;
  }

  const filePath = path.join(process.cwd(), 'data', 'grid_v2', 'team_ban_blueprints.json');
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    cachedData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    cacheTimestamp = now;
    return cachedData;
  } catch (error) {
    console.error('Failed to load team_ban_blueprints.json:', error);
    return null;
  }
}

// ============================================================================
// API Handler
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const teamId = searchParams.get('team_id');
    const teamIdA = searchParams.get('teamA');
    const teamIdB = searchParams.get('teamB');

    const data = loadBlueprintData();
    if (!data) {
      return NextResponse.json(
        { success: false, error: 'team_ban_blueprints.json not found' },
        { status: 404 }
      );
    }

    // Compare mode: return two teams
    if (teamIdA && teamIdB) {
      const teamA = data.teams[teamIdA] || null;
      const teamB = data.teams[teamIdB] || null;

      return NextResponse.json({
        success: true,
        metadata: {
          generated_at: data.generated_at,
          total_teams: data.total_teams,
          total_games: data.total_games,
        },
        teamA,
        teamB,
      });
    }

    // Single team mode
    if (teamId) {
      const team = data.teams[teamId] || null;
      if (!team) {
        return NextResponse.json(
          { success: false, error: `Team ${teamId} not found` },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        metadata: {
          generated_at: data.generated_at,
          total_teams: data.total_teams,
          total_games: data.total_games,
        },
        team,
      });
    }

    // List all team IDs
    const teamList = Object.entries(data.teams).map(([id, team]) => ({
      team_id: id,
      team_name: team.team_name,
      blue_games: team.blue_side.total_games,
      red_games: team.red_side.total_games,
    }));

    return NextResponse.json({
      success: true,
      metadata: {
        generated_at: data.generated_at,
        total_teams: data.total_teams,
        total_games: data.total_games,
      },
      teams: teamList,
    });
  } catch (error) {
    console.error('Error in team-ban-blueprint API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
