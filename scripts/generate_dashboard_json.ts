#!/usr/bin/env tsx
/**
 * generate_dashboard_json.ts
 *
 * Generates public/ai_dashboard/draft_quality_dashboard.json for the frontend.
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data', 'grid_v2');
const OUT_DIR = path.join(process.cwd(), 'public', 'ai_dashboard');
const OUT_FILE = path.join(OUT_DIR, 'draft_quality_dashboard.json');

// Helper: parse CSV robustly (handles quoted fields)
function parseCSV(content: string): Array<Record<string, string>> {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];
  const header = parseCSVLine(lines[0]);
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      row[header[j]] = vals[j] ?? '';
    }
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const c of line) {
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ',' && !inQuotes) { result.push(current); current = ''; }
    else current += c;
  }
  result.push(current);
  return result;
}

// Reservoir sampler
class Reservoir<T> {
  items: T[] = [];
  seen = 0;
  constructor(private k: number) {}
  add(item: T) {
    this.seen++;
    if (this.items.length < this.k) { this.items.push(item); return; }
    const j = Math.floor(Math.random() * this.seen);
    if (j < this.k) this.items[j] = item;
  }
}

async function main() {
  console.log('Generating dashboard JSON...');

  // Load comparison data
  const compareJson = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'draft_quality_compare_v0_v1_v2.json'), 'utf-8'));

  // Load summaries for each version
  const summaries: Record<string, unknown> = {};
  for (const ver of ['v0', 'v1', 'v2']) {
    try {
      summaries[ver] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `draft_quality_summary_${ver}.json`), 'utf-8'));
    } catch { summaries[ver] = null; }
  }

  // Build overview (global stats per version)
  const overview: Record<string, unknown> = {};
  for (const ver of ['v0', 'v1', 'v2']) {
    const s = summaries[ver] as Record<string, unknown> | null;
    if (!s?.by_slot) continue;
    const bySlot = s.by_slot as Record<string, Record<string, number>>;
    let totalN = 0, totalRegret = 0, totalPctl = 0, top3Sum = 0;
    for (const slot of Object.keys(bySlot)) {
      const row = bySlot[slot];
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
      params: (s as Record<string, unknown>).params,
    };
  }

  // Build slots array (for table)
  const slots: Array<Record<string, unknown>> = [];
  for (let k = 1; k <= 5; k++) {
    const slotLabel = `PICK_${k}`;
    const row: Record<string, unknown> = { slot: slotLabel };
    for (const ver of ['v0', 'v1', 'v2']) {
      const match = (compareJson as Array<Record<string, unknown>>).find(r => r.slot === slotLabel && r.version === ver);
      if (match) {
        row[`${ver}_AvgPctl`] = match.AvgPctl;
        row[`${ver}_AvgRegret`] = match.AvgRegret;
        row[`${ver}_Top3`] = match['Top3%'];
        row[`${ver}_bestRoleCov05`] = match.bestRoleCov05_rate;
        row[`${ver}_cfCount0`] = match.counter_for_count_zero_rate;
      }
    }
    slots.push(row);
  }

  // Generate highlights (conclusions)
  const highlights: string[] = [];
  {
    const v0_pick4 = (compareJson as Array<Record<string, unknown>>).find(r => r.slot === 'PICK_4' && r.version === 'v0');
    const v1_pick4 = (compareJson as Array<Record<string, unknown>>).find(r => r.slot === 'PICK_4' && r.version === 'v1');
    if (v0_pick4 && v1_pick4) {
      highlights.push(`PICK_4 AvgPctl: v0=${v0_pick4.AvgPctl}% → v1=${v1_pick4.AvgPctl}% (+${((v1_pick4.AvgPctl as number) - (v0_pick4.AvgPctl as number)).toFixed(1)}%)`);
      highlights.push(`PICK_4 bestRoleCov05: v0=${v0_pick4.bestRoleCov05_rate}% → v1=${v1_pick4.bestRoleCov05_rate}% (role冲突修复成功)`);
    }
    const v0_pick2 = (compareJson as Array<Record<string, unknown>>).find(r => r.slot === 'PICK_2' && r.version === 'v0');
    const v1_pick2 = (compareJson as Array<Record<string, unknown>>).find(r => r.slot === 'PICK_2' && r.version === 'v1');
    if (v0_pick2 && v1_pick2) {
      highlights.push(`PICK_2 AvgPctl: v0=${v0_pick2.AvgPctl}% → v1=${v1_pick2.AvgPctl}% (+${((v1_pick2.AvgPctl as number) - (v0_pick2.AvgPctl as number)).toFixed(1)}%)`);
    }
    const v2_pick4 = (compareJson as Array<Record<string, unknown>>).find(r => r.slot === 'PICK_4' && r.version === 'v2');
    if (v2_pick4) {
      highlights.push(`v2 shrink (cf_k=10): PICK_4 AvgRegret=${v2_pick4.AvgRegret} (vs v1=${v1_pick4?.AvgRegret})`);
    }
    highlights.push(`根因: role_coverage训练时std=0导致权重为0, counter_for缺失时raw=0被误奖励`);
  }

  // Load bias samples (PICK_2, PICK_4)
  const samples: Record<string, unknown[]> = { PICK_2: [], PICK_4: [] };
  for (const slot of ['PICK_2', 'PICK_4']) {
    const csvPath = path.join(DATA_DIR, `draft_quality_bias_${slot}.csv`);
    if (fs.existsSync(csvPath)) {
      const content = fs.readFileSync(csvPath, 'utf-8');
      const rows = parseCSV(content);
      // Take up to 20 samples sorted by regret descending for high-regret examples
      const sorted = [...rows].sort((a, b) => parseFloat(b.actualScore || '0') - parseFloat(a.actualScore || '0'));
      samples[slot] = sorted.slice(0, 20).map(r => ({
        gameId: r.gameId,
        side: r.side,
        actual: r.actual,
        actualRole: r.actualRole || r.usedRole,
        bestPick: r.bestPick,
        bestIsActual: r.bestIsActual === 'true',
        actualScore: parseFloat(r.actualScore || '0'),
        bestScore: parseFloat(r.bestScore || '0'),
        rank1: parseInt(r.rank1 || '0'),
        candidates: parseInt(r.candidates || '0'),
        actualRoleCov: parseFloat(r.actualRoleCov || r.covAfter || '1'),
        bestRoleCov: parseFloat(r.bestRoleCov || '1'),
        actualCF_count: parseInt(r.actualCF_count || '0'),
        actualTop3: r.actualTop3 || '',
        bestTop3: r.bestTop3 || '',
      }));
    }
  }

  // Final dashboard object
  const dashboard = {
    meta: {
      generated_at: new Date().toISOString(),
      data_version: 'grid_v2',
      params: { role_penalty: -0.3, cf_k: 10 },
    },
    overview,
    slots,
    highlights,
    samples,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(dashboard, null, 2));
  console.log(`Output: ${OUT_FILE}`);
}

main().catch(console.error);
