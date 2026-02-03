import { NextRequest, NextResponse } from 'next/server';
import {
  loadWeightedRolePosteriors,
  getPrimaryRole,
} from '@/app/lib/weighted-role-loader';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');

    if (!name) {
      return NextResponse.json(
        { error: 'missing name parameter' },
        { status: 400 }
      );
    }

    const data = await loadWeightedRolePosteriors();
    const champion = data.champions[name];

    if (!champion) {
      return NextResponse.json(
        { error: 'unknown champion' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      champion_name: champion.champion_name,
      champion_id: champion.champion_id,
      primary_role: getPrimaryRole(champion.role_probabilities),
      role_probabilities: champion.role_probabilities,
      raw_counts_by_role: champion.raw_counts_by_role,
      weighted_counts_by_role: champion.weighted_counts_by_role,
      effective_sample_size: champion.effective_sample_size,
      significantRoles: champion.significantRoles,
      isFlexPick: champion.isFlexPick,
      flexibilityScore: champion.flexibilityScore,
    });
  } catch (err) {
    console.error('Error in /api/roles/champion:', err);
    return NextResponse.json(
      { error: 'internal error' },
      { status: 500 }
    );
  }
}
