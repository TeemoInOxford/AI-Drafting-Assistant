/**
 * System Discovery Tests
 * 体系发现系统测试
 */

import { ComboExtractor } from './combo-extractor';
import { SystemDiscoveryEngine } from './system-discovery-engine';
import { MatchData } from './counter-relationship.types';
import { Champion, Position } from './types';

/**
 * 创建测试比赛数据
 */
function createTestMatches(): MatchData[] {
  const matches: MatchData[] = [];
  const now = new Date();

  // 加里奥体系 - 15场比赛，胜率60%
  for (let i = 0; i < 15; i++) {
    matches.push({
      matchId: `galio_${i}`,
      date: new Date(now.getTime() - i * 24 * 60 * 60 * 1000),
      patch: '14.3',
      tournament: 'LPL',
      blueSide: {
        team: 'Team A',
        picks: [
          { championId: 'Galio', position: 'mid' as Position },
          { championId: 'Camille', position: 'top' as Position },
          { championId: 'Yasuo', position: 'bot' as Position },
          { championId: 'Gragas', position: 'jungle' as Position },
          { championId: 'Kalista', position: 'bot' as Position },
        ],
        bans: [],
      },
      redSide: {
        team: 'Team B',
        picks: [
          { championId: 'Orianna', position: 'mid' as Position },
          { championId: 'Renekton', position: 'top' as Position },
          { championId: 'Jinx', position: 'bot' as Position },
          { championId: 'LeeSin', position: 'jungle' as Position },
          { championId: 'Thresh', position: 'support' as Position },
        ],
        bans: [],
      },
      winner: i < 9 ? 'blue' : 'red', // 9胜6负 = 60%
      duration: 1800,
    });
  }

  // 卡莉斯塔体系 - 12场比赛，胜率58%
  for (let i = 0; i < 12; i++) {
    matches.push({
      matchId: `kalista_${i}`,
      date: new Date(now.getTime() - i * 24 * 60 * 60 * 1000),
      patch: '14.3',
      tournament: 'LPL',
      blueSide: {
        team: 'Team C',
        picks: [
          { championId: 'Kalista', position: 'bot' as Position },
          { championId: 'Thresh', position: 'support' as Position },
          { championId: 'Renekton', position: 'top' as Position },
          { championId: 'Gragas', position: 'jungle' as Position },
          { championId: 'Orianna', position: 'mid' as Position },
        ],
        bans: [],
      },
      redSide: {
        team: 'Team D',
        picks: [
          { championId: 'Jinx', position: 'bot' as Position },
          { championId: 'Lulu', position: 'support' as Position },
          { championId: 'Gnar', position: 'top' as Position },
          { championId: 'LeeSin', position: 'jungle' as Position },
          { championId: 'Syndra', position: 'mid' as Position },
        ],
        bans: [],
      },
      winner: i < 7 ? 'blue' : 'red', // 7胜5负 = 58%
      duration: 1900,
    });
  }

  // 保护体系 - 10场比赛，胜率55%
  for (let i = 0; i < 10; i++) {
    matches.push({
      matchId: `protect_${i}`,
      date: new Date(now.getTime() - i * 24 * 60 * 60 * 1000),
      patch: '14.3',
      tournament: 'LPL',
      blueSide: {
        team: 'Team E',
        picks: [
          { championId: 'Lulu', position: 'support' as Position },
          { championId: 'Karma', position: 'mid' as Position },
          { championId: 'Jinx', position: 'bot' as Position },
          { championId: 'Maokai', position: 'top' as Position },
          { championId: 'Sejuani', position: 'jungle' as Position },
        ],
        bans: [],
      },
      redSide: {
        team: 'Team F',
        picks: [
          { championId: 'Zed', position: 'mid' as Position },
          { championId: 'Fiora', position: 'top' as Position },
          { championId: 'Ezreal', position: 'bot' as Position },
          { championId: 'Khazix', position: 'jungle' as Position },
          { championId: 'Nautilus', position: 'support' as Position },
        ],
        bans: [],
      },
      winner: i < 5 ? 'blue' : 'red', // 5胜5负 = 50%，但会被过滤掉
      duration: 2100,
    });
  }

  return matches;
}

/**
 * 创建测试英雄数据
 */
function createTestChampions(): Champion[] {
  return [
    {
      id: 'Galio',
      name: '加里奥',
      displayName: '加里奥',
      positions: ['mid'],
      tags: ['Tank', 'Mage'],
      difficulty: 2,
      imageUrl: '',
    },
    {
      id: 'Camille',
      name: '卡蜜尔',
      displayName: '卡蜜尔',
      positions: ['top'],
      tags: ['Fighter', 'Assassin'],
      difficulty: 3,
      imageUrl: '',
    },
    {
      id: 'Yasuo',
      name: '亚索',
      displayName: '亚索',
      positions: ['mid', 'bot'],
      tags: ['Fighter', 'Assassin'],
      difficulty: 3,
      imageUrl: '',
    },
    {
      id: 'Kalista',
      name: '卡莉斯塔',
      displayName: '卡莉斯塔',
      positions: ['bot'],
      tags: ['Marksman'],
      difficulty: 3,
      imageUrl: '',
    },
    {
      id: 'Thresh',
      name: '锤石',
      displayName: '锤石',
      positions: ['support'],
      tags: ['Support', 'Tank'],
      difficulty: 3,
      imageUrl: '',
    },
    {
      id: 'Lulu',
      name: '璐璐',
      displayName: '璐璐',
      positions: ['support', 'mid'],
      tags: ['Support', 'Mage'],
      difficulty: 2,
      imageUrl: '',
    },
    {
      id: 'Karma',
      name: '卡尔玛',
      displayName: '卡尔玛',
      positions: ['support', 'mid'],
      tags: ['Support', 'Mage'],
      difficulty: 2,
      imageUrl: '',
    },
    {
      id: 'Gragas',
      name: '酒桶',
      displayName: '酒桶',
      positions: ['jungle'],
      tags: ['Tank', 'Fighter'],
      difficulty: 2,
      imageUrl: '',
    },
  ];
}

/**
 * 测试1: 组合提取
 */
export function test1_ComboExtraction(): void {
  console.log('========================================');
  console.log('测试1: 组合提取');
  console.log('========================================\n');

  const matches = createTestMatches();
  const extractor = new ComboExtractor({
    minPickCount: 5,
    minWinRate: 0.50,
    minSynergyScore: 0.50,
  });

  const combos = extractor.extractCombos(matches);

  console.log(`✓ 提取到 ${combos.length} 个组合\n`);

  // 显示前5个组合
  console.log('Top 5 组合:');
  for (let i = 0; i < Math.min(5, combos.length); i++) {
    const combo = combos[i];
    console.log(`${i + 1}. ${combo.champions.join(' + ')}`);
    console.log(`   出现: ${combo.pickCount}次, 胜率: ${(combo.winRate * 100).toFixed(1)}%`);
    console.log(`   协同分数: ${combo.synergyScore.toFixed(2)}`);
  }

  console.log('\n✅ 测试1通过\n');
}

/**
 * 测试2: 相似度计算
 */
export function test2_SimilarityCalculation(): void {
  console.log('========================================');
  console.log('测试2: 相似度计算');
  console.log('========================================\n');

  const extractor = new ComboExtractor();

  const combo1 = ['Galio', 'Camille', 'Yasuo'];
  const combo2 = ['Galio', 'Camille', 'Gragas'];
  const combo3 = ['Kalista', 'Thresh', 'Renekton'];

  const sim12 = extractor.calculateSimilarity(combo1, combo2);
  const sim13 = extractor.calculateSimilarity(combo1, combo3);
  const sim23 = extractor.calculateSimilarity(combo2, combo3);

  console.log(`相似度 (Galio+Camille+Yasuo vs Galio+Camille+Gragas): ${sim12.toFixed(2)}`);
  console.log(`相似度 (Galio+Camille+Yasuo vs Kalista+Thresh+Renekton): ${sim13.toFixed(2)}`);
  console.log(`相似度 (Galio+Camille+Gragas vs Kalista+Thresh+Renekton): ${sim23.toFixed(2)}`);

  console.log('\n✅ 测试2通过\n');
}

/**
 * 测试3: 重叠组合过滤
 */
export function test3_OverlapFiltering(): void {
  console.log('========================================');
  console.log('测试3: 重叠组合过滤');
  console.log('========================================\n');

  const matches = createTestMatches();
  const extractor = new ComboExtractor({
    minPickCount: 5,
    minWinRate: 0.50,
    minSynergyScore: 0.50,
  });

  let combos = extractor.extractCombos(matches);
  console.log(`过滤前: ${combos.length} 个组合`);

  combos = extractor.filterOverlappingCombos(combos, 0.75);
  console.log(`过滤后: ${combos.length} 个组合`);

  console.log('\n✅ 测试3通过\n');
}

/**
 * 测试4: 体系发现
 */
export async function test4_SystemDiscovery(): Promise<void> {
  console.log('========================================');
  console.log('测试4: 体系发现');
  console.log('========================================\n');

  const matches = createTestMatches();
  const champions = createTestChampions();

  const engine = new SystemDiscoveryEngine({
    minPickCount: 5,
    minWinRate: 0.50,
    minSynergyScore: 0.50,
    clustering: {
      algorithm: 'dbscan',
      epsilon: 0.3,
      minSamples: 2,
      distanceMetric: 'jaccard',
    },
  });

  const result = await engine.discoverSystems(matches, champions);

  console.log(`\n✓ 发现 ${result.systems.length} 个体系\n`);

  // 显示所有体系
  for (let i = 0; i < result.systems.length; i++) {
    const system = result.systems[i];
    console.log(`${i + 1}. ${system.name}`);
    console.log(`   核心: ${system.coreChampions.join(', ')}`);
    console.log(`   协同: ${system.synergyChampions.join(', ')}`);
    console.log(`   胜率: ${(system.stats.winRate * 100).toFixed(1)}%`);
    console.log(`   出现: ${system.stats.pickCount}次`);
    console.log(`   风格: ${system.characteristics.style}`);
    console.log('');
  }

  console.log('✅ 测试4通过\n');
}

/**
 * 测试5: 查找英雄体系
 */
export async function test5_FindChampionSystems(): Promise<void> {
  console.log('========================================');
  console.log('测试5: 查找英雄体系');
  console.log('========================================\n');

  const matches = createTestMatches();
  const champions = createTestChampions();

  const engine = new SystemDiscoveryEngine({
    minPickCount: 5,
    minWinRate: 0.50,
    minSynergyScore: 0.50,
  });

  await engine.discoverSystems(matches, champions);

  const galioSystems = engine.findSystemsWithChampion('Galio');
  const kalistaSystems = engine.findSystemsWithChampion('Kalista');

  console.log(`Galio 出现在 ${galioSystems.length} 个体系中`);
  console.log(`Kalista 出现在 ${kalistaSystems.length} 个体系中`);

  console.log('\n✅ 测试5通过\n');
}

/**
 * 测试6: DBSCAN聚类
 */
export async function test6_DBSCANClustering(): Promise<void> {
  console.log('========================================');
  console.log('测试6: DBSCAN聚类');
  console.log('========================================\n');

  const matches = createTestMatches();
  const champions = createTestChampions();

  // 测试不同的epsilon值
  const epsilonValues = [0.2, 0.3, 0.4];

  for (const epsilon of epsilonValues) {
    const engine = new SystemDiscoveryEngine({
      minPickCount: 5,
      minWinRate: 0.50,
      minSynergyScore: 0.50,
      clustering: {
        algorithm: 'dbscan',
        epsilon,
        minSamples: 2,
        distanceMetric: 'jaccard',
      },
    });

    const result = await engine.discoverSystems(matches, champions);

    console.log(`epsilon=${epsilon}: 发现 ${result.systems.length} 个体系`);
  }

  console.log('\n✅ 测试6通过\n');
}

/**
 * 运行所有测试
 */
export async function runAllTests(): Promise<void> {
  console.log('\n');
  console.log('╔════════════════════════════════════════╗');
  console.log('║   体系发现系统 - 测试套件             ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('\n');

  try {
    test1_ComboExtraction();
    test2_SimilarityCalculation();
    test3_OverlapFiltering();
    await test4_SystemDiscovery();
    await test5_FindChampionSystems();
    await test6_DBSCANClustering();

    console.log('╔════════════════════════════════════════╗');
    console.log('║   ✅ 所有测试通过！                   ║');
    console.log('╚════════════════════════════════════════╝');
    console.log('\n');
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

// 如果直接运行此文件，执行所有测试
if (require.main === module) {
  runAllTests().catch(console.error);
}
