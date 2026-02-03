#!/usr/bin/env tsx
/**
 * build_ban_reason_model.ts
 *
 * Phase 2: Ban Reason Analysis Model
 *
 * Analyzes WHY teams ban champions, separating:
 *   - Team-specific behavioral patterns (β-weighted only)
 *   - Global meta knowledge (β + team power weighted)
 *
 * Output:
 *   - data/grid_v2/ban_reason_events.jsonl (per-ban explanations)
 *   - data/grid_v2/team_ban_blueprints.json (aggregated team profiles)
 *
 * Usage:
 *   npx tsx scripts/build_ban_reason_model.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ============================================================================
// Constants & Config
// ============================================================================

const DATA_DIR = path.join(process.cwd(), 'data', 'grid_v2');
const INPUT_FILE = path.join(DATA_DIR, 'draft_timeline_enriched.jsonl');
const OUTPUT_EVENTS = path.join(DATA_DIR, 'ban_reason_events.jsonl');
const OUTPUT_BLUEPRINTS = path.join(DATA_DIR, 'team_ban_blueprints.json');

// Decay parameter: exp(-BETA * patch_distance)
// e.g., 0.15 means ~2 patch half-life
const BETA = 0.15;

// Latest patch for reference (will be computed from data)
let LATEST_PATCH = 0;

// Ban slot names in order
const BAN_SLOTS = [
  'ban_1', 'ban_2', 'ban_3', 'ban_4', 'ban_5'
] as const;

type BanSlot = typeof BAN_SLOTS[number];
type Role = 'top' | 'jungle' | 'mid' | 'bot' | 'support';
type Side = 'blue' | 'red';

// ============================================================================
// Types (Input)
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

// ============================================================================
// Types (Output)
// ============================================================================

interface ReasonScores {
  meta: number;
  target: number;
  strategy: number;
  response: number;
}

interface BanReasonEvent {
  gameId: string;
  patch: string;
  teamId: string;
  opponentTeamId: string;
  side: Side;
  slot: BanSlot;
  bannedChampionId: string;
  bannedChampionName: string;
  reasonScores: ReasonScores;
  targetedRole: Role | null;
  responseToChampionId: string | null;
  decayWeight: number;
  isWinner: boolean;
}

interface SlotProfile {
  reasonDistribution: ReasonScores;
  topChampions: Array<{ name: string; count: number }>;
  topRoles: Array<{ role: Role; count: number }>;
}

interface TeamBanBlueprint {
  teamId: string;
  gamesAnalyzed: number;
  blue: {
    banSlotProfiles: Record<BanSlot, SlotProfile>;
    roleLeverage: Record<Role, { banCount: number; winRate: number }>;
    responsePatterns: Array<{ opponentPick: string; ourBan: string; count: number }>;
    signatureBans: Array<{ champion: string; teamRate: number; globalRate: number; ratio: number }>;
  };
  red: {
    banSlotProfiles: Record<BanSlot, SlotProfile>;
    roleLeverage: Record<Role, { banCount: number; winRate: number }>;
    responsePatterns: Array<{ opponentPick: string; ourBan: string; count: number }>;
    signatureBans: Array<{ champion: string; teamRate: number; globalRate: number; ratio: number }>;
  };
}

// ============================================================================
// Global Aggregators (Power-Weighted)
// ============================================================================

// Team power scores by teamId -> patch -> winRate
const teamPowerByPatch = new Map<string, Map<number, { wins: number; games: number }>>();

// Global ban frequency: championId -> { weighted_count, total_games }
const globalBanFreq = new Map<string, { weightedCount: number; totalWeight: number }>();

// Champion primary role: championId -> role (from pick data)
const championPrimaryRole = new Map<string, Role>();
const championRoleCounts = new Map<string, Map<Role, number>>();

// Synergy pairs: "champ1|champ2" -> { wins, games, weightedWins, weightedGames }
const synergyPairs = new Map<string, { wins: number; games: number; wWins: number; wGames: number }>();

// Response patterns (ban_4/5 after opponent picks): "oppPick|ourBan" -> count
const responsePatterns = new Map<string, { count: number; weightedCount: number }>();

// Team-specific ban patterns (NO power weighting)
// teamId -> side -> slot -> championId -> count
const teamBanPatterns = new Map<string, {
  blue: Map<BanSlot, Map<string, number>>;
  red: Map<BanSlot, Map<string, number>>;
  wins: number;
  games: number;
}>();

// Team-specific opponent pick frequency
// teamId -> opponentTeamId -> championId -> count
const opponentPickFreq = new Map<string, Map<string, Map<string, number>>>();

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

function patchDistance(patch1: number, patch2: number): number {
  return Math.abs(patch1 - patch2);
}

function decayWeight(patchNum: number, latestPatch: number): number {
  return Math.exp(-BETA * patchDistance(patchNum, latestPatch));
}

function slotFromAction(action: EnrichedAction): BanSlot | null {
  // Map BLUE_BAN_1 -> ban_1, RED_BAN_4 -> ban_4, etc.
  const match = action.slot.match(/(BLUE|RED)_BAN_(\d)/);
  if (!match) return null;
  const num = parseInt(match[2], 10);
  if (num >= 1 && num <= 5) return `ban_${num}` as BanSlot;
  return null;
}

function getTeamPower(teamId: string, patchNum: number): number {
  const patchData = teamPowerByPatch.get(teamId);
  if (!patchData) return 0.5; // default

  // Find closest patch
  let closestPatch = 0;
  let minDist = Infinity;
  for (const p of patchData.keys()) {
    const dist = Math.abs(p - patchNum);
    if (dist < minDist) {
      minDist = dist;
      closestPatch = p;
    }
  }

  const stats = patchData.get(closestPatch);
  if (!stats || stats.games === 0) return 0.5;
  return stats.wins / stats.games;
}

function normalizeScores(scores: ReasonScores): ReasonScores {
  const sum = scores.meta + scores.target + scores.strategy + scores.response;
  if (sum === 0) return { meta: 0.25, target: 0.25, strategy: 0.25, response: 0.25 };
  return {
    meta: scores.meta / sum,
    target: scores.target / sum,
    strategy: scores.strategy / sum,
    response: scores.response / sum,
  };
}

function synergyKey(champ1: string, champ2: string): string {
  return [champ1, champ2].sort().join('|');
}

// ============================================================================
// Pass 1: Build Global Aggregations
// ============================================================================

async function pass1BuildAggregations(): Promise<number> {
  console.log('Pass 1: Building global aggregations...');

  const inputStream = fs.createReadStream(INPUT_FILE, 'utf-8');
  const rl = readline.createInterface({ input: inputStream, crlfDelay: Infinity });

  let gameCount = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    gameCount++;

    const game: EnrichedGame = JSON.parse(line);
    const patchNum = parsePatch(game.patch);
    if (patchNum > LATEST_PATCH) LATEST_PATCH = patchNum;

    // Track team power
    for (const teamId of [game.blueTeamId, game.redTeamId]) {
      if (!teamPowerByPatch.has(teamId)) {
        teamPowerByPatch.set(teamId, new Map());
      }
      const patchMap = teamPowerByPatch.get(teamId)!;
      if (!patchMap.has(patchNum)) {
        patchMap.set(patchNum, { wins: 0, games: 0 });
      }
      const stats = patchMap.get(patchNum)!;
      stats.games++;
      if (teamId === game.winnerTeamId) stats.wins++;
    }

    // Initialize team patterns
    for (const teamId of [game.blueTeamId, game.redTeamId]) {
      if (!teamBanPatterns.has(teamId)) {
        teamBanPatterns.set(teamId, {
          blue: new Map(),
          red: new Map(),
          wins: 0,
          games: 0,
        });
        for (const slot of BAN_SLOTS) {
          teamBanPatterns.get(teamId)!.blue.set(slot, new Map());
          teamBanPatterns.get(teamId)!.red.set(slot, new Map());
        }
      }
      const tp = teamBanPatterns.get(teamId)!;
      tp.games++;
      if (teamId === game.winnerTeamId) tp.wins++;
    }

    // Process actions
    const bluePicks: string[] = [];
    const redPicks: string[] = [];
    const blueBans: Array<{ slot: BanSlot; championId: string }> = [];
    const redBans: Array<{ slot: BanSlot; championId: string }> = [];

    for (const action of game.actions) {
      if (action.type === 'pick') {
        if (action.side === 'blue') bluePicks.push(action.championId);
        else redPicks.push(action.championId);

        // Track champion roles
        if (action.role) {
          if (!championRoleCounts.has(action.championId)) {
            championRoleCounts.set(action.championId, new Map());
          }
          const roleMap = championRoleCounts.get(action.championId)!;
          roleMap.set(action.role, (roleMap.get(action.role) || 0) + 1);
        }
      } else if (action.type === 'ban') {
        const slot = slotFromAction(action);
        if (slot) {
          if (action.side === 'blue') {
            blueBans.push({ slot, championId: action.championId });
          } else {
            redBans.push({ slot, championId: action.championId });
          }

          // Global ban frequency (power-weighted)
          const teamPower = getTeamPower(action.teamId, patchNum);
          const weight = decayWeight(patchNum, LATEST_PATCH) * teamPower;
          if (!globalBanFreq.has(action.championId)) {
            globalBanFreq.set(action.championId, { weightedCount: 0, totalWeight: 0 });
          }
          const gbf = globalBanFreq.get(action.championId)!;
          gbf.weightedCount += weight;
          gbf.totalWeight += 1;

          // Team-specific ban patterns (NO power weighting)
          const teamPatterns = teamBanPatterns.get(action.teamId)!;
          const sideMap = action.side === 'blue' ? teamPatterns.blue : teamPatterns.red;
          const slotMap = sideMap.get(slot)!;
          slotMap.set(action.championId, (slotMap.get(action.championId) || 0) + 1);
        }
      }
    }

    // Track opponent pick frequency (for TARGET reason)
    // Blue team's opponent is red team, vice versa
    const trackOpponentPicks = (teamId: string, opponentId: string, opponentPicks: string[]) => {
      if (!opponentPickFreq.has(teamId)) {
        opponentPickFreq.set(teamId, new Map());
      }
      const oppMap = opponentPickFreq.get(teamId)!;
      if (!oppMap.has(opponentId)) {
        oppMap.set(opponentId, new Map());
      }
      const champMap = oppMap.get(opponentId)!;
      for (const c of opponentPicks) {
        champMap.set(c, (champMap.get(c) || 0) + 1);
      }
    };
    trackOpponentPicks(game.blueTeamId, game.redTeamId, redPicks);
    trackOpponentPicks(game.redTeamId, game.blueTeamId, bluePicks);

    // Synergy pairs (same team picks)
    const teamPower = (getTeamPower(game.blueTeamId, patchNum) + getTeamPower(game.redTeamId, patchNum)) / 2;
    const weight = decayWeight(patchNum, LATEST_PATCH) * teamPower;

    const recordSynergies = (picks: string[], isWinner: boolean) => {
      for (let i = 0; i < picks.length; i++) {
        for (let j = i + 1; j < picks.length; j++) {
          const key = synergyKey(picks[i], picks[j]);
          if (!synergyPairs.has(key)) {
            synergyPairs.set(key, { wins: 0, games: 0, wWins: 0, wGames: 0 });
          }
          const sp = synergyPairs.get(key)!;
          sp.games++;
          sp.wGames += weight;
          if (isWinner) {
            sp.wins++;
            sp.wWins += weight;
          }
        }
      }
    };
    recordSynergies(bluePicks, game.winnerSide === 'blue');
    recordSynergies(redPicks, game.winnerSide === 'red');

    // Response patterns (ban_4/5 after opponent picks)
    // Blue bans ban_4/5 after red picks 1-3 (actions 6-11)
    // Red bans ban_4/5 after blue picks 1-3 (actions 6-11)
    const recordResponse = (bans: Array<{ slot: BanSlot; championId: string }>, opponentPicks: string[]) => {
      for (const ban of bans) {
        if (ban.slot === 'ban_4' || ban.slot === 'ban_5') {
          for (const oppPick of opponentPicks.slice(0, 3)) { // First 3 picks
            const key = `${oppPick}|${ban.championId}`;
            if (!responsePatterns.has(key)) {
              responsePatterns.set(key, { count: 0, weightedCount: 0 });
            }
            const rp = responsePatterns.get(key)!;
            rp.count++;
            rp.weightedCount += weight;
          }
        }
      }
    };
    recordResponse(blueBans, redPicks);
    recordResponse(redBans, bluePicks);

    if (gameCount % 500 === 0) {
      process.stdout.write(`\r  Processed ${gameCount} games...`);
    }
  }

  console.log(`\r  Processed ${gameCount} games.`);

  // Compute champion primary roles
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

  return gameCount;
}

// ============================================================================
// Pass 2: Generate Ban Reason Events
// ============================================================================

interface GameContext {
  game: EnrichedGame;
  patchNum: number;
  weight: number;
  opponentPicks: Map<Side, string[]>;
  earlierOpponentPicks: Map<Side, string[]>; // Updated as we process
}

function computeMetaScore(championId: string): number {
  const gbf = globalBanFreq.get(championId);
  if (!gbf || gbf.totalWeight === 0) return 0;
  // Normalize by max
  const maxWeighted = Math.max(...Array.from(globalBanFreq.values()).map(g => g.weightedCount / g.totalWeight));
  return (gbf.weightedCount / gbf.totalWeight) / maxWeighted;
}

function computeTargetScore(
  bannedChampionId: string,
  banningTeamId: string,
  opponentTeamId: string
): number {
  const oppMap = opponentPickFreq.get(banningTeamId);
  if (!oppMap) return 0;
  const champMap = oppMap.get(opponentTeamId);
  if (!champMap) return 0;

  const pickCount = champMap.get(bannedChampionId) || 0;
  if (pickCount === 0) return 0;

  // Normalize by total picks from this opponent
  let totalPicks = 0;
  for (const c of champMap.values()) totalPicks += c;
  if (totalPicks === 0) return 0;

  return (pickCount / totalPicks) * 2; // Scale up
}

function computeStrategyScore(bannedChampionId: string): number {
  // Look for synergies involving this champion
  let maxSynergyWR = 0;
  for (const [key, sp] of synergyPairs) {
    if (key.includes(bannedChampionId) && sp.wGames > 5) {
      const wr = sp.wWins / sp.wGames;
      if (wr > maxSynergyWR) maxSynergyWR = wr;
    }
  }
  // Above 55% is notable
  return Math.max(0, (maxSynergyWR - 0.5) * 4);
}

function computeResponseScore(
  bannedChampionId: string,
  earlierOpponentPicks: string[],
  slot: BanSlot
): { score: number; triggerChampion: string | null } {
  // Only for ban_4 and ban_5
  if (slot !== 'ban_4' && slot !== 'ban_5') {
    return { score: 0, triggerChampion: null };
  }

  let maxScore = 0;
  let trigger: string | null = null;

  for (const oppPick of earlierOpponentPicks) {
    const key = `${oppPick}|${bannedChampionId}`;
    const rp = responsePatterns.get(key);
    if (rp && rp.weightedCount > 0) {
      // Normalize
      const score = Math.min(1, rp.weightedCount / 10);
      if (score > maxScore) {
        maxScore = score;
        trigger = oppPick;
      }
    }
  }

  return { score: maxScore, triggerChampion: trigger };
}

async function pass2GenerateEvents(totalGames: number): Promise<BanReasonEvent[]> {
  console.log('Pass 2: Generating ban reason events...');

  const events: BanReasonEvent[] = [];

  const inputStream = fs.createReadStream(INPUT_FILE, 'utf-8');
  const rl = readline.createInterface({ input: inputStream, crlfDelay: Infinity });

  let gameCount = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    gameCount++;

    const game: EnrichedGame = JSON.parse(line);
    const patchNum = parsePatch(game.patch);
    const weight = decayWeight(patchNum, LATEST_PATCH);

    // Track earlier opponent picks for response calculation
    const earlierOpponentPicks: Map<Side, string[]> = new Map([
      ['blue', []],
      ['red', []],
    ]);

    for (const action of game.actions) {
      // Track picks as they happen (before processing bans)
      if (action.type === 'pick') {
        // Opponent picks are tracked for the other side
        const oppSide: Side = action.side === 'blue' ? 'red' : 'blue';
        earlierOpponentPicks.get(oppSide)!.push(action.championId);
      }

      if (action.type === 'ban') {
        const slot = slotFromAction(action);
        if (!slot) continue;

        const opponentTeamId = action.side === 'blue' ? game.redTeamId : game.blueTeamId;
        const oppPicksForBanner = earlierOpponentPicks.get(action.side)!;

        // Compute reason scores
        const metaScore = computeMetaScore(action.championId);
        const targetScore = computeTargetScore(action.championId, action.teamId, opponentTeamId);
        const strategyScore = computeStrategyScore(action.championId);
        const { score: responseScore, triggerChampion } = computeResponseScore(
          action.championId,
          oppPicksForBanner,
          slot
        );

        const rawScores: ReasonScores = {
          meta: metaScore,
          target: targetScore,
          strategy: strategyScore,
          response: responseScore,
        };
        const normalizedScores = normalizeScores(rawScores);

        // Determine targeted role
        const targetedRole = championPrimaryRole.get(action.championId) || null;

        const event: BanReasonEvent = {
          gameId: game.gameId,
          patch: game.patch || 'unknown',
          teamId: action.teamId,
          opponentTeamId,
          side: action.side,
          slot,
          bannedChampionId: action.championId,
          bannedChampionName: action.championName,
          reasonScores: normalizedScores,
          targetedRole,
          responseToChampionId: responseScore > 0 ? triggerChampion : null,
          decayWeight: weight,
          isWinner: action.isWinner,
        };

        events.push(event);
      }
    }

    if (gameCount % 500 === 0) {
      process.stdout.write(`\r  Processed ${gameCount}/${totalGames} games...`);
    }
  }

  console.log(`\r  Generated ${events.length} ban events.`);
  return events;
}

// ============================================================================
// Pass 3: Build Team Blueprints
// ============================================================================

function buildTeamBlueprints(events: BanReasonEvent[]): TeamBanBlueprint[] {
  console.log('Pass 3: Building team blueprints...');

  const blueprints: TeamBanBlueprint[] = [];

  // Compute global ban rates for signature detection
  const globalBanCounts = new Map<string, number>();
  let totalBans = 0;
  for (const e of events) {
    globalBanCounts.set(e.bannedChampionId, (globalBanCounts.get(e.bannedChampionId) || 0) + 1);
    totalBans++;
  }

  for (const [teamId, patterns] of teamBanPatterns) {
    const teamEvents = events.filter(e => e.teamId === teamId);
    if (teamEvents.length === 0) continue;

    const buildSideProfile = (side: Side) => {
      const sideEvents = teamEvents.filter(e => e.side === side);
      if (sideEvents.length === 0) {
        // Return empty profile
        const emptySlotProfile: SlotProfile = {
          reasonDistribution: { meta: 0.25, target: 0.25, strategy: 0.25, response: 0.25 },
          topChampions: [],
          topRoles: [],
        };
        return {
          banSlotProfiles: Object.fromEntries(BAN_SLOTS.map(s => [s, emptySlotProfile])) as Record<BanSlot, SlotProfile>,
          roleLeverage: {} as Record<Role, { banCount: number; winRate: number }>,
          responsePatterns: [],
          signatureBans: [],
        };
      }

      // Slot profiles
      const banSlotProfiles: Record<BanSlot, SlotProfile> = {} as Record<BanSlot, SlotProfile>;
      for (const slot of BAN_SLOTS) {
        const slotEvents = sideEvents.filter(e => e.slot === slot);
        if (slotEvents.length === 0) {
          banSlotProfiles[slot] = {
            reasonDistribution: { meta: 0.25, target: 0.25, strategy: 0.25, response: 0.25 },
            topChampions: [],
            topRoles: [],
          };
          continue;
        }

        // Average reason scores
        const avgScores: ReasonScores = { meta: 0, target: 0, strategy: 0, response: 0 };
        for (const e of slotEvents) {
          avgScores.meta += e.reasonScores.meta;
          avgScores.target += e.reasonScores.target;
          avgScores.strategy += e.reasonScores.strategy;
          avgScores.response += e.reasonScores.response;
        }
        const n = slotEvents.length;
        avgScores.meta /= n;
        avgScores.target /= n;
        avgScores.strategy /= n;
        avgScores.response /= n;

        // Top champions
        const champCounts = new Map<string, number>();
        for (const e of slotEvents) {
          champCounts.set(e.bannedChampionName, (champCounts.get(e.bannedChampionName) || 0) + 1);
        }
        const topChampions = Array.from(champCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, count]) => ({ name, count }));

        // Top roles
        const roleCounts = new Map<Role, number>();
        for (const e of slotEvents) {
          if (e.targetedRole) {
            roleCounts.set(e.targetedRole, (roleCounts.get(e.targetedRole) || 0) + 1);
          }
        }
        const topRoles = Array.from(roleCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([role, count]) => ({ role, count }));

        banSlotProfiles[slot] = {
          reasonDistribution: avgScores,
          topChampions,
          topRoles,
        };
      }

      // Role leverage (winrate when banning each role)
      const roleLeverage: Record<Role, { banCount: number; winRate: number }> = {
        top: { banCount: 0, winRate: 0 },
        jungle: { banCount: 0, winRate: 0 },
        mid: { banCount: 0, winRate: 0 },
        bot: { banCount: 0, winRate: 0 },
        support: { banCount: 0, winRate: 0 },
      };
      const roleWins: Record<Role, number> = { top: 0, jungle: 0, mid: 0, bot: 0, support: 0 };
      for (const e of sideEvents) {
        if (e.targetedRole) {
          roleLeverage[e.targetedRole].banCount++;
          if (e.isWinner) roleWins[e.targetedRole]++;
        }
      }
      for (const role of Object.keys(roleLeverage) as Role[]) {
        if (roleLeverage[role].banCount > 0) {
          roleLeverage[role].winRate = roleWins[role] / roleLeverage[role].banCount;
        }
      }

      // Response patterns
      const respMap = new Map<string, number>();
      for (const e of sideEvents) {
        if (e.responseToChampionId) {
          const key = `${e.responseToChampionId}|${e.bannedChampionId}`;
          respMap.set(key, (respMap.get(key) || 0) + 1);
        }
      }
      const responsePatterns = Array.from(respMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([key, count]) => {
          const [oppPick, ourBan] = key.split('|');
          return { opponentPick: oppPick, ourBan, count };
        });

      // Signature bans
      const teamBanCounts = new Map<string, number>();
      for (const e of sideEvents) {
        teamBanCounts.set(e.bannedChampionId, (teamBanCounts.get(e.bannedChampionId) || 0) + 1);
      }
      const teamTotalBans = sideEvents.length;

      const signatureBans: Array<{ champion: string; teamRate: number; globalRate: number; ratio: number }> = [];
      for (const [champId, count] of teamBanCounts) {
        const teamRate = count / teamTotalBans;
        const globalCount = globalBanCounts.get(champId) || 0;
        const globalRate = globalCount / totalBans;
        if (globalRate > 0) {
          const ratio = teamRate / globalRate;
          if (ratio > 1.5 && count >= 3) { // At least 50% more than global and 3+ bans
            const champName = events.find(e => e.bannedChampionId === champId)?.bannedChampionName || champId;
            signatureBans.push({ champion: champName, teamRate, globalRate, ratio });
          }
        }
      }
      signatureBans.sort((a, b) => b.ratio - a.ratio);

      return {
        banSlotProfiles,
        roleLeverage,
        responsePatterns,
        signatureBans: signatureBans.slice(0, 10),
      };
    };

    blueprints.push({
      teamId,
      gamesAnalyzed: patterns.games,
      blue: buildSideProfile('blue'),
      red: buildSideProfile('red'),
    });
  }

  console.log(`  Built ${blueprints.length} team blueprints.`);
  return blueprints;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('Ban Reason Analysis Model (Phase 2)');
  console.log('='.repeat(60));
  console.log('');

  // Pass 1: Build aggregations
  const totalGames = await pass1BuildAggregations();
  console.log(`  Latest patch: ${LATEST_PATCH}`);
  console.log(`  Teams tracked: ${teamPowerByPatch.size}`);
  console.log(`  Champions with roles: ${championPrimaryRole.size}`);
  console.log(`  Synergy pairs: ${synergyPairs.size}`);
  console.log(`  Response patterns: ${responsePatterns.size}`);
  console.log('');

  // Pass 2: Generate events
  const events = await pass2GenerateEvents(totalGames);
  console.log('');

  // Pass 3: Build blueprints
  const blueprints = buildTeamBlueprints(events);
  console.log('');

  // Write outputs
  console.log('Writing outputs...');

  // Events JSONL
  const eventsOutput = events.map(e => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(OUTPUT_EVENTS, eventsOutput, 'utf-8');
  console.log(`  ${OUTPUT_EVENTS}: ${events.length} events`);

  // Blueprints JSON
  fs.writeFileSync(OUTPUT_BLUEPRINTS, JSON.stringify(blueprints, null, 2), 'utf-8');
  console.log(`  ${OUTPUT_BLUEPRINTS}: ${blueprints.length} teams`);
  console.log('');

  // Summary
  console.log('='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Games analyzed: ${totalGames}`);
  console.log(`Ban events: ${events.length}`);
  console.log(`Team blueprints: ${blueprints.length}`);

  // Reason distribution
  const reasonTotals = { meta: 0, target: 0, strategy: 0, response: 0 };
  for (const e of events) {
    reasonTotals.meta += e.reasonScores.meta;
    reasonTotals.target += e.reasonScores.target;
    reasonTotals.strategy += e.reasonScores.strategy;
    reasonTotals.response += e.reasonScores.response;
  }
  const n = events.length;
  console.log(`\nAverage reason scores:`);
  console.log(`  meta:     ${(reasonTotals.meta / n).toFixed(3)}`);
  console.log(`  target:   ${(reasonTotals.target / n).toFixed(3)}`);
  console.log(`  strategy: ${(reasonTotals.strategy / n).toFixed(3)}`);
  console.log(`  response: ${(reasonTotals.response / n).toFixed(3)}`);
  console.log('');

  // Sample event
  console.log('='.repeat(60));
  console.log('Sample Ban Event');
  console.log('='.repeat(60));
  console.log(JSON.stringify(events[0], null, 2));
  console.log('');

  // Sample blueprint (first team with signature bans)
  const sampleBlueprint = blueprints.find(b => b.blue.signatureBans.length > 0 || b.red.signatureBans.length > 0);
  if (sampleBlueprint) {
    console.log('='.repeat(60));
    console.log(`Sample Blueprint: Team ${sampleBlueprint.teamId}`);
    console.log('='.repeat(60));
    console.log(`Games analyzed: ${sampleBlueprint.gamesAnalyzed}`);
    console.log(`\nBlue side ban_1 profile:`);
    console.log(JSON.stringify(sampleBlueprint.blue.banSlotProfiles.ban_1, null, 2));
    if (sampleBlueprint.blue.signatureBans.length > 0) {
      console.log(`\nBlue signature bans:`);
      console.log(JSON.stringify(sampleBlueprint.blue.signatureBans.slice(0, 3), null, 2));
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
