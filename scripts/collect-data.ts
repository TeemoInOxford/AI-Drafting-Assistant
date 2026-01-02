/**
 * GRID API 数据采集脚本
 * 下载 LOL 职业比赛数据并存入 SQLite
 */

import Database from 'better-sqlite3';
import path from 'path';

const GRID_API_KEY = 'crM9kbj1QQVhzN6vm19DiYwJUl4lMoTdSHVBlMO8';
const CENTRAL_DATA_URL = 'https://api-op.grid.gg/central-data/graphql';
const FILE_DOWNLOAD_URL = 'https://api.grid.gg/file-download';
const DB_PATH = path.join(process.cwd(), 'app/lol/data/lol_drafts.db');

// LOL Title ID
const LOL_TITLE_ID = 3;

interface SeriesNode {
  id: string;
  startTimeScheduled: string;
  tournament: { name: string };
  teams: Array<{ baseInfo: { name: string } }>;
}

interface DraftAction {
  type: 'ban' | 'pick';
  sequenceNumber: string;
  drafter: { id: string; type: string };
  draftable: { name: string };
}

interface GameTeam {
  id: string;
  name: string;
  side: 'blue' | 'red';
  won: boolean;
  players: Array<{
    id: string;
    name: string;
    character: { name: string };
  }>;
}

interface Game {
  id: string;
  sequenceNumber: number;
  finished: boolean;
  duration: { seconds: number };
  draftActions: DraftAction[];
  teams: GameTeam[];
}

interface SeriesState {
  id: string;
  format: string;
  teams: Array<{ id: string; name: string; won: boolean }>;
  games: Game[];
}

async function graphqlQuery(url: string, query: string): Promise<any> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': GRID_API_KEY,
    },
    body: JSON.stringify({ query }),
  });

  const data = await response.json();
  if (data.errors) {
    throw new Error(`GraphQL Error: ${JSON.stringify(data.errors)}`);
  }
  return data.data;
}

async function fetchSeriesList(limit: number = 50, cursor?: string): Promise<{ series: SeriesNode[]; nextCursor?: string }> {
  const afterClause = cursor ? `, after: "${cursor}"` : '';
  const query = `{
    allSeries(first: ${limit}${afterClause}, filter: { titleId: ${LOL_TITLE_ID} }, orderBy: StartTimeScheduled, orderDirection: DESC) {
      edges {
        node {
          id
          startTimeScheduled
          tournament { name }
          teams { baseInfo { name } }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }`;

  const data = await graphqlQuery(CENTRAL_DATA_URL, query);
  const edges = data.allSeries.edges;
  const pageInfo = data.allSeries.pageInfo;

  return {
    series: edges.map((e: any) => e.node),
    nextCursor: pageInfo.hasNextPage ? pageInfo.endCursor : undefined,
  };
}

async function fetchSeriesState(seriesId: string): Promise<SeriesState | null> {
  const url = `${FILE_DOWNLOAD_URL}/end-state/grid/series/${seriesId}`;

  try {
    const response = await fetch(url, {
      headers: { 'x-api-key': GRID_API_KEY },
    });

    if (!response.ok) {
      console.log(`  Series ${seriesId}: No data available (${response.status})`);
      return null;
    }

    const data = await response.json();
    return data.seriesState;
  } catch (error) {
    console.log(`  Series ${seriesId}: Failed to fetch - ${error}`);
    return null;
  }
}

function saveSeriesData(db: Database.Database, seriesState: SeriesState, tournamentName: string, startTime: string) {
  const insertTeam = db.prepare(`
    INSERT OR IGNORE INTO teams (id, name) VALUES (?, ?)
  `);

  const insertPlayer = db.prepare(`
    INSERT OR IGNORE INTO players (id, name, team_id) VALUES (?, ?, ?)
  `);

  const insertSeries = db.prepare(`
    INSERT OR REPLACE INTO series (id, tournament_name, team1_id, team2_id, winner_team_id, format, start_time)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertGame = db.prepare(`
    INSERT OR REPLACE INTO games (id, series_id, game_number, blue_team_id, red_team_id, winner_team_id, duration_seconds)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertDraftAction = db.prepare(`
    INSERT OR REPLACE INTO draft_actions (game_id, sequence_number, action_type, team_id, champion_name)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertPlayerPick = db.prepare(`
    INSERT OR REPLACE INTO player_picks (game_id, player_id, team_id, champion_name)
    VALUES (?, ?, ?, ?)
  `);

  // 开始事务
  const transaction = db.transaction(() => {
    // 保存队伍
    for (const team of seriesState.teams) {
      insertTeam.run(team.id, team.name);
    }

    // 找出赢家
    const winnerTeam = seriesState.teams.find(t => t.won);

    // 保存系列赛
    insertSeries.run(
      seriesState.id,
      tournamentName,
      seriesState.teams[0]?.id,
      seriesState.teams[1]?.id,
      winnerTeam?.id || null,
      seriesState.format,
      startTime
    );

    // 保存每局比赛
    for (const game of seriesState.games) {
      if (!game.finished || !game.teams || game.teams.length < 2) continue;

      const blueTeam = game.teams.find(t => t.side === 'blue');
      const redTeam = game.teams.find(t => t.side === 'red');
      const gameWinner = game.teams.find(t => t.won);

      if (!blueTeam || !redTeam) continue;

      insertGame.run(
        game.id,
        seriesState.id,
        game.sequenceNumber || 1,
        blueTeam.id,
        redTeam.id,
        gameWinner?.id || null,
        game.duration?.seconds || 0
      );

      // 保存 BP 动作
      for (let i = 0; i < game.draftActions.length; i++) {
        const action = game.draftActions[i];
        insertDraftAction.run(
          game.id,
          i + 1,
          action.type,
          action.drafter.id,
          action.draftable.name
        );
      }

      // 保存选手选择
      for (const team of game.teams) {
        for (const player of team.players || []) {
          insertTeam.run(team.id, team.name);
          insertPlayer.run(player.id, player.name, team.id);

          if (player.character?.name) {
            insertPlayerPick.run(
              game.id,
              player.id,
              team.id,
              player.character.name
            );
          }
        }
      }
    }
  });

  transaction();
}

async function collectData(maxSeries: number = 100) {
  console.log('Starting data collection...');
  console.log(`Target: ${maxSeries} series\n`);

  // 打开数据库
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');

  let collected = 0;
  let cursor: string | undefined;
  let page = 1;

  try {
    while (collected < maxSeries) {
      const batchSize = Math.min(50, maxSeries - collected);
      console.log(`\nPage ${page}: Fetching series list...`);

      const { series, nextCursor } = await fetchSeriesList(batchSize, cursor);

      if (series.length === 0) {
        console.log('No more series available.');
        break;
      }

      for (const s of series) {
        if (collected >= maxSeries) break;

        process.stdout.write(`  [${collected + 1}/${maxSeries}] Series ${s.id}: `);

        const state = await fetchSeriesState(s.id);

        if (state && state.games && state.games.length > 0) {
          saveSeriesData(db, state, s.tournament?.name || 'Unknown', s.startTimeScheduled);
          console.log(`✓ Saved (${state.games.length} games)`);
          collected++;
        } else {
          console.log('✗ No valid data');
        }

        // 避免请求过快
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      cursor = nextCursor;
      page++;

      if (!cursor) {
        console.log('Reached end of series list.');
        break;
      }
    }
  } finally {
    db.close();
  }

  console.log(`\n✓ Collection complete! Saved ${collected} series.`);
}

// 运行
const maxSeries = parseInt(process.argv[2] || '100', 10);
collectData(maxSeries).catch(console.error);
