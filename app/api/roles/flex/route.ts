import { NextRequest, NextResponse } from 'next/server';
import {
  loadLeaguePosteriorsWithFallback,
  resolveLeague,
} from '@/app/lib/league-posterior-engine';
import { getPrimaryRole } from '@/app/lib/weighted-role-loader';
import type { ChampionRolePosterior } from '@/app/lib/weighted-role-types';

const DEFAULT_MIN_SCORE = 0.35;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DEFAULT_MIN_ESS = 5;
const DEFAULT_MAX_ROLES = 3;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);

    // Parse league (default global)
    const leagueParam = searchParams.get('league');
    const league = resolveLeague(leagueParam);

    // Parse minScore (default 0.35)
    const minScoreParam = searchParams.get('minScore');
    const minScore = minScoreParam !== null
      ? parseFloat(minScoreParam)
      : DEFAULT_MIN_SCORE;

    if (Number.isNaN(minScore)) {
      return NextResponse.json(
        { error: 'invalid minScore parameter' },
        { status: 400 }
      );
    }

    // Parse limit (default 50, max 200)
    const limitParam = searchParams.get('limit');
    let limit = limitParam !== null
      ? parseInt(limitParam, 10)
      : DEFAULT_LIMIT;

    if (Number.isNaN(limit) || limit < 1) {
      return NextResponse.json(
        { error: 'invalid limit parameter' },
        { status: 400 }
      );
    }
    limit = Math.min(limit, MAX_LIMIT);

    // Parse minEss (default 5, 0 disables filter)
    const minEssParam = searchParams.get('minEss');
    const minEss = minEssParam !== null
      ? parseFloat(minEssParam)
      : DEFAULT_MIN_ESS;

    if (Number.isNaN(minEss) || minEss < 0) {
      return NextResponse.json(
        { error: 'invalid minEss parameter' },
        { status: 400 }
      );
    }

    // Parse maxRoles (default 3)
    const maxRolesParam = searchParams.get('maxRoles');
    const maxRoles = maxRolesParam !== null
      ? parseInt(maxRolesParam, 10)
      : DEFAULT_MAX_ROLES;

    if (Number.isNaN(maxRoles) || !Number.isInteger(maxRoles) || maxRoles < 1) {
      return NextResponse.json(
        { error: 'invalid maxRoles parameter' },
        { status: 400 }
      );
    }

    // Load league-aware posteriors with fallback
    const { data, fallbackChampions, leagueTotalGames } =
      await loadLeaguePosteriorsWithFallback(league);

    // Filter and sort
    const allChampions: ChampionRolePosterior[] = Object.values(data.champions);
    const flexChampions = allChampions
      .filter(c =>
        c.isFlexPick &&
        c.flexibilityScore >= minScore &&
        c.effective_sample_size >= minEss &&
        c.significantRoles.length <= maxRoles
      )
      .sort((a, b) => b.flexibilityScore - a.flexibilityScore)
      .slice(0, limit)
      .map(c => ({
        champion_name: c.champion_name,
        champion_id: c.champion_id,
        primary_role: getPrimaryRole(c.role_probabilities),
        flexibilityScore: c.flexibilityScore,
        significantRoles: c.significantRoles,
        role_probabilities: c.role_probabilities,
        raw_counts_by_role: c.raw_counts_by_role,
        effective_sample_size: c.effective_sample_size,
        // Indicate if this champion fell back to global
        usedGlobalFallback: fallbackChampions.has(c.champion_name),
      }));

    return NextResponse.json({
      count: flexChampions.length,
      league,
      leagueTotalGames: league !== 'global' ? leagueTotalGames : undefined,
      champions: flexChampions,
    });
  } catch (err) {
    console.error('Error in /api/roles/flex:', err);
    return NextResponse.json(
      { error: 'internal error' },
      { status: 500 }
    );
  }
}
