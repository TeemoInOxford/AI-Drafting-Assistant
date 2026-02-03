#!/usr/bin/env tsx
/**
 * build_win_features.ts
 *
 * Phase 1: Win Feature Extraction for Counterfactual Pick Evaluation
 *
 * CRITICAL: Online/chronological processing to avoid future leakage.
 * - Games sorted by startedAt
 * - For each game: extract features using ONLY past games' data
 * - Then update accumulators with this game's data
 *
 * No decay in Phase 1 (raw counts). Decay can be applied during model training.
 *
 * Output Schema (win_features.jsonl):
 * {
 *   gameId: string,
 *   seriesId: string,
 *   patch: string,
 *   patchNum: number,
 *   startedAt: string,
 *   side: "blue" | "red",
 *   slot: "PICK_1" | ... | "PICK_5",
 *   teamId: string,
 *   opponentTeamId: string,
 *   championId: string,
 *   championName: string,
 *   role: string | null,
 *   outcome: 0 | 1,                    // 1 = this side won
 *   features_source_cutoff: string,    // startedAt of this game (features use only data before this)
 *   features: {
 *     our_meta_sum: number,            // sum of meta scores for our picks so far (incl. this)
 *     opp_meta_sum: number,            // sum of meta scores for opponent picks so far
 *     our_synergy: number,             // avg synergy win rate among our picks
 *     opp_synergy: number,             // avg synergy win rate among opponent picks
 *     counter_for: number,             // our advantage: avg win rate when ourPick vs oppPicks
 *     counter_against: number,         // opponent advantage: avg win rate when oppPick vs ourPrevPicks
 *     power_diff: number,              // (our_power - opp_power) / 1000
 *     role_coverage: number,           // 1 if all roles unique, else penalty
 *     pick_progress: number,           // k / 5
 *   }
 * }
 *
 * Counter model key convention:
 *   counterKey(earlierChamp, laterChamp) → win rate of the team that picked laterChamp
 *   - counter_for: counterScore(counterKey(opp, ourPick)) for opp in oppPicks
 *   - counter_against: counterScore(counterKey(ourPrev, oppPick)) for pairs where oppPick came after ourPrev
 *
 * Usage:
 *   npx tsx scripts/build_win_features.ts
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
const OUTPUT_FILE = path.join(DATA_DIR, 'win_features.jsonl');

const MIN_GAMES_THRESHOLD = 3; // Minimum games to include synergy/counter scores

type Side = 'blue' | 'red';
type Role = 'top' | 'jungle' | 'mid' | 'bot' | 'support';

// BP sequence: maps to (side, pickIndex 0-4, global order 0-9)
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

// Precomputed slot -> BP order (0-9)
const SLOT_ORDER = new Map<string, number>(
  PICK_SEQUENCE.map((s, i) => [s.slot, i])
);

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
  redTeamId: string;
  winnerSide: Side;
  actions: Action[];
}

interface TeamPowerEntry {
  id: string;
  name: string;
  power_score: Record<string, number>;
}

interface FeatureRecord {
  gameId: string;
  seriesId: string;
  patch: string;
  patchNum: number;
  startedAt: string;
  side: Side;
  slot: string;
  teamId: string;
  opponentTeamId: string;
  championId: string;
  championName: string;
  role: string | null;
  outcome: 0 | 1;
  features_source_cutoff: string;
  features: {
    our_meta_sum: number;
    opp_meta_sum: number;
    our_synergy: number;
    opp_synergy: number;
    counter_for: number;
    counter_against: number;
    power_diff: number;
    role_coverage: number;
    pick_progress: number;
  };
}

// ============================================================================
// Online Accumulators (updated incrementally, past-only)
// ============================================================================

// Meta: championId -> total picks (no decay, raw count)
const metaAcc = new Map<string, number>();
let totalPicks = 0;

// Synergy: "champA|champB" (sorted) -> { games, wins }
const synergyAcc = new Map<string, { games: number; wins: number }>();

// Counter: "earlierChamp|laterChamp" -> { games, wins }
// wins = wins for the team that picked laterChamp
const counterAcc = new Map<string, { games: number; wins: number }>();

// ============================================================================
// Team Power Scores (static, loaded once)
// ============================================================================

let powerScoreMin = Infinity;
let powerScoreMax = -Infinity;
const teamPowerScores = new Map<string, Array<{ date: string; score: number }>>();
const seriesDates = new Map<string, string>();

// ============================================================================
// Utilities
// ============================================================================

function parsePatch(p: string | null): number {
  if (!p) return 0;
  const parts = p.split('.');
  return (parseInt(parts[0]) || 0) * 100 + (parseInt(parts[1]) || 0);
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

function getTeamPower(teamId: string, date: string): number {
  const list = teamPowerScores.get(teamId);
  if (!list || list.length === 0) return (powerScoreMin + powerScoreMax) / 2;
  const t = new Date(date).getTime();
  let closest = list[0];
  let minD = Infinity;
  for (const e of list) {
    const ed = new Date(e.date).getTime();
    if (ed <= t) {
      const d = t - ed;
      if (d < minD) { minD = d; closest = e; }
    }
  }
  return closest.score;
}

function synergyKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

function counterKey(earlier: string, later: string): string {
  return `${earlier}|${later}`;
}

// ============================================================================
// Load Power Scores
// ============================================================================

function loadPowerScores(): void {
  console.log('Loading team power scores...');
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
  console.log(`  Loaded ${teamPowerScores.size} teams, score range [${powerScoreMin}, ${powerScoreMax}]`);
}

// ============================================================================
// Load All Games
// ============================================================================

async function loadAllGames(): Promise<Array<Game & { patchNum: number; startedAt: string }>> {
  console.log('Loading games...');
  const games: Array<Game & { patchNum: number; startedAt: string }> = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(INPUT_TIMELINE, 'utf-8'),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const g = JSON.parse(line) as Game;
    const patchNum = parsePatch(g.patch);
    const startedAt = loadSeriesDate(g.seriesId);
    games.push({ ...g, patchNum, startedAt });
  }
  // Sort chronologically - CRITICAL for online processing
  games.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  console.log(`  Loaded ${games.length} games (sorted by startedAt)`);
  return games;
}

// ============================================================================
// Feature Computation (using current accumulators = past-only data)
// ============================================================================

function getMeta(champId: string): number {
  if (totalPicks === 0) return 0;
  const picks = metaAcc.get(champId) ?? 0;
  return picks / totalPicks; // Normalized by total picks so far
}

function getSynergyWinRate(picks: string[]): number {
  if (picks.length < 2) return 0.5;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < picks.length; i++) {
    for (let j = i + 1; j < picks.length; j++) {
      const key = synergyKey(picks[i], picks[j]);
      const s = synergyAcc.get(key);
      if (s && s.games >= MIN_GAMES_THRESHOLD) {
        sum += s.wins / s.games;
        count++;
      }
    }
  }
  return count > 0 ? sum / count : 0.5;
}

function getCounterFor(ourPick: string, oppPicks: string[]): number {
  // For each opp in oppPicks (picked before ourPick), get win rate when we pick ourPick
  // Key: counterKey(opp, ourPick) = earlier|later, win rate is for laterChamp's team
  if (oppPicks.length === 0) return 0.5;
  let sum = 0;
  let count = 0;
  for (const opp of oppPicks) {
    const key = counterKey(opp, ourPick);
    const c = counterAcc.get(key);
    if (c && c.games >= MIN_GAMES_THRESHOLD) {
      sum += c.wins / c.games;
      count++;
    }
  }
  return count > 0 ? sum / count : 0.5;
}

function getCounterAgainst(
  ourPrevPicks: Array<{ champId: string; slotOrder: number }>,
  oppPicks: Array<{ champId: string; slotOrder: number }>,
): number {
  // For each pair (ourPrev, oppPick) where oppPick was picked AFTER ourPrev in BP sequence,
  // compute opponent's advantage: counterKey(ourPrev, oppPick) win rate (for oppPick's team = opponent)
  if (ourPrevPicks.length === 0 || oppPicks.length === 0) return 0.5;
  let sum = 0;
  let count = 0;
  for (const ourPrev of ourPrevPicks) {
    for (const opp of oppPicks) {
      if (opp.slotOrder > ourPrev.slotOrder) {
        const key = counterKey(ourPrev.champId, opp.champId);
        const c = counterAcc.get(key);
        if (c && c.games >= MIN_GAMES_THRESHOLD) {
          sum += c.wins / c.games; // Win rate for opp's team = opponent's advantage
          count++;
        }
      }
    }
  }
  return count > 0 ? sum / count : 0.5;
}

function getRoleCoverage(roles: Array<Role | null>): number {
  const filled = new Set<Role>();
  for (const r of roles) {
    if (r) {
      if (filled.has(r)) return 0.5;
      filled.add(r);
    }
  }
  return 1.0;
}

// ============================================================================
// Feature Extraction for One Pick
// ============================================================================

function extractFeatures(
  game: Game & { patchNum: number; startedAt: string },
  pickIdx: number,
): FeatureRecord | null {
  const seqEntry = PICK_SEQUENCE[pickIdx];
  const { slot, side, idx } = seqEntry;

  const action = game.actions.find(a => a.slot === slot);
  if (!action || action.type !== 'pick') return null;

  const ourTeamId = side === 'blue' ? game.blueTeamId : game.redTeamId;
  const oppTeamId = side === 'blue' ? game.redTeamId : game.blueTeamId;
  const outcome = game.winnerSide === side ? 1 : 0;

  // Collect picks BEFORE this one (using BP sequence order)
  // Track slotOrder via action.slot -> SLOT_ORDER (no championId collision risk)
  const ourPrevPicks: Array<{ champId: string; slotOrder: number }> = [];
  const ourRoles: Array<Role | null> = [];
  const oppPicks: Array<{ champId: string; slotOrder: number }> = [];

  for (let i = 0; i < pickIdx; i++) {
    const prevSlot = PICK_SEQUENCE[i].slot;
    const prevAction = game.actions.find(a => a.slot === prevSlot);
    if (!prevAction || prevAction.type !== 'pick') continue;

    const order = SLOT_ORDER.get(prevSlot)!;
    if (PICK_SEQUENCE[i].side === side) {
      ourPrevPicks.push({ champId: prevAction.championId, slotOrder: order });
      ourRoles.push(prevAction.role);
    } else {
      oppPicks.push({ champId: prevAction.championId, slotOrder: order });
    }
  }

  // Current pick
  const ourPickIds = [...ourPrevPicks.map(p => p.champId), action.championId];
  const oppPickIds = oppPicks.map(p => p.champId);
  ourRoles.push(action.role);

  // Compute features
  const date = game.startedAt.split('T')[0];
  const ourPower = getTeamPower(ourTeamId, date);
  const oppPower = getTeamPower(oppTeamId, date);

  const features = {
    our_meta_sum: ourPickIds.reduce((s, c) => s + getMeta(c), 0),
    opp_meta_sum: oppPickIds.reduce((s, c) => s + getMeta(c), 0),
    our_synergy: getSynergyWinRate(ourPickIds),
    opp_synergy: getSynergyWinRate(oppPickIds),
    counter_for: getCounterFor(action.championId, oppPickIds),
    counter_against: getCounterAgainst(ourPrevPicks, oppPicks),
    power_diff: (ourPower - oppPower) / 1000,
    role_coverage: getRoleCoverage(ourRoles),
    pick_progress: (idx + 1) / 5,
  };

  return {
    gameId: game.gameId,
    seriesId: game.seriesId,
    patch: game.patch || '',
    patchNum: game.patchNum,
    startedAt: game.startedAt,
    side,
    slot: `PICK_${idx + 1}`,
    teamId: ourTeamId,
    opponentTeamId: oppTeamId,
    championId: action.championId,
    championName: action.championName,
    role: action.role,
    outcome: outcome as 0 | 1,
    features_source_cutoff: game.startedAt,
    features,
  };
}

// ============================================================================
// Update Accumulators with One Game's Data (called AFTER feature extraction)
// ============================================================================

function updateAccumulators(game: Game & { patchNum: number; startedAt: string }): void {
  const blueWon = game.winnerSide === 'blue';

  // Build authoritative BP-ordered pick lists from PICK_SEQUENCE (not game.actions order)
  // slotToChamp: slot string -> championId
  // champToOrder: championId -> BP order (0-9)
  const slotToChamp = new Map<string, string>();
  const champToOrder = new Map<string, number>();
  const bluePicksBp: string[] = []; // blue picks in BP order
  const redPicksBp: string[] = [];  // red picks in BP order

  for (let i = 0; i < PICK_SEQUENCE.length; i++) {
    const { slot, side } = PICK_SEQUENCE[i];
    const action = game.actions.find(a => a.slot === slot);
    if (!action || action.type !== 'pick') continue;
    slotToChamp.set(slot, action.championId);
    champToOrder.set(action.championId, i);
    if (side === 'blue') bluePicksBp.push(action.championId);
    else redPicksBp.push(action.championId);
  }

  // Meta: increment pick count for all picks
  for (const champId of champToOrder.keys()) {
    metaAcc.set(champId, (metaAcc.get(champId) ?? 0) + 1);
    totalPicks++;
  }

  // Synergy: same-team pairs (order doesn't matter, just co-occurrence)
  const recordSynergy = (picks: string[], won: boolean) => {
    for (let i = 0; i < picks.length; i++) {
      for (let j = i + 1; j < picks.length; j++) {
        const key = synergyKey(picks[i], picks[j]);
        if (!synergyAcc.has(key)) synergyAcc.set(key, { games: 0, wins: 0 });
        const s = synergyAcc.get(key)!;
        s.games++;
        if (won) s.wins++;
      }
    }
  };
  recordSynergy(bluePicksBp, blueWon);
  recordSynergy(redPicksBp, !blueWon);

  // Counter: narrowed window only (opponent early 3 vs our late 3)
  //   counterKey(earlierOpp, laterOur) → wins for laterOur's team
  //   bluePicksBp/redPicksBp are already in BP order → slice is correct
  const recordCounterWindow = (
    ourPicksBp: string[],
    oppPicksBp: string[],
    weWon: boolean,
  ) => {
    const oppEarly = oppPicksBp.slice(0, 3);
    const ourLate = ourPicksBp.slice(Math.max(0, ourPicksBp.length - 3));

    for (const opp of oppEarly) {
      const oppOrder = champToOrder.get(opp);
      if (oppOrder === undefined) continue;
      for (const our of ourLate) {
        const ourOrder = champToOrder.get(our);
        if (ourOrder === undefined) continue;
        if (oppOrder < ourOrder) {
          const key = counterKey(opp, our);
          if (!counterAcc.has(key)) counterAcc.set(key, { games: 0, wins: 0 });
          const c = counterAcc.get(key)!;
          c.games++;
          if (weWon) c.wins++;
        }
      }
    }
  };

  recordCounterWindow(bluePicksBp, redPicksBp, blueWon);
  recordCounterWindow(redPicksBp, bluePicksBp, !blueWon);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('Win Feature Extraction (Phase 1) - Online/Chronological');
  console.log('='.repeat(70));
  console.log();

  loadPowerScores();
  const games = await loadAllGames();

  console.log();
  console.log('Extracting features (online, past-only data)...');

  const output = fs.createWriteStream(OUTPUT_FILE, 'utf-8');
  let recordCount = 0;
  let skipped = 0;
  let gamesWithNoHistory = 0;

  for (let gIdx = 0; gIdx < games.length; gIdx++) {
    const game = games[gIdx];

    // Track games processed with minimal history
    if (totalPicks < 100) gamesWithNoHistory++;

    // Extract features FIRST (using past-only accumulators)
    for (let pickIdx = 0; pickIdx < PICK_SEQUENCE.length; pickIdx++) {
      const record = extractFeatures(game, pickIdx);
      if (record) {
        output.write(JSON.stringify(record) + '\n');
        recordCount++;
      } else {
        skipped++;
      }
    }

    // THEN update accumulators with this game's data
    updateAccumulators(game);

    if ((gIdx + 1) % 500 === 0) {
      console.log(`  Processed ${gIdx + 1}/${games.length} games, ${recordCount} records`);
    }
  }

  output.end();

  console.log();
  console.log('='.repeat(70));
  console.log('Summary');
  console.log('='.repeat(70));
  console.log(`Games: ${games.length}`);
  console.log(`Records: ${recordCount}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Per-game: ${(recordCount / games.length).toFixed(1)} picks`);
  console.log(`Games with <100 prior picks (cold start): ${gamesWithNoHistory}`);
  console.log();
  console.log('Final accumulator sizes:');
  console.log(`  Meta champions: ${metaAcc.size}`);
  console.log(`  Synergy pairs: ${synergyAcc.size}`);
  console.log(`  Counter pairs: ${counterAcc.size}`);
  console.log(`  Total picks seen: ${totalPicks}`);
  console.log();
  console.log(`Output: ${OUTPUT_FILE}`);
}

main().catch(console.error);
