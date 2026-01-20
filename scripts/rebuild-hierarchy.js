const fs = require('fs');
const path = require('path');

// 数据路径
const DATA_DIR = path.join(__dirname, '../data/lol');
const HIERARCHY_DIR = path.join(__dirname, 'grid-data-fetcher/data');

const SERIES_FILE = path.join(DATA_DIR, 'series.json');
const STATES_FILE = path.join(DATA_DIR, 'states.json');
const HIERARCHY_FILE = path.join(HIERARCHY_DIR, 'lol_hierarchy_clean.json');
const STATS_FILE = path.join(HIERARCHY_DIR, 'lol_stats.json');

console.log('=== 基于比赛数据重建层级关系 ===\n');

// 1. 加载数据
const series = JSON.parse(fs.readFileSync(SERIES_FILE, 'utf-8'));
const states = JSON.parse(fs.readFileSync(STATES_FILE, 'utf-8'));
const originalHierarchy = JSON.parse(fs.readFileSync(HIERARCHY_FILE, 'utf-8'));

console.log('已加载数据:');
console.log('  比赛数:', series.length);
console.log('  状态数:', Object.keys(states).length);

// 2. 从比赛数据提取战队-选手关系
const teamPlayers = {}; // teamId -> { name, logo, players: { playerId: { name, count } } }
const teamTournaments = {}; // teamId -> Set of tournament IDs

// 从 series 获取战队基本信息和联赛关系
series.forEach(s => {
  const tournamentId = s.tournament?.id;
  const parentTournamentId = s.tournament?.parent?.id;
  const grandparentTournamentId = s.tournament?.parent?.parent?.id;

  s.teams?.forEach(team => {
    const teamId = team.baseInfo?.id;
    if (!teamId) return;

    if (!teamPlayers[teamId]) {
      teamPlayers[teamId] = {
        id: teamId,
        name: team.baseInfo.name,
        nameShortened: team.baseInfo.nameShortened,
        logoUrl: team.baseInfo.logoUrl,
        players: {}
      };
    }

    // 记录战队参与的联赛
    if (!teamTournaments[teamId]) {
      teamTournaments[teamId] = new Set();
    }
    if (tournamentId) teamTournaments[teamId].add(tournamentId);
    if (parentTournamentId) teamTournaments[teamId].add(parentTournamentId);
    if (grandparentTournamentId) teamTournaments[teamId].add(grandparentTournamentId);
  });
});

// 从 states 获取选手信息
Object.values(states).forEach(state => {
  state.teams?.forEach(team => {
    if (!teamPlayers[team.id]) {
      teamPlayers[team.id] = {
        id: team.id,
        name: team.name,
        nameShortened: '',
        logoUrl: '',
        players: {}
      };
    }

    team.players?.forEach(player => {
      if (!teamPlayers[team.id].players[player.id]) {
        teamPlayers[team.id].players[player.id] = {
          id: player.id,
          nickname: player.name,
          matchCount: 0
        };
      }
      teamPlayers[team.id].players[player.id].matchCount++;
    });
  });
});

// 3. 提取联赛信息
const tournaments = {}; // tournamentId -> { name, teams: Set }
series.forEach(s => {
  const addTournament = (t, parent) => {
    if (!t?.id) return;
    if (!tournaments[t.id]) {
      tournaments[t.id] = {
        id: t.id,
        name: t.name,
        nameShortened: t.nameShortened || '',
        parent: parent,
        teams: new Set()
      };
    }
    // 添加战队到联赛
    s.teams?.forEach(team => {
      if (team.baseInfo?.id) {
        tournaments[t.id].teams.add(team.baseInfo.id);
      }
    });
  };

  addTournament(s.tournament, s.tournament?.parent?.id);
  addTournament(s.tournament?.parent, s.tournament?.parent?.parent?.id);
  addTournament(s.tournament?.parent?.parent, null);
});

// 4. 定义赛区映射
const regionMapping = {
  'LPL': { code: 'LPL', name: 'LPL', fullName: 'League of Legends Pro League', country: '中国' },
  'LCK': { code: 'LCK', name: 'LCK', fullName: 'League of Legends Champions Korea', country: '韩国' },
  'LEC': { code: 'LEC', name: 'LEC', fullName: 'League of Legends EMEA Championship', country: '欧洲' },
  'LCS': { code: 'LCS', name: 'LCS', fullName: 'League of Legends Championship Series', country: '北美' },
  'LTA North': { code: 'LTA North', name: 'LTA North', fullName: 'League of Legends Americas North', country: '北美' },
  'LTA South': { code: 'LTA South', name: 'LTA South', fullName: 'League of Legends Americas South', country: '南美' },
  'LTA Cross-Conference': { code: 'LTA Cross-Conference', name: 'LTA Cross-Conference', fullName: 'LTA Cross-Conference', country: '美洲' }
};

// 5. 从原层级数据中获取赛区-联赛映射
const tournamentRegionMap = {}; // tournamentId -> regionCode
originalHierarchy.forEach(region => {
  region.tournaments?.forEach(t => {
    tournamentRegionMap[t.id] = region.code;
  });
});

// 6. 构建新的层级数据
const newHierarchy = {};

// 计算每个赛区的比赛数量
const regionMatchCounts = {};
series.forEach(s => {
  const name = s.tournament?.name || s.tournament?.parent?.name || s.tournament?.parent?.parent?.name || '';
  let region = null;
  if (name.includes('LPL')) region = 'LPL';
  else if (name.includes('LCK')) region = 'LCK';
  else if (name.includes('LEC')) region = 'LEC';
  else if (name.includes('LCS')) region = 'LCS';
  else if (name.includes('LTA North')) region = 'LTA North';
  else if (name.includes('LTA South')) region = 'LTA South';
  else if (name.includes('LTA Cross')) region = 'LTA Cross-Conference';

  if (region) {
    regionMatchCounts[region] = (regionMatchCounts[region] || 0) + 1;
  }
});

// 初始化赛区
Object.values(regionMapping).forEach(r => {
  newHierarchy[r.code] = {
    ...r,
    tournaments: [],
    tournamentCount: 0,
    teamCount: 0,
    playerCount: 0,
    matchCount: regionMatchCounts[r.code] || 0
  };
});

// 按赛区组织联赛
Object.values(tournaments).forEach(t => {
  // 找到顶级联赛（无 parent 的）
  if (t.parent) return;

  // 确定赛区
  let regionCode = tournamentRegionMap[t.id];
  if (!regionCode) {
    // 从名称推断赛区
    if (t.name.includes('LPL')) regionCode = 'LPL';
    else if (t.name.includes('LCK')) regionCode = 'LCK';
    else if (t.name.includes('LEC')) regionCode = 'LEC';
    else if (t.name.includes('LCS')) regionCode = 'LCS';
    else if (t.name.includes('LTA North')) regionCode = 'LTA North';
    else if (t.name.includes('LTA South')) regionCode = 'LTA South';
    else if (t.name.includes('LTA Cross')) regionCode = 'LTA Cross-Conference';
    else return; // 跳过无法识别的联赛
  }

  if (!newHierarchy[regionCode]) return;

  // 获取该联赛的所有战队
  const tournamentTeams = new Set();

  // 添加直接参与的战队
  t.teams.forEach(teamId => tournamentTeams.add(teamId));

  // 添加子联赛的战队
  Object.values(tournaments).forEach(childT => {
    if (childT.parent === t.id) {
      childT.teams.forEach(teamId => tournamentTeams.add(teamId));
      // 检查孙子联赛
      Object.values(tournaments).forEach(grandchildT => {
        if (grandchildT.parent === childT.id) {
          grandchildT.teams.forEach(teamId => tournamentTeams.add(teamId));
        }
      });
    }
  });

  // 构建战队数据
  const teams = Array.from(tournamentTeams)
    .map(teamId => {
      const team = teamPlayers[teamId];
      if (!team) return null;

      const players = Object.values(team.players)
        .sort((a, b) => b.matchCount - a.matchCount);

      return {
        id: team.id,
        name: team.name,
        nameShortened: team.nameShortened,
        logoUrl: team.logoUrl,
        playerCount: players.length,
        players: players
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.playerCount - a.playerCount);

  if (teams.length === 0) return;

  newHierarchy[regionCode].tournaments.push({
    id: t.id,
    name: t.name,
    nameShortened: t.nameShortened,
    teamCount: teams.length,
    teams: teams
  });
});

// 7. 计算统计数据
let totalTournaments = 0;
let totalTeams = 0;
let totalPlayers = 0;

const finalHierarchy = Object.values(newHierarchy)
  .filter(r => r.tournaments.length > 0)
  .map(r => {
    // 排序联赛
    r.tournaments.sort((a, b) => {
      // 按年份和赛季排序
      const getOrder = (name) => {
        const year = name.match(/20\d{2}/)?.[0] || '0000';
        const split = name.includes('Split 3') ? 3 : name.includes('Split 2') ? 2 : name.includes('Split 1') ? 1 :
                      name.includes('Summer') ? 2 : name.includes('Spring') ? 1 : 0;
        return `${year}-${split}`;
      };
      return getOrder(b.name).localeCompare(getOrder(a.name));
    });

    r.tournamentCount = r.tournaments.length;

    // 统计唯一战队和选手
    const uniqueTeams = new Set();
    const uniquePlayers = new Set();
    r.tournaments.forEach(t => {
      t.teams.forEach(team => {
        uniqueTeams.add(team.id);
        team.players.forEach(p => uniquePlayers.add(p.id));
      });
    });

    r.teamCount = uniqueTeams.size;
    r.playerCount = uniquePlayers.size;

    totalTournaments += r.tournamentCount;
    totalTeams += r.teamCount;
    totalPlayers += r.playerCount;

    return r;
  });

// 8. 保存数据
console.log('\n写入新层级数据...');
fs.writeFileSync(HIERARCHY_FILE, JSON.stringify(finalHierarchy, null, 2));

const stats = {
  totalTournaments,
  totalTeams,
  totalPlayers,
  regionCount: finalHierarchy.length,
  updatedAt: new Date().toISOString(),
  dataSource: 'match-data-rebuilt'
};
fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));

console.log('\n=== 重建完成 ===');
console.log('赛区数:', finalHierarchy.length);
console.log('联赛数:', totalTournaments);
console.log('战队数:', totalTeams);
console.log('选手数:', totalPlayers);

// 验证
console.log('\n=== 验证 ===');
finalHierarchy.forEach(r => {
  const t = r.tournaments.find(t => t.name.includes('LPL - Split 3 2025') && !t.name.includes('('));
  if (t) {
    const fpx = t.teams.find(team => team.name.includes('FunPlus'));
    const tt = t.teams.find(team => team.name.includes('THUNDER'));
    if (fpx) console.log(`FunPlus Phoenix 选手数: ${fpx.playerCount}`);
    if (tt) console.log(`THUNDERTALKGAMING 选手数: ${tt.playerCount}`);
  }
});
