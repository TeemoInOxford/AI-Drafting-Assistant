/**
 * System Discovery Types
 * 体系自动发现类型定义
 */

import { Champion, Position, ChampionClass } from './types';

/**
 * 发现的体系
 */
export interface DiscoveredSystem {
  id: string;                    // 唯一标识符
  name: string;                  // 体系名称（自动生成或人工标注）
  displayName: string;           // 显示名称

  // 核心英雄
  coreChampions: string[];       // 核心英雄ID列表（2-3个）
  synergyChampions: string[];    // 协同英雄ID列表（可选）

  // 统计数据
  stats: {
    pickCount: number;           // 出现次数
    winCount: number;            // 胜利次数
    winRate: number;             // 胜率 (0-1)
    pickRate: number;            // 出现率 (0-1)
    avgGameDuration: number;     // 平均游戏时长（秒）
  };

  // 协同分数
  synergyScore: number;          // 整体协同分数 (0-1)
  confidence: number;            // 置信度 (0-1)，基于样本量

  // 体系特征
  characteristics: {
    style: SystemStyle;          // 体系风格
    phase: GamePhase;            // 强势期
    positions: Position[];       // 涉及的位置
    tags: ChampionClass[];       // 英雄类型标签
  };

  // 生命周期
  lifecycle: {
    firstSeen: Date;             // 首次出现
    lastSeen: Date;              // 最后出现
    peakDate: Date;              // 巅峰期
    status: SystemStatus;        // 当前状态
    trendScore: number;          // 趋势分数 (-1到1)
  };

  // 版本信息
  patches: string[];             // 出现的版本
  dominantPatch: string;         // 主要版本

  // 元数据
  discoveredAt: Date;            // 发现时间
  lastUpdated: Date;             // 最后更新时间
  notes?: string;                // 备注
}

/**
 * 体系风格
 */
export type SystemStyle =
  | 'poke'           // 消耗流
  | 'engage'         // 开团流
  | 'split_push'     // 分推流
  | 'protect'        // 保护流
  | 'pick'           // 抓人流
  | 'teamfight'      // 团战流
  | 'early_game'     // 前期流
  | 'late_game'      // 后期流
  | 'global'         // 全图流
  | 'siege'          // 推进流
  | 'mixed';         // 混合

/**
 * 游戏阶段
 */
export type GamePhase =
  | 'early'          // 前期（0-15分钟）
  | 'mid'            // 中期（15-30分钟）
  | 'late'           // 后期（30分钟+）
  | 'all';           // 全阶段

/**
 * 体系状态
 */
export type SystemStatus =
  | 'emerging'       // 新兴
  | 'rising'         // 崛起
  | 'dominant'       // 主流
  | 'stable'         // 稳定
  | 'declining'      // 衰落
  | 'obsolete';      // 过时

/**
 * 英雄组合
 */
export interface ChampionCombo {
  champions: string[];           // 英雄ID列表
  pickCount: number;             // 出现次数
  winCount: number;              // 胜利次数
  winRate: number;               // 胜率
  synergyScore: number;          // 协同分数
  positions: Position[];         // 位置组合
}

/**
 * 体系发现配置
 */
export interface SystemDiscoveryConfig {
  // 组合大小
  minComboSize: number;          // 最小组合大小（默认2）
  maxComboSize: number;          // 最大组合大小（默认5）

  // 过滤阈值
  minPickCount: number;          // 最小出现次数（默认10）
  minWinRate: number;            // 最小胜率（默认0.50）
  minSynergyScore: number;       // 最小协同分数（默认0.55）

  // 聚类参数
  clustering: {
    algorithm: 'dbscan' | 'hierarchical' | 'kmeans';
    epsilon: number;             // DBSCAN的邻域半径
    minSamples: number;          // DBSCAN的最小样本数
    distanceMetric: 'jaccard' | 'cosine' | 'euclidean';
  };

  // 时间窗口
  timeWindow: {
    recentDays: number;          // 只考虑最近N天（默认90）
    minDaysActive: number;       // 最少活跃天数（默认7）
  };

  // 命名策略
  naming: {
    strategy: 'core_champion' | 'style_based' | 'manual';
    useDisplayNames: boolean;    // 使用显示名称
  };
}

/**
 * 默认配置
 */
export const DEFAULT_SYSTEM_DISCOVERY_CONFIG: SystemDiscoveryConfig = {
  minComboSize: 2,
  maxComboSize: 5,
  minPickCount: 10,
  minWinRate: 0.50,
  minSynergyScore: 0.55,
  clustering: {
    algorithm: 'dbscan',
    epsilon: 0.3,
    minSamples: 3,
    distanceMetric: 'jaccard',
  },
  timeWindow: {
    recentDays: 90,
    minDaysActive: 7,
  },
  naming: {
    strategy: 'core_champion',
    useDisplayNames: true,
  },
};

/**
 * 体系发现结果
 */
export interface SystemDiscoveryResult {
  systems: DiscoveredSystem[];
  metadata: {
    totalCombos: number;         // 总组合数
    filteredCombos: number;      // 过滤后组合数
    clustersFound: number;       // 发现的聚类数
    dateRange: {
      start: Date;
      end: Date;
    };
    patches: string[];
  };
  statistics: {
    avgSystemSize: number;       // 平均体系大小
    avgWinRate: number;          // 平均胜率
    avgSynergyScore: number;     // 平均协同分数
  };
}

/**
 * 体系对比
 */
export interface SystemComparison {
  system1: DiscoveredSystem;
  system2: DiscoveredSystem;
  similarity: number;            // 相似度 (0-1)
  commonChampions: string[];     // 共同英雄
  differences: {
    uniqueToSystem1: string[];
    uniqueToSystem2: string[];
  };
}

/**
 * 体系趋势分析
 */
export interface SystemTrend {
  systemId: string;
  systemName: string;
  dataPoints: {
    date: Date;
    pickCount: number;
    winRate: number;
    popularity: number;          // 流行度 (0-1)
  }[];
  trend: 'rising' | 'stable' | 'declining';
  changeRate: number;            // 变化率（每周）
  prediction: {
    nextWeekPopularity: number;
    confidence: number;
  };
}

/**
 * 体系推荐
 */
export interface SystemRecommendation {
  system: DiscoveredSystem;
  score: number;                 // 推荐分数 (0-100)
  reasons: string[];             // 推荐理由
  counters: string[];            // 克制的体系
  counteredBy: string[];         // 被克制的体系
  difficulty: 'easy' | 'medium' | 'hard';  // 执行难度
}

/**
 * 聚类结果
 */
export interface ClusterResult {
  clusterId: number;
  combos: ChampionCombo[];
  centroid: string[];            // 聚类中心（代表性英雄）
  size: number;
  avgWinRate: number;
  avgSynergyScore: number;
}
