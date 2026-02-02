/**
 * Pick Threat Score (PTS) Engine - Data-Driven Version
 *
 * A data-driven system for quantifying draft urgency based on real match data.
 * PTS = PickLikelihood × LossSeverity × 100
 *
 * Now uses:
 * - Real champion pick/ban/win rates from professional matches
 * - Actual synergy patterns (champions picked together)
 * - Real counter matchups (win rates against specific champions)
 * - Composition-aware threat analysis
 * - Optimized score normalization (V2)
 * - Improved role vacancy calculation (V3)
 */

import {
  Champion,
  Position,
  Team,
  DraftState,
  PTSResult,
  PTSConfig,
  PickLikelihoodSignals,
  LossSeverityBreakdown,
  LossSeverityCategory,
  BPState,
  BPStep,
  ActionType,
  OpponentModel
} from './types';

// Import optimization utilities
import {
  normalizePTSScores,
  adaptiveNormalizePTSScores,
  calculateRoleVacancyV3,
  calculateScoreDistribution,
} from './pts-optimization';

// Import data analyzer (only on server side)
let dataAnalyzer: any = null;
if (typeof window === 'undefined') {
  try {
    dataAnalyzer = require('./draft-data-analyzer');
    console.log('[PTS] Draft data analyzer loaded successfully');
  } catch (e) {
    console.warn('[PTS] Draft data analyzer not available:', e);
  }
}

// Default heuristic configuration
// TODO: Replace these with learned weights from historical draft data
export const DEFAULT_PTS_CONFIG: PTSConfig = {
  // PickLikelihood weights (sum to 1.0)
  roleVacancyWeight: 0.40,      // Strongest signal: do they need this role?
  championPoolWeight: 0.30,     // Player history matters
  metaPresenceWeight: 0.20,     // Meta relevance
  synergyBanWeight: 0.10,       // Ban patterns hint at intent

  // LossSeverity weights (sum to 1.0)
  roleCollapseWeight: 0.50,     // Losing role flexibility is critical
  compositionLockWeight: 0.30,  // Getting locked into predictable comp
  strategicDenialWeight: 0.20,  // Opponent denying our strategy

  // Risk tier thresholds
  criticalThreshold: 70,        // PTS >= 70: Must act now
  highThreshold: 50,            // PTS >= 50: High risk to delay
  moderateThreshold: 30,        // PTS >= 30: Moderate risk
};

// Optimized PTS configuration - 减少波动，提高稳定性
export const OPTIMIZED_PTS_CONFIG: PTSConfig = {
  // PickLikelihood weights - 降低位置权重，提高其他因素
  roleVacancyWeight: 0.25,      // 从0.40降低，减少波动
  championPoolWeight: 0.35,     // 从0.30提高，增加稳定性
  metaPresenceWeight: 0.25,     // 从0.20提高
  synergyBanWeight: 0.15,       // 从0.10提高

  // LossSeverity weights - 降低位置崩溃权重
  roleCollapseWeight: 0.35,     // 从0.50降低，减少波动
  compositionLockWeight: 0.35,  // 从0.30提高
  strategicDenialWeight: 0.30,  // 从0.20提高

  // Risk tier thresholds
  criticalThreshold: 35,
  highThreshold: 25,
  moderateThreshold: 15,
};

// Ban阶段专用配置 - 重点：破坏对手战略，保护我方战略
export const BAN_PHASE_CONFIG: PTSConfig = {
  // PickLikelihood: 对手拿到的可能性
  roleVacancyWeight: 0.25,      // 对手位置需求
  championPoolWeight: 0.35,     // 对手选手英雄池（重要）
  metaPresenceWeight: 0.25,     // Meta热度
  synergyBanWeight: 0.15,       // 协同Ban信号

  // LossSeverity: 对手拿到对我方的伤害
  roleCollapseWeight: 0.20,     // 我方位置受限（较低）
  compositionLockWeight: 0.25,  // 我方阵容锁定（较低）
  strategicDenialWeight: 0.55,  // 战略拒绝（重要！包含对手协同+Counter我方）

  // Risk tier thresholds
  criticalThreshold: 35,
  highThreshold: 25,
  moderateThreshold: 15,
};

// Pick阶段专用配置 - 重点：构建我方阵容，Counter对手阵容
export const PICK_PHASE_CONFIG: PTSConfig = {
  // PickLikelihood: 对手拿到的可能性（防止被抢）
  roleVacancyWeight: 0.30,      // 对手位置需求（提高）
  championPoolWeight: 0.25,     // 对手选手英雄池（降低）
  metaPresenceWeight: 0.25,     // Meta热度
  synergyBanWeight: 0.20,       // 协同Ban信号（提高）

  // LossSeverity: 我方失去的价值
  roleCollapseWeight: 0.40,     // 我方位置受限（重要！）
  compositionLockWeight: 0.30,  // 我方阵容锁定
  strategicDenialWeight: 0.30,  // 战略价值（我方协同+Counter对手）

  // Risk tier thresholds
  criticalThreshold: 35,
  highThreshold: 25,
  moderateThreshold: 15,
};

/**
 * Convert BPState to DraftState for PTS calculation
 */
export function bpStateToDraftState(
  bpState: BPState,
  currentStep: BPStep,
  side: Team
): DraftState {
  // Calculate remaining roles for each team
  const blueRemainingRoles = getRemainingRoles(bpState.bluePicks);
  const redRemainingRoles = getRemainingRoles(bpState.redPicks);

  return {
    side,
    currentStep,
    bluePicks: bpState.bluePicks,
    redPicks: bpState.redPicks,
    blueBans: bpState.blueBans.map(ban => ban.champion),
    redBans: bpState.redBans.map(ban => ban.champion),
    blueRemainingRoles,
    redRemainingRoles,
  };
}

/**
 * Get role fill status for a team
 * Returns which roles are definitely filled, possibly filled, or vacant
 */
interface RoleFillStatus {
  definitelyFilled: Set<Position>;    // Roles filled by single-position champions
  possiblyFilled: Set<Position>;      // Roles that might be filled by flex picks
  vacant: Position[];                 // Roles definitely not filled yet
}

function getRoleFillStatus(picks: (Champion | null)[]): RoleFillStatus {
  const allRoles: Position[] = ['top', 'jungle', 'mid', 'bot', 'support'];
  const definitelyFilled = new Set<Position>();
  const possiblyFilled = new Set<Position>();

  picks.forEach((pick) => {
    if (pick && pick.positions && pick.positions.length > 0) {
      if (pick.positions.length === 1) {
        // Single-position champion: this role is definitely filled
        definitelyFilled.add(pick.positions[0]);
      } else {
        // Multi-position champion: these roles are possibly filled
        pick.positions.forEach(pos => possiblyFilled.add(pos));
      }
    }
  });

  // Vacant roles are those not definitely filled
  const vacant = allRoles.filter(role => !definitelyFilled.has(role));

  return { definitelyFilled, possiblyFilled, vacant };
}

/**
 * Get remaining roles that need to be filled (legacy function for compatibility)
 * Now uses the new RoleFillStatus logic
 */
function getRemainingRoles(picks: (Champion | null)[]): Position[] {
  return getRoleFillStatus(picks).vacant;
}

/**
 * Get phase-aware bonus multiplier for Pick phase
 * 大幅降低加成以避免分数膨胀
 */
function getPhaseBonus(step: number, action: ActionType): number {
  if (action !== 'pick') return 1.0;

  // Pick阶段的阶段感知加成（大幅降低）
  if (step <= 6) return 1.05;  // 早期提升5%
  if (step <= 12) return 1.0;  // 中期不加成
  return 0.90;                 // 后期降低10%以抑制膨胀
}

/**
 * Smooth PTS scores to reduce late-game inflation
 * Applies compression to high scores across all phases
 * 改进版：从早期就开始压缩，防止分数过高
 */
function smoothPTS(pts: number, step: number): number {
  // 早期（1-6）：对高分进行压缩
  if (step <= 6) {
    if (pts <= 30) return pts;
    const excess = pts - 30;
    return 30 + excess * 0.70;  // 超过30的部分打7折
  }

  // 中期（7-12）：更激进的压缩
  if (step <= 12) {
    if (pts <= 25) return pts;
    const excess = pts - 25;
    return 25 + excess * 0.60;  // 超过25的部分打6折
  }

  // 后期（13+）：最激进压缩，使用对数函数
  if (pts <= 20) return pts;

  const excess = pts - 20;
  // 使用对数压缩，越高的分数压缩越厉害
  const compressed = 20 + Math.log(1 + excess) * 6;  // 对数压缩
  return Math.min(50, compressed);  // 后期最高不超过50分
}

/**
 * Calculate Pick Threat Score for all available champions
 * Now supports phase-aware configuration (Ban vs Pick)
 * V2: Includes score normalization to reduce late-game inflation
 */
export function calculatePTS(
  draftState: DraftState,
  availableChampions: Champion[],
  config?: PTSConfig,
  useNormalization: boolean = false,  // 关闭归一化，使用原始 PTS 分数
  opponentModel?: OpponentModel      // 新增：对手模型
): PTSResult[] {
  // 根据action自动选择配置
  if (!config) {
    const action = draftState.currentStep?.action ?? 'ban';
    config = action === 'ban' ? BAN_PHASE_CONFIG : PICK_PHASE_CONFIG;
  }

  const results: PTSResult[] = [];

  // Debug: Log first champion calculation
  let debugLogged = false;

  for (const champion of availableChampions) {
    const action = draftState.currentStep?.action ?? 'ban';
    const pickLikelihood = calculatePickLikelihood(draftState, champion, config, opponentModel);
    const lossSeverity = calculateLossSeverity(draftState, champion, config, action, opponentModel);

    let pts = pickLikelihood.total * lossSeverity.total * 100;

    // 降低基础缩放系数以减少分数膨胀
    // 从3.0降低到1.2，避免分数过高
    pts *= 1.2;

    // 阶段感知加成：早期高，后期低
    const currentStep = draftState.currentStep?.index ?? 0;
    const stepNumber = currentStep + 1; // Convert 0-based to 1-based
    pts *= getPhaseBonus(stepNumber, action);

    // 限制最大值为 100
    pts = Math.min(100, pts);

    // 分数平滑：后期压缩高分（旧方法，如果不使用归一化）
    if (!useNormalization) {
      pts = smoothPTS(pts, stepNumber);
    }

    const riskTier = determineRiskTier(pts, config);
    const explanation = generateExplanation(champion, pickLikelihood, lossSeverity, riskTier);

    // Debug first champion and specific champions
    const debugChampions = ['Lucian', 'Tristana', 'Yone'];
    if (typeof window === 'undefined' && (!debugLogged || debugChampions.includes(champion.name))) {
      const phaseBonus = getPhaseBonus(stepNumber, action);
      const basePTS = pickLikelihood.total * lossSeverity.total * 100;
      console.log(`[PTS DEBUG] ========== ${champion.name} - Step ${stepNumber} (${action}) ==========`);
      console.log(`[PTS DEBUG] Config: ${action === 'ban' ? 'BAN_PHASE' : 'PICK_PHASE'}`);
      console.log(`[PTS DEBUG] PickLikelihood: ${pickLikelihood.total.toFixed(6)}`);
      console.log(`[PTS DEBUG] - roleVacancy: ${pickLikelihood.signals.opponentRoleVacancy.toFixed(6)} (weight: ${config.roleVacancyWeight})`);
      console.log(`[PTS DEBUG] - championPool: ${pickLikelihood.signals.playerChampionPoolFreq.toFixed(6)} (weight: ${config.championPoolWeight})`);
      console.log(`[PTS DEBUG] - metaPresence: ${pickLikelihood.signals.globalMetaPresence.toFixed(6)} (weight: ${config.metaPresenceWeight})`);
      console.log(`[PTS DEBUG] - synergyBan: ${pickLikelihood.signals.synergyBanSignal.toFixed(6)} (weight: ${config.synergyBanWeight})`);
      console.log(`[PTS DEBUG] LossSeverity: ${lossSeverity.total.toFixed(6)}`);
      console.log(`[PTS DEBUG] - roleCollapse: ${lossSeverity.roleCollapse.toFixed(6)} (weight: ${config.roleCollapseWeight})`);
      console.log(`[PTS DEBUG] - compositionLock: ${lossSeverity.compositionLock.toFixed(6)} (weight: ${config.compositionLockWeight})`);
      console.log(`[PTS DEBUG] - strategicDenial: ${lossSeverity.strategicDenial.toFixed(6)} (weight: ${config.strategicDenialWeight})`);
      console.log(`[PTS DEBUG] Base PTS: ${basePTS.toFixed(6)}`);
      console.log(`[PTS DEBUG] Phase Bonus: ${phaseBonus}x`);
      console.log(`[PTS DEBUG] After Bonus: ${(basePTS * phaseBonus).toFixed(6)}`);
      console.log(`[PTS DEBUG] Final PTS (before normalization): ${pts.toFixed(6)}`);
      console.log(`[PTS DEBUG] Use Normalization: ${useNormalization}`);
      console.log(`[PTS DEBUG] ==========================================`);
      debugLogged = true;
    }

    results.push({
      championId: champion.id,
      championName: champion.name,
      pts,
      pickLikelihood: pickLikelihood.total,
      lossSeverity: lossSeverity.total,
      riskTier,
      explanation,
      signals: pickLikelihood.signals,
      severityBreakdown: lossSeverity,
    });
  }

  // 应用归一化（如果启用）
  if (useNormalization) {
    const currentStep = draftState.currentStep?.index ?? 0;
    const stepNumber = currentStep + 1;

    // 使用自适应归一化
    const normalized = adaptiveNormalizePTSScores(results, stepNumber);

    // 打印归一化前后的统计
    if (typeof window === 'undefined') {
      const beforeDist = calculateScoreDistribution(results);
      const afterDist = calculateScoreDistribution(normalized);

      console.log(`[PTS Normalization] Before: min=${beforeDist.min.toFixed(1)}, max=${beforeDist.max.toFixed(1)}, mean=${beforeDist.mean.toFixed(1)}, stdDev=${beforeDist.stdDev.toFixed(1)}`);
      console.log(`[PTS Normalization] After: min=${afterDist.min.toFixed(1)}, max=${afterDist.max.toFixed(1)}, mean=${afterDist.mean.toFixed(1)}, stdDev=${afterDist.stdDev.toFixed(1)}`);
    }

    // Sort by PTS descending
    return normalized.sort((a, b) => b.pts - a.pts);
  }

  // Sort by PTS descending
  return results.sort((a, b) => b.pts - a.pts);
}

/**
 * Calculate PickLikelihood: How likely is opponent to pick this champion?
 * Returns value between 0-1
 */
function calculatePickLikelihood(
  draftState: DraftState,
  champion: Champion,
  config: PTSConfig,
  opponentModel?: OpponentModel  // 新增：对手模型
): { total: number; signals: PickLikelihoodSignals } {
  const opponent = draftState.side === 'blue' ? 'red' : 'blue';
  const opponentPicks = opponent === 'blue' ? draftState.bluePicks : draftState.redPicks;

  // Get opponent's role fill status
  const opponentRoleStatus = getRoleFillStatus(opponentPicks);

  // Signal 1: Opponent Role Vacancy (NEW: with smart exclusion)
  // Does opponent need a role this champion can fill?
  const roleVacancy = calculateRoleVacancyV2(champion, opponentRoleStatus);

  // Signal 2: Player Champion Pool Frequency
  // TODO: Replace with actual player data when available
  // For now, use meta presence as proxy
  const championPoolFreq = calculateChampionPoolFrequency(champion);

  // Signal 3: Global Meta Presence
  // How popular is this champion in current meta?
  const metaPresence = calculateMetaPresence(champion);

  // Signal 4: Synergy Ban Signal
  // Did opponent ban champions that synergize with this one?
  const synergyBan = calculateSynergyBanSignal(draftState, champion, opponent);

  const signals: PickLikelihoodSignals = {
    opponentRoleVacancy: roleVacancy,
    playerChampionPoolFreq: championPoolFreq,
    globalMetaPresence: metaPresence,
    synergyBanSignal: synergyBan,
  };

  // Weighted combination
  let total =
    roleVacancy * config.roleVacancyWeight +
    championPoolFreq * config.championPoolWeight +
    metaPresence * config.metaPresenceWeight +
    synergyBan * config.synergyBanWeight;

  // 新增：对手风格调整
  if (opponentModel && opponentModel.confidence > 0.3) {
    const { calculateOpponentStyleBonus } = require('./opponent-style-bonus');
    const styleBonus = calculateOpponentStyleBonus(
      champion,
      opponentModel.predictedType,
      opponentModel.confidence
    );

    // 根据对手风格调整likelihood（最多增加30%）
    total *= (1 + styleBonus * 0.3);

    if (typeof window === 'undefined' && styleBonus > 0.1) {
      console.log(`[PTS] ${champion.name}: 对手${opponentModel.predictedType}加成 ${(styleBonus * 100).toFixed(1)}%`);
    }
  }

  return { total: Math.min(1, Math.max(0, total)), signals };
}

/**
 * Calculate role vacancy signal (V2: Smart Exclusion)
 *
 * Key improvements:
 * 1. Single-position champions are EXCLUDED if their role is definitely filled
 * 2. Multi-position champions are scored based on available positions
 * 3. No more "all jungle champions get high score" problem
 * 4. 大幅降低紧急度，避免分数过高
 */
function calculateRoleVacancyV2(champion: Champion, roleStatus: RoleFillStatus): number {
  // If all roles are definitely filled, no vacancy
  if (roleStatus.vacant.length === 0) return 0;

  // Check which of champion's positions are still available
  const availablePositions = champion.positions.filter(pos =>
    !roleStatus.definitelyFilled.has(pos)
  );

  // CRITICAL: If champion has no available positions, exclude completely
  if (availablePositions.length === 0) {
    return 0;  // This champion is irrelevant now
  }

  // For single-position champions that are still available
  if (champion.positions.length === 1) {
    const position = champion.positions[0];

    // If this position is definitely vacant, moderate urgency
    if (roleStatus.vacant.includes(position)) {
      // 大幅降低紧急度：使用更平缓的增长
      // 5个位置: 0.35, 4个: 0.42, 3个: 0.49, 2个: 0.56, 1个: 0.63
      const urgency = 0.35 + (5 - roleStatus.vacant.length) * 0.07;
      return Math.min(0.63, urgency);  // 最高不超过0.63
    }

    // If position is possibly filled (by flex pick), low urgency
    if (roleStatus.possiblyFilled.has(position)) {
      const urgency = 0.25 - (roleStatus.vacant.length - 1) * 0.03;
      return Math.max(0.10, urgency);
    }

    return 0;
  }

  // For multi-position champions (flex picks)
  // Calculate weighted score based on available positions
  let totalScore = 0;
  let positionCount = 0;

  for (const position of availablePositions) {
    if (roleStatus.vacant.includes(position)) {
      // This position is definitely vacant
      // 大幅降低紧急度
      const urgency = 0.35 + (5 - roleStatus.vacant.length) * 0.07;
      totalScore += Math.min(0.63, urgency);
      positionCount++;
    } else if (roleStatus.possiblyFilled.has(position)) {
      // This position might be filled by another flex pick
      const urgency = 0.25 - (roleStatus.vacant.length - 1) * 0.03;
      totalScore += Math.max(0.10, urgency);
      positionCount++;
    }
  }

  if (positionCount === 0) return 0;

  // Average score across available positions
  // Bonus for flexibility: more positions = slightly higher value
  const avgScore = totalScore / positionCount;
  const flexBonus = Math.min(availablePositions.length / 8, 0.10);  // 进一步降低灵活性加成

  return Math.min(0.70, avgScore + flexBonus);  // 最高不超过0.70
}

/**
 * Calculate role vacancy signal (V1: Legacy - kept for reference)
 * @deprecated Use calculateRoleVacancyV2 instead
 */
function calculateRoleVacancy(champion: Champion, remainingRoles: Position[]): number {
  if (remainingRoles.length === 0) return 0;

  // Check if champion can fill any remaining role
  const canFillRole = champion.positions.some(pos => remainingRoles.includes(pos));

  if (!canFillRole) return 0;

  // Higher urgency if fewer roles remain
  // 5 roles remaining: 0.2, 1 role remaining: 1.0
  const urgencyMultiplier = 1.0 - (remainingRoles.length - 1) * 0.2;

  return Math.min(1, urgencyMultiplier);
}

/**
 * Calculate champion pool frequency
 * Now uses real pick rate data from professional matches
 */
function calculateChampionPoolFrequency(champion: Champion): number {
  if (!dataAnalyzer) {
    // Fallback to heuristic
    return calculateMetaPresence(champion) * 0.8;
  }

  const stats = dataAnalyzer.getChampionStats(champion.name);
  if (!stats || stats.pickCount < 5) {
    // Not enough data, use meta presence as fallback
    return calculateMetaPresence(champion) * 0.8;
  }

  // Debug specific champions
  const debugChampions = ['Lucian', 'Tristana', 'Yone'];
  if (typeof window === 'undefined' && debugChampions.includes(champion.name)) {
    console.log(`[POOL DEBUG] ${champion.name}: pickRate=${stats.pickRate.toFixed(6)}, scaled(×5)=${(Math.min(1.0, stats.pickRate * 5)).toFixed(6)}`);
  }

  // Use actual pick rate from professional matches
  // 使用适度缩放（×3）保持合理范围，同时保留区分度
  // pickRate 通常在 0.05-0.25 之间，×3 后在 0.15-0.75 之间
  return Math.min(1.0, stats.pickRate * 3.0);
}

/**
 * Calculate global meta presence
 * Now uses real pick/ban rate data from professional matches
 */
function calculateMetaPresence(champion: Champion): number {
  if (!dataAnalyzer) {
    // Fallback to heuristic based on flexibility
    // More flexible champions (can play multiple roles) are generally more meta
    const flexibilityScore = Math.min(champion.positions.length / 3, 1.0);
    // Add some variance based on champion name hash to avoid all champions having same score
    const nameHash = champion.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const variance = (nameHash % 20) / 100; // 0-0.19 variance
    return Math.min(1.0, 0.4 + (flexibilityScore * 0.3) + variance);
  }

  const stats = dataAnalyzer.getChampionStats(champion.name);

  // Debug specific champions
  const debugChampions = ['Lucian', 'Tristana', 'Yone'];
  if (typeof window === 'undefined' && debugChampions.includes(champion.name)) {
    console.log(`[META DEBUG] ${champion.name}:`, stats ? {
      pickCount: stats.pickCount,
      banCount: stats.banCount,
      pickRate: stats.pickRate.toFixed(6),
      banRate: stats.banRate.toFixed(6),
      presence: stats.presence.toFixed(6),
      'scaled(×2.5)': (Math.min(1.0, stats.presence * 2.5)).toFixed(6)
    } : 'NO STATS');
  }

  if (!stats) {
    // No data, use neutral value with some variance
    const nameHash = champion.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const variance = (nameHash % 20) / 100;
    return 0.4 + variance;
  }

  // Presence = (picks + bans) / total games
  // This is the best indicator of meta relevance
  // 使用适度缩放（×1.5）保持合理范围，同时保留区分度
  // presence 通常在 0.1-0.6 之间，×1.5 后在 0.15-0.9 之间
  return Math.min(1.0, stats.presence * 1.5);
}

/**
 * Calculate synergy ban signal
 * Did opponent ban champions that typically pair with this one?
 * Now uses real synergy data from professional matches
 */
function calculateSynergyBanSignal(
  draftState: DraftState,
  champion: Champion,
  opponent: Team
): number {
  const opponentBans = opponent === 'blue' ? draftState.blueBans : draftState.redBans;

  if (opponentBans.length === 0) {
    return 0.2; // Base value when no bans
  }

  if (!dataAnalyzer) {
    // Fallback: simple heuristic based on ban count
    const banCount = opponentBans.filter(ban => ban !== null).length;
    if (banCount >= 3) return 0.6;
    if (banCount >= 2) return 0.4;
    return 0.2;
  }

  // Use real synergy data
  let totalSynergyScore = 0;
  let bannedSynergyCount = 0;

  for (const bannedChamp of opponentBans) {
    if (!bannedChamp) continue;

    const synergyScore = dataAnalyzer.getSynergyScore(champion.name, bannedChamp.name);

    // Only count if there's a meaningful synergy (> 0.52 means positive synergy)
    if (synergyScore > 0.52) {
      totalSynergyScore += (synergyScore - 0.5) * 2; // Normalize to 0-1
      bannedSynergyCount++;
    }
  }

  if (bannedSynergyCount === 0) {
    return 0.2; // No synergy partners banned
  }

  // Average synergy score, weighted by number of banned synergy partners
  const avgSynergy = totalSynergyScore / bannedSynergyCount;
  const countBonus = Math.min(bannedSynergyCount / 3, 1.0); // More bans = stronger signal

  return Math.min(1.0, 0.2 + avgSynergy * 0.6 * countBonus);
}

/**
 * Calculate LossSeverity: How bad is it if we don't get this champion?
 * Returns value between 0-1 with category breakdown
 * Now considers synergies with our team and counters against enemy team
 *
 * @param action - 'ban' or 'pick' - affects strategicDenial calculation
 */
function calculateLossSeverity(
  draftState: DraftState,
  champion: Champion,
  config: PTSConfig,
  action: ActionType,
  opponentModel?: OpponentModel  // 新增：对手模型
): LossSeverityBreakdown {
  const ourSide = draftState.side;
  const ourRoles = ourSide === 'blue'
    ? draftState.blueRemainingRoles
    : draftState.redRemainingRoles;
  const ourPicks = ourSide === 'blue'
    ? draftState.bluePicks
    : draftState.redPicks;
  const enemyPicks = ourSide === 'blue'
    ? draftState.redPicks
    : draftState.bluePicks;

  // Category 1: Role Collapse
  // Losing this champion forces us into suboptimal role fill
  const roleCollapse = calculateRoleCollapse(champion, ourRoles);

  // Category 2: Composition Lock
  // Losing this champion locks us into predictable composition
  const compositionLock = calculateCompositionLock(champion, ourPicks, ourRoles);

  // Category 3: Strategic Denial (phase-aware)
  // Ban: Opponent picking this denies our win condition + strengthens their comp
  // Pick: We lose synergy with our team + counter potential against enemy
  let strategicDenial = calculateStrategicDenial(champion, ourPicks, enemyPicks, action);

  // 新增：对手阵容威胁调整
  if (opponentModel && opponentModel.observedPicks.length > 0) {
    const { calculateCounterThreat } = require('./counter-threat');
    const counterThreat = calculateCounterThreat(champion, opponentModel.observedPicks);

    // 如果对手已选英雄counter这个英雄，威胁更高（最多增加20%）
    strategicDenial *= (1 + counterThreat * 0.2);

    if (typeof window === 'undefined' && counterThreat > 0.2) {
      console.log(`[PTS] ${champion.name}: 对手阵容威胁 ${(counterThreat * 100).toFixed(1)}%`);
    }
  }

  // Determine primary category
  const categories = [
    { name: 'role_collapse' as LossSeverityCategory, value: roleCollapse },
    { name: 'composition_lock' as LossSeverityCategory, value: compositionLock },
    { name: 'strategic_denial' as LossSeverityCategory, value: strategicDenial },
  ];
  const primaryCategory = categories.reduce((max, cat) =>
    cat.value > max.value ? cat : max
  ).name;

  // Weighted combination
  const total =
    roleCollapse * config.roleCollapseWeight +
    compositionLock * config.compositionLockWeight +
    strategicDenial * config.strategicDenialWeight;

  return {
    roleCollapse,
    compositionLock,
    strategicDenial,
    total: Math.min(1, Math.max(0, total)),
    primaryCategory,
  };
}

/**
 * Calculate role collapse severity
 * High if this is one of few champions that can fill a critical role
 */
function calculateRoleCollapse(champion: Champion, ourRoles: Position[]): number {
  if (ourRoles.length === 0) return 0;

  // Check if champion can fill any of our remaining roles
  const canFillRoles = champion.positions.filter(pos => ourRoles.includes(pos));

  if (canFillRoles.length === 0) return 0;

  // Critical if we have few roles left and this champion is flexible
  const roleUrgency = 1.0 - (ourRoles.length - 1) * 0.2;
  const flexibilityValue = Math.min(canFillRoles.length / 2, 1.0);

  return Math.min(1, roleUrgency * flexibilityValue);
}

/**
 * Check if two positions should consider synergy
 * Based on actual in-game interaction patterns
 */
function shouldConsiderSynergy(position1: Position, position2: Position): boolean {
  const synergyRules: Record<Position, Position[]> = {
    'top': [],                              // Top: 不考虑协同
    'mid': ['support', 'jungle'],           // Mid: 考虑 support 和 jungle
    'jungle': ['bot'],                      // Jungle: 考虑 ADC
    'bot': ['jungle', 'support'],           // ADC: 考虑 jungle 和 support
    'support': ['mid', 'jungle', 'bot'],    // Support: 考虑 mid, jungle 和 ADC
  };

  // Check if position2 is in position1's synergy list
  return synergyRules[position1]?.includes(position2) || false;
}

/**
 * Get the primary position of a champion
 * Returns the first position if multiple positions exist
 */
function getPrimaryPosition(champion: Champion): Position | null {
  if (!champion.positions || champion.positions.length === 0) {
    return null;
  }
  return champion.positions[0];
}

/**
 * Calculate strategic denial severity (Phase-Aware)
 * Now uses real synergy and counter data from professional matches
 * With position-based synergy rules
 *
 * Ban阶段：重点关注对手协同 + Counter我方
 * Pick阶段：重点关注我方协同 + Counter对手
 */
function calculateStrategicDenial(
  champion: Champion,
  ourPicks: (Champion | null)[],
  enemyPicks: (Champion | null)[],
  action: ActionType
): number {
  const pickedChampions = ourPicks.filter((p): p is Champion => p !== null);
  const enemyChampions = enemyPicks.filter((p): p is Champion => p !== null);

  // 早期没有已选英雄时，使用英雄的通用战略价值
  if (pickedChampions.length === 0 && enemyChampions.length === 0) {
    if (!dataAnalyzer) {
      return 0.3; // Fallback
    }

    // 使用英雄的 winRate 作为通用战略价值的代理
    const stats = dataAnalyzer.getChampionStats(champion.name);
    if (!stats || stats.pickCount < 10) {
      return 0.3; // 数据不足时使用默认值
    }

    // winRate 在 0.45-0.55 之间，映射到 0.2-0.4
    // 高胜率英雄有更高的战略价值
    const winRateValue = (stats.winRate - 0.45) * 2; // 0.45->0, 0.55->0.2
    return Math.max(0.2, Math.min(0.4, 0.3 + winRateValue));
  }

  const championPosition = getPrimaryPosition(champion);

  if (action === 'ban') {
    // Ban阶段：评估对手拿到这个英雄的威胁
    return calculateBanThreat(champion, championPosition, pickedChampions, enemyChampions);
  } else {
    // Pick阶段：评估我方拿到这个英雄的价值
    return calculatePickValue(champion, championPosition, pickedChampions, enemyChampions);
  }
}

/**
 * Calculate ban threat: 对手拿到这个英雄对我方的威胁
 * 重点：对手协同 + Counter我方
 */
function calculateBanThreat(
  champion: Champion,
  championPosition: Position | null,
  ourPicks: Champion[],
  enemyPicks: Champion[]
): number {
  let opponentSynergyScore = 0;
  let counterToUsScore = 0;

  if (!dataAnalyzer || !championPosition) {
    // Fallback: 基于灵活性的启发式
    const flexibilityScore = Math.min(champion.positions.length / 3, 1.0);
    return Math.min(1, 0.4 + (flexibilityScore * 0.4));
  }

  // 1. 计算与对手已选英雄的协同度
  if (enemyPicks.length > 0) {
    let totalSynergy = 0;
    let count = 0;

    for (const enemyChamp of enemyPicks) {
      const enemyPosition = getPrimaryPosition(enemyChamp);
      if (enemyPosition && shouldConsiderSynergy(championPosition, enemyPosition)) {
        const synergy = dataAnalyzer.getSynergyScore(champion.name, enemyChamp.name);
        if (synergy !== 0.5) {
          totalSynergy += synergy;
          count++;
        }
      }
    }

    if (count > 0) {
      const avgSynergy = totalSynergy / count;
      opponentSynergyScore = (avgSynergy - 0.5) * 2; // 转换到0-1范围
    }
  }

  // 2. 计算Counter我方已选英雄的程度
  if (ourPicks.length > 0) {
    let totalCounter = 0;
    let count = 0;

    for (const ourChamp of ourPicks) {
      // 注意：这里是champion counter ourChamp
      const counter = dataAnalyzer.getCounterScore(champion.name, ourChamp.name);
      if (counter !== 0.5) {
        totalCounter += counter;
        count++;
      }
    }

    if (count > 0) {
      const avgCounter = totalCounter / count;
      counterToUsScore = (avgCounter - 0.5) * 2; // >0.5表示counter我方
    }
  }

  // Ban阶段权重：对手协同40% + Counter我方60%
  const threatScore = opponentSynergyScore * 0.4 + counterToUsScore * 0.6;
  // 大幅降低增长范围，避免后期膨胀：从0.3-1.0降低到0.3-0.55
  return Math.min(0.55, Math.max(0.3, 0.3 + threatScore * 0.25));
}

/**
 * Calculate pick value: 我方拿到这个英雄的价值
 * 重点：我方协同 + Counter对手
 */
function calculatePickValue(
  champion: Champion,
  championPosition: Position | null,
  ourPicks: Champion[],
  enemyPicks: Champion[]
): number {
  let ourSynergyScore = 0;
  let counterToOpponentScore = 0;

  if (!dataAnalyzer || !championPosition) {
    // Fallback: 基于灵活性的启发式
    const flexibilityScore = Math.min(champion.positions.length / 3, 1.0);
    return Math.min(1, 0.4 + (flexibilityScore * 0.4));
  }

  // 1. 计算与我方已选英雄的协同度
  if (ourPicks.length > 0) {
    let totalSynergy = 0;
    let count = 0;

    for (const ourChamp of ourPicks) {
      const ourChampPosition = getPrimaryPosition(ourChamp);
      if (ourChampPosition && shouldConsiderSynergy(championPosition, ourChampPosition)) {
        const synergy = dataAnalyzer.getSynergyScore(champion.name, ourChamp.name);
        if (synergy !== 0.5) {
          totalSynergy += synergy;
          count++;
        }
      }
    }

    if (count > 0) {
      const avgSynergy = totalSynergy / count;
      ourSynergyScore = (avgSynergy - 0.5) * 2; // 转换到0-1范围
    }
  }

  // 2. 计算Counter对手已选英雄的程度
  if (enemyPicks.length > 0) {
    let totalCounter = 0;
    let count = 0;

    for (const enemyChamp of enemyPicks) {
      // 注意：这里是champion counter enemyChamp
      const counter = dataAnalyzer.getCounterScore(champion.name, enemyChamp.name);
      if (counter !== 0.5) {
        totalCounter += counter;
        count++;
      }
    }

    if (count > 0) {
      const avgCounter = totalCounter / count;
      counterToOpponentScore = (avgCounter - 0.5) * 2; // >0.5表示counter对手
    }
  }

  // Pick阶段权重：我方协同60% + Counter对手40%
  const valueScore = ourSynergyScore * 0.6 + counterToOpponentScore * 0.4;
  // 大幅降低增长范围，避免后期膨胀：从0.3-1.0降低到0.3-0.55
  return Math.min(0.55, Math.max(0.3, 0.3 + valueScore * 0.25));
}

/**
 * Calculate composition lock severity
 * Now considers real synergy patterns with position-based rules
 */
function calculateCompositionLock(
  champion: Champion,
  ourPicks: (Champion | null)[],
  ourRoles: Position[]
): number {
  const pickedChampions = ourPicks.filter((p): p is Champion => p !== null);
  const pickedCount = pickedChampions.length;

  // Early picks have more flexibility, later picks get locked
  const lockProgression = 0.2 + (pickedCount * 0.2);

  // Get the primary position of the champion being evaluated
  const championPosition = getPrimaryPosition(champion);

  // Check if this champion has strong synergies with our current picks (with position rules)
  let hasSynergy = false;
  if (dataAnalyzer && pickedChampions.length > 0 && championPosition) {
    for (const ourChamp of pickedChampions) {
      const ourChampPosition = getPrimaryPosition(ourChamp);

      // Only consider synergy if positions should interact
      if (ourChampPosition && shouldConsiderSynergy(championPosition, ourChampPosition)) {
        const synergy = dataAnalyzer.getSynergyScore(champion.name, ourChamp.name);
        if (synergy > 0.55) { // Above average synergy
          hasSynergy = true;
          console.log(`[PTS] Composition lock: ${champion.name} (${championPosition}) has strong synergy with ${ourChamp.name} (${ourChampPosition}): ${synergy.toFixed(3)}`);
          break;
        }
      }
    }
  }

  // If champion has strong synergy, losing it is more severe
  const synergyMultiplier = hasSynergy ? 1.3 : 1.0;

  // Flexible champions reduce lock-in risk
  const flexibilityPenalty = 1.0 - (champion.positions.length * 0.15);

  return Math.min(1, lockProgression * Math.max(0.3, flexibilityPenalty) * synergyMultiplier);
}

/**
 * Determine risk tier based on PTS score
 */
function determineRiskTier(
  pts: number,
  config: PTSConfig
): 'critical' | 'high' | 'moderate' | 'low' {
  if (pts >= config.criticalThreshold) return 'critical';
  if (pts >= config.highThreshold) return 'high';
  if (pts >= config.moderateThreshold) return 'moderate';
  return 'low';
}

/**
 * Generate natural language explanation with dynamic context and real data
 */
function generateExplanation(
  champion: Champion,
  pickLikelihood: { total: number; signals: PickLikelihoodSignals },
  lossSeverity: LossSeverityBreakdown,
  riskTier: string
): string {
  const parts: string[] = [];

  // Risk tier statement with urgency
  if (riskTier === 'critical') {
    parts.push('🔴 CRITICAL:');
  } else if (riskTier === 'high') {
    parts.push('🟠 HIGH RISK:');
  } else if (riskTier === 'moderate') {
    parts.push('🟡 MODERATE:');
  }

  // Build detailed threat analysis
  const threats: string[] = [];

  // Get real stats if available
  let realStats = null;
  if (dataAnalyzer) {
    realStats = dataAnalyzer.getChampionStats(champion.name);
  }

  // Opponent role vacancy analysis
  if (pickLikelihood.signals.opponentRoleVacancy > 0.7) {
    threats.push('opponent urgently needs this role');
  } else if (pickLikelihood.signals.opponentRoleVacancy > 0.4) {
    threats.push('opponent can use this role');
  }

  // Meta presence analysis with real data
  if (realStats && realStats.presence > 0.15) {
    const presencePercent = Math.round(realStats.presence * 100);
    threats.push(`${presencePercent}% presence in pro play`);
  } else if (pickLikelihood.signals.globalMetaPresence > 0.75) {
    threats.push('S-tier meta pick');
  } else if (pickLikelihood.signals.globalMetaPresence > 0.6) {
    threats.push('strong meta presence');
  }

  // Win rate analysis with real data
  if (realStats && realStats.pickCount >= 10) {
    const winRatePercent = Math.round(realStats.winRate * 100);
    if (winRatePercent >= 55) {
      threats.push(`${winRatePercent}% win rate`);
    }
  }

  if (threats.length > 0) {
    parts.push(threats.join(', ') + '.');
  }

  // Build detailed loss severity analysis
  const losses: string[] = [];

  // Role collapse analysis
  if (lossSeverity.roleCollapse > 0.7) {
    losses.push('losing this severely limits our role options');
  } else if (lossSeverity.roleCollapse > 0.4) {
    losses.push('reduces our role flexibility');
  }

  // Composition lock analysis with synergy info
  if (lossSeverity.compositionLock > 0.7) {
    losses.push('has strong synergy with our comp');
  } else if (lossSeverity.compositionLock > 0.4) {
    losses.push('limits our draft flexibility');
  }

  // Strategic denial analysis with specific reasons
  if (lossSeverity.strategicDenial > 0.7) {
    losses.push('key counter pick or synergy piece');
  } else if (lossSeverity.strategicDenial > 0.5) {
    losses.push('valuable for our strategy');
  }

  if (losses.length > 0) {
    parts.push(losses.join(', ') + '.');
  }

  // Urgency statement based on risk tier
  if (riskTier === 'critical') {
    parts.push('⚡ ACT NOW - window closing!');
  } else if (riskTier === 'high') {
    parts.push('⏰ High priority - consider immediately.');
  } else if (riskTier === 'moderate') {
    parts.push('Keep on radar.');
  }

  // If no specific reasons, provide generic explanation with data
  if (parts.length <= 1) {
    if (realStats && realStats.pickCount >= 5) {
      parts.push(`Picked ${realStats.pickCount} times, ${Math.round(realStats.winRate * 100)}% WR.`);
    } else {
      parts.push(`Balanced threat (${Math.round(pickLikelihood.total * 100)}% pick likelihood).`);
    }
  }

  return parts.join(' ');
}

/**
 * Get top N champions by PTS
 */
export function getTopPTSChampions(
  draftState: DraftState,
  availableChampions: Champion[],
  topN: number = 5,
  config: PTSConfig = DEFAULT_PTS_CONFIG
): PTSResult[] {
  const allResults = calculatePTS(draftState, availableChampions, config);
  return allResults.slice(0, topN);
}
