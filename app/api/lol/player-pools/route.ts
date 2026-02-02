import { NextRequest, NextResponse } from 'next/server';
import { generatePlayerPools } from '@/app/lib/v4/l0-data/player-pools';

// Cache for player pools
let playerPoolsCache: Map<string, any> | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const playerIds = searchParams.get('playerIds')?.split(',').filter(Boolean);

  try {
    // Check cache
    const now = Date.now();
    if (!playerPoolsCache || now - cacheTimestamp > CACHE_DURATION) {
      console.log('[Player Pools API] Generating player pools...');
      playerPoolsCache = await generatePlayerPools(playerIds);
      cacheTimestamp = now;
      console.log(`[Player Pools API] Generated pools for ${playerPoolsCache.size} players`);
    }

    // Convert Map to object for JSON serialization
    const poolsObject: Record<string, any> = {};
    for (const [playerId, pool] of playerPoolsCache.entries()) {
      // Filter by requested player IDs if provided
      if (playerIds && !playerIds.includes(playerId)) {
        continue;
      }

      poolsObject[playerId] = {
        playerId: pool.playerId,
        championFrequencies: pool.championFrequencies,
        recentPicks: pool.recentPicks,
        totalGames: pool.totalGames,
        uniqueChampions: pool.uniqueChampions,
        confidence: pool.confidence,
        lastUpdated: pool.lastUpdated,
      };
    }

    return NextResponse.json({
      success: true,
      playerPools: poolsObject,
      totalPlayers: Object.keys(poolsObject).length,
      cacheAge: Math.floor((now - cacheTimestamp) / 1000), // seconds
    });
  } catch (error) {
    console.error('[Player Pools API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to load player pools',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
