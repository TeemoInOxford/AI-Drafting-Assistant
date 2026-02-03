#!/usr/bin/env tsx
/**
 * build_pick_model.ts
 *
 * Phase 4: Pick Modeling — Core AI Drafting Loop
 *
 * Builds:
 *   A) Global meta pick strength (power-weighted)
 *   B) Role-specific slot priority
 *   C) Synergy model (power-weighted)
 *   D) Counter model (power-weighted)
 *   E) Team-specific pick habits (decay only)
 *
 * Output:
 *   - data/grid_v2/pick_model.json
 *   - data/grid_v2/pick_recommendations.jsonl
 *
 * Usage:
 *   npx tsx scripts/build_pick_model.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ============================================================================
// Constants
// ============================================================================

const DATA_DIR = path.join(process.cwd(), 'data', 'grid_v2');
const INPUT_TIMELINE = path.join(DATA_DIR, 'draft_timeline_enriched.jsonl');
const INPUT_POWER = path.join(DATA_DIR, 'team_power_score.json');
const OUTPUT_MODEL = path.join(DATA_DIR, 'pick_model.json');
const OUTPUT_RECOMMENDATIONS = path.join(DATA_DIR, 'pick_recommendations.jsonl');

const BETA = 0.15; // Patch decay

// Pick slots in order
const PICK_SLOTS = ['PICK_1', 'PICK_2', 'PICK_3', 'PICK_4', 'PICK_5'] as const;
type PickSlot = typeof PICK_SLOTS[number];
type Side = 'blue' | 'red';
type Role = 'top' | 'jungle' | 'mid' | 'bot' | 'support';
const ROLES: Role[] = ['top', 'jungle', 'mid', 'bot', 'support'];

// Scoring weights by pick phase
// Early picks (1-2): meta + role dominant
// Mid picks (3): balanced
// Late picks (4-5): synergy + counter dominant
const WEIGHTS: Record<PickSlot, { meta: number; role: number; synergy: number; counter: number; team: number }> = {
  PICK_1: { meta: 0.35, role: 0.25, synergy: 0.10, counter: 0.15, team: 0.15 },
  PICK_2: { meta: 0.30, role: 0.25, synergy: 0.15, counter: 0.15, team: 0.15 },
  PICK_3: { meta: 0.25, role: 0.20, synergy: 0.20, counter: 0.20, team: 0.15 },
  PICK_4: { meta: 0.20, role: 0.15, synergy: 0.25, counter: 0.25, team: 0.15 },
  PICK_5: { meta: 0.15, role: 0.10, synergy: 0.30, counter: 0.30, team: 0.15 },
};

// ============================================================================
// Types
// ============================================================================

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
  patch: string | null;
  blueTeamId: string;
  blueTeamName: string;
  redTeamId: string;
  redTeamName: string;
  winnerSide: Side;
  winnerTeamId: string;
  actions: Action[];
  patchNum: number;
  startedAt: string;
}

interface TeamPowerEntry {
  id: string;
  name: string;
  power_score: Record<string, number>;
}

interface PickRecommendation {
  champion: string;
  championId: string;
  role: Role | null;
  score: number;
  reason: 'meta' | 'synergy' | 'counter' | 'team_preference' | 'role';
  components: {
    meta: number;
    role: number;
    synergy: number;
    counter: number;
    team: number;
  };
}

interface GameRecommendationEntry {
  gameId: string;
  seriesId: string;
  patch: string;
  side: Side;
  teamId: string;
  pickSlot: string;
  actualPick: { championId: string; championName: string; role: Role | null };
  recommendations: PickRecommendation[];
  actualInTop1: boolean;
  actualInTop3: boolean;
  actualInTop5: boolean;
}

// ============================================================================
// Global State
// ============================================================================

let LATEST_PATCH = 0;
let powerScoreMin = Infinity;
let powerScoreMax = -Infinity;
const teamPowerScores = new Map<string, Array<{ date: string; score: number }>>();

// Champion info
const championNames = new Map<string, string>();
const championRoles = new Map<string, Map<Role, number>>(); // championId -> role -> count

// Series dates
const seriesDates = new Map<string, string>();

// ============================================================================
// A) Global Meta Pick Strength (power-weighted)
// ============================================================================

// championId -> role -> { picks, wins, weightedPicks, weightedWins }
const globalPickStrength = new Map<string, Map<Role, {
  picks: number;
  wins: number;
  wPicks: number;
  wWins: number;
}>>();

// ============================================================================
// B) Slot-Role Priority
// ============================================================================

// side -> pickSlot -> role -> { count, weightedCount }
const slotRolePrior: Record<Side, Record<PickSlot, Map<Role, { count: number; wCount: number }>>> = {
  blue: {} as Record<PickSlot, Map<Role, { count: number; wCount: number }>>,
  red: {} as Record<PickSlot, Map<Role, { count: number; wCount: number }>>,
};

// ============================================================================
// C) Synergy Model (power-weighted)
// ============================================================================

// "champA|champB" (sorted) -> { games, wins, wGames, wWins }
const synergyPairs = new Map<string, { games: number; wins: number; wGames: number; wWins: number }>();

// ============================================================================
// D) Counter Model (power-weighted)
// ============================================================================

// "oppChamp|ourChamp" -> { games, wins, wGames, wWins }
// oppChamp was picked BEFORE ourChamp by opponent
const counterPairs = new Map<string, { games: number; wins: number; wGames: number; wWins: number }>();

// ============================================================================
// E) Team-Specific Pick Habits (decay only, NO power)
// ============================================================================

// teamId -> side -> role -> championId -> { count, dCount }
const teamPickHabits = new Map<string, {
  blue: Map<Role, Map<string, { count: number; dCount: number }>>;
  red: Map<Role, Map<string, { count: number; dCount: number }>>;
  totalGames: number;
}>();

// ============================================================================
// Utilities
// ============================================================================

function parsePatch(p: string | null): number {
  if (!p) return 0;
  const parts = p.split('.');
  return (parseInt(parts[0]) || 0) * 100 + (parseInt(parts[1]) || 0);
}

function decay(patchNum: number): number {
  return Math.exp(-BETA * (LATEST_PATCH - patchNum));
}

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

function synergyKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

function counterKey(opp: string, our: string): string {
  return `${opp}|${our}`;
}

function parsePickSlot(slot: string): { side: Side; pickSlot: PickSlot } | null {
  const m = slot.match(/(BLUE|RED)_PICK_(\d)/);
  if (!m) return null;
  const side = m[1].toLowerCase() as Side;
  const n = parseInt(m[2]);
  if (n < 1 || n > 5) return null;
  return { side, pickSlot: `PICK_${n}` as PickSlot };
}

// ============================================================================
// Load Power Scores
// ============================================================================

function loadPowerScores(): void {
  const data: TeamPowerEntry[] = JSON.parse(fs.readFileSync(INPUT_POWER, 'utf-8'));
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
    if (g.patchNum > LATEST_PATCH) LATEST_PATCH = g.patchNum;
    games.push(g);
  }
  games.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return games;
}

// ============================================================================
// Build Models
// ============================================================================

function initSlotRolePrior(): void {
  for (const side of ['blue', 'red'] as Side[]) {
    for (const slot of PICK_SLOTS) {
      slotRolePrior[side][slot] = new Map();
      for (const role of ROLES) {
        slotRolePrior[side][slot].set(role, { count: 0, wCount: 0 });
      }
    }
  }
}

function buildModels(games: Game[]): void {
  console.log('Building models from', games.length, 'games...');
  initSlotRolePrior();

  for (const game of games) {
    const d = decay(game.patchNum);
    const date = game.startedAt.split('T')[0];
    const avgPower = (getTeamPowerNorm(game.blueTeamId, date) + getTeamPowerNorm(game.redTeamId, date)) / 2;
    const pw = 0.5 + avgPower; // [0.5, 1.5] for global weighting

    // Collect picks by side
    const bluePicks: Array<{ championId: string; role: Role | null }> = [];
    const redPicks: Array<{ championId: string; role: Role | null }> = [];
    const blueWon = game.winnerSide === 'blue';
    const redWon = game.winnerSide === 'red';

    // Initialize team habits
    for (const tid of [game.blueTeamId, game.redTeamId]) {
      if (!teamPickHabits.has(tid)) {
        teamPickHabits.set(tid, {
          blue: new Map(ROLES.map(r => [r, new Map()])),
          red: new Map(ROLES.map(r => [r, new Map()])),
          totalGames: 0,
        });
      }
      teamPickHabits.get(tid)!.totalGames++;
    }

    for (const action of game.actions) {
      championNames.set(action.championId, action.championName);

      if (action.type === 'pick') {
        const parsed = parsePickSlot(action.slot);
        if (!parsed) continue;

        const { side, pickSlot } = parsed;
        const isWinner = action.isWinner;
        const role = action.role;

        // Track picks
        if (side === 'blue') bluePicks.push({ championId: action.championId, role });
        else redPicks.push({ championId: action.championId, role });

        // A) Global Meta Pick Strength (power-weighted)
        if (role) {
          if (!globalPickStrength.has(action.championId)) {
            globalPickStrength.set(action.championId, new Map());
          }
          const roleMap = globalPickStrength.get(action.championId)!;
          if (!roleMap.has(role)) {
            roleMap.set(role, { picks: 0, wins: 0, wPicks: 0, wWins: 0 });
          }
          const stats = roleMap.get(role)!;
          stats.picks++;
          stats.wPicks += d * pw;
          if (isWinner) {
            stats.wins++;
            stats.wWins += d * pw;
          }

          // Track champion roles
          if (!championRoles.has(action.championId)) {
            championRoles.set(action.championId, new Map());
          }
          const crm = championRoles.get(action.championId)!;
          crm.set(role, (crm.get(role) || 0) + 1);
        }

        // B) Slot-Role Priority
        if (role) {
          const sr = slotRolePrior[side][pickSlot].get(role)!;
          sr.count++;
          sr.wCount += d * pw;
        }

        // E) Team-Specific Pick Habits (decay only, NO power)
        if (role) {
          const th = teamPickHabits.get(action.teamId)!;
          const sideMap = side === 'blue' ? th.blue : th.red;
          const roleMap = sideMap.get(role)!;
          if (!roleMap.has(action.championId)) {
            roleMap.set(action.championId, { count: 0, dCount: 0 });
          }
          const cs = roleMap.get(action.championId)!;
          cs.count++;
          cs.dCount += d; // NO power weighting
        }
      }
    }

    // C) Synergy Model (same team pairs, power-weighted)
    const recordSynergy = (picks: Array<{ championId: string; role: Role | null }>, won: boolean) => {
      for (let i = 0; i < picks.length; i++) {
        for (let j = i + 1; j < picks.length; j++) {
          const key = synergyKey(picks[i].championId, picks[j].championId);
          if (!synergyPairs.has(key)) {
            synergyPairs.set(key, { games: 0, wins: 0, wGames: 0, wWins: 0 });
          }
          const sp = synergyPairs.get(key)!;
          sp.games++;
          sp.wGames += d * pw;
          if (won) {
            sp.wins++;
            sp.wWins += d * pw;
          }
        }
      }
    };
    recordSynergy(bluePicks, blueWon);
    recordSynergy(redPicks, redWon);

    // D) Counter Model (opponent picked BEFORE us, power-weighted)
    // Blue picks against red's earlier picks, and vice versa
    const recordCounters = (
      ourPicks: Array<{ championId: string; role: Role | null }>,
      oppPicks: Array<{ championId: string; role: Role | null }>,
      weWon: boolean
    ) => {
      // For each of our picks, the opponent's picks that came before matter
      // We use BP order: PICK_1, PICK_1, PICK_2, PICK_2, PICK_3, PICK_3, etc.
      // Simplified: opponent's first 3 picks influence our later picks
      const oppFirst3 = oppPicks.slice(0, 3);
      const ourLast3 = ourPicks.slice(2); // PICK_3, PICK_4, PICK_5

      for (const opp of oppFirst3) {
        for (const our of ourLast3) {
          const key = counterKey(opp.championId, our.championId);
          if (!counterPairs.has(key)) {
            counterPairs.set(key, { games: 0, wins: 0, wGames: 0, wWins: 0 });
          }
          const cp = counterPairs.get(key)!;
          cp.games++;
          cp.wGames += d * pw;
          if (weWon) {
            cp.wins++;
            cp.wWins += d * pw;
          }
        }
      }
    };
    recordCounters(bluePicks, redPicks, blueWon);
    recordCounters(redPicks, bluePicks, redWon);
  }

  console.log('  Global pick strength:', globalPickStrength.size, 'champions');
  console.log('  Synergy pairs:', synergyPairs.size);
  console.log('  Counter pairs:', counterPairs.size);
  console.log('  Team habits:', teamPickHabits.size, 'teams');
}

// ============================================================================
// Scoring Functions
// ============================================================================

function getMetaScore(championId: string, role: Role | null): number {
  if (!role) return 0;
  const roleMap = globalPickStrength.get(championId);
  if (!roleMap) return 0;
  const stats = roleMap.get(role);
  if (!stats || stats.wPicks === 0) return 0;

  // Combine pick rate and win rate
  let maxWPicks = 0;
  for (const rm of globalPickStrength.values()) {
    for (const s of rm.values()) {
      if (s.wPicks > maxWPicks) maxWPicks = s.wPicks;
    }
  }

  const pickRate = maxWPicks > 0 ? stats.wPicks / maxWPicks : 0;
  const winRate = stats.wPicks > 0 ? stats.wWins / stats.wPicks : 0.5;

  return 0.6 * pickRate + 0.4 * (winRate - 0.3); // Normalize win rate around 0.3-0.7
}

function getRoleScore(side: Side, pickSlot: PickSlot, role: Role | null): number {
  if (!role) return 0;
  const slotMap = slotRolePrior[side][pickSlot];
  const roleStats = slotMap.get(role);
  if (!roleStats) return 0;

  let totalWCount = 0;
  for (const s of slotMap.values()) totalWCount += s.wCount;
  if (totalWCount === 0) return 0.2; // Default uniform

  return roleStats.wCount / totalWCount;
}

function getSynergyScore(championId: string, ownPicks: string[]): number {
  if (ownPicks.length === 0) return 0;

  let totalScore = 0;
  let count = 0;

  for (const ally of ownPicks) {
    const key = synergyKey(championId, ally);
    const sp = synergyPairs.get(key);
    if (sp && sp.wGames >= 3) {
      // Win rate uplift vs baseline 0.5
      const wr = sp.wWins / sp.wGames;
      const uplift = Math.max(0, (wr - 0.45) * 2); // Normalize to [0, ~1]
      totalScore += uplift;
      count++;
    }
  }

  return count > 0 ? totalScore / count : 0;
}

function getCounterScore(championId: string, opponentPicks: string[]): number {
  if (opponentPicks.length === 0) return 0;

  let totalScore = 0;
  let count = 0;

  for (const opp of opponentPicks) {
    const key = counterKey(opp, championId);
    const cp = counterPairs.get(key);
    if (cp && cp.wGames >= 3) {
      // Win rate when picking champion AFTER opponent's pick
      const wr = cp.wWins / cp.wGames;
      const counterStrength = Math.max(0, (wr - 0.45) * 2);
      totalScore += counterStrength;
      count++;
    }
  }

  return count > 0 ? totalScore / count : 0;
}

function getTeamScore(teamId: string, side: Side, role: Role | null, championId: string): number {
  if (!role) return 0;
  const th = teamPickHabits.get(teamId);
  if (!th) return 0;

  const sideMap = side === 'blue' ? th.blue : th.red;
  const roleMap = sideMap.get(role);
  if (!roleMap) return 0;

  const stats = roleMap.get(championId);
  if (!stats) return 0;

  // Normalize by total picks in this role for this team
  let totalD = 0;
  for (const s of roleMap.values()) totalD += s.dCount;
  if (totalD === 0) return 0;

  return stats.dCount / totalD;
}

function getPrimaryRole(championId: string): Role | null {
  const rm = championRoles.get(championId);
  if (!rm) return null;
  let maxRole: Role | null = null;
  let maxCount = 0;
  for (const [r, c] of rm) {
    if (c > maxCount) {
      maxCount = c;
      maxRole = r;
    }
  }
  return maxRole;
}

// ============================================================================
// Recommendation Engine
// ============================================================================

function recommend(
  teamId: string,
  side: Side,
  pickSlot: PickSlot,
  ownPicks: string[],
  opponentPicks: string[],
  bannedChampions: Set<string>,
  pickedChampions: Set<string>,
  filledRoles: Set<Role>,
  topK: number = 10
): PickRecommendation[] {
  const weights = WEIGHTS[pickSlot];
  const candidates: PickRecommendation[] = [];

  for (const championId of championNames.keys()) {
    // Skip banned/picked
    if (bannedChampions.has(championId) || pickedChampions.has(championId)) continue;

    const role = getPrimaryRole(championId);

    // Skip if role already filled (for simplicity)
    if (role && filledRoles.has(role)) continue;

    const meta = getMetaScore(championId, role);
    const roleScore = getRoleScore(side, pickSlot, role);
    const synergy = getSynergyScore(championId, ownPicks);
    const counter = getCounterScore(championId, opponentPicks);
    const team = getTeamScore(teamId, side, role, championId);

    const total =
      weights.meta * meta +
      weights.role * roleScore +
      weights.synergy * synergy +
      weights.counter * counter +
      weights.team * team;

    // Determine dominant reason
    const components = { meta, role: roleScore, synergy, counter, team };
    const maxComp = Math.max(meta, roleScore, synergy, counter, team);
    let reason: 'meta' | 'synergy' | 'counter' | 'team_preference' | 'role' = 'meta';
    if (team === maxComp && team > 0.1) reason = 'team_preference';
    else if (counter === maxComp && counter > 0.1) reason = 'counter';
    else if (synergy === maxComp && synergy > 0.1) reason = 'synergy';
    else if (roleScore === maxComp && roleScore > 0.2) reason = 'role';

    candidates.push({
      champion: championNames.get(championId) || championId,
      championId,
      role,
      score: total,
      reason,
      components,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, topK);
}

// ============================================================================
// Evaluation
// ============================================================================

function evaluate(games: Game[]): {
  entries: GameRecommendationEntry[];
  stats: {
    total: number;
    top1: number;
    top3: number;
    top5: number;
    bySlot: Record<PickSlot, { total: number; top1: number; top3: number; top5: number }>;
  };
} {
  const entries: GameRecommendationEntry[] = [];
  const stats = {
    total: 0,
    top1: 0,
    top3: 0,
    top5: 0,
    bySlot: {} as Record<PickSlot, { total: number; top1: number; top3: number; top5: number }>,
  };
  for (const s of PICK_SLOTS) {
    stats.bySlot[s] = { total: 0, top1: 0, top3: 0, top5: 0 };
  }

  for (const game of games) {
    // Collect banned champions
    const bannedChampions = new Set<string>();
    for (const a of game.actions) {
      if (a.type === 'ban') bannedChampions.add(a.championId);
    }

    // Process picks in order
    const blueState = { picks: [] as string[], filledRoles: new Set<Role>() };
    const redState = { picks: [] as string[], filledRoles: new Set<Role>() };
    const allPicked = new Set<string>();

    for (const action of game.actions) {
      if (action.type !== 'pick') continue;

      const parsed = parsePickSlot(action.slot);
      if (!parsed) continue;

      const { side, pickSlot } = parsed;
      const teamId = action.teamId;
      const ownState = side === 'blue' ? blueState : redState;
      const oppState = side === 'blue' ? redState : blueState;

      // Generate recommendation BEFORE adding this pick
      const recs = recommend(
        teamId,
        side,
        pickSlot,
        ownState.picks,
        oppState.picks,
        bannedChampions,
        allPicked,
        ownState.filledRoles,
        10
      );

      // Check accuracy
      const recIds = recs.map(r => r.championId);
      const inTop1 = recIds[0] === action.championId;
      const inTop3 = recIds.slice(0, 3).includes(action.championId);
      const inTop5 = recIds.slice(0, 5).includes(action.championId);

      stats.total++;
      stats.bySlot[pickSlot].total++;
      if (inTop1) { stats.top1++; stats.bySlot[pickSlot].top1++; }
      if (inTop3) { stats.top3++; stats.bySlot[pickSlot].top3++; }
      if (inTop5) { stats.top5++; stats.bySlot[pickSlot].top5++; }

      entries.push({
        gameId: game.gameId,
        seriesId: game.seriesId,
        patch: game.patch || 'unknown',
        side,
        teamId,
        pickSlot: action.slot,
        actualPick: {
          championId: action.championId,
          championName: action.championName,
          role: action.role,
        },
        recommendations: recs.slice(0, 5),
        actualInTop1: inTop1,
        actualInTop3: inTop3,
        actualInTop5: inTop5,
      });

      // Update state AFTER recommendation
      ownState.picks.push(action.championId);
      allPicked.add(action.championId);
      if (action.role) ownState.filledRoles.add(action.role);
    }
  }

  return { entries, stats };
}

// ============================================================================
// Export Model
// ============================================================================

function exportModel(): object {
  // Convert global pick strength
  const globalMeta: Record<string, Record<Role, { pickRate: number; winRate: number }>> = {};
  let maxWPicks = 0;
  for (const rm of globalPickStrength.values()) {
    for (const s of rm.values()) {
      if (s.wPicks > maxWPicks) maxWPicks = s.wPicks;
    }
  }
  for (const [cid, rm] of globalPickStrength) {
    const name = championNames.get(cid) || cid;
    globalMeta[name] = {} as Record<Role, { pickRate: number; winRate: number }>;
    for (const [role, stats] of rm) {
      globalMeta[name][role] = {
        pickRate: maxWPicks > 0 ? stats.wPicks / maxWPicks : 0,
        winRate: stats.wPicks > 0 ? stats.wWins / stats.wPicks : 0.5,
      };
    }
  }

  // Convert slot-role prior
  const slotRole: Record<Side, Record<PickSlot, Record<Role, number>>> = {
    blue: {} as Record<PickSlot, Record<Role, number>>,
    red: {} as Record<PickSlot, Record<Role, number>>,
  };
  for (const side of ['blue', 'red'] as Side[]) {
    for (const slot of PICK_SLOTS) {
      slotRole[side][slot] = {} as Record<Role, number>;
      let total = 0;
      for (const s of slotRolePrior[side][slot].values()) total += s.wCount;
      for (const role of ROLES) {
        const stats = slotRolePrior[side][slot].get(role)!;
        slotRole[side][slot][role] = total > 0 ? stats.wCount / total : 0.2;
      }
    }
  }

  // Top synergies
  const topSynergies = Array.from(synergyPairs.entries())
    .filter(([, s]) => s.wGames >= 10)
    .map(([key, s]) => {
      const [a, b] = key.split('|');
      return {
        pair: [championNames.get(a) || a, championNames.get(b) || b],
        games: s.games,
        winRate: s.wGames > 0 ? s.wWins / s.wGames : 0.5,
      };
    })
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, 50);

  // Top counters
  const topCounters = Array.from(counterPairs.entries())
    .filter(([, s]) => s.wGames >= 10)
    .map(([key, s]) => {
      const [opp, our] = key.split('|');
      return {
        oppPick: championNames.get(opp) || opp,
        ourCounter: championNames.get(our) || our,
        games: s.games,
        winRate: s.wGames > 0 ? s.wWins / s.wGames : 0.5,
      };
    })
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, 50);

  return {
    config: { beta: BETA, weights: WEIGHTS },
    stats: {
      champions: championNames.size,
      synergyPairs: synergyPairs.size,
      counterPairs: counterPairs.size,
      teams: teamPickHabits.size,
    },
    slotRolePrior: slotRole,
    topSynergies,
    topCounters,
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('Phase 4: Pick Model');
  console.log('='.repeat(70));
  console.log('');

  loadPowerScores();
  console.log('Loaded', teamPowerScores.size, 'team power scores');

  const allGames = await loadAllGames();
  console.log('Loaded', allGames.length, 'games');
  console.log('Latest patch:', LATEST_PATCH);
  console.log('');

  // Patch-aligned split (use last 20% of patches for test)
  const patchGames = new Map<number, Game[]>();
  for (const g of allGames) {
    if (!patchGames.has(g.patchNum)) patchGames.set(g.patchNum, []);
    patchGames.get(g.patchNum)!.push(g);
  }
  const patches = [...patchGames.keys()].sort((a, b) => a - b);
  const trainPatches = patches.slice(0, Math.floor(patches.length * 0.8));
  const testPatches = patches.slice(Math.floor(patches.length * 0.8));

  const trainGames = trainPatches.flatMap(p => patchGames.get(p) || []);
  const testGames = testPatches.flatMap(p => patchGames.get(p) || []);

  console.log('Train patches:', trainPatches.length, '→', trainGames.length, 'games');
  console.log('Test patches:', testPatches.length, '→', testGames.length, 'games');
  console.log('');

  // Build models on training data
  buildModels(trainGames);
  console.log('');

  // Evaluate on test data
  console.log('Evaluating on test set...');
  const { entries, stats } = evaluate(testGames);

  const pct = (n: number, d: number) => (d > 0 ? (n / d * 100).toFixed(1) + '%' : 'N/A');

  console.log('');
  console.log('='.repeat(70));
  console.log('Evaluation Results');
  console.log('='.repeat(70));
  console.log(`Total picks: ${stats.total}`);
  console.log(`Top-1: ${pct(stats.top1, stats.total)}`);
  console.log(`Top-3: ${pct(stats.top3, stats.total)}`);
  console.log(`Top-5: ${pct(stats.top5, stats.total)}`);
  console.log('');
  console.log('Per-slot:');
  for (const slot of PICK_SLOTS) {
    const s = stats.bySlot[slot];
    console.log(`  ${slot}: Top-1=${pct(s.top1, s.total)} Top-3=${pct(s.top3, s.total)} Top-5=${pct(s.top5, s.total)} (n=${s.total})`);
  }

  // Write outputs
  console.log('');
  console.log('Writing outputs...');

  const model = exportModel();
  fs.writeFileSync(OUTPUT_MODEL, JSON.stringify(model, null, 2), 'utf-8');
  console.log('  ', OUTPUT_MODEL);

  const recLines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(OUTPUT_RECOMMENDATIONS, recLines, 'utf-8');
  console.log('  ', OUTPUT_RECOMMENDATIONS, '→', entries.length, 'entries');

  // Sample recommendation
  console.log('');
  console.log('='.repeat(70));
  console.log('Sample Recommendation');
  console.log('='.repeat(70));
  const sample = entries.find(e => e.recommendations.length > 0);
  if (sample) {
    console.log(`Game: ${sample.gameId}`);
    console.log(`Slot: ${sample.pickSlot}`);
    console.log(`Actual: ${sample.actualPick.championName} (${sample.actualPick.role})`);
    console.log('Top 5 recommendations:');
    for (const r of sample.recommendations) {
      const c = r.components;
      console.log(`  ${r.champion} (${r.role}): ${r.score.toFixed(3)} [${r.reason}]`);
      console.log(`    meta=${c.meta.toFixed(2)} role=${c.role.toFixed(2)} syn=${c.synergy.toFixed(2)} ctr=${c.counter.toFixed(2)} team=${c.team.toFixed(2)}`);
    }
    console.log(`Actual in Top-5: ${sample.actualInTop5 ? 'YES' : 'NO'}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
