import { Champion, BPState, AIAnalysis, AIRecommendation, AIWarning, ActionType, Team } from './types';
import { bpStateToDraftState, getTopPTSChampions, DEFAULT_PTS_CONFIG } from './pts-engine';
import { getCurrentStep } from './bp-logic';
import { TeamChampionPool } from './team-champion-pool.types';
import { adjustBanScoreByTeamPool } from './ban-recommendation-adjuster';

// Warning templates
const WARNING_TEMPLATES = [
  { type: 'warning' as const, message: 'Team lacks AP damage, consider AP pick' },
  { type: 'warning' as const, message: 'No frontline yet, need tank or bruiser' },
  { type: 'warning' as const, message: 'Lacking crowd control for teamfights' },
  { type: 'danger' as const, message: 'Top lane constraints: limited options remaining' },
  { type: 'info' as const, message: 'Enemy comp is poke-heavy, consider hard engage' },
  { type: 'warning' as const, message: 'Team is full AD, enemy can stack armor' },
];

// Insight templates
const INSIGHT_TEMPLATES = [
  'Enemy has banned Galio, suggesting possible Ryze/Cassiopeia pick',
  'Red side has first pick advantage in phase 2',
  'Blue side can secure power pick with next selection',
  'Current draft favors scaling, consider early game pressure',
  'Enemy comp is teamfight-oriented, consider split-push strategy',
];

/**
 * Generate AI analysis using PTS system
 * 支持队伍英雄池的 Ban 推荐调整
 */
export function generateAIAnalysis(
  bpState: BPState,
  champions: Champion[],
  currentAction: ActionType,
  currentTeam: Team,
  enemyTeamPool?: TeamChampionPool | null
): AIAnalysis {
  // Get available champions
  const availableChampions = champions.filter(c => !bpState.usedChampions.has(c.id));

  // Get current step
  const currentStep = getCurrentStep(bpState);
  if (!currentStep) {
    return {
      recommendations: [],
      currentWinRate: 50,
      warnings: [],
      insights: [],
    };
  }

  // Convert to DraftState for PTS calculation
  const draftState = bpStateToDraftState(bpState, currentStep, currentTeam);

  // Calculate PTS for all available champions
  const ptsResults = getTopPTSChampions(draftState, availableChampions, 10, DEFAULT_PTS_CONFIG);

  // 如果是 Ban 阶段且有敌方队伍数据，根据队伍英雄池调整分数
  let adjustedResults = ptsResults;
  if (currentAction === 'ban' && enemyTeamPool) {
    adjustedResults = ptsResults.map(result => {
      const champion = champions.find(c => c.id === result.championId);
      if (!champion) return result;

      const adjustedScore = adjustBanScoreByTeamPool(
        champion,
        result.pts,
        enemyTeamPool,
        bpState
      );

      return {
        ...result,
        pts: adjustedScore,
      };
    });

    // 重新排序
    adjustedResults.sort((a, b) => b.pts - a.pts);
  }

  // Convert PTS results to AI recommendations (取前5个)
  const recommendations: AIRecommendation[] = adjustedResults.slice(0, 5).map((result) => ({
    champion: result.championName,
    score: result.pts,
    reason: result.explanation,
    pts: result.pts,
    riskTier: result.riskTier,
    winRate: undefined, // PTS doesn't predict win rate
  }));

  // Calculate current composition win rate (placeholder)
  const bluePickCount = bpState.bluePicks.filter(p => p).length;
  const redPickCount = bpState.redPicks.filter(p => p).length;
  const totalPicks = bluePickCount + redPickCount;
  const baseWinRate = 50;
  const variance = Math.floor(Math.random() * 10) - 5;
  const currentWinRate = Math.min(65, Math.max(35, baseWinRate + variance + (currentTeam === 'blue' ? 2 : -2)));

  // Generate warnings based on composition state
  const warnings: AIWarning[] = [];
  if (totalPicks >= 2 && Math.random() > 0.5) {
    const randomWarning = WARNING_TEMPLATES[Math.floor(Math.random() * WARNING_TEMPLATES.length)];
    warnings.push(randomWarning);
  }
  if (totalPicks >= 4 && Math.random() > 0.6) {
    const remainingWarnings = WARNING_TEMPLATES.filter(w => !warnings.some(existing => existing.message === w.message));
    if (remainingWarnings.length > 0) {
      warnings.push(remainingWarnings[Math.floor(Math.random() * remainingWarnings.length)]);
    }
  }

  // Add PTS-based warnings for critical threats
  const criticalThreats = ptsResults.filter(r => r.riskTier === 'critical');
  if (criticalThreats.length > 0) {
    warnings.unshift({
      type: 'danger',
      message: `CRITICAL: ${criticalThreats.length} high-threat champion(s) available to opponent`,
    });
  }

  // Generate insights
  const insights: string[] = [];
  if (totalPicks >= 1 && Math.random() > 0.4) {
    insights.push(INSIGHT_TEMPLATES[Math.floor(Math.random() * INSIGHT_TEMPLATES.length)]);
  }
  if (totalPicks >= 3 && Math.random() > 0.5) {
    const remaining = INSIGHT_TEMPLATES.filter(i => !insights.includes(i));
    if (remaining.length > 0) {
      insights.push(remaining[Math.floor(Math.random() * remaining.length)]);
    }
  }

  // Add PTS-based insights
  const highRiskCount = ptsResults.filter(r => r.riskTier === 'high' || r.riskTier === 'critical').length;
  if (highRiskCount >= 3) {
    insights.unshift(`${highRiskCount} champions pose significant pick threat - narrow window to act`);
  }

  return {
    recommendations,
    currentWinRate,
    warnings,
    insights,
  };
}

/**
 * Get composition score (placeholder)
 */
export function getCompositionScore(bpState: BPState, team: Team): number {
  const picks = team === 'blue' ? bpState.bluePicks : bpState.redPicks;
  const pickCount = picks.filter(p => p).length;

  // Simple placeholder scoring
  return Math.min(100, 40 + pickCount * 12 + Math.floor(Math.random() * 10));
}
