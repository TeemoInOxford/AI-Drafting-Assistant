/**
 * PTS Engine Optimization
 * PTS 引擎优化 - 分数归一化和位置判断改进
 */

import { PTSResult, Champion, Position } from './types';
import { TeamChampionPool } from './team-champion-pool.types';

/**
 * 位置填充状态（增强版）
 */
export interface RoleFillStatus {
  definitelyFilled: Set<Position>;    // 明确填充的位置
  possiblyFilled: Set<Position>;      // 可能填充的位置（摇摆位）
  vacant: Position[];                 // 空缺位置
}

/**
 * 位置使用频率数据
 */
export interface PositionFrequency {
  [position: string]: number;  // 位置 -> 使用频率 (0-1)
}

/**
 * 改进分数归一化策略
 * 使用 Min-Max 归一化，确保分数分布在合理范围
 * 后期增加区分度，避免所有英雄分数都很高
 */
export function normalizePTSScores(
  results: PTSResult[],
  step: number
): PTSResult[] {
  if (results.length === 0) return results;

  // 提取所有分数
  const scores = results.map(r => r.pts);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min;

  // 如果所有分数相同，返回原始结果
  if (range === 0) {
    return results.map(r => ({ ...r, pts: 50 }));
  }

  // 后期增加区分度
  // Step 1-6: 对比度 1.0（正常）
  // Step 7-12: 对比度 1.2（略微增强）
  // Step 13+: 对比度 1.5（显著增强）
  let contrastFactor = 1.0;
  if (step > 12) {
    contrastFactor = 1.5;
  } else if (step > 6) {
    contrastFactor = 1.2;
  }

  console.log(`[PTS Normalize] Step ${step}, Range: ${range.toFixed(1)}, Contrast: ${contrastFactor}`);

  return results.map(r => {
    // Min-Max 归一化到 0-100
    const normalized = ((r.pts - min) / range) * 100;

    // 应用对比度增强
    // 公式：enhanced = 50 + (normalized - 50) * contrastFactor
    // 这会拉大高分和低分的差距
    const enhanced = 50 + (normalized - 50) * contrastFactor;

    // 限制在 0-100 范围内
    const finalPTS = Math.max(0, Math.min(100, enhanced));

    return {
      ...r,
      pts: finalPTS,
    };
  });
}

/**
 * 改进位置判断逻辑 V3
 * 考虑英雄的历史位置使用频率，而不是简单的主副位置
 */
export function calculateRoleVacancyV3(
  champion: Champion,
  roleStatus: RoleFillStatus,
  enemyTeamPool: TeamChampionPool | null
): number {
  // 如果所有位置都已填充，返回0
  if (roleStatus.vacant.length === 0) {
    return 0;
  }

  // 获取该英雄的位置使用频率
  const positionFrequency = getPositionFrequency(champion, enemyTeamPool);

  // 加权计算：主位置权重高，副位置权重低
  let weightedScore = 0;
  let totalWeight = 0;

  for (const [position, frequency] of Object.entries(positionFrequency)) {
    const pos = position as Position;

    // 检查该位置是否可用
    const isDefinitelyFilled = roleStatus.definitelyFilled.has(pos);
    const isPossiblyFilled = roleStatus.possiblyFilled.has(pos);

    if (isDefinitelyFilled) {
      // 位置已明确填充，不计入
      continue;
    }

    // 计算该位置的权重
    const weight = frequency;

    if (!isPossiblyFilled) {
      // 位置完全空缺，全额计入
      weightedScore += weight;
    } else {
      // 位置可能被填充（摇摆位），打折计入
      weightedScore += weight * 0.5;
    }

    totalWeight += weight;
  }

  // 归一化到 0-1
  const baseScore = totalWeight > 0 ? weightedScore / totalWeight : 0;

  // 考虑位置紧迫性：剩余位置越少，分数越高
  const urgencyMultiplier = 1.0 + (5 - roleStatus.vacant.length) * 0.1;

  return Math.min(1.0, baseScore * urgencyMultiplier);
}

/**
 * 获取英雄的位置使用频率
 * 优先使用队伍英雄池数据，否则使用默认权重
 */
function getPositionFrequency(
  champion: Champion,
  enemyTeamPool: TeamChampionPool | null
): PositionFrequency {
  // 尝试从队伍英雄池获取真实数据
  if (enemyTeamPool) {
    const availability = enemyTeamPool.championAvailability.get(champion.id);

    if (availability && (availability as any).positionFrequency) {
      return (availability as any).positionFrequency;
    }
  }

  // 降级到默认权重：第一个位置权重最高
  const frequency: PositionFrequency = {};
  const positions = champion.positions;

  if (positions.length === 0) {
    return frequency;
  }

  // 使用递减权重
  // 第1个位置: 1.0
  // 第2个位置: 0.5
  // 第3个位置: 0.25
  // ...
  for (let i = 0; i < positions.length; i++) {
    const position = positions[i];
    const weight = 1.0 / Math.pow(2, i);
    frequency[position] = weight;
  }

  // 归一化
  const total = Object.values(frequency).reduce((sum, w) => sum + w, 0);
  for (const pos in frequency) {
    frequency[pos] /= total;
  }

  return frequency;
}

/**
 * 批量归一化 PTS 分数（性能优化版本）
 * 适用于大量英雄的场景
 */
export function batchNormalizePTSScores(
  resultsByStep: Map<number, PTSResult[]>
): Map<number, PTSResult[]> {
  const normalized = new Map<number, PTSResult[]>();

  for (const [step, results] of resultsByStep.entries()) {
    normalized.set(step, normalizePTSScores(results, step));
  }

  return normalized;
}

/**
 * 计算分数分布统计
 * 用于调试和分析
 */
export interface ScoreDistribution {
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
  quartiles: {
    q1: number;
    q2: number;
    q3: number;
  };
}

export function calculateScoreDistribution(results: PTSResult[]): ScoreDistribution {
  if (results.length === 0) {
    return {
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      stdDev: 0,
      quartiles: { q1: 0, q2: 0, q3: 0 },
    };
  }

  const scores = results.map(r => r.pts).sort((a, b) => a - b);
  const n = scores.length;

  const min = scores[0];
  const max = scores[n - 1];
  const mean = scores.reduce((sum, s) => sum + s, 0) / n;

  // 计算标准差
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  // 计算四分位数
  const q1 = scores[Math.floor(n * 0.25)];
  const q2 = scores[Math.floor(n * 0.50)]; // 中位数
  const q3 = scores[Math.floor(n * 0.75)];

  return {
    min,
    max,
    mean,
    median: q2,
    stdDev,
    quartiles: { q1, q2, q3 },
  };
}

/**
 * 自适应归一化
 * 根据分数分布自动调整归一化策略
 */
export function adaptiveNormalizePTSScores(
  results: PTSResult[],
  step: number
): PTSResult[] {
  if (results.length === 0) return results;

  // 计算分布统计
  const dist = calculateScoreDistribution(results);

  // 第一步（step 1）：使用更宽松的归一化，保持更多区分度
  if (step === 1) {
    const scores = results.map(r => r.pts);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const range = max - min;

    if (range === 0) {
      return results.map(r => ({ ...r, pts: 50 }));
    }

    console.log(`[PTS Adaptive] Step 1: Using enhanced normalization (range: ${range.toFixed(1)})`);

    // 使用改进的归一化策略：
    // 1. 先映射到 0-100
    // 2. 使用 S 曲线（sigmoid-like）增强对比度，保留高分区域的细节
    return results.map(r => {
      const normalized = ((r.pts - min) / range) * 100;

      // 使用分段线性增强，在不同区域应用不同的拉伸
      let finalPTS;
      if (normalized >= 90) {
        // 高分区域 (90-100): 拉伸以增加区分度
        // 映射到 80-100，拉伸系数 2.0
        finalPTS = 80 + (normalized - 90) * 2.0;
      } else if (normalized >= 70) {
        // 中高分区域 (70-90): 中等拉伸
        // 映射到 55-80
        finalPTS = 55 + (normalized - 70) * 1.25;
      } else if (normalized >= 50) {
        // 中分区域 (50-70): 保持
        // 映射到 30-55
        finalPTS = 30 + (normalized - 50) * 1.25;
      } else {
        // 低分区域 (0-50): 压缩
        // 映射到 0-30
        finalPTS = normalized * 0.6;
      }

      return { ...r, pts: Math.max(0, Math.min(100, finalPTS)) };
    });
  }

  // 其他步骤：使用自适应归一化
  // 增加基础对比度因子以提高区分度
  let contrastFactor = 1.3;  // 从 1.0 提高到 1.3
  if (step > 12) {
    contrastFactor = 1.5;  // 从 1.5 降低到 1.5（后期保持）
  } else if (step > 6) {
    contrastFactor = 1.4;  // 从 1.2 提高到 1.4
  }

  // 如果标准差 < 5，进一步增加对比度
  if (dist.stdDev < 5) {
    contrastFactor *= 1.2;  // 从 1.3 降低到 1.2，避免过度增强
    console.log(`[PTS Adaptive] Low variance detected (${dist.stdDev.toFixed(1)}), increasing contrast to ${contrastFactor.toFixed(2)}`);
  }

  // 应用归一化
  const scores = results.map(r => r.pts);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min;

  if (range === 0) {
    return results.map(r => ({ ...r, pts: 50 }));
  }

  return results.map(r => {
    const normalized = ((r.pts - min) / range) * 100;
    const enhanced = 50 + (normalized - 50) * contrastFactor;
    const finalPTS = Math.max(0, Math.min(100, enhanced));

    return {
      ...r,
      pts: finalPTS,
    };
  });
}
