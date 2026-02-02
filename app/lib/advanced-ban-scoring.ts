/**
 * Advanced Ban Scoring System
 * 优化的 Ban 评分系统 - 核心实现
 * 支持AI生成Ban理由（可选）
 */

import { Champion, BPState, Position } from './types';
import { TeamChampionPool, ChampionTeamAvailability } from './team-champion-pool.types';
import {
  BanScoreResult,
  BanScoreDimensions,
  HeroStrengthMetrics,
  EnemyProficiencyMetrics,
  RestrictionImpactMetrics,
  StrategicValueMetrics,
  TimingFitAnalysis,
  SignatureHeroAnalysis,
  RecencyAnalysis,
  PoolCompressionAnalysis,
  PositionCompressionAnalysis,
  SystemCoreAnalysis,
  TargetingAnalysis,
  ProtectionAnalysis,
  BanScoringConfig,
  DEFAULT_BAN_SCORING_CONFIG,
} from './advanced-ban-scoring.types';
import { calculateBayesianConfidence, calculateTemporalDecay } from './statistical-utils';

/**
 * ============================================================================
 * 维度 1：英雄强度评分
 * ============================================================================
 */

/**
 * 计算英雄强度
 * 基于版本数据，与队伍无关
 */
export function calculateHeroStrength(
  champion: Champion,
  championStats?: {
    winRate?: number;
    banRate?: number;
    pickRate?: number;
  }
): HeroStrengthMetrics {
  // 如果有统计数据，使用真实数据
  const winRate = championStats?.winRate ?? 50; // 默认50%
  const banRate = championStats?.banRate ?? 10; // 默认10%
  const pickRate = championStats?.pickRate ?? 10; // 默认10%

  // Meta等级（简化版：基于Ban率和Pick率推断）
  let metaTier = 60; // 默认B级
  if (banRate >= 30 || pickRate >= 25) {
    metaTier = 90; // S级
  } else if (banRate >= 20 || pickRate >= 15) {
    metaTier = 75; // A级
  } else if (banRate >= 10 || pickRate >= 10) {
    metaTier = 60; // B级
  } else {
    metaTier = 40; // C级
  }

  // 综合评分
  const overallScore =
    winRate * 0.4 +
    banRate * 0.3 +
    pickRate * 0.2 +
    metaTier * 0.1;

  return {
    winRate,
    banRate,
    pickRate,
    metaTier,
    overallScore,
  };
}

/**
 * ============================================================================
 * 维度 2：敌方熟练度评分
 * ============================================================================
 */

/**
 * 分析招牌英雄
 * OPTIMIZED: Now uses Bayesian confidence intervals for more reliable proficiency scoring
 */
export function analyzeSignatureHero(
  championId: string,
  enemyTeamPool: TeamChampionPool
): SignatureHeroAnalysis {
  const availability = enemyTeamPool.championAvailability.get(championId);

  if (!availability) {
    return {
      isSignature: false,
      teamProficiency: 0,
      bestPlayerProficiency: 0,
      usageFrequency: 0,
      score: 0,
    };
  }

  const teamProficiency = availability.teamProficiencyScore;
  const bestPlayer = availability.availablePlayers[0];
  const bestPlayerProficiency = bestPlayer.proficiencyLevel;
  const usageFrequency = bestPlayer.frequency;

  // OPTIMIZATION: Calculate Bayesian confidence based on sample size
  // Assume each proficiency level represents ~10 games of data
  const estimatedGames = bestPlayerProficiency * 10;
  const bayesianConfidence = calculateBayesianConfidence(
    estimatedGames,
    usageFrequency, // Use frequency as proxy for win rate
    0.5, // Prior win rate
    10 // Prior weight
  );

  // 招牌英雄评分 (with confidence adjustment)
  const rawScore =
    teamProficiency * 0.5 +
    (bestPlayerProficiency / 5) * 100 * 0.3 +
    usageFrequency * 100 * 0.2;

  // Apply Bayesian confidence to reduce overconfidence on small samples
  const score = rawScore * (0.7 + bayesianConfidence * 0.3);

  const isSignature = score >= 80;

  return {
    isSignature,
    teamProficiency,
    bestPlayerProficiency,
    usageFrequency,
    score,
  };
}

/**
 * 分析时效性
 * OPTIMIZED: Now uses exponential temporal decay instead of step function
 */
export function analyzeRecency(
  championId: string,
  enemyTeamPool: TeamChampionPool
): RecencyAnalysis {
  const availability = enemyTeamPool.championAvailability.get(championId);

  if (!availability) {
    return {
      recentUsageCount: 0,
      daysSinceLastUse: 999,
      decayFactor: 0,
      score: 0,
    };
  }

  // 计算最近10场使用次数
  const recentPicks = availability.availablePlayers.reduce((sum, player) => {
    const recentCount = player.isRecent ? 1 : 0;
    return sum + recentCount;
  }, 0);

  // 简化：假设最近使用（这里需要真实的时间数据）
  const daysSinceLastUse = availability.availablePlayers.some(p => p.isRecent) ? 3 : 30;

  // OPTIMIZATION: Use exponential decay instead of step function
  // Half-life of 14 days (2 weeks)
  const decayFactor = calculateTemporalDecay(daysSinceLastUse, 14);

  // 时效性评分
  const score =
    (recentPicks / Math.min(availability.availablePlayers.length, 3)) * 100 * 0.6 +
    decayFactor * 100 * 0.4;

  return {
    recentUsageCount: recentPicks,
    daysSinceLastUse,
    decayFactor,
    score,
  };
}

/**
 * 计算敌方熟练度
 */
export function calculateEnemyProficiency(
  championId: string,
  enemyTeamPool: TeamChampionPool | null
): EnemyProficiencyMetrics {
  if (!enemyTeamPool) {
    return {
      signatureScore: 0,
      recencyScore: 0,
      confidenceScore: 0,
      overallScore: 0,
    };
  }

  const availability = enemyTeamPool.championAvailability.get(championId);

  if (!availability) {
    return {
      signatureScore: 0,
      recencyScore: 0,
      confidenceScore: 0,
      overallScore: 0,
    };
  }

  // 招牌英雄评分
  const signatureAnalysis = analyzeSignatureHero(championId, enemyTeamPool);
  const signatureScore = signatureAnalysis.score;

  // 时效性评分
  const recencyAnalysis = analyzeRecency(championId, enemyTeamPool);
  const recencyScore = recencyAnalysis.score;

  // 数据置信度
  const avgConfidence =
    availability.availablePlayers.reduce((sum, p) => sum + p.confidence, 0) /
    availability.availablePlayers.length;
  const avgTotalGames =
    availability.availablePlayers.reduce((sum, p) => sum + p.totalGames, 0) /
    availability.availablePlayers.length;

  const confidenceScore =
    Math.min(avgTotalGames / 100, 1) * 50 +
    avgConfidence * 50;

  // 综合评分
  const overallScore =
    signatureScore * 0.6 +
    recencyScore * 0.3 +
    confidenceScore * 0.1;

  return {
    signatureScore,
    recencyScore,
    confidenceScore,
    overallScore,
  };
}

/**
 * ============================================================================
 * 维度 3：限制效果评分
 * ============================================================================
 */

/**
 * 分析英雄池压缩
 */
export function analyzePoolCompression(
  championId: string,
  enemyTeamPool: TeamChampionPool | null
): PoolCompressionAnalysis {
  if (!enemyTeamPool) {
    return {
      availablePlayerCount: 0,
      alternativeCount: 0,
      uniquenessScore: 0,
      replacementDifficulty: 0,
      score: 0,
    };
  }

  const availability = enemyTeamPool.championAvailability.get(championId);

  if (!availability) {
    return {
      availablePlayerCount: 0,
      alternativeCount: 0,
      uniquenessScore: 0,
      replacementDifficulty: 0,
      score: 0,
    };
  }

  const availablePlayerCount = availability.availablePlayers.length;
  const alternativeCount = availability.backupPlayers.length;

  // 唯一性评分（人数越少，分数越高）
  const uniquenessScore = (1 - availablePlayerCount / 5) * 100;

  // 替代难度（备选越少，分数越高）
  const replacementDifficulty = (1 - Math.min(alternativeCount, 10) / 10) * 100;

  // 综合压缩度
  const score =
    uniquenessScore * 0.6 +
    replacementDifficulty * 0.4;

  return {
    availablePlayerCount,
    alternativeCount,
    uniquenessScore,
    replacementDifficulty,
    score,
  };
}

/**
 * 分析位置压缩
 */
export function analyzePositionCompression(
  champion: Champion,
  bpState: BPState,
  enemyTeamPool: TeamChampionPool | null
): PositionCompressionAnalysis {
  // 获取英雄的主要位置
  const position = champion.positions[0];

  // 统计该位置已Ban的英雄数
  let alreadyBannedCount = 0;
  const allBans = [...bpState.blueBans, ...bpState.redBans];
  for (const ban of allBans) {
    if (ban.champion && ban.champion.positions.includes(position)) {
      alreadyBannedCount++;
    }
  }

  // 统计该位置可用英雄数（简化：假设每个位置有20个英雄）
  const totalAvailableCount = 20;

  // 英雄池深度（如果有队伍数据）
  let poolDepth = 10; // 默认
  if (enemyTeamPool) {
    // 统计该位置的可用英雄数
    let positionChampionCount = 0;
    for (const [_, availability] of enemyTeamPool.championAvailability) {
      // 简化：检查是否有人在该位置使用
      if (availability.availablePlayers.length > 0) {
        positionChampionCount++;
      }
    }
    poolDepth = Math.max(positionChampionCount / 10, 1); // 归一化
  }

  // 位置压缩度评分
  const score =
    (alreadyBannedCount / totalAvailableCount) * 100 * 0.7 +
    (1 - Math.min(poolDepth, 20) / 20) * 100 * 0.3;

  return {
    position,
    alreadyBannedCount,
    totalAvailableCount,
    poolDepth,
    score,
  };
}

/**
 * 计算限制效果
 */
export function calculateRestrictionImpact(
  champion: Champion,
  championId: string,
  bpState: BPState,
  enemyTeamPool: TeamChampionPool | null
): RestrictionImpactMetrics {
  // 英雄池压缩
  const poolCompression = analyzePoolCompression(championId, enemyTeamPool);
  const poolCompressionScore = poolCompression.score;

  // 位置压缩
  const positionCompression = analyzePositionCompression(champion, bpState, enemyTeamPool);
  const positionCompressionScore = positionCompression.score;

  // 综合评分
  const overallScore =
    poolCompressionScore * 0.6 +
    positionCompressionScore * 0.4;

  return {
    poolCompressionScore,
    positionCompressionScore,
    overallScore,
  };
}

/**
 * ============================================================================
 * 维度 4：战略价值评分
 * ============================================================================
 */

/**
 * 已知的体系组合（静态）
 */
const KNOWN_SYSTEMS: Record<string, string[]> = {
  '加里奥体系': ['Galio', 'TwistedFate', 'Pantheon', 'Taliyah'],
  '卡莉斯塔体系': ['Kalista', 'Thresh', 'TahmKench', 'Braum'],
  '分推体系': ['Fiora', 'Jayce', 'Karma', 'Lulu'],
  '保护体系': ['Lulu', 'Karma', 'Janna', 'Nami'],
};

/**
 * 动态体系库（从体系发现引擎加载）
 */
let DYNAMIC_SYSTEMS: Record<string, string[]> = {};

/**
 * 更新动态体系库
 */
export function updateDynamicSystems(systems: Array<{ name: string; coreChampions: string[] }>): void {
  DYNAMIC_SYSTEMS = {};
  for (const system of systems) {
    DYNAMIC_SYSTEMS[system.name] = system.coreChampions;
  }
  console.log(`[Ban Scoring] 更新动态体系库: ${Object.keys(DYNAMIC_SYSTEMS).length} 个体系`);
}

/**
 * 获取所有体系（静态 + 动态）
 */
export function getAllSystems(): Record<string, string[]> {
  return {
    ...KNOWN_SYSTEMS,
    ...DYNAMIC_SYSTEMS,
  };
}

/**
 * 分析体系核心
 */
export function analyzeSystemCore(
  championId: string,
  enemyTeamPool: TeamChampionPool | null
): SystemCoreAnalysis {
  // 合并静态和动态体系
  const allSystems = getAllSystems();

  // 检查是否是已知体系的核心
  for (const [systemName, champions] of Object.entries(allSystems)) {
    if (champions.includes(championId)) {
      // 是体系核心
      const isCore = champions.indexOf(championId) === 0; // 第一个是核心

      if (isCore) {
        return {
          isSystemCore: true,
          systemName,
          disruptionLevel: 100, // 完全破坏
          score: 100,
        };
      } else {
        return {
          isSystemCore: true,
          systemName,
          disruptionLevel: 60, // 部分破坏
          score: 60,
        };
      }
    }
  }

  return {
    isSystemCore: false,
    systemName: '',
    disruptionLevel: 0,
    score: 0,
  };
}

/**
 * 分析针对性
 */
export function analyzeTargeting(
  champion: Champion,
  championId: string,
  bpState: BPState,
  enemyTeamPool: TeamChampionPool | null
): TargetingAnalysis {
  const position = champion.positions[0];

  // 是否针对核心选手（中单/打野）
  const targetsCorePlayer = position === 'mid' || position === 'jungle';

  // 是否针对关键位置
  const targetsKeyPosition = targetsCorePlayer;

  // 计算连续针对加成
  let consecutiveBanBonus = 0;
  const allBans = [...bpState.blueBans, ...bpState.redBans];
  let samePositionBans = 0;
  for (const ban of allBans) {
    if (ban.champion && ban.champion.positions.includes(position)) {
      samePositionBans++;
    }
  }
  consecutiveBanBonus = Math.min(samePositionBans * 10, 30);

  // 针对性评分
  const score =
    (targetsCorePlayer ? 40 : 0) +
    (targetsKeyPosition ? 30 : 0) +
    consecutiveBanBonus;

  return {
    targetsCorePlayer,
    targetsKeyPosition,
    consecutiveBanBonus,
    score,
  };
}

/**
 * 分析保护性
 * @deprecated 使用 analyzeProtectionV2 代替
 */
export function analyzeProtection(
  champion: Champion,
  bpState: BPState
): ProtectionAnalysis {
  // 简化版：检查是否Counter我方已选英雄
  // 这里需要英雄克制关系数据，暂时简化处理

  const ourPicks = bpState.bluePicks.filter(p => p !== null);
  const countersOurPicks = false; // 需要克制关系数据
  const countersOurExpected = false;
  const preventsEnemyCombo = false;

  const score =
    (countersOurPicks ? 50 : 0) +
    (countersOurExpected ? 30 : 0) +
    (preventsEnemyCombo ? 20 : 0);

  return {
    countersOurPicks,
    countersOurExpected,
    preventsEnemyCombo,
    score,
  };
}

/**
 * 分析保护性 V2 - 使用真实克制关系数据
 * 检查该英雄是否Counter我方已选英雄，如果是则应该Ban掉
 */
export function analyzeProtectionV2(
  champion: Champion,
  bpState: BPState,
  counterMap?: Map<string, Map<string, any>>
): ProtectionAnalysis {
  const ourPicks = bpState.bluePicks.filter(p => p !== null);

  // 如果没有克制关系数据，降级到旧版本
  if (!counterMap) {
    return analyzeProtection(champion, bpState);
  }

  // 检查该英雄是否Counter我方已选英雄
  let countersOurPicks = false;
  let maxCounterScore = 0;
  let counterCount = 0;

  for (const ourPick of ourPicks) {
    if (!ourPick) continue;

    // 获取克制分数
    const relationship = counterMap.get(champion.id)?.get(ourPick.id);
    const counterScore = relationship?.counterScore ?? 0.5;

    // 如果克制分数 > 0.6，说明该英雄克制我方英雄
    if (counterScore > 0.6) {
      countersOurPicks = true;
      maxCounterScore = Math.max(maxCounterScore, counterScore);
      counterCount++;
    }
  }

  // 计算保护分数
  // 基础分数：基于最强克制关系
  let score = 0;
  if (countersOurPicks) {
    // 将 0.6-1.0 的克制分数映射到 0-100
    score = (maxCounterScore - 0.5) * 200;

    // 如果克制多个英雄，额外加分
    if (counterCount > 1) {
      score = Math.min(100, score * (1 + (counterCount - 1) * 0.2));
    }
  }

  // TODO: 实现 countersOurExpected（需要预测系统）
  const countersOurExpected = false;

  // TODO: 实现 preventsEnemyCombo（需要体系识别）
  const preventsEnemyCombo = false;

  return {
    countersOurPicks,
    countersOurExpected,
    preventsEnemyCombo,
    score,
  };
}

/**
 * 计算战略价值
 */
export function calculateStrategicValue(
  champion: Champion,
  championId: string,
  bpState: BPState,
  enemyTeamPool: TeamChampionPool | null,
  counterMap?: Map<string, Map<string, any>>
): StrategicValueMetrics {
  // 体系核心度
  const systemCore = analyzeSystemCore(championId, enemyTeamPool);
  const systemCoreScore = systemCore.score;

  // 针对性
  const targeting = analyzeTargeting(champion, championId, bpState, enemyTeamPool);
  const targetingScore = targeting.score;

  // 保护性 - 使用V2版本（支持克制关系）
  const protection = counterMap
    ? analyzeProtectionV2(champion, bpState, counterMap)
    : analyzeProtection(champion, bpState);
  const protectionScore = protection.score;

  // 综合评分
  const overallScore =
    systemCoreScore * 0.4 +
    targetingScore * 0.4 +
    protectionScore * 0.2;

  return {
    systemCoreScore,
    targetingScore,
    protectionScore,
    overallScore,
  };
}

/**
 * ============================================================================
 * 维度 5：时机适配度
 * ============================================================================
 */

/**
 * 分析时机适配度
 */
export function analyzeTimingFit(
  bpState: BPState,
  config: BanScoringConfig
): TimingFitAnalysis {
  const currentStep = bpState.currentStep;

  // 判断当前阶段
  const currentPhase: 'ban1' | 'ban2' = currentStep <= 5 ? 'ban1' : 'ban2';

  // 选择对应的权重
  const phaseWeights = currentPhase === 'ban1' ? config.phase1Weights : config.phase2Weights;

  // 计算信息完整度
  const bluePickCount = bpState.bluePicks.filter(p => p !== null).length;
  const redPickCount = bpState.redPicks.filter(p => p !== null).length;
  const informationCompleteness = (bluePickCount + redPickCount) / 10;

  // 时机系数
  const timingMultiplier = 1.0 + (informationCompleteness - 0.5) * 0.2;

  return {
    currentPhase,
    informationCompleteness,
    phaseWeights,
    timingMultiplier: Math.max(0.9, Math.min(1.1, timingMultiplier)),
  };
}

/**
 * ============================================================================
 * 综合评分计算
 * ============================================================================
 */

/**
 * 计算最终 Ban 分数（同步版本）
 * 使用模板生成理由
 */
export function calculateBanScore(
  champion: Champion,
  bpState: BPState,
  enemyTeamPool: TeamChampionPool | null,
  championStats?: { winRate?: number; banRate?: number; pickRate?: number },
  config: BanScoringConfig = DEFAULT_BAN_SCORING_CONFIG,
  counterMap?: Map<string, Map<string, any>>
): BanScoreResult {
  const championId = champion.id;

  // 1. 计算各维度分数
  const heroStrength = calculateHeroStrength(champion, championStats);
  const enemyProficiency = calculateEnemyProficiency(championId, enemyTeamPool);
  const restrictionImpact = calculateRestrictionImpact(champion, championId, bpState, enemyTeamPool);
  const strategicValue = calculateStrategicValue(champion, championId, bpState, enemyTeamPool, counterMap);
  const timingFit = analyzeTimingFit(bpState, config);

  // 2. 获取各维度的综合分数
  const dimensions: BanScoreDimensions = {
    heroStrength: heroStrength.overallScore,
    enemyProficiency: enemyProficiency.overallScore,
    restrictionImpact: restrictionImpact.overallScore,
    strategicValue: strategicValue.overallScore,
    timingFit: 100, // 时机适配度通过系数体现
  };

  // 3. 根据阶段权重计算基础分数
  const weights = timingFit.phaseWeights;
  const baseScore =
    dimensions.heroStrength * weights.heroStrength +
    dimensions.enemyProficiency * weights.enemyProficiency +
    dimensions.restrictionImpact * weights.restrictionImpact +
    dimensions.strategicValue * weights.strategicValue;

  // 4. 应用时机系数
  const finalScore = baseScore * timingFit.timingMultiplier;

  // 5. 生成推荐理由（使用模板）
  const { reason, detailedReason } = generateBanReason(
    champion,
    dimensions,
    enemyProficiency,
    restrictionImpact,
    strategicValue,
    enemyTeamPool
  );

  // 6. 确定优先级
  let priority: 'critical' | 'high' | 'medium' | 'low' = 'low';
  if (finalScore >= 70) priority = 'critical';
  else if (finalScore >= 55) priority = 'high';
  else if (finalScore >= 40) priority = 'medium';

  return {
    championId,
    championName: champion.name,
    dimensions,
    heroStrength,
    enemyProficiency,
    restrictionImpact,
    strategicValue,
    timingFit,
    baseScore,
    finalScore,
    reason,
    detailedReason,
    priority,
  };
}

/**
 * 计算最终 Ban 分数（异步版本，支持AI生成）
 * 支持AI生成理由（可选）
 */
export async function calculateBanScoreAsync(
  champion: Champion,
  bpState: BPState,
  enemyTeamPool: TeamChampionPool | null,
  championStats?: { winRate?: number; banRate?: number; pickRate?: number },
  config: BanScoringConfig = DEFAULT_BAN_SCORING_CONFIG,
  useAI: boolean = false,
  counterMap?: Map<string, Map<string, any>>
): Promise<BanScoreResult> {
  const championId = champion.id;

  // 1. 计算各维度分数
  const heroStrength = calculateHeroStrength(champion, championStats);
  const enemyProficiency = calculateEnemyProficiency(championId, enemyTeamPool);
  const restrictionImpact = calculateRestrictionImpact(champion, championId, bpState, enemyTeamPool);
  const strategicValue = calculateStrategicValue(champion, championId, bpState, enemyTeamPool, counterMap);
  const timingFit = analyzeTimingFit(bpState, config);

  // 2. 获取各维度的综合分数
  const dimensions: BanScoreDimensions = {
    heroStrength: heroStrength.overallScore,
    enemyProficiency: enemyProficiency.overallScore,
    restrictionImpact: restrictionImpact.overallScore,
    strategicValue: strategicValue.overallScore,
    timingFit: 100, // 时机适配度通过系数体现
  };

  // 3. 根据阶段权重计算基础分数
  const weights = timingFit.phaseWeights;
  const baseScore =
    dimensions.heroStrength * weights.heroStrength +
    dimensions.enemyProficiency * weights.enemyProficiency +
    dimensions.restrictionImpact * weights.restrictionImpact +
    dimensions.strategicValue * weights.strategicValue;

  // 4. 应用时机系数
  const finalScore = baseScore * timingFit.timingMultiplier;

  // 5. 生成推荐理由
  let reason: string;
  let detailedReason: string[];

  if (useAI && process.env.AI_BAN_REASON_ENABLED === 'true') {
    // 使用AI生成理由
    try {
      const aiResult = await generateBanReasonWithAI(
        champion,
        dimensions,
        enemyProficiency,
        restrictionImpact,
        strategicValue,
        enemyTeamPool,
        bpState
      );
      reason = aiResult.reason;
      detailedReason = aiResult.detailedReason;
    } catch (error) {
      console.error('[Ban Scoring] AI generation failed, using template:', error);
      // 降级到模板生成
      const templateResult = generateBanReason(
        champion,
        dimensions,
        enemyProficiency,
        restrictionImpact,
        strategicValue,
        enemyTeamPool
      );
      reason = templateResult.reason;
      detailedReason = templateResult.detailedReason;
    }
  } else {
    // 使用模板生成
    const templateResult = generateBanReason(
      champion,
      dimensions,
      enemyProficiency,
      restrictionImpact,
      strategicValue,
      enemyTeamPool
    );
    reason = templateResult.reason;
    detailedReason = templateResult.detailedReason;
  }

  // 6. 确定优先级
  let priority: 'critical' | 'high' | 'medium' | 'low' = 'low';
  if (finalScore >= 70) priority = 'critical';
  else if (finalScore >= 55) priority = 'high';
  else if (finalScore >= 40) priority = 'medium';

  return {
    championId,
    championName: champion.name,
    dimensions,
    heroStrength,
    enemyProficiency,
    restrictionImpact,
    strategicValue,
    timingFit,
    baseScore,
    finalScore,
    reason,
    detailedReason,
    priority,
  };
}

/**
 * 生成 Ban 推荐理由（专业教练分析格式）
 * OPTIMIZED: 按照职业教练的分析风格，提供结构化的战术分析
 */
function generateBanReason(
  champion: Champion,
  dimensions: BanScoreDimensions,
  enemyProficiency: EnemyProficiencyMetrics,
  restrictionImpact: RestrictionImpactMetrics,
  strategicValue: StrategicValueMetrics,
  enemyTeamPool: TeamChampionPool | null
): { reason: string; detailedReason: string[] } {
  const reasons: string[] = [];

  // 位置名称映射
  const positionNames: Record<Position, string> = {
    'top': '上单',
    'jungle': '打野',
    'mid': '中单',
    'bot': 'ADC',
    'support': '辅助'
  };

  // 获取英雄可用性信息
  const availability = enemyTeamPool?.championAvailability.get(champion.id);
  const hasAvailability = availability && availability.availablePlayers.length > 0;
  const bestPlayer = hasAvailability ? availability.availablePlayers[0] : null;
  const playerName = bestPlayer?.playerName || '对手选手';
  const proficiencyLevel = bestPlayer?.proficiencyLevel || 0;
  const frequency = bestPlayer ? Math.round(bestPlayer.frequency * 100) : 0;
  const position = champion.positions[0];
  const positionName = positionNames[position] || position;

  // 构建专业分析格式的理由
  const analysisLines: string[] = [];

  // 1. 针对对象
  if (hasAvailability && (enemyProficiency.signatureScore >= 60 || strategicValue.targetingScore >= 60)) {
    analysisLines.push(`**针对对象:** 主要针对敌方 ${positionName} 位选手 ${playerName}。`);
  } else if (dimensions.heroStrength >= 70) {
    analysisLines.push(`**针对对象:** 针对当前版本强势英雄，限制敌方整体选择空间。`);
  }

  // 2. 限制原因
  const limitReasons: string[] = [];

  // 招牌英雄
  if (enemyProficiency.signatureScore >= 80) {
    const stars = '⭐'.repeat(Math.min(proficiencyLevel, 5));
    limitReasons.push(`${champion.name} 是其招牌英雄之一（${stars} 熟练度${Math.round(enemyProficiency.signatureScore)}分，使用率${frequency}%）`);
  } else if (enemyProficiency.signatureScore >= 60) {
    limitReasons.push(`${champion.name} 是其高熟练英雄之一（熟练度${Math.round(enemyProficiency.signatureScore)}分）`);
  }

  // 核心影响方式
  const coreImpacts: string[] = [];

  // 体系核心
  if (strategicValue.systemCoreScore >= 60) {
    for (const [systemName, champions] of Object.entries(KNOWN_SYSTEMS)) {
      if (champions.includes(champion.id)) {
        coreImpacts.push(`${systemName}的核心构建`);
        break;
      }
    }
  }

  // 版本强势
  if (dimensions.heroStrength >= 70) {
    coreImpacts.push(`版本T0级强度（${Math.round(dimensions.heroStrength)}分）的节奏控制`);
  } else if (dimensions.heroStrength >= 60) {
    coreImpacts.push(`版本强势（${Math.round(dimensions.heroStrength)}分）的对线压制`);
  }

  // 位置压缩
  if (restrictionImpact.poolCompressionScore >= 70) {
    coreImpacts.push(`该位置的核心选择（压缩度${Math.round(restrictionImpact.poolCompressionScore)}分）`);
  }

  if (limitReasons.length > 0 && coreImpacts.length > 0) {
    analysisLines.push(`**限制原因:** ${limitReasons[0]}，常用于${coreImpacts[0]}。`);
  } else if (limitReasons.length > 0) {
    analysisLines.push(`**限制原因:** ${limitReasons[0]}。`);
  } else if (dimensions.heroStrength >= 60) {
    analysisLines.push(`**限制原因:** ${champion.name} 在当前版本具有较高优先级（强度${Math.round(dimensions.heroStrength)}分），常用于建立前期优势。`);
  }

  // 3. 战术价值 - 简洁高效，聚焦核心影响
  let tacticalValue = '';

  // 优先级1: 英雄池压缩 + 具体替代选择
  if (restrictionImpact.poolCompressionScore >= 85) {
    // 获取该位置的其他高熟练英雄作为替代选择
    const alternatives = getAlternativeChampions(availability, champion.id, enemyTeamPool, position);
    if (alternatives.length > 0) {
      tacticalValue = `Ban掉后，敌方${positionName}位几乎无同级替代，可能被迫选择${alternatives.join('或')}等次级英雄`;
    } else {
      tacticalValue = `Ban掉后，敌方${positionName}位几乎无同级替代，该位置将被严重削弱`;
    }
  } else if (restrictionImpact.poolCompressionScore >= 70) {
    const alternatives = getAlternativeChampions(availability, champion.id, enemyTeamPool, position);
    if (alternatives.length > 0) {
      tacticalValue = `Ban掉后，敌方可能转向${alternatives.join('或')}，但整体威胁度下降`;
    } else {
      tacticalValue = `Ban掉后，敌方需要调整选人思路，${positionName}位压力增大`;
    }
  }
  // 优先级2: 体系核心
  else if (strategicValue.systemCoreScore >= 60) {
    tacticalValue = `Ban掉后，敌方战术体系核心被破坏，整体配合将受到削弱`;
  }
  // 优先级3: 招牌英雄
  else if (enemyProficiency.signatureScore >= 70) {
    tacticalValue = `Ban掉后，${playerName}的舒适度明显下降，对线压制力减弱`;
  }
  // 优先级4: 中等压缩（50-69分）- 也显示替代英雄
  else if (restrictionImpact.poolCompressionScore >= 50) {
    const alternatives = getAlternativeChampions(availability, champion.id, enemyTeamPool, position);
    if (alternatives.length > 0) {
      tacticalValue = `Ban掉后，敌方可能转向${alternatives.join('或')}等备选，${positionName}位选择受限`;
    } else {
      tacticalValue = `Ban掉后，敌方${positionName}位选择受限，整体BP灵活性降低`;
    }
  }
  // 默认 - 也尝试显示替代英雄
  else {
    const alternatives = getAlternativeChampions(availability, champion.id, enemyTeamPool, position);
    if (alternatives.length > 0) {
      tacticalValue = `Ban掉后，敌方可能转向${alternatives.join('或')}，整体选择空间被压缩`;
    } else {
      tacticalValue = `Ban掉后，敌方整体选择空间被压缩，BP灵活性降低`;
    }
  }

  if (tacticalValue) {
    analysisLines.push(`**战术价值:** ${tacticalValue}。`);
  }

  // 4. 时机说明 - 简洁明确，只保留最重要的一条
  let timingReason = '';

  // 优先级1: 最近火热
  if (enemyProficiency.recencyScore >= 70) {
    timingReason = `对手近期频繁使用且状态火热，当前阶段处理可避免其拿到舒适英雄`;
  }
  // 优先级2: 连续针对
  else if (strategicValue.targetingScore >= 60) {
    timingReason = `延续对${positionName}位的针对策略，进一步压缩其英雄池深度`;
  }
  // 优先级3: 招牌/压缩
  else if (restrictionImpact.poolCompressionScore >= 70 || enemyProficiency.signatureScore >= 80) {
    timingReason = `当前阶段处理可避免其在后续建立稳定优势，限制敌方BP节奏`;
  }
  // 优先级4: 版本强势
  else if (dimensions.heroStrength >= 70) {
    timingReason = `当前阶段限制版本强势英雄，可降低敌方阵容上限`;
  }
  // 默认
  else {
    timingReason = `当前阶段处理可压缩敌方后续选择空间`;
  }

  if (timingReason) {
    analysisLines.push(`**时机说明:** ${timingReason}。`);
  }

  // 6. 生成简短主理由（用于卡片显示）
  let shortReason = '';

  if (enemyProficiency.signatureScore >= 80 && hasAvailability) {
    const stars = '⭐'.repeat(Math.min(proficiencyLevel, 5));
    shortReason = `${playerName}的招牌英雄 ${stars}（熟练度${Math.round(enemyProficiency.signatureScore)}分）`;
  } else if (restrictionImpact.poolCompressionScore >= 85) {
    shortReason = `${positionName}位几乎唯一选择（压缩度${Math.round(restrictionImpact.poolCompressionScore)}分）`;
  } else if (strategicValue.systemCoreScore >= 60) {
    for (const [systemName, champions] of Object.entries(KNOWN_SYSTEMS)) {
      if (champions.includes(champion.id)) {
        shortReason = `${systemName}核心（体系重要度${Math.round(strategicValue.systemCoreScore)}分）`;
        break;
      }
    }
  } else if (dimensions.heroStrength >= 70) {
    shortReason = `版本T0级英雄（强度${Math.round(dimensions.heroStrength)}分）`;
  } else if (enemyProficiency.signatureScore >= 60 && hasAvailability) {
    shortReason = `${playerName}的高熟练英雄（${Math.round(enemyProficiency.signatureScore)}分）`;
  } else {
    const topDim = getTopDimension(dimensions);
    shortReason = `综合评估推荐（${topDim.name}${topDim.score}分）`;
  }

  // 7. 组装最终理由
  // 主理由：简短版本
  const mainReason = shortReason;

  // 详细理由：完整分析（最多4条）
  const detailedReasons = analysisLines.slice(0, 4);

  return {
    reason: mainReason,
    detailedReason: detailedReasons
  };
}

/**
 * 获取最高分的维度
 */
function getTopDimension(dimensions: BanScoreDimensions): { name: string; score: number } {
  const dims = [
    { name: '英雄强度', score: dimensions.heroStrength },
    { name: '敌方熟练度', score: dimensions.enemyProficiency },
    { name: '限制效果', score: dimensions.restrictionImpact },
    { name: '战略价值', score: dimensions.strategicValue },
  ];

  dims.sort((a, b) => b.score - a.score);
  return { name: dims[0].name, score: Math.round(dims[0].score) };
}

/**
 * 获取替代英雄选择
 * 从敌方英雄池中找出该位置的其他高熟练英雄
 */
function getAlternativeChampions(
  availability: any,
  currentChampionId: string,
  enemyTeamPool: TeamChampionPool | null,
  position: Position
): string[] {
  if (!enemyTeamPool) return [];

  const alternatives: Array<{ name: string; score: number }> = [];

  // 遍历敌方英雄池，找出其他可用的英雄
  for (const [championId, champAvailability] of enemyTeamPool.championAvailability.entries()) {
    // 跳过当前英雄
    if (championId === currentChampionId) continue;

    // 计算该英雄的综合评分
    const proficiencyScore = champAvailability.teamProficiencyScore || 0;
    const availableCount = champAvailability.availablePlayers?.length || 0;

    // 只考虑有一定熟练度的英雄
    if (proficiencyScore >= 40 && availableCount > 0) {
      alternatives.push({
        name: championId,  // Use championId as name since we don't have champion name mapping
        score: proficiencyScore,
      });
    }
  }

  // 按评分排序，取前2-3个
  alternatives.sort((a, b) => b.score - a.score);

  return alternatives.slice(0, 2).map(a => a.name);
}

/**
 * ============================================================================
 * 主推荐函数
 * ============================================================================
 */

/**
 * 获取优化的 Ban 推荐列表（同步版本）
 * 使用模板生成理由
 */
export function getAdvancedBanRecommendations(
  allChampions: Champion[],
  bpState: BPState,
  enemyTeamPool: TeamChampionPool | null,
  championStatsMap?: Map<string, { winRate: number; banRate: number; pickRate: number }>,
  config: BanScoringConfig = DEFAULT_BAN_SCORING_CONFIG,
  topN: number = 10
): BanScoreResult[] {
  // 获取已经被 Ban 的英雄 ID
  const bannedChampionIds = new Set<string>();
  bpState.blueBans.forEach(ban => {
    if (ban.champion) bannedChampionIds.add(ban.champion.id);
  });
  bpState.redBans.forEach(ban => {
    if (ban.champion) bannedChampionIds.add(ban.champion.id);
  });

  // 获取可用英雄
  const availableChampions = allChampions.filter(
    c => !bannedChampionIds.has(c.id) && !bpState.usedChampions.has(c.id)
  );

  // 计算每个英雄的 Ban 分数
  const banScores: BanScoreResult[] = [];

  for (const champion of availableChampions) {
    const championStats = championStatsMap?.get(champion.id);

    const scoreResult = calculateBanScore(
      champion,
      bpState,
      enemyTeamPool,
      championStats,
      config
    );

    banScores.push(scoreResult);
  }

  // 按最终分数排序
  banScores.sort((a, b) => b.finalScore - a.finalScore);

  // 返回前 N 个
  return banScores.slice(0, topN);
}

/**
 * 获取优化的 Ban 推荐列表（异步版本）
 * 支持AI生成理由（可选）
 */
export async function getAdvancedBanRecommendationsAsync(
  allChampions: Champion[],
  bpState: BPState,
  enemyTeamPool: TeamChampionPool | null,
  championStatsMap?: Map<string, { winRate: number; banRate: number; pickRate: number }>,
  config: BanScoringConfig = DEFAULT_BAN_SCORING_CONFIG,
  topN: number = 10,
  useAI: boolean = false
): Promise<BanScoreResult[]> {
  // 获取已经被 Ban 的英雄 ID
  const bannedChampionIds = new Set<string>();
  bpState.blueBans.forEach(ban => {
    if (ban.champion) bannedChampionIds.add(ban.champion.id);
  });
  bpState.redBans.forEach(ban => {
    if (ban.champion) bannedChampionIds.add(ban.champion.id);
  });

  // 获取可用英雄
  const availableChampions = allChampions.filter(
    c => !bannedChampionIds.has(c.id) && !bpState.usedChampions.has(c.id)
  );

  // 优化：先快速计算所有英雄的分数（不使用AI）
  const banScores: BanScoreResult[] = [];

  for (const champion of availableChampions) {
    const championStats = championStatsMap?.get(champion.id);

    // 使用同步版本快速计算分数（不生成AI理由）
    const scoreResult = calculateBanScore(
      champion,
      bpState,
      enemyTeamPool,
      championStats,
      config
    );

    banScores.push(scoreResult);
  }

  // 按最终分数排序
  banScores.sort((a, b) => b.finalScore - a.finalScore);

  // 获取前 N 个
  const topRecommendations = banScores.slice(0, topN);

  // 如果启用AI，只为Top N生成AI理由
  if (useAI && process.env.AI_BAN_REASON_ENABLED === 'true') {
    console.log(`[Ban Scoring] Generating AI reasons for top ${topN} champions...`);

    // 并行生成AI理由
    const aiPromises = topRecommendations.map(async (rec) => {
      try {
        const champion = allChampions.find(c => c.id === rec.championId);
        if (!champion) return rec;

        const aiResult = await generateBanReasonWithAI(
          champion,
          rec.dimensions,
          rec.enemyProficiency,
          rec.restrictionImpact,
          rec.strategicValue,
          enemyTeamPool,
          bpState
        );

        // 更新推荐理由
        return {
          ...rec,
          reason: aiResult.reason,
          detailedReason: aiResult.detailedReason,
        };
      } catch (error) {
        console.error(`[Ban Scoring] AI generation failed for ${rec.championName}, using template:`, error);
        return rec; // 保留模板生成的理由
      }
    });

    // 等待所有AI生成完成
    const updatedRecommendations = await Promise.all(aiPromises);
    return updatedRecommendations;
  }

  // 返回前 N 个（使用模板理由）
  return topRecommendations;
}

/**
 * 获取特定类型的 Ban 推荐（同步版本）
 */
export function getBanRecommendationsByType(
  allChampions: Champion[],
  bpState: BPState,
  enemyTeamPool: TeamChampionPool | null,
  type: 'signature' | 'system' | 'position' | 'protection',
  topN: number = 5
): BanScoreResult[] {
  const allRecommendations = getAdvancedBanRecommendations(
    allChampions,
    bpState,
    enemyTeamPool,
    undefined,
    DEFAULT_BAN_SCORING_CONFIG,
    50 // 先获取更多候选
  );

  let filtered: BanScoreResult[] = [];

  switch (type) {
    case 'signature':
      // 招牌英雄：高熟练度 + 唯一选择
      filtered = allRecommendations.filter(
        r => r.enemyProficiency.signatureScore >= 80 &&
             r.restrictionImpact.poolCompressionScore >= 70
      );
      break;

    case 'system':
      // 体系核心
      filtered = allRecommendations.filter(
        r => r.strategicValue.systemCoreScore >= 60
      );
      break;

    case 'position':
      // 位置压缩：连续Ban同一位置
      filtered = allRecommendations.filter(
        r => r.restrictionImpact.positionCompressionScore >= 40
      );
      break;

    case 'protection':
      // 保护性Ban
      filtered = allRecommendations.filter(
        r => r.strategicValue.protectionScore >= 50
      );
      break;
  }

  return filtered.slice(0, topN);
}

/**
 * 获取特定类型的 Ban 推荐（异步版本）
 */
export async function getBanRecommendationsByTypeAsync(
  allChampions: Champion[],
  bpState: BPState,
  enemyTeamPool: TeamChampionPool | null,
  type: 'signature' | 'system' | 'position' | 'protection',
  topN: number = 5,
  useAI: boolean = false
): Promise<BanScoreResult[]> {
  const allRecommendations = await getAdvancedBanRecommendationsAsync(
    allChampions,
    bpState,
    enemyTeamPool,
    undefined,
    DEFAULT_BAN_SCORING_CONFIG,
    50, // 先获取更多候选
    useAI
  );

  let filtered: BanScoreResult[] = [];

  switch (type) {
    case 'signature':
      // 招牌英雄：高熟练度 + 唯一选择
      filtered = allRecommendations.filter(
        r => r.enemyProficiency.signatureScore >= 80 &&
             r.restrictionImpact.poolCompressionScore >= 70
      );
      break;

    case 'system':
      // 体系核心
      filtered = allRecommendations.filter(
        r => r.strategicValue.systemCoreScore >= 60
      );
      break;

    case 'position':
      // 位置压缩：连续Ban同一位置
      filtered = allRecommendations.filter(
        r => r.restrictionImpact.positionCompressionScore >= 40
      );
      break;

    case 'protection':
      // 保护性Ban
      filtered = allRecommendations.filter(
        r => r.strategicValue.protectionScore >= 50
      );
      break;
  }

  return filtered.slice(0, topN);
}

/**
 * ============================================================================
 * AI生成Ban理由（可选功能）
 * ============================================================================
 */

/**
 * 使用AI生成Ban理由
 */
async function generateBanReasonWithAI(
  champion: Champion,
  dimensions: BanScoreDimensions,
  enemyProficiency: EnemyProficiencyMetrics,
  restrictionImpact: RestrictionImpactMetrics,
  strategicValue: StrategicValueMetrics,
  enemyTeamPool: TeamChampionPool | null,
  bpState: BPState
): Promise<{ reason: string; detailedReason: string[] }> {
  // 动态导入AI模块（避免在不使用时加载）
  const { buildAIInputFromBanScore, generateBanReasonWithAI: generateAI } = await import('./ai-ban-reason-prompt');

  // 构建AI输入数据
  const aiInput = buildAIInputFromBanScore(
    champion,
    dimensions,
    enemyProficiency,
    restrictionImpact,
    strategicValue,
    enemyTeamPool,
    bpState
  );

  // 获取配置
  const provider = (process.env.AI_BAN_REASON_PROVIDER || 'anthropic') as 'anthropic' | 'openai' | 'ollama';
  const apiKey = process.env.AI_BAN_REASON_API_KEY || '';
  const model = process.env.AI_BAN_REASON_MODEL;
  const endpoint = process.env.AI_BAN_REASON_ENDPOINT;

  // 验证配置
  if (!apiKey && provider !== 'ollama') {
    throw new Error('AI_BAN_REASON_API_KEY not configured');
  }

  // 调用AI API
  const aiResponse = await generateAI(aiInput, {
    provider,
    apiKey,
    model,
    endpoint,
  });

  // 解析AI响应
  return parseAIGeneratedReason(aiResponse);
}

/**
 * 解析AI生成的理由
 */
function parseAIGeneratedReason(aiResponse: string): {
  reason: string;
  detailedReason: string[];
} {
  const lines = aiResponse.split('\n').filter(line => line.trim());

  // 提取各个部分
  const sections: Record<string, string> = {};
  let currentSection = '';

  for (const line of lines) {
    if (line.startsWith('**') && line.includes(':**')) {
      // 这是一个标题行
      currentSection = line.replace(/\*\*/g, '').replace(':', '').trim();
      sections[currentSection] = '';
    } else if (currentSection && line.trim()) {
      // 这是内容行
      if (sections[currentSection]) {
        sections[currentSection] += ' ' + line.trim();
      } else {
        sections[currentSection] = line.trim();
      }
    }
  }

  // 构建简短主理由（从限制原因中提取）
  const shortReason = sections['限制原因'] || sections['针对对象'] || '综合评估推荐';

  // 构建详细理由数组
  const detailedReason: string[] = [];
  const sectionOrder = ['针对对象', '限制原因', '战术价值', '时机说明'];

  for (const sectionName of sectionOrder) {
    if (sections[sectionName]) {
      detailedReason.push(`**${sectionName}:** ${sections[sectionName]}`);
    }
  }

  return {
    reason: shortReason,
    detailedReason,
  };
}


