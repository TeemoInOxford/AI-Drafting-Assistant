/**
 * Use time-series logic to infer player positions
 * Based on the pattern of champions used before and after each game
 */

import * as fs from 'fs';
import * as path from 'path';

interface UnitKill {
  unitName: string;
  count: number;
}

interface Character {
  id: string;
  name: string;
}

interface Player {
  id: string;
  name: string;
  character?: Character;
  unitKills?: UnitKill[];
}

interface Team {
  id: string;
  name: string;
  players?: Player[];
}

interface Game {
  id: string;
  sequenceNumber: number;
  teams?: Team[];
}

interface Series {
  id: string;
  startedAt?: string;
  teams?: { id: string; name: string }[];
  games?: Game[];
}

function getUnitKillCount(player: Player, unitName: string): number {
  if (!player.unitKills) return 0;
  const kill = player.unitKills.find(u => u.unitName === unitName);
  return kill?.count || 0;
}

function normalizeChampionName(name: string): string {
  return name
    .replace(/\s+/g, '')
    .replace(/'/g, '')
    .replace(/\./g, '')
    .toLowerCase();
}

function findChampionPrior(championName: string): string[] {
  const { CHAMPION_POSITIONS } = require('../lib/positions');

  if (CHAMPION_POSITIONS[championName]) {
    return CHAMPION_POSITIONS[championName];
  }

  const normalized = normalizeChampionName(championName);
  for (const [key, positions] of Object.entries(CHAMPION_POSITIONS)) {
    if (normalizeChampionName(key) === normalized) {
      return positions as string[];
    }
  }

  const specialMappings: Record<string, string> = {
    'jarvaniv': 'JarvanIV',
    'reksai': 'RekSai',
    'leesin': 'LeeSin',
    'missfortune': 'MissFortune',
    'twistedfate': 'TwistedFate',
    'tahmkench': 'TahmKench',
    'xinzhao': 'XinZhao',
    'aurelionsol': 'AurelionSol',
    'drmundo': 'DrMundo',
    'masteryi': 'MasterYi',
    'monkeyking': 'MonkeyKing',
    'wukong': 'MonkeyKing',
    'renataglasc': 'Renata',
  };

  const mapped = specialMappings[normalized];
  if (mapped && CHAMPION_POSITIONS[mapped]) {
    return CHAMPION_POSITIONS[mapped];
  }

  return [];
}

interface GameRecord {
  seriesId: string;
  gameNumber: number;
  date: string;
  teamName: string;
  playerId: string;
  playerName: string;
  champion: string;
  neutralMinion: number;
  minion: number;
  championPrior: string[];
  inferredRole?: string;
}

async function main() {
  const dataDir = path.join(process.cwd(), 'data/grid_v2');
  const files = fs.readdirSync(dataDir).filter(f => f.startsWith('series_') && f.endsWith('.json'));

  console.log('正在收集所有比赛数据...\n');

  // 收集所有比赛记录，按选手和时间排序
  const playerGames = new Map<string, GameRecord[]>();

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    const series: Series = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    if (!series.games) continue;

    const seriesTeamNames: Record<string, string> = {};
    if (series.teams) {
      for (const t of series.teams) {
        seriesTeamNames[t.id] = t.name;
      }
    }

    for (const game of series.games) {
      if (!game.teams || game.teams.length !== 2) continue;

      for (const team of game.teams) {
        if (!team.players || team.players.length !== 5) continue;

        const teamName = seriesTeamNames[team.id] || team.name || 'Unknown';

        for (const player of team.players) {
          const record: GameRecord = {
            seriesId: series.id,
            gameNumber: game.sequenceNumber,
            date: series.startedAt || '1970-01-01',
            teamName,
            playerId: player.id,
            playerName: player.name,
            champion: player.character?.name || 'Unknown',
            neutralMinion: getUnitKillCount(player, 'neutralMinion'),
            minion: getUnitKillCount(player, 'minion'),
            championPrior: findChampionPrior(player.character?.name || ''),
          };

          const key = player.id;
          if (!playerGames.has(key)) {
            playerGames.set(key, []);
          }
          playerGames.get(key)!.push(record);
        }
      }
    }
  }

  console.log(`收集到 ${playerGames.size} 个选手的数据\n`);

  // 按时间排序每个选手的比赛
  for (const [playerId, games] of playerGames.entries()) {
    games.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.seriesId !== b.seriesId) return a.seriesId.localeCompare(b.seriesId);
      return a.gameNumber - b.gameNumber;
    });
  }

  console.log('正在使用时间序列逻辑推断位置...\n');

  // 对每个选手使用时间序列逻辑推断位置
  for (const [playerId, games] of playerGames.entries()) {
    for (let i = 0; i < games.length; i++) {
      const currentGame = games[i];

      // 规则1: 打野检测（100%准确）
      if (currentGame.neutralMinion >= 80) {
        currentGame.inferredRole = 'jungle';
        continue;
      }

      // 规则2: 辅助检测（需要在队伍中比较）
      // 这里我们先跳过，因为需要队伍数据

      // 规则3: 使用时间序列逻辑
      // 查看前后N场比赛的英雄和位置
      const windowSize = 5; // 前后各看5场
      const before = games.slice(Math.max(0, i - windowSize), i);
      const after = games.slice(i + 1, Math.min(games.length, i + 1 + windowSize));

      // 统计前后比赛中，英雄的 prior 位置分布
      const positionVotes: Record<string, number> = {
        top: 0,
        jungle: 0,
        mid: 0,
        bot: 0,
        support: 0,
      };

      // 前面的比赛
      for (const game of before) {
        if (game.inferredRole) {
          positionVotes[game.inferredRole] += 2; // 已确定的位置权重更高
        } else {
          for (const pos of game.championPrior) {
            positionVotes[pos] += 1;
          }
        }
      }

      // 后面的比赛
      for (const game of after) {
        if (game.inferredRole) {
          positionVotes[game.inferredRole] += 2;
        } else {
          for (const pos of game.championPrior) {
            positionVotes[pos] += 1;
          }
        }
      }

      // 当前英雄的 prior
      for (const pos of currentGame.championPrior) {
        positionVotes[pos] += 3; // 当前英雄的 prior 权重最高
      }

      // 选择得票最高的位置
      let maxVotes = 0;
      let bestPosition = 'mid'; // 默认中单

      for (const [pos, votes] of Object.entries(positionVotes)) {
        if (votes > maxVotes) {
          maxVotes = votes;
          bestPosition = pos;
        }
      }

      currentGame.inferredRole = bestPosition;
    }
  }

  console.log('正在统计结果...\n');

  // 统计每个选手的位置分布
  const playerPositions = new Map<string, {
    playerId: string;
    playerName: string;
    teamName: string;
    positions: Record<string, number>;
  }>();

  for (const [playerId, games] of playerGames.entries()) {
    const positions: Record<string, number> = {
      top: 0,
      jungle: 0,
      mid: 0,
      bot: 0,
      support: 0,
    };

    for (const game of games) {
      if (game.inferredRole) {
        positions[game.inferredRole]++;
      }
    }

    playerPositions.set(playerId, {
      playerId,
      playerName: games[0].playerName,
      teamName: games[0].teamName,
      positions,
    });
  }

  // 统计多位置选手
  const multiPositionPlayers: Array<{
    playerId: string;
    playerName: string;
    teamName: string;
    positions: string[];
    positionCounts: Record<string, number>;
  }> = [];

  for (const [playerId, data] of playerPositions.entries()) {
    const positions = Object.entries(data.positions)
      .filter(([_, count]) => count > 0)
      .map(([pos, _]) => pos);

    if (positions.length > 1) {
      multiPositionPlayers.push({
        playerId: data.playerId,
        playerName: data.playerName,
        teamName: data.teamName,
        positions,
        positionCounts: data.positions,
      });
    }
  }

  // 按位置数量排序
  multiPositionPlayers.sort((a, b) => {
    if (a.positions.length !== b.positions.length) {
      return b.positions.length - a.positions.length;
    }
    return a.playerName.localeCompare(b.playerName);
  });

  console.log('='.repeat(120));
  console.log('使用时间序列逻辑的结果\n');
  console.log(`总选手数: ${playerPositions.size}`);
  console.log(`单一位置选手: ${playerPositions.size - multiPositionPlayers.length}`);
  console.log(`多位置选手: ${multiPositionPlayers.length}\n`);

  console.log('多位置选手详情:\n');
  console.log('| # | 选手ID | 选手姓名 | 战队 | 位置数 | 位置详情 |');
  console.log('|---|--------|----------|------|--------|----------|');

  for (let i = 0; i < Math.min(50, multiPositionPlayers.length); i++) {
    const p = multiPositionPlayers[i];
    const details = p.positions
      .map(pos => `${pos}(${p.positionCounts[pos]})`)
      .join(', ');

    console.log(`| ${String(i + 1).padStart(3)} | ${p.playerId.padEnd(6)} | ${p.playerName.padEnd(12)} | ${p.teamName.slice(0, 20).padEnd(20)} | ${String(p.positions.length).padStart(6)} | ${details} |`);
  }

  if (multiPositionPlayers.length > 50) {
    console.log(`\n... 还有 ${multiPositionPlayers.length - 50} 个多位置选手未显示`);
  }

  console.log('\n' + '='.repeat(120));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
