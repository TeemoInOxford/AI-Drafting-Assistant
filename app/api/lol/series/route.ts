import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

const CENTRAL_API_URL = "https://api-op.grid.gg/central-data/graphql";
const STATE_API_URL = "https://api-op.grid.gg/live-data-feed/series-state/graphql";
const API_KEY = "crM9kbj1QQVhzN6vm19DiYwJUl4lMoTdSHVBlMO8";
const LOL_TITLE_ID = "3";

// Local data paths
const DATA_DIR = path.join(process.cwd(), 'data/lol');
const SERIES_FILE = path.join(DATA_DIR, 'series.json');
const STATES_FILE = path.join(DATA_DIR, 'states.json');
const INDEX_FILE = path.join(DATA_DIR, 'index.json');
const HIERARCHY_FILE = path.join(DATA_DIR, 'hierarchy.json');

// Cache for local data
let localSeriesCache: any[] | null = null;
let localStatesCache: Record<string, any> | null = null;
let localIndexCache: any | null = null;
let localHierarchyCache: any | null = null;

// Load local data
function loadLocalSeries(): any[] {
  if (localSeriesCache) return localSeriesCache;
  try {
    if (fs.existsSync(SERIES_FILE)) {
      localSeriesCache = JSON.parse(fs.readFileSync(SERIES_FILE, 'utf-8'));
      return localSeriesCache || [];
    }
  } catch (e) {
    console.error('Failed to load local series:', e);
  }
  return [];
}

function loadLocalStates(): Record<string, any> {
  if (localStatesCache) return localStatesCache;
  try {
    if (fs.existsSync(STATES_FILE)) {
      localStatesCache = JSON.parse(fs.readFileSync(STATES_FILE, 'utf-8'));
      return localStatesCache || {};
    }
  } catch (e) {
    console.error('Failed to load local states:', e);
  }
  return {};
}

function loadLocalIndex(): any {
  if (localIndexCache) return localIndexCache;
  try {
    if (fs.existsSync(INDEX_FILE)) {
      localIndexCache = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
      return localIndexCache;
    }
  } catch (e) {
    console.error('Failed to load local index:', e);
  }
  return null;
}

function loadLocalHierarchy(): any {
  if (localHierarchyCache) return localHierarchyCache;
  try {
    if (fs.existsSync(HIERARCHY_FILE)) {
      localHierarchyCache = JSON.parse(fs.readFileSync(HIERARCHY_FILE, 'utf-8'));
      return localHierarchyCache;
    }
  } catch (e) {
    console.error('Failed to load local hierarchy:', e);
  }
  return null;
}

// Get all series IDs for a league (by league name)
function getSeriesIdsForLeague(leagueName: string): string[] {
  const hierarchy = loadLocalHierarchy();
  if (!hierarchy) return [];

  for (const region of Object.values(hierarchy.regions) as any[]) {
    if (region.leagues[leagueName]) {
      const league = region.leagues[leagueName];
      const seriesIds: string[] = [];
      Object.values(league.tournaments).forEach((t: any) => {
        if (t.seriesIds) {
          seriesIds.push(...t.seriesIds);
        }
      });
      return seriesIds;
    }
  }
  return [];
}

// Check if local data is available
function hasLocalData(): boolean {
  return fs.existsSync(SERIES_FILE) && fs.existsSync(STATES_FILE) && fs.existsSync(INDEX_FILE);
}

// Check if a series matches a tournament (including parent tournaments)
function seriesMatchesTournament(series: any, tournamentId: string): boolean {
  const t = series.tournament;
  if (!t) return false;
  return t.id === tournamentId ||
         t.parent?.id === tournamentId ||
         t.parent?.parent?.id === tournamentId;
}

// Get series matching a tournament (including parent tournaments) from local data
function getLocalSeriesByTournament(tournamentId: string): any[] {
  const allSeries = loadLocalSeries();
  return allSeries.filter((s: any) => seriesMatchesTournament(s, tournamentId));
}

interface SeriesData {
  id: string;
  startTimeScheduled: string;
  format: { name: string; nameShortened: string };
  type: string;
  tournament: {
    id: string;
    name: string;
    parent?: { id: string; name: string; parent?: { id: string; name: string } };
  };
  teams: Array<{
    baseInfo: { id: string; name: string; nameShortened: string; logoUrl: string };
    scoreAdvantage: number;
  }>;
}

// 目标统计
interface ObjectiveState {
  type: string;
  completionCount: number;
}

// 多杀统计
interface MultikillState {
  numberOfKills: number;
  count: number;
}

// 装备
interface InventoryItem {
  id: string;
  name: string;
}

// 选手状态（单局）
interface PlayerState {
  id: string;
  name: string;
  character?: { id: string; name: string };
  participationStatus?: string;
  kills?: number;
  deaths?: number;
  killAssistsGiven?: number;
  selfkills?: number;
  teamkills?: number;
  netWorth?: number;
  money?: number;
  structuresDestroyed?: number;
  structuresCaptured?: number;
  objectives?: ObjectiveState[];
  multikills?: MultikillState[];
  inventory?: { items: InventoryItem[] };
}

// BP动作
interface DraftAction {
  type: string;
  sequenceNumber: string;
  drafter: { id: string; type: string };
  draftable: { id: string; type: string; name: string };
}

// 战队状态（单局）
interface GameTeamState {
  id: string;
  name: string;
  score: number;
  side: string;
  won: boolean;
  netWorth?: number;
  money?: number;
  loadoutValue?: number;
  kills?: number;
  deaths?: number;
  killAssistsGiven?: number;
  selfkills?: number;
  teamkills?: number;
  structuresDestroyed?: number;
  structuresCaptured?: number;
  objectives?: ObjectiveState[];
  multikills?: MultikillState[];
  players: PlayerState[];
}

// 单局游戏状态
interface GameState {
  id: string;
  sequenceNumber: number;
  started?: boolean;
  finished: boolean;
  startedAt?: string;
  duration?: string;
  draftActions?: DraftAction[];
  teams: GameTeamState[];
}

// 系列赛战队状态
interface SeriesTeamState {
  id: string;
  name: string;
  score: number;
  won: boolean;
  kills?: number;
  deaths?: number;
  killAssistsGiven?: number;
  selfkills?: number;
  teamkills?: number;
  structuresDestroyed?: number;
  structuresCaptured?: number;
  objectives?: ObjectiveState[];
  multikills?: MultikillState[];
  players: { id: string; name: string }[];
}

// 系列赛状态
interface SeriesState {
  id: string;
  started: boolean;
  finished: boolean;
  format: string;
  startedAt?: string;
  duration?: string;
  teams: SeriesTeamState[];
  games: GameState[];
}

async function fetchAllLOLSeries(limit: number = 50): Promise<{ series: SeriesData[]; total: number }> {
  const query = `
    query {
      allSeries(first: ${limit}, filter: { titleId: "${LOL_TITLE_ID}" }) {
        totalCount
        edges {
          node {
            id
            startTimeScheduled
            format { name nameShortened }
            type
            tournament {
              id
              name
              parent { id name parent { id name } }
            }
            teams {
              baseInfo { id name nameShortened logoUrl }
              scoreAdvantage
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(CENTRAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify({ query }),
      cache: 'no-store',
    });

    const data = await response.json();

    if (data.errors) {
      console.error('GraphQL errors:', data.errors);
      return { series: [], total: 0 };
    }

    const seriesData = data.data?.allSeries;
    return {
      series: seriesData?.edges?.map((e: any) => e.node) || [],
      total: seriesData?.totalCount || 0
    };
  } catch (error) {
    console.error('Fetch error:', error);
    return { series: [], total: 0 };
  }
}

// Fetch series by tournament ID (includes child tournaments)
async function fetchSeriesByTournament(tournamentId: string, limit: number = 50): Promise<{ series: SeriesData[]; total: number }> {
  const query = `
    query {
      allSeries(first: ${limit}, filter: {
        titleId: "${LOL_TITLE_ID}",
        tournament: {
          id: { in: ["${tournamentId}"] },
          includeChildren: { equals: true }
        }
      }) {
        totalCount
        edges {
          node {
            id
            startTimeScheduled
            format { name nameShortened }
            type
            tournament {
              id
              name
              parent { id name parent { id name } }
            }
            teams {
              baseInfo { id name nameShortened logoUrl }
              scoreAdvantage
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(CENTRAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify({ query }),
      cache: 'no-store',
    });

    const data = await response.json();

    if (data.errors) {
      console.error('GraphQL errors:', data.errors);
      return { series: [], total: 0 };
    }

    const seriesData = data.data?.allSeries;
    return {
      series: seriesData?.edges?.map((e: any) => e.node) || [],
      total: seriesData?.totalCount || 0
    };
  } catch (error) {
    console.error('Fetch error:', error);
    return { series: [], total: 0 };
  }
}

// Fetch detailed series state from Series State API
async function fetchSeriesState(seriesId: string): Promise<SeriesState | null> {
  const query = `
    query {
      seriesState(id: "${seriesId}") {
        id
        started
        finished
        valid
        format
        startedAt
        updatedAt
        teams {
          id
          name
          score
          won
          kills
          deaths
          killAssistsGiven
          killAssistsReceived
          selfkills
          teamkills
          structuresDestroyed
          structuresCaptured
          objectives {
            type
            completionCount
          }
          multikills {
            numberOfKills
            count
          }
          players {
            id
            name
          }
        }
        games {
          id
          sequenceNumber
          started
          finished
          paused
          clock {
            currentSeconds
            ticking
          }
          map {
            name
          }
          draftActions {
            type
            sequenceNumber
            drafter {
              id
              type
            }
            draftable {
              id
              type
              name
            }
          }
          teams {
            id
            name
            score
            side
            won
            netWorth
            money
            loadoutValue
            kills
            deaths
            killAssistsGiven
            killAssistsReceived
            selfkills
            teamkills
            structuresDestroyed
            structuresCaptured
            objectives {
              type
              completionCount
            }
            multikills {
              numberOfKills
              count
            }
            players {
              id
              name
              character {
                id
                name
              }
              participationStatus
              kills
              deaths
              killAssistsGiven
              killAssistsReceived
              selfkills
              teamkills
              netWorth
              money
              loadoutValue
              structuresDestroyed
              structuresCaptured
              objectives {
                type
                completionCount
              }
              multikills {
                numberOfKills
                count
              }
              inventory {
                items {
                  id
                  name
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(STATE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify({ query }),
      cache: 'no-store',
    });

    const data = await response.json();

    if (data.errors) {
      console.error('Series State API errors:', data.errors);
      return null;
    }

    return data.data?.seriesState || null;
  } catch (error) {
    console.error('Series State fetch error:', error);
    return null;
  }
}

// Fetch series states in batches (to avoid too many parallel requests)
async function fetchSeriesStatesForList(seriesIds: string[]): Promise<Map<string, SeriesState>> {
  const statesMap = new Map<string, SeriesState>();
  const batchSize = 10; // Increased from 5 to 10 for faster processing

  for (let i = 0; i < seriesIds.length; i += batchSize) {
    const batch = seriesIds.slice(i, i + batchSize);
    const promises = batch.map(id => fetchSeriesState(id));
    const results = await Promise.all(promises);

    results.forEach((state, index) => {
      if (state) {
        statesMap.set(batch[index], state);
      }
    });
  }

  return statesMap;
}

// Fetch series by player ID
async function fetchSeriesByPlayer(playerId: string, limit: number = 50): Promise<{ series: SeriesData[]; total: number }> {
  const query = `
    query {
      allSeries(first: ${limit}, filter: {
        titleId: "${LOL_TITLE_ID}",
        livePlayerIds: { in: ["${playerId}"] }
      }, orderBy: StartTimeScheduled, orderDirection: DESC) {
        totalCount
        edges {
          node {
            id
            startTimeScheduled
            format { name nameShortened }
            type
            tournament {
              id
              name
              parent { id name parent { id name } }
            }
            teams {
              baseInfo { id name nameShortened logoUrl }
              scoreAdvantage
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(CENTRAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify({ query }),
      cache: 'no-store',
    });

    const data = await response.json();

    if (data.errors) {
      console.error('GraphQL errors (player search):', data.errors);
      return { series: [], total: 0 };
    }

    const seriesData = data.data?.allSeries;
    return {
      series: seriesData?.edges?.map((e: any) => e.node) || [],
      total: seriesData?.totalCount || 0
    };
  } catch (error) {
    console.error('Fetch error (player search):', error);
    return { series: [], total: 0 };
  }
}

// Get tournament series count (without full data)
async function getTournamentSeriesCount(tournamentId: string): Promise<number> {
  const query = `
    query {
      allSeries(first: 1, filter: {
        titleId: "${LOL_TITLE_ID}",
        tournament: {
          id: { in: ["${tournamentId}"] },
          includeChildren: { equals: true }
        }
      }) {
        totalCount
      }
    }
  `;

  try {
    const response = await fetch(CENTRAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify({ query }),
      cache: 'no-store',
    });

    const data = await response.json();
    return data.data?.allSeries?.totalCount || 0;
  } catch (error) {
    return 0;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tournamentId = searchParams.get('tournament');
  const seriesId = searchParams.get('seriesId');
  const playerId = searchParams.get('player');
  const type = searchParams.get('type') || 'tournament';
  const includeState = searchParams.get('includeState') === 'true';
  const useLocal = hasLocalData(); // Check if local data is available

  try {
    // Get tournament series count
    if (type === 'count' && tournamentId) {
      if (useLocal) {
        // First try to get series by league name from hierarchy
        const leagueSeriesIds = getSeriesIdsForLeague(tournamentId);

        if (leagueSeriesIds.length > 0) {
          // tournamentId is a league name
          return NextResponse.json({
            success: true,
            tournamentId,
            count: leagueSeriesIds.length,
            source: 'local'
          });
        }

        // Fall back to original tournament ID matching
        const matchingSeries = getLocalSeriesByTournament(tournamentId);
        return NextResponse.json({
          success: true,
          tournamentId,
          count: matchingSeries.length,
          source: 'local'
        });
      }
      const count = await getTournamentSeriesCount(tournamentId);
      return NextResponse.json({
        success: true,
        tournamentId,
        count
      });
    }

    // Get series by player
    if (type === 'player' && playerId) {
      if (useLocal) {
        const index = loadLocalIndex();
        const playerData = index?.players?.[playerId];
        if (playerData) {
          const allSeries = loadLocalSeries();
          const allStates = loadLocalStates();
          const playerSeriesIds = playerData.seriesIds || [];
          const playerSeries = allSeries
            .filter((s: any) => playerSeriesIds.includes(s.id))
            .sort((a: any, b: any) =>
              new Date(b.startTimeScheduled).getTime() - new Date(a.startTimeScheduled).getTime()
            );

          let seriesWithState = playerSeries;
          if (includeState) {
            seriesWithState = playerSeries.map((s: any) => ({
              ...s,
              state: allStates[s.id] || null
            }));
          }

          return NextResponse.json({
            success: true,
            playerId,
            series: seriesWithState,
            total: playerSeries.length,
            source: 'local'
          });
        }
      }

      const data = await fetchSeriesByPlayer(playerId, 50);
      let seriesWithState = data.series;
      if (includeState && data.series.length > 0) {
        const states = await fetchSeriesStatesForList(data.series.map(s => s.id));
        seriesWithState = data.series.map(s => ({
          ...s,
          state: states.get(s.id) || null
        }));
      }

      return NextResponse.json({
        success: true,
        playerId,
        series: seriesWithState,
        total: data.total
      });
    }

    // Get detailed state for a single series
    if (type === 'detail' && seriesId) {
      if (useLocal) {
        const allStates = loadLocalStates();
        const state = allStates[seriesId];
        if (state) {
          return NextResponse.json({
            success: true,
            seriesId,
            state,
            source: 'local'
          });
        }
      }

      const state = await fetchSeriesState(seriesId);
      if (!state) {
        return NextResponse.json({
          success: false,
          error: 'Series state not found'
        }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        seriesId,
        state
      });
    }

    if (type === 'all') {
      if (useLocal) {
        const allSeries = loadLocalSeries();
        const allStates = loadLocalStates();

        let seriesWithState: any[] = allSeries;
        if (includeState) {
          seriesWithState = allSeries.map((s: any) => ({
            ...s,
            state: allStates[s.id] || null
          }));
        }

        return NextResponse.json({
          success: true,
          series: seriesWithState,
          total: allSeries.length,
          source: 'local'
        });
      }

      const data = await fetchAllLOLSeries(50);

      // Optionally include state data
      let seriesWithState = data.series;
      if (includeState && data.series.length > 0) {
        const states = await fetchSeriesStatesForList(data.series.map(s => s.id));
        seriesWithState = data.series.map(s => ({
          ...s,
          state: states.get(s.id) || null
        }));
      }

      return NextResponse.json({
        success: true,
        series: seriesWithState,
        total: data.total
      });
    }

    if (type === 'tournament' && tournamentId) {
      if (useLocal) {
        const allSeries = loadLocalSeries();
        const allStates = loadLocalStates();

        // First try to get series by league name from hierarchy
        const leagueSeriesIds = getSeriesIdsForLeague(tournamentId);
        let matchingSeries: any[] = [];

        if (leagueSeriesIds.length > 0) {
          // tournamentId is a league name
          const seriesIdSet = new Set(leagueSeriesIds);
          matchingSeries = allSeries.filter((s: any) => seriesIdSet.has(s.id));
        } else {
          // Fall back to original tournament ID matching
          matchingSeries = getLocalSeriesByTournament(tournamentId);
        }

        // Sort by date (newest first)
        matchingSeries.sort((a: any, b: any) =>
          new Date(b.startTimeScheduled).getTime() - new Date(a.startTimeScheduled).getTime()
        );

        let seriesWithState = matchingSeries;
        if (includeState) {
          seriesWithState = matchingSeries.map((s: any) => ({
            ...s,
            state: allStates[s.id] || null
          }));
        }

        return NextResponse.json({
          success: true,
          tournamentId,
          series: seriesWithState,
          total: matchingSeries.length,
          source: 'local'
        });
      }

      const data = await fetchSeriesByTournament(tournamentId, 50);

      // Sort by date (newest first)
      data.series.sort((a, b) =>
        new Date(b.startTimeScheduled).getTime() - new Date(a.startTimeScheduled).getTime()
      );

      // Optionally include state data
      let seriesWithState = data.series;
      if (includeState && data.series.length > 0) {
        const states = await fetchSeriesStatesForList(data.series.map(s => s.id));
        seriesWithState = data.series.map(s => ({
          ...s,
          state: states.get(s.id) || null
        }));
      }

      return NextResponse.json({
        success: true,
        tournamentId,
        series: seriesWithState,
        total: data.total
      });
    }

    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  } catch (error) {
    console.error('Series API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch series data' },
      { status: 500 }
    );
  }
}
