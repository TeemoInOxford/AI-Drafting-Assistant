/**
 * 推荐理由生成器
 * 将技术指标转换为清晰易懂的推荐理由
 */

import { PTSResult, Position } from './types';
import { GameTheoryState } from './hybrid-game-theory';

/**
 * 根据PTS分数计算威胁等级（Ban阶段）
 * 调整阈值以适应实际PTS分数范围
 */
export function calculateThreatLevel(pts: number): '高' | '中' | '低' {
  // 根据实际数据调整阈值
  if (pts >= 35) return '高';   // 降低高威胁度阈值
  if (pts >= 18) return '中';   // 降低中威胁度阈值
  return '低';
}

/**
 * 根据PTS分数计算推荐度（Pick阶段）
 * 调整阈值以适应实际PTS分数范围
 */
export function calculateRecommendLevel(pts: number): '高' | '中' | '低' {
  // 根据实际数据调整阈值
  // 大多数英雄PTS在10-30之间，少数高分英雄在40+
  if (pts >= 30) return '高';   // 降低高推荐度阈值
  if (pts >= 15) return '中';   // 降低中推荐度阈值
  return '低';
}

/**
 * 生成详细的Ban理由
 */
export function generateBanReason(
  result: PTSResult,
  gameState?: GameTheoryState
): string {
  const reasons: string[] = [];
  const { signals, severityBreakdown } = result;

  // 1. 对手英雄池分析
  if (signals.championPoolStrength && signals.championPoolStrength > 0.7) {
    reasons.push(`对手英雄池：该英雄是对手的擅长英雄（熟练度${(signals.championPoolStrength * 100).toFixed(0)}%）`);
  } else if (signals.championPoolStrength && signals.championPoolStrength > 0.4) {
    reasons.push(`对手英雄池：对手对该英雄有一定掌握`);
  }

  // 2. 版本强度（Meta）
  if (signals.globalMetaPresence > 0.75) {
    reasons.push(`版本强度：当前版本T0级英雄（出场率${(signals.globalMetaPresence * 100).toFixed(0)}%）`);
  } else if (signals.globalMetaPresence > 0.55) {
    reasons.push(`版本强度：当前版本强势英雄`);
  }

  // 3. 位置威胁
  if (signals.opponentRoleVacancy > 0.7) {
    reasons.push(`位置威胁：对手该位置选择空间大，放出风险高`);
  }

  // 4. 阵容威胁
  if (severityBreakdown.compositionLock > 0.7) {
    reasons.push(`阵容威胁：该英雄会锁定对手强势阵容体系`);
  } else if (severityBreakdown.strategicDenial > 0.6) {
    reasons.push(`阵容威胁：该英雄对我方阵容构成战略威胁`);
  }

  // 5. 博弈论分析
  if (gameState && gameState.confidence > 0.4) {
    const typeNames: Record<string, string> = {
      aggressive: '激进型',
      defensive: '防守型',
      meta_follower: 'Meta型',
      counter_focused: '针对型',
      flex_master: '摇摆型',
    };
    const typeName = typeNames[gameState.predictedType] || '未知';
    reasons.push(`博弈分析：对手${typeName}打法，该英雄符合其选择倾向（${(gameState.confidence * 100).toFixed(0)}%信心）`);
  }

  // 6. 如果没有明显理由，给出综合评估
  if (reasons.length === 0) {
    if (result.pts >= 70) {
      reasons.push('综合评估：该英雄综合威胁度高，建议优先Ban');
    } else if (result.pts >= 45) {
      reasons.push('综合评估：该英雄具有一定威胁，可考虑Ban');
    } else {
      reasons.push('综合评估：该英雄威胁度较低，可延后处理');
    }
  }

  return reasons.join('；');
}

/**
 * 生成详细的Pick理由
 */
export function generatePickReason(
  result: PTSResult,
  ourPicks: string[],
  opponentPicks: string[],
  remainingRoles: Position[],
  gameState?: GameTheoryState
): string {
  const reasons: string[] = [];
  const { signals, severityBreakdown } = result;

  // 优先级排序：按重要性从高到低添加理由

  // 1. 位置需求（最高优先级 - 必须补位）
  if (remainingRoles.length > 0 && signals.opponentRoleVacancy > 0.5) {
    const roleNames: Record<Position, string> = {
      top: '上单',
      jungle: '打野',
      mid: '中单',
      bot: 'ADC',
      support: '辅助',
    };
    const rolesText = remainingRoles.map(r => roleNames[r]).join('、');

    if (remainingRoles.length === 1) {
      reasons.push(`位置需求：必须补${rolesText}位置`);
    } else if (remainingRoles.length === 2) {
      reasons.push(`位置需求：剩余${rolesText}位置待补`);
    } else {
      reasons.push(`位置需求：可填补${rolesText}等多个位置`);
    }
  }

  // 2. 对手英雄池分析（高优先级）
  if (signals.championPoolStrength && signals.championPoolStrength > 0.6) {
    reasons.push(`抢夺优势：抢先拿下对手擅长英雄（熟练度${(signals.championPoolStrength * 100).toFixed(0)}%）`);
  }

  // 3. 针对对手阵容（高优先级）
  if (severityBreakdown.strategicDenial > 0.6) {
    reasons.push(`克制对手：有效针对对手已选阵容`);
  } else if (opponentPicks.length > 0 && severityBreakdown.strategicDenial > 0.4) {
    reasons.push(`对线优势：对对手阵容有一定克制`);
  }

  // 4. 阵容协同（中高优先级）
  if (signals.synergyWithBans && signals.synergyWithBans > 0.6) {
    reasons.push(`阵容协同：与我方已选英雄配合良好`);
  } else if (ourPicks.length > 0 && signals.synergyWithBans && signals.synergyWithBans > 0.4) {
    reasons.push(`阵容协同：能与队友形成配合`);
  }

  // 5. 阵容平衡（中优先级）
  if (severityBreakdown.roleCollapse > 0.6) {
    reasons.push(`阵容平衡：补足我方阵容短板`);
  }

  // 6. 版本强度（中优先级）
  if (signals.globalMetaPresence > 0.75) {
    reasons.push(`版本强度：当前版本T0级英雄（出场率${(signals.globalMetaPresence * 100).toFixed(0)}%）`);
  } else if (signals.globalMetaPresence > 0.6) {
    reasons.push(`版本强度：当前版本强势英雄`);
  } else if (signals.globalMetaPresence > 0.45) {
    reasons.push(`版本强度：版本主流选择`);
  }

  // 7. Flex优势（中优先级）
  if (result.isFlex && result.roleDistribution && result.roleDistribution.length > 1) {
    const roles = result.roleDistribution
      .filter(r => r.probability > 0.2)
      .map(r => {
        const roleNames: Record<Position, string> = {
          top: '上',
          jungle: '野',
          mid: '中',
          bot: '下',
          support: '辅',
        };
        return `${roleNames[r.role]}(${(r.probability * 100).toFixed(0)}%)`;
      })
      .join('/');
    if (roles) {
      reasons.push(`摇摆优势：可打${roles}多个位置`);
    }
  }

  // 8. 博弈论分析（低优先级）
  if (gameState && gameState.confidence > 0.5) {
    const typeNames: Record<string, string> = {
      aggressive: '激进型',
      defensive: '防守型',
      meta_follower: 'Meta型',
      counter_focused: '针对型',
      flex_master: '摇摆型',
    };
    const typeName = typeNames[gameState.predictedType] || '未知';
    reasons.push(`博弈分析：针对对手${typeName}打法`);
  }

  // 9. 如果理由太少，补充综合评估
  if (reasons.length === 0) {
    if (result.pts >= 65) {
      reasons.push('综合评估：该英雄综合推荐度高，建议优先选择');
    } else if (result.pts >= 40) {
      reasons.push('综合评估：该英雄表现稳定，可作为备选');
    } else {
      reasons.push('综合评估：该英雄适配度一般，建议观望');
    }
  } else if (reasons.length === 1) {
    // 如果只有一个理由，补充一个次要理由
    if (result.pts >= 50) {
      reasons.push('综合表现优秀');
    } else if (result.pts >= 30) {
      reasons.push('综合表现稳定');
    }
  }

  // 限制理由数量，最多显示3-4个最重要的
  const maxReasons = 4;
  const selectedReasons = reasons.slice(0, maxReasons);

  return selectedReasons.join('；');
}

/**
 * 为PTSResult添加等级和详细理由
 */
export function enrichPTSResult(
  result: PTSResult,
  isBanPhase: boolean,
  ourPicks: string[] = [],
  opponentPicks: string[] = [],
  remainingRoles: Position[] = [],
  gameState?: GameTheoryState
): PTSResult {
  const enriched = { ...result };

  // 添加等级
  if (isBanPhase) {
    enriched.threatLevel = calculateThreatLevel(result.pts);
    enriched.detailedReason = generateBanReason(result, gameState);
  } else {
    enriched.recommendLevel = calculateRecommendLevel(result.pts);
    enriched.detailedReason = generatePickReason(
      result,
      ourPicks,
      opponentPicks,
      remainingRoles,
      gameState
    );
  }

  return enriched;
}
