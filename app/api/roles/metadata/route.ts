import { NextResponse } from 'next/server';
import { loadWeightedRolePosteriors } from '@/app/lib/weighted-role-loader';

/**
 * GET /api/roles/metadata
 *
 * Returns metadata about the weighted role posteriors dataset.
 * Useful for displaying data version info on the UI.
 */
export async function GET() {
  try {
    const data = await loadWeightedRolePosteriors();
    const { metadata } = data;

    return NextResponse.json({
      generated_at_utc: metadata.generated_at_utc,
      target_patch: metadata.target_patch,
      target_patch_index: metadata.target_patch_index,
      total_effective_weight: metadata.total_effective_weight,
      total_champions: Object.keys(data.champions).length,
      parameters: {
        beta: metadata.parameters.beta,
        gamma: metadata.parameters.gamma,
        kappa: metadata.parameters.kappa,
        team_weight_sensitivity: metadata.parameters.team_weight_sensitivity,
        min_display_threshold: metadata.parameters.min_display_threshold,
        delta_patch_cap: metadata.parameters.delta_patch_cap,
      },
      data_quality: {
        total_games_processed: metadata.data_quality.total_games_processed,
        games_skipped_missing_patch: metadata.data_quality.games_skipped_missing_patch,
      },
    });
  } catch (error) {
    console.error('Error in /api/roles/metadata:', error);
    return NextResponse.json(
      { error: 'Failed to load metadata' },
      { status: 500 }
    );
  }
}
