/**
 * Opponent Style Bonus for PTS
 * 对手风格加成 - 根据对手类型调整英雄价值
 */

import { Champion, ChampionClass, OpponentType } from './types';

/**
 * 对手风格加成表
 * 根据对手类型，不同类型的英雄有不同的价值
 */
const OPPONENT_STYLE_BONUS: Record<OpponentType, Record<ChampionClass, number>> = {
  // 激进型对手：喜欢打架，前期强势
  // Counter策略：坦克、控制、保护
  aggressive: {
    Tank: 0.30,        // 坦克能承受伤害
    Support: 0.20,     // 辅助提供保护
    Controller: 0.20,  // 控制限制激进
    Mage: 0.10,        // 法师提供控制和伤害
    Fighter: 0.00,     // 战士中立
    Assassin: -0.10,   // 刺客容易被反杀
    Marksman: -0.05,   // ADC前期弱
  },

  // 防守型对手：喜欢拖后期，避免打架
  // Counter策略：突进、分推、全图流
  defensive: {
    Assassin: 0.30,    // 刺客能抓单
    Fighter: 0.20,     // 战士能分推
    Marksman: 0.10,    // ADC后期强
    Mage: 0.05,        // 法师提供poke
    Tank: -0.10,       // 坦克开团难
    Support: -0.05,    // 辅助效果一般
    Controller: 0.00,  // 控制中立
  },

  // Meta型对手：跟随版本强势英雄
  // Counter策略：Counter meta英雄
  meta_follower: {
    Tank: 0.10,
    Fighter: 0.10,
    Assassin: 0.10,
    Mage: 0.10,
    Marksman: 0.10,
    Support: 0.10,
    Controller: 0.10,
  },

  // 针对型对手：喜欢counter pick
  // Counter策略：灵活多位置英雄
  counter_focused: {
    Fighter: 0.15,     // 战士通常多位置
    Mage: 0.10,        // 法师有些多位置
    Assassin: 0.10,    // 刺客有些多位置
    Tank: 0.05,
    Marksman: 0.00,    // ADC通常单位置
    Support: 0.00,     // 辅助通常单位置
    Controller: 0.05,
  },

  // 摇摆型对手：喜欢多位置英雄
  // Counter策略：明确位置英雄，避免被摇摆
  flex_master: {
    Tank: 0.15,        // 坦克位置明确
    Marksman: 0.15,    // ADC位置明确
    Support: 0.15,     // 辅助位置明确
    Assassin: 0.05,
    Mage: 0.05,
    Fighter: 0.00,     // 战士容易被摇摆
    Controller: 0.10,
  },

  // 未知对手：无加成
  unknown: {
    Tank: 0,
    Fighter: 0,
    Assassin: 0,
    Mage: 0,
    Marksman: 0,
    Support: 0,
    Controller: 0,
  },
};

/**
 * 计算对手风格加成
 *
 * @param champion 英雄
 * @param opponentType 对手类型
 * @param confidence 信心度 (0-1)
 * @returns 加成系数 (0-0.3)，会乘以confidence
 */
export function calculateOpponentStyleBonus(
  champion: Champion,
  opponentType: OpponentType,
  confidence: number
): number {
  const bonusMap = OPPONENT_STYLE_BONUS[opponentType];
  let maxBonus = 0;

  // 根据英雄标签计算加成，取最大值
  for (const tag of champion.tags) {
    const bonus = bonusMap[tag] || 0;
    maxBonus = Math.max(maxBonus, bonus);
  }

  // 特殊处理：多位置英雄
  if (opponentType === 'counter_focused' && champion.positions.length > 1) {
    // 对抗针对型：多位置英雄更有价值
    maxBonus = Math.max(maxBonus, 0.25);
  }

  if (opponentType === 'flex_master' && champion.positions.length === 1) {
    // 对抗摇摆型：单位置英雄更有价值
    maxBonus = Math.max(maxBonus, 0.20);
  }

  // 根据信心度缩放
  return maxBonus * confidence;
}

/**
 * 获取对手类型的中文名称
 */
export function getOpponentTypeNameZh(type: OpponentType): string {
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

/**
 * 获取对手类型的描述
 */
export function getOpponentTypeDescription(type: OpponentType): string {
  const descriptions: Record<OpponentType, string> = {
    aggressive: '喜欢打架，前期强势',
    defensive: '喜欢拖后期，避免打架',
    meta_follower: '跟随版本强势英雄',
    counter_focused: '喜欢counter pick',
    flex_master: '喜欢多位置英雄',
    unknown: '对手信息不足',
  };
  return descriptions[type];
}
