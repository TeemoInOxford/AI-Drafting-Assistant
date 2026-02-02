/**
 * Weight Learning System Types
 * 权重学习系统类型定义 - 数据驱动的权重优化
 */

import { BanPhaseWeights } from './advanced-ban-scoring.types';
import { Champion, BPState } from './types';
import { TeamChampionPool } from './team-champion-pool.types';

/**
 * 训练数据样本
 */
export interface TrainingSample {
  // 输入特征
  bpState: BPState;
  enemyTeamPool: TeamChampionPool | null;
  availableChampions: Champion[];

  // 标签（实际Ban的英雄）
  actualBan: Champion;

  // 上下文信息
  matchId: string;
  teamId: string;
  teamName: string;
  opponentId: string;
  opponentName: string;

  // 比赛结果
  matchResult: 'win' | 'loss';

  // 元数据
  patch: string;
  date: Date;
  tournamentName: string;
  importance: number;  // 0-1，比赛重要性
}

/**
 * 训练数据集
 */
export interface TrainingDataset {
  samples: TrainingSample[];
  metadata: {
    totalSamples: number;
    dateRange: { start: Date; end: Date };
    patches: string[];
    teams: string[];
    tournaments: string[];
  };
}

/**
 * 学习到的权重
 */
export interface LearnedWeights {
  // Ban阶段权重
  phase1Weights: BanPhaseWeights;
  phase2Weights: BanPhaseWeights;

  // 置信度和统计信息
  confidence: number;        // 0-1，基于样本量和验证结果
  sampleSize: number;        // 训练样本数量
  validationAccuracy: number; // 验证集准确度

  // 训练信息
  trainingMetrics: {
    loss: number;            // 最终损失值
    iterations: number;      // 迭代次数
    convergenceTime: number; // 收敛时间（秒）
  };

  // 元数据
  version: string;           // 权重版本号
  lastUpdated: Date;
  trainingConfig: WeightLearningConfig;
}

/**
 * 权重学习配置
 */
export interface WeightLearningConfig {
  // 优化算法
  algorithm: 'gradient_descent' | 'adam' | 'genetic' | 'bayesian';

  // 学习率
  learningRate: number;

  // 迭代次数
  maxIterations: number;

  // 收敛阈值
  convergenceThreshold: number;

  // 正则化
  regularization: {
    type: 'l1' | 'l2' | 'none';
    lambda: number;
  };

  // 交叉验证
  crossValidation: {
    folds: number;
    testSize: number;  // 0-1
  };

  // 权重约束
  constraints: {
    minWeight: number;  // 最小权重值
    maxWeight: number;  // 最大权重值
    sumToOne: boolean;  // 是否要求权重和为1
  };

  // 早停
  earlyStop: {
    enabled: boolean;
    patience: number;   // 多少次迭代无改进后停止
    minDelta: number;   // 最小改进阈值
  };
}

/**
 * 默认配置
 */
export const DEFAULT_WEIGHT_LEARNING_CONFIG: WeightLearningConfig = {
  algorithm: 'adam',
  learningRate: 0.01,
  maxIterations: 1000,
  convergenceThreshold: 0.001,
  regularization: {
    type: 'l2',
    lambda: 0.01,
  },
  crossValidation: {
    folds: 5,
    testSize: 0.2,
  },
  constraints: {
    minWeight: 0.05,
    maxWeight: 0.60,
    sumToOne: true,
  },
  earlyStop: {
    enabled: true,
    patience: 50,
    minDelta: 0.0001,
  },
};

/**
 * 训练进度
 */
export interface TrainingProgress {
  currentIteration: number;
  totalIterations: number;
  currentLoss: number;
  bestLoss: number;
  validationAccuracy: number;
  elapsedTime: number;  // 秒
  estimatedTimeRemaining: number;  // 秒
  status: 'running' | 'converged' | 'stopped' | 'failed';
}

/**
 * 权重评估结果
 */
export interface WeightEvaluationResult {
  weights: BanPhaseWeights;

  // 性能指标
  metrics: {
    accuracy: number;        // 准确率（Top-1）
    top3Accuracy: number;    // Top-3准确率
    top5Accuracy: number;    // Top-5准确率
    mrr: number;             // Mean Reciprocal Rank
    ndcg: number;            // Normalized Discounted Cumulative Gain
  };

  // 混淆矩阵
  confusionMatrix?: number[][];

  // 特征重要性
  featureImportance: {
    heroStrength: number;
    enemyProficiency: number;
    restrictionImpact: number;
    strategicValue: number;
  };

  // 样本数量
  sampleSize: number;
}

/**
 * 权重对比结果
 */
export interface WeightComparisonResult {
  baseline: WeightEvaluationResult;  // 基线权重（当前）
  learned: WeightEvaluationResult;   // 学习到的权重

  improvement: {
    accuracy: number;        // 准确率提升（百分点）
    top3Accuracy: number;
    top5Accuracy: number;
    mrr: number;
    ndcg: number;
  };

  statisticalSignificance: {
    pValue: number;
    isSignificant: boolean;  // p < 0.05
  };

  recommendation: 'adopt' | 'reject' | 'needs_more_data';
}

/**
 * 权重历史记录
 */
export interface WeightHistory {
  version: string;
  weights: LearnedWeights;
  evaluation: WeightEvaluationResult;
  deployedAt: Date;
  retiredAt?: Date;
  notes?: string;
}

/**
 * 目标函数类型
 */
export type ObjectiveFunction = (
  weights: BanPhaseWeights,
  samples: TrainingSample[]
) => number;

/**
 * 梯度类型
 */
export interface Gradient {
  heroStrength: number;
  enemyProficiency: number;
  restrictionImpact: number;
  strategicValue: number;
}
