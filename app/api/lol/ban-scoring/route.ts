/**
 * Ban Scoring API Endpoint
 * 提供高级 Ban 推荐服务
 */

import { NextRequest, NextResponse } from 'next/server';
import { Champion, BPState } from '@/app/lib/types';
import { TeamChampionPool } from '@/app/lib/team-champion-pool.types';
import {
  getAdvancedBanRecommendations,
  getAdvancedBanRecommendationsAsync,
  getBanRecommendationsByType,
  getBanRecommendationsByTypeAsync,
} from '@/app/lib/advanced-ban-scoring';
import { BanScoringConfig, DEFAULT_BAN_SCORING_CONFIG } from '@/app/lib/advanced-ban-scoring.types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      allChampions,
      bpState,
      enemyTeamPool,
      championStatsMap,
      config,
      topN,
      filterType,
      useAI, // 新增：是否使用AI生成理由
    } = body;

    // 验证必需参数
    if (!allChampions || !bpState) {
      return NextResponse.json(
        { error: 'Missing required parameters: allChampions, bpState' },
        { status: 400 }
      );
    }

    // 转换 bpState.usedChampions 从数组到 Set（JSON 序列化会将 Set 转为数组）
    const reconstructedBpState: BPState = {
      ...bpState,
      usedChampions: new Set(
        Array.isArray(bpState.usedChampions)
          ? bpState.usedChampions
          : Array.from(bpState.usedChampions || [])
      ),
    };

    // 转换 championStatsMap 从对象到 Map
    let statsMap: Map<string, { winRate: number; banRate: number; pickRate: number }> | undefined;
    if (championStatsMap) {
      statsMap = new Map(Object.entries(championStatsMap));
    }

    // 转换 enemyTeamPool 的 championAvailability 从对象到 Map
    let enemyPool: TeamChampionPool | null = null;
    if (enemyTeamPool) {
      enemyPool = {
        ...enemyTeamPool,
        championAvailability: new Map(Object.entries(enemyTeamPool.championAvailability || {})),
        generatedAt: new Date(enemyTeamPool.generatedAt),
      };
    }

    // 使用配置或默认配置
    const scoringConfig: BanScoringConfig = config || DEFAULT_BAN_SCORING_CONFIG;

    // 检查是否启用AI生成
    const shouldUseAI = useAI === true && process.env.AI_BAN_REASON_ENABLED === 'true';

    console.log('[Ban Scoring API] Calculating recommendations...', {
      championsCount: allChampions.length,
      currentStep: bpState.currentStep,
      usedChampionsCount: reconstructedBpState.usedChampions.size,
      useAI: shouldUseAI,
    });

    // 根据是否有 filterType 选择不同的推荐函数
    let recommendations;
    if (filterType) {
      if (shouldUseAI) {
        recommendations = await getBanRecommendationsByTypeAsync(
          allChampions,
          reconstructedBpState,
          enemyPool,
          filterType,
          topN || 5,
          shouldUseAI
        );
      } else {
        recommendations = getBanRecommendationsByType(
          allChampions,
          reconstructedBpState,
          enemyPool,
          filterType,
          topN || 5
        );
      }
    } else {
      if (shouldUseAI) {
        recommendations = await getAdvancedBanRecommendationsAsync(
          allChampions,
          reconstructedBpState,
          enemyPool,
          statsMap,
          scoringConfig,
          topN || 10,
          shouldUseAI
        );
      } else {
        recommendations = getAdvancedBanRecommendations(
          allChampions,
          reconstructedBpState,
          enemyPool,
          statsMap,
          scoringConfig,
          topN || 10
        );
      }
    }

    console.log('[Ban Scoring API] Results:', {
      count: recommendations.length,
      top3: recommendations.slice(0, 3).map(r => `${r.championName}:${r.finalScore.toFixed(1)}`),
      aiGenerated: shouldUseAI,
    });

    return NextResponse.json({
      success: true,
      recommendations,
      timestamp: new Date().toISOString(),
      aiGenerated: shouldUseAI,
      debug: {
        recommendationsCount: recommendations.length,
        topScores: recommendations.slice(0, 3).map(r => ({
          name: r.championName,
          score: r.finalScore.toFixed(1),
          priority: r.priority,
        })),
      },
    });
  } catch (error) {
    console.error('Ban scoring API error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Ban Scoring API',
    version: '1.0.0',
    endpoints: {
      POST: {
        description: 'Get advanced ban recommendations',
        parameters: {
          allChampions: 'Champion[] - All available champions',
          bpState: 'BPState - Current BP state',
          enemyTeamPool: 'TeamChampionPool | null - Enemy team champion pool (optional)',
          championStatsMap: 'Record<string, Stats> - Champion statistics (optional)',
          config: 'BanScoringConfig - Scoring configuration (optional)',
          topN: 'number - Number of recommendations to return (default: 10)',
          filterType: '"signature" | "system" | "position" | "protection" - Filter by type (optional)',
        },
      },
    },
  });
}
