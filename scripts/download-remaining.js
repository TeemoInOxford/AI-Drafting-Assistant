const fs = require('fs');
const path = require('path');

const CENTRAL_API_URL = "https://api-op.grid.gg/central-data/graphql";
const STATE_API_URL = "https://api-op.grid.gg/live-data-feed/series-state/graphql";
const API_KEY = "crM9kbj1QQVhzN6vm19DiYwJUl4lMoTdSHVBlMO8";
const LOL_TITLE_ID = "3";
const DATA_DIR = path.join(__dirname, '../data/lol');

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

async function main() {
  console.log('=== 补充下载剩余比赛 ===\n');

  // 加载现有数据
  const existingSeries = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'series.json'), 'utf-8'));
  const existingStates = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'states.json'), 'utf-8'));
  const existingIds = new Set(existingSeries.map(s => s.id));

  console.log(`现有比赛数: ${existingSeries.length}`);
  console.log(`现有状态数: ${Object.keys(existingStates).length}`);

  // 获取最后一个游标位置的比赛
  const lastSeries = existingSeries[existingSeries.length - 1];
  console.log(`最早的比赛日期: ${lastSeries?.startTimeScheduled}`);

  // 继续获取更多比赛
  console.log('\n获取更多比赛...');
  let hasMore = true;
  let cursor = null;
  const newSeries = [];
  let attempts = 0;
  const maxAttempts = 50;

  while (hasMore && attempts < maxAttempts) {
    attempts++;
    const afterClause = cursor ? `, after: "${cursor}"` : '';
    const query = `
      query {
        allSeries(first: 50${afterClause}, filter: { titleId: "${LOL_TITLE_ID}" }, orderBy: StartTimeScheduled, orderDirection: ASC) {
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
      console.error('API错误:', data.errors[0]?.message);
      break;
    }

    const seriesData = data.data?.allSeries;
    if (!seriesData) break;

    // 只添加不存在的比赛
    const batch = seriesData.edges.map(e => e.node).filter(s => !existingIds.has(s.id));
    batch.forEach(s => {
      existingIds.add(s.id);
      newSeries.push(s);
    });

    console.log(`  第${attempts}批: 获取${seriesData.edges.length}场, 新增${batch.length}场, 总新增${newSeries.length}场`);

    hasMore = seriesData.pageInfo.hasNextPage;
    cursor = seriesData.pageInfo.endCursor;

    // 如果这批全部已存在，说明已经重叠了
    if (batch.length === 0 && seriesData.edges.length > 0) {
      console.log('  已与现有数据重叠，停止获取');
      break;
    }

    await new Promise(r => setTimeout(r, 800));
  }

  if (newSeries.length > 0) {
    console.log(`\n新增 ${newSeries.length} 场比赛`);

    // 合并并保存
    const allSeries = [...existingSeries, ...newSeries];
    allSeries.sort((a, b) => new Date(b.startTimeScheduled) - new Date(a.startTimeScheduled));
    fs.writeFileSync(path.join(DATA_DIR, 'series.json'), JSON.stringify(allSeries, null, 2));
    console.log(`比赛列表已更新: ${allSeries.length} 场`);

    // 获取新比赛的状态
    console.log('\n获取新比赛的状态数据...');
    let stateCount = 0;
    for (let i = 0; i < newSeries.length; i += 5) {
      const batch = newSeries.slice(i, i + 5);
      const promises = batch.map(s => fetchSeriesState(s.id));
      const results = await Promise.all(promises);

      results.forEach((state, idx) => {
        if (state) {
          existingStates[batch[idx].id] = state;
          stateCount++;
        }
      });

      console.log(`  已处理 ${Math.min(i + 5, newSeries.length)} / ${newSeries.length} 场 (${stateCount} 场有状态)`);
      await new Promise(r => setTimeout(r, 800));
    }

    // 保存状态
    fs.writeFileSync(path.join(DATA_DIR, 'states.json'), JSON.stringify(existingStates, null, 2));
    console.log(`状态数据已更新: ${Object.keys(existingStates).length} 场`);
  } else {
    console.log('\n没有新的比赛需要下载');
  }

  // 重新生成索引
  console.log('\n重新生成索引...');
  const allSeries = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'series.json'), 'utf-8'));
  const allStates = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'states.json'), 'utf-8'));

  const index = {
    updatedAt: new Date().toISOString(),
    totalSeries: allSeries.length,
    totalStates: Object.keys(allStates).length,
    tournaments: {},
    players: {}
  };

  allSeries.forEach(s => {
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

  Object.entries(allStates).forEach(([seriesId, state]) => {
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

  fs.writeFileSync(path.join(DATA_DIR, 'index.json'), JSON.stringify(index, null, 2));
  console.log('索引已更新');

  console.log('\n=== 完成 ===');
  console.log(`总比赛数: ${allSeries.length}`);
  console.log(`总状态数: ${Object.keys(allStates).length}`);
}

main().catch(console.error);
