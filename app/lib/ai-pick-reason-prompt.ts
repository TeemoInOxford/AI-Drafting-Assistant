/**
 * AI Pick Reason Generator - Prompt Template
 * 专门用于生成Pick推荐理由的AI Prompt系统
 */

/**
 * 核心Prompt模板
 */
export const PICK_REASON_AI_PROMPT = `你是一位资深的英雄联盟职业教练，正在为战队提供Pick位建议的文字描述。

## ⚠️ 核心约束（必须严格遵守）
1. **只生成文字描述** - 你的唯一任务是将提供的数据转化为专业的战术分析文字
2. **严格使用提供的数据** - 所有数值、名称必须完全来自输入数据，不得修改
3. **禁止编造信息** - 不要推测、假设或添加任何未提供的信息
4. **输出1-3条理由** - 每条理由简洁有力，15-30字

## 输入数据

### 基础信息
- **英雄名称**: {championName}
- **位置**: {positionName}

### 当前BP状态
- **BP阶段**: {bpPhase}
- **我方已选**: {ourPicks}
- **敌方已选**: {enemyPicks}
- **我方已Ban**: {ourBans}
- **敌方已Ban**: {enemyBans}
- **我方剩余位置**: {ourRemainingRoles}
- **敌方剩余位置**: {enemyRemainingRoles}

### 战术数据
- **协同评分**: {synergyScore}/100
- **克制评分**: {counterScore}/100
- **版本强度**: {metaStrength}/100
- **位置适配度**: {roleMatch}/100

## 输出要求

请严格按照以下格式输出1-3条理由，每条理由一行：

{理由1}
{理由2}
{理由3}

## 生成规则

### 理由优先级（按重要性排序）

1. **克制优势（counterScore ≥ 70）**
   - 格式：克制敌方{敌方英雄}，建立对线优势
   - 示例：克制敌方亚索，建立对线优势

2. **协同优势（synergyScore ≥ 70）**
   - 格式：与{我方英雄}形成强力配合
   - 示例：与锤石形成强力配合

3. **版本强势（metaStrength ≥ 75）**
   - 格式：当前版本T0/T1级强势英雄
   - 示例：当前版本T1级强势英雄

4. **位置补充（roleMatch ≥ 80）**
   - 格式：补充{位置}位，完善阵容结构
   - 示例：补充中单位，完善阵容结构

5. **阵容完整性（isLastPick = true）**
   - 格式：最后一选，确保阵容完整性
   - 示例：最后一选，确保阵容完整性

### 理由选择逻辑
- 如果有多个高分维度（≥70分），选择最高的2-3个
- 优先选择克制和协同，其次是版本强度
- 每条理由必须简洁，15-30字
- 必须使用提供的英雄名称和位置名称

## 示例

### 输入数据示例
- 英雄名称: 锤石
- 位置: 辅助
- BP阶段: pick2
- 我方已选: 剑姬、盲僧、辛德拉
- 敌方已选: 奥恩、赵信、发条、卡莎
- 协同评分: 85
- 克制评分: 72
- 版本强度: 78
- 位置适配度: 90

### 输出示例
与剑姬形成强力配合
克制敌方卡莎，建立对线优势
当前版本T1级强势英雄

现在请根据上述规则和提供的数据生成Pick推荐理由。`;

/**
 * 构建AI请求的数据结构
 */
export interface AIPickReasonInput {
  // 基础信息
  championName: string;
  positionName: string;

  // BP状态
  bpPhase: string;
  ourPicks: string;
  enemyPicks: string;
  ourBans: string;
  enemyBans: string;
  ourRemainingRoles: string;
  enemyRemainingRoles: string;

  // 战术数据
  synergyScore: number;
  counterScore: number;
  metaStrength: number;
  roleMatch: number;
}

/**
 * 填充Prompt模板
 */
export function fillPickReasonPrompt(data: AIPickReasonInput): string {
  let prompt = PICK_REASON_AI_PROMPT;

  prompt = prompt.replace(/{championName}/g, data.championName);
  prompt = prompt.replace(/{positionName}/g, data.positionName);
  prompt = prompt.replace(/{bpPhase}/g, data.bpPhase);
  prompt = prompt.replace(/{ourPicks}/g, data.ourPicks || '无');
  prompt = prompt.replace(/{enemyPicks}/g, data.enemyPicks || '无');
  prompt = prompt.replace(/{ourBans}/g, data.ourBans || '无');
  prompt = prompt.replace(/{enemyBans}/g, data.enemyBans || '无');
  prompt = prompt.replace(/{ourRemainingRoles}/g, data.ourRemainingRoles || '无');
  prompt = prompt.replace(/{enemyRemainingRoles}/g, data.enemyRemainingRoles || '无');
  prompt = prompt.replace(/{synergyScore}/g, data.synergyScore.toString());
  prompt = prompt.replace(/{counterScore}/g, data.counterScore.toString());
  prompt = prompt.replace(/{metaStrength}/g, data.metaStrength.toString());
  prompt = prompt.replace(/{roleMatch}/g, data.roleMatch.toString());

  return prompt;
}

/**
 * 调用Claude API生成Pick理由
 */
export async function generatePickReasonWithClaude(
  data: AIPickReasonInput,
  apiKey: string,
  model: string = 'claude-3-5-sonnet-20241022'
): Promise<string> {
  const prompt = fillPickReasonPrompt(data);

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
        max_tokens: 300,
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
    console.error('[AI Pick Reason] Error calling Claude API:', error);
    throw error;
  }
}

/**
 * 调用OpenAI兼容API生成Pick理由（支持CPASS代理等）
 */
export async function generatePickReasonWithOpenAI(
  data: AIPickReasonInput,
  apiKey: string,
  model: string = 'claude-sonnet-4-5-20250929',
  endpoint: string = 'https://cf.cpass.cc/v1/chat/completions'
): Promise<string> {
  const prompt = fillPickReasonPrompt(data);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // 只有在 apiKey 不为空时才添加 Authorization header
    if (apiKey && apiKey !== 'ollama') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

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
          max_tokens: 300,
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
    console.error('[AI Pick Reason] Error calling OpenAI-compatible API:', error);
    throw error;
  }
}

/**
 * 解析AI生成的理由
 */
export function parsePickReasons(aiResponse: string): string[] {
  const lines = aiResponse
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .filter(line => !line.startsWith('#'))
    .filter(line => !line.startsWith('**'))
    .filter(line => !line.includes('示例'))
    .filter(line => !line.includes('输出'))
    .slice(0, 3);

  return lines;
}
