#!/usr/bin/env ts-node
/**
 * generate_ban_reason_scores.ts
 *
 * 基于 ban_reason_events.jsonl 生成可解释的理由分数
 *
 * 理由定义 (v1):
 * - META:    版本强势 proxy (meta_presence_score)
 * - TARGET:  针对对手英雄池 (opponent_pool_score)
 * - CONTEXT: 版本时效/近期性 (1 / (1 + delta_patch))
 *
 * 运行方式:
 *   npx tsx scripts/generate_ban_reason_scores.ts
 *
 * 输出:
 *   data/grid_v2/ban_reason_scores.json
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ============================================================================
// Constants
// ============================================================================

const DATA_DIR = path.join(process.cwd(), 'data', 'grid_v2');
const INPUT_FILE = path.join(DATA_DIR, 'ban_reason_events.jsonl');
const OUTPUT_FILE = path.join(DATA_DIR, 'ban_reason_scores.json');

const LOW_CONFIDENCE_THRESHOLD = 5;

// ============================================================================
// Types
// ============================================================================

interface BanReasonEvent {
  team_id: string;
  team_name: string;
  side: 'BLUE' | 'RED';
  ban_slot: 1 | 2 | 3;
  banned_champion_id: string;
  banned_champion_name: string;
  feature_proxies: {
    meta_presence_score: number | null;
    opponent_pool_score: number | null;
    recency_weight: {
      delta_patch: number | null;
    };
  };
}

interface RawScores {
  meta_raw: number;
  target_raw: number;
  context_raw: number;
}

interface AggregatedData {
  team_id: string;
  team_name: string;
  side: 'blue' | 'red';
  ban_slot: 1 | 2 | 3;
  champion_id: string;
  champion_name: string;
  raw_scores: RawScores[];
}

interface ReasonScores {
  META: number;
  TARGET: number;
  CONTEXT: number;
}

interface BanReasonScoreEntry {
  team_id: string;
  team_name: string;
  side: 'blue' | 'red';
  ban_slot: 1 | 2 | 3;
  champion_id: string;
  champion_name: string;
  sample_size: number;
  low_confidence: boolean;
  reasons: ReasonScores;
}

interface OutputData {
  generated_at: string;
  source_file: string;
  total_entries: number;
  low_confidence_count: number;
  reason_definitions: {
    META: string;
    TARGET: string;
    CONTEXT: string;
  };
  entries: BanReasonScoreEntry[];
}

interface Stats {
  eventsProcessed: number;
  eventsSkipped: number;
  uniqueKeys: number;
  lowConfidenceCount: number;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generate aggregation key for grouping
 */
function getAggKey(
  teamId: string,
  side: string,
  banSlot: number,
  championName: string
): string {
  return `${teamId}|${side}|${banSlot}|${championName}`;
}

/**
 * Calculate raw scores from feature proxies
 */
function calculateRawScores(event: BanReasonEvent): RawScores | null {
  const meta_raw = event.feature_proxies.meta_presence_score;
  const target_raw = event.feature_proxies.opponent_pool_score;
  const delta_patch = event.feature_proxies.recency_weight?.delta_patch;

  // Skip if essential fields are missing
  if (meta_raw === null || meta_raw === undefined) return null;
  if (target_raw === null || target_raw === undefined) return null;
  if (delta_patch === null || delta_patch === undefined) return null;

  // Context score: 1 / (1 + delta_patch)
  const context_raw = 1 / (1 + delta_patch);

  return {
    meta_raw,
    target_raw,
    context_raw,
  };
}

/**
 * Aggregate raw scores using median
 */
function aggregateScores(scores: RawScores[]): RawScores {
  const getMedian = (arr: number[]): number => {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  return {
    meta_raw: getMedian(scores.map(s => s.meta_raw)),
    target_raw: getMedian(scores.map(s => s.target_raw)),
    context_raw: getMedian(scores.map(s => s.context_raw)),
  };
}

/**
 * Normalize scores to sum=1
 */
function normalizeScores(raw: RawScores): ReasonScores {
  const total = raw.meta_raw + raw.target_raw + raw.context_raw;

  // Avoid division by zero
  if (total === 0) {
    return { META: 0.33, TARGET: 0.33, CONTEXT: 0.34 };
  }

  return {
    META: raw.meta_raw / total,
    TARGET: raw.target_raw / total,
    CONTEXT: raw.context_raw / total,
  };
}

// ============================================================================
// Main Processing
// ============================================================================

async function processEvents(stats: Stats): Promise<Map<string, AggregatedData>> {
  const aggregationMap = new Map<string, AggregatedData>();

  const fileStream = fs.createReadStream(INPUT_FILE);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const event: BanReasonEvent = JSON.parse(line);
      stats.eventsProcessed++;

      // Calculate raw scores
      const rawScores = calculateRawScores(event);
      if (!rawScores) {
        stats.eventsSkipped++;
        continue;
      }

      // Generate aggregation key
      const key = getAggKey(
        event.team_id,
        event.side,
        event.ban_slot,
        event.banned_champion_name
      );

      // Initialize or update aggregation entry
      if (!aggregationMap.has(key)) {
        aggregationMap.set(key, {
          team_id: event.team_id,
          team_name: event.team_name,
          side: event.side.toLowerCase() as 'blue' | 'red',
          ban_slot: event.ban_slot,
          champion_id: event.banned_champion_id,
          champion_name: event.banned_champion_name,
          raw_scores: [],
        });
      }

      aggregationMap.get(key)!.raw_scores.push(rawScores);
    } catch (err) {
      stats.eventsSkipped++;
    }
  }

  stats.uniqueKeys = aggregationMap.size;
  return aggregationMap;
}

function generateEntries(
  aggregationMap: Map<string, AggregatedData>,
  stats: Stats
): BanReasonScoreEntry[] {
  const entries: BanReasonScoreEntry[] = [];

  for (const [, data] of aggregationMap) {
    const sampleSize = data.raw_scores.length;
    const lowConfidence = sampleSize < LOW_CONFIDENCE_THRESHOLD;

    if (lowConfidence) {
      stats.lowConfidenceCount++;
    }

    // Aggregate using median
    const aggregatedRaw = aggregateScores(data.raw_scores);

    // Normalize to sum=1
    const reasons = normalizeScores(aggregatedRaw);

    entries.push({
      team_id: data.team_id,
      team_name: data.team_name,
      side: data.side,
      ban_slot: data.ban_slot,
      champion_id: data.champion_id,
      champion_name: data.champion_name,
      sample_size: sampleSize,
      low_confidence: lowConfidence,
      reasons,
    });
  }

  // Sort by team_id, side, ban_slot, champion_name
  entries.sort((a, b) => {
    if (a.team_id !== b.team_id) return a.team_id.localeCompare(b.team_id);
    if (a.side !== b.side) return a.side.localeCompare(b.side);
    if (a.ban_slot !== b.ban_slot) return a.ban_slot - b.ban_slot;
    return a.champion_name.localeCompare(b.champion_name);
  });

  return entries;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('Generate Ban Reason Scores');
  console.log('='.repeat(60));
  console.log(`Input: ${INPUT_FILE}`);
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log('');

  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Error: ${INPUT_FILE} not found`);
    process.exit(1);
  }

  const stats: Stats = {
    eventsProcessed: 0,
    eventsSkipped: 0,
    uniqueKeys: 0,
    lowConfidenceCount: 0,
  };

  // Process events
  console.log('Processing ban events...');
  const aggregationMap = await processEvents(stats);
  console.log(`Processed ${stats.eventsProcessed} events, skipped ${stats.eventsSkipped}`);
  console.log(`Found ${stats.uniqueKeys} unique (team, side, slot, champion) combinations`);
  console.log('');

  // Generate entries
  console.log('Generating reason scores...');
  const entries = generateEntries(aggregationMap, stats);
  console.log(`Generated ${entries.length} entries`);
  console.log(`Low confidence entries (n < ${LOW_CONFIDENCE_THRESHOLD}): ${stats.lowConfidenceCount}`);
  console.log('');

  // Build output
  const output: OutputData = {
    generated_at: new Date().toISOString(),
    source_file: 'ban_reason_events.jsonl',
    total_entries: entries.length,
    low_confidence_count: stats.lowConfidenceCount,
    reason_definitions: {
      META: 'Version strength proxy (meta_presence_score)',
      TARGET: 'Opponent pool targeting (opponent_pool_score)',
      CONTEXT: 'Recency/patch relevance (1 / (1 + delta_patch))',
    },
    entries,
  };

  // Write output
  console.log(`Writing to ${OUTPUT_FILE}...`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log('Done.');

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Events processed:      ${stats.eventsProcessed}`);
  console.log(`Events skipped:        ${stats.eventsSkipped}`);
  console.log(`Unique combinations:   ${stats.uniqueKeys}`);
  console.log(`Low confidence count:  ${stats.lowConfidenceCount}`);

  // Sample output
  if (entries.length > 0) {
    // Find a sample with decent sample size
    const sample = entries.find(e => e.sample_size >= 5) || entries[0];

    console.log('\n' + '='.repeat(60));
    console.log('Sample Output');
    console.log('='.repeat(60));
    console.log(JSON.stringify(sample, null, 2));

    // Show reason distribution
    console.log('\nReason breakdown:');
    console.log(`  META:    ${(sample.reasons.META * 100).toFixed(1)}%`);
    console.log(`  TARGET:  ${(sample.reasons.TARGET * 100).toFixed(1)}%`);
    console.log(`  CONTEXT: ${(sample.reasons.CONTEXT * 100).toFixed(1)}%`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
