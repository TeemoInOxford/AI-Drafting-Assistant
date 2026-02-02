/**
 * Ban Recommendation Adjuster
 * 根据队伍英雄池调整 Ban 推荐优先级
 */

import { Champion, BPState } from './types';
import { PTSResult } from './types';
import { TeamChampionPool } from './team-champion-pool.types';
import { getRecommendedBans } from './team-champion-pool';

/**
 * 根据队伍英雄池调整 Ban 推荐分数
 */
export function adjustBanScoreByTeamPool(
  champion: Champion,
  baseScore: number,
  enemyTeamPool: TeamChampionPool | null,
  bpState: BPState
): number {
  if (!enemyTeamPool) {
    return baseScore; // 没有队伍数据，使用原始分数
  }

  const availability = enemyTeamPool.championAvailability.get(champion.id);

  if (!availability) {
    // 敌方队伍没人会用这个英雄，大幅降低 Ban 优先级
    return baseScore * 0.3;
  }

  // 基于队伍熟练度调整
  const proficiencyMultiplier = availability.teamProficiencyScore / 100; // 0-1

  // 基于灵活性调整（灵活性低的英雄 Ban 价值更高）
  const flexibilityPenalty = 1 - (availability.flexibilityScore * 0.3); // 0.7-1.0

  // 招牌英雄加成
  const signatureBonus = availability.teamProficiencyScore >= 80 ? 1.3 : 1.0;

  // 唯一选择加成（只有一个人会用）
  const uniqueBonus = availability.availablePlayers.length === 1 ? 1.2 : 1.0;

  // 综合调整
  const adjustedScore = baseScore * proficiencyMultiplier * flexibilityPenalty * signatureBonus * uniqueBonus;

  return adjustedScore;
}

/**
 * 获取推荐的 Ban 英雄列表（考虑已 Ban 的英雄）
 */
export function getSmartBanRecommendations(
  allChampions: Champion[],
  ptsResults: PTSResult[],
  enemyTeamPool: TeamChampionPool | null,
  bpState: BPState,
  topN: number = 10
): Array<{ champion: Champion; score: number; reason: string }> {
  // 获取已经被 Ban 的英雄 ID
  const bannedChampionIds = new Set<string>();
  bpState.blueBans.forEach(ban => {
    if (ban.champion) bannedChampionIds.add(ban.champion.id);
  });
  bpState.redBans.forEach(ban => {
    if (ban.champion) bannedChampionIds.add(ban.champion.id);
  });

  // 如果有队伍英雄池，使用队伍级别的推荐
  if (enemyTeamPool) {
    const teamRecommendations = getRecommendedBans(enemyTeamPool, topN * 2);

    const recommendations = teamRecommendations
      .map(availability => {
        const champion = allChampions.find(c => c.id === availability.championId);
        if (!champion || bannedChampionIds.has(champion.id)) {
          return null;
        }

        // 计算 Ban 价值分数
        const banValue = availability.teamProficiencyScore * (2 - availability.flexibilityScore);

        // 生成简短理由
        let reason = '';
        if (availability.teamProficiencyScore >= 80 && availability.availablePlayers.length === 1) {
          const playerName = availability.availablePlayers[0].playerName;
          reason = `${playerName}的招牌英雄，唯一选择`;
        } else if (availability.teamProficiencyScore >= 80) {
          reason = `敌方高熟练度英雄（${availability.availablePlayers.length}人可用）`;
        } else if (availability.availablePlayers.length === 1) {
          const playerName = availability.availablePlayers[0].playerName;
          reason = `${playerName}的常用英雄，唯一选择`;
        } else {
          reason = `敌方熟练英雄`;
        }

        return {
          champion,
          score: banValue,
          reason,
        };
      })
      .filter((r): r is { champion: Champion; score: number; reason: string } => r !== null)
      .slice(0, topN);

    return recommendations;
  }

  // 没有队伍数据，使用 PTS 分数
  const recommendations = ptsResults
    .filter(pts => {
      const champion = allChampions.find(c => c.id === pts.championId);
      return champion && !bannedChampionIds.has(champion.id);
    })
    .slice(0, topN)
    .map(pts => {
      const champion = allChampions.find(c => c.id === pts.championId)!;
      return {
        champion,
        score: pts.pts,
        reason: `高威胁英雄（PTS: ${pts.pts.toFixed(0)}）`,
      };
    });

  return recommendations;
}

/**
 * 检查英雄是否应该被优先 Ban
 */
export function shouldPrioritizeBan(
  champion: Champion,
  enemyTeamPool: TeamChampionPool | null
): { shouldBan: boolean; reason: string } {
  if (!enemyTeamPool) {
    return { shouldBan: false, reason: '' };
  }

  const availability = enemyTeamPool.championAvailability.get(champion.id);

  if (!availability) {
    return { shouldBan: false, reason: '敌方队伍无人使用' };
  }

  // 招牌英雄 + 唯一选择 = 最高优先级
  if (availability.teamProficiencyScore >= 80 && availability.availablePlayers.length === 1) {
    const playerName = availability.availablePlayers[0].playerName;
    return {
      shouldBan: true,
      reason: `${playerName}的招牌英雄且无备选，强烈建议 Ban`,
    };
  }

  // 高熟练度
  if (availability.teamProficiencyScore >= 70) {
    return {
      shouldBan: true,
      reason: `敌方高熟练度英雄（评分 ${availability.teamProficiencyScore.toFixed(0)}）`,
    };
  }

  return { shouldBan: false, reason: '' };
}
