/**
 * Counter Relationship System Types
 * 克制关系系统类型定义
 */

import { Champion, Position } from './types';

/**
 * 克制关系数据
 */
export interface CounterRelationship {
  championA: string;           // 英雄A的ID
  championB: string;           // 英雄B的ID
  counterScore: number;        // 克制分数 (0-1)，>0.5表示A克制B
  sampleSize: number;          // 样本数量（对局次数）
  winRateA: number;            // A对B的胜率 (0-1)
  winRateB: number;            // B对A的胜率 (0-1)
  confidence: number;          // 置信度 (0-1)，基于样本量
  position?: Position;         // 位置（如果是对线克制）
  lastUpdated: Date;           // 最后更新时间
}

/**
 * 克制关系统计数据
 */
export interface CounterStats {
  totalMatches: number;        // 总对局数
  winsA: number;               // A获胜次数
  winsB: number;               // B获胜次数
  avgGoldDiffAt15: number;     // 15分钟金币差（A-B）
  avgKillDiffAt15: number;     // 15分钟击杀差（A-B）
  laneWinRateA: number;        // A对线胜率（如果是对线）
}

/**
 * 匹配数据（用于提取克制关系）
 */
export interface MatchData {
  matchId: string;
  patch: string;
  date: Date;
  blueSide: TeamMatchData;
  redSide: TeamMatchData;
  winner: 'blue' | 'red';
  duration: number;            // 比赛时长（秒）
}

/**
 * 队伍匹配数据
 */
export interface TeamMatchData {
  teamId: string;
  teamName: string;
  bans: string[];              // Ban的英雄ID列表
  picks: ChampionPickData[];   // Pick的英雄数据
}

/**
 * 英雄Pick数据
 */
export interface ChampionPickData {
  championId: string;
  championName: string;
  position: Position;
  playerId: string;
  playerName: string;
  kills: number;
  deaths: number;
  assists: number;
  goldEarned: number;
  damageDealt: number;
  visionScore: number;
}

/**
 * 克制关系映射
 * Map<championId, Map<opponentId, CounterRelationship>>
 */
export type CounterMap = Map<string, Map<string, CounterRelationship>>;

/**
 * 克制关系分析结果
 */
export interface CounterAnalysisResult {
  championId: string;
  championName: string;
  strongAgainst: CounterRelationship[];  // 克制的英雄
  weakAgainst: CounterRelationship[];    // 被克制的英雄
  neutral: CounterRelationship[];        // 中性对局
  overallStrength: number;               // 整体强度 (0-100)
}

/**
 * 克制关系提取配置
 */
export interface CounterExtractionConfig {
  minSampleSize: number;       // 最小样本量（默认10）
  minConfidence: number;       // 最小置信度（默认0.6）
  counterThreshold: number;    // 克制阈值（默认0.6，胜率>60%视为克制）
  recentDays: number;          // 只考虑最近N天的数据（默认90）
  positionSpecific: boolean;   // 是否区分位置（默认true）
}

/**
 * 默认配置
 */
export const DEFAULT_COUNTER_CONFIG: CounterExtractionConfig = {
  minSampleSize: 10,
  minConfidence: 0.6,
  counterThreshold: 0.6,
  recentDays: 90,
  positionSpecific: true,
};
