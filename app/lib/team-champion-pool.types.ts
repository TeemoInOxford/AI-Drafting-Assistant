/**
 * Team Champion Pool Types
 * 队伍英雄池数据结构
 *
 * 考虑了游戏内英雄交换机制，以队伍整体视角评估英雄池
 */

import { Position } from './types';

/**
 * 队伍中的选手信息
 */
export interface PlayerInTeam {
  playerId: string;
  playerName: string;
  orderIndex: number;  // BP顺序（0-4），不代表游戏内位置
}

/**
 * 选手对某个英雄的熟练度信息
 */
export interface PlayerChampionProficiency {
  playerId: string;
  playerName: string;
  proficiencyLevel: 1 | 2 | 3 | 4 | 5;  // 熟练度等级
  frequency: number;  // 使用频率 (0-1)
  isRecent: boolean;  // 最近是否使用过（最近10场）
  confidence: number;  // 数据置信度 (0-1)
  totalGames: number;  // 该选手总场次
}

/**
 * 队伍对某个英雄的可用性信息
 */
export interface ChampionTeamAvailability {
  championId: string;

  // 队伍中谁能用这个英雄
  availablePlayers: PlayerChampionProficiency[];

  // 队伍级别的评分
  teamProficiencyScore: number;  // 0-100：队伍对这个英雄的整体熟练度
  bestPlayer: string;  // 最擅长这个英雄的选手ID
  backupPlayers: string[];  // 备选选手ID列表

  // 灵活性评分
  flexibilityScore: number;  // 0-1：有多少人能用（越多越灵活）
}

/**
 * 队伍英雄池
 */
export interface TeamChampionPool {
  teamId: string;
  teamName: string;
  players: PlayerInTeam[];

  // 核心数据：队伍级别的英雄池
  // Map<championId, ChampionTeamAvailability>
  championAvailability: Map<string, ChampionTeamAvailability>;

  // 统计信息
  totalChampions: number;  // 队伍可用的英雄总数
  highProficiencyChampions: string[];  // 高熟练度英雄列表（80+分）
  flexibleChampions: string[];  // 灵活英雄列表（3+人可用）

  // 元数据
  generatedAt: Date;
  dataQuality: number;  // 0-1：整体数据质量
}

/**
 * 战队设置状态
 */
export interface TeamSetupState {
  enabled: boolean;

  blueTeam: {
    teamId: string | null;
    teamName: string;
    teamLogo: string | null;
    playerOrder: PlayerInTeam[];  // 选手顺序列表
  };

  redTeam: {
    teamId: string | null;
    teamName: string;
    teamLogo: string | null;
    playerOrder: PlayerInTeam[];
  };
}

/**
 * 战队数据（从 API 获取）
 */
export interface TeamData {
  id: string;
  name: string;
  nameShortened?: string;
  logoUrl: string | null;
  region?: {
    code: string;
    name: string;
  };
  playerCount: number;
  seriesCount: number;
  players: {
    id: string;
    nickname: string;
    seriesCount?: number;
  }[];
}
