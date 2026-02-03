#!/usr/bin/env tsx
/**
 * debug_draft_quality_bias.ts
 *
 * Online/chronological diagnosis of PICK_2 and PICK_4 anomalies.
 * Accumulators built from past games only — no future leakage.
 *
 * Usage:
 *   npx tsx scripts/debug_draft_quality_bias.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const DATA_DIR = path.join(process.cwd(), 'data', 'grid_v2');
const INPUT_TIMELINE = path.join(DATA_DIR, 'draft_timeline_enriched.jsonl');
const INPUT_MODELS = path.join(DATA_DIR, 'win_models.json');

const MIN_GAMES_THRESHOLD = 3;
const SAMPLE_SIZE = 200;

type Side = 'blue' | 'red';
type Role = 'top' | 'jungle' | 'mid' | 'bot' | 'support';
const ROLES: Role[] = ['top', 'jungle', 'mid', 'bot', 'support'];

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

const DRAFT_FEATURES = [
  'our_meta_sum', 'opp_meta_sum', 'our_synergy', 'opp_synergy',
  'counter_for', 'counter_against', 'role_coverage',
] as const;

const TARGET_SLOTS = ['PICK_2', 'PICK_4'] as const;

// ============================================================================
// Online Accumulators
// ============================================================================
const metaAcc = new Map<string, number>();
let totalPicks = 0;
const synergyAcc = new Map<string, { games: number; wins: number }>();
const counterAcc = new Map<string, { games: number; wins: number }>();
const champRoleAcc = new Map<string, Map<Role, number>>();
const knownChampions = new Set<string>();
const champNames = new Map<string, string>();
const seriesDates = new Map<string, string>();

interface SlotModel {
  slot: string;
  weights: Record<string, number>;
  normalization: Record<string, { mean: number; std: number }>;
}
let slotModels: Map<string, SlotModel>;

// ============================================================================
// Shared utilities (identical to draft_quality_eval.ts)
// ============================================================================
function loadSeriesDate(sid: string): string {
  if (seriesDates.has(sid)) return seriesDates.get(sid)!;
  try {
    const d = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `series_${sid}.json`), 'utf-8'));
    const dt = d.startedAt || '2024-01-01T00:00:00Z';
    seriesDates.set(sid, dt); return dt;
  } catch { seriesDates.set(sid, '2024-01-01T00:00:00Z'); return '2024-01-01T00:00:00Z'; }
}
function synergyKey(a: string, b: string) { return [a, b].sort().join('|'); }
function counterKey(e: string, l: string) { return `${e}|${l}`; }
function getPrimaryRole(cid: string): Role | null {
  const rm = champRoleAcc.get(cid);
  if (!rm || rm.size === 0) return null;
  let best: Role = 'mid', bestN = 0;
  for (const [r, n] of rm) { if (n > bestN) { bestN = n; best = r; } }
  return best;
}
function getMeta(cid: string): number { return totalPicks === 0 ? 0 : (metaAcc.get(cid) ?? 0) / totalPicks; }
function getSynergyWinRate(picks: string[]): number {
  if (picks.length < 2) return 0.5;
  let s = 0, c = 0;
  for (let i = 0; i < picks.length; i++)
    for (let j = i + 1; j < picks.length; j++) {
      const v = synergyAcc.get(synergyKey(picks[i], picks[j]));
      if (v && v.games >= MIN_GAMES_THRESHOLD) { s += v.wins / v.games; c++; }
    }
  return c > 0 ? s / c : 0.5;
}
function getCounterFor(ourPick: string, oppPicks: string[]): number {
  if (!oppPicks.length) return 0.5;
  let s = 0, c = 0;
  for (const opp of oppPicks) {
    const v = counterAcc.get(counterKey(opp, ourPick));
    if (v && v.games >= MIN_GAMES_THRESHOLD) { s += v.wins / v.games; c++; }
  }
  return c > 0 ? s / c : 0.5;
}
function getCounterForWithCount(ourPick: string, oppPicks: string[]): { value: number; count: number } {
  if (!oppPicks.length) return { value: 0.5, count: 0 };
  let s = 0, c = 0;
  for (const opp of oppPicks) {
    const v = counterAcc.get(counterKey(opp, ourPick));
    if (v && v.games >= MIN_GAMES_THRESHOLD) { s += v.wins / v.games; c++; }
  }
  return { value: c > 0 ? s / c : 0.5, count: c };
}
function getCounterAgainst(
  ourPrev: Array<{ champId: string; slotOrder: number }>,
  oppPicks: Array<{ champId: string; slotOrder: number }>,
): number {
  if (!ourPrev.length || !oppPicks.length) return 0.5;
  let s = 0, c = 0;
  for (const op of ourPrev)
    for (const opp of oppPicks)
      if (opp.slotOrder > op.slotOrder) {
        const v = counterAcc.get(counterKey(op.champId, opp.champId));
        if (v && v.games >= MIN_GAMES_THRESHOLD) { s += v.wins / v.games; c++; }
      }
  return c > 0 ? s / c : 0.5;
}
function getRoleCoverage(roles: Array<Role | null>): number {
  const filled = new Set<Role>();
  for (const r of roles) { if (r) { if (filled.has(r)) return 0.5; filled.add(r); } }
  return 1.0;
}
function computeCandidateFeatures(
  cid: string, role: Role | null, ourPrevIds: string[], ourPrevRoles: Array<Role | null>,
  oppIds: string[], ourPrev: Array<{ champId: string; slotOrder: number }>,
  opp: Array<{ champId: string; slotOrder: number }>,
): Record<string, number> {
  const ourIds = [...ourPrevIds, cid];
  return {
    our_meta_sum: ourIds.reduce((a, c) => a + getMeta(c), 0),
    opp_meta_sum: oppIds.reduce((a, c) => a + getMeta(c), 0),
    our_synergy: getSynergyWinRate(ourIds),
    opp_synergy: getSynergyWinRate(oppIds),
    counter_for: getCounterFor(cid, oppIds),
    counter_against: getCounterAgainst(ourPrev, opp),
    role_coverage: getRoleCoverage([...ourPrevRoles, role]),
  };
}
function draftScore(feats: Record<string, number>, model: SlotModel): number {
  let score = 0;
  for (const f of DRAFT_FEATURES) {
    const raw = feats[f] ?? 0;
    const norm = model.normalization[f];
    const z = norm && norm.std > 1e-10 ? (raw - norm.mean) / norm.std : 0;
    score += (model.weights[f] ?? 0) * z;
  }
  return score;
}
function scoreBreakdown(feats: Record<string, number>, model: SlotModel) {
  const r: Array<{ feature: string; raw: number; z: number; wz: number }> = [];
  for (const f of DRAFT_FEATURES) {
    const raw = feats[f] ?? 0;
    const norm = model.normalization[f];
    const z = norm && norm.std > 1e-10 ? (raw - norm.mean) / norm.std : 0;
    r.push({ feature: f, raw, z, wz: (model.weights[f] ?? 0) * z });
  }
  return r.sort((a, b) => Math.abs(b.wz) - Math.abs(a.wz));
}

// ============================================================================
// updateAccumulators
// ============================================================================
interface Action { slot: string; side: Side; type: 'ban' | 'pick'; championId: string; championName: string; role: Role | null; }
interface Game { seriesId: string; gameId: string; patch: string | null; blueTeamId: string; redTeamId: string; winnerSide: Side; actions: Action[]; }

function updateAccumulators(game: Game): void {
  const blueWon = game.winnerSide === 'blue';
  const blueP: string[] = [], redP: string[] = [];
  const c2o = new Map<string, number>();
  for (let i = 0; i < PICK_SEQUENCE.length; i++) {
    const { slot, side } = PICK_SEQUENCE[i];
    const a = game.actions.find(x => x.slot === slot);
    if (!a || a.type !== 'pick') continue;
    c2o.set(a.championId, i);
    if (side === 'blue') blueP.push(a.championId); else redP.push(a.championId);
    metaAcc.set(a.championId, (metaAcc.get(a.championId) ?? 0) + 1);
    totalPicks++;
    knownChampions.add(a.championId);
    champNames.set(a.championId, a.championName);
    if (a.role) {
      if (!champRoleAcc.has(a.championId)) champRoleAcc.set(a.championId, new Map());
      const rm = champRoleAcc.get(a.championId)!;
      rm.set(a.role, (rm.get(a.role) || 0) + 1);
    }
  }
  const recSyn = (picks: string[], won: boolean) => {
    for (let i = 0; i < picks.length; i++)
      for (let j = i + 1; j < picks.length; j++) {
        const k = synergyKey(picks[i], picks[j]);
        if (!synergyAcc.has(k)) synergyAcc.set(k, { games: 0, wins: 0 });
        const s = synergyAcc.get(k)!; s.games++; if (won) s.wins++;
      }
  };
  recSyn(blueP, blueWon); recSyn(redP, !blueWon);
  const recCtr = (our: string[], opp: string[], won: boolean) => {
    const oe = opp.slice(0, 3), ol = our.slice(Math.max(0, our.length - 3));
    for (const o of oe) { const oo = c2o.get(o); if (oo === undefined) continue;
      for (const u of ol) { const uo = c2o.get(u); if (uo === undefined) continue;
        if (oo < uo) { const k = counterKey(o, u);
          if (!counterAcc.has(k)) counterAcc.set(k, { games: 0, wins: 0 });
          const c = counterAcc.get(k)!; c.games++; if (won) c.wins++;
        }
      }
    }
  };
  recCtr(blueP, redP, blueWon); recCtr(redP, blueP, !blueWon);
}

// ============================================================================
// Reservoir sampler
// ============================================================================
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

// ============================================================================
// Diagnostics accumulator (lightweight, no array storage)
// ============================================================================
interface DiagAcc {
  n: number;
  actionRoleNull: number;
  actualUsedFallback: number;
  coverageAfter05: number;
  coverageBefore05: number;
  candidatesSum: number;
  candRoleNullSum: number;
  rankMismatch: number;
  sampledForMismatch: number;
  // Step 3: best role_coverage stats
  bestRoleCov05: number;
  actualRoleCov05: number;
  // Step 4: counter_for count stats
  counterForCountSum: number;
  counterForCountZero: number;
}
function newDiag(): DiagAcc {
  return {
    n: 0, actionRoleNull: 0, actualUsedFallback: 0,
    coverageAfter05: 0, coverageBefore05: 0,
    candidatesSum: 0, candRoleNullSum: 0,
    rankMismatch: 0, sampledForMismatch: 0,
    bestRoleCov05: 0, actualRoleCov05: 0,
    counterForCountSum: 0, counterForCountZero: 0,
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('Debug Draft Quality Bias (Online, No Future Leakage)');
  console.log('='.repeat(70));
  console.log();

  slotModels = new Map(
    JSON.parse(fs.readFileSync(INPUT_MODELS, 'utf-8')).models.map((m: SlotModel) => [m.slot, m])
  );

  // Load games sorted chronologically
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

  const diags = new Map<string, DiagAcc>(TARGET_SLOTS.map(s => [s, newDiag()]));
  const reservoirs = new Map<string, Reservoir<Record<string, unknown>>>(
    TARGET_SLOTS.map(s => [s, new Reservoir(SAMPLE_SIZE)])
  );

  // Online pass
  for (let gIdx = 0; gIdx < games.length; gIdx++) {
    const game = games[gIdx];

    // Skip cold start
    if (knownChampions.size < 30) { updateAccumulators(game); continue; }

    // Diagnose target slots
    for (const targetSlot of TARGET_SLOTS) {
      const slotIdx = parseInt(targetSlot.replace('PICK_', '')) - 1;

      // Both sides
      for (const side of ['blue', 'red'] as Side[]) {
        const pickIdx = PICK_SEQUENCE.findIndex(p => p.side === side && p.idx === slotIdx);
        if (pickIdx < 0) continue;

        const bpSlot = PICK_SEQUENCE[pickIdx].slot;
        const action = game.actions.find(a => a.slot === bpSlot);
        if (!action || action.type !== 'pick') continue;

        const diag = diags.get(targetSlot)!;
        const reservoir = reservoirs.get(targetSlot)!;
        const model = slotModels.get(targetSlot)!;

        diag.n++;

        // Reconstruct draft state
        const ourPrevPicks: Array<{ champId: string; slotOrder: number }> = [];
        const ourPrevIds: string[] = [];
        const ourPrevRoles: Array<Role | null> = [];
        const oppPicks: Array<{ champId: string; slotOrder: number }> = [];
        const oppIds: string[] = [];
        const bannedIds = new Set<string>();
        const pickedIds = new Set<string>();

        for (const a of game.actions) { if (a.type === 'ban') bannedIds.add(a.championId); }

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

        const actualRole = action.role;
        const primaryRole = getPrimaryRole(action.championId);
        const usedRole = actualRole ?? primaryRole;

        // 1) action.role null
        if (actualRole === null) diag.actionRoleNull++;
        if (actualRole === null && primaryRole !== null) diag.actualUsedFallback++;

        // 2) coverage before/after
        const covBefore = getRoleCoverage(ourPrevRoles);
        const covAfter = getRoleCoverage([...ourPrevRoles, usedRole]);
        if (covBefore === 0.5) diag.coverageBefore05++;
        if (covAfter === 0.5) diag.coverageAfter05++;

        // 3) candidates
        let candCount = 0;
        let candRoleNull = 0;
        const localRoleDist: Record<string, number> = { top: 0, jungle: 0, mid: 0, bot: 0, support: 0, null: 0 };
        const candScores: Array<{ champId: string; score: number }> = [];
        for (const cid of knownChampions) {
          if (bannedIds.has(cid) || pickedIds.has(cid)) continue;
          candCount++;
          const role = cid === action.championId ? usedRole : getPrimaryRole(cid);
          if (role === null) { candRoleNull++; localRoleDist['null']++; }
          else localRoleDist[role]++;
          const feats = computeCandidateFeatures(cid, role, ourPrevIds, ourPrevRoles, oppIds, ourPrevPicks, oppPicks);
          candScores.push({ champId: cid, score: draftScore(feats, model) });
        }
        // Insert unknown actual if needed
        if (!knownChampions.has(action.championId)) {
          candCount++;
          if (usedRole === null) { candRoleNull++; localRoleDist['null']++; }
          else localRoleDist[usedRole]++;
          const feats = computeCandidateFeatures(action.championId, usedRole, ourPrevIds, ourPrevRoles, oppIds, ourPrevPicks, oppPicks);
          candScores.push({ champId: action.championId, score: draftScore(feats, model) });
        }

        diag.candidatesSum += candCount;
        diag.candRoleNullSum += candRoleNull;

        // actual score (independent, with ground-truth role)
        const actualFeats = computeCandidateFeatures(
          action.championId, usedRole, ourPrevIds, ourPrevRoles, oppIds, ourPrevPicks, oppPicks,
        );
        const actualScore = draftScore(actualFeats, model);

        // Step 4: counter_for count for actual
        const actualCounterFor = getCounterForWithCount(action.championId, oppIds);
        diag.counterForCountSum += actualCounterFor.count;
        if (actualCounterFor.count === 0) diag.counterForCountZero++;

        // rank method 1: count strictly above
        let rank1 = 1;
        for (const c of candScores) {
          if (c.champId !== action.championId && c.score > actualScore) rank1++;
        }

        // rank method 2: sort and find index
        candScores.sort((a, b) => b.score - a.score);
        const r2idx = candScores.findIndex(c => c.champId === action.championId);
        const rank2 = r2idx >= 0 ? r2idx + 1 : candCount + 1;

        diag.sampledForMismatch++;
        if (rank1 !== rank2) diag.rankMismatch++;

        // Best (Bug 3 fix: handle actual being best)
        const bestIsActual = actualScore >= (candScores[0]?.score ?? -Infinity);
        const bestScore = bestIsActual ? actualScore : candScores[0].score;
        const bestChampId = bestIsActual ? action.championId : candScores[0].champId;

        // Breakdown for sample (Bug 2 fix: cache bestRoleCov)
        const actualBD = scoreBreakdown(actualFeats, model);
        let bestBD = actualBD;
        let bestRoleCov = actualFeats.role_coverage;
        let bestCounterFor = actualCounterFor;
        if (!bestIsActual) {
          const bestRole = getPrimaryRole(bestChampId);
          const bestFeats = computeCandidateFeatures(bestChampId, bestRole, ourPrevIds, ourPrevRoles, oppIds, ourPrevPicks, oppPicks);
          bestBD = scoreBreakdown(bestFeats, model);
          bestRoleCov = bestFeats.role_coverage;
          bestCounterFor = getCounterForWithCount(bestChampId, oppIds);
        }

        // Step 3: track role_coverage=0.5 stats
        if (actualFeats.role_coverage === 0.5) diag.actualRoleCov05++;
        if (bestRoleCov === 0.5) diag.bestRoleCov05++;

        // Bug 1 fix: store per-record role dist in sample
        const localRolePct: Record<string, number> = {};
        for (const r of [...ROLES, 'null']) {
          localRolePct[r] = candCount > 0 ? parseFloat((localRoleDist[r] / candCount * 100).toFixed(1)) : 0;
        }

        // Step 2: format as raw,z,wz
        const formatBD = (bd: Array<{ feature: string; raw: number; z: number; wz: number }>) =>
          bd.slice(0, 3).map(b => `${b.feature}:${b.raw.toFixed(3)},${b.z.toFixed(2)},${b.wz.toFixed(3)}`).join(' | ');

        // Extract counter_for details from breakdown
        const actualCF = actualBD.find(b => b.feature === 'counter_for');
        const bestCF = bestBD.find(b => b.feature === 'counter_for');

        reservoir.add({
          gameId: game.gameId,
          side,
          actual: action.championName,
          actualRole,
          usedRole,
          primaryRole,
          fallback: actualRole === null && primaryRole !== null,
          covBefore, covAfter,
          candidates: candCount,
          candRoleNull,
          actualScore: parseFloat(actualScore.toFixed(4)),
          bestScore: parseFloat(bestScore.toFixed(4)),
          bestPick: champNames.get(bestChampId) ?? '',
          bestIsActual,
          rank1, rank2, mismatch: rank1 !== rank2,
          actualTop3: formatBD(actualBD),
          bestTop3: formatBD(bestBD),
          // Step 3: role_coverage details
          actualRoleCov: actualFeats.role_coverage,
          bestRoleCov,
          diffCov: parseFloat((actualFeats.role_coverage - bestRoleCov).toFixed(3)),
          // Step 4: counter_for details
          actualCF_raw: actualCF?.raw ?? 0,
          actualCF_z: actualCF?.z ?? 0,
          actualCF_wz: actualCF?.wz ?? 0,
          actualCF_count: actualCounterFor.count,
          bestCF_raw: bestCF?.raw ?? 0,
          bestCF_z: bestCF?.z ?? 0,
          bestCF_wz: bestCF?.wz ?? 0,
          bestCF_count: bestCounterFor.count,
          localRolePct,
        });
      }
    }

    // Update accumulators AFTER diagnosis
    updateAccumulators(game);

    if ((gIdx + 1) % 500 === 0) console.log(`  ${gIdx + 1}/${games.length}`);
  }

  // ── Output ──
  console.log();
  console.log('='.repeat(70));
  console.log('Diagnostic Summary');
  console.log('='.repeat(70));

  for (const slot of TARGET_SLOTS) {
    const d = diags.get(slot)!;
    const samples = reservoirs.get(slot)!.items;
    console.log();
    console.log(`--- ${slot} (N=${d.n}) ---`);
    console.log(`  avg candidates:         ${(d.candidatesSum / d.n).toFixed(1)}`);
    console.log(`  action.role=null:       ${((d.actionRoleNull / d.n) * 100).toFixed(2)}%`);
    console.log(`  used fallback role:     ${((d.actualUsedFallback / d.n) * 100).toFixed(2)}%`);
    console.log(`  coverage_before=0.5:    ${((d.coverageBefore05 / d.n) * 100).toFixed(2)}%`);
    console.log(`  coverage_after=0.5:     ${((d.coverageAfter05 / d.n) * 100).toFixed(2)}%`);
    console.log(`  candidate role=null/rec:${(d.candRoleNullSum / d.n).toFixed(1)}`);
    console.log(`  rank mismatch:          ${d.rankMismatch}/${d.sampledForMismatch} (${((d.rankMismatch / d.sampledForMismatch) * 100).toFixed(2)}%)`);
    // Step 3: role_coverage stats
    console.log(`  [Step3] actualRoleCov=0.5:  ${((d.actualRoleCov05 / d.n) * 100).toFixed(2)}%`);
    console.log(`  [Step3] bestRoleCov=0.5:    ${((d.bestRoleCov05 / d.n) * 100).toFixed(2)}%`);
    // Step 4: counter_for count stats
    console.log(`  [Step4] avg counter_for_count: ${(d.counterForCountSum / d.n).toFixed(2)}`);
    console.log(`  [Step4] counter_for_count=0:   ${((d.counterForCountZero / d.n) * 100).toFixed(2)}%`);
    // Bug 1 fix: compute avg role dist from reservoir samples
    if (samples.length > 0) {
      const avgRolePct: Record<string, number> = { top: 0, jungle: 0, mid: 0, bot: 0, support: 0, null: 0 };
      for (const s of samples) {
        const lrp = s.localRolePct as Record<string, number>;
        for (const r of [...ROLES, 'null']) avgRolePct[r] += lrp[r] ?? 0;
      }
      console.log(`  avg candidate role dist (from ${samples.length} samples):`);
      for (const r of [...ROLES, 'null']) {
        console.log(`    ${r.padEnd(8)}: ${(avgRolePct[r] / samples.length).toFixed(1)}%`);
      }
    }
  }

  // Write CSVs
  for (const slot of TARGET_SLOTS) {
    const samples = reservoirs.get(slot)!.items;
    const csvPath = path.join(DATA_DIR, `draft_quality_bias_${slot}.csv`);
    const keys = [
      'gameId', 'side', 'actual', 'actualRole', 'usedRole', 'primaryRole', 'fallback',
      'covBefore', 'covAfter', 'candidates', 'candRoleNull',
      'actualScore', 'bestScore', 'bestPick', 'bestIsActual', 'rank1', 'rank2', 'mismatch',
      'actualTop3', 'bestTop3',
      'actualRoleCov', 'bestRoleCov', 'diffCov',
      'actualCF_raw', 'actualCF_z', 'actualCF_wz', 'actualCF_count',
      'bestCF_raw', 'bestCF_z', 'bestCF_wz', 'bestCF_count',
    ];
    const lines = [keys.join(',')];
    for (const s of samples) {
      lines.push(keys.map(k => {
        const v = s[k];
        if (typeof v === 'string' && (v.includes(',') || v.includes('|'))) return `"${v}"`;
        return String(v ?? '');
      }).join(','));
    }
    fs.writeFileSync(csvPath, lines.join('\n') + '\n');
    console.log(`\n  CSV: ${csvPath} (${samples.length} rows)`);
  }

  console.log();
  console.log('Done.');
}

main().catch(console.error);
