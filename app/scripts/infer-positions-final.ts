/**
 * Improved position inference with time-series logic
 * Rules:
 * 1. Jungle: highest neutralMinion in team (no threshold)
 * 2. Support: lowest minion in team (no threshold)
 * 3. Top/Mid/Bot: use time-series logic based on champion patterns
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
  teamId: string;
  playerId: string;
  playerName: string;
  champion: string;
  neutralMinion: number;
  minion: number;
  championPrior: string[];
  inferredRole?: string;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface TeamGameData {
  seriesId: string;
  gameNumber: number;
  teamId: string;
  players: GameRecord[];
}

async function main() {
  const dataDir = path.join(process.cwd(), 'data/grid_v2');
  const files = fs.readdirSync(dataDir).filter(f => f.startsWith('series_') && f.endsWith('.json'));

  console.log('正在收集所有比赛数据...\n');

  // 收集所有比赛记录
  const allGames: TeamGameData[] = [];
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
        const teamGamePlayers: GameRecord[] = [];

        for (const player of team.players) {
          const record: GameRecord = {
            seriesId: series.id,
            gameNumber: game.sequenceNumber,
            date: series.startedAt || '1970-01-01',
            teamName,
            teamId: team.id,
            playerId: player.id,
            playerName: player.name,
            champion: player.character?.name || 'Unknown',
            neutralMinion: getUnitKillCount(player, 'neutralMinion'),
            minion: getUnitKillCount(player, 'minion'),
            championPrior: findChampionPrior(player.character?.name || ''),
          };

          teamGamePlayers.push(record);

          const key = player.id;
          if (!playerGames.has(key)) {
            playerGames.set(key, []);
          }
          playerGames.get(key)!.push(record);
        }

        allGames.push({
          seriesId: series.id,
          gameNumber: game.sequenceNumber,
          teamId: team.id,
          players: teamGamePlayers,
        });
      }
    }
  }

  console.log(`收集到 ${playerGames.size} 个选手的数据`);
  console.log(`收集到 ${allGames.length} 场比赛（team-games）\n`);

  // 第一步：在每场比赛中确定打野和辅助
  console.log('第一步：确定每场比赛的打野和辅助...\n');

  for (const teamGame of allGames) {
    // 打野：野怪数最高的
    const sortedByNeutral = [...teamGame.players].sort((a, b) => b.neutralMinion - a.neutralMinion);
    const jungler = sortedByNeutral[0];
    jungler.inferredRole = 'jungle';
    jungler.confidence = 'HIGH';

    // 辅助：小兵数最低的（排除打野）
    const nonJunglers = teamGame.players.filter(p => p !== jungler);
    const sortedByMinion = [...nonJunglers].sort((a, b) => a.minion - b.minion);
    const support = sortedByMinion[0];
    support.inferredRole = 'support';
    support.confidence = 'HIGH';
  }

  // 按时间排序每个选手的比赛
  for (const [playerId, games] of playerGames.entries()) {
    games.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.seriesId !== b.seriesId) return a.seriesId.localeCompare(b.seriesId);
      return a.gameNumber - b.gameNumber;
    });
  }

  console.log('第二步：使用时间序列逻辑推断 Top/Mid/Bot...\n');

  // 第二步：对剩余的 Top/Mid/Bot 使用时间序列逻辑
  for (const [playerId, games] of playerGames.entries()) {
    for (let i = 0; i < games.length; i++) {
      const currentGame = games[i];

      // 如果已经确定是打野或辅助，跳过
      if (currentGame.inferredRole) {
        continue;
      }

      // 使用时间序列逻辑
      const windowSize = 5; // 前后各看5场
      const before = games.slice(Math.max(0, i - windowSize), i);
      const after = games.slice(i + 1, Math.min(games.length, i + 1 + windowSize));

      // 统计前后比赛中的位置分布
      const positionVotes: Record<string, number> = {
        top: 0,
        mid: 0,
        bot: 0,
      };

      // 前面的比赛（权重：距离越近权重越高）
      for (let j = 0; j < before.length; j++) {
        const game = before[j];
        const weight = j + 1; // 1, 2, 3, 4, 5

        if (game.inferredRole && game.inferredRole !== 'jungle' && game.inferredRole !== 'support') {
          positionVotes[game.inferredRole] += weight * 3; // 已确定的位置权重更高
        } else if (!game.inferredRole) {
          for (const pos of game.championPrior) {
            if (pos !== 'jungle' && pos !== 'support') {
              positionVotes[pos] += weight;
            }
          }
        }
      }

      // 后面的比赛（权重：距离越近权重越高）
      for (let j = 0; j < after.length; j++) {
        const game = after[j];
        const weight = after.length - j; // 5, 4, 3, 2, 1

        if (game.inferredRole && game.inferredRole !== 'jungle' && game.inferredRole !== 'support') {
          positionVotes[game.inferredRole] += weight * 3;
        } else if (!game.inferredRole) {
          for (const pos of game.championPrior) {
            if (pos !== 'jungle' && pos !== 'support') {
              positionVotes[pos] += weight;
            }
          }
        }
      }

      // 当前英雄的 prior（权重最高）
      for (const pos of currentGame.championPrior) {
        if (pos !== 'jungle' && pos !== 'support') {
          positionVotes[pos] += 10;
        }
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
      currentGame.confidence = maxVotes > 20 ? 'HIGH' : maxVotes > 10 ? 'MEDIUM' : 'LOW';
    }
  }

  console.log('第三步：统计结果...\n');

  // 统计每个选手的位置分布
  const playerPositions = new Map<string, {
    playerId: string;
    playerName: string;
    teamName: string;
    totalGames: number;
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
      totalGames: games.length,
      positions,
    });
  }

  // 统计多位置选手
  const multiPositionPlayers: Array<{
    playerId: string;
    playerName: string;
    teamName: string;
    totalGames: number;
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
        totalGames: data.totalGames,
        positions,
        positionCounts: data.positions,
      });
    }
  }

  // 按位置数量和总场次排序
  multiPositionPlayers.sort((a, b) => {
    if (a.positions.length !== b.positions.length) {
      return b.positions.length - a.positions.length;
    }
    return b.totalGames - a.totalGames;
  });

  console.log('='.repeat(120));
  console.log('改进后的位置推断结果\n');
  console.log(`总选手数: ${playerPositions.size}`);
  console.log(`单一位置选手: ${playerPositions.size - multiPositionPlayers.length} (${((playerPositions.size - multiPositionPlayers.length) / playerPositions.size * 100).toFixed(1)}%)`);
  console.log(`多位置选手: ${multiPositionPlayers.length} (${(multiPositionPlayers.length / playerPositions.size * 100).toFixed(1)}%)\n`);

  if (multiPositionPlayers.length > 0) {
    console.log('多位置选手详情:\n');
    console.log('| # | 选手ID | 选手姓名 | 战队 | 总场次 | 位置数 | 位置详情 |');
    console.log('|---|--------|----------|------|--------|--------|----------|');

    for (let i = 0; i < multiPositionPlayers.length; i++) {
      const p = multiPositionPlayers[i];
      const details = p.positions
        .map(pos => `${pos}(${p.positionCounts[pos]})`)
        .join(', ');

      console.log(`| ${String(i + 1).padStart(3)} | ${p.playerId.padEnd(6)} | ${p.playerName.padEnd(12)} | ${p.teamName.slice(0, 20).padEnd(20)} | ${String(p.totalGames).padStart(6)} | ${String(p.positions.length).padStart(6)} | ${details} |`);
    }
  }

  console.log('\n' + '='.repeat(120));

  // 保存结果到文件
  const outputPath = path.join(process.cwd(), 'data/grid_v2/player_positions_final.json');
  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      totalPlayers: playerPositions.size,
      singlePositionPlayers: playerPositions.size - multiPositionPlayers.length,
      multiPositionPlayers: multiPositionPlayers.length,
    },
    players: Array.from(playerPositions.values()).map(p => ({
      playerId: p.playerId,
      playerName: p.playerName,
      teamName: p.teamName,
      totalGames: p.totalGames,
      positions: p.positions,
      mainPosition: Object.entries(p.positions)
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])[0][0],
    })),
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n结果已保存至: ${outputPath}\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
