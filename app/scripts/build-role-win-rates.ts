/**
 * 从比赛数据构建英雄位置胜率统计
 *
 * 方法：
 * 1. 通过分析选手使用的英雄来推断选手位置（使用 CHAMPION_POSITIONS）
 * 2. 然后统计英雄在各位置的使用频率和胜率
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
  positions: Map<Position, { games: number; wins: number }>;
  totalGames: number;
  totalWins: number;
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
}

console.log(`已推断 ${playerPositions.size} 名选手的位置`);

// 统计英雄在各位置的使用频率和胜率
console.log('\n统计英雄位置分布和胜率...');
const championStats = new Map<string, ChampionPositionStats>();

for (const seriesId in states) {
  const series = states[seriesId];
  if (!series.games) continue;

  for (const game of series.games) {
    if (!game.finished || !game.teams) continue;

    for (const team of game.teams) {
      if (!team.players) continue;

      const won = team.won === true;

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
            totalWins: 0,
          });
        }

        const stats = championStats.get(championName)!;

        if (!stats.positions.has(position)) {
          stats.positions.set(position, { games: 0, wins: 0 });
        }

        const posStats = stats.positions.get(position)!;
        posStats.games++;
        if (won) {
          posStats.wins++;
        }

        stats.totalGames++;
        if (won) {
          stats.totalWins++;
        }
      }
    }
  }
}

// 转换为输出格式
interface OutputChampion {
  [position: string]: {
    games: number;
    wins: number;
    winRate: number;
  };
}

interface OutputData {
  updatedAt: string;
  globalStats: {
    totalChampions: number;
    totalGames: number;
    winRate: {
      mean: number;
      stdDev: number;
    };
    roleProbability: {
      mean: number;
      stdDev: number;
      threshold: number;
    };
    minSampleSize: number;
  };
  champions: Record<string, OutputChampion>;
}

const output: Record<string, OutputChampion> = {};

// 收集所有胜率和概率用于计算统计量
const allWinRates: number[] = [];
const allProbabilities: number[] = [];

for (const [championName, stats] of championStats) {
  output[championName] = {};

  for (const [position, posStats] of stats.positions) {
    const winRate = posStats.games > 0 ? posStats.wins / posStats.games : 0;
    const probability = stats.totalGames > 0 ? posStats.games / stats.totalGames : 0;

    output[championName][position] = {
      games: posStats.games,
      wins: posStats.wins,
      winRate: Math.round(winRate * 1000) / 1000,
    };

    if (posStats.games > 0) {
      allWinRates.push(winRate);
      allProbabilities.push(probability);
    }
  }
}

// 计算全局统计量
const meanWinRate = allWinRates.reduce((a, b) => a + b, 0) / allWinRates.length;
const meanProb = allProbabilities.reduce((a, b) => a + b, 0) / allProbabilities.length;

const winRateVariance = allWinRates.reduce((sum, wr) => sum + Math.pow(wr - meanWinRate, 2), 0) / allWinRates.length;
const probVariance = allProbabilities.reduce((sum, p) => sum + Math.pow(p - meanProb, 2), 0) / allProbabilities.length;

const winRateStdDev = Math.sqrt(winRateVariance);
const probStdDev = Math.sqrt(probVariance);

const finalOutput: OutputData = {
  updatedAt: new Date().toISOString(),
  globalStats: {
    totalChampions: championStats.size,
    totalGames: gameCount,
    winRate: {
      mean: Math.round(meanWinRate * 1000) / 1000,
      stdDev: Math.round(winRateStdDev * 1000) / 1000,
    },
    roleProbability: {
      mean: Math.round(meanProb * 1000) / 1000,
      stdDev: Math.round(probStdDev * 1000) / 1000,
      threshold: Math.round(Math.max(0.05, meanProb - probStdDev) * 1000) / 1000,
    },
    minSampleSize: 15,
  },
  champions: output,
};

const outputPath = path.join(process.cwd(), 'data/lol/champion-role-win-rates.json');
fs.writeFileSync(outputPath, JSON.stringify(finalOutput, null, 2));

console.log(`\n✓ 已保存到 ${outputPath}`);
console.log(`  统计了 ${championStats.size} 个英雄的位置胜率分布`);
console.log('\n全局统计:');
console.log(JSON.stringify(finalOutput.globalStats, null, 2));

// 显示一些有趣的例子
console.log('\n--- 低频位置高胜率的例子 ---');

for (const [championName, stats] of championStats) {
  const entries = Array.from(stats.positions.entries())
    .filter(([_, s]) => s.games >= 15)
    .sort((a, b) => b[1].games - a[1].games);

  if (entries.length < 2) continue;

  const mainRole = entries[0];
  const mainWinRate = mainRole[1].wins / mainRole[1].games;

  for (let i = 1; i < entries.length; i++) {
    const offRole = entries[i];
    const offWinRate = offRole[1].wins / offRole[1].games;
    const offProb = offRole[1].games / stats.totalGames;

    // 低频位置（<20%）且胜率差异>10%
    if (offProb <= 0.20 && offRole[1].games >= 15 && Math.abs(offWinRate - mainWinRate) >= 0.10) {
      console.log(`${championName}: ${offRole[0]} (${Math.round(offProb * 100)}%): ${Math.round(offWinRate * 100)}% WR (n=${offRole[1].games}) vs main ${mainRole[0]}: ${Math.round(mainWinRate * 100)}% WR`);
    }
  }
}
