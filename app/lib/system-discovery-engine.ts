/**
 * System Discovery Engine
 * 体系自动发现引擎 - 完整实现
 */

import {
  DiscoveredSystem,
  SystemDiscoveryConfig,
  SystemDiscoveryResult,
  ChampionCombo,
  ClusterResult,
  SystemStyle,
  GamePhase,
  SystemStatus,
  DEFAULT_SYSTEM_DISCOVERY_CONFIG,
} from './system-discovery.types';
import { MatchData } from './counter-relationship.types';
import { Champion, Position } from './types';
import { getComboExtractor } from './combo-extractor';

/**
 * 体系发现引擎类
 */
export class SystemDiscoveryEngine {
  private config: SystemDiscoveryConfig;
  private discoveredSystems: Map<string, DiscoveredSystem> = new Map();

  constructor(config?: Partial<SystemDiscoveryConfig>) {
    this.config = {
      ...DEFAULT_SYSTEM_DISCOVERY_CONFIG,
      ...config,
    };
  }

  /**
   * 发现体系（主函数）
   */
  async discoverSystems(
    matches: MatchData[],
    allChampions: Champion[]
  ): Promise<SystemDiscoveryResult> {
    console.log('========================================');
    console.log('体系自动发现开始');
    console.log('========================================');

    // 1. 提取英雄组合
    console.log('\n[Step 1/4] 提取英雄组合...');
    const extractor = getComboExtractor(this.config);
    let combos = extractor.extractCombos(matches);
    console.log(`提取到 ${combos.length} 个组合`);

    // 2. 过滤重叠组合
    console.log('\n[Step 2/4] 过滤重叠组合...');
    combos = extractor.filterOverlappingCombos(combos, 0.75);

    // 3. 聚类分析
    console.log('\n[Step 3/4] 聚类分析...');
    const clusters = this.clusterCombos(combos);
    console.log(`发现 ${clusters.length} 个聚类`);

    // 4. 生成体系
    console.log('\n[Step 4/4] 生成体系...');
    const systems: DiscoveredSystem[] = [];

    for (const cluster of clusters) {
      const system = this.createSystemFromCluster(cluster, matches, allChampions);
      systems.push(system);
      this.discoveredSystems.set(system.id, system);
    }

    // 计算统计信息
    const avgSystemSize = systems.reduce((sum, s) => sum + s.coreChampions.length, 0) / systems.length;
    const avgWinRate = systems.reduce((sum, s) => sum + s.stats.winRate, 0) / systems.length;
    const avgSynergyScore = systems.reduce((sum, s) => sum + s.synergyScore, 0) / systems.length;

    // 计算日期范围
    const dates = matches.map(m => m.date.getTime());
    const dateRange = {
      start: new Date(Math.min(...dates)),
      end: new Date(Math.max(...dates)),
    };

    // 收集版本信息
    const patches = [...new Set(matches.map(m => m.patch))];

    console.log('\n========================================');
    console.log(`发现 ${systems.length} 个体系`);
    console.log('========================================');

    return {
      systems,
      metadata: {
        totalCombos: combos.length,
        filteredCombos: combos.length,
        clustersFound: clusters.length,
        dateRange,
        patches,
      },
      statistics: {
        avgSystemSize,
        avgWinRate,
        avgSynergyScore,
      },
    };
  }

  /**
   * DBSCAN聚类算法
   */
  private clusterCombos(combos: ChampionCombo[]): ClusterResult[] {
    const epsilon = this.config.clustering.epsilon;
    const minSamples = this.config.clustering.minSamples;

    const visited = new Set<number>();
    const clusters: ClusterResult[] = [];
    let clusterId = 0;

    for (let i = 0; i < combos.length; i++) {
      if (visited.has(i)) continue;

      visited.add(i);
      const neighbors = this.findNeighbors(i, combos, epsilon);

      if (neighbors.length < minSamples) {
        // 噪声点，跳过
        continue;
      }

      // 创建新聚类
      const clusterCombos: ChampionCombo[] = [combos[i]];
      const queue = [...neighbors];

      while (queue.length > 0) {
        const j = queue.shift()!;

        if (!visited.has(j)) {
          visited.add(j);
          const newNeighbors = this.findNeighbors(j, combos, epsilon);

          if (newNeighbors.length >= minSamples) {
            queue.push(...newNeighbors);
          }
        }

        // 添加到聚类
        if (!clusterCombos.some(c => this.isSameCombo(c, combos[j]))) {
          clusterCombos.push(combos[j]);
        }
      }

      // 计算聚类中心
      const centroid = this.calculateCentroid(clusterCombos);

      // 计算聚类统计
      const avgWinRate = clusterCombos.reduce((sum, c) => sum + c.winRate, 0) / clusterCombos.length;
      const avgSynergyScore = clusterCombos.reduce((sum, c) => sum + c.synergyScore, 0) / clusterCombos.length;

      clusters.push({
        clusterId: clusterId++,
        combos: clusterCombos,
        centroid,
        size: clusterCombos.length,
        avgWinRate,
        avgSynergyScore,
      });
    }

    return clusters;
  }

  /**
   * 查找邻居
   */
  private findNeighbors(index: number, combos: ChampionCombo[], epsilon: number): number[] {
    const neighbors: number[] = [];
    const combo = combos[index];

    for (let i = 0; i < combos.length; i++) {
      if (i === index) continue;

      const distance = this.calculateDistance(combo.champions, combos[i].champions);

      if (distance <= epsilon) {
        neighbors.push(i);
      }
    }

    return neighbors;
  }

  /**
   * 计算距离（Jaccard距离）
   */
  private calculateDistance(combo1: string[], combo2: string[]): number {
    const set1 = new Set(combo1);
    const set2 = new Set(combo2);

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    const jaccard = intersection.size / union.size;
    return 1 - jaccard; // Jaccard距离 = 1 - Jaccard相似度
  }

  /**
   * 判断是否是同一个组合
   */
  private isSameCombo(combo1: ChampionCombo, combo2: ChampionCombo): boolean {
    if (combo1.champions.length !== combo2.champions.length) return false;

    const set1 = new Set(combo1.champions);
    const set2 = new Set(combo2.champions);

    return combo1.champions.every(c => set2.has(c));
  }

  /**
   * 计算聚类中心（最具代表性的英雄）
   */
  private calculateCentroid(combos: ChampionCombo[]): string[] {
    // 统计每个英雄的出现频率
    const championFreq = new Map<string, number>();

    for (const combo of combos) {
      for (const champion of combo.champions) {
        championFreq.set(champion, (championFreq.get(champion) || 0) + 1);
      }
    }

    // 选择出现频率最高的2-3个英雄作为中心
    const sorted = Array.from(championFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([champion, _]) => champion);

    return sorted;
  }

  /**
   * 从聚类创建体系
   */
  private createSystemFromCluster(
    cluster: ClusterResult,
    matches: MatchData[],
    allChampions: Champion[]
  ): DiscoveredSystem {
    // 核心英雄
    const coreChampions = cluster.centroid;

    // 协同英雄（出现频率较高但不是核心的）
    const championFreq = new Map<string, number>();
    for (const combo of cluster.combos) {
      for (const champion of combo.champions) {
        if (!coreChampions.includes(champion)) {
          championFreq.set(champion, (championFreq.get(champion) || 0) + 1);
        }
      }
    }

    const synergyChampions = Array.from(championFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([champion, _]) => champion);

    // 统计数据
    const pickCount = cluster.combos.reduce((sum, c) => sum + c.pickCount, 0);
    const winCount = cluster.combos.reduce((sum, c) => sum + c.winCount, 0);
    const winRate = pickCount > 0 ? winCount / pickCount : 0;
    const pickRate = pickCount / matches.length;

    // 计算平均游戏时长（简化）
    const avgGameDuration = 1800; // 默认30分钟

    // 体系特征
    const characteristics = this.analyzeCharacteristics(coreChampions, allChampions);

    // 生命周期
    const lifecycle = this.analyzeLifecycle(cluster.combos, matches);

    // 版本信息
    const patches = [...new Set(matches.map(m => m.patch))];
    const dominantPatch = patches[patches.length - 1]; // 最新版本

    // 生成ID和名称
    const id = this.generateSystemId(coreChampions);
    const name = this.generateSystemName(coreChampions, characteristics.style, allChampions);

    return {
      id,
      name,
      displayName: name,
      coreChampions,
      synergyChampions,
      stats: {
        pickCount,
        winCount,
        winRate,
        pickRate,
        avgGameDuration,
      },
      synergyScore: cluster.avgSynergyScore,
      confidence: Math.min(pickCount / 50, 1.0),
      characteristics,
      lifecycle,
      patches,
      dominantPatch,
      discoveredAt: new Date(),
      lastUpdated: new Date(),
    };
  }

  /**
   * 分析体系特征
   */
  private analyzeCharacteristics(
    champions: string[],
    allChampions: Champion[]
  ): DiscoveredSystem['characteristics'] {
    const championObjects = champions
      .map(id => allChampions.find(c => c.id === id))
      .filter(c => c !== undefined) as Champion[];

    // 分析位置
    const positions = [...new Set(championObjects.flatMap(c => c.positions))];

    // 分析标签
    const tags = [...new Set(championObjects.flatMap(c => c.tags))];

    // 推断风格
    const style = this.inferStyle(championObjects);

    // 推断强势期
    const phase = this.inferPhase(championObjects);

    return {
      style,
      phase,
      positions,
      tags,
    };
  }

  /**
   * 推断体系风格
   */
  private inferStyle(champions: Champion[]): SystemStyle {
    const tags = champions.flatMap(c => c.tags);

    // 简化的风格推断
    const tankCount = tags.filter(t => t === 'Tank').length;
    const assassinCount = tags.filter(t => t === 'Assassin').length;
    const supportCount = tags.filter(t => t === 'Support').length;
    const marksmanCount = tags.filter(t => t === 'Marksman').length;

    if (supportCount >= 2) return 'protect';
    if (assassinCount >= 2) return 'pick';
    if (tankCount >= 2) return 'teamfight';
    if (marksmanCount >= 1 && supportCount >= 1) return 'protect';

    return 'mixed';
  }

  /**
   * 推断强势期
   */
  private inferPhase(champions: Champion[]): GamePhase {
    // 简化：基于英雄类型推断
    const tags = champions.flatMap(c => c.tags);

    const earlyChamps = tags.filter(t => t === 'Assassin' || t === 'Fighter').length;
    const lateChamps = tags.filter(t => t === 'Marksman' || t === 'Mage').length;

    if (earlyChamps > lateChamps) return 'early';
    if (lateChamps > earlyChamps) return 'late';

    return 'mid';
  }

  /**
   * 分析生命周期
   */
  private analyzeLifecycle(
    combos: ChampionCombo[],
    matches: MatchData[]
  ): DiscoveredSystem['lifecycle'] {
    // 简化：使用当前时间
    const now = new Date();

    return {
      firstSeen: now,
      lastSeen: now,
      peakDate: now,
      status: 'emerging',
      trendScore: 0.5,
    };
  }

  /**
   * 生成体系ID
   */
  private generateSystemId(champions: string[]): string {
    return champions.sort().join('_');
  }

  /**
   * 生成体系名称
   */
  private generateSystemName(
    champions: string[],
    style: SystemStyle,
    allChampions: Champion[]
  ): string {
    if (this.config.naming.strategy === 'core_champion') {
      // 使用核心英雄命名
      const coreChampion = allChampions.find(c => c.id === champions[0]);
      const name = coreChampion?.name || champions[0];
      return `${name}体系`;
    } else if (this.config.naming.strategy === 'style_based') {
      // 使用风格命名
      const styleNames: Record<SystemStyle, string> = {
        poke: '消耗流',
        engage: '开团流',
        split_push: '分推流',
        protect: '保护流',
        pick: '抓人流',
        teamfight: '团战流',
        early_game: '前期流',
        late_game: '后期流',
        global: '全图流',
        siege: '推进流',
        mixed: '混合流',
      };
      return styleNames[style];
    }

    return `体系_${champions[0]}`;
  }

  /**
   * 获取已发现的体系
   */
  getDiscoveredSystems(): DiscoveredSystem[] {
    return Array.from(this.discoveredSystems.values());
  }

  /**
   * 根据ID获取体系
   */
  getSystemById(id: string): DiscoveredSystem | undefined {
    return this.discoveredSystems.get(id);
  }

  /**
   * 查找包含特定英雄的体系
   */
  findSystemsWithChampion(championId: string): DiscoveredSystem[] {
    return this.getDiscoveredSystems().filter(system =>
      system.coreChampions.includes(championId) ||
      system.synergyChampions.includes(championId)
    );
  }
}

/**
 * 全局体系发现引擎实例
 */
let globalEngine: SystemDiscoveryEngine | null = null;

/**
 * 获取全局体系发现引擎
 */
export function getSystemDiscoveryEngine(
  config?: Partial<SystemDiscoveryConfig>
): SystemDiscoveryEngine {
  if (!globalEngine) {
    globalEngine = new SystemDiscoveryEngine(config);
  }
  return globalEngine;
}

/**
 * 便捷函数：发现体系
 */
export async function discoverSystemsFromMatches(
  matches: MatchData[],
  allChampions: Champion[],
  config?: Partial<SystemDiscoveryConfig>
): Promise<SystemDiscoveryResult> {
  const engine = getSystemDiscoveryEngine(config);
  return await engine.discoverSystems(matches, allChampions);
}
