/**
 * 推荐理由生成器
 * 将技术指标转换为清晰易懂的推荐理由
 */

import { PTSResult, Position } from './types';
import { GameTheoryState } from './hybrid-game-theory';

/**
 * 根据PTS分数计算威胁等级（Ban阶段）
 * 调整阈值以适应实际PTS分数范围
 */
export function calculateThreatLevel(pts: number): '高' | '中' | '低' {
  // 根据实际数据调整阈值
  if (pts >= 35) return '高';   // 降低高威胁度阈值
  if (pts >= 18) return '中';   // 降低中威胁度阈值
  return '低';
}

/**
 * 根据PTS分数计算推荐度（Pick阶段）
 * 调整阈值以适应实际PTS分数范围
 * 支持阶段感知：早期轮次使用更低的阈值
 */
export function calculateRecommendLevel(pts: number, pickCount: number = 0): '高' | '中' | '低' {
  // 早期轮次（前3个pick）：降低阈值，因为缺少阵容协同数据
  if (pickCount <= 3) {
    if (pts >= 20) return '高';   // 早期高推荐度阈值
    if (pts >= 10) return '中';   // 早期中推荐度阈值
    return '低';
  }

  // 中后期轮次：使用正常阈值
  if (pts >= 30) return '高';   // 降低高推荐度阈值
  if (pts >= 15) return '中';   // 降低中推荐度阈值
  return '低';
}

/**
 * 生成详细的Ban理由
 */
export function generateBanReason(
  result: PTSResult,
  gameState?: GameTheoryState
): string {
  const reasons: string[] = [];
  const { signals, severityBreakdown } = result;

  // 1. 对手英雄池分析
  if (signals.championPoolStrength && signals.championPoolStrength > 0.7) {
    reasons.push(`对手英雄池：该英雄是对手的擅长英雄（熟练度${(signals.championPoolStrength * 100).toFixed(0)}%）`);
  } else if (signals.championPoolStrength && signals.championPoolStrength > 0.4) {
    reasons.push(`对手英雄池：对手对该英雄有一定掌握`);
  }

  // 2. 版本强度（Meta）
  if (signals.globalMetaPresence > 0.75) {
    reasons.push(`版本强度：当前版本T0级英雄（出场率${(signals.globalMetaPresence * 100).toFixed(0)}%）`);
  } else if (signals.globalMetaPresence > 0.55) {
    reasons.push(`版本强度：当前版本强势英雄`);
  }

  // 3. 位置威胁
  if (signals.opponentRoleVacancy > 0.7) {
    reasons.push(`位置威胁：对手该位置选择空间大，放出风险高`);
  }

  // 4. 阵容威胁
  if (severityBreakdown.compositionLock > 0.7) {
    reasons.push(`阵容威胁：该英雄会锁定对手强势阵容体系`);
  } else if (severityBreakdown.strategicDenial > 0.6) {
    reasons.push(`阵容威胁：该英雄对我方阵容构成战略威胁`);
  }

  // 5. 博弈论分析
  if (gameState && gameState.confidence > 0.4) {
    const typeNames: Record<string, string> = {
      aggressive: '激进型',
      defensive: '防守型',
      meta_follower: 'Meta型',
      counter_focused: '针对型',
      flex_master: '摇摆型',
    };
    const typeName = typeNames[gameState.predictedType] || '未知';
    reasons.push(`博弈分析：对手${typeName}打法，该英雄符合其选择倾向（${(gameState.confidence * 100).toFixed(0)}%信心）`);
  }

  // 6. 如果没有明显理由，给出综合评估
  if (reasons.length === 0) {
    if (result.pts >= 70) {
      reasons.push('综合评估：该英雄综合威胁度高，建议优先Ban');
    } else if (result.pts >= 45) {
      reasons.push('综合评估：该英雄具有一定威胁，可考虑Ban');
    } else {
      reasons.push('综合评估：该英雄威胁度较低，可延后处理');
    }
  }

  return reasons.join('；');
}

/**
 * 生成详细的Pick理由（支持AI生成）
 */
export async function generatePickReason(
  result: PTSResult,
  ourPicks: string[],
  opponentPicks: string[],
  remainingRoles: Position[],
  gameState?: GameTheoryState,
  useAI: boolean = false
): Promise<string> {
  // 如果启用AI且环境变量配置正确，尝试使用AI生成
  if (useAI && process.env.AI_PICK_REASON_ENABLED === 'true') {
    try {
      const aiReason = await generatePickReasonWithAI(result, ourPicks, opponentPicks, remainingRoles);
      if (aiReason) {
        return aiReason;
      }
    } catch (error) {
      console.error('[Pick Reason] AI generation failed, falling back to rule-based:', error);
    }
  }

  // 降级到规则生成
  return generatePickReasonRuleBased(result, ourPicks, opponentPicks, remainingRoles, gameState);
}

/**
 * 使用AI生成Pick理由
 */
async function generatePickReasonWithAI(
  result: PTSResult,
  ourPicks: string[],
  opponentPicks: string[],
  remainingRoles: Position[]
): Promise<string | null> {
  try {
    const { generatePickReasonWithClaude, generatePickReasonWithOpenAI, parsePickReasons } = await import('./ai-pick-reason-prompt');

    const apiKey = process.env.AI_PICK_REASON_API_KEY || process.env.AI_BAN_REASON_API_KEY;
    const model = process.env.AI_PICK_REASON_MODEL || process.env.AI_BAN_REASON_MODEL || 'claude-3-5-sonnet-20241022';
    const provider = process.env.AI_BAN_REASON_PROVIDER || 'anthropic';
    const endpoint = process.env.AI_BAN_REASON_ENDPOINT || 'https://cf.cpass.cc/v1/chat/completions';

    if (!apiKey) {
      return null;
    }

    // 构建详细的输入数据，包含所有算法计算结果
    const POSITION_NAMES: Record<Position, string> = {
      top: '上单',
      jungle: '打野',
      mid: '中单',
      bot: 'ADC',
      support: '辅助',
    };

    // 构建详细的 prompt，包含所有算法数据
    const detailedPrompt = `你是一位资深的英雄联盟职业教练，正在为战队提供Pick位建议的文字描述。

## 英雄信息
- 英雄名称: ${result.championName}
- PTS评分: ${result.pts.toFixed(1)}
- 推荐等级: ${result.recommendLevel || '中'}

## 当前BP状态
- 我方已选: ${ourPicks.length > 0 ? ourPicks.join('、') : '无'}
- 敌方已选: ${opponentPicks.length > 0 ? opponentPicks.join('、') : '无'}
- 我方剩余位置: ${remainingRoles.length > 0 ? remainingRoles.map(r => POSITION_NAMES[r]).join('、') : '无'}

## 算法计算数据

### 1. Pick可能性信号 (PickLikelihood Signals)
- 对手位置空缺度: ${(result.signals.opponentRoleVacancy * 100).toFixed(1)}% (对手该位置需求程度)
- 对手英雄池强度: ${result.signals.championPoolStrength ? (result.signals.championPoolStrength * 100).toFixed(1) + '% (对手对该英雄的熟练度)' : '无数据'}
- 版本Meta出场率: ${result.signals.rawPresence ? (result.signals.rawPresence * 100).toFixed(1) + '% (职业比赛真实出现率)' : (result.signals.globalMetaPresence * 100).toFixed(1) + '% (版本强度指数)'}
- 协同Ban信号: ${result.signals.synergyWithBans ? (result.signals.synergyWithBans * 100).toFixed(1) + '% (与我方已选英雄的协同度)' : '无数据'}

### 2. 损失严重度分析 (Loss Severity)
- 位置崩溃风险: ${(result.severityBreakdown.roleCollapse * 100).toFixed(1)}% (失去该英雄对我方位置的影响)
- 阵容锁定风险: ${(result.severityBreakdown.compositionLock * 100).toFixed(1)}% (失去该英雄对我方阵容灵活性的影响)
- 战略拒止价值: ${(result.severityBreakdown.strategicDenial * 100).toFixed(1)}% (该英雄对敌方阵容的克制程度)

### 3. 其他关键信息
- 是否Flex英雄: ${result.isFlex ? '是' : '否'}
${result.isFlex && result.roleDistribution ? `- Flex位置分布: ${result.roleDistribution.map(r => `${POSITION_NAMES[r.role]}(${(r.probability * 100).toFixed(0)}%)`).join('、')}` : ''}
- Pick可能性: ${(result.pickLikelihood * 100).toFixed(1)}%
- 损失严重度: ${(result.lossSeverity * 100).toFixed(1)}%

## 输出要求
请根据以上算法计算数据，生成1-3条简洁有力的Pick推荐理由（每条20-35字）。

**核心要求：必须在理由中引用具体的算法数据**

**分析重点和输出格式：**
1. 如果"对手英雄池强度"高(>60%)，输出格式：
   - 抢夺对手擅长英雄（熟练度XX%），避免被对手拿到

2. 如果"战略拒止价值"高(>60%)，输出格式：
   - 克制敌方阵容（战略拒止XX%），有效限制对手发挥

3. 如果"协同Ban信号"高(>60%)，输出格式：
   - 与我方已选英雄协同度XX%，形成强力配合

4. 如果"版本Meta出场率"高(>70%)，输出格式：
   - 版本强势英雄（出场率XX%），当前环境优先级高

5. 如果"位置崩溃风险"高(>60%)，输出格式：
   - 补足我方XX位置（位置需求度XX%），完善阵容结构

6. 如果是Flex英雄，输出格式：
   - Flex英雄可打XX/XX位置，增加阵容灵活性

**输出格式：**
- 每条理由一行，不要编号，不要使用markdown格式
- 必须包含具体的百分比数据或数值
- 理由要具体，不要笼统描述

**示例（必须包含数据）：**
抢夺对手擅长英雄（熟练度78%），避免被对手拿到
克制敌方阵容（战略拒止72%），有效限制对手发挥
版本强势英雄（出场率94%），当前环境优先级高`;

    // 调用AI API
    let aiResponse: string;
    if (provider === 'openai' || provider === 'ollama') {
      // 直接传递 prompt 字符串
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'user',
              content: detailedPrompt,
            },
          ],
          max_tokens: 300,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      aiResponse = result.choices[0].message.content;
    } else {
      // Anthropic Claude API - 使用 CPASS 代理
      let apiUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
      // 移除尾部斜杠以避免双斜杠问题
      apiUrl = apiUrl.replace(/\/+$/, '');
      const response = await fetch(`${apiUrl}/v1/messages`, {
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
              content: detailedPrompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Claude API error: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      aiResponse = result.content[0].text;
    }

    // 解析理由
    const reasons = parsePickReasons(aiResponse);

    // 返回理由文本（用分号连接）
    return reasons.join('；');
  } catch (error) {
    console.error('[Pick Reason] AI generation error:', error);
    return null;
  }
}

/**
 * 生成详细的Pick理由（规则生成）
 */
function generatePickReasonRuleBased(
  result: PTSResult,
  ourPicks: string[],
  opponentPicks: string[],
  remainingRoles: Position[],
  gameState?: GameTheoryState
): string {
  const reasons: string[] = [];
  const { signals, severityBreakdown } = result;

  // 优先级排序：按重要性从高到低添加理由

  // 1. 位置需求（最高优先级 - 必须补位）
  if (remainingRoles.length > 0 && signals.opponentRoleVacancy > 0.5) {
    const roleNames: Record<Position, string> = {
      top: '上单',
      jungle: '打野',
      mid: '中单',
      bot: 'ADC',
      support: '辅助',
    };
    const rolesText = remainingRoles.map(r => roleNames[r]).join('、');

    if (remainingRoles.length === 1) {
      reasons.push(`位置需求：必须补${rolesText}位置`);
    } else if (remainingRoles.length === 2) {
      reasons.push(`位置需求：剩余${rolesText}位置待补`);
    } else {
      reasons.push(`位置需求：可填补${rolesText}等多个位置`);
    }
  }

  // 2. 对手英雄池分析（高优先级）
  if (signals.championPoolStrength && signals.championPoolStrength > 0.6) {
    reasons.push(`抢夺优势：抢先拿下对手擅长英雄（熟练度${(signals.championPoolStrength * 100).toFixed(0)}%）`);
  }

  // 3. 针对对手阵容（高优先级）
  if (severityBreakdown.strategicDenial > 0.6) {
    reasons.push(`克制对手：有效针对对手已选阵容`);
  } else if (opponentPicks.length > 0 && severityBreakdown.strategicDenial > 0.4) {
    reasons.push(`对线优势：对对手阵容有一定克制`);
  }

  // 4. 阵容协同（中高优先级）
  if (signals.synergyWithBans && signals.synergyWithBans > 0.6) {
    reasons.push(`阵容协同：与我方已选英雄配合良好`);
  } else if (ourPicks.length > 0 && signals.synergyWithBans && signals.synergyWithBans > 0.4) {
    reasons.push(`阵容协同：能与队友形成配合`);
  }

  // 5. 阵容平衡（中优先级）
  if (severityBreakdown.roleCollapse > 0.6) {
    reasons.push(`阵容平衡：补足我方阵容短板`);
  }

  // 6. 版本强度（中优先级）
  if (signals.globalMetaPresence > 0.75) {
    reasons.push(`版本强度：当前版本T0级英雄（出场率${(signals.globalMetaPresence * 100).toFixed(0)}%）`);
  } else if (signals.globalMetaPresence > 0.6) {
    reasons.push(`版本强度：当前版本强势英雄`);
  } else if (signals.globalMetaPresence > 0.45) {
    reasons.push(`版本强度：版本主流选择`);
  }

  // 7. Flex优势（中优先级）
  if (result.isFlex && result.roleDistribution && result.roleDistribution.length > 1) {
    const roles = result.roleDistribution
      .filter(r => r.probability > 0.2)
      .map(r => {
        const roleNames: Record<Position, string> = {
          top: '上',
          jungle: '野',
          mid: '中',
          bot: '下',
          support: '辅',
        };
        return `${roleNames[r.role]}(${(r.probability * 100).toFixed(0)}%)`;
      })
      .join('/');
    if (roles) {
      reasons.push(`摇摆优势：可打${roles}多个位置`);
    }
  }

  // 8. 博弈论分析（低优先级）
  if (gameState && gameState.confidence > 0.5) {
    const typeNames: Record<string, string> = {
      aggressive: '激进型',
      defensive: '防守型',
      meta_follower: 'Meta型',
      counter_focused: '针对型',
      flex_master: '摇摆型',
    };
    const typeName = typeNames[gameState.predictedType] || '未知';
    reasons.push(`博弈分析：针对对手${typeName}打法`);
  }

  // 9. 如果理由太少，补充综合评估
  if (reasons.length === 0) {
    if (result.pts >= 65) {
      reasons.push('综合评估：该英雄综合推荐度高，建议优先选择');
    } else if (result.pts >= 40) {
      reasons.push('综合评估：该英雄表现稳定，可作为备选');
    } else {
      reasons.push('综合评估：该英雄适配度一般，建议观望');
    }
  } else if (reasons.length === 1) {
    // 如果只有一个理由，补充一个次要理由
    if (result.pts >= 50) {
      reasons.push('综合表现优秀');
    } else if (result.pts >= 30) {
      reasons.push('综合表现稳定');
    }
  }

  // 限制理由数量，最多显示3-4个最重要的
  const maxReasons = 4;
  const selectedReasons = reasons.slice(0, maxReasons);

  return selectedReasons.join('；');
}

/**
 * 为PTSResult添加等级和详细理由
 */
export async function enrichPTSResult(
  result: PTSResult,
  isBanPhase: boolean,
  ourPicks: string[] = [],
  opponentPicks: string[] = [],
  remainingRoles: Position[] = [],
  gameState?: GameTheoryState,
  useAI: boolean = false
): Promise<PTSResult> {
  const enriched = { ...result };

  // 添加等级
  if (isBanPhase) {
    enriched.threatLevel = calculateThreatLevel(result.pts);
    enriched.detailedReason = generateBanReason(result, gameState);
  } else {
    // 计算当前pick数量（用于阶段感知）
    const totalPickCount = ourPicks.length + opponentPicks.length;
    enriched.recommendLevel = calculateRecommendLevel(result.pts, totalPickCount);
    enriched.detailedReason = await generatePickReason(
      result,
      ourPicks,
      opponentPicks,
      remainingRoles,
      gameState,
      useAI
    );
  }

  return enriched;
}
