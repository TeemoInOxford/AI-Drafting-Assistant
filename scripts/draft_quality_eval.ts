#!/usr/bin/env tsx
/**
 * draft_quality_eval.ts
 *
 * Single-pass evaluation for v0/v1/v2 draft quality scoring.
 *
 * Usage:
 *   npx tsx scripts/draft_quality_eval.ts --fix all --role_penalty -0.3 --cf_k 10
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

import {
  Side, Role, FixVersion, FixConfig, SlotModel, DEFAULT_FIX_CONFIGS,
} from '../app/lib/draft_quality/types';
import {
  Accumulators, createAccumulators,
  synergyKey, counterKey, getPrimaryRole, getMeta,
  getSynergyWinRate, getCounterForWithCount, getCounterAgainst, getRoleCoverage,
  computeCandidateFeatures, draftScore, pointBiserial,
} from '../app/lib/draft_quality/scoring';

// ============================================================================
// CLI
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  let fix = 'v0';
  let rolePenalty = -0.3;
  let cfK = 10;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--fix' && args[i + 1]) fix = args[++i];
    else if (a.startsWith('--fix=')) fix = a.slice(6);
    else if (a === '--role_penalty' && args[i + 1]) rolePenalty = parseFloat(args[++i]);
    else if (a.startsWith('--role_penalty=')) rolePenalty = parseFloat(a.slice(15));
    else if (a === '--cf_k' && args[i + 1]) cfK = parseFloat(args[++i]);
    else if (a.startsWith('--cf_k=')) cfK = parseFloat(a.slice(7));
  }
  const valid = ['v0', 'v1', 'v2', 'all'];
  if (!valid.includes(fix)) { console.error(`Invalid --fix: ${fix}`); process.exit(1); }
  const versions: FixVersion[] = fix === 'all' ? ['v0', 'v1', 'v2'] : [fix as FixVersion];
  const configs: Record<FixVersion, FixConfig> = {
    v0: { ...DEFAULT_FIX_CONFIGS.v0 },
    v1: { ...DEFAULT_FIX_CONFIGS.v1, rolePenalty },
    v2: { ...DEFAULT_FIX_CONFIGS.v2, rolePenalty, cfK },
  };
  return { fix, versions, configs, rolePenalty, cfK };
}

// ============================================================================
// Constants
// ============================================================================

const DATA_DIR = path.join(process.cwd(), 'data', 'grid_v2');
const INPUT_TIMELINE = path.join(DATA_DIR, 'draft_timeline_enriched.jsonl');
const INPUT_MODELS = path.join(DATA_DIR, 'win_models.json');

const PICK_SEQUENCE: Array<{ slot: string; side: Side; idx: number }> = [
  { slot: 'BLUE_PICK_1', side: 'blue', idx: 0 },
  { slot: 'RED_PICK_1', side: 'red', idx: 0 },
  { slot: 'RED_PICK_2', side: 'red', idx: 1 },
  { slot: 'BLUE_PICK_2', side: 'blue', idx: 1 },
  { slot: 'BLUE_PICK_3', side: 'blue', idx: 2 },
  { slot: 'RED_PICK_3', side: 'red', idx: 2 },
  { slot: 'RED_PICK_4', side: 'red', idx: 3 },
  { slot: 'BLUE_PICK_4', side: 'blue', idx: 3 },
  { slot: 'BLUE_PICK_5', side: 'blue', idx: 4 },
  { slot: 'RED_PICK_5', side: 'red', idx: 4 },
];
const SLOT_ORDER = new Map<string, number>(PICK_SEQUENCE.map((s, i) => [s.slot, i]));

// ============================================================================
// Types
// ============================================================================

interface Action {
  slot: string; side: Side; type: 'ban' | 'pick';
  championId: string; championName: string; role: Role | null;
}
interface Game {
  seriesId: string; gameId: string; patch: string | null;
  blueTeamId: string; redTeamId: string; winnerSide: Side; actions: Action[];
}

// ============================================================================
// Series date loader
// ============================================================================

const seriesDates = new Map<string, string>();
function loadSeriesDate(seriesId: string): string {
  if (seriesDates.has(seriesId)) return seriesDates.get(seriesId)!;
  try {
    const d = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `series_${seriesId}.json`), 'utf-8'));
    const dt = d.startedAt || '2024-01-01T00:00:00Z';
    seriesDates.set(seriesId, dt);
    return dt;
  } catch {
    seriesDates.set(seriesId, '2024-01-01T00:00:00Z');
    return '2024-01-01T00:00:00Z';
  }
}

// ============================================================================
// Accumulator update
// ============================================================================

function updateAccumulators(acc: Accumulators, game: Game): void {
  const blueWon = game.winnerSide === 'blue';
  const blueP: string[] = [], redP: string[] = [];
  const c2o = new Map<string, number>();

  for (let i = 0; i < PICK_SEQUENCE.length; i++) {
    const { slot, side } = PICK_SEQUENCE[i];
    const a = game.actions.find(x => x.slot === slot);
    if (!a || a.type !== 'pick') continue;
    c2o.set(a.championId, i);
    if (side === 'blue') blueP.push(a.championId); else redP.push(a.championId);

    acc.meta.set(a.championId, (acc.meta.get(a.championId) ?? 0) + 1);
    acc.totalPicks++;
    acc.knownChampions.add(a.championId);
    acc.champNames.set(a.championId, a.championName);

    if (a.role) {
      if (!acc.champRole.has(a.championId)) acc.champRole.set(a.championId, new Map());
      const rm = acc.champRole.get(a.championId)!;
      rm.set(a.role, (rm.get(a.role) || 0) + 1);
    }
  }

  const recSyn = (picks: string[], won: boolean) => {
    for (let i = 0; i < picks.length; i++)
      for (let j = i + 1; j < picks.length; j++) {
        const k = synergyKey(picks[i], picks[j]);
        if (!acc.synergy.has(k)) acc.synergy.set(k, { games: 0, wins: 0 });
        const s = acc.synergy.get(k)!; s.games++; if (won) s.wins++;
      }
  };
  recSyn(blueP, blueWon);
  recSyn(redP, !blueWon);

  const recCtr = (our: string[], opp: string[], won: boolean) => {
    const oe = opp.slice(0, 3), ol = our.slice(Math.max(0, our.length - 3));
    for (const o of oe) {
      const oo = c2o.get(o);
      if (oo === undefined) continue;
      for (const u of ol) {
        const uo = c2o.get(u);
        if (uo === undefined) continue;
        if (oo < uo) {
          const k = counterKey(o, u);
          if (!acc.counter.has(k)) acc.counter.set(k, { games: 0, wins: 0 });
          const c = acc.counter.get(k)!; c.games++; if (won) c.wins++;
        }
      }
    }
  };
  recCtr(blueP, redP, blueWon);
  recCtr(redP, blueP, !blueWon);
}

// ============================================================================
// Per-version state
// ============================================================================

interface SlotStat {
  count: number; regretSum: number; rankSum: number; percentileSum: number;
  top1: number; top3: number; top5: number; top10: number;
  outcomeSum: number; bestRoleCov05: number; cfCountSum: number; cfCountZero: number;
  regrets: number[]; outcomes: number[];
}

function initSlotStats(): Map<string, SlotStat> {
  const m = new Map<string, SlotStat>();
  for (let k = 1; k <= 5; k++) {
    m.set(`PICK_${k}`, {
      count: 0, regretSum: 0, rankSum: 0, percentileSum: 0,
      top1: 0, top3: 0, top5: 0, top10: 0, outcomeSum: 0,
      bestRoleCov05: 0, cfCountSum: 0, cfCountZero: 0,
      regrets: [], outcomes: [],
    });
  }
  return m;
}

interface VersionState {
  output: fs.WriteStream;
  recordCount: number;
  slotStats: Map<string, SlotStat>;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const cfg = parseArgs();
  console.log('='.repeat(70));
  console.log(`Draft Quality Eval — fix=${cfg.fix} role_penalty=${cfg.rolePenalty} cf_k=${cfg.cfK}`);
  console.log('='.repeat(70));

  // Load models
  const modelsFile = JSON.parse(fs.readFileSync(INPUT_MODELS, 'utf-8'));
  const slotModels = new Map<string, SlotModel>(modelsFile.models.map((m: SlotModel) => [m.slot, m]));

  // Load games
  console.log('Loading games...');
  const games: Array<Game & { startedAt: string }> = [];
  const rl = readline.createInterface({ input: fs.createReadStream(INPUT_TIMELINE, 'utf-8'), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const g = JSON.parse(line) as Game;
    games.push({ ...g, startedAt: loadSeriesDate(g.seriesId) });
  }
  games.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  console.log(`  ${games.length} games`);

  // Accumulators (shared across versions)
  const acc = createAccumulators();

  // Per-version state
  const states = new Map<FixVersion, VersionState>();
  for (const ver of cfg.versions) {
    const suffix = cfg.versions.length > 1 ? `_${ver}` : '';
    states.set(ver, {
      output: fs.createWriteStream(path.join(DATA_DIR, `draft_quality${suffix}.jsonl`), 'utf-8'),
      recordCount: 0,
      slotStats: initSlotStats(),
    });
  }

  let coldStartSkipped = 0;

  // Online pass
  for (let gIdx = 0; gIdx < games.length; gIdx++) {
    const game = games[gIdx];

    if (acc.knownChampions.size < 30) {
      updateAccumulators(acc, game);
      coldStartSkipped++;
      continue;
    }

    for (let pickIdx = 0; pickIdx < PICK_SEQUENCE.length; pickIdx++) {
      const { slot, side, idx } = PICK_SEQUENCE[pickIdx];
      const slotLabel = `PICK_${idx + 1}`;
      const model = slotModels.get(slotLabel);
      if (!model) continue;
      const action = game.actions.find(a => a.slot === slot);
      if (!action || action.type !== 'pick') continue;

      // Build draft state
      const ourPrevPicks: Array<{ champId: string; slotOrder: number }> = [];
      const ourPrevIds: string[] = [];
      const ourPrevRoles: Array<Role | null> = [];
      const oppPicks: Array<{ champId: string; slotOrder: number }> = [];
      const oppIds: string[] = [];
      const bannedIds = new Set<string>();
      const pickedIds = new Set<string>();

      for (const a of game.actions) if (a.type === 'ban') bannedIds.add(a.championId);
      for (let j = 0; j < pickIdx; j++) {
        const pa = game.actions.find(a => a.slot === PICK_SEQUENCE[j].slot);
        if (!pa || pa.type !== 'pick') continue;
        pickedIds.add(pa.championId);
        const order = SLOT_ORDER.get(PICK_SEQUENCE[j].slot)!;
        if (PICK_SEQUENCE[j].side === side) {
          ourPrevPicks.push({ champId: pa.championId, slotOrder: order });
          ourPrevIds.push(pa.championId);
          ourPrevRoles.push(pa.role);
        } else {
          oppPicks.push({ champId: pa.championId, slotOrder: order });
          oppIds.push(pa.championId);
        }
      }

      const actualChampId = action.championId;
      const actualRole = action.role ?? getPrimaryRole(acc, actualChampId);
      let actualWasUnknown = false;

      // Score all candidates for all versions
      interface Cand {
        champId: string; champName: string; role: Role | null;
        roleCov: number; cfCount: number; cfRaw: number;
        scores: Record<FixVersion, number>;
      }
      const candidates: Cand[] = [];

      for (const cid of acc.knownChampions) {
        if (bannedIds.has(cid) || pickedIds.has(cid)) continue;
        const role = cid === actualChampId ? actualRole : getPrimaryRole(acc, cid);
        const feats = computeCandidateFeatures(acc, cid, role, ourPrevIds, ourPrevRoles, oppIds, ourPrevPicks, oppPicks);
        const cfData = getCounterForWithCount(acc, cid, oppIds);
        const scores: Record<FixVersion, number> = {} as Record<FixVersion, number>;
        for (const ver of cfg.versions) {
          scores[ver] = draftScore(feats, model, cfg.configs[ver], cfData.count, cfData.value);
        }
        candidates.push({
          champId: cid, champName: acc.champNames.get(cid) || cid,
          role, roleCov: feats.role_coverage,
          cfCount: cfData.count, cfRaw: cfData.value, scores,
        });
      }

      // Insert unknown actual
      if (!acc.knownChampions.has(actualChampId) && !bannedIds.has(actualChampId) && !pickedIds.has(actualChampId)) {
        actualWasUnknown = true;
        const feats = computeCandidateFeatures(acc, actualChampId, actualRole, ourPrevIds, ourPrevRoles, oppIds, ourPrevPicks, oppPicks);
        const cfData = getCounterForWithCount(acc, actualChampId, oppIds);
        const scores: Record<FixVersion, number> = {} as Record<FixVersion, number>;
        for (const ver of cfg.versions) {
          scores[ver] = draftScore(feats, model, cfg.configs[ver], cfData.count, cfData.value);
        }
        candidates.push({
          champId: actualChampId, champName: action.championName,
          role: actualRole, roleCov: feats.role_coverage,
          cfCount: cfData.count, cfRaw: cfData.value, scores,
        });
      }

      if (candidates.length === 0) continue;

      // Actual's features for independent scoring
      const actualFeats = computeCandidateFeatures(acc, actualChampId, actualRole, ourPrevIds, ourPrevRoles, oppIds, ourPrevPicks, oppPicks);
      const actualCfData = getCounterForWithCount(acc, actualChampId, oppIds);
      const actualScores: Record<FixVersion, number> = {} as Record<FixVersion, number>;
      for (const ver of cfg.versions) {
        actualScores[ver] = draftScore(actualFeats, model, cfg.configs[ver], actualCfData.count, actualCfData.value);
      }

      const outcome = game.winnerSide === side ? 1 : 0;

      // Per-version ranking and output
      for (const ver of cfg.versions) {
        const st = states.get(ver)!;
        const actualScore = actualScores[ver];

        // Rank = 1 + count strictly above
        let actualRank = 1;
        for (const c of candidates) {
          if (c.champId !== actualChampId && c.scores[ver] > actualScore) actualRank++;
        }

        // Find best candidate
        const sorted = [...candidates].sort((a, b) => b.scores[ver] - a.scores[ver]);
        const bestIsActual = actualScore >= (sorted[0]?.scores[ver] ?? -Infinity);
        const bestScore = bestIsActual ? actualScore : sorted[0].scores[ver];
        const bestCand = bestIsActual ? candidates.find(c => c.champId === actualChampId)! : sorted[0];

        const regret = bestScore - actualScore;
        const percentile = ((candidates.length - actualRank + 1) / candidates.length) * 100;

        const record = {
          gameId: game.gameId,
          patch: game.patch,
          startedAt: game.startedAt,
          side,
          slot: slotLabel,
          teamId: side === 'blue' ? game.blueTeamId : game.redTeamId,
          actual_pick: action.championName,
          actual_pick_id: actualChampId,
          actual_role: action.role,
          actual_rank: actualRank,
          actual_score: parseFloat(actualScore.toFixed(4)),
          best_pick: bestCand.champName,
          best_pick_id: bestCand.champId,
          best_score: parseFloat(bestScore.toFixed(4)),
          regret: parseFloat(regret.toFixed(4)),
          percentile: parseFloat(percentile.toFixed(1)),
          num_candidates: candidates.length,
          outcome,
          counter_for_raw: parseFloat(actualCfData.value.toFixed(4)),
          counter_for_count: actualCfData.count,
          actual_role_coverage: actualFeats.role_coverage,
          best_role_coverage: bestCand.roleCov,
          bestIsActual,
          ...(actualWasUnknown ? { actual_was_unknown: true } : {}),
        };

        st.output.write(JSON.stringify(record) + '\n');
        st.recordCount++;

        // Update slot stats
        const ss = st.slotStats.get(slotLabel)!;
        ss.count++;
        ss.regretSum += regret;
        ss.rankSum += actualRank;
        ss.percentileSum += percentile;
        ss.outcomeSum += outcome;
        if (actualRank <= 1) ss.top1++;
        if (actualRank <= 3) ss.top3++;
        if (actualRank <= 5) ss.top5++;
        if (actualRank <= 10) ss.top10++;
        if (bestCand.roleCov === 0.5) ss.bestRoleCov05++;
        ss.cfCountSum += actualCfData.count;
        if (actualCfData.count === 0) ss.cfCountZero++;
        ss.regrets.push(regret);
        ss.outcomes.push(outcome);
      }
    }

    updateAccumulators(acc, game);
    if ((gIdx + 1) % 500 === 0) console.log(`  ${gIdx + 1}/${games.length}`);
  }

  // Close streams & generate summaries
  for (const ver of cfg.versions) {
    const st = states.get(ver)!;
    st.output.end();
  }

  // Write summaries
  for (const ver of cfg.versions) {
    const st = states.get(ver)!;
    const suffix = cfg.versions.length > 1 ? `_${ver}` : '';

    const bySlot: Record<string, Record<string, number>> = {};
    const csvLines: string[] = [];
    csvLines.push('slot,n,avg_rank,avg_percentile,avg_regret,top1_pct,top3_pct,top5_pct,top10_pct,win_rate,pb_corr,bestRoleCov05_rate,counter_for_count_avg,counter_for_count_zero_rate');

    for (let k = 1; k <= 5; k++) {
      const slotLabel = `PICK_${k}`;
      const s = st.slotStats.get(slotLabel)!;
      if (s.count === 0) continue;

      const pb = pointBiserial(s.regrets, s.outcomes);
      const row = {
        n: s.count,
        avg_rank: parseFloat((s.rankSum / s.count).toFixed(1)),
        avg_percentile: parseFloat((s.percentileSum / s.count).toFixed(1)),
        avg_regret: parseFloat((s.regretSum / s.count).toFixed(4)),
        top1_pct: parseFloat(((s.top1 / s.count) * 100).toFixed(1)),
        top3_pct: parseFloat(((s.top3 / s.count) * 100).toFixed(1)),
        top5_pct: parseFloat(((s.top5 / s.count) * 100).toFixed(1)),
        top10_pct: parseFloat(((s.top10 / s.count) * 100).toFixed(1)),
        win_rate: parseFloat(((s.outcomeSum / s.count) * 100).toFixed(1)),
        pb_corr: parseFloat(pb.toFixed(4)),
        bestRoleCov05_rate: parseFloat(((s.bestRoleCov05 / s.count) * 100).toFixed(2)),
        counter_for_count_avg: parseFloat((s.cfCountSum / s.count).toFixed(2)),
        counter_for_count_zero_rate: parseFloat(((s.cfCountZero / s.count) * 100).toFixed(2)),
      };
      bySlot[slotLabel] = row;
      csvLines.push(`${slotLabel},${row.n},${row.avg_rank},${row.avg_percentile},${row.avg_regret},${row.top1_pct},${row.top3_pct},${row.top5_pct},${row.top10_pct},${row.win_rate},${row.pb_corr},${row.bestRoleCov05_rate},${row.counter_for_count_avg},${row.counter_for_count_zero_rate}`);
    }

    const summaryJson = {
      generated_at: new Date().toISOString(),
      fix_version: ver,
      params: { rolePenalty: cfg.rolePenalty, cfK: cfg.cfK },
      total_records: st.recordCount,
      by_slot: bySlot,
    };

    fs.writeFileSync(path.join(DATA_DIR, `draft_quality_summary${suffix}.json`), JSON.stringify(summaryJson, null, 2));
    fs.writeFileSync(path.join(DATA_DIR, `draft_quality_summary${suffix}.csv`), csvLines.join('\n') + '\n');
    console.log(`\n--- ${ver}: ${st.recordCount} records ---`);
    console.log(`  Output: draft_quality_summary${suffix}.json / .csv`);
  }

  // Generate compare table if all versions
  if (cfg.versions.length === 3) {
    const compareRows: Array<Record<string, unknown>> = [];
    const compareCsvLines: string[] = [];
    compareCsvLines.push('slot,version,N,AvgRank,AvgPctl,AvgRegret,Top3_pct,pb_corr,bestRoleCov05_rate,cfCountAvg,cfCount0_rate');

    for (let k = 1; k <= 5; k++) {
      const slotLabel = `PICK_${k}`;
      for (const ver of cfg.versions) {
        const s = states.get(ver)!.slotStats.get(slotLabel)!;
        if (s.count === 0) continue;
        const pb = pointBiserial(s.regrets, s.outcomes);
        const row = {
          slot: slotLabel, version: ver, N: s.count,
          AvgRank: parseFloat((s.rankSum / s.count).toFixed(1)),
          AvgPctl: parseFloat((s.percentileSum / s.count).toFixed(1)),
          AvgRegret: parseFloat((s.regretSum / s.count).toFixed(4)),
          Top3_pct: parseFloat(((s.top3 / s.count) * 100).toFixed(1)),
          pb_corr: parseFloat(pb.toFixed(4)),
          bestRoleCov05_rate: parseFloat(((s.bestRoleCov05 / s.count) * 100).toFixed(2)),
          cfCountAvg: parseFloat((s.cfCountSum / s.count).toFixed(2)),
          cfCount0_rate: parseFloat(((s.cfCountZero / s.count) * 100).toFixed(2)),
        };
        compareRows.push(row);
        compareCsvLines.push(`${slotLabel},${ver},${row.N},${row.AvgRank},${row.AvgPctl},${row.AvgRegret},${row.Top3_pct},${row.pb_corr},${row.bestRoleCov05_rate},${row.cfCountAvg},${row.cfCount0_rate}`);
      }
    }

    fs.writeFileSync(path.join(DATA_DIR, 'draft_quality_compare_v0_v1_v2.json'), JSON.stringify(compareRows, null, 2));
    fs.writeFileSync(path.join(DATA_DIR, 'draft_quality_compare_v0_v1_v2.csv'), compareCsvLines.join('\n') + '\n');
    console.log('\n  Output: draft_quality_compare_v0_v1_v2.json / .csv');
  }

  console.log('\nDone.');
}

main().catch(console.error);
