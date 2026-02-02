/**
 * System Discovery Usage Example
 * 体系发现系统使用示例
 */

import { discoverSystemsFromMatches, getSystemDiscoveryEngine } from './system-discovery-engine';
import { updateDynamicSystems } from './advanced-ban-scoring';
import { MatchData } from './counter-relationship.types';
import { Champion } from './types';

/**
 * 示例1: 基础使用 - 发现体系并更新Ban推荐
 */
export async function example1_BasicUsage(
  matches: MatchData[],
  allChampions: Champion[]
): Promise<void> {
  console.log('========================================');
  console.log('示例1: 基础使用');
  console.log('========================================\n');

  // 1. 发现体系
  const result = await discoverSystemsFromMatches(matches, allChampions, {
    minPickCount: 10,
    minWinRate: 0.52,
    minSynergyScore: 0.55,
  });

  console.log(`\n发现 ${result.systems.length} 个体系\n`);

  // 2. 显示前5个体系
  for (let i = 0; i < Math.min(5, result.systems.length); i++) {
    const system = result.systems[i];
    console.log(`${i + 1}. ${system.name}`);
    console.log(`   核心英雄: ${system.coreChampions.join(', ')}`);
    console.log(`   胜率: ${(system.stats.winRate * 100).toFixed(1)}%`);
    console.log(`   出现率: ${(system.stats.pickRate * 100).toFixed(1)}%`);
    console.log(`   风格: ${system.characteristics.style}`);
    console.log(`   强势期: ${system.characteristics.phase}`);
    console.log('');
  }

  // 3. 更新Ban推荐系统
  updateDynamicSystems(result.systems);

  console.log('✅ Ban推荐系统已更新\n');
}

/**
 * 示例2: 高级配置 - 严格的体系发现
 */
export async function example2_StrictDiscovery(
  matches: MatchData[],
  allChampions: Champion[]
): Promise<void> {
  console.log('========================================');
  console.log('示例2: 严格的体系发现');
  console.log('========================================\n');

  const engine = getSystemDiscoveryEngine({
    minComboSize: 2,
    maxComboSize: 4,
    minPickCount: 20,        // 更高的出现次数要求
    minWinRate: 0.55,        // 更高的胜率要求
    minSynergyScore: 0.60,   // 更高的协同分数要求
    clustering: {
      algorithm: 'dbscan',
      epsilon: 0.25,         // 更严格的聚类
      minSamples: 5,
      distanceMetric: 'jaccard',
    },
    timeWindow: {
      recentDays: 60,        // 只看最近60天
      minDaysActive: 10,
    },
  });

  const result = await engine.discoverSystems(matches, allChampions);

  console.log(`\n发现 ${result.systems.length} 个高质量体系\n`);

  // 显示统计信息
  console.log('统计信息:');
  console.log(`  平均体系大小: ${result.statistics.avgSystemSize.toFixed(1)}`);
  console.log(`  平均胜率: ${(result.statistics.avgWinRate * 100).toFixed(1)}%`);
  console.log(`  平均协同分数: ${result.statistics.avgSynergyScore.toFixed(2)}`);
  console.log('');
}

/**
 * 示例3: 查找特定英雄的体系
 */
export async function example3_FindChampionSystems(
  matches: MatchData[],
  allChampions: Champion[],
  championId: string
): Promise<void> {
  console.log('========================================');
  console.log(`示例3: 查找 ${championId} 的体系`);
  console.log('========================================\n');

  const engine = getSystemDiscoveryEngine();
  await engine.discoverSystems(matches, allChampions);

  const systems = engine.findSystemsWithChampion(championId);

  console.log(`${championId} 出现在 ${systems.length} 个体系中:\n`);

  for (const system of systems) {
    const isCore = system.coreChampions.includes(championId);
    const role = isCore ? '核心' : '协同';

    console.log(`${system.name} (${role})`);
    console.log(`  核心: ${system.coreChampions.join(', ')}`);
    console.log(`  胜率: ${(system.stats.winRate * 100).toFixed(1)}%`);
    console.log('');
  }
}

/**
 * 示例4: 定期更新 - 每周自动发现
 */
export async function example4_WeeklyUpdate(
  loadRecentMatches: (days: number) => Promise<MatchData[]>,
  allChampions: Champion[]
): Promise<void> {
  console.log('========================================');
  console.log('示例4: 每周自动更新');
  console.log('========================================\n');

  // 加载最近30天的比赛
  const matches = await loadRecentMatches(30);

  console.log(`加载了 ${matches.length} 场比赛`);

  if (matches.length < 100) {
    console.log('⚠️  数据不足（需要至少100场），跳过本次更新');
    return;
  }

  // 发现体系
  const result = await discoverSystemsFromMatches(matches, allChampions);

  // 过滤高质量体系
  const highQualitySystems = result.systems.filter(
    system => system.stats.winRate >= 0.53 && system.confidence >= 0.7
  );

  console.log(`\n发现 ${result.systems.length} 个体系`);
  console.log(`其中 ${highQualitySystems.length} 个高质量体系\n`);

  // 更新Ban推荐
  updateDynamicSystems(highQualitySystems);

  console.log('✅ 每周更新完成\n');

  // 显示新兴体系（状态为 emerging 或 rising）
  const emergingSystems = highQualitySystems.filter(
    s => s.lifecycle.status === 'emerging' || s.lifecycle.status === 'rising'
  );

  if (emergingSystems.length > 0) {
    console.log('🔥 新兴体系:');
    for (const system of emergingSystems) {
      console.log(`  - ${system.name} (${system.lifecycle.status})`);
    }
    console.log('');
  }
}

/**
 * 示例5: 版本对比 - 分析体系变化
 */
export async function example5_PatchComparison(
  matches: MatchData[],
  allChampions: Champion[],
  patch1: string,
  patch2: string
): Promise<void> {
  console.log('========================================');
  console.log(`示例5: 版本对比 ${patch1} vs ${patch2}`);
  console.log('========================================\n');

  // 分别提取两个版本的比赛
  const matches1 = matches.filter(m => m.patch === patch1);
  const matches2 = matches.filter(m => m.patch === patch2);

  console.log(`${patch1}: ${matches1.length} 场比赛`);
  console.log(`${patch2}: ${matches2.length} 场比赛\n`);

  // 发现体系
  const result1 = await discoverSystemsFromMatches(matches1, allChampions);
  const result2 = await discoverSystemsFromMatches(matches2, allChampions);

  console.log(`${patch1}: ${result1.systems.length} 个体系`);
  console.log(`${patch2}: ${result2.systems.length} 个体系\n`);

  // 找出新兴体系
  const newSystems = result2.systems.filter(
    s2 => !result1.systems.some(s1 => s1.id === s2.id)
  );

  // 找出消失的体系
  const obsoleteSystems = result1.systems.filter(
    s1 => !result2.systems.some(s2 => s2.id === s1.id)
  );

  if (newSystems.length > 0) {
    console.log('🆕 新兴体系:');
    for (const system of newSystems) {
      console.log(`  - ${system.name}`);
      console.log(`    核心: ${system.coreChampions.join(', ')}`);
      console.log(`    胜率: ${(system.stats.winRate * 100).toFixed(1)}%`);
    }
    console.log('');
  }

  if (obsoleteSystems.length > 0) {
    console.log('📉 消失的体系:');
    for (const system of obsoleteSystems) {
      console.log(`  - ${system.name}`);
    }
    console.log('');
  }

  // 找出持续存在的体系
  const persistentSystems = result2.systems.filter(
    s2 => result1.systems.some(s1 => s1.id === s2.id)
  );

  console.log(`📊 持续存在: ${persistentSystems.length} 个体系\n`);
}

/**
 * 示例6: 体系推荐 - 根据已选英雄推荐
 */
export async function example6_SystemRecommendation(
  matches: MatchData[],
  allChampions: Champion[],
  pickedChampions: string[]
): Promise<void> {
  console.log('========================================');
  console.log('示例6: 体系推荐');
  console.log('========================================\n');

  console.log(`已选英雄: ${pickedChampions.join(', ')}\n`);

  // 发现体系
  const engine = getSystemDiscoveryEngine();
  const result = await engine.discoverSystems(matches, allChampions);

  // 计算匹配度
  const recommendations: Array<{
    system: typeof result.systems[0];
    matchScore: number;
    missingChampions: string[];
  }> = [];

  for (const system of result.systems) {
    const pickedSet = new Set(pickedChampions);
    const coreSet = new Set(system.coreChampions);

    const intersection = [...pickedSet].filter(c => coreSet.has(c));
    const matchScore = intersection.length / system.coreChampions.length;

    if (matchScore > 0) {
      const missingChampions = system.coreChampions.filter(c => !pickedSet.has(c));

      recommendations.push({
        system,
        matchScore,
        missingChampions,
      });
    }
  }

  // 按匹配度排序
  recommendations.sort((a, b) => {
    // 优先考虑匹配度，其次考虑胜率
    const scoreA = a.matchScore * 0.7 + a.system.stats.winRate * 0.3;
    const scoreB = b.matchScore * 0.7 + b.system.stats.winRate * 0.3;
    return scoreB - scoreA;
  });

  console.log('推荐体系:\n');

  for (let i = 0; i < Math.min(5, recommendations.length); i++) {
    const rec = recommendations[i];
    const matchPercent = (rec.matchScore * 100).toFixed(0);

    console.log(`${i + 1}. ${rec.system.name} (匹配度: ${matchPercent}%)`);
    console.log(`   核心英雄: ${rec.system.coreChampions.join(', ')}`);
    console.log(`   胜率: ${(rec.system.stats.winRate * 100).toFixed(1)}%`);
    console.log(`   还需要: ${rec.missingChampions.join(', ')}`);
    console.log('');
  }
}

/**
 * 示例7: 完整工作流 - 从数据加载到Ban推荐更新
 */
export async function example7_CompleteWorkflow(
  loadMatches: () => Promise<MatchData[]>,
  loadChampions: () => Promise<Champion[]>
): Promise<void> {
  console.log('========================================');
  console.log('示例7: 完整工作流');
  console.log('========================================\n');

  // Step 1: 加载数据
  console.log('[1/4] 加载数据...');
  const matches = await loadMatches();
  const allChampions = await loadChampions();
  console.log(`  ✓ 加载了 ${matches.length} 场比赛`);
  console.log(`  ✓ 加载了 ${allChampions.length} 个英雄\n`);

  // Step 2: 发现体系
  console.log('[2/4] 发现体系...');
  const result = await discoverSystemsFromMatches(matches, allChampions, {
    minPickCount: 12,
    minWinRate: 0.52,
    minSynergyScore: 0.56,
  });
  console.log(`  ✓ 发现 ${result.systems.length} 个体系\n`);

  // Step 3: 过滤高质量体系
  console.log('[3/4] 过滤高质量体系...');
  const highQualitySystems = result.systems.filter(
    system =>
      system.stats.winRate >= 0.53 &&
      system.confidence >= 0.6 &&
      system.stats.pickCount >= 15
  );
  console.log(`  ✓ 筛选出 ${highQualitySystems.length} 个高质量体系\n`);

  // Step 4: 更新Ban推荐
  console.log('[4/4] 更新Ban推荐系统...');
  updateDynamicSystems(highQualitySystems);
  console.log(`  ✓ 已更新 ${highQualitySystems.length} 个动态体系\n`);

  // 显示摘要
  console.log('========================================');
  console.log('摘要');
  console.log('========================================');
  console.log(`总体系数: ${result.systems.length}`);
  console.log(`高质量体系: ${highQualitySystems.length}`);
  console.log(`平均胜率: ${(result.statistics.avgWinRate * 100).toFixed(1)}%`);
  console.log(`平均协同分数: ${result.statistics.avgSynergyScore.toFixed(2)}`);
  console.log('');

  // 显示Top 3体系
  console.log('Top 3 体系:');
  for (let i = 0; i < Math.min(3, highQualitySystems.length); i++) {
    const system = highQualitySystems[i];
    console.log(`  ${i + 1}. ${system.name}`);
    console.log(`     核心: ${system.coreChampions.join(', ')}`);
    console.log(`     胜率: ${(system.stats.winRate * 100).toFixed(1)}%`);
  }
  console.log('');

  console.log('✅ 完整工作流执行完成！\n');
}
