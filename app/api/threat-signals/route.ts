/**
 * Threat Signals API Route
 *
 * 威胁信号查询 API
 *
 * Supports two data sources:
 * - source=lol (default): Legacy 173MB threat-signals.json
 * - source=grid_v2: New grid_v2/team_threat_signals.json (Team-level only)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getTeamThreat,
  getPlayerThreat,
  getTopThreatsForTargetTeam,
  getTopThreatsForPlayer,
  getCombinedThreatEvidence,
  getAllTeamThreats,
  getThreatMeta,
  batchGetTeamThreats,
} from '@/app/lib/threat-engine';
import {
  getGridV2TeamThreat,
  getGridV2AllTeamThreats,
  getGridV2TopTeamThreats,
  getGridV2ThreatMeta,
  batchGetGridV2TeamThreats,
  getGridV2PlayerThreat,
  getGridV2AllPlayerTeamThreats,
  getGridV2TopPlayerTeamThreats,
  getGridV2PlayerThreatMeta,
  batchGetGridV2PlayerTeamThreats,
} from '@/app/lib/grid-v2-threat-engine';
import { normalizeTeamId } from '@/app/lib/team-id-resolver';
import { ThreatSignalsRequest } from '@/app/lib/threat-types';
import { type LeagueKey, migrateRegionToLeague } from '@/app/lib/league-types';

/**
 * Resolve league/region parameter to a valid LeagueKey or undefined.
 * Prefers 'league' over 'region' for backwards compatibility.
 * Returns undefined for 'global' to indicate no filtering.
 */
function resolveLeagueParam(league?: LeagueKey | string, region?: string): string | undefined {
  // Prefer league param if provided
  if (league) {
    // If it's 'global', no filtering needed
    if (league === 'global') return undefined;
    // Use migrateRegionToLeague to validate/normalize
    const resolved = migrateRegionToLeague(league);
    return resolved === 'global' ? undefined : resolved;
  }

  // Fall back to legacy region param
  if (region) {
    const resolved = migrateRegionToLeague(region);
    return resolved === 'global' ? undefined : resolved;
  }

  return undefined;
}

export async function POST(request: NextRequest) {
  try {
    const body: ThreatSignalsRequest = await request.json();
    const { queryType, targetTeamId, playerId, championId, patch, league, region, topK } = body;

    // Resolve league param (prefers league over region)
    const resolvedLeague = resolveLeagueParam(league, region);

    switch (queryType) {
      case 'team': {
        if (!targetTeamId || !championId) {
          return NextResponse.json(
            { success: false, error: 'Missing targetTeamId or championId' },
            { status: 400 }
          );
        }
        const result = getTeamThreat({ targetTeamId, championId, patch, region: resolvedLeague });
        return NextResponse.json({ success: true, data: result });
      }

      case 'player': {
        if (!playerId || !championId) {
          return NextResponse.json(
            { success: false, error: 'Missing playerId or championId' },
            { status: 400 }
          );
        }
        const result = getPlayerThreat({ playerId, championId, patch, region: resolvedLeague });
        return NextResponse.json({ success: true, data: result });
      }

      case 'topTeam': {
        if (!targetTeamId) {
          return NextResponse.json(
            { success: false, error: 'Missing targetTeamId' },
            { status: 400 }
          );
        }
        const result = getTopThreatsForTargetTeam({ targetTeamId, patch, region: resolvedLeague, topK });
        return NextResponse.json({ success: true, data: result });
      }

      case 'topPlayer': {
        if (!playerId) {
          return NextResponse.json(
            { success: false, error: 'Missing playerId' },
            { status: 400 }
          );
        }
        const result = getTopThreatsForPlayer({ playerId, patch, region: resolvedLeague, topK });
        return NextResponse.json({ success: true, data: result });
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid queryType' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Threat signals API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for batch queries and metadata
 * Supports source=grid_v2 for new Team-level threat signals
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const source = searchParams.get('source') || 'lol'; // Default to legacy source

    // Grid V2 source handlers (Team-level only)
    if (source === 'grid_v2') {
      switch (action) {
        case 'meta': {
          const meta = getGridV2ThreatMeta();
          return NextResponse.json({ success: true, source: 'grid_v2', data: meta });
        }

        case 'team': {
          const rawTeamId = searchParams.get('team_id') || searchParams.get('targetTeamId');
          const championName = searchParams.get('champion') || searchParams.get('championId');
          const targetTeamId = normalizeTeamId(rawTeamId);

          if (!targetTeamId || !championName) {
            return NextResponse.json(
              { success: false, error: 'Missing team_id or champion (team_id could not be resolved)' },
              { status: 400 }
            );
          }

          const result = getGridV2TeamThreat(targetTeamId, championName);
          return NextResponse.json({ success: true, source: 'grid_v2', data: result });
        }

        case 'allTeam': {
          const rawTeamId = searchParams.get('team_id') || searchParams.get('targetTeamId');
          const targetTeamId = normalizeTeamId(rawTeamId);

          if (!targetTeamId) {
            return NextResponse.json(
              { success: false, error: 'Missing team_id (could not be resolved)' },
              { status: 400 }
            );
          }

          const threats = getGridV2AllTeamThreats(targetTeamId);
          return NextResponse.json({ success: true, source: 'grid_v2', data: threats });
        }

        case 'topTeam': {
          const rawTeamId = searchParams.get('team_id') || searchParams.get('targetTeamId');
          const targetTeamId = normalizeTeamId(rawTeamId);
          const topK = parseInt(searchParams.get('topK') || '10');

          if (!targetTeamId) {
            return NextResponse.json(
              { success: false, error: 'Missing team_id (could not be resolved)' },
              { status: 400 }
            );
          }

          const threats = getGridV2TopTeamThreats(targetTeamId, topK);
          return NextResponse.json({ success: true, source: 'grid_v2', data: threats });
        }

        case 'batch': {
          const rawTeamId = searchParams.get('team_id') || searchParams.get('targetTeamId');
          const targetTeamId = normalizeTeamId(rawTeamId);
          const championNames = searchParams.get('champions')?.split(',') ||
                               searchParams.get('championIds')?.split(',') || [];

          if (!targetTeamId || championNames.length === 0) {
            return NextResponse.json(
              { success: false, error: 'Missing team_id or champions' },
              { status: 400 }
            );
          }

          const results = batchGetGridV2TeamThreats(targetTeamId, championNames);
          const data: Record<string, any> = {};
          results.forEach((value, key) => {
            data[key] = value;
          });

          return NextResponse.json({ success: true, source: 'grid_v2', data });
        }

        // Player Threat (PLAYER_SPECIALTY) actions
        case 'playerMeta': {
          const meta = getGridV2PlayerThreatMeta();
          return NextResponse.json({ success: true, source: 'grid_v2', type: 'player', data: meta });
        }

        case 'playerTeam': {
          const rawTeamId = searchParams.get('team_id') || searchParams.get('targetTeamId');
          const targetTeamId = normalizeTeamId(rawTeamId);

          if (!targetTeamId) {
            return NextResponse.json(
              { success: false, error: 'Missing team_id (could not be resolved)' },
              { status: 400 }
            );
          }

          const threats = getGridV2AllPlayerTeamThreats(targetTeamId);
          return NextResponse.json({ success: true, source: 'grid_v2', type: 'player', data: threats });
        }

        case 'playerTopTeam': {
          const rawTeamId = searchParams.get('team_id') || searchParams.get('targetTeamId');
          const targetTeamId = normalizeTeamId(rawTeamId);
          const topK = parseInt(searchParams.get('topK') || searchParams.get('k') || '10');

          if (!targetTeamId) {
            return NextResponse.json(
              { success: false, error: 'Missing team_id (could not be resolved)' },
              { status: 400 }
            );
          }

          const threats = getGridV2TopPlayerTeamThreats(targetTeamId, topK);
          return NextResponse.json({ success: true, source: 'grid_v2', type: 'player', data: threats });
        }

        case 'playerBatch': {
          const rawTeamId = searchParams.get('team_id') || searchParams.get('targetTeamId');
          const targetTeamId = normalizeTeamId(rawTeamId);
          const championNames = searchParams.get('champions')?.split(',') ||
                               searchParams.get('championIds')?.split(',') || [];

          if (!targetTeamId || championNames.length === 0) {
            return NextResponse.json(
              { success: false, error: 'Missing team_id or champions' },
              { status: 400 }
            );
          }

          const results = batchGetGridV2PlayerTeamThreats(targetTeamId, championNames);
          const data: Record<string, any> = {};
          results.forEach((value, key) => {
            data[key] = value;
          });

          return NextResponse.json({ success: true, source: 'grid_v2', type: 'player', data });
        }

        default:
          return NextResponse.json(
            { success: false, error: 'Invalid action for grid_v2. Use: meta, team, allTeam, topTeam, batch, playerMeta, playerTeam, playerTopTeam, playerBatch' },
            { status: 400 }
          );
      }
    }

    // Legacy (lol) source handlers
    switch (action) {
      case 'meta': {
        const meta = getThreatMeta();
        return NextResponse.json({ success: true, data: meta });
      }

      case 'batch': {
        const targetTeamId = searchParams.get('targetTeamId');
        const championIds = searchParams.get('championIds')?.split(',') || [];
        const patch = searchParams.get('patch') || undefined;
        // Support both league and region params (prefer league)
        const league = searchParams.get('league') || undefined;
        const region = searchParams.get('region') || undefined;
        const resolvedLeague = resolveLeagueParam(league, region);

        if (!targetTeamId || championIds.length === 0) {
          return NextResponse.json(
            { success: false, error: 'Missing targetTeamId or championIds' },
            { status: 400 }
          );
        }

        const results = batchGetTeamThreats(targetTeamId, championIds, patch, resolvedLeague);
        const data: Record<string, any> = {};
        results.forEach((value, key) => {
          data[key] = value;
        });

        return NextResponse.json({ success: true, data });
      }

      case 'allTeam': {
        const targetTeamId = searchParams.get('targetTeamId');
        const patch = searchParams.get('patch') || undefined;
        // Support both league and region params (prefer league)
        const league = searchParams.get('league') || undefined;
        const region = searchParams.get('region') || undefined;
        const resolvedLeague = resolveLeagueParam(league, region);

        if (!targetTeamId) {
          return NextResponse.json(
            { success: false, error: 'Missing targetTeamId' },
            { status: 400 }
          );
        }

        const threats = getAllTeamThreats(targetTeamId, patch, resolvedLeague);
        return NextResponse.json({ success: true, data: threats });
      }

      case 'combined': {
        const targetTeamId = searchParams.get('targetTeamId');
        const championId = searchParams.get('championId');
        const playerIds = searchParams.get('playerIds')?.split(',') || [];
        const patch = searchParams.get('patch') || undefined;
        // Support both league and region params (prefer league)
        const league = searchParams.get('league') || undefined;
        const region = searchParams.get('region') || undefined;
        const resolvedLeague = resolveLeagueParam(league, region);

        if (!targetTeamId || !championId) {
          return NextResponse.json(
            { success: false, error: 'Missing targetTeamId or championId' },
            { status: 400 }
          );
        }

        const evidence = getCombinedThreatEvidence(
          targetTeamId,
          championId,
          playerIds,
          patch,
          resolvedLeague
        );
        return NextResponse.json({ success: true, data: evidence });
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action. Use: meta, batch, allTeam, combined' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Threat signals API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
