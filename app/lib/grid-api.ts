import {
  GRIDSeriesResponse,
  GRIDPlayersResponse,
  GRIDSeriesNode,
  GRIDPlayerNode,
  League,
  Team,
  Player,
  CompositionsData,
} from './grid-types';

const GRID_API_URL = process.env.GRID_API_URL || 'https://api-op.grid.gg/central-data/graphql';
const GRID_API_KEY = process.env.GRID_API_KEY || '';
const LOL_TITLE_ID = '3';

// Memory cache
let cache: { data: CompositionsData; timestamp: number } | null = null;
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours (to avoid rate limits)

// Delay helper to avoid rate limits
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// GraphQL query for series with tournament hierarchy and teams
const SERIES_QUERY = `
query GetLoLSeries($first: Int!, $after: String) {
  allSeries(
    filter: { titleId: "3" }
    first: $first
    after: $after
    orderBy: StartTimeScheduled
    orderDirection: DESC
  ) {
    edges {
      node {
        id
        tournament {
          id
          name
          nameShortened
          parent {
            id
            name
            parent {
              id
              name
              parent {
                id
                name
              }
            }
          }
        }
        teams {
          baseInfo {
            id
            name
            nameShortened
            logoUrl
            colorPrimary
            colorSecondary
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;

// GraphQL query for players
const PLAYERS_QUERY = `
query GetLoLPlayers($first: Int!, $after: String) {
  players(
    filter: { titleId: "3" }
    first: $first
    after: $after
  ) {
    edges {
      node {
        id
        nickname
        team {
          id
          name
        }
        roles {
          id
          name
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;

async function graphqlRequest<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(GRID_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': GRID_API_KEY,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GRID API error: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(result.errors)}`);
  }

  return result as T;
}

// Fetch all series with pagination
async function fetchAllSeries(maxPages: number = 5): Promise<GRIDSeriesNode[]> {
  const allSeries: GRIDSeriesNode[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;
  let pageCount = 0;

  while (hasNextPage && pageCount < maxPages) {
    // Add delay between requests to avoid rate limits
    if (pageCount > 0) {
      await delay(500);
    }

    const result: GRIDSeriesResponse = await graphqlRequest<GRIDSeriesResponse>(SERIES_QUERY, {
      first: 50,
      after: cursor,
    });

    const edges = result.data.allSeries.edges;
    allSeries.push(...edges.map((edge) => edge.node));

    hasNextPage = result.data.allSeries.pageInfo.hasNextPage;
    cursor = result.data.allSeries.pageInfo.endCursor;
    pageCount++;
  }

  return allSeries;
}

// Fetch all players with pagination
async function fetchAllPlayers(maxPages: number = 5): Promise<GRIDPlayerNode[]> {
  const allPlayers: GRIDPlayerNode[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;
  let pageCount = 0;

  while (hasNextPage && pageCount < maxPages) {
    // Add delay between requests to avoid rate limits
    if (pageCount > 0) {
      await delay(500);
    }

    const result: GRIDPlayersResponse = await graphqlRequest<GRIDPlayersResponse>(PLAYERS_QUERY, {
      first: 50,
      after: cursor,
    });

    const edges = result.data.players.edges;
    allPlayers.push(...edges.map((edge) => edge.node));

    hasNextPage = result.data.players.pageInfo.hasNextPage;
    cursor = result.data.players.pageInfo.endCursor;
    pageCount++;
  }

  return allPlayers;
}

// Extract top-level league from tournament hierarchy
function getTopLevelLeague(tournament: GRIDSeriesNode['tournament']): { id: string; name: string } | null {
  if (!tournament) return null;

  let current = tournament;
  let topLevel = { id: tournament.id, name: tournament.name };

  // Traverse up the parent chain to find the top-level league
  while (current.parent) {
    topLevel = { id: current.parent.id, name: current.parent.name };
    current = current.parent as typeof tournament;
  }

  return topLevel;
}

// Build team-league mapping from series data
function buildTeamLeagueMap(series: GRIDSeriesNode[]): Map<string, { league: { id: string; name: string }; team: Team }> {
  const teamLeagueMap = new Map<string, { league: { id: string; name: string }; team: Team }>();

  for (const s of series) {
    const league = getTopLevelLeague(s.tournament);
    if (!league) continue;

    for (const teamData of s.teams) {
      const teamInfo = teamData.baseInfo;
      if (!teamInfo.id) continue;

      // Only add if not already present (keep first occurrence which is most recent)
      if (!teamLeagueMap.has(teamInfo.id)) {
        teamLeagueMap.set(teamInfo.id, {
          league,
          team: {
            id: teamInfo.id,
            name: teamInfo.name,
            nameShortened: teamInfo.nameShortened || teamInfo.name,
            logoUrl: teamInfo.logoUrl || null,
            colorPrimary: teamInfo.colorPrimary || null,
            colorSecondary: teamInfo.colorSecondary || null,
            players: [],
          },
        });
      }
    }
  }

  return teamLeagueMap;
}

// Build player-team mapping
function buildPlayerTeamMap(players: GRIDPlayerNode[]): Map<string, Player[]> {
  const playerTeamMap = new Map<string, Player[]>();

  for (const p of players) {
    if (!p.team?.id) continue;

    const player: Player = {
      id: p.id,
      nickname: p.nickname,
      roles: p.roles?.map(r => r.name) || [],
      teamId: p.team.id,
    };

    const existing = playerTeamMap.get(p.team.id) || [];
    existing.push(player);
    playerTeamMap.set(p.team.id, existing);
  }

  return playerTeamMap;
}

// Aggregate all data into CompositionsData
export async function fetchCompositionsData(): Promise<CompositionsData> {
  // Check cache
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return cache.data;
  }

  // Fetch data sequentially to avoid rate limits
  const series = await fetchAllSeries();
  await delay(1000); // Wait 1 second between major requests
  const players = await fetchAllPlayers();

  // Build mappings
  const teamLeagueMap = buildTeamLeagueMap(series);
  const playerTeamMap = buildPlayerTeamMap(players);

  // Assign players to teams
  for (const [teamId, teamData] of teamLeagueMap) {
    const teamPlayers = playerTeamMap.get(teamId) || [];
    teamData.team.players = teamPlayers;
  }

  // Group teams by league
  const leagueMap = new Map<string, League>();

  for (const [, teamData] of teamLeagueMap) {
    const { league, team } = teamData;

    if (!leagueMap.has(league.id)) {
      leagueMap.set(league.id, {
        id: league.id,
        name: league.name,
        teams: [],
      });
    }

    leagueMap.get(league.id)!.teams.push(team);
  }

  // Convert to array and sort
  const leagues = Array.from(leagueMap.values())
    .map(league => ({
      ...league,
      teams: league.teams.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      // Prioritize major leagues
      const majorLeagues = ['LCK', 'LEC', 'LPL', 'LTA', 'LCS', 'CBLOL', 'PCS', 'VCS'];
      const aIndex = majorLeagues.findIndex(l => a.name.includes(l));
      const bIndex = majorLeagues.findIndex(l => b.name.includes(l));

      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;

      return a.name.localeCompare(b.name);
    });

  const data: CompositionsData = {
    leagues,
    lastUpdated: new Date().toISOString(),
  };

  // Update cache
  cache = { data, timestamp: Date.now() };

  return data;
}

// Clear cache (useful for manual refresh)
export function clearCache(): void {
  cache = null;
}
