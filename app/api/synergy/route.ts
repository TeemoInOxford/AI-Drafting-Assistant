/**
 * Synergy API
 *
 * Returns synergy data for champion pairs.
 *
 * GET /api/synergy?champions=A,B - Get synergy for specific pair
 * GET /api/synergy?champion=A&allies=B,C,D - Get synergy of A with multiple allies (returns top synergies)
 *
 * Optional:
 * - side: BLUE|RED|ANY (default: ANY)
 * - topK: number of results (default: 5)
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

interface SynergyEntry {
  champions: [string, string];
  side: 'BLUE' | 'RED' | 'ANY';
  games_weighted: number;
  win_rate_weighted: number;
  lift: number;
  sample_size: number;
}

interface SynergyData {
  generated_at: string;
  beta: number;
  gamma: number;
  target_patch_index: number;
  entries: SynergyEntry[];
}

// ============================================================================
// Data Loading with Cache
// ============================================================================

let synergyCache: { data: SynergyData; timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function loadSynergyData(): SynergyData | null {
  const now = Date.now();

  if (synergyCache && now - synergyCache.timestamp < CACHE_TTL_MS) {
    return synergyCache.data;
  }

  try {
    const filePath = path.join(process.cwd(), 'data', 'grid_v2', 'champion_synergies.json');
    if (!fs.existsSync(filePath)) {
      console.error('[synergy] Data file not found');
      return null;
    }

    const data: SynergyData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    synergyCache = { data, timestamp: now };
    return data;
  } catch (error) {
    console.error('[synergy] Failed to load data:', error);
    return null;
  }
}

// ============================================================================
// Lookup Functions
// ============================================================================

function findPairSynergy(
  entries: SynergyEntry[],
  champA: string,
  champB: string,
  side: string
): SynergyEntry | null {
  const [c1, c2] = [champA, champB].sort();
  return entries.find(
    e => e.champions[0] === c1 && e.champions[1] === c2 && e.side === side
  ) || null;
}

function findSynergiesWithChampion(
  entries: SynergyEntry[],
  champion: string,
  side: string,
  excludeChampions: Set<string>
): SynergyEntry[] {
  return entries.filter(e => {
    if (e.side !== side) return false;
    const hasChamp = e.champions.includes(champion);
    if (!hasChamp) return false;
    const partner = e.champions[0] === champion ? e.champions[1] : e.champions[0];
    return !excludeChampions.has(partner.toLowerCase());
  });
}

// ============================================================================
// API Handler
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse parameters
    const championsParam = searchParams.get('champions'); // "A,B" for specific pair
    const championParam = searchParams.get('champion'); // Single champion
    const alliesParam = searchParams.get('allies'); // "B,C,D" for ally synergies
    const side = (searchParams.get('side')?.toUpperCase() || 'ANY') as 'BLUE' | 'RED' | 'ANY';
    const topK = parseInt(searchParams.get('topK') || '5');

    // Load data
    const synergyData = loadSynergyData();
    if (!synergyData) {
      return NextResponse.json(
        { success: false, error: 'Synergy data not available' },
        { status: 500 }
      );
    }

    // Mode 1: Specific pair lookup
    if (championsParam) {
      const [champA, champB] = championsParam.split(',').map(s => s.trim());
      if (!champA || !champB) {
        return NextResponse.json(
          { success: false, error: 'Invalid champions parameter. Use format: champions=A,B' },
          { status: 400 }
        );
      }

      const synergy = findPairSynergy(synergyData.entries, champA, champB, side);

      return NextResponse.json({
        success: true,
        mode: 'pair',
        champions: [champA, champB],
        side,
        synergy: synergy ? {
          games_weighted: synergy.games_weighted,
          win_rate_weighted: synergy.win_rate_weighted,
          lift: synergy.lift,
          sample_size: synergy.sample_size,
        } : null,
        found: !!synergy,
      });
    }

    // Mode 2: Champion + allies lookup
    if (championParam) {
      const allies = alliesParam
        ? alliesParam.split(',').map(s => s.trim().toLowerCase())
        : [];

      // Find synergies with each ally
      const allyResults: Array<{
        ally: string;
        synergy: {
          games_weighted: number;
          win_rate_weighted: number;
          lift: number;
          sample_size: number;
        } | null;
      }> = [];

      for (const ally of allies) {
        const synergy = findPairSynergy(
          synergyData.entries,
          championParam,
          ally.charAt(0).toUpperCase() + ally.slice(1), // Capitalize
          side
        );
        allyResults.push({
          ally,
          synergy: synergy ? {
            games_weighted: synergy.games_weighted,
            win_rate_weighted: synergy.win_rate_weighted,
            lift: synergy.lift,
            sample_size: synergy.sample_size,
          } : null,
        });
      }

      // Find top synergy partners (excluding already selected allies)
      const excludeSet = new Set(allies.map(a => a.toLowerCase()));
      excludeSet.add(championParam.toLowerCase());

      const allSynergies = findSynergiesWithChampion(
        synergyData.entries,
        championParam,
        side,
        excludeSet
      );

      // Sort by lift (synergy value) descending
      allSynergies.sort((a, b) => b.lift - a.lift);
      const topSynergies = allSynergies.slice(0, topK).map(e => ({
        partner: e.champions[0] === championParam ? e.champions[1] : e.champions[0],
        games_weighted: e.games_weighted,
        win_rate_weighted: e.win_rate_weighted,
        lift: e.lift,
        sample_size: e.sample_size,
      }));

      // Calculate average synergy with allies
      const validAllySynergies = allyResults.filter(r => r.synergy !== null);
      const avgLift = validAllySynergies.length > 0
        ? validAllySynergies.reduce((sum, r) => sum + (r.synergy?.lift || 0), 0) / validAllySynergies.length
        : 0;
      const avgWinRate = validAllySynergies.length > 0
        ? validAllySynergies.reduce((sum, r) => sum + (r.synergy?.win_rate_weighted || 0), 0) / validAllySynergies.length
        : 0;

      return NextResponse.json({
        success: true,
        mode: 'champion_allies',
        champion: championParam,
        side,
        ally_synergies: allyResults,
        aggregate: {
          avg_lift: Math.round(avgLift * 10000) / 10000,
          avg_win_rate: Math.round(avgWinRate * 10000) / 10000,
          allies_with_data: validAllySynergies.length,
          total_allies: allies.length,
        },
        top_synergy_partners: topSynergies,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Missing required parameter. Use champions=A,B or champion=A&allies=B,C' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[synergy] API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
