/**
 * Counter Relationship System
 * 克制关系系统 - 从职业比赛数据中提取和分析英雄克制关系
 */

import {
  CounterRelationship,
  CounterStats,
  MatchData,
  CounterMap,
  CounterAnalysisResult,
  CounterExtractionConfig,
  DEFAULT_COUNTER_CONFIG,
  ChampionPickData,
} from './counter-relationship.types';
import { Champion, Position } from './types';

/**
 * 计算贝叶斯置信度
 * 基于样本量调整置信度，避免小样本过度自信
 */
function calculateConfidence(sampleSize: number, minSampleSize: number = 10): number {
  if (sampleSize < minSampleSize) {
    return sampleSize / minSampleSize;
  }
  // 使用对数函数，样本量越大置信度越高，但增长放缓
  return Math.min(1.0, 0.6 + Math.log10(sampleSize / minSampleSize) * 0.2);
}

/**
 * 计算克制分数
 * 综合考虑胜率、对线表现、经济差距等因素
 */
function calculateCounterScore(stats: CounterStats): number {
  const winRate = stats.winsA / stats.totalMatches;

  // 基础克制分数（基于胜率）
  let counterScore = winRate;

  // 如果有对线数据，考虑对线表现
  if (stats.laneWinRateA > 0) {
    // 对线胜率权重30%，整体胜率权重70%
    counterScore = winRate * 0.7 + stats.laneWinRateA * 0.3;
  }

  // 考虑经济差距（15分钟金币差）
  if (stats.avgGoldDiffAt15 !== 0) {
    // 金币差每1000金币调整±0.05分
    const goldAdjustment = (stats.avgGoldDiffAt15 / 1000) * 0.05;
    counterScore = Math.max(0, Math.min(1, counterScore + goldAdjustment));
  }

  return counterScore;
}

/**
 * 从匹配数据中提取克制关系
 * 分析所有对局，统计英雄之间的胜负关系
 */
export function extractCounterRelationships(
  matchData: MatchData[],
  config: CounterExtractionConfig = DEFAULT_COUNTER_CONFIG
): CounterMap {
  console.log(`[Counter] 开始提取克制关系，共 ${matchData.length} 场比赛`);

  // 统计数据结构：Map<championA, Map<championB, CounterStats>>
  const statsMap = new Map<string, Map<string, CounterStats>>();

  // 过滤最近的比赛
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - config.recentDays);
  const recentMatches = matchData.filter(m => m.date >= cutoffDate);

  console.log(`[Counter] 过滤后剩余 ${recentMatches.length} 场最近比赛`);

  // 遍历所有比赛
  for (const match of recentMatches) {
    const bluePicks = match.blueSide.picks;
    const redPicks = match.redSide.picks;
    const blueWon = match.winner === 'blue';

    // 分析蓝方vs红方的所有英雄对局
    for (const bluePick of bluePicks) {
      for (const redPick of redPicks) {
        // 如果配置要求位置特定，只分析同位置对线
        if (config.positionSpecific && bluePick.position !== redPick.position) {
          continue;
        }

        // 初始化统计数据
        if (!statsMap.has(bluePick.championId)) {
          statsMap.set(bluePick.championId, new Map());
        }
        if (!statsMap.has(redPick.championId)) {
          statsMap.set(redPick.championId, new Map());
        }

        const blueStats = statsMap.get(bluePick.championId)!;
        const redStats = statsMap.get(redPick.championId)!;

        // 初始化对局统计
        if (!blueStats.has(redPick.championId)) {
          blueStats.set(redPick.championId, {
            totalMatches: 0,
            winsA: 0,
            winsB: 0,
            avgGoldDiffAt15: 0,
            avgKillDiffAt15: 0,
            laneWinRateA: 0,
          });
        }
        if (!redStats.has(bluePick.championId)) {
          redStats.set(bluePick.championId, {
            totalMatches: 0,
            winsA: 0,
            winsB: 0,
            avgGoldDiffAt15: 0,
            avgKillDiffAt15: 0,
            laneWinRateA: 0,
          });
        }

        // 更新统计数据
        const blueVsRed = blueStats.get(redPick.championId)!;
        const redVsBlue = redStats.get(bluePick.championId)!;

        blueVsRed.totalMatches++;
        redVsBlue.totalMatches++;

        if (blueWon) {
          blueVsRed.winsA++;
          redVsBlue.winsB++;
        } else {
          blueVsRed.winsB++;
          redVsBlue.winsA++;
        }

        // 计算金币差和击杀差（简化版，实际需要15分钟数据）
        const goldDiff = bluePick.goldEarned - redPick.goldEarned;
        const killDiff = (bluePick.kills - bluePick.deaths) - (redPick.kills - redPick.deaths);

        // 使用移动平均更新
        const n = blueVsRed.totalMatches;
        blueVsRed.avgGoldDiffAt15 = (blueVsRed.avgGoldDiffAt15 * (n - 1) + goldDiff) / n;
        blueVsRed.avgKillDiffAt15 = (blueVsRed.avgKillDiffAt15 * (n - 1) + killDiff) / n;

        redVsBlue.avgGoldDiffAt15 = -blueVsRed.avgGoldDiffAt15;
        redVsBlue.avgKillDiffAt15 = -blueVsRed.avgKillDiffAt15;

        // 对线胜率（简化：基于击杀差）
        if (config.positionSpecific && bluePick.position === redPick.position) {
          const laneWin = killDiff > 0 ? 1 : 0;
          blueVsRed.laneWinRateA = (blueVsRed.laneWinRateA * (n - 1) + laneWin) / n;
          redVsBlue.laneWinRateA = 1 - blueVsRed.laneWinRateA;
        }
      }
    }
  }

  // 转换为 CounterMap
  const counterMap: CounterMap = new Map();

  for (const [championA, opponentsMap] of statsMap.entries()) {
    const counterMapA = new Map<string, CounterRelationship>();

    for (const [championB, stats] of opponentsMap.entries()) {
      // 过滤样本量不足的数据
      if (stats.totalMatches < config.minSampleSize) {
        continue;
      }

      // 计算克制分数和置信度
      const counterScore = calculateCounterScore(stats);
      const confidence = calculateConfidence(stats.totalMatches, config.minSampleSize);

      // 只保留置信度足够的数据
      if (confidence < config.minConfidence) {
        continue;
      }

      const relationship: CounterRelationship = {
        championA,
        championB,
        counterScore,
        sampleSize: stats.totalMatches,
        winRateA: stats.winsA / stats.totalMatches,
        winRateB: stats.winsB / stats.totalMatches,
        confidence,
        lastUpdated: new Date(),
      };

      counterMapA.set(championB, relationship);
    }

    if (counterMapA.size > 0) {
      counterMap.set(championA, counterMapA);
    }
  }

  console.log(`[Counter] 提取完成，共 ${counterMap.size} 个英雄有克制关系数据`);

  return counterMap;
}

/**
 * 获取英雄的克制关系分析
 */
export function analyzeChampionCounters(
  championId: string,
  championName: string,
  counterMap: CounterMap,
  config: CounterExtractionConfig = DEFAULT_COUNTER_CONFIG
): CounterAnalysisResult {
  const relationships = counterMap.get(championId);

  if (!relationships) {
    return {
      championId,
      championName,
      strongAgainst: [],
      weakAgainst: [],
      neutral: [],
      overallStrength: 50,
    };
  }

  const strongAgainst: CounterRelationship[] = [];
  const weakAgainst: CounterRelationship[] = [];
  const neutral: CounterRelationship[] = [];

  // 分类克制关系
  for (const [_, relationship] of relationships) {
    if (relationship.counterScore >= config.counterThreshold) {
      strongAgainst.push(relationship);
    } else if (relationship.counterScore <= (1 - config.counterThreshold)) {
      weakAgainst.push(relationship);
    } else {
      neutral.push(relationship);
    }
  }

  // 排序
  strongAgainst.sort((a, b) => b.counterScore - a.counterScore);
  weakAgainst.sort((a, b) => a.counterScore - b.counterScore);

  // 计算整体强度
  const totalRelationships = strongAgainst.length + weakAgainst.length + neutral.length;
  const avgCounterScore = Array.from(relationships.values())
    .reduce((sum, r) => sum + r.counterScore, 0) / totalRelationships;

  const overallStrength = avgCounterScore * 100;

  return {
    championId,
    championName,
    strongAgainst,
    weakAgainst,
    neutral,
    overallStrength,
  };
}

/**
 * 获取克制分数（快速查询）
 */
export function getCounterScore(
  championA: string,
  championB: string,
  counterMap: CounterMap
): number {
  const relationship = counterMap.get(championA)?.get(championB);
  return relationship?.counterScore ?? 0.5; // 默认中性
}

/**
 * 检查是否存在克制关系
 */
export function hasCounterRelationship(
  championA: string,
  championB: string,
  counterMap: CounterMap,
  threshold: number = 0.6
): boolean {
  const score = getCounterScore(championA, championB, counterMap);
  return score >= threshold || score <= (1 - threshold);
}

/**
 * 获取最强克制英雄（Top N）
 */
export function getTopCounters(
  championId: string,
  counterMap: CounterMap,
  topN: number = 5
): CounterRelationship[] {
  const relationships = counterMap.get(championId);

  if (!relationships) {
    return [];
  }

  return Array.from(relationships.values())
    .sort((a, b) => b.counterScore - a.counterScore)
    .slice(0, topN);
}

/**
 * 获取最弱对抗英雄（Top N）
 */
export function getTopWeaknesses(
  championId: string,
  counterMap: CounterMap,
  topN: number = 5
): CounterRelationship[] {
  const relationships = counterMap.get(championId);

  if (!relationships) {
    return [];
  }

  return Array.from(relationships.values())
    .sort((a, b) => a.counterScore - b.counterScore)
    .slice(0, topN);
}

/**
 * 批量获取克制分数（用于性能优化）
 */
export function getBatchCounterScores(
  championA: string,
  championBList: string[],
  counterMap: CounterMap
): Map<string, number> {
  const scores = new Map<string, number>();
  const relationships = counterMap.get(championA);

  if (!relationships) {
    championBList.forEach(id => scores.set(id, 0.5));
    return scores;
  }

  for (const championB of championBList) {
    const relationship = relationships.get(championB);
    scores.set(championB, relationship?.counterScore ?? 0.5);
  }

  return scores;
}

/**
 * 导出克制关系数据（用于缓存）
 */
export function exportCounterMap(counterMap: CounterMap): string {
  const data: any = {};

  for (const [championA, relationships] of counterMap.entries()) {
    data[championA] = {};
    for (const [championB, relationship] of relationships.entries()) {
      data[championA][championB] = relationship;
    }
  }

  return JSON.stringify(data);
}

/**
 * 导入克制关系数据（从缓存）
 */
export function importCounterMap(jsonData: string): CounterMap {
  const data = JSON.parse(jsonData);
  const counterMap: CounterMap = new Map();

  for (const [championA, relationships] of Object.entries(data)) {
    const relationshipMap = new Map<string, CounterRelationship>();

    for (const [championB, relationship] of Object.entries(relationships as any)) {
      relationshipMap.set(championB, {
        ...(relationship as CounterRelationship),
        lastUpdated: new Date((relationship as any).lastUpdated),
      });
    }

    counterMap.set(championA, relationshipMap);
  }

  return counterMap;
}
