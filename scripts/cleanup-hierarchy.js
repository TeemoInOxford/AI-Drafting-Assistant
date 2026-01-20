const fs = require('fs');
const path = require('path');

// 数据路径
const DATA_DIR = path.join(__dirname, '../data/lol');
const HIERARCHY_DIR = path.join(__dirname, 'grid-data-fetcher/data');

const SERIES_FILE = path.join(DATA_DIR, 'series.json');
const STATES_FILE = path.join(DATA_DIR, 'states.json');
const INDEX_FILE = path.join(DATA_DIR, 'index.json');
const HIERARCHY_FILE = path.join(HIERARCHY_DIR, 'lol_hierarchy_clean.json');
const STATS_FILE = path.join(HIERARCHY_DIR, 'lol_stats.json');

console.log('=== 层级数据清理工具 ===\n');

// 1. 加载本地比赛数据
console.log('加载本地比赛数据...');
const series = JSON.parse(fs.readFileSync(SERIES_FILE, 'utf-8'));
const states = JSON.parse(fs.readFileSync(STATES_FILE, 'utf-8'));
const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));

console.log(`  比赛数量: ${series.length}`);
console.log(`  状态数量: ${Object.keys(states).length}`);

// 2. 提取有比赛数据的联赛ID（包括父级）
console.log('\n提取有比赛数据的联赛...');
const tournamentsWithMatches = new Set();
series.forEach(s => {
  const t = s.tournament;
  if (t?.id) {
    tournamentsWithMatches.add(t.id);
    if (t.parent?.id) {
      tournamentsWithMatches.add(t.parent.id);
      if (t.parent.parent?.id) {
        tournamentsWithMatches.add(t.parent.parent.id);
      }
    }
  }
});
console.log(`  有比赛数据的联赛ID数量: ${tournamentsWithMatches.size}`);

// 3. 提取有比赛数据的选手ID
console.log('\n提取有比赛数据的选手...');
const playersWithMatches = new Set(Object.keys(index.players));
console.log(`  有比赛数据的选手ID数量: ${playersWithMatches.size}`);

// 4. 加载层级数据
console.log('\n加载层级数据...');
const hierarchy = JSON.parse(fs.readFileSync(HIERARCHY_FILE, 'utf-8'));
let originalTournaments = 0;
let originalTeams = 0;
let originalPlayers = 0;
hierarchy.forEach(region => {
  originalTournaments += region.tournaments?.length || 0;
  region.tournaments?.forEach(t => {
    originalTeams += t.teams?.length || 0;
    t.teams?.forEach(team => {
      originalPlayers += team.players?.length || 0;
    });
  });
});
console.log(`  原始赛区数量: ${hierarchy.length}`);
console.log(`  原始联赛数量: ${originalTournaments}`);
console.log(`  原始战队数量: ${originalTeams}`);
console.log(`  原始选手数量: ${originalPlayers}`);

// 5. 过滤层级数据
console.log('\n过滤层级数据...');
let filteredTournaments = 0;
let filteredTeams = 0;
let filteredPlayers = 0;
let removedTournaments = [];
let removedTeams = [];

const filteredHierarchy = hierarchy.map(region => {
  // 过滤联赛
  const tournaments = region.tournaments?.filter(t => {
    const hasMatches = tournamentsWithMatches.has(t.id);
    if (!hasMatches) {
      removedTournaments.push({ region: region.name, name: t.name, id: t.id });
    }
    return hasMatches;
  }) || [];

  // 过滤每个联赛中的战队和选手
  const filteredTournamentList = tournaments.map(t => {
    // 过滤战队（保留有参赛选手的战队）
    const teams = t.teams?.map(team => {
      // 过滤选手
      const players = team.players?.filter(p => playersWithMatches.has(p.id)) || [];
      return {
        ...team,
        players,
        playerCount: players.length
      };
    }).filter(team => team.players.length > 0) || [];

    if (t.teams?.length > 0 && teams.length === 0) {
      removedTeams.push({ tournament: t.name, originalTeams: t.teams.length });
    }

    return {
      ...t,
      teams,
      teamCount: teams.length
    };
  }).filter(t => t.teams.length > 0); // 只保留有战队的联赛

  filteredTournaments += filteredTournamentList.length;
  filteredTournamentList.forEach(t => {
    filteredTeams += t.teams.length;
    t.teams.forEach(team => {
      filteredPlayers += team.players.length;
    });
  });

  return {
    ...region,
    tournaments: filteredTournamentList,
    tournamentCount: filteredTournamentList.length,
    teamCount: filteredTournamentList.reduce((sum, t) => sum + t.teams.length, 0),
    playerCount: filteredTournamentList.reduce((sum, t) =>
      sum + t.teams.reduce((s, team) => s + team.players.length, 0), 0)
  };
}).filter(region => region.tournaments.length > 0); // 只保留有联赛的赛区

console.log(`\n过滤后结果:`);
console.log(`  赛区数量: ${filteredHierarchy.length} (移除 ${hierarchy.length - filteredHierarchy.length})`);
console.log(`  联赛数量: ${filteredTournaments} (移除 ${originalTournaments - filteredTournaments})`);
console.log(`  战队数量: ${filteredTeams} (移除 ${originalTeams - filteredTeams})`);
console.log(`  选手数量: ${filteredPlayers} (移除 ${originalPlayers - filteredPlayers})`);

// 6. 显示被移除的联赛
if (removedTournaments.length > 0) {
  console.log(`\n被移除的联赛 (前20个):`);
  removedTournaments.slice(0, 20).forEach(t => {
    console.log(`  - [${t.region}] ${t.name}`);
  });
  if (removedTournaments.length > 20) {
    console.log(`  ... 还有 ${removedTournaments.length - 20} 个联赛`);
  }
}

// 7. 保存过滤后的数据
console.log('\n保存过滤后的数据...');
fs.writeFileSync(HIERARCHY_FILE, JSON.stringify(filteredHierarchy, null, 2));
console.log(`  层级数据已保存到 ${HIERARCHY_FILE}`);

// 8. 更新统计数据
const stats = {
  totalTournaments: filteredTournaments,
  totalTeams: filteredTeams,
  totalPlayers: filteredPlayers,
  regionCount: filteredHierarchy.length,
  updatedAt: new Date().toISOString(),
  dataSource: 'local-filtered'
};
fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
console.log(`  统计数据已保存到 ${STATS_FILE}`);

console.log('\n=== 清理完成 ===');
