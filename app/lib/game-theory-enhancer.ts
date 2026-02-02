/**
 * 博弈论增强模块 - 轻量级设计
 * 在现有PTS基础上增加博弈论考量，而不是完全替代
 */

import { Champion, BPState, BPStep, Position, PTSResult } from './types';

/**
 * 对手类型（简化版）
 * 基于观察到的行为推断
 */
export type OpponentStyle =
  | 'aggressive'    // 激进型：优先高伤害、carry型英雄
  | 'defensive'     // 防守型：优先坦克、控制
  | 'meta'          // Meta型：严格按照版本强度选择
  | 'counter'       // 针对型：针对我方阵容选择
  | 'unknown';      // 未知（初始状态）

/**
 * 博弈状态
 */
export interface GameTheoryState {
  opponentStyle: OpponentStyle;
  confidence: number;           // 0-1，对判断的信心
  observedActions: string[];    // 对手已选择的英雄
  predictedNextPick?: string;   // 预测对手下一个选择
}

/**
 * 博弈论增强配置
 */
export interface GameTheoryConfig {
  enabled: boolean;
  counterWeight: number;        // 针对性权重 (0-1)
  adaptiveWeight: number;       // 适应性权重 (0-1)
  minConfidence: number;        // 最小信心阈值
}

export const DEFAULT_GAME_THEORY_CONFIG: GameTheoryConfig = {
  enabled: true,
  counterWeight: 0.3,
  adaptiveWeight: 0.2,
  minConfidence: 0.4,
};

/**
 * 初始化博弈状态
 */
export function initGameTheoryState(): GameTheoryState {
  return {
    opponentStyle: 'unknown',
    confidence: 0,
    observedActions: [],
  };
}

/**
 * 根据对手行为更新博弈状态（简化版贝叶斯更新）
 */
export function updateGameTheoryState(
  state: GameTheoryState,
  newAction: Champion,
  bpState: BPState
): GameTheoryState {
  const newObserved = [...state.observedActions, newAction.name];

  // 分析对手风格
  const styleScores = analyzeOpponentStyle(newObserved, bpState);

  // 找出最可能的风格
  const maxScore = Math.max(...Object.values(styleScores));
  const likelyStyle = Object.entries(styleScores)
    .find(([_, score]) => score === maxScore)?.[0] as OpponentStyle || 'unknown';

  // 计算信心度（随着观察增加而提高）
  const observationCount = newObserved.length;
  const baseConfidence = Math.min(observationCount / 5, 1.0); // 5次观察达到满信心
  const styleConfidence = maxScore / 100; // 风格得分归一化
  const confidence = (baseConfidence + styleConfidence) / 2;

  return {
    opponentStyle: likelyStyle,
    confidence,
    observedActions: newObserved,
  };
}

/**
 * 分析对手风格（基于已选英雄）
 */
function analyzeOpponentStyle(
  observedChampions: string[],
  bpState: BPState
): Record<OpponentStyle, number> {
  const scores: Record<OpponentStyle, number> = {
    aggressive: 0,
    defensive: 0,
    meta: 0,
    counter: 0,
    unknown: 0,
  };

  // 这里可以基于英雄的tags来判断
  // 简化实现：基于英雄名称的启发式规则
  observedChampions.forEach(champName => {
    // 激进型信号：Assassin, Fighter, Marksman
    if (isAggressiveChampion(champName)) {
      scores.aggressive += 20;
    }

    // 防守型信号：Tank, Support, Controller
    if (isDefensiveChampion(champName)) {
      scores.defensive += 20;
    }

    // Meta型信号：高ban率英雄
    if (isMetaChampion(champName, bpState)) {
      scores.meta += 15;
    }

    // 针对型信号：选择了我方英雄的counter
    if (isCounterPick(champName, bpState)) {
      scores.counter += 25;
    }
  });

  return scores;
}

/**
 * 判断是否为激进型英雄（简化版）
 */
function isAggressiveChampion(champName: string): boolean {
  const aggressiveKeywords = ['Zed', 'Yasuo', 'Katarina', 'Akali', 'LeBlanc', 'Draven', 'Vayne'];
  return aggressiveKeywords.some(keyword => champName.includes(keyword));
}

/**
 * 判断是否为防守型英雄（简化版）
 */
function isDefensiveChampion(champName: string): boolean {
  const defensiveKeywords = ['Braum', 'Thresh', 'Leona', 'Alistar', 'Maokai', 'Ornn', 'Shen'];
  return defensiveKeywords.some(keyword => champName.includes(keyword));
}

/**
 * 判断是否为Meta英雄（基于ban情况）
 */
function isMetaChampion(champName: string, bpState: BPState): boolean {
  const allBans = [...bpState.blueBans, ...bpState.redBans]
    .filter(ban => ban.champion)
    .map(ban => ban.champion!.name);

  // 如果这个英雄的"同类"被ban了很多，说明是meta
  // 简化：检查是否有相似名称的英雄被ban
  return allBans.some(bannedName =>
    bannedName.substring(0, 3) === champName.substring(0, 3)
  );
}

/**
 * 判断是否为针对性选择
 */
function isCounterPick(champName: string, bpState: BPState): boolean {
  // 简化：如果对手在我方选人后立即选择，可能是counter
  // 这需要更复杂的counter关系数据库
  return false; // TODO: 实现counter关系检测
}

/**
 * 博弈论增强PTS分数
 * 在原有PTS基础上，根据博弈状态调整分数
 */
export function enhancePTSWithGameTheory(
  ptsResults: PTSResult[],
  gameState: GameTheoryState,
  bpState: BPState,
  config: GameTheoryConfig = DEFAULT_GAME_THEORY_CONFIG
): PTSResult[] {
  if (!config.enabled || gameState.confidence < config.minConfidence) {
    // 信心不足，不做调整
    return ptsResults;
  }

  return ptsResults.map(result => {
    let adjustment = 0;

    // 根据对手风格调整
    switch (gameState.opponentStyle) {
      case 'aggressive':
        // 对手激进，提高防守型英雄的优先级
        if (isDefensiveChampion(result.championName)) {
          adjustment += 15 * gameState.confidence;
        }
        break;

      case 'defensive':
        // 对手防守，提高突破型英雄的优先级
        if (isAggressiveChampion(result.championName)) {
          adjustment += 15 * gameState.confidence;
        }
        break;

      case 'meta':
        // 对手跟meta，我们也选meta或者选counter
        if (isMetaChampion(result.championName, bpState)) {
          adjustment += 10 * gameState.confidence;
        }
        break;

      case 'counter':
        // 对手喜欢counter，我们选灵活性高的英雄
        if (result.isFlex) {
          adjustment += 20 * gameState.confidence;
        }
        break;
    }

    // 应用调整
    const newPTS = result.pts + adjustment;

    return {
      ...result,
      pts: newPTS,
      explanation: adjustment > 0
        ? `${result.explanation} [博弈调整: +${adjustment.toFixed(1)}分，对手风格: ${getStyleNameZh(gameState.opponentStyle)}]`
        : result.explanation,
    };
  }).sort((a, b) => b.pts - a.pts); // 重新排序
}

/**
 * 获取风格中文名称
 */
function getStyleNameZh(style: OpponentStyle): string {
  const names: Record<OpponentStyle, string> = {
    aggressive: '激进型',
    defensive: '防守型',
    meta: 'Meta型',
    counter: '针对型',
    unknown: '未知',
  };
  return names[style];
}

/**
 * 预测对手下一步可能的选择（简化版）
 */
export function predictOpponentNextPick(
  gameState: GameTheoryState,
  availableChampions: Champion[],
  bpState: BPState
): Champion | null {
  if (gameState.confidence < 0.5) {
    return null; // 信心不足，不做预测
  }

  // 根据对手风格筛选候选
  let candidates = availableChampions;

  switch (gameState.opponentStyle) {
    case 'aggressive':
      candidates = candidates.filter(c => isAggressiveChampion(c.name));
      break;
    case 'defensive':
      candidates = candidates.filter(c => isDefensiveChampion(c.name));
      break;
    case 'meta':
      candidates = candidates.filter(c => isMetaChampion(c.name, bpState));
      break;
  }

  // 返回第一个候选（可以改进为更复杂的选择逻辑）
  return candidates.length > 0 ? candidates[0] : null;
}
