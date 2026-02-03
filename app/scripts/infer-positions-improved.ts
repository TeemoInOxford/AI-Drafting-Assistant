/**
 * Final position inference with improved logic
 * 1. Jungle: highest neutralMinion in team + same pattern in nearby games
 * 2. Support: lowest minion in team + same pattern in nearby games
 * 3. Top/Mid/Bot: time-series logic
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
  isHighestNeutral?: boolean;
  isLowestMinion?: boolean;
  inferredRole?: string;
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

  console.log('正在收集所有比赛数据...');

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
  console.log(`收集到 ${allGames.length} 场比赛（team-games）`);

  // 按时间排序每个选手的比赛
  for (const [playerId, games] of playerGames.entries()) {
    games.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.seriesId !== b.seriesId) return a.seriesId.localeCompare(b.seriesId);
      return a.gameNumber - b.gameNumber;
    });
  }

  console.log('\n第一步：标记每场比赛中的野怪数最高和小兵数最低...');

  // 标记每场比赛中的野怪数最高和小兵数最低
  for (const teamGame of allGames) {
    const sortedByNeutral = [...teamGame.players].sort((a, b) => b.neutralMinion - a.neutralMinion);
    const highestNeutral = sortedByNeutral[0];
    highestNeutral.isHighestNeutral = true;

    const sortedByMinion = [...teamGame.players].sort((a, b) => a.minion - b.minion);
    const lowestMinion = sortedByMinion[0];
    lowestMinion.isLowestMinion = true;
  }

  console.log('第二步：使用时间序列逻辑判断打野和辅助...');

  // 对每个选手使用时间序列逻辑判断打野和辅助
  const windowSize = 3; // 前后各看3场

  for (const [playerId, games] of playerGames.entries()) {
    for (let i = 0; i < games.length; i++) {
      const currentGame = games[i];

      // 判断打野：当前是野怪数最高 + 前后几场也是野怪数最高
      if (currentGame.isHighestNeutral) {
        const before = games.slice(Math.max(0, i - windowSize), i);
        const after = games.slice(i + 1, Math.min(games.length, i + 1 + windowSize));

        let highestNeutralCount = 1; // 当前这场
        for (const game of before) {
          if (game.isHighestNeutral) highestNeutralCount++;
        }
        for (const game of after) {
          if (game.isHighestNeutral) highestNeutralCount++;
        }

        const totalNearby = 1 + before.length + after.length;
        const ratio = highestNeutralCount / totalNearby;

        // 如果前后比赛中超过50%也是野怪数最高，判定为打野
        if (ratio > 0.5) {
          currentGame.inferredRole = 'jungle';
          continue;
        }
      }

      // 判断辅助：当前是小兵数最低 + 前后几场也是小兵数最低
      if (currentGame.isLowestMinion) {
        const before = games.slice(Math.max(0, i - windowSize), i);
        const after = games.slice(i + 1, Math.min(games.length, i + 1 + windowSize));

        let lowestMinionCount = 1; // 当前这场
        for (const game of before) {
          if (game.isLowestMinion) lowestMinionCount++;
        }
        for (const game of after) {
          if (game.isLowestMinion) lowestMinionCount++;
        }

        const totalNearby = 1 + before.length + after.length;
        const ratio = lowestMinionCount / totalNearby;

        // 如果前后比赛中超过50%也是小兵数最低，判定为辅助
        if (ratio > 0.5) {
          currentGame.inferredRole = 'support';
          continue;
        }
      }
    }
  }

  console.log('第三步：对剩余位置使用时间序列逻辑...');

  // 对剩余的 Top/Mid/Bot 使用时间序列逻辑
  for (const [playerId, games] of playerGames.entries()) {
    for (let i = 0; i < games.length; i++) {
      const currentGame = games[i];

      if (currentGame.inferredRole) continue;

      const before = games.slice(Math.max(0, i - windowSize), i);
      const after = games.slice(i + 1, Math.min(games.length, i + 1 + windowSize));

      const positionVotes: Record<string, number> = {
        top: 0,
        mid: 0,
        bot: 0,
      };

      // 前面的比赛
      for (let j = 0; j < before.length; j++) {
        const game = before[j];
        const weight = j + 1;

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

      // 后面的比赛
      for (let j = 0; j < after.length; j++) {
        const game = after[j];
        const weight = after.length - j;

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

      // 当前英雄的 prior
      for (const pos of currentGame.championPrior) {
        if (pos !== 'jungle' && pos !== 'support') {
          positionVotes[pos] += 10;
        }
      }

      let maxVotes = 0;
      let bestPosition = 'mid';

      for (const [pos, votes] of Object.entries(positionVotes)) {
        if (votes > maxVotes) {
          maxVotes = votes;
          bestPosition = pos;
        }
      }

      currentGame.inferredRole = bestPosition;
    }
  }

  console.log('第四步：统计结果...\n');

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

  multiPositionPlayers.sort((a, b) => {
    if (a.positions.length !== b.positions.length) {
      return b.positions.length - a.positions.length;
    }
    return b.totalGames - a.totalGames;
  });

  console.log('========================================');
  console.log('最终位置推断结果');
  console.log('========================================');
  console.log(`总选手数: ${playerPositions.size}`);
  console.log(`单一位置选手: ${playerPositions.size - multiPositionPlayers.length} (${((playerPositions.size - multiPositionPlayers.length) / playerPositions.size * 100).toFixed(1)}%)`);
  console.log(`多位置选手: ${multiPositionPlayers.length} (${(multiPositionPlayers.length / playerPositions.size * 100).toFixed(1)}%)`);

  if (multiPositionPlayers.length > 0) {
    console.log('\n多位置选手详情:');
    console.log('----------------------------------------');

    for (let i = 0; i < multiPositionPlayers.length; i++) {
      const p = multiPositionPlayers[i];
      const details = p.positions
        .map(pos => `${pos}(${p.positionCounts[pos]})`)
        .join(', ');

      console.log(`${String(i + 1).padStart(3)}. ${p.playerName.padEnd(15)} | ${p.teamName.slice(0, 20).padEnd(20)} | 总${String(p.totalGames).padStart(3)}场 | ${p.positions.length}个位置 | ${details}`);
    }
  }

  console.log('\n========================================');
  console.log('完成！');
  console.log('========================================');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
