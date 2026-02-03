#!/usr/bin/env tsx
/**
 * ban_predictor_eval.ts
 *
 * Systematic evaluation of ban predictor:
 *   Step 1: Patch-aware train/test split
 *   Step 2: Rolling window K=2..5
 *   Step 3: Top-K + per-slot accuracy
 *   Step 4: β sensitivity analysis
 *
 * Usage:
 *   npx tsx scripts/ban_predictor_eval.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const DATA_DIR = path.join(process.cwd(), 'data', 'grid_v2');
const INPUT_TIMELINE = path.join(DATA_DIR, 'draft_timeline_enriched.jsonl');
const INPUT_POWER_SCORES = path.join(DATA_DIR, 'team_power_score.json');

// ============================================================================
// Types
// ============================================================================

type Role = 'top' | 'jungle' | 'mid' | 'bot' | 'support';
type Side = 'blue' | 'red';
type BanSlot = 'ban_1' | 'ban_2' | 'ban_3' | 'ban_4' | 'ban_5';
const BAN_SLOTS: BanSlot[] = ['ban_1', 'ban_2', 'ban_3', 'ban_4', 'ban_5'];

interface Action {
  i: number;
  slot: string;
  side: Side;
  type: 'ban' | 'pick';
  championId: string;
  championName: string;
  teamId: string;
  isWinner: boolean;
  role: Role | null;
}

interface Game {
  seriesId: string;
  gameId: string;
  gameSequence: number;
  patch: string | null;
  blueTeamId: string;
  blueTeamName: string;
  redTeamId: string;
  redTeamName: string;
  winnerSide: Side;
  winnerTeamId: string;
  loserTeamId: string;
  actions: Action[];
  // enriched at load time
  patchNum: number;
  startedAt: string;
}

interface TeamPowerEntry {
  id: string;
  name: string;
  power_score: Record<string, number>;
}

interface BanPredictionResult {
  championId: string;
  championName: string;
  score: number;
  reason: 'meta' | 'target' | 'strategy' | 'response';
}

// ============================================================================
// Utilities
// ============================================================================

function parsePatch(p: string | null): number {
  if (!p) return 0;
  const parts = p.split('.');
  return (parseInt(parts[0]) || 0) * 100 + (parseInt(parts[1]) || 0);
}

function slotFromAction(a: Action): BanSlot | null {
  const m = a.slot.match(/(BLUE|RED)_BAN_(\d)/);
  if (!m) return null;
  const n = parseInt(m[2]);
  return (n >= 1 && n <= 5) ? `ban_${n}` as BanSlot : null;
}

function getEarlierOpponentPicks(actions: Action[], bannerSide: Side, banSlot: BanSlot): string[] {
  if (banSlot === 'ban_1' || banSlot === 'ban_2' || banSlot === 'ban_3') return [];
  const oppSide: Side = bannerSide === 'blue' ? 'red' : 'blue';
  const picks: string[] = [];
  for (const a of actions) {
    if (a.type === 'pick' && a.side === oppSide) {
      const m = a.slot.match(/(BLUE|RED)_PICK_(\d)/);
      if (m && parseInt(m[2]) <= 3) picks.push(a.championId);
    }
  }
  return picks;
}

// Series date cache
const seriesDates = new Map<string, string>();
function loadSeriesDate(seriesId: string): string {
  if (seriesDates.has(seriesId)) return seriesDates.get(seriesId)!;
  const fp = path.join(DATA_DIR, `series_${seriesId}.json`);
  try {
    const d = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const date = d.startedAt || '2024-01-01T00:00:00Z';
    seriesDates.set(seriesId, date);
    return date;
  } catch {
    seriesDates.set(seriesId, '2024-01-01T00:00:00Z');
    return '2024-01-01T00:00:00Z';
  }
}

// ============================================================================
// Power Score Loader
// ============================================================================

let powerScoreMin = Infinity;
let powerScoreMax = -Infinity;
const teamPowerScores = new Map<string, Array<{ date: string; score: number }>>();

function loadPowerScores(): void {
  const data: TeamPowerEntry[] = JSON.parse(fs.readFileSync(INPUT_POWER_SCORES, 'utf-8'));
  for (const team of data) {
    const entries: Array<{ date: string; score: number }> = [];
    for (const [date, score] of Object.entries(team.power_score)) {
      entries.push({ date, score });
      if (score < powerScoreMin) powerScoreMin = score;
      if (score > powerScoreMax) powerScoreMax = score;
    }
    entries.sort((a, b) => a.date.localeCompare(b.date));
    teamPowerScores.set(team.id, entries);
  }
}

function getTeamPowerNorm(teamId: string, date: string): number {
  const list = teamPowerScores.get(teamId);
  if (!list || list.length === 0) return 0.5;
  const t = new Date(date).getTime();
  let closest = list[0];
  let minD = Infinity;
  for (const e of list) {
    const d = Math.abs(new Date(e.date).getTime() - t);
    if (d < minD) { minD = d; closest = e; }
  }
  if (powerScoreMax === powerScoreMin) return 0.5;
  return (closest.score - powerScoreMin) / (powerScoreMax - powerScoreMin);
}

// ============================================================================
// Load All Games
// ============================================================================

async function loadAllGames(): Promise<Game[]> {
  const games: Game[] = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(INPUT_TIMELINE, 'utf-8'),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const g = JSON.parse(line);
    g.patchNum = parsePatch(g.patch);
    g.startedAt = loadSeriesDate(g.seriesId);
    games.push(g);
  }
  games.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return games;
}

// ============================================================================
// Model: Trainable on a subset of games
// ============================================================================

class BanModel {
  private beta: number;
  private latestPatch: number = 0;

  // Global (power-weighted)
  private globalBanFreq = new Map<string, { count: number; wSum: number }>();
  private globalBanTotalW = 0;

  // Team-specific (decay only)
  private teamBanPatterns = new Map<string, Map<string, Map<string, { count: number; dSum: number }>>>();
  // teamId -> `${side}|${slot}` -> championId -> stats

  // Opponent targeting (decay only)
  private oppTargeting = new Map<string, Map<string, Map<string, { count: number; dSum: number }>>>();
  // teamId -> oppId -> champId -> stats

  // Response patterns (power-weighted)
  private responsePatterns = new Map<string, { count: number; wSum: number }>();
  private responseTotalW = 0;

  // Champion names
  private champNames = new Map<string, string>();
  private champRoles = new Map<string, Role>();
  private champRoleCounts = new Map<string, Map<Role, number>>();

  // All known champion IDs from training
  private trainChampions = new Set<string>();

  constructor(beta: number) {
    this.beta = beta;
  }

  private decay(patchNum: number): number {
    return Math.exp(-this.beta * (this.latestPatch - patchNum));
  }

  train(games: Game[]): void {
    // Determine latest patch
    this.latestPatch = 0;
    for (const g of games) {
      if (g.patchNum > this.latestPatch) this.latestPatch = g.patchNum;
    }

    for (const game of games) {
      const d = this.decay(game.patchNum);
      const date = game.startedAt.split('T')[0];
      const avgP = (getTeamPowerNorm(game.blueTeamId, date) + getTeamPowerNorm(game.redTeamId, date)) / 2;
      const pw = 0.5 + avgP; // [0.5, 1.5]

      for (const a of game.actions) {
        this.champNames.set(a.championId, a.championName);
        this.trainChampions.add(a.championId);

        if (a.type === 'pick' && a.role) {
          if (!this.champRoleCounts.has(a.championId)) this.champRoleCounts.set(a.championId, new Map());
          const rm = this.champRoleCounts.get(a.championId)!;
          rm.set(a.role, (rm.get(a.role) || 0) + 1);
        }

        if (a.type === 'ban') {
          const slot = slotFromAction(a);
          if (!slot) continue;

          // Global (power-weighted)
          if (!this.globalBanFreq.has(a.championId)) this.globalBanFreq.set(a.championId, { count: 0, wSum: 0 });
          const gbf = this.globalBanFreq.get(a.championId)!;
          gbf.count++;
          gbf.wSum += d * pw;
          this.globalBanTotalW += d * pw;

          // Team-specific (decay only)
          const key = `${a.side}|${slot}`;
          if (!this.teamBanPatterns.has(a.teamId)) this.teamBanPatterns.set(a.teamId, new Map());
          const tm = this.teamBanPatterns.get(a.teamId)!;
          if (!tm.has(key)) tm.set(key, new Map());
          const sm = tm.get(key)!;
          if (!sm.has(a.championId)) sm.set(a.championId, { count: 0, dSum: 0 });
          const cs = sm.get(a.championId)!;
          cs.count++;
          cs.dSum += d;

          // Response
          if (slot === 'ban_4' || slot === 'ban_5') {
            const oppPicks = getEarlierOpponentPicks(game.actions, a.side, slot);
            for (const op of oppPicks) {
              const rk = `${op}|${a.championId}`;
              if (!this.responsePatterns.has(rk)) this.responsePatterns.set(rk, { count: 0, wSum: 0 });
              const rp = this.responsePatterns.get(rk)!;
              rp.count++;
              rp.wSum += d * pw;
              this.responseTotalW += d * pw;
            }
          }
        }
      }

      // Opponent targeting
      const trackT = (tid: string, oid: string, picks: string[]) => {
        if (!this.oppTargeting.has(tid)) this.oppTargeting.set(tid, new Map());
        const om = this.oppTargeting.get(tid)!;
        if (!om.has(oid)) om.set(oid, new Map());
        const cm = om.get(oid)!;
        for (const c of picks) {
          if (!cm.has(c)) cm.set(c, { count: 0, dSum: 0 });
          const s = cm.get(c)!;
          s.count++;
          s.dSum += d;
        }
      };
      const bPicks = game.actions.filter(a => a.type === 'pick' && a.side === 'blue').map(a => a.championId);
      const rPicks = game.actions.filter(a => a.type === 'pick' && a.side === 'red').map(a => a.championId);
      trackT(game.blueTeamId, game.redTeamId, rPicks);
      trackT(game.redTeamId, game.blueTeamId, bPicks);
    }

    // Primary roles
    for (const [cid, rm] of this.champRoleCounts) {
      let maxR: Role = 'mid', maxC = 0;
      for (const [r, c] of rm) { if (c > maxC) { maxC = c; maxR = r; } }
      this.champRoles.set(cid, maxR);
    }
  }

  private metaScore(cid: string): number {
    const g = this.globalBanFreq.get(cid);
    if (!g || this.globalBanTotalW === 0) return 0;
    let maxR = 0;
    for (const v of this.globalBanFreq.values()) {
      const r = v.wSum / this.globalBanTotalW;
      if (r > maxR) maxR = r;
    }
    return maxR > 0 ? (g.wSum / this.globalBanTotalW) / maxR : 0;
  }

  private targetScore(cid: string, tid: string, oid: string): number {
    const om = this.oppTargeting.get(tid)?.get(oid);
    if (!om) return 0;
    const s = om.get(cid);
    if (!s) return 0;
    let total = 0;
    for (const v of om.values()) total += v.dSum;
    if (total === 0) return 0;
    return Math.min(1, (s.dSum / total) * 5);
  }

  private strategyScore(cid: string, tid: string, side: Side, slot: BanSlot): number {
    const key = `${side}|${slot}`;
    const sm = this.teamBanPatterns.get(tid)?.get(key);
    if (!sm) return 0;
    const cs = sm.get(cid);
    if (!cs) return 0;
    let total = 0;
    for (const v of sm.values()) total += v.dSum;
    if (total === 0) return 0;
    return cs.dSum / total;
  }

  private responseScore(cid: string, oppPicks: string[]): { score: number; trigger: string | null } {
    if (oppPicks.length === 0 || this.responseTotalW === 0) return { score: 0, trigger: null };
    let maxS = 0, trigger: string | null = null;
    for (const op of oppPicks) {
      const rk = `${op}|${cid}`;
      const rp = this.responsePatterns.get(rk);
      if (rp && rp.wSum > 0) {
        let totalForTrigger = 0;
        for (const [k, v] of this.responsePatterns) {
          if (k.startsWith(op + '|')) totalForTrigger += v.wSum;
        }
        const s = totalForTrigger > 0 ? rp.wSum / totalForTrigger : 0;
        if (s > maxS) { maxS = s; trigger = op; }
      }
    }
    return { score: Math.min(1, maxS), trigger };
  }

  predictTopK(
    teamId: string, opponentId: string, side: Side, slot: BanSlot,
    oppPicks: string[], banned: Set<string>, k: number
  ): BanPredictionResult[] {
    const isResp = slot === 'ban_4' || slot === 'ban_5';
    const w = isResp
      ? { meta: 0.20, target: 0.25, strategy: 0.25, response: 0.30 }
      : { meta: 0.30, target: 0.25, strategy: 0.35, response: 0.10 };

    const candidates: BanPredictionResult[] = [];

    for (const cid of this.trainChampions) {
      if (banned.has(cid)) continue;

      const m = this.metaScore(cid);
      const t = this.targetScore(cid, teamId, opponentId);
      const s = this.strategyScore(cid, teamId, side, slot);
      const { score: r } = this.responseScore(cid, oppPicks);

      const total = w.meta * m + w.target * t + w.strategy * s + w.response * r;
      if (total <= 0) continue;

      const maxComp = Math.max(m, t, s, r);
      let reason: 'meta' | 'target' | 'strategy' | 'response' = 'meta';
      if (r === maxComp && r > 0) reason = 'response';
      else if (s === maxComp) reason = 'strategy';
      else if (t === maxComp) reason = 'target';

      candidates.push({
        championId: cid,
        championName: this.champNames.get(cid) || cid,
        score: total,
        reason,
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, k);
  }
}

// ============================================================================
// Evaluation
// ============================================================================

interface EvalResult {
  exact: number;
  top3: number;
  top5: number;
  total: number;
  perSlot: Record<BanSlot, { exact: number; top3: number; top5: number; total: number }>;
}

function evaluate(model: BanModel, testGames: Game[]): EvalResult {
  const result: EvalResult = {
    exact: 0, top3: 0, top5: 0, total: 0,
    perSlot: {} as Record<BanSlot, { exact: number; top3: number; top5: number; total: number }>,
  };
  for (const s of BAN_SLOTS) result.perSlot[s] = { exact: 0, top3: 0, top5: 0, total: 0 };

  for (const game of testGames) {
    // Build actual ban map
    const actualBans: Record<Side, Map<BanSlot, string>> = {
      blue: new Map(), red: new Map(),
    };
    for (const a of game.actions) {
      if (a.type === 'ban') {
        const slot = slotFromAction(a);
        if (slot) actualBans[a.side].set(slot, a.championId);
      }
    }

    for (const side of ['blue', 'red'] as Side[]) {
      const teamId = side === 'blue' ? game.blueTeamId : game.redTeamId;
      const oppId = side === 'blue' ? game.redTeamId : game.blueTeamId;
      const banned = new Set<string>();

      for (const slot of BAN_SLOTS) {
        const oppPicks = getEarlierOpponentPicks(game.actions, side, slot);
        const top5 = model.predictTopK(teamId, oppId, side, slot, oppPicks, banned, 5);

        const actual = actualBans[side].get(slot);
        if (!actual) continue;

        // Add actual ban to exclusion set for next slot prediction
        banned.add(actual);
        // Also add top-1 prediction to avoid predicting same champ in multiple slots
        if (top5.length > 0) banned.add(top5[0].championId);

        result.total++;
        result.perSlot[slot].total++;

        const top5Ids = top5.map(p => p.championId);
        if (top5Ids[0] === actual) {
          result.exact++;
          result.perSlot[slot].exact++;
        }
        if (top5Ids.slice(0, 3).includes(actual)) {
          result.top3++;
          result.perSlot[slot].top3++;
        }
        if (top5Ids.includes(actual)) {
          result.top5++;
          result.perSlot[slot].top5++;
        }
      }
    }
  }

  return result;
}

function pct(n: number, d: number): string {
  return d > 0 ? (n / d * 100).toFixed(1) + '%' : 'N/A';
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('Ban Predictor Evaluation — Patch-Aware + β Sensitivity');
  console.log('='.repeat(70));
  console.log('');

  loadPowerScores();
  const allGames = await loadAllGames();
  console.log(`Loaded ${allGames.length} games`);

  // ========================================================================
  // Step 1: Enumerate patches
  // ========================================================================

  const patchGames = new Map<number, Game[]>();
  for (const g of allGames) {
    if (!patchGames.has(g.patchNum)) patchGames.set(g.patchNum, []);
    patchGames.get(g.patchNum)!.push(g);
  }

  const patches = [...patchGames.keys()].sort((a, b) => a - b);
  console.log(`\nPatches (${patches.length}): ${patches.map(p => {
    const major = Math.floor(p / 100); const minor = p % 100;
    return `${major}.${minor}(${patchGames.get(p)!.length})`;
  }).join(', ')}`);

  // ========================================================================
  // Step 2: Rolling window K=2..5 + Step 3 Top-K + per-slot
  // ========================================================================

  console.log('\n' + '='.repeat(70));
  console.log('Step 2 & 3: Rolling Window Evaluation');
  console.log('='.repeat(70));

  const BETA_DEFAULT = 0.12;
  const rollingResults: Array<{ K: number; exact: string; top3: string; top5: string; perSlot: EvalResult['perSlot'] }> = [];

  for (const K of [2, 3, 4, 5]) {
    let totalResult: EvalResult = {
      exact: 0, top3: 0, top5: 0, total: 0,
      perSlot: {} as Record<BanSlot, { exact: number; top3: number; top5: number; total: number }>,
    };
    for (const s of BAN_SLOTS) totalResult.perSlot[s] = { exact: 0, top3: 0, top5: 0, total: 0 };

    let testPatchCount = 0;

    // For each test patch (skip first K patches)
    for (let i = K; i < patches.length; i++) {
      const testPatch = patches[i];
      const trainPatches = patches.slice(i - K, i);

      const trainGames = trainPatches.flatMap(p => patchGames.get(p) || []);
      const testGames = patchGames.get(testPatch) || [];

      if (trainGames.length === 0 || testGames.length === 0) continue;
      testPatchCount++;

      const model = new BanModel(BETA_DEFAULT);
      model.train(trainGames);
      const result = evaluate(model, testGames);

      totalResult.exact += result.exact;
      totalResult.top3 += result.top3;
      totalResult.top5 += result.top5;
      totalResult.total += result.total;
      for (const s of BAN_SLOTS) {
        totalResult.perSlot[s].exact += result.perSlot[s].exact;
        totalResult.perSlot[s].top3 += result.perSlot[s].top3;
        totalResult.perSlot[s].top5 += result.perSlot[s].top5;
        totalResult.perSlot[s].total += result.perSlot[s].total;
      }
    }

    rollingResults.push({
      K,
      exact: pct(totalResult.exact, totalResult.total),
      top3: pct(totalResult.top3, totalResult.total),
      top5: pct(totalResult.top5, totalResult.total),
      perSlot: totalResult.perSlot,
    });

    console.log(`\nK=${K} (tested on ${testPatchCount} patches, ${totalResult.total} ban predictions):`);
    console.log(`  Exact: ${pct(totalResult.exact, totalResult.total)}  Top-3: ${pct(totalResult.top3, totalResult.total)}  Top-5: ${pct(totalResult.top5, totalResult.total)}`);
    console.log(`  Per-slot:`);
    for (const s of BAN_SLOTS) {
      const ps = totalResult.perSlot[s];
      console.log(`    ${s}: Exact=${pct(ps.exact, ps.total)} Top-3=${pct(ps.top3, ps.total)} Top-5=${pct(ps.top5, ps.total)} (n=${ps.total})`);
    }
  }

  // Print comparison table
  console.log('\n' + '-'.repeat(50));
  console.log('K    Exact     Top-3     Top-5');
  console.log('-'.repeat(50));
  for (const r of rollingResults) {
    console.log(`${r.K}    ${r.exact.padStart(6)}    ${r.top3.padStart(6)}    ${r.top5.padStart(6)}`);
  }

  // ========================================================================
  // Step 4: β sensitivity (fix K to best from Step 2)
  // ========================================================================

  // Use K=3 as default (good balance)
  const bestK = 3;

  console.log('\n' + '='.repeat(70));
  console.log(`Step 4: β Sensitivity Analysis (K=${bestK})`);
  console.log('='.repeat(70));

  const betaResults: Array<{ beta: number; exact: string; top3: string; top5: string }> = [];

  for (const beta of [0.05, 0.1, 0.2, 0.4]) {
    let totalResult: EvalResult = {
      exact: 0, top3: 0, top5: 0, total: 0,
      perSlot: {} as Record<BanSlot, { exact: number; top3: number; top5: number; total: number }>,
    };
    for (const s of BAN_SLOTS) totalResult.perSlot[s] = { exact: 0, top3: 0, top5: 0, total: 0 };

    for (let i = bestK; i < patches.length; i++) {
      const testPatch = patches[i];
      const trainPatches = patches.slice(i - bestK, i);

      const trainGames = trainPatches.flatMap(p => patchGames.get(p) || []);
      const testGames = patchGames.get(testPatch) || [];

      if (trainGames.length === 0 || testGames.length === 0) continue;

      const model = new BanModel(beta);
      model.train(trainGames);
      const result = evaluate(model, testGames);

      totalResult.exact += result.exact;
      totalResult.top3 += result.top3;
      totalResult.top5 += result.top5;
      totalResult.total += result.total;
    }

    betaResults.push({
      beta,
      exact: pct(totalResult.exact, totalResult.total),
      top3: pct(totalResult.top3, totalResult.total),
      top5: pct(totalResult.top5, totalResult.total),
    });

    console.log(`β=${beta}: Exact=${pct(totalResult.exact, totalResult.total)} Top-3=${pct(totalResult.top3, totalResult.total)} Top-5=${pct(totalResult.top5, totalResult.total)}`);
  }

  console.log('\n' + '-'.repeat(50));
  console.log('β       Exact     Top-3     Top-5');
  console.log('-'.repeat(50));
  for (const r of betaResults) {
    console.log(`${r.beta.toFixed(2)}     ${r.exact.padStart(6)}    ${r.top3.padStart(6)}    ${r.top5.padStart(6)}`);
  }

  // ========================================================================
  // Step 5: Conclusion
  // ========================================================================

  console.log('\n' + '='.repeat(70));
  console.log('Step 5: Analysis & Conclusion');
  console.log('='.repeat(70));

  // Determine best slot type
  const bestRolling = rollingResults.find(r => r.K === bestK)!;
  const phase1 = BAN_SLOTS.slice(0, 3); // ban_1..3
  const phase2 = BAN_SLOTS.slice(3, 5); // ban_4..5

  let p1Top5 = 0, p1Total = 0, p2Top5 = 0, p2Total = 0;
  for (const s of phase1) {
    p1Top5 += bestRolling.perSlot[s].top5;
    p1Total += bestRolling.perSlot[s].total;
  }
  for (const s of phase2) {
    p2Top5 += bestRolling.perSlot[s].top5;
    p2Total += bestRolling.perSlot[s].total;
  }

  console.log(`\nBan Phase 1 (ban_1-3, meta-driven): Top-5 = ${pct(p1Top5, p1Total)}`);
  console.log(`Ban Phase 2 (ban_4-5, response-driven): Top-5 = ${pct(p2Top5, p2Total)}`);

  console.log(`
Q1: 版本对齐后模型是否有效？
  原始 time-split accuracy: 3.76% (exact)
  Patch-aligned (K=${bestK}): Exact=${bestRolling.exact}, Top-5=${bestRolling.top5}
  结论: [see output above]

Q2: ban 模型可达上限?
  Top-5 ceiling: ${bestRolling.top5}
  (在不加新 feature/不改 α 结构的约束下)

Q3: 下一步方向?
  [see output above]
`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
