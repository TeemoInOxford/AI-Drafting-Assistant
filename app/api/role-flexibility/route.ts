import { NextRequest, NextResponse } from 'next/server';
import { loadLeaguePosteriorsWithFallback, resolveLeague } from '@/app/lib/league-posterior-engine';
import { toRoleFlexibilityDistribution, RoleFlexibilityDistribution } from '@/app/lib/role-flexibility';
import { Champion, Position } from '@/app/lib/types';
import type { ChampionRolePosterior, WeightedRolePosteriorsData } from '@/app/lib/weighted-role-types';

/**
 * POST /api/role-flexibility
 *
 * Returns role flexibility distributions for a list of champions.
 * Data source: weighted-role-posteriors.json (roles are observed values, not inferred)
 *
 * Request body:
 *   {
 *     champions: Champion[],
 *     filledRoles?: Position[],
 *     league?: string  // e.g., "LCK", "LPL", "LEC", "LCS", "LTA North", "LTA South", or "global"
 *   }
 *
 * Response:
 *   {
 *     league: string,
 *     results: [{
 *       championId: string,
 *       championName: string,
 *       championUuid: string|null,
 *       found: boolean,
 *       flexibility: RoleFlexibilityDistribution | null,
 *       usedGlobalFallback: boolean
 *     }]
 *   }
 */

interface FlexibilityResult {
  championId: string;
  championName: string;
  championUuid: string | null;
  found: boolean;
  flexibility: RoleFlexibilityDistribution | null;
  usedGlobalFallback: boolean;
}

/**
 * Build lookup indexes for efficient champion resolution.
 */
function buildPosteriorIndexes(data: WeightedRolePosteriorsData): {
  byExactName: Map<string, ChampionRolePosterior>;
  byLowerName: Map<string, ChampionRolePosterior>;
  byChampionId: Map<string, ChampionRolePosterior>;
} {
  const byExactName = new Map<string, ChampionRolePosterior>();
  const byLowerName = new Map<string, ChampionRolePosterior>();
  const byChampionId = new Map<string, ChampionRolePosterior>();

  for (const [key, posterior] of Object.entries(data.champions)) {
    byExactName.set(key, posterior);
    byLowerName.set(key.toLowerCase(), posterior);
    if (posterior.champion_id) {
      byChampionId.set(posterior.champion_id, posterior);
      byChampionId.set(posterior.champion_id.toLowerCase(), posterior);
    }
  }

  return { byExactName, byLowerName, byChampionId };
}

/**
 * Resolve a Champion to its ChampionRolePosterior with fallback matching.
 */
function resolvePosterior(
  champion: Champion,
  indexes: ReturnType<typeof buildPosteriorIndexes>
): ChampionRolePosterior | null {
  const exact = indexes.byExactName.get(champion.name);
  if (exact) return exact;

  const lower = indexes.byLowerName.get(champion.name.toLowerCase());
  if (lower) return lower;

  if (champion.id) {
    const byId = indexes.byChampionId.get(champion.id);
    if (byId) return byId;

    const byIdLower = indexes.byChampionId.get(champion.id.toLowerCase());
    if (byIdLower) return byIdLower;

    const byNameFromId = indexes.byExactName.get(champion.id);
    if (byNameFromId) return byNameFromId;
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { champions, filledRoles, league: leagueParam } = body as {
      champions: Champion[];
      filledRoles?: Position[];
      league?: string;
    };

    if (!champions || !Array.isArray(champions)) {
      return NextResponse.json(
        { error: 'Invalid request: champions array required' },
        { status: 400 }
      );
    }

    const league = resolveLeague(leagueParam);

    // Load league-aware posteriors with per-champion fallback
    const { data, fallbackChampions } =
      await loadLeaguePosteriorsWithFallback(league);

    // Build indexes once for efficient lookup
    const indexes = buildPosteriorIndexes(data);

    // Transform each champion to FlexibilityResult
    const results: FlexibilityResult[] = champions.map((champion: Champion) => {
      const posterior = resolvePosterior(champion, indexes);

      if (!posterior) {
        return {
          championId: champion.id,
          championName: champion.name,
          championUuid: null,
          found: false,
          flexibility: null,
          usedGlobalFallback: false,
        };
      }

      const flexibility = toRoleFlexibilityDistribution(
        posterior,
        filledRoles || []
      );

      return {
        championId: champion.id,
        championName: champion.name,
        championUuid: posterior.champion_id,
        found: true,
        flexibility,
        usedGlobalFallback: fallbackChampions.has(posterior.champion_name),
      };
    });

    return NextResponse.json({ league, results });
  } catch (error) {
    console.error('Role flexibility API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
