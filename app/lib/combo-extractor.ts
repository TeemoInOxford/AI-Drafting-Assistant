/**
 * Combo Extractor
 * 组合提取器 - 从比赛数据中提取英雄组合和协同关系
 */

import {
  ChampionCombo,
  SystemDiscoveryConfig,
  DEFAULT_SYSTEM_DISCOVERY_CONFIG,
} from './system-discovery.types';
import { MatchData } from './counter-relationship.types';
import { Position } from './types';

/**
 * 组合提取器类
 */
export class ComboExtractor {
  private config: SystemDiscoveryConfig;

  constructor(config?: Partial<SystemDiscoveryConfig>) {
    this.config = {
      ...DEFAULT_SYSTEM_DISCOVERY_CONFIG,
      ...config,
    };
  }

  /**
   * 从比赛数据中提取所有英雄组合
   */
  extractCombos(matches: MatchData[]): ChampionCombo[] {
    console.log(`[ComboExtractor] 提取组合，共 ${matches.length} 场比赛`);

    // 过滤时间窗口
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.timeWindow.recentDays);
    const recentMatches = matches.filter(m => m.date >= cutoffDate);

    console.log(`[ComboExtractor] 过滤后剩余 ${recentMatches.length} 场最近比赛`);

    // 统计所有组合
    const comboMap = new Map<string, {
      champions: string[];
      pickCount: number;
      winCount: number;
      positions: Set<Position>;
    }>();

    for (const match of recentMatches) {
      // 提取蓝方组合
      this.extractTeamCombos(
        match.blueSide.picks.map(p => p.championId),
        match.blueSide.picks.map(p => p.position),
        match.winner === 'blue',
        comboMap
      );

      // 提取红方组合
      this.extractTeamCombos(
        match.redSide.picks.map(p => p.championId),
        match.redSide.picks.map(p => p.position),
        match.winner === 'red',
        comboMap
      );
    }

    // 转换为ChampionCombo数组
    const combos: ChampionCombo[] = [];

    for (const [key, data] of comboMap.entries()) {
      const winRate = data.pickCount > 0 ? data.winCount / data.pickCount : 0;

      // 过滤：最小出现次数和胜率
      if (
        data.pickCount >= this.config.minPickCount &&
        winRate >= this.config.minWinRate
      ) {
        // 计算协同分数
        const synergyScore = this.calculateSynergyScore(
          data.champions,
          data.pickCount,
          winRate
        );

        // 过滤：最小协同分数
        if (synergyScore >= this.config.minSynergyScore) {
          combos.push({
            champions: data.champions,
            pickCount: data.pickCount,
            winCount: data.winCount,
            winRate,
            synergyScore,
            positions: Array.from(data.positions),
          });
        }
      }
    }

    // 按胜率和出现次数排序
    combos.sort((a, b) => {
      const scoreA = a.winRate * 0.6 + (a.pickCount / recentMatches.length) * 0.4;
      const scoreB = b.winRate * 0.6 + (b.pickCount / recentMatches.length) * 0.4;
      return scoreB - scoreA;
    });

    console.log(`[ComboExtractor] 提取到 ${combos.length} 个有效组合`);

    return combos;
  }

  /**
   * 从单个队伍提取组合
   */
  private extractTeamCombos(
    champions: string[],
    positions: Position[],
    won: boolean,
    comboMap: Map<string, any>
  ): void {
    // 生成所有可能的组合（2-5个英雄）
    for (let size = this.config.minComboSize; size <= Math.min(this.config.maxComboSize, champions.length); size++) {
      const combinations = this.generateCombinations(champions, size);

      for (const combo of combinations) {
        // 排序以确保一致性
        const sortedCombo = [...combo].sort();
        const key = sortedCombo.join('|');

        if (!comboMap.has(key)) {
          comboMap.set(key, {
            champions: sortedCombo,
            pickCount: 0,
            winCount: 0,
            positions: new Set<Position>(),
          });
        }

        const data = comboMap.get(key)!;
        data.pickCount++;
        if (won) {
          data.winCount++;
        }

        // 记录位置
        for (let i = 0; i < champions.length; i++) {
          if (combo.includes(champions[i])) {
            data.positions.add(positions[i]);
          }
        }
      }
    }
  }

  /**
   * 生成组合
   */
  private generateCombinations<T>(array: T[], size: number): T[][] {
    if (size === 0) return [[]];
    if (size > array.length) return [];

    const result: T[][] = [];

    const combine = (start: number, current: T[]) => {
      if (current.length === size) {
        result.push([...current]);
        return;
      }

      for (let i = start; i < array.length; i++) {
        current.push(array[i]);
        combine(i + 1, current);
        current.pop();
      }
    };

    combine(0, []);
    return result;
  }

  /**
   * 计算协同分数
   */
  private calculateSynergyScore(
    champions: string[],
    pickCount: number,
    winRate: number
  ): number {
    // 基础分数：胜率
    let score = winRate;

    // 出现频率加成
    const frequencyBonus = Math.min(pickCount / 100, 0.1);
    score += frequencyBonus;

    // 组合大小惩罚（大组合更难协同）
    const sizePenalty = (champions.length - 2) * 0.05;
    score -= sizePenalty;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * 计算两个组合的相似度
   */
  calculateSimilarity(combo1: string[], combo2: string[]): number {
    const set1 = new Set(combo1);
    const set2 = new Set(combo2);

    // Jaccard相似度
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * 过滤重叠组合
   * 如果两个组合高度重叠，只保留更强的那个
   */
  filterOverlappingCombos(combos: ChampionCombo[], threshold: number = 0.8): ChampionCombo[] {
    const filtered: ChampionCombo[] = [];
    const used = new Set<number>();

    // 按分数排序
    const sorted = [...combos].sort((a, b) => {
      const scoreA = a.winRate * a.synergyScore;
      const scoreB = b.winRate * b.synergyScore;
      return scoreB - scoreA;
    });

    for (let i = 0; i < sorted.length; i++) {
      if (used.has(i)) continue;

      const combo1 = sorted[i];
      filtered.push(combo1);
      used.add(i);

      // 标记高度重叠的组合
      for (let j = i + 1; j < sorted.length; j++) {
        if (used.has(j)) continue;

        const combo2 = sorted[j];
        const similarity = this.calculateSimilarity(combo1.champions, combo2.champions);

        if (similarity >= threshold) {
          used.add(j);
        }
      }
    }

    console.log(`[ComboExtractor] 过滤重叠组合: ${combos.length} -> ${filtered.length}`);

    return filtered;
  }

  /**
   * 按组合大小分组
   */
  groupBySize(combos: ChampionCombo[]): Map<number, ChampionCombo[]> {
    const groups = new Map<number, ChampionCombo[]>();

    for (const combo of combos) {
      const size = combo.champions.length;
      if (!groups.has(size)) {
        groups.set(size, []);
      }
      groups.get(size)!.push(combo);
    }

    return groups;
  }

  /**
   * 查找包含特定英雄的组合
   */
  findCombosWithChampion(combos: ChampionCombo[], championId: string): ChampionCombo[] {
    return combos.filter(combo => combo.champions.includes(championId));
  }

  /**
   * 查找核心组合（2-3个英雄）
   */
  findCoreCombos(combos: ChampionCombo[]): ChampionCombo[] {
    return combos.filter(combo =>
      combo.champions.length >= 2 &&
      combo.champions.length <= 3 &&
      combo.synergyScore >= 0.60
    );
  }

  /**
   * 扩展核心组合
   * 找到与核心组合协同的其他英雄
   */
  expandCoreCombo(
    coreCombo: ChampionCombo,
    allCombos: ChampionCombo[]
  ): string[] {
    const coreSet = new Set(coreCombo.champions);
    const expansionCandidates = new Map<string, number>();

    // 查找包含核心组合的更大组合
    for (const combo of allCombos) {
      if (combo.champions.length <= coreCombo.champions.length) continue;

      // 检查是否包含所有核心英雄
      const containsAll = coreCombo.champions.every(c => combo.champions.includes(c));

      if (containsAll) {
        // 找出额外的英雄
        for (const champion of combo.champions) {
          if (!coreSet.has(champion)) {
            const score = combo.winRate * combo.synergyScore;
            expansionCandidates.set(
              champion,
              (expansionCandidates.get(champion) || 0) + score
            );
          }
        }
      }
    }

    // 按分数排序，返回Top 3
    const sorted = Array.from(expansionCandidates.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([champion, _]) => champion);

    return sorted;
  }
}

/**
 * 全局组合提取器实例
 */
let globalExtractor: ComboExtractor | null = null;

/**
 * 获取全局组合提取器
 */
export function getComboExtractor(config?: Partial<SystemDiscoveryConfig>): ComboExtractor {
  if (!globalExtractor) {
    globalExtractor = new ComboExtractor(config);
  }
  return globalExtractor;
}
