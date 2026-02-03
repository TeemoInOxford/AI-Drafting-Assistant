/**
 * 融合博弈论模型 - 结合Softmax理论与实用优化
 *
 * 核心创新：
 * 1. 使用Softmax建模选择概率（理论严谨）
 * 2. 动态候选池过滤（大幅降低计算量）
 * 3. 阶段感知权重（Early/Mid/Late不同策略）
 * 4. 轻量级对手建模（快速推断）
 */

import { Champion, BPState, BPStep, Position, PTSResult, Team, ChampionClass } from './types';

/**
 * 对手类型（扩展版）
 */
export type OpponentType =
  | 'aggressive'      // 激进型：优先carry
  | 'defensive'       // 防守型：优先坦克/辅助
  | 'meta_follower'   // Meta型：严格按版本强度
  | 'counter_focused' // 针对型：喜欢counter
  | 'flex_master'     // 摇摆型：喜欢多位置英雄
  | 'unknown';        // 未知

/**
 * 对手信念分布（Belief Distribution）
 */
export interface BeliefDistribution {
  aggressive: number;
  defensive: number;
  meta_follower: number;
  counter_focused: number;
  flex_master: number;
  unknown: number;
}

/**
 * 博弈状态
 */
export interface GameTheoryState {
  belief: BeliefDistribution;      // 对手类型的概率分布
  observedActions: ObservedAction[]; // 观察到的行为
  confidence: number;                // 整体信心度
  predictedType: OpponentType;       // 最可能的类型
}

/**
 * 观察到的行为
 */
export interface ObservedAction {
  champion: Champion;
  step: number;
  action: 'ban' | 'pick';
  context: {
    ourLastPick?: Champion;
    availableRoles: Position[];
  };
}

/**
 * 特征重叠衰减配置
 * 用于降低与PTS重复计算的特征权重，避免某些因素影响过大
 */
export const FEATURE_DECAY_CONFIG = {
  // 重复特征的衰减系数（0.0-1.0）
  // 0.0 = 完全移除，1.0 = 不衰减
  PTS_DECAY: 0.3,        // f1_pts 已在PTS中计算
  ROLE_DECAY: 0.4,       // f3_role_urgency 已在PTS的roleVacancy中计算
  META_DECAY: 0.3,       // f5_meta_strength 已在PTS的metaPresence中计算

  // 博弈论独有特征不衰减
  STYLE_DECAY: 1.0,      // f2_style_match 博弈论独有
  RISK_DECAY: 1.0,       // f4_risk_aversion 博弈论独有
};

/**
 * 特征函数（用于Softmax）
 */
export interface FeatureVector {
  f1_pts: number;           // PTS分数（归一化到0-1）- 已应用衰减
  f2_style_match: number;   // 与对手风格匹配度 - 博弈论独有
  f3_role_urgency: number;  // 位置紧迫性 - 已应用衰减
  f4_risk_aversion: number; // 风险规避 - 博弈论独有
  f5_meta_strength: number; // Meta强度 - 已应用衰减
}

/**
 * 阶段感知权重
 */
export interface StageWeights {
  w1_pts: number;
  w2_style: number;
  w3_role: number;
  w4_risk: number;
  w5_meta: number;
}

/**
 * 根据阶段获取权重
 */
export function getStageWeights(step: number): StageWeights {
  if (step <= 6) {
    // Early: Ban Phase 1 - Meta和PTS为主，开始观察对手
    return {
      w1_pts: 0.30,
      w2_style: 0.20,  // 早期对手风格尚不明确
      w3_role: 0.10,
      w4_risk: 0.15,
      w5_meta: 0.25,  // 早期Meta很重要
    };
  } else if (step <= 12) {
    // Mid: Pick Phase 1 - 对手风格逐渐明确，提高风格匹配权重
    return {
      w1_pts: 0.30,
      w2_style: 0.30,  // 提高风格匹配权重
      w3_role: 0.20,
      w4_risk: 0.10,
      w5_meta: 0.10,
    };
  } else {
    // Late: Ban Phase 2 + Pick Phase 2 - 对手风格已明确，风格匹配和风险最重要
    return {
      w1_pts: 0.30,
      w2_style: 0.25,  // 保持较高的风格匹配权重
      w3_role: 0.20,
      w4_risk: 0.20,  // 后期风险很重要
      w5_meta: 0.05,
    };
  }
}

/**
 * 初始化博弈状态（均匀先验）
 */
export function initGameTheoryState(): GameTheoryState {
  return {
    belief: {
      aggressive: 0.2,
      defensive: 0.2,
      meta_follower: 0.2,
      counter_focused: 0.2,
      flex_master: 0.2,
      unknown: 0.0,
    },
    observedActions: [],
    confidence: 0,
    predictedType: 'unknown',
  };
}

/**
 * 动态候选池过滤（核心优化）
 *
 * 根据已确定的位置，过滤掉不可能被选择的英雄
 */
export function filterCandidatePool(
  allChampions: Champion[],
  bpState: BPState,
  currentStep: BPStep,
  side: Team
): Champion[] {
  // 获取对手已选择的英雄
  const opponentPicks = side === 'blue' ? bpState.redPicks : bpState.bluePicks;

  // 确定哪些位置已经被占据
  const occupiedPositions = new Set<Position>();

  opponentPicks.forEach(pick => {
    if (pick && pick.positions.length === 1) {
      // 单位置英雄，明确占据该位置
      occupiedPositions.add(pick.positions[0]);
    }
    // 多位置英雄暂时不确定占据哪个位置，保守处理
  });

  // 过滤候选池
  const candidates = allChampions.filter(champion => {
    // 1. 已被使用的英雄排除
    if (bpState.usedChampions.has(champion.id)) {
      return false;
    }

    // 2. 如果所有位置都被占据，排除单位置英雄
    if (champion.positions.length === 1) {
      const position = champion.positions[0];
      if (occupiedPositions.has(position)) {
        return false;
      }
    }

    // 3. 如果是多位置英雄，至少有一个位置可用
    if (champion.positions.length > 1) {
      const hasAvailablePosition = champion.positions.some(
        pos => !occupiedPositions.has(pos)
      );
      if (!hasAvailablePosition) {
        return false;
      }
    }

    return true;
  });

  console.log(`[候选池过滤] 原始: ${allChampions.length} -> 过滤后: ${candidates.length}`);
  console.log(`[候选池过滤] 已占据位置: ${Array.from(occupiedPositions).join(', ')}`);

  return candidates;
}

/**
 * 计算特征向量
 *
 * 应用特征衰减以避免与PTS重复计算：
 * - f1_pts: 衰减到30%（PTS已包含综合评分）
 * - f3_role_urgency: 衰减到40%（PTS已计算roleVacancy）
 * - f5_meta_strength: 衰减到30%（PTS已计算metaPresence）
 * - f2_style_match: 不衰减（博弈论独有）
 * - f4_risk_aversion: 不衰减（博弈论独有）
 */
export function computeFeatures(
  champion: Champion,
  ptsResult: PTSResult,
  gameState: GameTheoryState,
  bpState: BPState,
  side: Team
): FeatureVector {
  // f1: PTS分数（归一化）- 应用衰减
  const f1_pts_raw = Math.min(ptsResult.pts / 100, 1.0);
  const f1_pts = f1_pts_raw * FEATURE_DECAY_CONFIG.PTS_DECAY;

  // f2: 与对手风格匹配度 - 博弈论独有，不衰减
  const f2_style_match = computeStyleMatch(champion, gameState.predictedType) * FEATURE_DECAY_CONFIG.STYLE_DECAY;

  // f3: 位置紧迫性 - 应用衰减
  const ourRoles = side === 'blue'
    ? getRemainingRoles(bpState.bluePicks)
    : getRemainingRoles(bpState.redPicks);
  const f3_role_urgency_raw = computeRoleUrgency(champion, ourRoles);
  const f3_role_urgency = f3_role_urgency_raw * FEATURE_DECAY_CONFIG.ROLE_DECAY;

  // f4: 风险规避 - 博弈论独有，不衰减
  const f4_risk_aversion = computeRiskAversion(champion, bpState, side) * FEATURE_DECAY_CONFIG.RISK_DECAY;

  // f5: Meta强度 - 应用衰减
  const f5_meta_strength_raw = ptsResult.signals.globalMetaPresence;
  const f5_meta_strength = f5_meta_strength_raw * FEATURE_DECAY_CONFIG.META_DECAY;

  return {
    f1_pts,
    f2_style_match,
    f3_role_urgency,
    f4_risk_aversion,
    f5_meta_strength,
  };
}

/**
 * 计算风格匹配度
 */
function computeStyleMatch(champion: Champion, opponentType: OpponentType): number {
  const tags = champion.tags;

  switch (opponentType) {
    case 'aggressive':
      // 对手激进，我们需要防守/控制
      if (tags.includes('Tank') || tags.includes('Support') || tags.includes('Controller')) {
        return 0.8;
      }
      return 0.4;

    case 'defensive':
      // 对手防守，我们需要突破/伤害
      if (tags.includes('Assassin') || tags.includes('Fighter') || tags.includes('Marksman')) {
        return 0.8;
      }
      return 0.4;

    case 'meta_follower':
      // 对手跟meta，我们也选meta或counter
      return 0.6; // 中性

    case 'counter_focused':
      // 对手喜欢counter，我们选灵活性高的
      return champion.positions.length > 1 ? 0.9 : 0.5;

    case 'flex_master':
      // 对手喜欢摇摆，我们也选摇摆
      return champion.positions.length > 1 ? 0.8 : 0.4;

    default:
      return 0.5; // 未知，中性
  }
}

/**
 * 计算位置紧迫性
 */
function computeRoleUrgency(champion: Champion, remainingRoles: Position[]): number {
  if (remainingRoles.length === 0) return 0;

  const canFillRoles = champion.positions.filter(pos => remainingRoles.includes(pos));
  if (canFillRoles.length === 0) return 0;

  // 剩余位置越少，紧迫性越高
  const urgency = 1.0 - (remainingRoles.length - 1) * 0.2;

  // 能填补多个位置的英雄更有价值
  const flexibility = Math.min(canFillRoles.length / 2, 1.0);

  return Math.min(1.0, urgency * (0.7 + flexibility * 0.3));
}

/**
 * 计算风险规避
 */
function computeRiskAversion(champion: Champion, bpState: BPState, side: Team): number {
  const ourPicks = side === 'blue' ? bpState.bluePicks : bpState.redPicks;
  const validPicks = ourPicks.filter(p => p !== null);

  // 如果阵容已经很激进（多个刺客/战士），风险高
  const aggressiveCount = validPicks.filter(p =>
    p!.tags.includes('Assassin') || p!.tags.includes('Fighter')
  ).length;

  if (aggressiveCount >= 3) {
    // 需要防守型英雄
    return champion.tags.includes('Tank') || champion.tags.includes('Support') ? 0.8 : 0.3;
  }

  // 如果阵容很防守，需要伤害
  const defensiveCount = validPicks.filter(p =>
    p!.tags.includes('Tank') || p!.tags.includes('Support')
  ).length;

  if (defensiveCount >= 3) {
    return champion.tags.includes('Marksman') || champion.tags.includes('Mage') ? 0.8 : 0.3;
  }

  return 0.6; // 平衡
}

/**
 * 获取剩余位置
 */
function getRemainingRoles(picks: (Champion | null)[]): Position[] {
  const allRoles: Position[] = ['top', 'jungle', 'mid', 'bot', 'support'];
  const filledRoles = new Set<Position>();

  picks.forEach(pick => {
    if (pick && pick.positions.length === 1) {
      filledRoles.add(pick.positions[0]);
    }
  });

  return allRoles.filter(role => !filledRoles.has(role));
}

/**
 * Softmax计算选择概率
 *
 * P(a|θ,I) = exp(Σ w_k * f_k) / Σ_a' exp(Σ w_k * f_k(a'))
 */
export function computeSoftmaxProbabilities(
  candidates: Champion[],
  ptsResults: PTSResult[],
  gameState: GameTheoryState,
  bpState: BPState,
  side: Team
): Map<string, number> {
  const weights = getStageWeights(bpState.currentStep);
  const probabilities = new Map<string, number>();

  // 计算每个候选的特征向量和得分
  const scores: { champion: Champion; score: number }[] = [];

  // 先计算所有PTS分数的统计信息，用于归一化
  const allPTS = ptsResults.map(r => r.pts);
  const minPTS = Math.min(...allPTS);
  const maxPTS = Math.max(...allPTS);
  const ptRange = maxPTS - minPTS;

  candidates.forEach(champion => {
    const ptsResult = ptsResults.find(r => r.championId === champion.id);
    if (!ptsResult) return;

    const features = computeFeatures(champion, ptsResult, gameState, bpState, side);

    // 使用相对PTS排名而不是绝对值，增加区分度
    const relativePTS = ptRange > 0 ? (ptsResult.pts - minPTS) / ptRange : 0.5;

    // 计算加权得分，增加PTS的权重
    const score =
      weights.w1_pts * relativePTS * 2.0 +  // 增加PTS权重
      weights.w2_style * features.f2_style_match +
      weights.w3_role * features.f3_role_urgency +
      weights.w4_risk * features.f4_risk_aversion +
      weights.w5_meta * features.f5_meta_strength;

    scores.push({ champion, score });
  });

  // Softmax归一化，增加温度参数以增加区分度
  const temperature = 0.5;  // 温度越低，区分度越高
  const expScores = scores.map(s => ({ ...s, exp: Math.exp(s.score / temperature) }));
  const sumExp = expScores.reduce((sum, s) => sum + s.exp, 0);

  expScores.forEach(({ champion, exp }) => {
    probabilities.set(champion.id, exp / sumExp);
  });

  return probabilities;
}

/**
 * 贝叶斯更新对手信念
 *
 * P(θ|a) ∝ P(a|θ) * P(θ)
 */
export function updateBelief(
  state: GameTheoryState,
  observedAction: ObservedAction,
  bpState: BPState
): GameTheoryState {
  const newObserved = [...state.observedActions, observedAction];

  // 计算似然度 P(a|θ) for each type
  const likelihoods = computeLikelihoods(observedAction, state.belief);

  // 贝叶斯更新
  const newBelief: BeliefDistribution = {
    aggressive: likelihoods.aggressive * state.belief.aggressive,
    defensive: likelihoods.defensive * state.belief.defensive,
    meta_follower: likelihoods.meta_follower * state.belief.meta_follower,
    counter_focused: likelihoods.counter_focused * state.belief.counter_focused,
    flex_master: likelihoods.flex_master * state.belief.flex_master,
    unknown: 0,
  };

  // 归一化
  const sum = Object.values(newBelief).reduce((a, b) => a + b, 0);
  Object.keys(newBelief).forEach(key => {
    newBelief[key as keyof BeliefDistribution] /= sum;
  });

  // 找出最可能的类型
  const predictedType = Object.entries(newBelief)
    .filter(([key]) => key !== 'unknown')
    .reduce((max, [key, val]) => val > max[1] ? [key, val] : max, ['unknown', 0])[0] as OpponentType;

  // 计算信心度（最大概率值）
  const confidence = Math.max(...Object.values(newBelief).filter((_, i) => i < 5));

  return {
    belief: newBelief,
    observedActions: newObserved,
    confidence,
    predictedType,
  };
}

/**
 * 计算似然度 P(a|θ)
 */
function computeLikelihoods(
  action: ObservedAction,
  currentBelief: BeliefDistribution
): BeliefDistribution {
  const champion = action.champion;
  const tags = champion.tags;

  const likelihoods: BeliefDistribution = {
    aggressive: 0.5,
    defensive: 0.5,
    meta_follower: 0.5,
    counter_focused: 0.5,
    flex_master: 0.5,
    unknown: 0.1,
  };

  // 激进型：更可能选择刺客/战士/射手
  if (tags.includes('Assassin') || tags.includes('Fighter') || tags.includes('Marksman')) {
    likelihoods.aggressive = 0.8;
  } else if (tags.includes('Tank') || tags.includes('Support')) {
    likelihoods.aggressive = 0.2;
  }

  // 防守型：更可能选择坦克/辅助/控制
  if (tags.includes('Tank') || tags.includes('Support') || tags.includes('Controller')) {
    likelihoods.defensive = 0.8;
  } else if (tags.includes('Assassin')) {
    likelihoods.defensive = 0.2;
  }

  // Meta型：选择高ban率英雄
  // TODO: 需要实际的meta数据
  likelihoods.meta_follower = 0.5;

  // 针对型：在对手选人后立即选择
  if (action.context.ourLastPick) {
    likelihoods.counter_focused = 0.7;
  }

  // 摇摆型：选择多位置英雄
  if (champion.positions.length > 1) {
    likelihoods.flex_master = 0.8;
  } else {
    likelihoods.flex_master = 0.3;
  }

  return likelihoods;
}

/**
 * 融合增强PTS（主函数）
 *
 * 结合原始PTS + Softmax概率 + 博弈调整
 */
export function enhancePTSWithHybridModel(
  ptsResults: PTSResult[],
  allChampions: Champion[],
  gameState: GameTheoryState,
  bpState: BPState,
  currentStep: BPStep,
  side: Team
): PTSResult[] {
  // 如果信心度太低，不应用Game Theory增强
  if (gameState.confidence < 0.3) {
    console.log(`[Game Theory] Confidence too low (${(gameState.confidence * 100).toFixed(0)}%), skipping enhancement`);
    return ptsResults;
  }

  // 1. 动态过滤候选池（核心优化）
  const candidates = filterCandidatePool(allChampions, bpState, currentStep, side);

  // 2. 只对候选池计算Softmax概率
  const probabilities = computeSoftmaxProbabilities(
    candidates,
    ptsResults,
    gameState,
    bpState,
    side
  );

  // 3. 根据信心度动态调整融合权重
  // 信心度越高，博弈论权重越大
  const ptsWeight = 1.0 - gameState.confidence * 0.5;  // 0.5-1.0
  const gtWeight = gameState.confidence;                // 0.3-1.0

  console.log(`[Game Theory] Confidence: ${(gameState.confidence * 100).toFixed(0)}%, PTS weight: ${ptsWeight.toFixed(2)}, GT weight: ${gtWeight.toFixed(2)}`);

  // 4. 增强PTS分数
  const enhanced = ptsResults.map(result => {
    const prob = probabilities.get(result.championId);

    if (!prob) {
      // 不在候选池中，降低优先级
      return {
        ...result,
        pts: result.pts * 0.3, // 大幅降低
        explanation: `${result.explanation} [已排除：位置已确定]`,
      };
    }

    // 在候选池中，根据Softmax概率调整
    // 动态融合公式：新PTS = 原PTS * ptsWeight + Softmax概率 * 100 * gtWeight
    const softmaxBonus = prob * 100 * gtWeight;
    const newPTS = result.pts * ptsWeight + softmaxBonus;

    // 添加博弈论解释
    let explanation = result.explanation;

    // 显示博弈论影响
    const ptsContribution = (result.pts * ptsWeight).toFixed(1);
    const gameTheoryContribution = softmaxBonus.toFixed(1);
    explanation += ` | 博弈分析: 对手${getTypeNameZh(gameState.predictedType)}(${(gameState.confidence * 100).toFixed(0)}%信心), 选择概率${(prob * 100).toFixed(1)}%, PTS贡献${ptsContribution}+博弈贡献${gameTheoryContribution}`;

    return {
      ...result,
      pts: newPTS,
      explanation,
    };
  });

  // 5. 重新排序
  return enhanced.sort((a, b) => b.pts - a.pts);
}

/**
 * 获取类型中文名称
 */
function getTypeNameZh(type: OpponentType): string {
  const names: Record<OpponentType, string> = {
    aggressive: '激进型',
    defensive: '防守型',
    meta_follower: 'Meta型',
    counter_focused: '针对型',
    flex_master: '摇摆型',
    unknown: '未知',
  };
  return names[type];
}
