#!/usr/bin/env tsx
/**
 * generate_bp_dashboard_data.ts
 *
 * Generates data/grid_v2/bp_dashboard.json for /bp page API consumption.
 * Reads from draft_quality_summary_*.json and draft_quality_compare_v0_v1_v2.json
 *
 * Usage:
 *   npx tsx scripts/generate_bp_dashboard_data.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data', 'grid_v2');
const OUT_FILE = path.join(DATA_DIR, 'bp_dashboard.json');

interface SlotSummary {
  n: number;
  avg_rank: number;
  avg_percentile: number;
  avg_regret: number;
  top1_pct: number;
  top3_pct: number;
  top5_pct: number;
  top10_pct: number;
  win_rate: number;
  pb_corr: number;
  bestRoleCov05_rate: number;
  counter_for_count_avg: number;
  counter_for_count_zero_rate: number;
}

interface VersionSummary {
  generated_at: string;
  fix_version: string;
  params: { rolePenalty: number; cfK: number };
  total_records: number;
  by_slot: Record<string, SlotSummary>;
}

interface CompareRow {
  slot: string;
  version: string;
  N: number;
  AvgRank: number;
  AvgPctl: number;
  AvgRegret: number;
  Top3_pct: number;
  pb_corr: number;
  bestRoleCov05_rate: number;
  cfCountAvg: number;
  cfCount0_rate: number;
}

function loadJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    console.warn(`Warning: Could not load ${filePath}`);
    return null;
  }
}

async function main() {
  console.log('Generating bp_dashboard.json...');

  // Load summaries for each version
  const summaries: Record<string, VersionSummary | null> = {};
  for (const ver of ['v0', 'v1', 'v2']) {
    summaries[ver] = loadJson<VersionSummary>(path.join(DATA_DIR, `draft_quality_summary_${ver}.json`));
  }

  // Load comparison data
  const compareData = loadJson<CompareRow[]>(path.join(DATA_DIR, 'draft_quality_compare_v0_v1_v2.json'));

  // Build overview (global stats per version)
  const overview: Record<string, {
    total_records: number;
    avg_percentile: number;
    avg_regret: number;
    top3_pct: number;
    params: { rolePenalty: number; cfK: number } | null;
  }> = {};

  for (const ver of ['v0', 'v1', 'v2']) {
    const s = summaries[ver];
    if (!s?.by_slot) {
      overview[ver] = { total_records: 0, avg_percentile: 0, avg_regret: 0, top3_pct: 0, params: null };
      continue;
    }
    let totalN = 0, totalRegret = 0, totalPctl = 0, top3Sum = 0;
    for (const slot of Object.keys(s.by_slot)) {
      const row = s.by_slot[slot];
      totalN += row.n || 0;
      totalRegret += (row.avg_regret || 0) * (row.n || 0);
      totalPctl += (row.avg_percentile || 0) * (row.n || 0);
      top3Sum += (row.top3_pct || 0) / 100 * (row.n || 0);
    }
    overview[ver] = {
      total_records: totalN,
      avg_percentile: totalN > 0 ? parseFloat((totalPctl / totalN).toFixed(1)) : 0,
      avg_regret: totalN > 0 ? parseFloat((totalRegret / totalN).toFixed(4)) : 0,
      top3_pct: totalN > 0 ? parseFloat((top3Sum / totalN * 100).toFixed(1)) : 0,
      params: s.params,
    };
  }

  // Build summaryBySlot
  const summaryBySlot: Record<string, Record<string, SlotSummary>> = {};
  for (const ver of ['v0', 'v1', 'v2']) {
    const s = summaries[ver];
    if (s?.by_slot) {
      for (const slot of Object.keys(s.by_slot)) {
        if (!summaryBySlot[slot]) summaryBySlot[slot] = {};
        summaryBySlot[slot][ver] = s.by_slot[slot];
      }
    }
  }

  // Build compareTable from comparison data
  const compareTable: CompareRow[] = compareData || [];

  // Generate highlights
  const highlights: {
    pick2: { v0_pctl: number; v1_pctl: number; v2_pctl: number; improvement: string } | null;
    pick4: { v0_pctl: number; v1_pctl: number; v2_pctl: number; v0_bestCov05: number; v1_bestCov05: number; improvement: string } | null;
    notes: string[];
  } = { pick2: null, pick4: null, notes: [] };

  if (compareData) {
    // PICK_2 highlights
    const v0_pick2 = compareData.find(r => r.slot === 'PICK_2' && r.version === 'v0');
    const v1_pick2 = compareData.find(r => r.slot === 'PICK_2' && r.version === 'v1');
    const v2_pick2 = compareData.find(r => r.slot === 'PICK_2' && r.version === 'v2');
    if (v0_pick2 && v1_pick2 && v2_pick2) {
      highlights.pick2 = {
        v0_pctl: v0_pick2.AvgPctl,
        v1_pctl: v1_pick2.AvgPctl,
        v2_pctl: v2_pick2.AvgPctl,
        improvement: `+${(v1_pick2.AvgPctl - v0_pick2.AvgPctl).toFixed(1)}% (v0→v1)`,
      };
    }

    // PICK_4 highlights
    const v0_pick4 = compareData.find(r => r.slot === 'PICK_4' && r.version === 'v0');
    const v1_pick4 = compareData.find(r => r.slot === 'PICK_4' && r.version === 'v1');
    const v2_pick4 = compareData.find(r => r.slot === 'PICK_4' && r.version === 'v2');
    if (v0_pick4 && v1_pick4 && v2_pick4) {
      highlights.pick4 = {
        v0_pctl: v0_pick4.AvgPctl,
        v1_pctl: v1_pick4.AvgPctl,
        v2_pctl: v2_pick4.AvgPctl,
        v0_bestCov05: v0_pick4.bestRoleCov05_rate,
        v1_bestCov05: v1_pick4.bestRoleCov05_rate,
        improvement: `+${(v1_pick4.AvgPctl - v0_pick4.AvgPctl).toFixed(1)}% (v0→v1), bestRoleCov05: ${v0_pick4.bestRoleCov05_rate}%→${v1_pick4.bestRoleCov05_rate}%`,
      };
    }

    // Notes
    highlights.notes = [
      'v0 baseline: 原始模型，role_coverage 权重为 0，counter_for 缺失数据被误奖励',
      'v1 fix: role_penalty=-0.3 惩罚角色冲突，跳过 counter_for 当 count=0',
      'v2 shrink: v1 + cf_k=10 shrinkage (counter_for 向 0.5 收缩)',
      'PICK_4 是改善最大的 slot，因为它通常有最多的 counter 证据',
    ];
  }

  // Build final dashboard
  const dashboard = {
    versions: ['v0', 'v1', 'v2'],
    generated_at: new Date().toISOString(),
    overview,
    summaryBySlot,
    compareTable,
    highlights,
    dataFiles: {
      v0: 'draft_quality_v0.jsonl',
      v1: 'draft_quality_v1.jsonl',
      v2: 'draft_quality_v2.jsonl',
    },
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(dashboard, null, 2));
  console.log(`Output: ${OUT_FILE}`);
  console.log(`  Overview: ${JSON.stringify(overview, null, 2).slice(0, 200)}...`);
}

main().catch(console.error);
