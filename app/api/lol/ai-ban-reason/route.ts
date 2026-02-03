/**
 * AI Ban Reason Generator API Endpoint
 * 使用Claude API生成专业的Ban推荐理由
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  AIBanReasonInput,
  fillBanReasonPrompt,
  generateBanReasonWithClaude,
} from '@/app/lib/ai-ban-reason-prompt';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { data, apiKey, model } = body as {
      data: AIBanReasonInput;
      apiKey?: string;
      model?: string;
    };

    // 验证必需参数
    if (!data) {
      return NextResponse.json(
        { error: 'Missing required parameter: data' },
        { status: 400 }
      );
    }

    // 获取API Key（优先使用请求中的，否则使用环境变量）
    const effectiveApiKey = apiKey || process.env.AI_BAN_REASON_API_KEY;

    if (!effectiveApiKey) {
      return NextResponse.json(
        { error: 'API key not provided. Please set AI_BAN_REASON_API_KEY in environment variables or pass it in the request.' },
        { status: 400 }
      );
    }

    // 检查是否启用AI生成
    const isEnabled = process.env.AI_BAN_REASON_ENABLED === 'true';
    if (!isEnabled) {
      return NextResponse.json(
        { error: 'AI Ban Reason generation is not enabled. Set AI_BAN_REASON_ENABLED=true in environment variables.' },
        { status: 403 }
      );
    }

    console.log('[AI Ban Reason API] Generating reason for:', data.championName);

    // 调用Claude API生成理由
    const aiGeneratedReason = await generateBanReasonWithClaude(
      data,
      effectiveApiKey,
      model || process.env.AI_BAN_REASON_MODEL || 'claude-3-5-sonnet-20241022'
    );

    console.log('[AI Ban Reason API] Successfully generated reason');

    // 解析AI生成的理由
    const parsedReason = parseAIGeneratedReason(aiGeneratedReason);

    return NextResponse.json({
      success: true,
      reason: parsedReason.reason,
      detailedReason: parsedReason.detailedReason,
      rawResponse: aiGeneratedReason,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[AI Ban Reason API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate AI ban reason',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'AI Ban Reason Generator API',
    version: '1.0.0',
    status: process.env.AI_BAN_REASON_ENABLED === 'true' ? 'enabled' : 'disabled',
    endpoints: {
      POST: {
        description: 'Generate AI-powered ban reason',
        parameters: {
          data: 'AIBanReasonInput - Ban scoring data',
          apiKey: 'string (optional) - Claude API key (overrides env var)',
          model: 'string (optional) - Claude model to use (default: claude-3-5-sonnet-20241022)',
        },
      },
    },
  });
}

/**
 * 解析AI生成的理由
 * 从AI响应中提取结构化的理由
 * 新格式：3-5行简洁的Ban理由，无标题无编号
 */
function parseAIGeneratedReason(aiResponse: string): {
  reason: string;
  detailedReason: string[];
} {
  // 清理响应文本，移除代码块标记和空行
  let cleanedResponse = aiResponse
    .replace(/```/g, '')
    .trim();

  // 按行分割，过滤空行和示例说明
  const lines = cleanedResponse
    .split('\n')
    .map(line => line.trim())
    .filter(line => {
      // 过滤空行
      if (!line) return false;
      // 过滤示例说明行
      if (line.startsWith('（') || line.startsWith('(')) return false;
      // 过滤markdown标题
      if (line.startsWith('#')) return false;
      return true;
    });

  // 如果没有有效行，返回默认值
  if (lines.length === 0) {
    return {
      reason: '综合评估推荐',
      detailedReason: ['综合评估推荐'],
    };
  }

  // 第一行作为简短主理由
  const shortReason = lines[0];

  // 所有行作为详细理由
  const detailedReason = lines;

  return {
    reason: shortReason,
    detailedReason,
  };
}
