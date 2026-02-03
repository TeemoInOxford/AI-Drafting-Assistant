/**
 * /api/bp/draft-quality/samples
 *
 * Streaming filter for draft quality JSONL data.
 *
 * GET /api/bp/draft-quality/samples?slot=PICK_4&version=v2&limit=200&sort=regret_desc&bestIsActual=false
 *
 * Query params:
 *   - version: v0 | v1 | v2 (required)
 *   - slot: PICK_1 | PICK_2 | PICK_3 | PICK_4 | PICK_5 (optional, filter)
 *   - limit: number (default 100, max 1000)
 *   - sort: regret_desc | regret_asc | percentile_desc | percentile_asc (default regret_desc)
 *   - bestIsActual: true | false (optional, filter)
 *   - minRegret: number (optional, filter records with regret >= minRegret)
 *   - maxPercentile: number (optional, filter records with percentile <= maxPercentile)
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const DATA_DIR = path.join(process.cwd(), 'data', 'grid_v2');

interface DraftQualityRecord {
  gameId: string;
  patch: string | null;
  startedAt: string;
  side: string;
  slot: string;
  teamId: string;
  actual_pick: string;
  actual_pick_id: string;
  actual_role: string | null;
  actual_rank: number;
  actual_score: number;
  best_pick: string;
  best_pick_id: string;
  best_score: number;
  regret: number;
  percentile: number;
  num_candidates: number;
  outcome: number;
  counter_for_raw: number;
  counter_for_count: number;
  actual_role_coverage: number;
  best_role_coverage: number;
  bestIsActual: boolean;
  actual_was_unknown?: boolean;
}

// Reservoir sampler for random sampling with limit
class ReservoirSampler<T> {
  private items: T[] = [];
  private seen = 0;

  constructor(private k: number) {}

  add(item: T): void {
    this.seen++;
    if (this.items.length < this.k) {
      this.items.push(item);
    } else {
      const j = Math.floor(Math.random() * this.seen);
      if (j < this.k) {
        this.items[j] = item;
      }
    }
  }

  getItems(): T[] {
    return this.items;
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // Parse query params
  const version = searchParams.get('version');
  const slot = searchParams.get('slot');
  const limitStr = searchParams.get('limit');
  const sort = searchParams.get('sort') || 'regret_desc';
  const bestIsActualStr = searchParams.get('bestIsActual');
  const minRegretStr = searchParams.get('minRegret');
  const maxPercentileStr = searchParams.get('maxPercentile');

  // Validate version
  if (!version || !['v0', 'v1', 'v2'].includes(version)) {
    return NextResponse.json(
      { error: 'Invalid or missing version param. Use v0, v1, or v2.' },
      { status: 400 }
    );
  }

  const limit = Math.min(Math.max(parseInt(limitStr || '100', 10), 1), 1000);
  const bestIsActual = bestIsActualStr === null ? null : bestIsActualStr === 'true';
  const minRegret = minRegretStr ? parseFloat(minRegretStr) : null;
  const maxPercentile = maxPercentileStr ? parseFloat(maxPercentileStr) : null;

  const dataFile = path.join(DATA_DIR, `draft_quality_${version}.jsonl`);

  if (!fs.existsSync(dataFile)) {
    return NextResponse.json(
      { error: `Data file not found for ${version}. Run: npx tsx scripts/draft_quality_eval.ts --fix all` },
      { status: 404 }
    );
  }

  try {
    // Use reservoir sampling with filters
    const sampler = new ReservoirSampler<DraftQualityRecord>(limit * 3); // oversample for sorting
    const fileStream = fs.createReadStream(dataFile, 'utf-8');
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let totalMatched = 0;

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line) as DraftQualityRecord;

        // Apply filters
        if (slot && record.slot !== slot) continue;
        if (bestIsActual !== null && record.bestIsActual !== bestIsActual) continue;
        if (minRegret !== null && record.regret < minRegret) continue;
        if (maxPercentile !== null && record.percentile > maxPercentile) continue;

        totalMatched++;
        sampler.add(record);
      } catch {
        // Skip malformed lines
      }
    }

    let results = sampler.getItems();

    // Sort results
    switch (sort) {
      case 'regret_desc':
        results.sort((a, b) => b.regret - a.regret);
        break;
      case 'regret_asc':
        results.sort((a, b) => a.regret - b.regret);
        break;
      case 'percentile_desc':
        results.sort((a, b) => b.percentile - a.percentile);
        break;
      case 'percentile_asc':
        results.sort((a, b) => a.percentile - b.percentile);
        break;
    }

    // Take only requested limit
    results = results.slice(0, limit);

    return NextResponse.json({
      version,
      slot: slot || 'all',
      total_matched: totalMatched,
      returned: results.length,
      sort,
      filters: {
        bestIsActual,
        minRegret,
        maxPercentile,
      },
      samples: results,
    });
  } catch (error) {
    console.error('Error reading JSONL:', error);
    return NextResponse.json(
      { error: 'Failed to read data file' },
      { status: 500 }
    );
  }
}
