/**
 * AI Pick Recommendation Service
 * 用于生成Pick阶段推荐原因的服务
 */

import { DraftState } from './v4/types/common-types';
import { Champion, Position } from './types';
import {
  AIPickReasonInput,
  generatePickReasonWithClaude,
  parsePickReasons,
} from './ai-pick-reason-prompt';

/**
 * Pick推荐结果
 */
export interface PickRecommendationResult {
  reasons: string[];
}

/**
 * Pick推荐服务配置
 */
export interface PickRecommendationConfig {
  apiKey: string;
  model?: string;
}

/**
 * 位置名称映射
 */
const POSITION_NAMES: Record<Position, string> = {
  top: '上单',
  jungle: '打野',
  mid: '中单',
  bot: 'ADC',
  support: '辅助',
};

/**
 * BP阶段名称映射
 */
const BP_PHASE_NAMES: Record<string, string> = {
  ban1: 'Ban阶段1',
  pick1: 'Pick阶段1',
  ban2: 'Ban阶段2',
  pick2: 'Pick阶段2',
};

/**
 * 从DraftState构建AIPickReasonInput
 */
function buildPickReasonInput(
  draftState: DraftState,
  champion: Champion
): AIPickReasonInput {
  const side = draftState.side;
  const isBlue = side === 'blue';

  // 获取我方和敌方的picks和bans
  const ourPicks = isBlue ? draftState.bluePicks : draftState.redPicks;
  const enemyPicks = isBlue ? draftState.redPicks : draftState.bluePicks;
  const ourBans = isBlue ? draftState.blueBans : draftState.redBans;
  const enemyBans = isBlue ? draftState.redBans : draftState.blueBans;
  const ourRemainingRoles = isBlue
    ? draftState.blueRemainingRoles
    : draftState.redRemainingRoles;
  const enemyRemainingRoles = isBlue
    ? draftState.redRemainingRoles
    : draftState.blueRemainingRoles;

  // 转换为中文名称
  const ourPicksText = ourPicks.length > 0 ? ourPicks.join('、') : '无';
  const enemyPicksText = enemyPicks.length > 0 ? enemyPicks.join('、') : '无';
  const ourBansText = ourBans.length > 0 ? ourBans.join('、') : '无';
  const enemyBansText = enemyBans.length > 0 ? enemyBans.join('、') : '无';
  const ourRemainingRolesText =
    ourRemainingRoles.length > 0
      ? ourRemainingRoles.map(r => POSITION_NAMES[r]).join('、')
      : '无';
  const enemyRemainingRolesText =
    enemyRemainingRoles.length > 0
      ? enemyRemainingRoles.map(r => POSITION_NAMES[r]).join('、')
      : '无';

  // 获取英雄位置
  const position = champion.positions[0];
  const positionName = POSITION_NAMES[position] || position;

  // 获取BP阶段名称
  const bpPhase = BP_PHASE_NAMES[draftState.phase] || draftState.phase;

  // 计算战术评分（简化版本，实际应该从L1评估层获取）
  // 这里使用占位符值，实际使用时应该传入真实的评估数据
  const synergyScore = calculateSynergyScore(champion, ourPicks);
  const counterScore = calculateCounterScore(champion, enemyPicks);
  const metaStrength = calculateMetaStrength(champion);
  const roleMatch = calculateRoleMatch(champion, ourRemainingRoles);

  return {
    championName: champion.name,
    positionName,
    bpPhase,
    ourPicks: ourPicksText,
    enemyPicks: enemyPicksText,
    ourBans: ourBansText,
    enemyBans: enemyBansText,
    ourRemainingRoles: ourRemainingRolesText,
    enemyRemainingRoles: enemyRemainingRolesText,
    synergyScore,
    counterScore,
    metaStrength,
    roleMatch,
  };
}

/**
 * 计算协同评分（简化版本）
 */
function calculateSynergyScore(champion: Champion, ourPicks: string[]): number {
  // 简化实现：如果我方已有picks，返回70分，否则返回50分
  if (ourPicks.length > 0) {
    return 70;
  }
  return 50;
}

/**
 * 计算克制评分（简化版本）
 */
function calculateCounterScore(champion: Champion, enemyPicks: string[]): number {
  // 简化实现：如果敌方已有picks，返回65分，否则返回50分
  if (enemyPicks.length > 0) {
    return 65;
  }
  return 50;
}

/**
 * 计算版本强度（简化版本）
 */
function calculateMetaStrength(champion: Champion): number {
  // 简化实现：返回固定值75分
  return 75;
}

/**
 * 计算位置适配度（简化版本）
 */
function calculateRoleMatch(
  champion: Champion,
  ourRemainingRoles: Position[]
): number {
  // 简化实现：如果英雄位置在剩余位置中，返回90分，否则返回40分
  const championPosition = champion.positions[0];
  if (ourRemainingRoles.includes(championPosition)) {
    return 90;
  }
  return 40;
}

/**
 * 生成Pick推荐原因
 */
export async function generatePickRecommendation(
  draftState: DraftState,
  champion: Champion,
  config: PickRecommendationConfig
): Promise<PickRecommendationResult> {
  try {
    // 构建输入数据
    const input = buildPickReasonInput(draftState, champion);

    // 调用Claude API
    const aiResponse = await generatePickReasonWithClaude(
      input,
      config.apiKey,
      config.model || 'claude-3-5-sonnet-20241022'
    );

    // 解析理由
    const reasons = parsePickReasons(aiResponse);

    return {
      reasons,
    };
  } catch (error) {
    console.error('[Pick Recommendation Service] Error:', error);
    throw error;
  }
}
