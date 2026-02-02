/**
 * Advanced Ban Scoring System Types
 * 优化的 Ban 评分系统类型定义
 */

import { Champion, BPState, Position } from './types';
import { TeamChampionPool } from './team-champion-pool.types';

/**
 * Ban 评分的各个维度
 */
export interface BanScoreDimensions {
  heroStrength: number;        // 英雄强度 (0-100)
  enemyProficiency: number;    // 敌方熟练度 (0-100)
  restrictionImpact: number;   // 限制效果 (0-100)
  strategicValue: number;      // 战略价值 (0-100)
  timingFit: number;          // 时机适配度 (0-100)
}

/**
 * 英雄强度评分的子指标
 */
export interface HeroStrengthMetrics {
  winRate: number;            // 版本胜率 (0-100)
  banRate: number;            // 职业比赛Ban率 (0-100)
  pickRate: number;           // 职业比赛Pick率 (0-100)
  metaTier: number;           // Meta等级 (0-100)
  overallScore: number;       // 综合分数 (0-100)
}

/**
 * 敌方熟练度评分的子指标
 */
export interface EnemyProficiencyMetrics {
  signatureScore: number;     // 招牌英雄评分 (0-100)
  recencyScore: number;       // 时效性评分 (0-100)
  confidenceScore: number;    // 数据置信度 (0-100)
  overallScore: number;       // 综合分数 (0-100)
}

/**
 * 招牌英雄识别
 */
export interface SignatureHeroAnalysis {
  isSignature: boolean;       // 是否是招牌英雄
  teamProficiency: number;    // 队伍熟练度 (0-100)
  bestPlayerProficiency: number; // 最擅长选手熟练度 (1-5星)
  usageFrequency: number;     // 使用频率 (0-1)
  score: number;              // 招牌英雄评分 (0-100)
}

/**
 * 时效性分析
 */
export interface RecencyAnalysis {
  recentUsageCount: number;   // 最近10场使用次数
  daysSinceLastUse: number;   // 距离上次使用天数
  decayFactor: number;        // 衰减系数 (0-1)
  score: number;              // 时效性评分 (0-100)
}

/**
 * 限制效果评分的子指标
 */
export interface RestrictionImpactMetrics {
  poolCompressionScore: number;    // 英雄池压缩度 (0-100)
  positionCompressionScore: number; // 位置压缩度 (0-100)
  overallScore: number;            // 综合分数 (0-100)
}

/**
 * 英雄池压缩分析
 */
export interface PoolCompressionAnalysis {
  availablePlayerCount: number;    // 可用人数
  alternativeCount: number;        // 备选数量
  uniquenessScore: number;         // 唯一性评分 (0-100)
  replacementDifficulty: number;   // 替代难度 (0-100)
  score: number;                   // 压缩度评分 (0-100)
}

/**
 * 位置压缩分析
 */
export interface PositionCompressionAnalysis {
  position: Position;              // 位置
  alreadyBannedCount: number;      // 该位置已Ban数量
  totalAvailableCount: number;     // 该位置可用英雄数
  poolDepth: number;               // 英雄池深度
  score: number;                   // 位置压缩度 (0-100)
}

/**
 * 战略价值评分的子指标
 */
export interface StrategicValueMetrics {
  systemCoreScore: number;         // 体系核心度 (0-100)
  targetingScore: number;          // 针对性评分 (0-100)
  protectionScore: number;         // 保护性评分 (0-100)
  overallScore: number;            // 综合分数 (0-100)
}

/**
 * 体系核心分析
 */
export interface SystemCoreAnalysis {
  isSystemCore: boolean;           // 是否是体系核心
  systemName: string;              // 体系名称
  disruptionLevel: number;         // 破坏程度 (0-100)
  score: number;                   // 体系核心度 (0-100)
}

/**
 * 针对性分析
 */
export interface TargetingAnalysis {
  targetsCorePlayer: boolean;      // 是否针对核心选手
  targetsKeyPosition: boolean;     // 是否针对关键位置
  consecutiveBanBonus: number;     // 连续针对加成 (0-30)
  score: number;                   // 针对性评分 (0-100)
}

/**
 * 保护性分析
 */
export interface ProtectionAnalysis {
  countersOurPicks: boolean;       // 是否Counter我方已选
  countersOurExpected: boolean;    // 是否Counter我方预期
  preventsEnemyCombo: boolean;     // 是否防止敌方组合
  score: number;                   // 保护性评分 (0-100)
}

/**
 * 时机适配度分析
 */
export interface TimingFitAnalysis {
  currentPhase: 'ban1' | 'ban2';   // 当前阶段
  informationCompleteness: number; // 信息完整度 (0-1)
  phaseWeights: BanPhaseWeights;   // 阶段权重
  timingMultiplier: number;        // 时机系数 (0.9-1.1)
}

/**
 * BP 阶段权重
 */
export interface BanPhaseWeights {
  heroStrength: number;            // 英雄强度权重
  enemyProficiency: number;        // 敌方熟练度权重
  restrictionImpact: number;       // 限制效果权重
  strategicValue: number;          // 战略价值权重
}

/**
 * 完整的 Ban 评分结果
 */
export interface BanScoreResult {
  championId: string;
  championName: string;

  // 各维度分数
  dimensions: BanScoreDimensions;

  // 详细指标
  heroStrength: HeroStrengthMetrics;
  enemyProficiency: EnemyProficiencyMetrics;
  restrictionImpact: RestrictionImpactMetrics;
  strategicValue: StrategicValueMetrics;
  timingFit: TimingFitAnalysis;

  // 最终分数
  baseScore: number;               // 基础分数 (0-100)
  finalScore: number;              // 最终分数 (0-100)

  // 推荐理由
  reason: string;                  // 简短理由
  detailedReason: string[];        // 详细理由（多条）

  // 优先级标签
  priority: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Ban 推荐配置
 */
export interface BanScoringConfig {
  // 第1轮Ban权重
  phase1Weights: BanPhaseWeights;

  // 第2轮Ban权重
  phase2Weights: BanPhaseWeights;

  // 招牌英雄阈值
  signatureThreshold: number;      // 默认 80

  // 高熟练度阈值
  highProficiencyThreshold: number; // 默认 60

  // 时效性衰减参数
  recencyDecayDays: number[];      // [7, 14, 30, 60]

  // 是否启用体系识别
  enableSystemDetection: boolean;
}

/**
 * 默认配置
 */
export const DEFAULT_BAN_SCORING_CONFIG: BanScoringConfig = {
  phase1Weights: {
    heroStrength: 0.35,
    enemyProficiency: 0.30,
    restrictionImpact: 0.25,
    strategicValue: 0.10,
  },
  phase2Weights: {
    heroStrength: 0.20,
    enemyProficiency: 0.30,
    restrictionImpact: 0.25,
    strategicValue: 0.25,
  },
  signatureThreshold: 80,
  highProficiencyThreshold: 60,
  recencyDecayDays: [7, 14, 30, 60],
  enableSystemDetection: true,
};
