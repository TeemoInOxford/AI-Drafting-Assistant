/**
 * 从比赛数据构建英雄位置统计
 * 通过分析选手使用的英雄来推断选手位置，然后统计英雄在各位置的使用频率
 */

import fs from 'fs';
import path from 'path';
import { CHAMPION_POSITIONS } from '../lib/positions';

type Position = 'top' | 'jungle' | 'mid' | 'bot' | 'support';

interface PlayerChampionUsage {
  playerId: string;
  playerName: string;
  champions: Map<string, number>; // championName -> count
}

interface ChampionPositionStats {
  championName: string;
  positions: Map<Position, number>; // position -> count
  totalGames: number;
}

// 读取 states.json
const statesPath = path.join(process.cwd(), 'data/lol/states.json');
const states = JSON.parse(fs.readFileSync(statesPath, 'utf-8'));

// 收集选手使用的英雄
const playerUsage = new Map<string, PlayerChampionUsage>();

console.log('分析比赛数据...');
let gameCount = 0;

for (const seriesId in states) {
  const series = states[seriesId];
  if (!series.games) continue;

  for (const game of series.games) {
    if (!game.finished || !game.teams) continue;

    for (const team of game.teams) {
      if (!team.players) continue;

      for (const player of team.players) {
        const playerId = player.id;
        const playerName = player.name;
        const championName = player.character?.name;

        if (!championName) continue;

        if (!playerUsage.has(playerId)) {
          playerUsage.set(playerId, {
            playerId,
            playerName,
            champions: new Map(),
          });
        }

        const usage = playerUsage.get(playerId)!;
        usage.champions.set(championName, (usage.champions.get(championName) || 0) + 1);
      }
    }
    gameCount++;
  }
}

console.log(`已分析 ${gameCount} 场比赛，${playerUsage.size} 名选手`);

// 推断选手位置
console.log('\n推断选手位置...');
const playerPositions = new Map<string, Position>();

for (const [playerId, usage] of playerUsage) {
  const positionScores = new Map<Position, number>();

  // 根据选手使用的英雄，统计每个位置的得分
  for (const [championName, count] of usage.champions) {
    const positions = CHAMPION_POSITIONS[championName] || [];
    for (const pos of positions) {
      positionScores.set(pos as Position, (positionScores.get(pos as Position) || 0) + count);
    }
  }

  // 找到得分最高的位置
  let maxScore = 0;
  let inferredPosition: Position = 'mid';
  for (const [pos, score] of positionScores) {
    if (score > maxScore) {
      maxScore = score;
      inferredPosition = pos;
    }
  }

  playerPositions.set(playerId, inferredPosition);
  console.log(`  ${usage.playerName} (${playerId}): ${inferredPosition} (${maxScore} 场)`);
}

// 统计英雄在各位置的使用频率
console.log('\n统计英雄位置分布...');
const championStats = new Map<string, ChampionPositionStats>();

for (const seriesId in states) {
  const series = states[seriesId];
  if (!series.games) continue;

  for (const game of series.games) {
    if (!game.finished || !game.teams) continue;

    for (const team of game.teams) {
      if (!team.players) continue;

      for (const player of team.players) {
        const playerId = player.id;
        const championName = player.character?.name;
        const position = playerPositions.get(playerId);

        if (!championName || !position) continue;

        if (!championStats.has(championName)) {
          championStats.set(championName, {
            championName,
            positions: new Map(),
            totalGames: 0,
          });
        }

        const stats = championStats.get(championName)!;
        stats.positions.set(position, (stats.positions.get(position) || 0) + 1);
        stats.totalGames++;
      }
    }
  }
}

// 转换为概率分布并保存
const output: Record<string, Record<Position, number>> = {};

for (const [championName, stats] of championStats) {
  output[championName] = {} as Record<Position, number>;
  for (const [position, count] of stats.positions) {
    output[championName][position] = count / stats.totalGames;
  }
}

const outputPath = path.join(process.cwd(), 'data/lol/champion-position-stats.json');
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log(`\n✓ 已保存到 ${outputPath}`);
console.log(`  统计了 ${championStats.size} 个英雄的位置分布`);
