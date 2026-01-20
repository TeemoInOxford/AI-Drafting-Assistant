const fs = require('fs');
const path = require('path');

const CENTRAL_API_URL = "https://api-op.grid.gg/central-data/graphql";
const STATE_API_URL = "https://api-op.grid.gg/live-data-feed/series-state/graphql";
const API_KEY = "crM9kbj1QQVhzN6vm19DiYwJUl4lMoTdSHVBlMO8";
const LOL_TITLE_ID = "3";
const DATA_DIR = path.join(__dirname, '../data/lol');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function fetchGraphQL(url, query) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({ query }),
  });
  return response.json();
}

async function fetchAllSeries() {
  console.log('获取所有LOL比赛列表...');
  const allSeries = [];
  let hasMore = true;
  let cursor = null;

  while (hasMore) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';
    const query = `
      query {
        allSeries(first: 50${afterClause}, filter: { titleId: "${LOL_TITLE_ID}" }, orderBy: StartTimeScheduled, orderDirection: DESC) {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              startTimeScheduled
              format { name nameShortened }
              type
              tournament {
                id
                name
                nameShortened
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

    const data = await fetchGraphQL(CENTRAL_API_URL, query);

    if (data.errors) {
      console.error('API错误:', data.errors);
      break;
    }

    const seriesData = data.data?.allSeries;
    if (!seriesData) break;

    const newSeries = seriesData.edges.map(e => e.node);
    allSeries.push(...newSeries);

    console.log(`  已获取 ${allSeries.length} / ${seriesData.totalCount} 场比赛`);

    hasMore = seriesData.pageInfo.hasNextPage;
    cursor = seriesData.pageInfo.endCursor;

    // 防止速率限制 - 增加延迟
    await new Promise(r => setTimeout(r, 500));
  }

  return allSeries;
}

async function fetchSeriesState(seriesId) {
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
          structuresDestroyed
          objectives { type completionCount }
          multikills { numberOfKills count }
          players { id name }
        }
        games {
          id
          sequenceNumber
          started
          finished
          paused
          clock { currentSeconds ticking }
          map { name }
          draftActions {
            type
            sequenceNumber
            drafter { id type }
            draftable { id type name }
          }
          teams {
            id
            name
            score
            side
            won
            netWorth
            kills
            deaths
            objectives { type completionCount }
            multikills { numberOfKills count }
            players {
              id
              name
              character { id name }
              participationStatus
              kills
              deaths
              killAssistsGiven
              netWorth
              objectives { type completionCount }
              multikills { numberOfKills count }
              inventory { items { id name } }
            }
          }
        }
      }
    }
  `;

  try {
    const data = await fetchGraphQL(STATE_API_URL, query);
    if (data.errors) {
      return null;
    }
    return data.data?.seriesState || null;
  } catch (e) {
    return null;
  }
}

async function fetchAllStates(seriesList) {
  console.log('\n获取比赛状态数据...');
  const states = {};
  const batchSize = 5;

  for (let i = 0; i < seriesList.length; i += batchSize) {
    const batch = seriesList.slice(i, i + batchSize);
    const promises = batch.map(s => fetchSeriesState(s.id));
    const results = await Promise.all(promises);

    results.forEach((state, idx) => {
      if (state) {
        states[batch[idx].id] = state;
      }
    });

    const completed = Math.min(i + batchSize, seriesList.length);
    const withState = Object.keys(states).length;
    console.log(`  已处理 ${completed} / ${seriesList.length} 场比赛 (${withState} 场有状态数据)`);

    // 防止速率限制 - 增加延迟
    await new Promise(r => setTimeout(r, 500));
  }

  return states;
}

async function main() {
  console.log('=== LOL比赛数据下载工具 ===\n');

  // 1. 获取所有比赛列表
  const series = await fetchAllSeries();
  console.log(`\n共获取 ${series.length} 场比赛`);

  // 保存比赛列表
  const seriesFile = path.join(DATA_DIR, 'series.json');
  fs.writeFileSync(seriesFile, JSON.stringify(series, null, 2));
  console.log(`比赛列表已保存到 ${seriesFile}`);

  // 2. 获取状态数据
  const states = await fetchAllStates(series);
  console.log(`\n共获取 ${Object.keys(states).length} 场比赛的状态数据`);

  // 保存状态数据
  const statesFile = path.join(DATA_DIR, 'states.json');
  fs.writeFileSync(statesFile, JSON.stringify(states, null, 2));
  console.log(`状态数据已保存到 ${statesFile}`);

  // 3. 生成索引
  const index = {
    updatedAt: new Date().toISOString(),
    totalSeries: series.length,
    totalStates: Object.keys(states).length,
    tournaments: {},
    players: {}
  };

  // 按联赛分组
  series.forEach(s => {
    const tournamentId = s.tournament?.id;
    if (tournamentId) {
      if (!index.tournaments[tournamentId]) {
        index.tournaments[tournamentId] = {
          name: s.tournament.name,
          count: 0,
          seriesIds: []
        };
      }
      index.tournaments[tournamentId].count++;
      index.tournaments[tournamentId].seriesIds.push(s.id);
    }
  });

  // 按选手分组 (从状态数据中提取)
  Object.entries(states).forEach(([seriesId, state]) => {
    if (state?.teams) {
      state.teams.forEach(team => {
        if (team.players) {
          team.players.forEach(player => {
            if (!index.players[player.id]) {
              index.players[player.id] = {
                name: player.name,
                count: 0,
                seriesIds: []
              };
            }
            if (!index.players[player.id].seriesIds.includes(seriesId)) {
              index.players[player.id].count++;
              index.players[player.id].seriesIds.push(seriesId);
            }
          });
        }
      });
    }
  });

  const indexFile = path.join(DATA_DIR, 'index.json');
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
  console.log(`索引已保存到 ${indexFile}`);

  console.log('\n=== 下载完成 ===');
  console.log(`比赛列表: ${(fs.statSync(seriesFile).size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`状态数据: ${(fs.statSync(statesFile).size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`索引文件: ${(fs.statSync(indexFile).size / 1024).toFixed(2)} KB`);
}

main().catch(console.error);
