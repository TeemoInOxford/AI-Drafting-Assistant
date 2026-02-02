/**
 * AI Hint Panel Type Definitions
 */

/**
 * 推荐等级
 */
export type RecommendationTier =
  | 'MustPick'      // ≥0.80 - 强烈推荐
  | 'Strong'        // ≥0.65 - 推荐
  | 'Stable'        // ≥0.50 - 稳定选择
  | 'Situational'   // ≥0.35 - 情境依赖
  | 'Avoid';        // <0.35 - 不推荐

/**
 * 置信度等级
 */
export type ConfidenceLevel =
  | 'VeryHigh'  // 90-100%
  | 'High'      // 70-89%
  | 'Medium'    // 50-69%
  | 'Low'       // 30-49%
  | 'VeryLow';  // 0-29%

/**
 * 不确定性警告类型
 */
export type UncertaintyType =
  | 'LowConfidence'      // 置信度过低
  | 'InsufficientData'   // 数据不足
  | 'HighVariance'       // 高方差
  | 'ConflictingSignals'; // 信号冲突

/**
 * 不确定性警告
 */
export interface UncertaintyWarning {
  type: UncertaintyType;
  severity: 'high' | 'medium' | 'low';
  message: string;
  detail?: string;
}

/**
 * 推荐理由
 */
export interface RecommendationReason {
  text: string;
  importance: 1 | 2 | 3 | 4 | 5; // 星级
  dataSupport?: string; // 数据支撑（如 "+12% WR"）
}

/**
 * 单个推荐项
 */
export interface ChampionRecommendation {
  championId: string;
  championName: string;
  championImage: string;

  // 评分
  score: number; // 0-1
  scoreRange?: { low: number; high: number }; // 不确定性区间

  // 推荐等级
  tier: RecommendationTier;

  // 置信度
  confidence: number; // 0-1
  confidenceLevel: ConfidenceLevel;

  // 推荐理由（Top 2）
  whyPick: RecommendationReason[];

  // 风险提示（Top 1-2）
  whyNot?: RecommendationReason[];

  // 不确定性警告
  uncertainties: UncertaintyWarning[];

  // 阶段评分（可选）
  phaseScores?: {
    early: number;
    mid: number;
    late: number;
    current: 'early' | 'mid' | 'late';
  };
}

/**
 * 博弈层信号（可选）
 */
export interface GameSignal {
  enabled: boolean;
  confidence: number; // 0-1

  // 对手可能响应
  opponentResponses?: {
    championName: string;
    probability: number; // 0-1
  }[];

  // 风险评估
  riskLevel?: 'low' | 'medium' | 'high';
  riskMessage?: string;

  // 时机提示
  timingAdvice?: {
    pickNow: boolean;
    reason: string;
  };
}

/**
 * AI 提示面板的 Props
 */
export interface AIHintPanelProps {
  // 当前 BP 状态
  currentPhase: 'ban1' | 'pick1' | 'ban2' | 'pick2';
  currentTurn: number;
  currentSide: 'blue' | 'red';

  // 推荐列表（Top N）
  recommendations: ChampionRecommendation[];

  // 博弈层信号（可选）
  gameSignal?: GameSignal;

  // 系统状态
  systemStatus: {
    isLoading: boolean;
    lastUpdated?: Date;
    overallConfidence: number;
  };

  // 回调
  onChampionSelect?: (championId: string) => void;
  onRefresh?: () => void;
  onClose?: () => void;

  // 可见性控制
  visible?: boolean;
  collapsible?: boolean;
}
