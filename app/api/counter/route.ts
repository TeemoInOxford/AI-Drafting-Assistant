/**
 * Counter API
 *
 * Returns counter data for same-role matchups.
 *
 * GET /api/counter?role=MID&target=Azir - Get top counters for Azir in MID role
 * GET /api/counter?champion=Orianna&target=Azir - Check if Orianna counters Azir (infers role)
 *
 * Optional:
 * - topK: number of results (default: 5)
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

interface CounterEntry {
  champion: string;
  games_weighted: number;
  win_rate_weighted: number;
  sample_size: number;
}

interface RoleCounterEntry {
  role: 'TOP' | 'JNG' | 'MID' | 'BOT' | 'SUP';
  target: string;
  counters: CounterEntry[];
}

interface CounterData {
  generated_at: string;
  beta: number;
  gamma: number;
  target_patch_index: number;
  entries: RoleCounterEntry[];
}

interface RolePosterior {
  champion_name: string;
  role_probabilities: {
    top: number;
    jungle: number;
    mid: number;
    bot: number;
    support: number;
  };
  significantRoles?: string[];
}

interface PosteriorData {
  champions: Record<string, RolePosterior>;
}

// ============================================================================
// Data Loading with Cache
// ============================================================================

let counterCache: { data: CounterData; timestamp: number } | null = null;
let posteriorCache: { data: PosteriorData; timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function loadCounterData(): CounterData | null {
  const now = Date.now();

  if (counterCache && now - counterCache.timestamp < CACHE_TTL_MS) {
    return counterCache.data;
  }

  try {
    const filePath = path.join(process.cwd(), 'data', 'grid_v2', 'champion_counters.json');
    if (!fs.existsSync(filePath)) {
      console.error('[counter] Data file not found');
      return null;
    }

    const data: CounterData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    counterCache = { data, timestamp: now };
    return data;
  } catch (error) {
    console.error('[counter] Failed to load data:', error);
    return null;
  }
}

function loadPosteriorData(): PosteriorData | null {
  const now = Date.now();

  if (posteriorCache && now - posteriorCache.timestamp < CACHE_TTL_MS) {
    return posteriorCache.data;
  }

  try {
    const filePath = path.join(process.cwd(), 'data', 'grid_v2', 'weighted-role-posteriors.json');
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const data: PosteriorData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    posteriorCache = { data, timestamp: now };
    return data;
  } catch (error) {
    return null;
  }
}

// ============================================================================
// Lookup Functions
// ============================================================================

const ROLE_MAP: Record<string, 'TOP' | 'JNG' | 'MID' | 'BOT' | 'SUP'> = {
  top: 'TOP',
  jungle: 'JNG',
  jng: 'JNG',
  mid: 'MID',
  bot: 'BOT',
  adc: 'BOT',
  support: 'SUP',
  sup: 'SUP',
};

function normalizeRole(role: string): 'TOP' | 'JNG' | 'MID' | 'BOT' | 'SUP' | null {
  return ROLE_MAP[role.toLowerCase()] || null;
}

function inferChampionRole(championName: string, posteriors: PosteriorData | null): string | null {
  if (!posteriors) return null;
  const posterior = posteriors.champions[championName];
  if (!posterior) return null;

  // Use significantRoles if available
  if (posterior.significantRoles && posterior.significantRoles.length > 0) {
    const role = posterior.significantRoles[0];
    return normalizeRole(role);
  }

  // Otherwise find max probability role
  const probs = posterior.role_probabilities;
  let maxRole = 'mid';
  let maxProb = 0;

  for (const [role, prob] of Object.entries(probs)) {
    if (prob > maxProb) {
      maxProb = prob;
      maxRole = role;
    }
  }

  return maxProb >= 0.5 ? normalizeRole(maxRole) : null;
}

function findCountersForTarget(
  entries: RoleCounterEntry[],
  role: string,
  target: string
): RoleCounterEntry | null {
  return entries.find(
    e => e.role === role && e.target.toLowerCase() === target.toLowerCase()
  ) || null;
}

function findSpecificCounter(
  entries: RoleCounterEntry[],
  role: string,
  target: string,
  counter: string
): CounterEntry | null {
  const entry = findCountersForTarget(entries, role, target);
  if (!entry) return null;
  return entry.counters.find(c => c.champion.toLowerCase() === counter.toLowerCase()) || null;
}

// ============================================================================
// API Handler
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse parameters
    const roleParam = searchParams.get('role');
    const targetParam = searchParams.get('target');
    const championParam = searchParams.get('champion'); // For specific counter check
    const topK = parseInt(searchParams.get('topK') || '5');

    if (!targetParam) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameter: target' },
        { status: 400 }
      );
    }

    // Load data
    const counterData = loadCounterData();
    if (!counterData) {
      return NextResponse.json(
        { success: false, error: 'Counter data not available' },
        { status: 500 }
      );
    }

    // Determine role
    let role: string | null = roleParam ? normalizeRole(roleParam) : null;

    // If no role provided, try to infer from target champion
    if (!role) {
      const posteriors = loadPosteriorData();
      role = inferChampionRole(targetParam, posteriors);
    }

    if (!role) {
      return NextResponse.json(
        { success: false, error: 'Could not determine role. Provide role parameter or use a champion with known role.' },
        { status: 400 }
      );
    }

    // Mode 1: Specific counter check
    if (championParam) {
      const counterEntry = findSpecificCounter(counterData.entries, role, targetParam, championParam);

      return NextResponse.json({
        success: true,
        mode: 'specific',
        role,
        target: targetParam,
        counter: championParam,
        data: counterEntry ? {
          games_weighted: counterEntry.games_weighted,
          win_rate_weighted: counterEntry.win_rate_weighted,
          sample_size: counterEntry.sample_size,
          is_effective: counterEntry.win_rate_weighted > 0.5,
        } : null,
        found: !!counterEntry,
      });
    }

    // Mode 2: Top counters for target
    const roleEntry = findCountersForTarget(counterData.entries, role, targetParam);

    if (!roleEntry) {
      return NextResponse.json({
        success: true,
        mode: 'list',
        role,
        target: targetParam,
        counters: [],
        message: 'No counter data available for this target',
      });
    }

    const topCounters = roleEntry.counters.slice(0, topK).map(c => ({
      champion: c.champion,
      games_weighted: c.games_weighted,
      win_rate_weighted: c.win_rate_weighted,
      sample_size: c.sample_size,
      is_effective: c.win_rate_weighted > 0.5,
    }));

    return NextResponse.json({
      success: true,
      mode: 'list',
      role,
      target: targetParam,
      counters: topCounters,
      total_counters: roleEntry.counters.length,
    });
  } catch (error) {
    console.error('[counter] API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
