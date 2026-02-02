/**
 * Team Champion Pool Builder
 * 队伍英雄池构建器
 *
 * 基于队伍所有选手的英雄池数据，构建队伍级别的英雄池
 */

import { Champion } from './types';
import { PlayerPool } from './v4/types/l0-types';
import {
  TeamChampionPool,
  PlayerInTeam,
  PlayerChampionProficiency,
  ChampionTeamAvailability,
} from './team-champion-pool.types';

/**
 * 根据频率和时效性计算选手对某英雄的熟练度等级
 */
function calculateProficiencyLevel(
  frequency: number,
  isRecent: boolean
): 1 | 2 | 3 | 4 | 5 {
  let level: 1 | 2 | 3 | 4 | 5 = 1;

  // 基于频率
  if (frequency >= 0.20) level = 5;      // 20%+ 使用率 → 招牌英雄
  else if (frequency >= 0.10) level = 4; // 10%+ 使用率 → 精通
  else if (frequency >= 0.05) level = 3; // 5%+ 使用率 → 熟练
  else if (frequency >= 0.02) level = 2; // 2%+ 使用率 → 学习中
  else level = 1;                        // < 2% 使用率 → 备选

  // 最近使用加成（但不超过5星）
  if (isRecent && level < 5) {
    level = (level + 1) as 1 | 2 | 3 | 4 | 5;
  }

  return level;
}

/**
 * 计算队伍对某英雄的整体熟练度分数
 */
function calculateTeamProficiencyScore(
  availablePlayers: PlayerChampionProficiency[]
): number {
  if (availablePlayers.length === 0) return 0;

  // 1. 最擅长的选手权重最高
  const bestPlayerScore = availablePlayers[0].proficiencyLevel * 20; // 最高100分

  // 2. 有备选选手加分（灵活性加成）
  const flexibilityBonus = Math.min(availablePlayers.length - 1, 3) * 5; // 最多+15分

  // 3. 最近使用加分
  const recentBonus = availablePlayers.some((p) => p.isRecent) ? 10 : 0;

  // 4. 数据置信度调整
  const avgConfidence =
    availablePlayers.reduce((sum, p) => sum + p.confidence, 0) /
    availablePlayers.length;
  const confidenceMultiplier = 0.7 + avgConfidence * 0.3; // 0.7-1.0

  const rawScore = bestPlayerScore + flexibilityBonus + recentBonus;
  return Math.min(100, rawScore * confidenceMultiplier);
}

/**
 * 构建队伍英雄池
 */
export async function buildTeamChampionPool(
  teamId: string,
  teamName: string,
  players: PlayerInTeam[],
  allChampions: Champion[],
  playerPoolsMap: Map<string, PlayerPool>
): Promise<TeamChampionPool> {
  const championAvailability = new Map<string, ChampionTeamAvailability>();

  // 遍历所有英雄
  for (const champion of allChampions) {
    const championId = champion.id;
    const availablePlayers: PlayerChampionProficiency[] = [];

    // 检查每个选手是否会用这个英雄
    for (const player of players) {
      const pool = playerPoolsMap.get(player.playerId);
      if (!pool) continue;

      const frequency = pool.championFrequencies[championId] || 0;

      // 只要使用过就记录（频率 > 0）
      if (frequency > 0) {
        const isRecent = pool.recentPicks.slice(0, 10).includes(championId);
        const proficiency = calculateProficiencyLevel(frequency, isRecent);

        availablePlayers.push({
          playerId: player.playerId,
          playerName: player.playerName,
          proficiencyLevel: proficiency,
          frequency,
          isRecent,
          confidence: pool.confidence,
          totalGames: pool.totalGames,
        });
      }
    }

    // 如果至少有一个选手会用
    if (availablePlayers.length > 0) {
      // 按熟练度排序（熟练度相同则按频率排序）
      availablePlayers.sort((a, b) => {
        if (b.proficiencyLevel !== a.proficiencyLevel) {
          return b.proficiencyLevel - a.proficiencyLevel;
        }
        return b.frequency - a.frequency;
      });

      const bestPlayer = availablePlayers[0];
      const backupPlayers = availablePlayers.slice(1).map((p) => p.playerId);

      // 计算队伍级别的熟练度分数
      const teamScore = calculateTeamProficiencyScore(availablePlayers);

      // 计算灵活性分数（有多少人能用）
      const flexScore = availablePlayers.length / players.length;

      championAvailability.set(championId, {
        championId,
        availablePlayers,
        teamProficiencyScore: teamScore,
        bestPlayer: bestPlayer.playerId,
        backupPlayers,
        flexibilityScore: flexScore,
      });
    }
  }

  // 统计高熟练度英雄（80+分）
  const highProficiencyChampions: string[] = [];
  for (const [championId, availability] of championAvailability.entries()) {
    if (availability.teamProficiencyScore >= 80) {
      highProficiencyChampions.push(championId);
    }
  }

  // 统计灵活英雄（3+人可用）
  const flexibleChampions: string[] = [];
  for (const [championId, availability] of championAvailability.entries()) {
    if (availability.availablePlayers.length >= 3) {
      flexibleChampions.push(championId);
    }
  }

  // 计算整体数据质量
  const avgConfidence =
    players.reduce((sum, player) => {
      const pool = playerPoolsMap.get(player.playerId);
      return sum + (pool?.confidence || 0);
    }, 0) / players.length;

  return {
    teamId,
    teamName,
    players,
    championAvailability,
    totalChampions: championAvailability.size,
    highProficiencyChampions,
    flexibleChampions,
    generatedAt: new Date(),
    dataQuality: avgConfidence,
  };
}

/**
 * 获取队伍对某英雄的可用性信息
 */
export function getChampionAvailability(
  championId: string,
  teamPool: TeamChampionPool
): ChampionTeamAvailability | null {
  return teamPool.championAvailability.get(championId) || null;
}

/**
 * 获取队伍的高熟练度英雄列表
 */
export function getHighProficiencyChampions(
  teamPool: TeamChampionPool,
  minScore: number = 80
): ChampionTeamAvailability[] {
  const result: ChampionTeamAvailability[] = [];

  for (const availability of teamPool.championAvailability.values()) {
    if (availability.teamProficiencyScore >= minScore) {
      result.push(availability);
    }
  }

  // 按熟练度分数排序
  result.sort((a, b) => b.teamProficiencyScore - a.teamProficiencyScore);

  return result;
}

/**
 * 获取队伍的灵活英雄列表
 */
export function getFlexibleChampions(
  teamPool: TeamChampionPool,
  minPlayers: number = 3
): ChampionTeamAvailability[] {
  const result: ChampionTeamAvailability[] = [];

  for (const availability of teamPool.championAvailability.values()) {
    if (availability.availablePlayers.length >= minPlayers) {
      result.push(availability);
    }
  }

  // 按可用人数排序
  result.sort(
    (a, b) => b.availablePlayers.length - a.availablePlayers.length
  );

  return result;
}

/**
 * 获取推荐 Ban 的敌方英雄
 * 优先级：高熟练度 + 低灵活性（唯一选择）
 */
export function getRecommendedBans(
  enemyTeamPool: TeamChampionPool,
  topN: number = 5
): ChampionTeamAvailability[] {
  const candidates: Array<{
    availability: ChampionTeamAvailability;
    banValue: number;
  }> = [];

  for (const availability of enemyTeamPool.championAvailability.values()) {
    // Ban 价值 = 熟练度分数 × (2 - 灵活性分数)
    // 熟练度高且只有一人会用的英雄，ban 价值最高
    const banValue =
      availability.teamProficiencyScore * (2 - availability.flexibilityScore);

    candidates.push({ availability, banValue });
  }

  // 按 ban 价值排序
  candidates.sort((a, b) => b.banValue - a.banValue);

  return candidates.slice(0, topN).map((c) => c.availability);
}

/**
 * 计算熟练度权重系数
 * 用于调整推荐分数
 */
export function calculateProficiencyMultiplier(teamScore: number): number {
  if (teamScore >= 80) return 1.3; // 队伍非常擅长
  if (teamScore >= 60) return 1.15; // 队伍擅长
  if (teamScore >= 40) return 1.0; // 队伍熟练
  if (teamScore >= 20) return 0.85; // 队伍一般
  return 0.7; // 队伍不太会用
}
