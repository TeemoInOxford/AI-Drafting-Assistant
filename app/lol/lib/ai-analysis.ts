import { Champion, BPState, AIAnalysis, AIRecommendation, AIWarning, ActionType, Team, Language } from './types';

// 占位理由模板（后续替换为真正的AI分析）
const REASON_TEMPLATES = {
  ban: {
    en: [
      'High priority pick in current meta, deny enemy team',
      'Strong counter to our current composition',
      'Enemy team likely to prioritize this champion',
      'Removes a flex pick option from enemy',
      'High win rate champion, worth banning',
    ],
    zh: [
      '当前版本高优先级选择，禁用以防敌方拿到',
      '对我方当前阵容有强克制效果',
      '敌方队伍可能优先选择此英雄',
      '移除敌方的灵活选择空间',
      '高胜率英雄，值得禁用',
    ],
  },
  pick: {
    en: [
      'High synergy with current team composition',
      'Strong counter to enemy picks',
      'Flexible pick that fits multiple roles',
      'High win rate in current meta',
      'Denies enemy a priority pick while strengthening our comp',
      'Provides CC chain with existing picks',
      'Adds AP damage to balance team damage profile',
      'Strong frontline to protect carries',
      'Excellent engage tool for teamfights',
      'Safe blind pick with few counters',
    ],
    zh: [
      '与当前阵容协同效果出色',
      '对敌方已选英雄有强力克制',
      '灵活选择，可适应多个位置',
      '当前版本高胜率英雄',
      '抢选以阻止敌方获得优先选择',
      '与已有英雄形成控制链',
      '提供AP伤害，平衡队伍输出类型',
      '强力前排，保护后排输出',
      '优秀的团战开团工具',
      '安全的盲选，反制较少',
    ],
  },
};

// 警告模板
const WARNING_TEMPLATES = {
  en: [
    { type: 'warning' as const, message: 'Team lacks AP damage, consider AP pick' },
    { type: 'warning' as const, message: 'No frontline yet, need tank or bruiser' },
    { type: 'warning' as const, message: 'Lacking crowd control for teamfights' },
    { type: 'danger' as const, message: 'Top lane constraints: limited options remaining' },
    { type: 'info' as const, message: 'Enemy comp is poke-heavy, consider hard engage' },
    { type: 'warning' as const, message: 'Team is full AD, enemy can stack armor' },
    { type: 'info' as const, message: 'Consider Ziggs bot lane in future drafts for AP' },
  ],
  zh: [
    { type: 'warning' as const, message: '队伍缺少AP伤害，考虑选择法师' },
    { type: 'warning' as const, message: '尚无前排，需要坦克或战士' },
    { type: 'warning' as const, message: '团战控制不足' },
    { type: 'danger' as const, message: '上路选择受限：剩余选项有限' },
    { type: 'info' as const, message: '敌方阵容偏消耗，考虑硬开团' },
    { type: 'warning' as const, message: '队伍全AD，敌方可堆护甲' },
    { type: 'info' as const, message: '未来可考虑下路吉格斯补充AP' },
  ],
};

// 洞察模板
const INSIGHT_TEMPLATES = {
  en: [
    'Enemy has banned Galio, suggesting possible Ryze/Cassiopeia pick',
    'Red side has first pick advantage in phase 2',
    'Blue side can secure power pick with next selection',
    'Current draft favors scaling, consider early game pressure',
    'Enemy comp is teamfight-oriented, consider split-push strategy',
  ],
  zh: [
    '敌方禁用了加里奥，可能想选瑞兹/卡西奥佩娅',
    '红方在第二阶段有先选优势',
    '蓝方下一次选择可抢到强势英雄',
    '当前阵容偏后期，考虑前期压制',
    '敌方阵容偏团战，可考虑分推战术',
  ],
};

// 生成随机推荐（占位算法）
export function generateAIAnalysis(
  bpState: BPState,
  champions: Champion[],
  currentAction: ActionType,
  currentTeam: Team,
  language: Language
): AIAnalysis {
  const lang = language === 'zh' ? 'zh' : 'en';

  // 获取可用英雄
  const availableChampions = champions.filter(c => !bpState.usedChampions.has(c.id));

  // 随机选择 4-5 个英雄作为推荐
  const shuffled = [...availableChampions].sort(() => Math.random() - 0.5);
  const selectedChampions = shuffled.slice(0, 5);

  // 生成推荐列表
  const recommendations: AIRecommendation[] = selectedChampions.map((champ, index) => {
    const reasons = REASON_TEMPLATES[currentAction][lang];
    const baseWinRate = 60 - index * 3; // 60%, 57%, 54%, 51%, 48%
    const variance = Math.floor(Math.random() * 6) - 3; // -3 to +3

    return {
      champion: language === 'zh' ? champ.zhName : champ.enName,
      score: 100 - index * 10,
      winRate: baseWinRate + variance,
      reason: reasons[Math.floor(Math.random() * reasons.length)],
    };
  });

  // 排序确保胜率从高到低
  recommendations.sort((a, b) => (b.winRate || 0) - (a.winRate || 0));

  // 计算当前阵容胜率（占位：基于已选英雄数量的简单计算）
  const bluePickCount = bpState.bluePicks.filter(p => p).length;
  const redPickCount = bpState.redPicks.filter(p => p).length;
  const totalPicks = bluePickCount + redPickCount;
  const baseWinRate = 50;
  const variance = Math.floor(Math.random() * 10) - 5;
  const currentWinRate = Math.min(65, Math.max(35, baseWinRate + variance + (currentTeam === 'blue' ? 2 : -2)));

  // 随机生成警告（根据阵容状态）
  const warnings: AIWarning[] = [];
  const warningTemplates = WARNING_TEMPLATES[lang];

  // 根据已选英雄数量决定是否显示警告
  if (totalPicks >= 2 && Math.random() > 0.5) {
    const randomWarning = warningTemplates[Math.floor(Math.random() * warningTemplates.length)];
    warnings.push(randomWarning);
  }
  if (totalPicks >= 4 && Math.random() > 0.6) {
    const remainingWarnings = warningTemplates.filter(w => !warnings.some(existing => existing.message === w.message));
    if (remainingWarnings.length > 0) {
      warnings.push(remainingWarnings[Math.floor(Math.random() * remainingWarnings.length)]);
    }
  }

  // 生成洞察
  const insights: string[] = [];
  const insightTemplates = INSIGHT_TEMPLATES[lang];

  if (totalPicks >= 1 && Math.random() > 0.4) {
    insights.push(insightTemplates[Math.floor(Math.random() * insightTemplates.length)]);
  }
  if (totalPicks >= 3 && Math.random() > 0.5) {
    const remaining = insightTemplates.filter(i => !insights.includes(i));
    if (remaining.length > 0) {
      insights.push(remaining[Math.floor(Math.random() * remaining.length)]);
    }
  }

  return {
    recommendations,
    currentWinRate,
    warnings,
    insights,
  };
}

// 获取阵容评估（占位）
export function getCompositionScore(bpState: BPState, team: Team): number {
  const picks = team === 'blue' ? bpState.bluePicks : bpState.redPicks;
  const pickCount = picks.filter(p => p).length;

  // 简单的占位评分
  return Math.min(100, 40 + pickCount * 12 + Math.floor(Math.random() * 10));
}
