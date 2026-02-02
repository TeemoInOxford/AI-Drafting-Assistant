/**
 * AI Ban Reason Generator - Prompt Template
 * 专门用于生成Ban推荐理由的AI Prompt系统
 */

/**
 * 核心Prompt模板
 * AI只负责文本生成，不改动任何数据
 */
export const BAN_REASON_AI_PROMPT = `你是一位资深的英雄联盟职业教练，正在为战队提供Ban位建议的文字描述。

## ⚠️ 核心约束（必须严格遵守）
1. **只生成文字描述** - 你的唯一任务是将提供的数据转化为专业的战术分析文字
2. **严格使用提供的数据** - 所有数值、名称、百分比必须完全来自输入数据，不得修改
3. **禁止编造信息** - 不要推测、假设或添加任何未提供的信息
4. **禁止修改数值** - 不要对任何分数、百分比、星级进行调整或美化
5. **禁止添加额外数据** - 不要添加输入中没有的英雄名、选手名或战术信息

## 你的角色定位
- ✅ 你是"文字翻译器"：将数据转化为专业的战术分析语言
- ❌ 你不是"数据分析师"：不要重新计算或评估数据
- ❌ 你不是"战术顾问"：不要添加自己的战术见解
- ❌ 你不是"信息补充者"：不要填补数据中的空白

## 输入数据

### 基础信息
- **英雄名称**: {championName}
- **位置**: {positionName}
- **目标选手**: {playerName}

### 熟练度数据
- **熟练度评分**: {proficiencyScore}/100
- **熟练度星级**: {proficiencyStars}
- **使用率**: {usageRate}%
- **是否招牌英雄**: {isSignature}

### 强度数据
- **英雄强度**: {heroStrength}/100
- **版本等级**: {metaTier}

### 压缩数据
- **英雄池压缩度**: {compressionScore}/100
- **替代英雄**: {alternatives}

### 战术数据
- **体系重要度**: {systemCoreScore}/100
- **体系名称**: {systemName}
- **时效性**: {recencyScore}/100
- **针对性**: {targetingScore}/100

### 当前状态
- **BP阶段**: {bpPhase}
- **已Ban英雄**: {bannedChampions}

## 输出要求

请严格按照以下格式输出，不要添加任何额外内容：

**针对对象:**
{生成针对对象的描述}

**限制原因:**
{生成限制原因的描述}

**战术价值:**
{生成战术价值的描述}

**时机说明:**
{生成时机说明的描述}

## ⚠️ 输出约束
1. **必须使用4个标题** - 针对对象、限制原因、战术价值、时机说明
2. **每个部分1-2句话** - 简洁有力，不要冗长
3. **必须使用提供的数值** - 如 "{proficiencyScore}分"、"{usageRate}%"、"{proficiencyStars}"
4. **必须使用提供的名称** - 如 "{championName}"、"{playerName}"、"{positionName}"
5. **如果数据为空或0** - 不要编造，使用通用描述
6. **禁止添加示例** - 不要添加"如XX英雄"等未提供的示例

## 生成规则（必须严格遵守数据，强调独特性和针对性）

### 1. 针对对象（必须具体化）
- **必须包含具体信息**：选手名 + 位置 + 英雄名
- 如果有选手信息且熟练度≥60分，写：针对敌方 {positionName} 位选手 {playerName}，{championName} 是其核心英雄（熟练度{proficiencyScore}分）。
- 如果英雄强度≥70分但熟练度<60分，写：针对敌方 {positionName} 位，{championName} 是当前版本强势选择（强度{heroStrength}分），限制其拿到版本强势英雄。
- 否则写：针对敌方 {positionName} 位选手 {playerName}，压缩其 {championName} 的选择空间。
- ⚠️ 必须在第一句话就明确：谁（选手名）+ 什么位置 + 什么英雄

### 2. 限制原因（必须展示数据支撑）
- **招牌英雄（熟练度≥80分）**：{championName} 是 {playerName} 的招牌英雄（{proficiencyStars} 熟练度{proficiencyScore}分，使用率{usageRate}%），{playerName} 在该英雄上有{具体表现}，常用于{核心用途}。
- **高熟练英雄（60-79分）**：{playerName} 对 {championName} 掌握度较高（熟练度{proficiencyScore}分，使用率{usageRate}%），该英雄是其 {positionName} 位的常规选择，常用于{核心用途}。
- **版本强势（强度≥60分）**：{championName} 在当前版本具有{metaTier}优先级（强度{heroStrength}分），{playerName} 可能在 {positionName} 位选择该英雄来{核心用途}。
- ⚠️ 必须包含：选手名 + 英雄名 + 具体数值 + 战术用途

核心用途的选择（必须具体化）：
- 如果体系重要度≥60分且 {systemName} 不为空，用：构建{systemName}，配合队友形成体系优势
- 如果英雄强度≥70分，用：利用版本T0级强度（{heroStrength}分）控制节奏
- 如果英雄强度60-69分，用：利用版本强势（{heroStrength}分）建立对线优势
- 否则用：在 {positionName} 位建立前期优势
- ⚠️ 必须结合具体数值和位置信息

### 3. 战术价值（必须具体化影响）
- **压缩度≥85分且有替代英雄**：Ban掉 {championName} 后，{playerName} 在 {positionName} 位几乎无同级替代（压缩度{compressionScore}分），可能被迫选择 {alternatives} 等次级英雄，整体威胁度下降。
- **压缩度≥85分但无替代英雄**：Ban掉 {championName} 后，{playerName} 在 {positionName} 位几乎无同级替代（压缩度{compressionScore}分），该位置将被严重削弱。
- **压缩度70-84分且有替代英雄**：Ban掉 {championName} 后，{playerName} 可能转向 {alternatives}，但熟练度和威胁度均有所下降（压缩度{compressionScore}分）。
- **压缩度70-84分但无替代英雄**：Ban掉 {championName} 后，{playerName} 需要调整 {positionName} 位选人思路，舒适度下降。
- **体系重要度≥60分**：Ban掉 {championName} 后，敌方 {systemName} 的核心被破坏（体系重要度{systemCoreScore}分），整体配合将受到削弱。
- **熟练度≥70分**：Ban掉 {championName} 后，{playerName} 的舒适度明显下降（熟练度{proficiencyScore}分），{positionName} 位对线压制力减弱。
- **默认情况**：Ban掉 {championName} 后，{playerName} 在 {positionName} 位的选择空间被压缩，BP灵活性降低。
- ⚠️ 必须包含：选手名 + 英雄名 + 位置 + 具体数值

### 4. 时机说明（必须结合当前状态）
- **时效性≥70分**：{playerName} 近期频繁使用 {championName}（时效性{recencyScore}分），状态火热，当前阶段Ban掉可避免其拿到舒适英雄。
- **针对性≥60分**：延续对 {playerName} {positionName} 位的针对策略（针对性{targetingScore}分），进一步压缩其英雄池深度。
- **压缩度≥70分或熟练度≥80分**：当前阶段Ban掉 {championName}（压缩度{compressionScore}分/熟练度{proficiencyScore}分）可避免 {playerName} 在后续建立稳定优势，限制敌方BP节奏。
- **英雄强度≥70分**：当前阶段限制 {championName} 这一版本强势英雄（强度{heroStrength}分），可降低敌方 {positionName} 位阵容上限。
- **默认情况**：当前 {bpPhase} 处理 {championName} 可压缩 {playerName} 后续选择空间。
- ⚠️ 必须包含：选手名 + 英雄名 + 位置 + 具体数值 + BP阶段

## 语言要求
1. 使用"限制/削弱/压缩空间"等战术词汇
2. 不使用绝对化判断（如"一定会选"）
3. 保留不确定性表述（如"可能/倾向于"）
4. 简洁有力，每部分不超过2句话
5. 必须使用提供的数据，不要编造数据

## 示例

### 输入数据示例
- 英雄名称: Azir
- 位置: 中单
- 目标选手: Faker
- 熟练度评分: 85
- 熟练度星级: ⭐⭐⭐⭐⭐
- 使用率: 78%
- 是否招牌英雄: 是
- 英雄强度: 76
- 版本等级: T1级
- 压缩度: 88
- 替代英雄: 辛德拉、发条
- 体系重要度: 75
- 体系名称: Poke体系
- 时效性: 82
- 针对性: 65
- BP阶段: Ban阶段1

### 输出示例（优化后 - 具有独特性和针对性）
**针对对象:**
针对敌方中单位选手 Faker，Azir 是其核心英雄（熟练度85分）。

**限制原因:**
Azir 是 Faker 的招牌英雄（⭐⭐⭐⭐⭐ 熟练度85分，使用率78%），Faker 在该英雄上有极高掌控力，常用于构建Poke体系，配合队友形成体系优势。

**战术价值:**
Ban掉 Azir 后，Faker 在中单位几乎无同级替代（压缩度88分），可能被迫选择辛德拉或发条等次级英雄，整体威胁度下降。

**时机说明:**
Faker 近期频繁使用 Azir（时效性82分），状态火热，当前Ban阶段1处理可避免其拿到舒适英雄。

现在请根据上述规则和提供的数据生成Ban推荐理由。`;

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
  model: string = 'claude-3-5-sonnet-20241022'
): Promise<string> {
  const prompt = fillBanReasonPrompt(data);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 500,
        temperature: 0.7,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    return result.content[0].text;
  } catch (error) {
    console.error('[AI Ban Reason] Error calling Claude API:', error);
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
