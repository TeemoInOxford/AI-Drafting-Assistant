/**
 * Counter Threat Calculator
 * 对手阵容威胁计算 - 评估对手已选英雄对目标英雄的威胁
 */

import { Champion } from './types';
// import { getCounterScore } from './counter-relationship';

/**
 * 计算对手阵容对该英雄的威胁
 *
 * 如果对手已选的英雄counter这个英雄，威胁更高
 *
 * @param champion 目标英雄
 * @param opponentPicks 对手已选的英雄
 * @returns 威胁系数 (0-1)
 */
export function calculateCounterThreat(
  champion: Champion,
  opponentPicks: Champion[]
): number {
  if (opponentPicks.length === 0) return 0;

  // TODO: Implement counter threat calculation when counter data is available
  // For now, return 0 as a placeholder
  return 0;

  /* Original implementation - requires counterMap setup
  const counterMap = getCounterMap();
  let totalThreat = 0;
  let count = 0;

  for (const opponentChamp of opponentPicks) {
    // 从counter数据中查询
    // getCounterScore返回 -1到1，正值表示opponentChamp counter champion
    const counterScore = getCounterScore(opponentChamp.id, champion.id, counterMap);

    if (counterScore > 0.1) {
      // counterScore > 0.1 表示有明显counter关系
      // 将counterScore (0-1) 转换为威胁值
      totalThreat += Math.min(counterScore, 1.0);
      count++;
    }
  }

  // 返回平均威胁值
  return count > 0 ? totalThreat / count : 0;
  */
}

/**
 * 计算对手阵容对该英雄的协同威胁
 *
 * 如果对手已选的英雄之间有协同，整体威胁更高
 *
 * @param champion 目标英雄
 * @param opponentPicks 对手已选的英雄
 * @returns 协同威胁系数 (0-1)
 */
export function calculateSynergyThreat(
  champion: Champion,
  opponentPicks: Champion[]
): number {
  if (opponentPicks.length < 2) return 0;

  // 简化实现：检查对手是否有明显的协同组合
  // 例如：Yasuo + Malphite, Kalista + Thresh 等

  // 这里可以扩展为从数据中查询协同关系
  // 目前返回0，后续可以增强

  return 0;
}

/**
 * 获取威胁等级描述
 */
export function getThreatLevelDescription(threat: number): string {
  if (threat >= 0.6) return '极高威胁';
  if (threat >= 0.4) return '高威胁';
  if (threat >= 0.2) return '中等威胁';
  if (threat > 0) return '低威胁';
  return '无威胁';
}
