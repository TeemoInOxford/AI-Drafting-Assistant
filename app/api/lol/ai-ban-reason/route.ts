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
 */
function parseAIGeneratedReason(aiResponse: string): {
  reason: string;
  detailedReason: string[];
} {
  const lines = aiResponse.split('\n').filter(line => line.trim());

  // 提取各个部分
  const sections: Record<string, string> = {};
  let currentSection = '';

  for (const line of lines) {
    if (line.startsWith('**') && line.endsWith(':**')) {
      // 这是一个标题行
      currentSection = line.replace(/\*\*/g, '').replace(':', '').trim();
      sections[currentSection] = '';
    } else if (currentSection && line.trim()) {
      // 这是内容行
      sections[currentSection] = line.trim();
    }
  }

  // 构建简短主理由（从限制原因中提取）
  const shortReason = sections['限制原因'] || sections['针对对象'] || '综合评估推荐';

  // 构建详细理由数组
  const detailedReason: string[] = [];
  const sectionOrder = ['针对对象', '限制原因', '战术价值', '时机说明'];

  for (const sectionName of sectionOrder) {
    if (sections[sectionName]) {
      detailedReason.push(`**${sectionName}:** ${sections[sectionName]}`);
    }
  }

  return {
    reason: shortReason,
    detailedReason,
  };
}
