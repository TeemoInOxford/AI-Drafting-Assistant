/**
 * PTS优化效果验证脚本
 *
 * 用于验证PTS分数在BP各阶段的波动是否合理
 */

import { calculatePTS, bpStateToDraftState, OPTIMIZED_PTS_CONFIG, DEFAULT_PTS_CONFIG } from '../app/lib/pts-engine';
import { BPState, BPStep, Champion, Position } from '../app/lib/types';

// 模拟英雄数据
const mockChampions: Champion[] = [
  {
    id: 'Aatrox',
    key: '266',
    name: 'Aatrox',
    image: '',
    positions: ['top'],
    tags: ['Fighter']
  },
  {
    id: 'Ahri',
    key: '103',
    name: 'Ahri',
    image: '',
    positions: ['mid'],
    tags: ['Mage', 'Assassin']
  },
  {
    id: 'Sejuani',
    key: '113',
    name: 'Sejuani',
    image: '',
    positions: ['jungle', 'top'],
    tags: ['Tank']
  },
  {
    id: 'Jinx',
    key: '222',
    name: 'Jinx',
    image: '',
    positions: ['bot'],
    tags: ['Marksman']
  },
  {
    id: 'Thresh',
    key: '412',
    name: 'Thresh',
    image: '',
    positions: ['support'],
    tags: ['Support']
  }
];

// 创建模拟BP状态
function createMockBPState(step: number): BPState {
  const bluePicks: (Champion | null)[] = [null, null, null, null, null];
  const redPicks: (Champion | null)[] = [null, null, null, null, null];

  // 根据步骤填充picks
  if (step >= 7) {
    bluePicks[0] = mockChampions[0]; // Aatrox top
  }
  if (step >= 8) {
    redPicks[0] = mockChampions[1]; // Ahri mid
  }
  if (step >= 9) {
    redPicks[1] = mockChampions[2]; // Sejuani jungle
  }
  if (step >= 10) {
    bluePicks[1] = mockChampions[3]; // Jinx bot
  }
  if (step >= 13) {
    bluePicks[2] = mockChampions[4]; // Thresh support
  }

  return {
    currentStep: step,
    blueBans: Array(5).fill({ champion: null }),
    redBans: Array(5).fill({ champion: null }),
    bluePicks,
    redPicks,
    usedChampions: new Set(),
    history: []
  };
}

// 测试函数
function testPTSOptimization() {
  console.log('========================================');
  console.log('PTS优化效果验证');
  console.log('========================================\n');

  const testSteps = [
    { step: 1, action: 'ban' as const, description: '早期Ban阶段' },
    { step: 7, action: 'pick' as const, description: '早期Pick阶段' },
    { step: 10, action: 'pick' as const, description: '中期Pick阶段' },
    { step: 15, action: 'pick' as const, description: '后期Pick阶段' },
    { step: 19, action: 'pick' as const, description: '最后Pick阶段' }
  ];

  for (const { step, action, description } of testSteps) {
    console.log(`\n${description} (Step ${step})`);
    console.log('----------------------------------------');

    const bpState = createMockBPState(step);
    const currentStep: BPStep = {
      team: 'blue',
      action,
      index: 0
    };

    const draftState = bpStateToDraftState(bpState, currentStep, 'blue');

    // 使用优化配置计算
    const resultsOptimized = calculatePTS(draftState, mockChampions, OPTIMIZED_PTS_CONFIG);

    // 使用默认配置计算（对比）
    const resultsDefault = calculatePTS(draftState, mockChampions, DEFAULT_PTS_CONFIG);

    console.log('\n优化配置结果:');
    resultsOptimized.slice(0, 3).forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.championName.padEnd(12)} PTS: ${r.pts.toFixed(1).padStart(5)} | 等级: ${r.riskTier}`);
    });

    console.log('\n默认配置结果（对比）:');
    resultsDefault.slice(0, 3).forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.championName.padEnd(12)} PTS: ${r.pts.toFixed(1).padStart(5)} | 等级: ${r.riskTier}`);
    });

    // 计算平均分和波动
    const avgOptimized = resultsOptimized.reduce((sum, r) => sum + r.pts, 0) / resultsOptimized.length;
    const avgDefault = resultsDefault.reduce((sum, r) => sum + r.pts, 0) / resultsDefault.length;

    console.log(`\n平均PTS: 优化=${avgOptimized.toFixed(1)} | 默认=${avgDefault.toFixed(1)}`);
  }

  console.log('\n========================================');
  console.log('验证完成');
  console.log('========================================');
}

// 运行测试
testPTSOptimization();
