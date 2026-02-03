import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Data directory - using the new hierarchy.json
const DATA_DIR = path.join(process.cwd(), 'data/lol');

// Cache for hierarchy data
let hierarchyCache: any = null;
let cacheTimestamp = 0;
let teamLogosCache: Map<string, string> = new Map();
let allTeamsCache: any = null;
let allTeamsCacheTimestamp = 0;
const CACHE_DURATION = 60000; // 1 minute

function loadHierarchy() {
  const now = Date.now();
  if (hierarchyCache && now - cacheTimestamp < CACHE_DURATION) {
    return hierarchyCache;
  }

  const hierarchyPath = path.join(DATA_DIR, 'hierarchy.json');
  if (!fs.existsSync(hierarchyPath)) {
    return null;
  }

  hierarchyCache = JSON.parse(fs.readFileSync(hierarchyPath, 'utf-8'));
  cacheTimestamp = now;

  // Load team logos from series.json if not already cached
  if (teamLogosCache.size === 0) {
    try {
      const seriesPath = path.join(DATA_DIR, 'series.json');
      if (fs.existsSync(seriesPath)) {
        const seriesData = JSON.parse(fs.readFileSync(seriesPath, 'utf-8'));
        seriesData.forEach((series: any) => {
          series.teams?.forEach((team: any) => {
            if (team.baseInfo?.id && team.baseInfo?.logoUrl) {
              teamLogosCache.set(team.baseInfo.id, team.baseInfo.logoUrl);
            }
          });
        });
      }
    } catch (e) {
      console.error('Failed to load team logos:', e);
    }
  }

  return hierarchyCache;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'summary';
  const regionCode = searchParams.get('region');
  const leagueName = searchParams.get('league');
  const tournamentId = searchParams.get('tournament');
  const teamId = searchParams.get('team');

  try {
    const hierarchy = loadHierarchy();
    if (!hierarchy) {
      return NextResponse.json({ error: 'Hierarchy data not found' }, { status: 404 });
    }

    switch (type) {
      case 'summary': {
        // Return summary stats
        return NextResponse.json({
          success: true,
          totalPlayers: hierarchy.stats.totalPlayers,
          totalTeams: hierarchy.stats.totalTeams,
          totalTournaments: hierarchy.stats.totalLeagues,
          regionCount: hierarchy.stats.totalRegions,
          totalPlayersWithTeams: hierarchy.stats.totalPlayers,
          totalPlayersAll: hierarchy.stats.totalPlayers,
          updatedAt: hierarchy.updatedAt
        });
      }

      case 'regions': {
        // Return all regions list
        const regions = Object.values(hierarchy.regions).map((r: any) => {
          // Count total series for this region
          let matchCount = 0;
          Object.values(r.leagues).forEach((league: any) => {
            Object.values(league.tournaments).forEach((t: any) => {
              matchCount += t.seriesIds?.length || 0;
            });
          });

          return {
            code: r.id,
            name: r.name,
            fullName: r.name,
            country: r.shortName,
            tournamentCount: r.stats.leagues,
            teamCount: r.stats.teams,
            playerCount: r.stats.players,
            matchCount
          };
        });

        // Sort by match count descending
        regions.sort((a: any, b: any) => b.matchCount - a.matchCount);

        return NextResponse.json({ success: true, regions });
      }

      case 'region': {
        // Return leagues for a specific region
        if (!regionCode) {
          return NextResponse.json({ error: 'region parameter is required' }, { status: 400 });
        }

        const region = hierarchy.regions[regionCode];
        if (!region) {
          return NextResponse.json({ error: 'Region not found' }, { status: 404 });
        }

        // Convert leagues to array format expected by frontend
        const tournaments = Object.entries(region.leagues).map(([name, league]: [string, any]) => {
          // Calculate total series count for this league
          let seriesCount = 0;
          Object.values(league.tournaments).forEach((t: any) => {
            seriesCount += t.seriesIds?.length || 0;
          });

          return {
            id: name, // Use league name as ID
            name: league.name,
            nameShortened: league.split || league.name,
            startDate: null,
            endDate: null,
            teamCount: league.teams?.length || 0,
            seriesCount
          };
        });

        // Sort by name (most recent first)
        tournaments.sort((a, b) => b.name.localeCompare(a.name));

        return NextResponse.json({
          success: true,
          region: {
            code: region.id,
            name: region.name,
            fullName: region.name,
            country: region.shortName,
            playerCount: region.stats.players,
            teamCount: region.stats.teams
          },
          tournaments
        });
      }

      case 'tournament': {
        // Return teams for a specific league
        if (!tournamentId) {
          return NextResponse.json({ error: 'tournament parameter is required' }, { status: 400 });
        }

        // Find the league across all regions
        let foundLeague = null;
        let foundRegion = null;

        for (const [regionId, region] of Object.entries(hierarchy.regions) as [string, any][]) {
          if (region.leagues[tournamentId]) {
            foundLeague = region.leagues[tournamentId];
            foundRegion = region;
            break;
          }
        }

        if (!foundLeague) {
          return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
        }

        // Get team details from global teams index
        const teams = (foundLeague.teams || []).map((teamId: string) => {
          const team = hierarchy.teams[teamId];
          if (!team) return null;
          return {
            id: teamId,
            name: team.name,
            nameShortened: team.name,
            logoUrl: null,
            playerCount: Object.keys(team.players || {}).length,
            seriesCount: team.seriesCount || 0
          };
        }).filter(Boolean);

        // Sort by series count descending
        teams.sort((a: any, b: any) => b.seriesCount - a.seriesCount);

        return NextResponse.json({
          success: true,
          region: {
            code: foundRegion.id,
            name: foundRegion.name
          },
          tournament: {
            id: tournamentId,
            name: foundLeague.name,
            nameShortened: foundLeague.split || foundLeague.name,
            startDate: null,
            endDate: null
          },
          teams
        });
      }

      case 'team': {
        // Return players for a specific team
        if (!teamId) {
          return NextResponse.json({ error: 'team parameter is required' }, { status: 400 });
        }

        const team = hierarchy.teams[teamId];
        if (!team) {
          return NextResponse.json({ error: 'Team not found' }, { status: 404 });
        }

        // Get player details from global players index
        const players = Object.entries(team.players || {}).map(([playerId, playerName]: [string, any]) => {
          const player = hierarchy.players[playerId];
          return {
            id: playerId,
            nickname: playerName || player?.name || 'Unknown',
            seriesCount: player?.seriesCount || 0
          };
        });

        // Sort by series count descending
        players.sort((a: any, b: any) => b.seriesCount - a.seriesCount);

        return NextResponse.json({
          success: true,
          team: {
            id: teamId,
            name: team.name,
            nameShortened: team.name,
            logoUrl: teamLogosCache.get(teamId) || null,
            seriesCount: team.seriesCount
          },
          players
        });
      }

      case 'all-teams': {
        // Return all teams with players - use cache
        const now = Date.now();
        if (allTeamsCache && now - allTeamsCacheTimestamp < CACHE_DURATION) {
          return NextResponse.json(allTeamsCache);
        }

        // Optimize: Pre-filter and limit data processing
        const teamEntries = Object.entries(hierarchy.teams);
        const validTeams = teamEntries.filter(([_, team]: [string, any]) =>
          Object.keys(team.players || {}).length > 0
        );

        // Sort by seriesCount first, then slice to top 50 teams
        validTeams.sort((a, b) => ((b[1] as any).seriesCount || 0) - ((a[1] as any).seriesCount || 0));
        const topTeams = validTeams.slice(0, 50);

        const allTeams = topTeams.map(([teamId, team]: [string, any]) => ({
          id: teamId,
          name: team.name,
          nameShortened: team.name,
          logoUrl: teamLogosCache.get(teamId) || null,
          region: { code: team.leagues?.[0] || 'Unknown', name: team.leagues?.[0] || 'Unknown' },
          playerCount: Object.keys(team.players || {}).length,
          seriesCount: team.seriesCount || 0,
          players: Object.entries(team.players || {}).map(([pid, pname]) => ({
            id: pid,
            nickname: pname
          }))
        }));

        const result = {
          success: true,
          teams: allTeams,
          total: allTeams.length
        };

        // Cache the result
        allTeamsCache = result;
        allTeamsCacheTimestamp = now;

        return NextResponse.json(result);
      }

      case 'player': {
        // Return player details
        const playerId = searchParams.get('player');
        if (!playerId) {
          return NextResponse.json({ error: 'player parameter is required' }, { status: 400 });
        }

        const player = hierarchy.players[playerId];
        if (!player) {
          return NextResponse.json({ error: 'Player not found' }, { status: 404 });
        }

        // Get team details
        const teams = (player.teams || []).map((teamId: string) => {
          const team = hierarchy.teams[teamId];
          return team ? { id: teamId, name: team.name } : null;
        }).filter(Boolean);

        return NextResponse.json({
          success: true,
          player: {
            id: playerId,
            name: player.name,
            teams,
            seriesCount: player.seriesCount
          }
        });
      }

      case 'search': {
        // Search players and teams by name
        const query = searchParams.get('q')?.toLowerCase();
        if (!query || query.length < 2) {
          return NextResponse.json({
            success: true,
            players: [],
            teams: []
          });
        }

        // Search players
        const matchedPlayers = Object.entries(hierarchy.players)
          .filter(([_, player]: [string, any]) =>
            player.name?.toLowerCase().includes(query)
          )
          .slice(0, 15)
          .map(([playerId, player]: [string, any]) => {
            // Get first team name
            const firstTeamId = player.teams?.[0];
            const firstTeam = firstTeamId ? hierarchy.teams[firstTeamId] : null;
            return {
              id: playerId,
              name: player.name,
              teamId: firstTeamId,
              teamName: firstTeam?.name,
              seriesCount: player.seriesCount
            };
          })
          .sort((a, b) => (b.seriesCount || 0) - (a.seriesCount || 0));

        // Search teams
        const matchedTeams = Object.entries(hierarchy.teams)
          .filter(([_, team]: [string, any]) =>
            team.name?.toLowerCase().includes(query)
          )
          .slice(0, 10)
          .map(([teamId, team]: [string, any]) => ({
            id: teamId,
            name: team.name,
            seriesCount: team.seriesCount
          }))
          .sort((a, b) => (b.seriesCount || 0) - (a.seriesCount || 0));

        return NextResponse.json({
          success: true,
          players: matchedPlayers,
          teams: matchedTeams
        });
      }

      default:
        return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
    }
  } catch (error) {
    console.error('Hierarchy API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch data' },
      { status: 500 }
    );
  }
}
