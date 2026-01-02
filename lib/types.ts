// 英雄数据类型
export interface Champion {
  id: string;           // 如 "Aatrox"
  key: string;          // 如 "266"
  name: string;         // 显示名称（根据语言）
  enName: string;       // 英文名称
  zhName: string;       // 中文名称
  image: string;        // 头像URL
  positions: Position[]; // 位置
}

// 位置类型
export type Position = 'top' | 'jungle' | 'mid' | 'bot' | 'support';

// 位置信息
export interface PositionInfo {
  id: Position;
  enName: string;
  zhName: string;
  icon: string;
}

// 队伍类型
export type Team = 'blue' | 'red';

// 操作类型
export type ActionType = 'ban' | 'pick';

// BP步骤定义
export interface BPStep {
  team: Team;
  action: ActionType;
  index: number;        // 该队伍该操作的第几个（0-4）
}

// BP状态
export interface BPState {
  currentStep: number;  // 当前步骤索引（0-19）
  blueBans: (Champion | null)[];    // 蓝方Ban的英雄（5个）
  redBans: (Champion | null)[];     // 红方Ban的英雄（5个）
  bluePicks: (Champion | null)[];   // 蓝方Pick的英雄（5个）
  redPicks: (Champion | null)[];    // 红方Pick的英雄（5个）
  usedChampions: Set<string>;       // 已使用的英雄ID
  history: BPHistoryEntry[];        // 操作历史（用于撤销）
}

// 历史记录条目
export interface BPHistoryEntry {
  step: number;
  championId: string;
  team: Team;
  action: ActionType;
}

// 语言类型
export type Language = 'zh' | 'en';

// AI 控制模式
export type AIControlMode = 'off' | 'blue' | 'red' | 'both';

// AI 模式状态
export interface AIState {
  mode: AIControlMode;
  isThinking: boolean;
  lastRecommendation: AIRecommendation | null;
  autoPlay: boolean; // 是否自动执行AI选择
  thinkingDelay: number; // AI思考延迟(ms)，模拟真人
}

// AI 推荐结果
export interface AIRecommendation {
  champion: string;
  score: number;
  reason: string;
  winRate?: number;
}

// AI 完整分析结果
export interface AIAnalysis {
  recommendations: AIRecommendation[];
  currentWinRate: number; // 当前阵容预测胜率
  warnings: AIWarning[];
  insights: string[];
}

// AI 警告
export interface AIWarning {
  type: 'danger' | 'warning' | 'info';
  message: string;
}

// DDragon API响应类型
export interface DDragonChampionData {
  type: string;
  format: string;
  version: string;
  data: Record<string, {
    id: string;
    key: string;
    name: string;
    title: string;
    image: {
      full: string;
    };
  }>;
}
