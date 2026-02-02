/**
 * AI生成Ban理由 - 前端使用示例
 *
 * 本文件展示如何在前端代码中使用AI生成Ban理由功能
 */

// ============================================================================
// 示例1: 在Ban Scoring API调用中启用AI生成
// ============================================================================

async function getBanRecommendationsWithAI(
  allChampions: Champion[],
  bpState: BPState,
  enemyTeamPool: TeamChampionPool | null
) {
  try {
    const response = await fetch('/api/lol/ban-scoring', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        allChampions,
        bpState,
        enemyTeamPool,
        topN: 10,
        useAI: true,  // ✅ 启用AI生成
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    console.log('AI Generated:', data.aiGenerated);  // true/false
    console.log('Recommendations:', data.recommendations);

    return data.recommendations;
  } catch (error) {
    console.error('Failed to get ban recommendations:', error);
    throw error;
  }
}

// ============================================================================
// 示例2: 根据用户设置动态选择是否使用AI
// ============================================================================

interface UserSettings {
  enableAIGeneration: boolean;
}

async function getBanRecommendations(
  allChampions: Champion[],
  bpState: BPState,
  enemyTeamPool: TeamChampionPool | null,
  userSettings: UserSettings
) {
  const response = await fetch('/api/lol/ban-scoring', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      allChampions,
      bpState,
      enemyTeamPool,
      topN: 10,
      useAI: userSettings.enableAIGeneration,  // 根据用户设置
    }),
  });

  const data = await response.json();
  return data.recommendations;
}

// ============================================================================
// 示例3: 直接调用AI Ban Reason API（单个英雄）
// ============================================================================

async function generateBanReasonForChampion(
  championData: AIBanReasonInput
) {
  try {
    const response = await fetch('/api/lol/ai-ban-reason', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: championData,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const result = await response.json();

    console.log('Short Reason:', result.reason);
    console.log('Detailed Reason:', result.detailedReason);

    return {
      reason: result.reason,
      detailedReason: result.detailedReason,
    };
  } catch (error) {
    console.error('Failed to generate AI ban reason:', error);
    throw error;
  }
}

// ============================================================================
// 示例4: 在React组件中使用
// ============================================================================

import { useState, useEffect } from 'react';

function BanRecommendationPanel() {
  const [recommendations, setRecommendations] = useState<BanScoreResult[]>([]);
  const [useAI, setUseAI] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchRecommendations = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/lol/ban-scoring', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          allChampions,
          bpState,
          enemyTeamPool,
          useAI,  // 使用状态中的值
        }),
      });

      const data = await response.json();
      setRecommendations(data.recommendations);
    } catch (error) {
      console.error('Failed to fetch recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="controls">
        <label>
          <input
            type="checkbox"
            checked={useAI}
            onChange={(e) => setUseAI(e.target.checked)}
          />
          使用AI生成理由
        </label>
        <button onClick={fetchRecommendations} disabled={loading}>
          {loading ? '加载中...' : '获取推荐'}
        </button>
      </div>

      <div className="recommendations">
        {recommendations.map((rec) => (
          <div key={rec.championId} className="recommendation-card">
            <h3>{rec.championName}</h3>
            <p className="score">评分: {rec.finalScore.toFixed(1)}</p>
            <p className="reason">{rec.reason}</p>
            <div className="detailed-reason">
              {rec.detailedReason.map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 示例5: 带错误处理和重试的完整实现
// ============================================================================

async function getBanRecommendationsWithRetry(
  allChampions: Champion[],
  bpState: BPState,
  enemyTeamPool: TeamChampionPool | null,
  useAI: boolean = false,
  maxRetries: number = 3
): Promise<BanScoreResult[]> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${maxRetries}...`);

      const response = await fetch('/api/lol/ban-scoring', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          allChampions,
          bpState,
          enemyTeamPool,
          useAI,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Unknown error');
      }

      console.log(`Success! AI Generated: ${data.aiGenerated}`);
      return data.recommendations;
    } catch (error) {
      lastError = error as Error;
      console.error(`Attempt ${attempt} failed:`, error);

      // 如果不是最后一次尝试，等待后重试
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // 所有重试都失败
  throw new Error(`Failed after ${maxRetries} attempts: ${lastError?.message}`);
}

// ============================================================================
// 示例6: 批量生成Ban理由（优化性能）
// ============================================================================

async function generateBanReasonsInBatch(
  champions: Champion[],
  bpState: BPState,
  enemyTeamPool: TeamChampionPool | null,
  useAI: boolean = false
): Promise<Map<string, { reason: string; detailedReason: string[] }>> {
  // 一次性获取所有推荐
  const response = await fetch('/api/lol/ban-scoring', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      allChampions: champions,
      bpState,
      enemyTeamPool,
      topN: champions.length,  // 获取所有英雄的推荐
      useAI,
    }),
  });

  const data = await response.json();

  // 构建Map方便查找
  const reasonsMap = new Map<string, { reason: string; detailedReason: string[] }>();

  for (const rec of data.recommendations) {
    reasonsMap.set(rec.championId, {
      reason: rec.reason,
      detailedReason: rec.detailedReason,
    });
  }

  return reasonsMap;
}

// ============================================================================
// 示例7: 性能监控
// ============================================================================

async function getBanRecommendationsWithMetrics(
  allChampions: Champion[],
  bpState: BPState,
  enemyTeamPool: TeamChampionPool | null,
  useAI: boolean = false
) {
  const startTime = performance.now();

  try {
    const response = await fetch('/api/lol/ban-scoring', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        allChampions,
        bpState,
        enemyTeamPool,
        useAI,
      }),
    });

    const data = await response.json();
    const endTime = performance.now();
    const duration = endTime - startTime;

    // 记录性能指标
    console.log('Performance Metrics:', {
      duration: `${duration.toFixed(2)}ms`,
      aiGenerated: data.aiGenerated,
      recommendationsCount: data.recommendations.length,
      avgTimePerRecommendation: `${(duration / data.recommendations.length).toFixed(2)}ms`,
    });

    return data.recommendations;
  } catch (error) {
    const endTime = performance.now();
    const duration = endTime - startTime;

    console.error('Request failed:', {
      duration: `${duration.toFixed(2)}ms`,
      error,
    });

    throw error;
  }
}

// ============================================================================
// 类型定义（参考）
// ============================================================================

interface Champion {
  id: string;
  name: string;
  positions: string[];
}

interface BPState {
  currentStep: number;
  blueBans: any[];
  redBans: any[];
  bluePicks: any[];
  redPicks: any[];
  usedChampions: Set<string>;
}

interface TeamChampionPool {
  teamId: string;
  championAvailability: Map<string, any>;
  generatedAt: Date;
}

interface BanScoreResult {
  championId: string;
  championName: string;
  finalScore: number;
  reason: string;
  detailedReason: string[];
  priority: 'critical' | 'high' | 'medium' | 'low';
}

interface AIBanReasonInput {
  championName: string;
  positionName: string;
  playerName: string;
  proficiencyScore: number;
  proficiencyStars: string;
  usageRate: number;
  isSignature: boolean;
  heroStrength: number;
  metaTier: string;
  compressionScore: number;
  alternatives: string;
  systemCoreScore: number;
  systemName: string;
  recencyScore: number;
  targetingScore: number;
  bpPhase: string;
  bannedChampions: string;
}

export {
  getBanRecommendationsWithAI,
  getBanRecommendations,
  generateBanReasonForChampion,
  getBanRecommendationsWithRetry,
  generateBanReasonsInBatch,
  getBanRecommendationsWithMetrics,
};
