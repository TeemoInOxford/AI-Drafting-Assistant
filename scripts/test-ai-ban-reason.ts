/**
 * AI Ban Reason Generator - 测试脚本
 * 用于测试AI生成Ban理由功能
 */

import {
  AIBanReasonInput,
  fillBanReasonPrompt,
  generateBanReasonWithClaude,
} from '../app/lib/ai-ban-reason-prompt';

// 测试数据
const testData: AIBanReasonInput = {
  // 基础信息
  championName: 'Azir',
  positionName: '中单',
  playerName: 'Faker',

  // 熟练度数据
  proficiencyScore: 85,
  proficiencyStars: '⭐⭐⭐⭐⭐',
  usageRate: 78,
  isSignature: true,

  // 强度数据
  heroStrength: 76,
  metaTier: 'T0级',

  // 压缩数据
  compressionScore: 88,
  alternatives: '辛德拉、发条',

  // 战术数据
  systemCoreScore: 75,
  systemName: 'Poke体系',
  recencyScore: 82,
  targetingScore: 65,

  // 当前状态
  bpPhase: 'Ban阶段1',
  bannedChampions: '无',
};

async function testAIGeneration() {
  console.log('🧪 测试AI生成Ban理由功能\n');
  console.log('=' .repeat(80));

  // 1. 测试Prompt生成
  console.log('\n📝 步骤1: 生成Prompt');
  console.log('-'.repeat(80));
  const prompt = fillBanReasonPrompt(testData);
  console.log('✅ Prompt生成成功');
  console.log(`Prompt长度: ${prompt.length} 字符`);
  console.log(`预估tokens: ~${Math.ceil(prompt.length / 2.5)}`);

  // 2. 检查环境变量
  console.log('\n🔑 步骤2: 检查环境变量');
  console.log('-'.repeat(80));
  const apiKey = process.env.AI_BAN_REASON_API_KEY;
  const enabled = process.env.AI_BAN_REASON_ENABLED;
  const model = process.env.AI_BAN_REASON_MODEL || 'claude-3-5-sonnet-20241022';

  console.log(`AI_BAN_REASON_ENABLED: ${enabled}`);
  console.log(`AI_BAN_REASON_API_KEY: ${apiKey ? '✅ 已配置' : '❌ 未配置'}`);
  console.log(`AI_BAN_REASON_MODEL: ${model}`);

  if (!apiKey) {
    console.log('\n❌ 错误: API Key未配置');
    console.log('请在 .env.local 中设置 AI_BAN_REASON_API_KEY');
    return;
  }

  if (enabled !== 'true') {
    console.log('\n⚠️  警告: AI生成未启用');
    console.log('请在 .env.local 中设置 AI_BAN_REASON_ENABLED=true');
    console.log('继续测试（仅测试API调用）...\n');
  }

  // 3. 调用Claude API
  console.log('\n🤖 步骤3: 调用Claude API');
  console.log('-'.repeat(80));
  console.log('正在生成理由...');

  try {
    const startTime = Date.now();
    const aiResponse = await generateBanReasonWithClaude(testData, apiKey, model);
    const endTime = Date.now();

    console.log(`✅ 生成成功 (耗时: ${endTime - startTime}ms)`);
    console.log('\n📄 AI生成的理由:');
    console.log('='.repeat(80));
    console.log(aiResponse);
    console.log('='.repeat(80));

    // 4. 解析响应
    console.log('\n📊 步骤4: 解析响应');
    console.log('-'.repeat(80));

    // 清理响应文本
    const cleanedResponse = aiResponse.replace(/```/g, '').trim();
    const lines = cleanedResponse
      .split('\n')
      .map(line => line.trim())
      .filter(line => {
        if (!line) return false;
        if (line.startsWith('（') || line.startsWith('(')) return false;
        if (line.startsWith('#')) return false;
        return true;
      });

    console.log(`有效理由行数: ${lines.length}`);
    console.log(`${lines.length >= 3 && lines.length <= 5 ? '✅' : '❌'} 理由数量在3-5行范围内`);

    // 显示每一行理由
    console.log('\n理由内容:');
    lines.forEach((line, index) => {
      console.log(`  ${index + 1}. ${line}`);
    });

    // 5. 验证数据完整性
    console.log('\n🔍 步骤5: 验证数据完整性');
    console.log('-'.repeat(80));
    const checks = [
      { name: '英雄名称', value: testData.championName, found: aiResponse.includes(testData.championName) },
      { name: '选手名称', value: testData.playerName, found: aiResponse.includes(testData.playerName) },
      { name: '位置名称', value: testData.positionName, found: aiResponse.includes(testData.positionName) },
      { name: '熟练度分数', value: testData.proficiencyScore.toString(), found: aiResponse.includes(testData.proficiencyScore.toString()) },
      { name: '使用率', value: `${testData.usageRate}%`, found: aiResponse.includes(`${testData.usageRate}%`) },
      { name: '熟练度星级', value: testData.proficiencyStars, found: aiResponse.includes(testData.proficiencyStars) },
    ];

    for (const check of checks) {
      console.log(`${check.found ? '✅' : '⚠️ '} ${check.name}: ${check.value}`);
    }

    // 6. 成本估算
    console.log('\n💰 步骤6: 成本估算');
    console.log('-'.repeat(80));
    const inputTokens = Math.ceil(prompt.length / 2.5);
    const outputTokens = Math.ceil(aiResponse.length / 2.5);
    const inputCost = (inputTokens / 1000000) * 3;
    const outputCost = (outputTokens / 1000000) * 15;
    const totalCost = inputCost + outputCost;

    console.log(`输入tokens: ~${inputTokens}`);
    console.log(`输出tokens: ~${outputTokens}`);
    console.log(`输入成本: $${inputCost.toFixed(6)}`);
    console.log(`输出成本: $${outputCost.toFixed(6)}`);
    console.log(`总成本: $${totalCost.toFixed(6)}`);
    console.log(`1000次请求成本: $${(totalCost * 1000).toFixed(2)}`);

    console.log('\n✅ 测试完成！');
  } catch (error) {
    console.log('\n❌ 测试失败');
    console.error('错误信息:', error);

    if (error instanceof Error) {
      console.error('错误详情:', error.message);
    }
  }
}

// 运行测试
console.log('🚀 开始测试...\n');
testAIGeneration().catch(console.error);
