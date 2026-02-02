/**
 * Opponent Profiling System
 * 对手建模系统 - 扩展对手特征向量和预测能力
 */

import { Champion, Position, BPState } from './types';

/**
 * 对手档案（扩展版）
 */
export interface OpponentProfile {
  teamId: string;
  teamName: string;

  // 基础风格特征 (0-1)
  aggressiveness: number;      // 激进程度
  flexibility: number;         // 灵活性
  metaFollowing: number;       // 跟随Meta程度
  riskTaking: number;          // 风险承担度
  adaptability: number;        // 适应能力

  // 高级特征
  preferredPositions: Position[];  // 优先针对的位置
  banPatterns: {
    targetBased: number;       // 针对性Ban比例 (0-1)
    metaBased: number;         // Meta Ban比例 (0-1)
    systemBased: number;       // 体系Ban比例 (0-1)
    protectiveBased: number;   // 保护性Ban比例 (0-1)
  };

  pickPatterns: {
    earlyGameFocused: number;  // 前期阵容比例 (0-1)
    lateGameFocused: number;   // 后期阵容比例 (0-1)
    splitPushFocused: number;  // 分推阵容比例 (0-1)
    teamFightFocused: number;  // 团战阵容比例 (0-1)
  };

  // 历史数据
  recentMatches: MatchHistory[];

  // 统计数据
  stats: {
    totalMatches: number;
    winRate: number;
    avgGameDuration: number;
    firstBloodRate: number;
    firstTowerRate: number;
  };

  // 置信度
  confidence: number;          // 0-1，基于样本量
  lastUpdated: Date;
}

/**
 * 比赛历史
 */
export interface MatchHistory {
  matchId: string;
  date: Date;
  opponent: string;
  bans: Champion[];
  picks: Champion[];
  result: 'win' | 'loss';
  duration: number;
  patch: string;
}

/**
 * 对手预测结果
 */
export interface OpponentPrediction {
  championId: string;
  championName: string;
  probability: number;        // 0-1，选择概率
  confidence: number;         // 0-1，预测置信度
  reasoning: string[];        // 预测理由
}

/**
 * 从历史数据构建对手档案
 */
export function buildOpponentProfile(
  teamId: string,
  teamName: string,
  matchHistory: MatchHistory[]
): OpponentProfile {
  if (matchHistory.length === 0) {
    return getDefaultProfile(teamId, teamName);
  }

  // 计算基础风格特征
  const aggressiveness = calculateAggressiveness(matchHistory);
  const flexibility = calculateFlexibility(matchHistory);
  const metaFollowing = calculateMetaFollowing(matchHistory);
  const riskTaking = calculateRiskTaking(matchHistory);
  const adaptability = calculateAdaptability(matchHistory);

  // 分析Ban模式
  const banPatterns = analyzeBanPatterns(matchHistory);

  // 分析Pick模式
  const pickPatterns = analyzePickPatterns(matchHistory);

  // 分析优先针对的位置
  const preferredPositions = analyzePreferredPositions(matchHistory);

  // 计算统计数据
  const stats = calculateStats(matchHistory);

  // 计算置信度（基于样本量）
  const confidence = Math.min(1.0, matchHistory.length / 20);

  return {
    teamId,
    teamName,
    aggressiveness,
    flexibility,
    metaFollowing,
    riskTaking,
    adaptability,
    preferredPositions,
    banPatterns,
    pickPatterns,
    recentMatches: matchHistory.slice(0, 10), // 只保留最近10场
    stats,
    confidence,
    lastUpdated: new Date(),
  };
}

/**
 * 计算激进程度
 * 基于：早期英雄选择、游戏时长、首杀率等
 */
function calculateAggressiveness(matches: MatchHistory[]): number {
  let score = 0;
  let count = 0;

  for (const match of matches) {
    // 游戏时长越短，越激进
    if (match.duration < 1800) { // 30分钟
      score += 0.8;
    } else if (match.duration < 2400) { // 40分钟
      score += 0.5;
    } else {
      score += 0.2;
    }

    // 检查是否选择激进英雄
    const aggressiveChampions = match.picks.filter(c =>
      c.tags.includes('Assassin') || c.tags.includes('Fighter')
    );
    score += aggressiveChampions.length / match.picks.length;

    count += 2;
  }

  return count > 0 ? score / count : 0.5;
}

/**
 * 计算灵活性
 * 基于：摇摆位英雄使用、英雄池广度等
 */
function calculateFlexibility(matches: MatchHistory[]): number {
  const uniqueChampions = new Set<string>();
  let flexPickCount = 0;
  let totalPicks = 0;

  for (const match of matches) {
    for (const pick of match.picks) {
      uniqueChampions.add(pick.id);
      totalPicks++;

      // 多位置英雄
      if (pick.positions.length > 1) {
        flexPickCount++;
      }
    }
  }

  // 英雄池广度
  const poolBreadth = uniqueChampions.size / (matches.length * 5);

  // 摇摆位使用率
  const flexRate = totalPicks > 0 ? flexPickCount / totalPicks : 0;

  return (poolBreadth * 0.6 + flexRate * 0.4);
}

/**
 * 计算Meta跟随程度
 * 需要Meta数据，这里简化处理
 */
function calculateMetaFollowing(matches: MatchHistory[]): number {
  // TODO: 需要实际的Meta数据
  // 简化：假设高Ban率英雄是Meta英雄
  return 0.6; // 默认中等跟随
}

/**
 * 计算风险承担度
 * 基于：非常规选择、逆版本选择等
 */
function calculateRiskTaking(matches: MatchHistory[]): number {
  // TODO: 需要更多数据
  return 0.5; // 默认中等风险
}

/**
 * 计算适应能力
 * 基于：对不同对手的表现差异
 */
function calculateAdaptability(matches: MatchHistory[]): number {
  if (matches.length < 5) return 0.5;

  // 计算胜率方差
  const winRates: number[] = [];
  const opponentMap = new Map<string, { wins: number; total: number }>();

  for (const match of matches) {
    if (!opponentMap.has(match.opponent)) {
      opponentMap.set(match.opponent, { wins: 0, total: 0 });
    }

    const stats = opponentMap.get(match.opponent)!;
    stats.total++;
    if (match.result === 'win') {
      stats.wins++;
    }
  }

  for (const [_, stats] of opponentMap) {
    if (stats.total >= 2) {
      winRates.push(stats.wins / stats.total);
    }
  }

  if (winRates.length < 2) return 0.5;

  // 计算标准差
  const mean = winRates.reduce((sum, wr) => sum + wr, 0) / winRates.length;
  const variance = winRates.reduce((sum, wr) => sum + Math.pow(wr - mean, 2), 0) / winRates.length;
  const stdDev = Math.sqrt(variance);

  // 标准差越小，适应能力越强
  return Math.max(0, Math.min(1, 1 - stdDev * 2));
}

/**
 * 分析Ban模式
 */
function analyzeBanPatterns(matches: MatchHistory[]): OpponentProfile['banPatterns'] {
  // TODO: 需要更详细的分类逻辑
  return {
    targetBased: 0.3,
    metaBased: 0.4,
    systemBased: 0.2,
    protectiveBased: 0.1,
  };
}

/**
 * 分析Pick模式
 */
function analyzePickPatterns(matches: MatchHistory[]): OpponentProfile['pickPatterns'] {
  let earlyGame = 0;
  let lateGame = 0;
  let splitPush = 0;
  let teamFight = 0;

  for (const match of matches) {
    // 简化分类
    if (match.duration < 1800) {
      earlyGame++;
    } else {
      lateGame++;
    }

    // TODO: 更精确的分类需要英雄特征数据
  }

  const total = matches.length;
  return {
    earlyGameFocused: earlyGame / total,
    lateGameFocused: lateGame / total,
    splitPushFocused: 0.2, // 默认值
    teamFightFocused: 0.6, // 默认值
  };
}

/**
 * 分析优先针对的位置
 */
function analyzePreferredPositions(matches: MatchHistory[]): Position[] {
  const positionBanCount = new Map<Position, number>();
  const allPositions: Position[] = ['top', 'jungle', 'mid', 'bot', 'support'];

  for (const position of allPositions) {
    positionBanCount.set(position, 0);
  }

  for (const match of matches) {
    for (const ban of match.bans) {
      const position = ban.positions[0];
      if (position) {
        positionBanCount.set(position, (positionBanCount.get(position) || 0) + 1);
      }
    }
  }

  // 排序并返回前3个
  const sorted = Array.from(positionBanCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([pos, _]) => pos);

  return sorted;
}

/**
 * 计算统计数据
 */
function calculateStats(matches: MatchHistory[]): OpponentProfile['stats'] {
  const wins = matches.filter(m => m.result === 'win').length;
  const totalDuration = matches.reduce((sum, m) => sum + m.duration, 0);

  return {
    totalMatches: matches.length,
    winRate: matches.length > 0 ? wins / matches.length : 0,
    avgGameDuration: matches.length > 0 ? totalDuration / matches.length : 0,
    firstBloodRate: 0.5, // TODO: 需要实际数据
    firstTowerRate: 0.5, // TODO: 需要实际数据
  };
}

/**
 * 获取默认档案（无历史数据时）
 */
function getDefaultProfile(teamId: string, teamName: string): OpponentProfile {
  return {
    teamId,
    teamName,
    aggressiveness: 0.5,
    flexibility: 0.5,
    metaFollowing: 0.6,
    riskTaking: 0.4,
    adaptability: 0.5,
    preferredPositions: ['mid', 'jungle', 'bot'],
    banPatterns: {
      targetBased: 0.25,
      metaBased: 0.5,
      systemBased: 0.15,
      protectiveBased: 0.1,
    },
    pickPatterns: {
      earlyGameFocused: 0.4,
      lateGameFocused: 0.4,
      splitPushFocused: 0.1,
      teamFightFocused: 0.5,
    },
    recentMatches: [],
    stats: {
      totalMatches: 0,
      winRate: 0.5,
      avgGameDuration: 2000,
      firstBloodRate: 0.5,
      firstTowerRate: 0.5,
    },
    confidence: 0,
    lastUpdated: new Date(),
  };
}

/**
 * 预测对手下一步选择
 * 使用简化的决策树模型
 */
export function predictOpponentNextPick(
  profile: OpponentProfile,
  bpState: BPState,
  availableChampions: Champion[]
): OpponentPrediction[] {
  const predictions: OpponentPrediction[] = [];

  for (const champion of availableChampions) {
    // 特征提取
    const features = extractPredictionFeatures(champion, profile, bpState);

    // 计算概率（简化版决策树）
    const probability = calculatePickProbability(features, profile);

    // 计算置信度
    const confidence = profile.confidence;

    // 生成理由
    const reasoning = generatePredictionReasoning(features, profile);

    predictions.push({
      championId: champion.id,
      championName: champion.name,
      probability,
      confidence,
      reasoning,
    });
  }

  // 归一化概率
  const totalProb = predictions.reduce((sum, p) => sum + p.probability, 0);
  if (totalProb > 0) {
    predictions.forEach(p => {
      p.probability /= totalProb;
    });
  }

  // 排序并返回Top 10
  return predictions.sort((a, b) => b.probability - a.probability).slice(0, 10);
}

/**
 * 提取预测特征
 */
function extractPredictionFeatures(
  champion: Champion,
  profile: OpponentProfile,
  bpState: BPState
): any {
  return {
    isAggressive: champion.tags.includes('Assassin') || champion.tags.includes('Fighter'),
    isFlexible: champion.positions.length > 1,
    isMeta: false, // TODO: 需要Meta数据
    matchesPreferredPosition: profile.preferredPositions.includes(champion.positions[0]),
    currentStep: bpState.currentStep,
  };
}

/**
 * 计算选择概率
 */
function calculatePickProbability(features: any, profile: OpponentProfile): number {
  let score = 0.5; // 基础分数

  // 激进程度匹配
  if (features.isAggressive) {
    score += profile.aggressiveness * 0.3;
  } else {
    score += (1 - profile.aggressiveness) * 0.2;
  }

  // 灵活性匹配
  if (features.isFlexible) {
    score += profile.flexibility * 0.2;
  }

  // Meta跟随
  if (features.isMeta) {
    score += profile.metaFollowing * 0.3;
  }

  // 位置偏好
  if (features.matchesPreferredPosition) {
    score += 0.2;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * 生成预测理由
 */
function generatePredictionReasoning(features: any, profile: OpponentProfile): string[] {
  const reasons: string[] = [];

  if (features.isAggressive && profile.aggressiveness > 0.6) {
    reasons.push('对手偏好激进英雄');
  }

  if (features.isFlexible && profile.flexibility > 0.6) {
    reasons.push('对手喜欢使用摇摆位英雄');
  }

  if (features.matchesPreferredPosition) {
    reasons.push('符合对手优先针对的位置');
  }

  if (reasons.length === 0) {
    reasons.push('综合评估推荐');
  }

  return reasons;
}
