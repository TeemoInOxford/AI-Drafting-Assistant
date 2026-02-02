/**
 * Pick Recommendation Adjuster
 * 根据队伍英雄池、阵容协同、克制关系等因素推荐 Pick 选择
 */

import { Champion, BPState, Position } from './types';
import { PTSResult } from './types';
import { TeamChampionPool, ChampionTeamAvailability } from './team-champion-pool.types';
import { CounterMap } from './counter-relationship.types';
import { getCounterScore } from './counter-relationship';

/**
 * Pick 推荐结果
 */
export interface PickRecommendation {
  champion: Champion;
  score: number;
  reason: string;
  detailedReasons: string[];
  proficiencyScore?: number;
  synergyScore?: number;
  counterScore?: number;
  roleScore?: number;
}

/**
 * 计算英雄与已选阵容的协同分数
 * 基于英雄职业、定位的协同关系
 */
function calculateSynergyScore(
  champion: Champion,
  allyPicks: (Champion | null)[],
  counterMap?: CounterMap
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let synergyScore = 0;
  let synergyCount = 0;

  // 过滤掉 null 的选择
  const validAllyPicks = allyPicks.filter((c): c is Champion => c !== null);

  if (validAllyPicks.length === 0) {
    return { score: 0.5, reasons }; // 中性分数
  }

  // 基于职业的协同关系
  const championTags = new Set(champion.tags);

  for (const ally of validAllyPicks) {
    // 检查职业协同
    const allyTags = new Set(ally.tags);

    // Tank + Marksman/Mage 协同
    if (championTags.has('Tank') && (allyTags.has('Marksman') || allyTags.has('Mage'))) {
      synergyScore += 0.15;
      synergyCount++;
      reasons.push(`为${ally.name}提供前排保护`);
    }

    // Support + Marksman 协同
    if (championTags.has('Support') && allyTags.has('Marksman')) {
      synergyScore += 0.2;
      synergyCount++;
      reasons.push(`与${ally.name}形成下路组合`);
    }

    // Assassin + Controller 协同
    if (championTags.has('Assassin') && allyTags.has('Controller')) {
      synergyScore += 0.15;
      synergyCount++;
      reasons.push(`${ally.name}控制配合切入`);
    }

    // Fighter + Support 协同
    if (championTags.has('Fighter') && allyTags.has('Support')) {
      synergyScore += 0.1;
      synergyCount++;
      reasons.push(`${ally.name}辅助战士输出`);
    }
  }

  // 归一化分数到 0-1
  const normalizedScore = Math.min(1, 0.5 + synergyScore);

  return { score: normalizedScore, reasons };
}

/**
 * 计算英雄对敌方阵容的克制分数
 */
function calculateCounterAdvantage(
  champion: Champion,
  enemyPicks: (Champion | null)[],
  counterMap?: CounterMap
): { score: number; reasons: string[] } {
  const reasons: string[] = [];

  if (!counterMap) {
    return { score: 0.5, reasons }; // 没有克制数据，返回中性分数
  }

  const validEnemyPicks = enemyPicks.filter((c): c is Champion => c !== null);

  if (validEnemyPicks.length === 0) {
    return { score: 0.5, reasons };
  }

  let totalCounterScore = 0;
  let counterCount = 0;

  for (const enemy of validEnemyPicks) {
    const counterScore = getCounterScore(champion.id, enemy.id, counterMap);
    totalCounterScore += counterScore;
    counterCount++;

    // 强克制（>0.6）
    if (counterScore > 0.6) {
      reasons.push(`克制敌方${enemy.name}`);
    }
    // 被克制（<0.4）
    else if (counterScore < 0.4) {
      reasons.push(`被敌方${enemy.name}克制`);
    }
  }

  // 平均克制分数
  const avgCounterScore = counterCount > 0 ? totalCounterScore / counterCount : 0.5;

  return { score: avgCounterScore, reasons };
}

/**
 * 计算英雄对位置需求的匹配分数
 */
function calculateRoleScore(
  champion: Champion,
  remainingRoles: Position[]
): { score: number; reasons: string[] } {
  const reasons: string[] = [];

  if (remainingRoles.length === 0) {
    return { score: 1, reasons: ['阵容已完整'] };
  }

  // 检查英雄是否能填补需要的位置
  const canFillRoles = champion.positions.filter(pos => remainingRoles.includes(pos));

  if (canFillRoles.length === 0) {
    return { score: 0.3, reasons: ['不匹配剩余位置需求'] };
  }

  // 能填补的位置越多，分数越高
  const flexibilityBonus = canFillRoles.length > 1 ? 0.2 : 0;
  const baseScore = 0.8 + flexibilityBonus;

  if (canFillRoles.length > 1) {
    reasons.push(`灵活选择，可打${canFillRoles.join('/')}`);
  } else {
    reasons.push(`填补${canFillRoles[0]}位置`);
  }

  return { score: Math.min(1, baseScore), reasons };
}

/**
 * 根据队伍英雄池调整 Pick 推荐分数
 */
export function adjustPickScoreByTeamPool(
  champion: Champion,
  baseScore: number,
  ourTeamPool: TeamChampionPool | null,
  bpState: BPState
): number {
  if (!ourTeamPool) {
    return baseScore; // 没有队伍数据，使用原始分数
  }

  const availability = ourTeamPool.championAvailability.get(champion.id);

  if (!availability) {
    // 我方队伍没人会用这个英雄，大幅降低 Pick 优先级
    return baseScore * 0.2;
  }

  // 基于队伍熟练度调整
  const proficiencyMultiplier = availability.teamProficiencyScore / 100; // 0-1

  // 灵活性加成（多人会用的英雄更安全）
  const flexibilityBonus = 1 + (availability.flexibilityScore * 0.2); // 1.0-1.2

  // 招牌英雄加成
  const signatureBonus = availability.teamProficiencyScore >= 80 ? 1.3 : 1.0;

  // 综合调整
  const adjustedScore = baseScore * proficiencyMultiplier * flexibilityBonus * signatureBonus;

  return adjustedScore;
}

/**
 * 获取推荐的 Pick 英雄列表
 */
export function getSmartPickRecommendations(
  allChampions: Champion[],
  ptsResults: PTSResult[],
  ourTeamPool: TeamChampionPool | null,
  bpState: BPState,
  currentTeam: 'blue' | 'red',
  counterMap?: CounterMap,
  topN: number = 10
): PickRecommendation[] {
  // 获取已经被使用的英雄 ID（Ban + Pick）
  const usedChampionIds = new Set<string>();
  bpState.blueBans.forEach(ban => {
    if (ban.champion) usedChampionIds.add(ban.champion.id);
  });
  bpState.redBans.forEach(ban => {
    if (ban.champion) usedChampionIds.add(ban.champion.id);
  });
  bpState.bluePicks.forEach(pick => {
    if (pick) usedChampionIds.add(pick.id);
  });
  bpState.redPicks.forEach(pick => {
    if (pick) usedChampionIds.add(pick.id);
  });

  // 确定我方和敌方的选择
  const ourPicks = currentTeam === 'blue' ? bpState.bluePicks : bpState.redPicks;
  const enemyPicks = currentTeam === 'blue' ? bpState.redPicks : bpState.bluePicks;

  // 计算剩余需要的位置
  const allPositions: Position[] = ['top', 'jungle', 'mid', 'bot', 'support'];
  const pickedPositions = new Set<Position>();

  ourPicks.forEach(pick => {
    if (pick && pick.positions.length > 0) {
      // 简化：假设英雄打第一个位置
      pickedPositions.add(pick.positions[0]);
    }
  });

  const remainingRoles = allPositions.filter(pos => !pickedPositions.has(pos));

  // 为每个可用英雄计算推荐分数
  const recommendations: PickRecommendation[] = [];

  for (const champion of allChampions) {
    // 跳过已使用的英雄
    if (usedChampionIds.has(champion.id)) {
      continue;
    }

    const detailedReasons: string[] = [];

    // 1. 队伍熟练度分数
    let proficiencyScore = 0.5;
    if (ourTeamPool) {
      const availability = ourTeamPool.championAvailability.get(champion.id);
      if (availability) {
        proficiencyScore = availability.teamProficiencyScore / 100;

        if (availability.teamProficiencyScore >= 80) {
          if (availability.availablePlayers.length === 1) {
            const playerName = availability.availablePlayers[0].playerName;
            detailedReasons.push(`${playerName}的招牌英雄`);
          } else {
            detailedReasons.push(`队伍高熟练度英雄（${availability.availablePlayers.length}人可用）`);
          }
        } else if (availability.teamProficiencyScore >= 60) {
          detailedReasons.push(`队伍熟练英雄`);
        }
      } else {
        detailedReasons.push(`队伍不熟悉此英雄`);
      }
    }

    // 2. 协同分数
    const synergyResult = calculateSynergyScore(champion, ourPicks, counterMap);
    const synergyScore = synergyResult.score;
    detailedReasons.push(...synergyResult.reasons);

    // 3. 克制分数
    const counterResult = calculateCounterAdvantage(champion, enemyPicks, counterMap);
    const counterScore = counterResult.score;
    detailedReasons.push(...counterResult.reasons);

    // 4. 位置匹配分数
    const roleResult = calculateRoleScore(champion, remainingRoles);
    const roleScore = roleResult.score;
    detailedReasons.push(...roleResult.reasons);

    // 5. Meta 分数（从 PTS 结果获取，如果有的话）
    let metaScore = 0.5;
    const ptsResult = ptsResults.find(pts => pts.championId === champion.id);
    if (ptsResult) {
      // PTS 分数越高，说明越 meta
      metaScore = Math.min(1, ptsResult.pts / 100);
    }

    // 综合评分（加权平均）
    const weights = {
      proficiency: 0.35,  // 队伍熟练度最重要
      synergy: 0.20,      // 协同
      counter: 0.20,      // 克制
      role: 0.15,         // 位置匹配
      meta: 0.10,         // Meta
    };

    const totalScore =
      proficiencyScore * weights.proficiency +
      synergyScore * weights.synergy +
      counterScore * weights.counter +
      roleScore * weights.role +
      metaScore * weights.meta;

    // 生成简短理由（取最重要的因素）
    let mainReason = '';
    const scores = [
      { name: 'proficiency', score: proficiencyScore, weight: weights.proficiency },
      { name: 'synergy', score: synergyScore, weight: weights.synergy },
      { name: 'counter', score: counterScore, weight: weights.counter },
      { name: 'role', score: roleScore, weight: weights.role },
    ];

    // 找出加权分数最高的因素
    const weightedScores = scores.map(s => ({ ...s, weighted: s.score * s.weight }));
    weightedScores.sort((a, b) => b.weighted - a.weighted);

    const topFactor = weightedScores[0];

    if (topFactor.name === 'proficiency' && proficiencyScore >= 0.7) {
      mainReason = detailedReasons.find(r => r.includes('招牌') || r.includes('熟练')) || '队伍擅长英雄';
    } else if (topFactor.name === 'synergy' && synergyScore >= 0.6) {
      mainReason = detailedReasons.find(r => r.includes('协同') || r.includes('配合') || r.includes('组合')) || '阵容协同良好';
    } else if (topFactor.name === 'counter' && counterScore >= 0.6) {
      mainReason = detailedReasons.find(r => r.includes('克制敌方')) || '克制敌方阵容';
    } else if (topFactor.name === 'role' && roleScore >= 0.7) {
      mainReason = detailedReasons.find(r => r.includes('位置') || r.includes('填补')) || '填补位置需求';
    } else {
      mainReason = '综合推荐';
    }

    recommendations.push({
      champion,
      score: totalScore * 100, // 转换为 0-100 分
      reason: mainReason,
      detailedReasons: detailedReasons.filter(r => r.length > 0),
      proficiencyScore,
      synergyScore,
      counterScore,
      roleScore,
    });
  }

  // 按分数排序并返回 Top N
  recommendations.sort((a, b) => b.score - a.score);
  return recommendations.slice(0, topN);
}

/**
 * 检查英雄是否应该被优先 Pick
 */
export function shouldPrioritizePick(
  champion: Champion,
  ourTeamPool: TeamChampionPool | null,
  enemyPicks: (Champion | null)[],
  counterMap?: CounterMap
): { shouldPick: boolean; reason: string } {
  if (!ourTeamPool) {
    return { shouldPick: false, reason: '' };
  }

  const availability = ourTeamPool.championAvailability.get(champion.id);

  if (!availability) {
    return { shouldPick: false, reason: '队伍无人使用' };
  }

  // 招牌英雄 + 高熟练度 = 最高优先级
  if (availability.teamProficiencyScore >= 80 && availability.availablePlayers.length >= 1) {
    const playerName = availability.availablePlayers[0].playerName;
    return {
      shouldPick: true,
      reason: `${playerName}的招牌英雄，强烈建议 Pick`,
    };
  }

  // 检查是否克制敌方多个英雄
  if (counterMap) {
    const validEnemyPicks = enemyPicks.filter((c): c is Champion => c !== null);
    let strongCounterCount = 0;

    for (const enemy of validEnemyPicks) {
      const counterScore = getCounterScore(champion.id, enemy.id, counterMap);
      if (counterScore > 0.65) {
        strongCounterCount++;
      }
    }

    if (strongCounterCount >= 2) {
      return {
        shouldPick: true,
        reason: `克制敌方多个英雄（${strongCounterCount}个）`,
      };
    }
  }

  // 高熟练度
  if (availability.teamProficiencyScore >= 70) {
    return {
      shouldPick: true,
      reason: `队伍高熟练度英雄（评分 ${availability.teamProficiencyScore.toFixed(0)}）`,
    };
  }

  return { shouldPick: false, reason: '' };
}

/**
 * 获取英雄的灵活性评分
 * 基于英雄可以打的位置数量
 */
export function getChampionFlexibility(champion: Champion): number {
  const positionCount = champion.positions.length;

  if (positionCount >= 3) return 1.0;      // 非常灵活
  if (positionCount === 2) return 0.7;     // 较灵活
  return 0.4;                               // 单一位置
}

/**
 * 分析当前阵容的优势和劣势
 */
export function analyzeCurrentComposition(
  ourPicks: (Champion | null)[],
  enemyPicks: (Champion | null)[],
  counterMap?: CounterMap
): {
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
} {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const suggestions: string[] = [];

  const validOurPicks = ourPicks.filter((c): c is Champion => c !== null);
  const validEnemyPicks = enemyPicks.filter((c): c is Champion => c !== null);

  if (validOurPicks.length === 0) {
    return { strengths, weaknesses, suggestions };
  }

  // 分析职业分布
  const ourTags = new Map<string, number>();
  validOurPicks.forEach(pick => {
    pick.tags.forEach(tag => {
      ourTags.set(tag, (ourTags.get(tag) || 0) + 1);
    });
  });

  // 检查前排
  const tankCount = ourTags.get('Tank') || 0;
  const fighterCount = ourTags.get('Fighter') || 0;
  const frontlineCount = tankCount + fighterCount;

  if (frontlineCount === 0 && validOurPicks.length >= 3) {
    weaknesses.push('缺少前排，容易被突进');
    suggestions.push('建议选择坦克或战士');
  } else if (frontlineCount >= 2) {
    strengths.push('前排充足，保护能力强');
  }

  // 检查输出
  const damageCount = (ourTags.get('Marksman') || 0) + (ourTags.get('Mage') || 0) + (ourTags.get('Assassin') || 0);
  if (damageCount === 0 && validOurPicks.length >= 2) {
    weaknesses.push('缺少主要输出');
    suggestions.push('建议选择射手或法师');
  } else if (damageCount >= 2) {
    strengths.push('输出充足');
  }

  // 检查控制
  const controlCount = ourTags.get('Controller') || 0;
  if (controlCount === 0 && validOurPicks.length >= 4) {
    weaknesses.push('缺少控制能力');
    suggestions.push('建议选择控制型英雄');
  }

  // 分析克制关系
  if (counterMap && validEnemyPicks.length > 0) {
    let totalCounterAdvantage = 0;
    let counterCount = 0;

    for (const ourPick of validOurPicks) {
      for (const enemyPick of validEnemyPicks) {
        const counterScore = getCounterScore(ourPick.id, enemyPick.id, counterMap);
        totalCounterAdvantage += (counterScore - 0.5); // -0.5 到 +0.5
        counterCount++;
      }
    }

    const avgAdvantage = counterCount > 0 ? totalCounterAdvantage / counterCount : 0;

    if (avgAdvantage > 0.1) {
      strengths.push('整体克制敌方阵容');
    } else if (avgAdvantage < -0.1) {
      weaknesses.push('整体被敌方阵容克制');
      suggestions.push('选择克制敌方的英雄');
    }
  }

  return { strengths, weaknesses, suggestions };
}
