import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface Tournament {
  id: string;
  name: string;
}

interface Series {
  id: string;
  teams: Array<{
    id: string;
    name: string;
    players: Array<{ id: string; name: string }>;
  }>;
}

interface RegionData {
  code: string;
  name: string;
  leagues: LeagueData[];
}

interface LeagueData {
  name: string;
  tournaments: TournamentData[];
  rss?: Record<string, number>;
}

interface LeagueConfig {
  league_id: string;
  display_name: string;
  region: string;
  tier: string;
  active_years: number[];
  rss: Record<string, number>;
}

interface TournamentData {
  id: string;
  name: string;
  teams: TeamData[];
  seriesCount: number;
}

interface TeamData {
  id: string;
  name: string;
  players: PlayerData[];
  seriesCount: number;
}

interface PlayerData {
  id: string;
  name: string;
  seriesCount: number;
}

// 根据 tournament 名称匹配 league_id
function getLeagueId(tournamentName: string): string | null {
  const name = tournamentName.toUpperCase();
  if (name.startsWith('LCK')) return 'LCK';
  if (name.startsWith('LPL')) return 'LPL';
  if (name.startsWith('LEC')) return 'LEC';
  if (name.startsWith('LCS')) return 'LCS';
  if (name.includes('LTA') && name.includes('NORTH')) return 'LTA_N';
  if (name.includes('LTA') && name.includes('SOUTH')) return 'LTA_S';
  return null;
}

export async function GET() {
  try {
    const dataDir = path.join(process.cwd(), 'data', 'grid_v2');

    // Read leagues.json for region and RSS data
    const leaguesConfigFile = path.join(dataDir, 'leagues.json');
    const leaguesConfig: LeagueConfig[] = JSON.parse(fs.readFileSync(leaguesConfigFile, 'utf-8'));

    // Build league_id to config mapping
    const leagueConfigMap: Record<string, LeagueConfig> = {};
    for (const lc of leaguesConfig) {
      leagueConfigMap[lc.league_id] = lc;
    }

    // Read tournaments.json
    const tournamentsFile = path.join(dataDir, 'tournaments.json');
    const tournaments: Tournament[] = JSON.parse(fs.readFileSync(tournamentsFile, 'utf-8'));

    // Read series.json to get tournament -> series mapping
    const seriesListFile = path.join(dataDir, 'series.json');
    const seriesList = JSON.parse(fs.readFileSync(seriesListFile, 'utf-8'));

    // Build tournament -> series IDs mapping
    const tournamentSeriesMap: Record<string, string[]> = {};
    for (const s of seriesList) {
      const tid = s.tournament?.id;
      if (tid) {
        if (!tournamentSeriesMap[tid]) tournamentSeriesMap[tid] = [];
        tournamentSeriesMap[tid].push(s.id);
      }
    }

    // Get used tournament IDs
    const usedTournamentIds = new Set(Object.keys(tournamentSeriesMap));

    // Read all series files to build team/player data
    const seriesFiles = fs.readdirSync(dataDir).filter(f => f.startsWith('series_') && f.endsWith('.json'));

    // Build tournament -> teams -> players hierarchy
    const tournamentTeams: Record<string, Map<string, { name: string; players: Map<string, { name: string; seriesCount: number }>; seriesCount: number }>> = {};

    for (const sf of seriesFiles) {
      const seriesData: Series = JSON.parse(fs.readFileSync(path.join(dataDir, sf), 'utf-8'));
      const seriesId = seriesData.id;

      // Find which tournament this series belongs to
      let tournamentId: string | null = null;
      for (const [tid, sids] of Object.entries(tournamentSeriesMap)) {
        if (sids.includes(seriesId)) {
          tournamentId = tid;
          break;
        }
      }

      if (!tournamentId) continue;

      if (!tournamentTeams[tournamentId]) {
        tournamentTeams[tournamentId] = new Map();
      }

      for (const team of seriesData.teams || []) {
        if (!team.id || !team.name) continue;

        if (!tournamentTeams[tournamentId].has(team.id)) {
          tournamentTeams[tournamentId].set(team.id, {
            name: team.name,
            players: new Map(),
            seriesCount: 0,
          });
        }

        const teamData = tournamentTeams[tournamentId].get(team.id)!;
        teamData.seriesCount++;

        for (const player of team.players || []) {
          if (!player.id || !player.name) continue;

          if (!teamData.players.has(player.id)) {
            teamData.players.set(player.id, { name: player.name, seriesCount: 0 });
          }
          teamData.players.get(player.id)!.seriesCount++;
        }
      }
    }

    // Build hierarchy: Region -> League -> Tournament -> Team -> Player
    const regionMap: Map<string, RegionData> = new Map();

    for (const tournament of tournaments) {
      if (!usedTournamentIds.has(tournament.id)) continue;

      const leagueId = getLeagueId(tournament.name);
      if (!leagueId) continue;

      const leagueConfig = leagueConfigMap[leagueId];
      if (!leagueConfig) continue;

      const regionName = leagueConfig.region;
      const leagueName = leagueConfig.display_name;

      if (!regionMap.has(regionName)) {
        regionMap.set(regionName, {
          code: regionName,
          name: regionName,
          leagues: [],
        });
      }

      const regionData = regionMap.get(regionName)!;
      let leagueData = regionData.leagues.find(l => l.name === leagueName);
      if (!leagueData) {
        leagueData = { name: leagueName, tournaments: [], rss: leagueConfig.rss };
        regionData.leagues.push(leagueData);
      }

      // Build teams for this tournament
      const teamsMap = tournamentTeams[tournament.id];
      const teams: TeamData[] = [];

      if (teamsMap) {
        for (const [teamId, teamInfo] of teamsMap) {
          const players: PlayerData[] = [];
          for (const [playerId, playerInfo] of teamInfo.players) {
            players.push({
              id: playerId,
              name: playerInfo.name,
              seriesCount: playerInfo.seriesCount,
            });
          }
          players.sort((a, b) => b.seriesCount - a.seriesCount);

          teams.push({
            id: teamId,
            name: teamInfo.name,
            players,
            seriesCount: teamInfo.seriesCount,
          });
        }
        teams.sort((a, b) => b.seriesCount - a.seriesCount);
      }

      leagueData.tournaments.push({
        id: tournament.id,
        name: tournament.name,
        teams,
        seriesCount: tournamentSeriesMap[tournament.id]?.length || 0,
      });
    }

    // Sort tournaments by series count
    for (const region of regionMap.values()) {
      for (const league of region.leagues) {
        league.tournaments.sort((a, b) => b.seriesCount - a.seriesCount);
      }
      region.leagues.sort((a, b) => {
        const aCount = a.tournaments.reduce((sum, t) => sum + t.seriesCount, 0);
        const bCount = b.tournaments.reduce((sum, t) => sum + t.seriesCount, 0);
        return bCount - aCount;
      });
    }

    // Convert to array and sort by total series
    const result = Array.from(regionMap.values()).sort((a, b) => {
      const aCount = a.leagues.reduce((sum, l) => sum + l.tournaments.reduce((s, t) => s + t.seriesCount, 0), 0);
      const bCount = b.leagues.reduce((sum, l) => sum + l.tournaments.reduce((s, t) => s + t.seriesCount, 0), 0);
      return bCount - aCount;
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error building hierarchy:', error);
    return NextResponse.json({ success: false, error: 'Failed to build hierarchy' }, { status: 500 });
  }
}
