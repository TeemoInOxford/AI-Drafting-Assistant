/**
 * Pick Prediction API
 *
 * Predicts the next pick for a team based on historical blueprint data.
 *
 * GET /api/pick-prediction?team_id=...&side=blue|red&pick_slot=P1|P2|P3|P4|P5
 *
 * Optional:
 * - opponent_last_pick: string - Boost champions that are common responses
 * - already_picked: string (comma-separated) - Filter out already picked champions
 * - topK: number - Number of predictions to return (default 5)
 *
 * Response:
 * {
 *   success: boolean,
 *   team_id: string,
 *   team_name: string,
 *   side: string,
 *   pick_slot: string,
 *   predictions: Array<{ champion: string, probability: number, base_rate: number, response_boost?: number }>,
 *   sample_size: number,
 *   low_data: boolean
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { normalizeTeamId, getTeamById } from '@/app/lib/team-id-resolver';

// ============================================================================
// Types
// ============================================================================

interface PickSlotData {
  top_picks: Array<{ champion: string; count: number; rate: number }>;
  total: number;
}

interface SideData {
  games: number;
  pick_slots: Record<string, PickSlotData>;
  overall_top_picks: Array<{ champion: string; count: number; rate: number }>;
}

interface TeamPickBlueprint {
  team_name: string;
  total_games: number;
  blue_side: SideData;
  red_side: SideData;
  pick_response_map: Record<string, Record<string, number>>;
}

interface BlueprintData {
  generated_at: string;
  total_teams: number;
  total_games: number;
  teams: Record<string, TeamPickBlueprint>;
}

// ============================================================================
// Data Loading with Cache
// ============================================================================

let blueprintCache: { data: BlueprintData; timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function loadBlueprints(): BlueprintData | null {
  const now = Date.now();

  if (blueprintCache && now - blueprintCache.timestamp < CACHE_TTL_MS) {
    return blueprintCache.data;
  }

  try {
    const filePath = path.join(process.cwd(), 'data', 'grid_v2', 'team_pick_blueprints.json');
    if (!fs.existsSync(filePath)) {
      console.error('[pick-prediction] Blueprint file not found');
      return null;
    }

    const data: BlueprintData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    blueprintCache = { data, timestamp: now };
    return data;
  } catch (error) {
    console.error('[pick-prediction] Failed to load blueprints:', error);
    return null;
  }
}

// ============================================================================
// Prediction Logic
// ============================================================================

interface PredictionResult {
  champion: string;
  probability: number;
  base_rate: number;
  response_boost?: number;
}

function generatePredictions(
  blueprint: TeamPickBlueprint,
  side: 'blue' | 'red',
  pickSlot: string,
  opponentLastPick: string | null,
  alreadyPicked: Set<string>,
  topK: number
): { predictions: PredictionResult[]; sample_size: number; low_data: boolean } {
  const sideData = side === 'blue' ? blueprint.blue_side : blueprint.red_side;
  const slotData = sideData.pick_slots[pickSlot];

  // Build candidate scores
  const candidateScores = new Map<string, { base_rate: number; response_boost: number }>();

  // Add slot-specific picks
  if (slotData && slotData.top_picks) {
    for (const pick of slotData.top_picks) {
      if (!alreadyPicked.has(pick.champion.toLowerCase())) {
        candidateScores.set(pick.champion, {
          base_rate: pick.rate,
          response_boost: 0,
        });
      }
    }
  }

  // Add overall picks as fallback
  for (const pick of sideData.overall_top_picks) {
    if (!alreadyPicked.has(pick.champion.toLowerCase()) && !candidateScores.has(pick.champion)) {
      candidateScores.set(pick.champion, {
        base_rate: pick.rate * 0.5, // Discount overall picks
        response_boost: 0,
      });
    }
  }

  // Apply response boost if opponent_last_pick is provided
  if (opponentLastPick && blueprint.pick_response_map[opponentLastPick]) {
    const responses = blueprint.pick_response_map[opponentLastPick];
    const totalResponses = Object.values(responses).reduce((sum, c) => sum + c, 0);

    for (const [champion, count] of Object.entries(responses)) {
      if (!alreadyPicked.has(champion.toLowerCase())) {
        const responseRate = count / totalResponses;

        if (candidateScores.has(champion)) {
          const existing = candidateScores.get(champion)!;
          existing.response_boost = responseRate;
        } else {
          candidateScores.set(champion, {
            base_rate: 0.01, // Small base for response-only picks
            response_boost: responseRate,
          });
        }
      }
    }
  }

  // Calculate final scores and normalize
  const scoredCandidates: Array<{ champion: string; score: number; base_rate: number; response_boost: number }> = [];

  for (const [champion, data] of candidateScores) {
    // Score = base_rate * (1 + response_boost)
    const score = data.base_rate * (1 + data.response_boost);
    scoredCandidates.push({
      champion,
      score,
      base_rate: data.base_rate,
      response_boost: data.response_boost,
    });
  }

  // Sort by score descending
  scoredCandidates.sort((a, b) => b.score - a.score);

  // Take top K
  const topCandidates = scoredCandidates.slice(0, topK);

  // Normalize to probabilities
  const totalScore = topCandidates.reduce((sum, c) => sum + c.score, 0);

  const predictions: PredictionResult[] = topCandidates.map(c => ({
    champion: c.champion,
    probability: totalScore > 0 ? c.score / totalScore : 0,
    base_rate: c.base_rate,
    response_boost: c.response_boost > 0 ? c.response_boost : undefined,
  }));

  const sample_size = slotData?.total || sideData.games;
  const low_data = sample_size < 10;

  return { predictions, sample_size, low_data };
}

// ============================================================================
// API Handler
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse parameters
    const rawTeamId = searchParams.get('team_id');
    const side = searchParams.get('side') as 'blue' | 'red' | null;
    const pickSlot = searchParams.get('pick_slot') || 'P1';
    const opponentLastPick = searchParams.get('opponent_last_pick');
    const alreadyPickedRaw = searchParams.get('already_picked') || '';
    const topK = parseInt(searchParams.get('topK') || '5');

    // Validate
    if (!rawTeamId) {
      return NextResponse.json(
        { success: false, error: 'Missing team_id parameter' },
        { status: 400 }
      );
    }

    if (!side || !['blue', 'red'].includes(side)) {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid side parameter (must be blue or red)' },
        { status: 400 }
      );
    }

    // Resolve team ID
    const teamId = normalizeTeamId(rawTeamId);
    if (!teamId) {
      return NextResponse.json(
        { success: false, error: `Could not resolve team_id: ${rawTeamId}` },
        { status: 400 }
      );
    }

    // Load blueprints
    const blueprints = loadBlueprints();
    if (!blueprints) {
      return NextResponse.json(
        { success: false, error: 'Blueprint data not available' },
        { status: 500 }
      );
    }

    // Get team blueprint
    const blueprint = blueprints.teams[teamId];
    if (!blueprint) {
      // Try to get team name for error message
      const teamInfo = getTeamById(teamId);
      return NextResponse.json({
        success: true,
        team_id: teamId,
        team_name: teamInfo?.name || 'Unknown',
        side,
        pick_slot: pickSlot,
        predictions: [],
        sample_size: 0,
        low_data: true,
        message: 'No blueprint data for this team',
      });
    }

    // Parse already picked
    const alreadyPicked = new Set(
      alreadyPickedRaw
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(s => s.length > 0)
    );

    // Generate predictions
    const { predictions, sample_size, low_data } = generatePredictions(
      blueprint,
      side,
      pickSlot,
      opponentLastPick,
      alreadyPicked,
      topK
    );

    return NextResponse.json({
      success: true,
      team_id: teamId,
      team_name: blueprint.team_name,
      side,
      pick_slot: pickSlot,
      predictions,
      sample_size,
      low_data,
    });
  } catch (error) {
    console.error('[pick-prediction] API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
