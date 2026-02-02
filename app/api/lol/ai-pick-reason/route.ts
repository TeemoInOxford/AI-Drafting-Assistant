/**
 * AI Pick Reason Generator API Endpoint
 * 使用Claude API生成专业的Pick推荐理由
 */

import { NextRequest, NextResponse } from 'next/server';
import { DraftState } from '@/app/lib/v4/types/common-types';
import { Champion } from '@/app/lib/types';
import {
  AIPickReasonInput,
  generatePickReasonWithClaude,
  parsePickReasons,
} from '@/app/lib/ai-pick-reason-prompt';
import { buildPickReasonInput } from '@/app/lib/ai-pick-recommendation-service-internal';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { draftState, champion, aggregatedScore, l1Evaluation, apiKey, model } = body as {
      draftState: DraftState;
      champion: Champion;
      aggregatedScore?: any;
      l1Evaluation?: any;
      apiKey?: string;
      model?: string;
    };

    // 验证必需参数
    if (!draftState || !champion) {
      return NextResponse.json(
        { error: 'Missing required parameters: draftState and champion' },
        { status: 400 }
      );
    }

    // 获取API Key（优先使用请求中的，否则使用环境变量）
    const effectiveApiKey = apiKey || process.env.AI_PICK_REASON_API_KEY || process.env.AI_BAN_REASON_API_KEY;

    if (!effectiveApiKey) {
      return NextResponse.json(
        { error: 'API key not provided. Please set AI_PICK_REASON_API_KEY or AI_BAN_REASON_API_KEY in environment variables or pass it in the request.' },
        { status: 400 }
      );
    }

    // 检查是否启用AI生成
    const isEnabled = process.env.AI_PICK_REASON_ENABLED === 'true';
    if (!isEnabled) {
      return NextResponse.json(
        { error: 'AI Pick Reason generation is not enabled. Set AI_PICK_REASON_ENABLED=true in environment variables.' },
        { status: 403 }
      );
    }

    console.log('[AI Pick Reason API] Generating reasons for:', champion.name);

    // 构建输入数据
    const input: AIPickReasonInput = aggregatedScore && l1Evaluation
      ? buildPickReasonInput(draftState, champion, aggregatedScore, l1Evaluation)
      : buildSimplePickReasonInput(draftState, champion);

    // 调用Claude API生成理由
    const aiGeneratedReason = await generatePickReasonWithClaude(
      input,
      effectiveApiKey,
      model || process.env.AI_PICK_REASON_MODEL || process.env.AI_BAN_REASON_MODEL || 'claude-3-5-sonnet-20241022'
    );

    console.log('[AI Pick Reason API] Successfully generated reasons');

    // 解析AI生成的理由
    const reasons = parsePickReasons(aiGeneratedReason);

    return NextResponse.json({
      success: true,
      reasons,
      rawResponse: aiGeneratedReason,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[AI Pick Reason API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate AI pick reasons',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'AI Pick Reason Generator API',
    version: '1.0.0',
    status: process.env.AI_PICK_REASON_ENABLED === 'true' ? 'enabled' : 'disabled',
    endpoints: {
      POST: {
        description: 'Generate AI-powered pick reasons',
        parameters: {
          draftState: 'DraftState - Current draft state',
          champion: 'Champion - Champion to generate reasons for',
          aggregatedScore: 'AggregatedScore (optional) - L2 aggregated score',
          l1Evaluation: 'L1ChampionEvaluation (optional) - L1 evaluation data',
          apiKey: 'string (optional) - Claude API key (overrides env var)',
          model: 'string (optional) - Claude model to use (default: claude-3-5-sonnet-20241022)',
        },
      },
    },
  });
}

/**
 * 构建简化的Pick理由输入（当没有评估数据时）
 */
function buildSimplePickReasonInput(
  draftState: DraftState,
  champion: Champion
): AIPickReasonInput {
  const POSITION_NAMES: Record<string, string> = {
    top: '上单',
    jungle: '打野',
    mid: '中单',
    bot: 'ADC',
    support: '辅助',
  };

  const BP_PHASE_NAMES: Record<string, string> = {
    ban1: 'Ban阶段1',
    pick1: 'Pick阶段1',
    ban2: 'Ban阶段2',
    pick2: 'Pick阶段2',
  };

  const side = draftState.side;
  const isBlue = side === 'blue';

  const ourPicks = isBlue ? draftState.bluePicks : draftState.redPicks;
  const enemyPicks = isBlue ? draftState.redPicks : draftState.bluePicks;
  const ourBans = isBlue ? draftState.blueBans : draftState.redBans;
  const enemyBans = isBlue ? draftState.redBans : draftState.blueBans;
  const ourRemainingRoles = isBlue
    ? draftState.blueRemainingRoles
    : draftState.redRemainingRoles;
  const enemyRemainingRoles = isBlue
    ? draftState.redRemainingRoles
    : draftState.blueRemainingRoles;

  const position = champion.positions[0];
  const positionName = POSITION_NAMES[position] || position;
  const bpPhase = BP_PHASE_NAMES[draftState.phase] || draftState.phase;

  return {
    championName: champion.name,
    positionName,
    bpPhase,
    ourPicks: ourPicks.length > 0 ? ourPicks.join('、') : '无',
    enemyPicks: enemyPicks.length > 0 ? enemyPicks.join('、') : '无',
    ourBans: ourBans.length > 0 ? ourBans.join('、') : '无',
    enemyBans: enemyBans.length > 0 ? enemyBans.join('、') : '无',
    ourRemainingRoles:
      ourRemainingRoles.length > 0
        ? ourRemainingRoles.map(r => POSITION_NAMES[r] || r).join('、')
        : '无',
    enemyRemainingRoles:
      enemyRemainingRoles.length > 0
        ? enemyRemainingRoles.map(r => POSITION_NAMES[r] || r).join('、')
        : '无',
    synergyScore: 70,
    counterScore: 65,
    metaStrength: 75,
    roleMatch: 85,
  };
}
