#!/usr/bin/env tsx
/**
 * build_ban_predictor.ts
 *
 * Ban Prediction Model - Predicts which champion a team will ban at each slot
 *
 * Design principles:
 *   1. Two-pass scanning: Pass 1 gathers metadata, Pass 2 computes with fixed baseline
 *   2. Team power weighting ONLY for global knowledge (meta, counters), NOT for team-specific patterns
 *   3. Temporal correctness: earlierOpponentPicks = picks that occurred BEFORE the ban slot
 *   4. Time-based train/test split to avoid data leakage
 *
 * Output:
 *   - data/grid_v2/ban_predictions.jsonl
 *   - data/grid_v2/ban_predictor_model.json
 *
 * Usage:
 *   npx tsx scripts/build_ban_predictor.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ============================================================================
// Constants & Config
// ============================================================================

const DATA_DIR = path.join(process.cwd(), 'data', 'grid_v2');
const INPUT_TIMELINE = path.join(DATA_DIR, 'draft_timeline_enriched.jsonl');
const INPUT_POWER_SCORES = path.join(DATA_DIR, 'team_power_score.json');
const OUTPUT_PREDICTIONS = path.join(DATA_DIR, 'ban_predictions.jsonl');
const OUTPUT_MODEL = path.join(DATA_DIR, 'ban_predictor_model.json');

// Scoring weights
const ALPHA = {
  meta: 0.30,
  target: 0.25,
  strategy: 0.35,
  response: 0.10,
};

const BETA = 0.12; // Decay rate

// Train/test split ratio (80% train, 20% test by time)
const TRAIN_RATIO = 0.8;

// Ban slots & BP action order
const BAN_SLOTS = ['ban_1', 'ban_2', 'ban_3', 'ban_4', 'ban_5'] as const;
type BanSlot = typeof BAN_SLOTS[number];
type Role = 'top' | 'jungle' | 'mid' | 'bot' | 'support';
type Side = 'blue' | 'red';

// BP sequence: index -> { action, side }
// ban_1-3 occur before any picks; ban_4-5 occur after pick phase 1
const BP_SEQUENCE = [
  { slot: 'ban_1', side: 'blue', type: 'ban' },   // 0
  { slot: 'ban_1', side: 'red', type: 'ban' },    // 1
  { slot: 'ban_2', side: 'blue', type: 'ban' },   // 2
  { slot: 'ban_2', side: 'red', type: 'ban' },    // 3
  { slot: 'ban_3', side: 'blue', type: 'ban' },   // 4
  { slot: 'ban_3', side: 'red', type: 'ban' },    // 5
  { slot: 'pick_1', side: 'blue', type: 'pick' }, // 6
  { slot: 'pick_1', side: 'red', type: 'pick' },  // 7
  { slot: 'pick_2', side: 'red', type: 'pick' },  // 8
  { slot: 'pick_2', side: 'blue', type: 'pick' }, // 9
  { slot: 'pick_3', side: 'blue', type: 'pick' }, // 10
  { slot: 'pick_3', side: 'red', type: 'pick' },  // 11
  { slot: 'ban_4', side: 'red', type: 'ban' },    // 12
  { slot: 'ban_4', side: 'blue', type: 'ban' },   // 13
  { slot: 'ban_5', side: 'red', type: 'ban' },    // 14
  { slot: 'ban_5', side: 'blue', type: 'ban' },   // 15
  // picks 4-5 follow
];

// ============================================================================
// Types
// ============================================================================

interface EnrichedAction {
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

interface EnrichedGame {
  seriesId: string;
  gameId: string;
  gameSequence: number;
  patch: string | null;
  tournament: string | null;
  blueTeamId: string;
  blueTeamName: string;
  redTeamId: string;
  redTeamName: string;
  winnerSide: Side;
  winnerTeamId: string;
  loserTeamId: string;
  actions: EnrichedAction[];
}

interface TeamPowerEntry {
  id: string;
  name: string;
  power_score: Record<string, number>;
}

interface GameWithDate extends EnrichedGame {
  startedAt: string; // ISO date from series file
  patchNum: number;
}

interface BanPrediction {
  championId: string;
  championName: string;
  ban_reason: 'meta' | 'target' | 'strategy' | 'response';
  targeted_role: Role | null;
  response_to_championId: string | null;
  decay_weight: number;
  ban_priority: number;
  scores: {
    meta: number;
    target: number;
    strategy: number;
    response: number;
    total: number;
  };
}

// ============================================================================
// Global State
// ============================================================================

// Metadata (from Pass 1)
let LATEST_PATCH = 0;
let CUTOFF_DATE = ''; // For train/test split

// Team power scores: teamId -> sorted array of { date, score }
const teamPowerScores = new Map<string, Array<{ date: string; score: number }>>();
let powerScoreMin = Infinity;
let powerScoreMax = -Infinity;

// Champion data
const championNames = new Map<string, string>();
const championPrimaryRole = new Map<string, Role>();
const championRoleCounts = new Map<string, Map<Role, number>>();

// Series date cache: seriesId -> startedAt
const seriesDates = new Map<string, string>();

// === GLOBAL KNOWLEDGE (power-weighted) ===
// Global ban frequency: championId -> { count, weightedSum }
const globalBanFreq = new Map<string, { count: number; weightedSum: number }>();
let globalBanTotalWeight = 0;

// === TEAM-SPECIFIC PATTERNS (NO power weighting, only decay) ===
// Team ban patterns: teamId -> side -> slot -> championId -> { count, decayedSum }
const teamBanPatterns = new Map<string, {
  blue: Map<BanSlot, Map<string, { count: number; decayedSum: number }>>;
  red: Map<BanSlot, Map<string, { count: number; decayedSum: number }>>;
  totalGames: number;
}>();

// Opponent targeting (team-specific, decay-weighted)
// teamId -> opponentId -> championId -> { count, decayedSum }
const opponentTargeting = new Map<string, Map<string, Map<string, { count: number; decayedSum: number }>>>();

// Response patterns (global, power-weighted): "oppPick|banChamp" -> { count, weightedSum }
const responsePatterns = new Map<string, { count: number; weightedSum: number }>();
let responseTotalWeight = 0;

// ============================================================================
// Utilities
// ============================================================================

function parsePatch(patchStr: string | null): number {
  if (!patchStr) return 0;
  const parts = patchStr.split('.');
  if (parts.length < 2) return 0;
  const major = parseInt(parts[0], 10) || 0;
  const minor = parseInt(parts[1], 10) || 0;
  return major * 100 + minor;
}

function decayWeight(patchNum: number): number {
  return Math.exp(-BETA * (LATEST_PATCH - patchNum));
}

function slotFromAction(action: EnrichedAction): BanSlot | null {
  const match = action.slot.match(/(BLUE|RED)_BAN_(\d)/);
  if (!match) return null;
  const num = parseInt(match[2], 10);
  if (num >= 1 && num <= 5) return `ban_${num}` as BanSlot;
  return null;
}

function getTeamPowerNormalized(teamId: string, date: string): number {
  const powerList = teamPowerScores.get(teamId);
  if (!powerList || powerList.length === 0) return 0.5;

  // Binary search for closest date
  const targetTime = new Date(date).getTime();
  let closest = powerList[0];
  let minDist = Infinity;

  for (const entry of powerList) {
    const dist = Math.abs(new Date(entry.date).getTime() - targetTime);
    if (dist < minDist) {
      minDist = dist;
      closest = entry;
    }
  }

  // Normalize to [0, 1] using global min/max
  if (powerScoreMax === powerScoreMin) return 0.5;
  return (closest.score - powerScoreMin) / (powerScoreMax - powerScoreMin);
}

function loadSeriesDate(seriesId: string): string {
  if (seriesDates.has(seriesId)) {
    return seriesDates.get(seriesId)!;
  }

  const filePath = path.join(DATA_DIR, `series_${seriesId}.json`);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const series = JSON.parse(content);
    const date = series.startedAt || '2024-01-01T00:00:00Z';
    seriesDates.set(seriesId, date);
    return date;
  } catch {
    seriesDates.set(seriesId, '2024-01-01T00:00:00Z');
    return '2024-01-01T00:00:00Z';
  }
}

// Get picks that occurred BEFORE this ban slot (based on BP sequence)
function getEarlierOpponentPicks(actions: EnrichedAction[], bannerSide: Side, banSlot: BanSlot): string[] {
  // For ban_1/2/3: no picks have occurred yet
  if (banSlot === 'ban_1' || banSlot === 'ban_2' || banSlot === 'ban_3') {
    return [];
  }

  // For ban_4/5: picks 1-3 from both sides have occurred
  // Get opponent's picks that happened before this ban
  const opponentPicks: string[] = [];
  const opponentSide: Side = bannerSide === 'blue' ? 'red' : 'blue';

  for (const action of actions) {
    // Only include picks that occur before ban phase 2
    if (action.type === 'pick' && action.side === opponentSide) {
      // First 3 picks per side occur before ban_4/5
      const pickMatch = action.slot.match(/(BLUE|RED)_PICK_(\d)/);
      if (pickMatch) {
        const pickNum = parseInt(pickMatch[2], 10);
        if (pickNum <= 3) {
          opponentPicks.push(action.championId);
        }
      }
    }
  }

  return opponentPicks;
}

// ============================================================================
// Load Team Power Scores
// ============================================================================

function loadTeamPowerScores(): void {
  console.log('Loading team power scores...');
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

  console.log(`  Loaded ${teamPowerScores.size} teams`);
  console.log(`  Power score range: [${powerScoreMin}, ${powerScoreMax}]`);
}

// ============================================================================
// Pass 1: Gather Metadata
// ============================================================================

async function pass1GatherMetadata(): Promise<{
  games: GameWithDate[];
  trainGames: GameWithDate[];
  testGames: GameWithDate[];
}> {
  console.log('Pass 1: Gathering metadata...');

  const games: GameWithDate[] = [];

  const inputStream = fs.createReadStream(INPUT_TIMELINE, 'utf-8');
  const rl = readline.createInterface({ input: inputStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;

    const game: EnrichedGame = JSON.parse(line);
    const patchNum = parsePatch(game.patch);
    const startedAt = loadSeriesDate(game.seriesId);

    if (patchNum > LATEST_PATCH) LATEST_PATCH = patchNum;

    // Track champion names and roles
    for (const action of game.actions) {
      championNames.set(action.championId, action.championName);
      if (action.type === 'pick' && action.role) {
        if (!championRoleCounts.has(action.championId)) {
          championRoleCounts.set(action.championId, new Map());
        }
        const roleMap = championRoleCounts.get(action.championId)!;
        roleMap.set(action.role, (roleMap.get(action.role) || 0) + 1);
      }
    }

    games.push({ ...game, startedAt, patchNum });
  }

  // Compute primary roles
  for (const [champId, roleMap] of championRoleCounts) {
    let maxRole: Role = 'mid';
    let maxCount = 0;
    for (const [role, count] of roleMap) {
      if (count > maxCount) {
        maxCount = count;
        maxRole = role;
      }
    }
    championPrimaryRole.set(champId, maxRole);
  }

  // Sort by date and split
  games.sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  const splitIndex = Math.floor(games.length * TRAIN_RATIO);
  const trainGames = games.slice(0, splitIndex);
  const testGames = games.slice(splitIndex);

  CUTOFF_DATE = trainGames[trainGames.length - 1]?.startedAt || '';

  console.log(`  Total games: ${games.length}`);
  console.log(`  Latest patch: ${LATEST_PATCH}`);
  console.log(`  Champions: ${championNames.size}`);
  console.log(`  Train/Test split: ${trainGames.length}/${testGames.length}`);
  console.log(`  Cutoff date: ${CUTOFF_DATE}`);

  return { games, trainGames, testGames };
}

// ============================================================================
// Pass 2: Build Patterns from Training Data
// ============================================================================

function buildPatterns(trainGames: GameWithDate[]): void {
  console.log('Pass 2: Building patterns from training data...');

  for (const game of trainGames) {
    const decay = decayWeight(game.patchNum);
    const date = game.startedAt.split('T')[0];

    // Power weight for GLOBAL knowledge only
    const avgPower = (
      getTeamPowerNormalized(game.blueTeamId, date) +
      getTeamPowerNormalized(game.redTeamId, date)
    ) / 2;
    const powerWeight = 0.5 + avgPower; // Range [0.5, 1.5]

    // Initialize team patterns
    for (const teamId of [game.blueTeamId, game.redTeamId]) {
      if (!teamBanPatterns.has(teamId)) {
        teamBanPatterns.set(teamId, {
          blue: new Map(BAN_SLOTS.map(s => [s, new Map()])),
          red: new Map(BAN_SLOTS.map(s => [s, new Map()])),
          totalGames: 0,
        });
      }
      teamBanPatterns.get(teamId)!.totalGames++;
    }

    // Process bans
    for (const action of game.actions) {
      if (action.type !== 'ban') continue;

      const slot = slotFromAction(action);
      if (!slot) continue;

      // === GLOBAL BAN FREQUENCY (power-weighted) ===
      if (!globalBanFreq.has(action.championId)) {
        globalBanFreq.set(action.championId, { count: 0, weightedSum: 0 });
      }
      const gbf = globalBanFreq.get(action.championId)!;
      gbf.count++;
      gbf.weightedSum += decay * powerWeight;
      globalBanTotalWeight += decay * powerWeight;

      // === TEAM-SPECIFIC BAN PATTERNS (decay only, NO power) ===
      const tp = teamBanPatterns.get(action.teamId)!;
      const sideMap = action.side === 'blue' ? tp.blue : tp.red;
      const slotMap = sideMap.get(slot)!;

      if (!slotMap.has(action.championId)) {
        slotMap.set(action.championId, { count: 0, decayedSum: 0 });
      }
      const champStats = slotMap.get(action.championId)!;
      champStats.count++;
      champStats.decayedSum += decay; // NO power weight

      // === RESPONSE PATTERNS (power-weighted, for ban_4/5) ===
      if (slot === 'ban_4' || slot === 'ban_5') {
        const earlierOppPicks = getEarlierOpponentPicks(game.actions, action.side, slot);
        for (const oppPick of earlierOppPicks) {
          const key = `${oppPick}|${action.championId}`;
          if (!responsePatterns.has(key)) {
            responsePatterns.set(key, { count: 0, weightedSum: 0 });
          }
          const rp = responsePatterns.get(key)!;
          rp.count++;
          rp.weightedSum += decay * powerWeight;
          responseTotalWeight += decay * powerWeight;
        }
      }
    }

    // === OPPONENT TARGETING (decay only, team-specific) ===
    const trackTargeting = (teamId: string, opponentId: string, opponentPicks: string[]) => {
      if (!opponentTargeting.has(teamId)) {
        opponentTargeting.set(teamId, new Map());
      }
      const oppMap = opponentTargeting.get(teamId)!;
      if (!oppMap.has(opponentId)) {
        oppMap.set(opponentId, new Map());
      }
      const champMap = oppMap.get(opponentId)!;
      for (const c of opponentPicks) {
        if (!champMap.has(c)) {
          champMap.set(c, { count: 0, decayedSum: 0 });
        }
        const stats = champMap.get(c)!;
        stats.count++;
        stats.decayedSum += decay; // NO power weight
      }
    };

    // Extract picks
    const bluePicks = game.actions.filter(a => a.type === 'pick' && a.side === 'blue').map(a => a.championId);
    const redPicks = game.actions.filter(a => a.type === 'pick' && a.side === 'red').map(a => a.championId);

    trackTargeting(game.blueTeamId, game.redTeamId, redPicks);
    trackTargeting(game.redTeamId, game.blueTeamId, bluePicks);
  }

  console.log(`  Global ban patterns: ${globalBanFreq.size} champions`);
  console.log(`  Team patterns: ${teamBanPatterns.size} teams`);
  console.log(`  Response patterns: ${responsePatterns.size}`);
}

// ============================================================================
// Scoring Functions
// ============================================================================

function computeMetaScore(championId: string): number {
  const gbf = globalBanFreq.get(championId);
  if (!gbf || globalBanTotalWeight === 0) return 0;

  const maxRate = Math.max(
    ...Array.from(globalBanFreq.values()).map(g => g.weightedSum / globalBanTotalWeight)
  );

  return maxRate > 0 ? (gbf.weightedSum / globalBanTotalWeight) / maxRate : 0;
}

function computeTargetScore(championId: string, teamId: string, opponentId: string): number {
  const oppMap = opponentTargeting.get(teamId);
  if (!oppMap) return 0;

  const champMap = oppMap.get(opponentId);
  if (!champMap) return 0;

  const stats = champMap.get(championId);
  if (!stats) return 0;

  // Normalize by opponent's total decayed picks
  let totalDecayed = 0;
  for (const s of champMap.values()) totalDecayed += s.decayedSum;
  if (totalDecayed === 0) return 0;

  return Math.min(1, (stats.decayedSum / totalDecayed) * 5);
}

function computeStrategyScore(championId: string, teamId: string, side: Side, slot: BanSlot): number {
  const tp = teamBanPatterns.get(teamId);
  if (!tp) return 0;

  const sideMap = side === 'blue' ? tp.blue : tp.red;
  const slotMap = sideMap.get(slot);
  if (!slotMap) return 0;

  const champStats = slotMap.get(championId);
  if (!champStats) return 0;

  // Normalize by team's total decayed bans in this slot
  let totalDecayed = 0;
  for (const s of slotMap.values()) totalDecayed += s.decayedSum;
  if (totalDecayed === 0) return 0;

  return champStats.decayedSum / totalDecayed;
}

function computeResponseScore(
  championId: string,
  earlierOpponentPicks: string[]
): { score: number; triggerChampion: string | null } {
  if (earlierOpponentPicks.length === 0 || responseTotalWeight === 0) {
    return { score: 0, triggerChampion: null };
  }

  let maxScore = 0;
  let trigger: string | null = null;

  for (const oppPick of earlierOpponentPicks) {
    const key = `${oppPick}|${championId}`;
    const rp = responsePatterns.get(key);
    if (rp && rp.weightedSum > 0) {
      // P(ban this champ | opponent picked X)
      let totalForTrigger = 0;
      for (const [k, v] of responsePatterns) {
        if (k.startsWith(oppPick + '|')) totalForTrigger += v.weightedSum;
      }

      const score = totalForTrigger > 0 ? rp.weightedSum / totalForTrigger : 0;
      if (score > maxScore) {
        maxScore = score;
        trigger = oppPick;
      }
    }
  }

  return { score: Math.min(1, maxScore), triggerChampion: trigger };
}

function computeTotalScore(
  championId: string,
  teamId: string,
  opponentId: string,
  side: Side,
  slot: BanSlot,
  earlierOpponentPicks: string[]
): {
  meta: number;
  target: number;
  strategy: number;
  response: number;
  total: number;
  triggerChampion: string | null;
} {
  const meta = computeMetaScore(championId);
  const target = computeTargetScore(championId, teamId, opponentId);
  const strategy = computeStrategyScore(championId, teamId, side, slot);
  const { score: response, triggerChampion } = computeResponseScore(championId, earlierOpponentPicks);

  // Adjust weights for ban_4/5
  let weights = { ...ALPHA };
  if (slot === 'ban_4' || slot === 'ban_5') {
    weights = { meta: 0.20, target: 0.25, strategy: 0.25, response: 0.30 };
  }

  const total =
    weights.meta * meta +
    weights.target * target +
    weights.strategy * strategy +
    weights.response * response;

  return { meta, target, strategy, response, total, triggerChampion };
}

// ============================================================================
// Prediction
// ============================================================================

function predictBan(
  teamId: string,
  opponentId: string,
  side: Side,
  slot: BanSlot,
  earlierOpponentPicks: string[],
  alreadyBanned: Set<string>,
  patchNum: number,
  knownChampions: Set<string> // Only champions seen in training
): BanPrediction {
  const candidates: Array<{ championId: string; scores: ReturnType<typeof computeTotalScore> }> = [];

  for (const championId of knownChampions) {
    if (alreadyBanned.has(championId)) continue;

    const scores = computeTotalScore(championId, teamId, opponentId, side, slot, earlierOpponentPicks);
    if (scores.total > 0) {
      candidates.push({ championId, scores });
    }
  }

  candidates.sort((a, b) => b.scores.total - a.scores.total);

  const top = candidates[0];
  if (!top) {
    // Fallback
    const fallback = Array.from(globalBanFreq.entries())
      .filter(([id]) => !alreadyBanned.has(id) && knownChampions.has(id))
      .sort((a, b) => b[1].weightedSum - a[1].weightedSum)[0];

    return {
      championId: fallback?.[0] || '',
      championName: championNames.get(fallback?.[0] || '') || 'Unknown',
      ban_reason: 'meta',
      targeted_role: championPrimaryRole.get(fallback?.[0] || '') || null,
      response_to_championId: null,
      decay_weight: decayWeight(patchNum),
      ban_priority: 0.5,
      scores: { meta: 0.5, target: 0, strategy: 0, response: 0, total: 0.5 },
    };
  }

  // Determine primary reason
  const s = top.scores;
  let ban_reason: 'meta' | 'target' | 'strategy' | 'response' = 'meta';
  const maxReason = Math.max(s.meta, s.target, s.strategy, s.response);
  if (s.response === maxReason && s.response > 0) ban_reason = 'response';
  else if (s.strategy === maxReason) ban_reason = 'strategy';
  else if (s.target === maxReason) ban_reason = 'target';

  return {
    championId: top.championId,
    championName: championNames.get(top.championId) || 'Unknown',
    ban_reason,
    targeted_role: championPrimaryRole.get(top.championId) || null,
    response_to_championId: top.scores.triggerChampion,
    decay_weight: decayWeight(patchNum),
    ban_priority: top.scores.total,
    scores: {
      meta: s.meta,
      target: s.target,
      strategy: s.strategy,
      response: s.response,
      total: s.total,
    },
  };
}

// ============================================================================
// Evaluate on Test Set
// ============================================================================

function evaluateOnTestSet(
  testGames: GameWithDate[],
  trainChampions: Set<string>
): {
  predictions: Array<{
    game: GameWithDate;
    predictions: { blue: Record<BanSlot, BanPrediction>; red: Record<BanSlot, BanPrediction> };
    accuracy: { blue: Record<BanSlot, boolean>; red: Record<BanSlot, boolean>; overall: number };
  }>;
  totalCorrect: number;
  totalPredictions: number;
} {
  console.log('Evaluating on test set...');

  const results: Array<{
    game: GameWithDate;
    predictions: { blue: Record<BanSlot, BanPrediction>; red: Record<BanSlot, BanPrediction> };
    accuracy: { blue: Record<BanSlot, boolean>; red: Record<BanSlot, boolean>; overall: number };
  }> = [];

  let totalCorrect = 0;
  let totalPredictions = 0;

  for (const game of testGames) {
    // Extract actual bans
    const actualBans: { blue: Map<BanSlot, string>; red: Map<BanSlot, string> } = {
      blue: new Map(),
      red: new Map(),
    };

    for (const action of game.actions) {
      if (action.type === 'ban') {
        const slot = slotFromAction(action);
        if (slot) {
          const sideMap = action.side === 'blue' ? actualBans.blue : actualBans.red;
          sideMap.set(slot, action.championId);
        }
      }
    }

    // Predict
    const gamePredictions: {
      blue: Record<BanSlot, BanPrediction>;
      red: Record<BanSlot, BanPrediction>;
    } = { blue: {} as Record<BanSlot, BanPrediction>, red: {} as Record<BanSlot, BanPrediction> };

    const accuracy: { blue: Record<BanSlot, boolean>; red: Record<BanSlot, boolean>; overall: number } = {
      blue: {} as Record<BanSlot, boolean>,
      red: {} as Record<BanSlot, boolean>,
      overall: 0,
    };

    for (const side of ['blue', 'red'] as Side[]) {
      const teamId = side === 'blue' ? game.blueTeamId : game.redTeamId;
      const opponentId = side === 'blue' ? game.redTeamId : game.blueTeamId;
      const alreadyBanned = new Set<string>();

      for (const slot of BAN_SLOTS) {
        const earlierOppPicks = getEarlierOpponentPicks(game.actions, side, slot);

        const prediction = predictBan(
          teamId,
          opponentId,
          side,
          slot,
          earlierOppPicks,
          alreadyBanned,
          game.patchNum,
          trainChampions
        );

        gamePredictions[side][slot] = prediction;
        alreadyBanned.add(prediction.championId);

        const actual = actualBans[side].get(slot);
        const isCorrect = actual === prediction.championId;
        accuracy[side][slot] = isCorrect;

        if (actual) {
          totalPredictions++;
          if (isCorrect) totalCorrect++;
        }
      }
    }

    const correctCount =
      Object.values(accuracy.blue).filter(Boolean).length +
      Object.values(accuracy.red).filter(Boolean).length;
    accuracy.overall = correctCount / 10;

    results.push({ game, predictions: gamePredictions, accuracy });
  }

  console.log(`  Evaluated ${testGames.length} games`);
  console.log(`  Accuracy: ${(totalCorrect / totalPredictions * 100).toFixed(2)}%`);

  return { predictions: results, totalCorrect, totalPredictions };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('Ban Prediction Model (Corrected)');
  console.log('='.repeat(60));
  console.log('');

  // Load power scores
  loadTeamPowerScores();
  console.log('');

  // Pass 1: Metadata
  const { trainGames, testGames } = await pass1GatherMetadata();
  console.log('');

  // Get training champions (avoid data leakage)
  const trainChampions = new Set<string>();
  for (const game of trainGames) {
    for (const action of game.actions) {
      trainChampions.add(action.championId);
    }
  }
  console.log(`Training champions: ${trainChampions.size}`);
  console.log('');

  // Pass 2: Build patterns from training data only
  buildPatterns(trainGames);
  console.log('');

  // Evaluate on test set
  const { predictions, totalCorrect, totalPredictions } = evaluateOnTestSet(testGames, trainChampions);
  console.log('');

  // Write outputs
  console.log('Writing outputs...');

  const outputPredictions = predictions.map(p => JSON.stringify({
    gameId: p.game.gameId,
    seriesId: p.game.seriesId,
    patch: p.game.patch,
    blueTeamId: p.game.blueTeamId,
    blueTeamName: p.game.blueTeamName,
    redTeamId: p.game.redTeamId,
    redTeamName: p.game.redTeamName,
    predictions: p.predictions,
    accuracy: p.accuracy,
  })).join('\n') + '\n';
  fs.writeFileSync(OUTPUT_PREDICTIONS, outputPredictions, 'utf-8');
  console.log(`  ${OUTPUT_PREDICTIONS}: ${predictions.length} games`);

  const modelSummary = {
    config: { alpha: ALPHA, beta: BETA, trainRatio: TRAIN_RATIO },
    metadata: {
      latestPatch: LATEST_PATCH,
      cutoffDate: CUTOFF_DATE,
      trainGames: trainGames.length,
      testGames: testGames.length,
      trainChampions: trainChampions.size,
    },
    accuracy: {
      correct: totalCorrect,
      total: totalPredictions,
      rate: (totalCorrect / totalPredictions * 100).toFixed(2) + '%',
    },
    topGlobalBans: Array.from(globalBanFreq.entries())
      .sort((a, b) => b[1].weightedSum - a[1].weightedSum)
      .slice(0, 20)
      .map(([id, stats]) => ({
        championName: championNames.get(id),
        count: stats.count,
        weightedScore: (stats.weightedSum / globalBanTotalWeight).toFixed(4),
      })),
  };
  fs.writeFileSync(OUTPUT_MODEL, JSON.stringify(modelSummary, null, 2), 'utf-8');
  console.log(`  ${OUTPUT_MODEL}`);
  console.log('');

  // Summary
  console.log('='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Train games: ${trainGames.length}`);
  console.log(`Test games: ${testGames.length}`);
  console.log(`Test accuracy: ${modelSummary.accuracy.rate}`);
  console.log('');

  // Sample
  const sample = predictions[0];
  if (sample) {
    console.log('Sample prediction (first test game):');
    console.log(`  ${sample.game.blueTeamName} vs ${sample.game.redTeamName}`);
    for (const slot of BAN_SLOTS) {
      const pred = sample.predictions.blue[slot];
      console.log(`  Blue ${slot}: ${pred.championName} (${pred.ban_reason}) ${sample.accuracy.blue[slot] ? '✓' : '✗'}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
