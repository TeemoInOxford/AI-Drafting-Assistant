import { NextRequest, NextResponse } from 'next/server';
import { Position } from '@/app/lib/types';
import { loadWeightedRolePosteriors, getPrimaryRole } from '@/app/lib/weighted-role-loader';
import championRoleWinRates from '@/data/lol/champion-role-win-rates.json';

/**
 * Historical Role Outcomes API
 *
 * This API returns historical win rates by role for champions.
 * Role probabilities now come from weighted-role-posteriors.json (roles are observed values).
 *
 * Note: Win rates are still from champion-role-win-rates.json (separate data source).
 */

interface RoleWinRateData {
  games: number;
  wins: number;
  winRate: number;
}

interface ChampionWinRates {
  [role: string]: RoleWinRateData;
}

interface WinRatesData {
  updatedAt: string;
  globalStats: {
    totalChampions: number;
    totalGames: number;
    winRate: { mean: number; stdDev: number };
    roleProbability: { mean: number; stdDev: number; threshold: number };
    minSampleSize: number;
  };
  champions: Record<string, ChampionWinRates>;
}

interface RoleOutcomeResult {
  role_name: Position;
  probability: number;
  win_rate: number;
  sample_size: number;
  display_flag: boolean;
}

interface ChampionOutcome {
  championId: string;
  championName: string;
  roles: RoleOutcomeResult[];
  metadata: {
    thresholds: {
      probabilityThreshold: number;
      minSampleSize: number;
      winRateDeltaThreshold: number;
    };
    methodology_note: string;
    low_frequency_note: string;
  };
}

const winRatesData = championRoleWinRates as WinRatesData;

const METHODOLOGY_NOTE = "Historical outcome differences across role assignments reflect conditional historical outcomes only. Role probabilities are derived from weighted game observations, not inference.";
const LOW_FREQUENCY_NOTE = "Low-frequency roles may reflect niche usage or team-specific strategies.";
const WIN_RATE_DELTA_THRESHOLD = 0.10;

async function getHistoricalOutcomes(championName: string): Promise<ChampionOutcome | null> {
  const winRates = winRatesData.champions[championName];

  // Load role probabilities from new weighted data
  const weightedData = await loadWeightedRolePosteriors();
  const posterior = weightedData.champions[championName];

  if (!winRates || !posterior) {
    return null;
  }

  const { globalStats } = winRatesData;
  const roles: Position[] = ['top', 'jungle', 'mid', 'bot', 'support'];

  // Get primary role from weighted data
  const mainRole = getPrimaryRole(posterior.role_probabilities);
  const mainRoleWinRate = winRates[mainRole]?.winRate || 0.5;

  const results: RoleOutcomeResult[] = [];

  for (const role of roles) {
    const probability = posterior.role_probabilities[role] || 0;
    const roleData = winRates[role];
    const sampleSize = roleData?.games || 0;
    const winRate = roleData?.winRate || 0;

    // Check all three criteria for display flag
    const isLowProbability = probability > 0 && probability <= globalStats.roleProbability.threshold;
    const hasSufficientSample = sampleSize >= globalStats.minSampleSize;
    const hasNotableWinRateDiff = Math.abs(winRate - mainRoleWinRate) >= WIN_RATE_DELTA_THRESHOLD;

    // Display flag: only show if ALL criteria are met (and not main role)
    const displayFlag = role !== mainRole && isLowProbability && hasSufficientSample && hasNotableWinRateDiff;

    // Include main role for context, plus any flagged roles
    if (role === mainRole || displayFlag) {
      results.push({
        role_name: role,
        probability: Math.round(probability * 1000) / 1000,
        win_rate: Math.round(winRate * 1000) / 1000,
        sample_size: sampleSize,
        display_flag: displayFlag
      });
    }
  }

  // Sort: main role first, then by win rate descending
  results.sort((a, b) => {
    if (a.role_name === mainRole) return -1;
    if (b.role_name === mainRole) return 1;
    return b.win_rate - a.win_rate;
  });

  return {
    championId: posterior.champion_id,
    championName: posterior.champion_name,
    roles: results,
    metadata: {
      thresholds: {
        probabilityThreshold: globalStats.roleProbability.threshold,
        minSampleSize: globalStats.minSampleSize,
        winRateDeltaThreshold: WIN_RATE_DELTA_THRESHOLD
      },
      methodology_note: METHODOLOGY_NOTE,
      low_frequency_note: LOW_FREQUENCY_NOTE
    }
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { champions } = body;

    if (!champions || !Array.isArray(champions)) {
      return NextResponse.json(
        { error: 'Invalid request: champions array required' },
        { status: 400 }
      );
    }

    const results: ChampionOutcome[] = [];

    for (const champion of champions) {
      const championName = typeof champion === 'string' ? champion : champion.name;
      if (!championName) continue;

      const outcome = await getHistoricalOutcomes(championName);
      if (outcome) {
        results.push(outcome);
      }
    }

    return NextResponse.json({
      results,
      globalStats: winRatesData.globalStats,
      updatedAt: winRatesData.updatedAt
    });
  } catch (error) {
    console.error('Historical role outcomes API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const championName = searchParams.get('champion');

  if (!championName) {
    return NextResponse.json(
      { error: 'Missing champion parameter' },
      { status: 400 }
    );
  }

  const outcome = await getHistoricalOutcomes(championName);

  if (!outcome) {
    return NextResponse.json(
      { error: 'Champion not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    result: outcome,
    globalStats: winRatesData.globalStats,
    updatedAt: winRatesData.updatedAt
  });
}
