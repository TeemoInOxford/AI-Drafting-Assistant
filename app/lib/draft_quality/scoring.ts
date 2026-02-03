/**
 * draft_quality/scoring.ts
 *
 * Core scoring logic for draft quality evaluation.
 * Supports v0 (baseline), v1 (fix), v2 (shrink) configurations.
 */

import {
  Role, FixVersion, FixConfig, SlotModel,
  CandidateFeatures, CounterForResult, DRAFT_FEATURES,
} from './types';

const MIN_GAMES_THRESHOLD = 3;

// ============================================================================
// Accumulator Interfaces (passed in, not global)
// ============================================================================

export interface Accumulators {
  meta: Map<string, number>;
  totalPicks: number;
  synergy: Map<string, { games: number; wins: number }>;
  counter: Map<string, { games: number; wins: number }>;
  champRole: Map<string, Map<Role, number>>;
  knownChampions: Set<string>;
  champNames: Map<string, string>;
}

export function createAccumulators(): Accumulators {
  return {
    meta: new Map(),
    totalPicks: 0,
    synergy: new Map(),
    counter: new Map(),
    champRole: new Map(),
    knownChampions: new Set(),
    champNames: new Map(),
  };
}

// ============================================================================
// Key helpers
// ============================================================================

export function synergyKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

export function counterKey(earlier: string, later: string): string {
  return `${earlier}|${later}`;
}

// ============================================================================
// Feature computation functions
// ============================================================================

export function getPrimaryRole(acc: Accumulators, champId: string): Role | null {
  const rm = acc.champRole.get(champId);
  if (!rm || rm.size === 0) return null;
  let best: Role = 'mid', bestN = 0;
  for (const [r, n] of rm) { if (n > bestN) { bestN = n; best = r; } }
  return best;
}

export function getMeta(acc: Accumulators, champId: string): number {
  if (acc.totalPicks === 0) return 0;
  return (acc.meta.get(champId) ?? 0) / acc.totalPicks;
}

export function getSynergyWinRate(acc: Accumulators, picks: string[]): number {
  if (picks.length < 2) return 0.5;
  let s = 0, c = 0;
  for (let i = 0; i < picks.length; i++) {
    for (let j = i + 1; j < picks.length; j++) {
      const v = acc.synergy.get(synergyKey(picks[i], picks[j]));
      if (v && v.games >= MIN_GAMES_THRESHOLD) { s += v.wins / v.games; c++; }
    }
  }
  return c > 0 ? s / c : 0.5;
}

export function getCounterFor(acc: Accumulators, ourPick: string, oppPicks: string[]): number {
  const result = getCounterForWithCount(acc, ourPick, oppPicks);
  return result.value;
}

export function getCounterForWithCount(
  acc: Accumulators,
  ourPick: string,
  oppPicks: string[],
): CounterForResult {
  if (!oppPicks.length) return { value: 0.5, count: 0 };
  let s = 0, c = 0;
  for (const opp of oppPicks) {
    const v = acc.counter.get(counterKey(opp, ourPick));
    if (v && v.games >= MIN_GAMES_THRESHOLD) { s += v.wins / v.games; c++; }
  }
  return { value: c > 0 ? s / c : 0.5, count: c };
}

export function getCounterAgainst(
  acc: Accumulators,
  ourPrev: Array<{ champId: string; slotOrder: number }>,
  oppPicks: Array<{ champId: string; slotOrder: number }>,
): number {
  if (!ourPrev.length || !oppPicks.length) return 0.5;
  let s = 0, c = 0;
  for (const op of ourPrev) {
    for (const opp of oppPicks) {
      if (opp.slotOrder > op.slotOrder) {
        const v = acc.counter.get(counterKey(op.champId, opp.champId));
        if (v && v.games >= MIN_GAMES_THRESHOLD) { s += v.wins / v.games; c++; }
      }
    }
  }
  return c > 0 ? s / c : 0.5;
}

export function getRoleCoverage(roles: Array<Role | null>): number {
  const filled = new Set<Role>();
  for (const r of roles) {
    if (r) {
      if (filled.has(r)) return 0.5; // conflict
      filled.add(r);
    }
  }
  return 1.0;
}

// ============================================================================
// computeCandidateFeatures
// ============================================================================

export function computeCandidateFeatures(
  acc: Accumulators,
  candidateId: string,
  candidateRole: Role | null,
  ourPrevIds: string[],
  ourPrevRoles: Array<Role | null>,
  oppIds: string[],
  ourPrev: Array<{ champId: string; slotOrder: number }>,
  opp: Array<{ champId: string; slotOrder: number }>,
): CandidateFeatures {
  const ourIds = [...ourPrevIds, candidateId];
  return {
    our_meta_sum: ourIds.reduce((a, c) => a + getMeta(acc, c), 0),
    opp_meta_sum: oppIds.reduce((a, c) => a + getMeta(acc, c), 0),
    our_synergy: getSynergyWinRate(acc, ourIds),
    opp_synergy: getSynergyWinRate(acc, oppIds),
    counter_for: getCounterFor(acc, candidateId, oppIds),
    counter_against: getCounterAgainst(acc, ourPrev, opp),
    role_coverage: getRoleCoverage([...ourPrevRoles, candidateRole]),
  };
}

// ============================================================================
// draftScore — supports v0/v1/v2
// ============================================================================

export function draftScore(
  feats: CandidateFeatures,
  model: SlotModel,
  config: FixConfig,
  cfCount: number,
  cfRaw: number,
): number {
  if (config.version === 'v0') {
    return draftScoreV0(feats, model);
  }
  return draftScoreFixed(feats, model, config, cfCount, cfRaw);
}

function draftScoreV0(feats: CandidateFeatures, model: SlotModel): number {
  let score = 0;
  for (const f of DRAFT_FEATURES) {
    const raw = feats[f as keyof CandidateFeatures] ?? 0;
    const norm = model.normalization[f];
    const z = norm && norm.std > 1e-10 ? (raw - norm.mean) / norm.std : 0;
    score += (model.weights[f] ?? 0) * z;
  }
  return score;
}

function draftScoreFixed(
  feats: CandidateFeatures,
  model: SlotModel,
  config: FixConfig,
  cfCount: number,
  cfRaw: number,
): number {
  let score = 0;
  for (const f of DRAFT_FEATURES) {
    let raw = feats[f as keyof CandidateFeatures] ?? 0;
    const norm = model.normalization[f];

    // role_coverage: bypass z-score, use binary penalty
    if (f === 'role_coverage') {
      if (raw === 0.5) score += config.rolePenalty;
      continue;
    }

    // counter_for: v1 = skip when count=0; v2 = also shrink
    if (f === 'counter_for') {
      if (cfCount === 0) continue; // no evidence → zero contribution
      if (config.version === 'v2' && config.cfK > 0) {
        raw = 0.5 + (cfRaw - 0.5) * cfCount / (cfCount + config.cfK);
      }
    }

    const z = norm && norm.std > 1e-10 ? (raw - norm.mean) / norm.std : 0;
    score += (model.weights[f] ?? 0) * z;
  }
  return score;
}

// ============================================================================
// Point-biserial correlation (for validity checks)
// ============================================================================

export function pointBiserial(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;
  const n1 = y.filter(v => v === 1).length;
  const n0 = n - n1;
  if (n0 === 0 || n1 === 0) return 0;
  let s0 = 0, s1 = 0;
  for (let i = 0; i < n; i++) { if (y[i] === 1) s1 += x[i]; else s0 += x[i]; }
  const m1 = s1 / n1, m0 = s0 / n0;
  const xm = x.reduce((a, b) => a + b, 0) / n;
  let ss = 0;
  for (let i = 0; i < n; i++) ss += (x[i] - xm) ** 2;
  const sd = Math.sqrt(ss / n);
  if (sd < 1e-15) return 0;
  return ((m1 - m0) / sd) * Math.sqrt((n1 * n0) / (n * n));
}
