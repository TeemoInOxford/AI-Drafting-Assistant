/**
 * AI Ban Reason Generator - Prompt Template
 * 专门用于生成Ban推荐理由的AI Prompt系统
 */

/**
 * 核心Prompt模板
 * AI只负责文本生成，不改动任何数据
 */
export const BAN_REASON_AI_PROMPT = `# 角色定义

你是英雄联盟 BP 阶段的战术表达器。你的职责是将已完成的结构化分析信号转化为简洁、直接的 Ban 理由。

你不进行分析、不推理、不重新计算。你只从提供的信号中提取最关键的威胁点并表达。

---

# 输入结构

系统将提供以下数据：

**BP 状态**
- 当前 Ban 轮次
- 已 Ban 英雄列表
- 已选英雄列表
- 剩余 Ban 位数量

**目标信息**
- 目标英雄名称
- 目标位置（可能为空）
- 目标选手（可能为空）

**结构化信号**（已计算完成）
- 版本强度评分
- 选手熟练度数据
- 体系重要度标记
- 对线压制指数
- 后期威胁等级
- 克制关系评估
- 历史数据（Ban 率/胜率）

---

# 决策取向

你必须聚焦：

1. **当前轮次的致命性** - 为什么这个英雄在此刻是最危险的
2. **延后的代价** - 为什么不能等到后续轮次处理
3. **对方的核心依赖** - 该英雄对对方战术体系的关键作用

忽略：
- 全面性分析
- 次要因素
- 备选方案
- 历史背景说明

---

# 输出规则

**严格格式**：
- 输出 3–5 行
- 每行一个独立判断
- 不使用编号
- 不使用列表符号
- 不添加解释或铺垫
- 不使用句号以外的标点

**语言风格**：
- 教练在 BP 现场的即时判断
- 断言式、肯定式
- 短句、动词优先
- 禁止使用："首先""其次""建议""可以考虑""可能""如果"

**执行流程**：
1. 读取结构化信号
2. 识别数值最高或标记最强的 2–3 个维度
3. 将维度转化为威胁判断
4. 按致命性排序输出
5. 不添加任何额外内容

---

# 禁止行为

- 不重新分析数据
- 不推理未提供的信息
- 不提出建议或备选方案
- 不使用不确定表达
- 不输出超过 5 行
- 不解释输出逻辑
- 不进行自我反思或验证

---

# 输出示例

\`\`\`
对方上单绝活英雄必须先处理
版本 T0 级别放出去直接炸线
这个英雄是对方体系核心不 Ban 后面没法选
\`\`\`

（示例仅供参考语气，不模仿具体内容）

---

# 数据占位符

系统会填充以下占位符：
- {championName} - 英雄名称
- {positionName} - 位置
- {playerName} - 目标选手
- {proficiencyScore} - 熟练度评分
- {proficiencyStars} - 熟练度星级
- {usageRate} - 使用率
- {isSignature} - 是否招牌英雄
- {heroStrength} - 英雄强度
- {metaTier} - 版本等级
- {compressionScore} - 英雄池压缩度
- {alternatives} - 替代英雄
- {systemCoreScore} - 体系重要度
- {systemName} - 体系名称
- {recencyScore} - 时效性
- {targetingScore} - 针对性
- {bpPhase} - BP阶段
- {bannedChampions} - 已Ban英雄

现在请根据提供的数据生成 3-5 条 Ban 理由。`;

/**
 * 构建AI请求的数据结构
 */
export interface AIBanReasonInput {
  // 基础信息
  championName: string;
  positionName: string;
  playerName: string;

  // 熟练度数据
  proficiencyScore: number;
  proficiencyStars: string;
  usageRate: number;
  isSignature: boolean;

  // 强度数据
  heroStrength: number;
  metaTier: string;

  // 压缩数据
  compressionScore: number;
  alternatives: string;

  // 战术数据
  systemCoreScore: number;
  systemName: string;
  recencyScore: number;
  targetingScore: number;

  // 当前状态
  bpPhase: string;
  bannedChampions: string;
}

/**
 * 填充Prompt模板
 */
export function fillBanReasonPrompt(data: AIBanReasonInput): string {
  let prompt = BAN_REASON_AI_PROMPT;

  // 替换所有占位符
  prompt = prompt.replace(/{championName}/g, data.championName);
  prompt = prompt.replace(/{positionName}/g, data.positionName);
  prompt = prompt.replace(/{playerName}/g, data.playerName);
  prompt = prompt.replace(/{proficiencyScore}/g, data.proficiencyScore.toString());
  prompt = prompt.replace(/{proficiencyStars}/g, data.proficiencyStars);
  prompt = prompt.replace(/{usageRate}/g, data.usageRate.toString());
  prompt = prompt.replace(/{isSignature}/g, data.isSignature ? '是' : '否');
  prompt = prompt.replace(/{heroStrength}/g, data.heroStrength.toString());
  prompt = prompt.replace(/{metaTier}/g, data.metaTier);
  prompt = prompt.replace(/{compressionScore}/g, data.compressionScore.toString());
  prompt = prompt.replace(/{alternatives}/g, data.alternatives || '无');
  prompt = prompt.replace(/{systemCoreScore}/g, data.systemCoreScore.toString());
  prompt = prompt.replace(/{systemName}/g, data.systemName || '无');
  prompt = prompt.replace(/{recencyScore}/g, data.recencyScore.toString());
  prompt = prompt.replace(/{targetingScore}/g, data.targetingScore.toString());
  prompt = prompt.replace(/{bpPhase}/g, data.bpPhase);
  prompt = prompt.replace(/{bannedChampions}/g, data.bannedChampions || '无');

  return prompt;
}

/**
 * 调用Claude API生成Ban理由
 */
export async function generateBanReasonWithClaude(
  data: AIBanReasonInput,
  apiKey: string,
  model: string = 'claude-3-5-sonnet-20241022',
  baseUrl?: string
): Promise<string> {
  const prompt = fillBanReasonPrompt(data);

  // 使用自定义 base URL 或默认的 Anthropic API
  let apiUrl = baseUrl || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  // 移除尾部斜杠以避免双斜杠问题
  apiUrl = apiUrl.replace(/\/+$/, '');
  const endpoint = `${apiUrl}/v1/messages`;

  console.log('[AI Ban Reason] API Request Details:');
  console.log('  - Endpoint:', endpoint);
  console.log('  - Model:', model);
  console.log('  - API Key (first 10 chars):', apiKey.substring(0, 10) + '...');
  console.log('  - Base URL from env:', process.env.ANTHROPIC_BASE_URL);

  const requestBody = {
    model: model,
    max_tokens: 500,
    temperature: 0.7,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  };

  try {
    console.log('[AI Ban Reason] Sending request to Claude API...');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('[AI Ban Reason] Response status:', response.status);
    console.log('[AI Ban Reason] Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI Ban Reason] Error response body:', errorText.substring(0, 500));
      throw new Error(`Claude API error: ${response.status} ${errorText}`);
    }

    const responseText = await response.text();
    console.log('[AI Ban Reason] Response body (first 200 chars):', responseText.substring(0, 200));

    const result = JSON.parse(responseText);
    return result.content[0].text;
  } catch (error) {
    console.error('[AI Ban Reason] Error calling Claude API:', error);
    if (error instanceof Error) {
      console.error('[AI Ban Reason] Error message:', error.message);
      console.error('[AI Ban Reason] Error stack:', error.stack);
    }
    throw error;
  }
}

/**
 * 调用OpenAI兼容API生成Ban理由（支持Ollama等开源模型）
 */
export async function generateBanReasonWithOpenAI(
  data: AIBanReasonInput,
  apiKey: string,
  model: string = 'llama3',
  endpoint: string = 'http://localhost:11434/v1/chat/completions'
): Promise<string> {
  const prompt = fillBanReasonPrompt(data);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // 只有在 apiKey 不为空时才添加 Authorization header
    if (apiKey && apiKey !== 'ollama') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // 设置超时时间为 10 分钟（Ollama 首次调用需要加载模型）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minutes

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: 500,
          temperature: 0.7,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      return result.choices[0].message.content;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    console.error('[AI Ban Reason] Error calling OpenAI-compatible API:', error);
    throw error;
  }
}

/**
 * 统一的AI生成接口（根据provider自动选择）
 */
export async function generateBanReasonWithAI(
  data: AIBanReasonInput,
  config: {
    provider: 'anthropic' | 'openai' | 'ollama';
    apiKey: string;
    model?: string;
    endpoint?: string;
  }
): Promise<string> {
  const { provider, apiKey, model, endpoint } = config;

  console.log(`[AI Ban Reason] Using provider: ${provider}, model: ${model || 'default'}`);

  if (provider === 'anthropic') {
    return generateBanReasonWithClaude(
      data,
      apiKey,
      model || 'claude-3-5-sonnet-20241022'
    );
  } else if (provider === 'openai' || provider === 'ollama') {
    return generateBanReasonWithOpenAI(
      data,
      apiKey,
      model || 'llama3',
      endpoint || 'http://localhost:11434/v1/chat/completions'
    );
  } else {
    throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

/**
 * 从Ban评分数据构建AI输入
 */
export function buildAIInputFromBanScore(
  champion: any,
  dimensions: any,
  enemyProficiency: any,
  restrictionImpact: any,
  strategicValue: any,
  enemyTeamPool: any,
  bpState: any
): AIBanReasonInput {
  // 位置名称映射
  const positionNames: Record<string, string> = {
    top: '上单',
    jungle: '打野',
    mid: '中单',
    bot: 'ADC',
    support: '辅助',
  };

  // 获取基础信息
  const availability = enemyTeamPool?.championAvailability.get(champion.id);
  const hasAvailability = availability && availability.availablePlayers.length > 0;
  const bestPlayer = hasAvailability ? availability.availablePlayers[0] : null;

  // Debug logging
  console.log('[AI Ban Reason] Champion:', champion.name, champion.id);
  console.log('[AI Ban Reason] Has availability:', hasAvailability);
  console.log('[AI Ban Reason] Best player:', bestPlayer);
  console.log('[AI Ban Reason] Player name:', bestPlayer?.playerName);

  const playerName = bestPlayer?.playerName || '对手选手';
  const proficiencyLevel = bestPlayer?.proficiencyLevel || 0;
  const frequency = bestPlayer ? Math.round(bestPlayer.frequency * 100) : 0;
  const position = champion.positions[0];
  const positionName = positionNames[position] || position;

  // 熟练度星级
  const proficiencyStars = '⭐'.repeat(Math.min(proficiencyLevel, 5));

  // 是否招牌英雄
  const isSignature = enemyProficiency.signatureScore >= 80;

  // 版本等级
  let metaTier = '';
  if (dimensions.heroStrength >= 80) metaTier = 'T0级';
  else if (dimensions.heroStrength >= 70) metaTier = 'T1级';
  else if (dimensions.heroStrength >= 60) metaTier = 'T2级';
  else metaTier = 'T3级';

  // 替代英雄
  const alternatives = getAlternativeChampionsText(availability, champion.id, enemyTeamPool, position);

  // 体系名称
  let systemName = '';
  const KNOWN_SYSTEMS: Record<string, string[]> = {
    'Poke体系': ['Jayce', 'Varus', 'Xerath', 'Ziggs', 'Azir'],
    '4保1体系': ['Lulu', 'Karma', 'Janna', 'Nami', 'Milio'],
    '开团体系': ['Malphite', 'Amumu', 'Leona', 'Rakan', 'Alistar'],
    '分推体系': ['Fiora', 'Camille', 'Jax', 'Tryndamere'],
  };

  for (const [name, champions] of Object.entries(KNOWN_SYSTEMS)) {
    if (champions.includes(champion.id)) {
      systemName = name;
      break;
    }
  }

  // BP阶段
  const bpPhase = bpState.currentStep < 6 ? 'Ban阶段1' : 'Ban阶段2';

  // 已Ban英雄
  const bannedChampions = [...bpState.blueBans, ...bpState.redBans]
    .filter(Boolean)
    .join('、') || '无';

  return {
    championName: champion.name,
    positionName,
    playerName,
    proficiencyScore: Math.round(enemyProficiency.signatureScore),
    proficiencyStars,
    usageRate: frequency,
    isSignature,
    heroStrength: Math.round(dimensions.heroStrength),
    metaTier,
    compressionScore: Math.round(restrictionImpact.poolCompressionScore),
    alternatives,
    systemCoreScore: Math.round(strategicValue.systemCoreScore),
    systemName,
    recencyScore: Math.round(enemyProficiency.recencyScore),
    targetingScore: Math.round(strategicValue.targetingScore),
    bpPhase,
    bannedChampions,
  };
}

/**
 * 获取替代英雄文本
 */
function getAlternativeChampionsText(
  availability: any,
  currentChampionId: string,
  enemyTeamPool: any,
  position: string
): string {
  if (!enemyTeamPool) return '';

  const alternatives: Array<{ name: string; score: number }> = [];

  for (const [championId, champAvailability] of enemyTeamPool.championAvailability.entries()) {
    if (championId === currentChampionId) continue;

    const champPositions = champAvailability.positions || [];
    if (!champPositions.includes(position)) continue;

    const proficiencyScore = champAvailability.teamProficiencyScore || 0;
    const availableCount = champAvailability.availablePlayers?.length || 0;

    if (proficiencyScore >= 40 && availableCount > 0) {
      const bestPlayer = champAvailability.availablePlayers[0];
      const championName = bestPlayer?.championName || championId;

      alternatives.push({
        name: championName,
        score: proficiencyScore,
      });
    }
  }

  alternatives.sort((a, b) => b.score - a.score);
  const topAlternatives = alternatives.slice(0, 2).map(a => a.name);

  return topAlternatives.join('、') || '';
}
