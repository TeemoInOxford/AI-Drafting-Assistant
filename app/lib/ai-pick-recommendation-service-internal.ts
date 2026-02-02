/**
 * AI Pick Recommendation Service - Internal
 * 内部使用的辅助函数，用于从 L1 评估数据构建 AI 输入
 */

import { DraftState } from './v4/types/common-types';
import { Champion, Position } from './types';
import { AIPickReasonInput } from './ai-pick-reason-prompt';
import { AggregatedScore } from './v4/l2-recommendation/score-aggregator';
import { L1ChampionEvaluation } from './v4/types/l1-types';

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
 * 从DraftState和评估数据构建AIPickReasonInput
 */
export function buildPickReasonInput(
  draftState: DraftState,
  champion: Champion,
  aggregatedScore: AggregatedScore,
  l1Evaluation: L1ChampionEvaluation
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

  // 从L1评估数据中提取战术评分
  const synergyScore = Math.round(l1Evaluation.synergy.overallSynergy * 100);
  const counterScore = Math.round(l1Evaluation.counter.counterPotential * 100);
  const metaStrength = Math.round(aggregatedScore.breakdown.pts.score * 100);
  const roleMatch = Math.round(l1Evaluation.pts.breakdown.roleVacancy.score * 100);

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
