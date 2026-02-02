/**
 * API endpoint to initialize draft data analyzer
 * This loads and caches all historical draft data for PTS calculations
 */

import { NextResponse } from 'next/server';
import { analyzeAllDraftData } from '@/app/lib/draft-data-analyzer';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    console.log('[Draft Data API] Starting data analysis...');
    const startTime = Date.now();

    const { championStats, synergyMap, counterMap } = analyzeAllDraftData();

    const endTime = Date.now();
    const duration = endTime - startTime;

    const championCount = Object.keys(championStats).length;
    const synergyCount = Array.from(synergyMap.values()).reduce(
      (sum, map) => sum + map.size,
      0
    );
    const counterCount = Array.from(counterMap.values()).reduce(
      (sum, map) => sum + map.size,
      0
    );

    console.log(`[Draft Data API] Analysis complete in ${duration}ms`);
    console.log(`[Draft Data API] Champions: ${championCount}, Synergies: ${synergyCount}, Counters: ${counterCount}`);

    return NextResponse.json({
      success: true,
      stats: {
        championCount,
        synergyCount,
        counterCount,
        durationMs: duration,
      },
      message: 'Draft data analyzed and cached successfully',
    });
  } catch (error) {
    console.error('[Draft Data API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to analyze draft data',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
