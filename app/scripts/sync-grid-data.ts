#!/usr/bin/env node

/**
 * GRID API Complete Static Data Sync Script
 *
 * Features:
 * - Resumable sync (saves progress, can continue after interruption)
 * - Rate limit handling with exponential backoff
 * - Fetches ALL static data: Teams, Players, Tournaments, Series, Organizations
 *
 * Usage:
 *   npx tsx app/scripts/sync-grid-data.ts          # Resume or start sync
 *   npx tsx app/scripts/sync-grid-data.ts --reset  # Reset and start fresh
 *   npx tsx app/scripts/sync-grid-data.ts --status # Show sync status only
 */

import {
  initializeDatabase,
  getSyncProgress,
  updateSyncProgress,
  resetSyncProgress,
  batchUpsertTeams,
  batchUpsertPlayers,
  batchUpsertTournaments,
  batchUpsertSeries,
  batchUpsertOrganizations,
  batchUpsertTournamentTeams,
  updateSyncStatus,
  getDbStats,
  closeDatabase,
} from '../lib/lol-db';

const GRID_API_URL = process.env.GRID_API_URL || 'https://api-op.grid.gg/central-data/graphql';
const GRID_API_KEY = process.env.GRID_API_KEY || 'crM9kbj1QQVhzN6vm19DiYwJUl4lMoTdSHVBlMO8';
const LOL_TITLE_ID = '3';

// Rate limiting config
const BASE_DELAY = 2000; // 2 seconds between requests
const MAX_RETRIES = 5;
const BATCH_SIZE = 50; // Max items per request

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// GraphQL Queries
const TEAMS_QUERY = `
query GetTeams($first: Int!, $after: String) {
  teams(filter: { titleId: "${LOL_TITLE_ID}" }, first: $first, after: $after) {
    totalCount
    edges {
      node {
        id
        name
        nameShortened
        logoUrl
        colorPrimary
        colorSecondary
        organization {
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

const PLAYERS_QUERY = `
query GetPlayers($first: Int!, $after: String) {
  players(filter: { titleId: "${LOL_TITLE_ID}" }, first: $first, after: $after) {
    totalCount
    edges {
      node {
        id
        nickname
        team {
          id
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

const TOURNAMENTS_QUERY = `
query GetTournaments($first: Int!, $after: String) {
  tournaments(filter: { titleId: "${LOL_TITLE_ID}" }, first: $first, after: $after) {
    totalCount
    edges {
      node {
        id
        name
        nameShortened
        logoUrl
        startDate
        endDate
        parent {
          id
        }
        teams {
          id
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

const SERIES_QUERY = `
query GetSeries($first: Int!, $after: String) {
  allSeries(filter: { titleId: "${LOL_TITLE_ID}" }, first: $first, after: $after, orderBy: StartTimeScheduled, orderDirection: DESC) {
    totalCount
    edges {
      node {
        id
        tournament {
          id
        }
        format {
          id
          name
        }
        startTimeScheduled
        teams {
          baseInfo {
            id
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

const ORGANIZATIONS_QUERY = `
query GetOrganizations($first: Int!, $after: String) {
  organizations(first: $first, after: $after) {
    totalCount
    edges {
      node {
        id
        name
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

async function graphqlRequest<T>(
  query: string,
  variables: Record<string, unknown>,
  retryCount = 0
): Promise<T | null> {
  try {
    const response = await fetch(GRID_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': GRID_API_KEY,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (response.status === 429) {
      const waitTime = BASE_DELAY * Math.pow(2, retryCount);
      console.log(`  Rate limited. Waiting ${waitTime / 1000}s before retry ${retryCount + 1}/${MAX_RETRIES}...`);
      if (retryCount >= MAX_RETRIES) {
        console.log('  Max retries reached. Stopping this entity sync.');
        return null;
      }
      await delay(waitTime);
      return graphqlRequest(query, variables, retryCount + 1);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result: GraphQLResponse<T> = await response.json();

    if (result.errors) {
      const isRateLimit = result.errors.some(e => e.message.includes('rate limit'));
      if (isRateLimit && retryCount < MAX_RETRIES) {
        const waitTime = BASE_DELAY * Math.pow(2, retryCount);
        console.log(`  Rate limited (GraphQL). Waiting ${waitTime / 1000}s...`);
        await delay(waitTime);
        return graphqlRequest(query, variables, retryCount + 1);
      }
      console.log(`  GraphQL errors: ${result.errors.map(e => e.message).join(', ')}`);
      return null;
    }

    return result.data || null;
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      const waitTime = BASE_DELAY * Math.pow(2, retryCount);
      console.log(`  Request error: ${error}. Retrying in ${waitTime / 1000}s...`);
      await delay(waitTime);
      return graphqlRequest(query, variables, retryCount + 1);
    }
    throw error;
  }
}

// Generic paginated fetch function
async function fetchAllPaginated<T, N>(
  entityType: string,
  query: string,
  extractData: (data: T) => {
    totalCount: number;
    edges: { node: N }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  },
  processNodes: (nodes: N[]) => void
): Promise<number> {
  const progress = getSyncProgress(entityType);

  if (progress.completed) {
    console.log(`  ${entityType}: Already completed (${progress.fetchedCount} records)`);
    return progress.fetchedCount;
  }

  let cursor = progress.lastCursor;
  let fetchedCount = progress.fetchedCount;
  let totalCount = progress.totalCount;
  let hasNextPage = true;
  let pageNum = Math.floor(fetchedCount / BATCH_SIZE) + 1;

  console.log(`  ${entityType}: Starting from page ${pageNum} (${fetchedCount} already fetched)`);

  while (hasNextPage) {
    await delay(BASE_DELAY);

    const data = await graphqlRequest<T>(query, { first: BATCH_SIZE, after: cursor });

    if (!data) {
      console.log(`  ${entityType}: No data returned, saving progress and stopping`);
      updateSyncProgress(entityType, cursor, fetchedCount, totalCount, false);
      return fetchedCount;
    }

    const extracted = extractData(data);
    totalCount = extracted.totalCount;
    const nodes = extracted.edges.map(e => e.node);

    if (nodes.length > 0) {
      processNodes(nodes);
      fetchedCount += nodes.length;
    }

    hasNextPage = extracted.pageInfo.hasNextPage;
    cursor = extracted.pageInfo.endCursor;
    pageNum++;

    // Save progress every page
    updateSyncProgress(entityType, cursor, fetchedCount, totalCount, !hasNextPage);

    if (pageNum % 5 === 0 || !hasNextPage) {
      console.log(`  ${entityType}: ${fetchedCount}/${totalCount} (${((fetchedCount / totalCount) * 100).toFixed(1)}%)`);
    }
  }

  console.log(`  ${entityType}: Completed! ${fetchedCount} records`);
  return fetchedCount;
}

// Sync functions for each entity type
async function syncTeams(): Promise<number> {
  const orgsToInsert: { id: string; name: string }[] = [];

  const count = await fetchAllPaginated<
    { teams: { totalCount: number; edges: { node: any }[]; pageInfo: any } },
    any
  >(
    'teams',
    TEAMS_QUERY,
    (data) => data.teams,
    (nodes) => {
      const teams = nodes.map(n => ({
        id: n.id,
        name: n.name,
        nameShortened: n.nameShortened,
        logoUrl: n.logoUrl,
        colorPrimary: n.colorPrimary,
        colorSecondary: n.colorSecondary,
        organizationId: n.organization?.id,
      }));
      batchUpsertTeams(teams);

      // Collect organizations
      for (const n of nodes) {
        if (n.organization?.id && n.organization?.name) {
          orgsToInsert.push({ id: n.organization.id, name: n.organization.name });
        }
      }
    }
  );

  // Insert collected organizations
  if (orgsToInsert.length > 0) {
    batchUpsertOrganizations(orgsToInsert);
  }

  return count;
}

async function syncPlayers(): Promise<number> {
  return fetchAllPaginated<
    { players: { totalCount: number; edges: { node: any }[]; pageInfo: any } },
    any
  >(
    'players',
    PLAYERS_QUERY,
    (data) => data.players,
    (nodes) => {
      const players = nodes.map(n => ({
        id: n.id,
        nickname: n.nickname,
        teamId: n.team?.id,
        roles: n.roles?.map((r: any) => r.name) || [],
      }));
      batchUpsertPlayers(players);
    }
  );
}

async function syncTournaments(): Promise<number> {
  const tournamentTeams: { tournamentId: string; teamId: string }[] = [];

  const count = await fetchAllPaginated<
    { tournaments: { totalCount: number; edges: { node: any }[]; pageInfo: any } },
    any
  >(
    'tournaments',
    TOURNAMENTS_QUERY,
    (data) => data.tournaments,
    (nodes) => {
      const tournaments = nodes.map(n => ({
        id: n.id,
        name: n.name,
        nameShortened: n.nameShortened,
        logoUrl: n.logoUrl,
        startDate: n.startDate,
        endDate: n.endDate,
        parentId: n.parent?.id,
      }));
      batchUpsertTournaments(tournaments);

      // Collect tournament-team relations
      for (const n of nodes) {
        if (n.teams) {
          for (const team of n.teams) {
            if (team.id) {
              tournamentTeams.push({ tournamentId: n.id, teamId: team.id });
            }
          }
        }
      }
    }
  );

  // Insert tournament-team relations
  if (tournamentTeams.length > 0) {
    batchUpsertTournamentTeams(tournamentTeams);
  }

  return count;
}

async function syncSeries(): Promise<number> {
  return fetchAllPaginated<
    { allSeries: { totalCount: number; edges: { node: any }[]; pageInfo: any } },
    any
  >(
    'series',
    SERIES_QUERY,
    (data) => data.allSeries,
    (nodes) => {
      const seriesList = nodes.map(n => ({
        id: n.id,
        tournamentId: n.tournament?.id,
        formatId: n.format?.id,
        formatName: n.format?.name,
        startTime: n.startTimeScheduled,
        teamIds: n.teams?.map((t: any) => t.baseInfo?.id).filter(Boolean) || [],
      }));
      batchUpsertSeries(seriesList);
    }
  );
}

async function syncOrganizations(): Promise<number> {
  return fetchAllPaginated<
    { organizations: { totalCount: number; edges: { node: any }[]; pageInfo: any } },
    any
  >(
    'organizations',
    ORGANIZATIONS_QUERY,
    (data) => data.organizations,
    (nodes) => {
      const orgs = nodes.map(n => ({
        id: n.id,
        name: n.name,
      }));
      batchUpsertOrganizations(orgs);
    }
  );
}

async function showStatus(): Promise<void> {
  console.log('\n=== Sync Status ===\n');

  const entities = ['teams', 'players', 'tournaments', 'series', 'organizations'];
  for (const entity of entities) {
    const progress = getSyncProgress(entity);
    const status = progress.completed ? '✓ Complete' : progress.fetchedCount > 0 ? '⏳ In Progress' : '○ Not Started';
    console.log(`${entity}: ${status} (${progress.fetchedCount}/${progress.totalCount || '?'})`);
  }

  console.log('\n=== Database Stats ===\n');
  const stats = getDbStats();
  console.log(`Organizations: ${stats.organizations}`);
  console.log(`Tournaments: ${stats.tournaments}`);
  console.log(`Teams: ${stats.teams}`);
  console.log(`Players: ${stats.players}`);
  console.log(`Series: ${stats.series}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const shouldReset = args.includes('--reset');
  const statusOnly = args.includes('--status');

  console.log('=== GRID Static Data Sync ===\n');
  console.log(`Started at: ${new Date().toISOString()}\n`);

  // Initialize database
  initializeDatabase();

  if (statusOnly) {
    await showStatus();
    closeDatabase();
    return;
  }

  if (shouldReset) {
    console.log('Resetting sync progress...\n');
    resetSyncProgress();
  }

  try {
    // Sync in order: Teams -> Players -> Tournaments -> Series -> Organizations
    // Teams first because players reference teams
    // Tournaments after teams because they reference teams
    // Series last because they reference tournaments and teams

    console.log('\n[1/5] Syncing Teams...');
    const teamsCount = await syncTeams();

    console.log('\n[2/5] Syncing Players...');
    const playersCount = await syncPlayers();

    console.log('\n[3/5] Syncing Tournaments...');
    const tournamentsCount = await syncTournaments();

    console.log('\n[4/5] Syncing Series...');
    const seriesCount = await syncSeries();

    console.log('\n[5/5] Syncing Organizations...');
    const orgsCount = await syncOrganizations();

    // Update final sync status
    updateSyncStatus({
      teamsCount,
      playersCount,
      tournamentsCount,
      seriesCount,
      organizationsCount: orgsCount,
    });

    console.log('\n=== Sync Complete ===\n');
    await showStatus();

  } catch (error) {
    console.error('\nSync failed:', error);
    console.log('\nProgress has been saved. Run the script again to resume.');
    throw error;
  } finally {
    closeDatabase();
  }

  console.log(`\nFinished at: ${new Date().toISOString()}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
