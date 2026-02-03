/**
 * Build Threat Signals
 *
 * 计算队伍和选手的威胁分数
 *
 * Scoring Formula (log-sigmoid-v1 with Beta-Binomial conservatism):
 * - R = (obs + s) / (exp + s), s = 0.005
 * - obsLower = Beta quantile (80% CI lower bound)
 * - rawLower = ln((obsLower + s) / (exp + s))
 * - k = ln(9) / raw_p90 (computed from data)
 * - score = 100 * confidence * sigmoid(k * max(0, rawLower))
 * - sigmoid(x) = 1 / (1 + exp(-x))
 *
 * This prevents low-baseline champions from saturating to 100,
 * and prevents small-sample inflation via conservative lower bounds.
 */

import fs from 'fs';
import path from 'path';
import {
  BanEvent,
  BanRateStats,
  ThreatSignal,
  ThreatSignalsData,
  ThreatSignalsMeta,
  makeContextKey,
  GLOBAL_CONTEXT,
  THREAT_CONFIG,
} from '../lib/threat-types';
import { betaQuantile, computePrior } from '../lib/stats/beta-quantile';

interface BanEventsData {
  meta: {
    generatedAt: string;
    totalEvents: number;
    totalGames: number;
  };
  events: BanEvent[];
}

interface BaselinesData {
  meta: {
    generatedAt: string;
    totalGames: number;
    totalContexts: number;
    championsWithBans: number;
  };
  global: Record<string, Record<string, BanRateStats>>;
  early: Record<string, Record<string, BanRateStats>>;
}

// Constants
const CREDIBLE_LEVEL = 0.80;  // 80% credible interval
const ALPHA = 1 - CREDIBLE_LEVEL;  // 0.20
const EXP_FALLBACK = 0.01;  // 1% fallback if no baseline

// Helper to clamp a value between min and max
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Calculate median of an array
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Calculate percentile of an array
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

// Sigmoid function
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

async function main() {
  console.log('=== BUILD THREAT SIGNALS (log-sigmoid-v1 + Beta conservatism) ===\n');

  const eventsPath = path.join(process.cwd(), 'data/lol/ban-events.json');
  const baselinesPath = path.join(process.cwd(), 'data/lol/ban-baselines.json');

  if (!fs.existsSync(eventsPath)) {
    console.error('Error: ban-events.json not found. Run build-ban-events.ts first.');
    process.exit(1);
  }

  if (!fs.existsSync(baselinesPath)) {
    console.error('Error: ban-baselines.json not found. Run build-ban-baselines.ts first.');
    process.exit(1);
  }

  console.log('Loading data...');
  const eventsData: BanEventsData = JSON.parse(fs.readFileSync(eventsPath, 'utf-8'));
  const baselinesData: BaselinesData = JSON.parse(fs.readFileSync(baselinesPath, 'utf-8'));

  const events = eventsData.events;
  const baselines = baselinesData.global;

  console.log(`  Loaded ${events.length} ban events`);
  console.log(`  Loaded ${Object.keys(baselines).length} baseline contexts`);

  const s = THREAT_CONFIG.smoothingFactor;

  // ============ TEAM THREAT CALCULATION (PASS 1: Collect raw values) ============
  console.log('\nCalculating team threats (Pass 1: collect raw values)...');

  // Track games per team per context
  // Key: context, Value: Map<teamId, Set<gameId>>
  const teamGamesPerContext = new Map<string, Map<string, Set<string>>>();

  // Track bans against team per champion per context
  // Key: context, Value: Map<teamId, Map<championName, count>>
  const teamBansPerContext = new Map<string, Map<string, Map<string, number>>>();

  for (const event of events) {
    const contexts = [
      GLOBAL_CONTEXT,
      makeContextKey(event.patch, undefined),
      makeContextKey(undefined, event.region),
      makeContextKey(event.patch, event.region),
    ];

    for (const context of contexts) {
      // Track games for target team
      if (!teamGamesPerContext.has(context)) {
        teamGamesPerContext.set(context, new Map());
      }
      const teamGames = teamGamesPerContext.get(context)!;
      if (!teamGames.has(event.targetTeamId)) {
        teamGames.set(event.targetTeamId, new Set());
      }
      teamGames.get(event.targetTeamId)!.add(event.gameId);

      // Track bans against target team
      if (!teamBansPerContext.has(context)) {
        teamBansPerContext.set(context, new Map());
      }
      const teamBans = teamBansPerContext.get(context)!;
      if (!teamBans.has(event.targetTeamId)) {
        teamBans.set(event.targetTeamId, new Map());
      }
      const champBans = teamBans.get(event.targetTeamId)!;
      champBans.set(event.championName, (champBans.get(event.championName) || 0) + 1);
    }
  }

  // Calculate N0 for teams (median games played)
  const allTeamGameCounts: number[] = [];
  const globalTeamGames = teamGamesPerContext.get(GLOBAL_CONTEXT);
  if (globalTeamGames) {
    for (const gameIds of globalTeamGames.values()) {
      allTeamGameCounts.push(gameIds.size);
    }
  }
  const teamN0 = median(allTeamGameCounts);
  console.log(`  Team N0 (median games): ${teamN0}`);

  // Calculate prior strength m = clamp(5, 20, round(N0/10))
  const priorStrengthM = clamp(Math.round(teamN0 / 10), 5, 20);
  console.log(`  Prior strength m: ${priorStrengthM}`);

  // Collect all raw values from GLOBAL::GLOBAL context for k calculation
  // Use rawObs (not rawLower) for k calculation to maintain scale
  const allRawValues: number[] = [];
  const globalTeamBans = teamBansPerContext.get(GLOBAL_CONTEXT) || new Map();
  const globalBaselines = baselines[GLOBAL_CONTEXT] || {};

  for (const [teamId, gameIds] of (globalTeamGames || new Map())) {
    const gamesPlayed = gameIds.size;
    const champBans = globalTeamBans.get(teamId) || new Map();

    for (const [championName, banCount] of champBans) {
      const observed = banCount / gamesPlayed;
      const expected = globalBaselines[championName]?.banRate || EXP_FALLBACK;
      const ratio = (observed + s) / (expected + s);
      const rawObs = Math.log(ratio);

      if (rawObs > 0) {
        allRawValues.push(rawObs);
      }
    }
  }

  // Calculate k from raw_p90
  const raw_p90 = percentile(allRawValues, 90);
  const k = Math.log(9) / Math.max(raw_p90, 1e-6);
  console.log(`  raw_p90 (90th percentile of positive rawObs): ${raw_p90.toFixed(4)}`);
  console.log(`  k (sigmoid steepness): ${k.toFixed(4)}`);
  console.log(`  Verification: sigmoid(k * raw_p90) = ${sigmoid(k * raw_p90).toFixed(4)} (should be ~0.9)`);

  // ============ TEAM THREAT CALCULATION (PASS 2: Compute scores with Beta conservatism) ============
  console.log('\nCalculating team threats (Pass 2: compute scores with Beta conservatism)...');

  // Build team threat signals
  const teamSignals: Record<string, Record<string, Record<string, ThreatSignal>>> = {};

  for (const [context, teamGames] of teamGamesPerContext) {
    teamSignals[context] = {};
    const teamBans = teamBansPerContext.get(context) || new Map();
    const contextBaselines = baselines[context] || baselines[GLOBAL_CONTEXT] || {};

    for (const [teamId, gameIds] of teamGames) {
      const n = gameIds.size;  // gamesPlayed
      const champBans = teamBans.get(teamId) || new Map();

      teamSignals[context][teamId] = {};

      for (const [championName, x] of champBans) {  // x = banCount
        const observed = x / n;
        const expected = contextBaselines[championName]?.banRate || EXP_FALLBACK;

        // Compute Beta prior
        const { a0, b0 } = computePrior(expected, priorStrengthM);

        // Compute conservative lower bound
        // Posterior: Beta(a0 + x, b0 + (n - x))
        // Lower bound: quantile at alpha/2 = 0.10 for 80% CI
        const obsLower = betaQuantile(ALPHA / 2, a0 + x, b0 + (n - x));

        // Compute raw values
        const ratio = (observed + s) / (expected + s);
        const rawObs = Math.log(ratio);
        const rawLower = Math.log((obsLower + s) / (expected + s));

        // Confidence based on sample size
        const confidence = clamp(n / teamN0, 0, 1);

        // Score using rawLower (conservative)
        const score = rawLower > 0
          ? 100 * confidence * sigmoid(k * rawLower)
          : 0;

        teamSignals[context][teamId][championName] = {
          championId: championName,
          championName,
          observed,
          obsLower,
          expected,
          ratio,
          rawObs,
          rawLower,
          confidence,
          score,
          gamesPlayed: n,
          banCount: x,
          context,
          credibleLevel: CREDIBLE_LEVEL,
          priorStrengthM,
          a0,
          b0,
        };
      }
    }
  }

  // ============ PLAYER THREAT CALCULATION ============
  console.log('\nCalculating player threats...');

  // Track games per player per context
  const playerGamesPerContext = new Map<string, Map<string, Set<string>>>();

  // Track bans against player per champion per context
  const playerBansPerContext = new Map<string, Map<string, Map<string, number>>>();

  for (const event of events) {
    const contexts = [
      GLOBAL_CONTEXT,
      makeContextKey(event.patch, undefined),
      makeContextKey(undefined, event.region),
      makeContextKey(event.patch, event.region),
    ];

    // For each player on the target team
    for (const player of event.playersOnTargetTeam) {
      for (const context of contexts) {
        // Track games for player
        if (!playerGamesPerContext.has(context)) {
          playerGamesPerContext.set(context, new Map());
        }
        const playerGames = playerGamesPerContext.get(context)!;
        if (!playerGames.has(player.id)) {
          playerGames.set(player.id, new Set());
        }
        playerGames.get(player.id)!.add(event.gameId);

        // Track bans against player
        if (!playerBansPerContext.has(context)) {
          playerBansPerContext.set(context, new Map());
        }
        const playerBans = playerBansPerContext.get(context)!;
        if (!playerBans.has(player.id)) {
          playerBans.set(player.id, new Map());
        }
        const champBans = playerBans.get(player.id)!;
        champBans.set(event.championName, (champBans.get(event.championName) || 0) + 1);
      }
    }
  }

  // Calculate N0 for players (median games played)
  const allPlayerGameCounts: number[] = [];
  const globalPlayerGames = playerGamesPerContext.get(GLOBAL_CONTEXT);
  if (globalPlayerGames) {
    for (const gameIds of globalPlayerGames.values()) {
      allPlayerGameCounts.push(gameIds.size);
    }
  }
  const playerN0 = median(allPlayerGameCounts);
  console.log(`  Player N0 (median games): ${playerN0}`);

  // Build player threat signals
  const playerSignals: Record<string, Record<string, Record<string, ThreatSignal>>> = {};

  for (const [context, playerGames] of playerGamesPerContext) {
    playerSignals[context] = {};
    const playerBans = playerBansPerContext.get(context) || new Map();
    const contextBaselines = baselines[context] || baselines[GLOBAL_CONTEXT] || {};

    for (const [playerId, gameIds] of playerGames) {
      const n = gameIds.size;  // gamesPlayed
      const champBans = playerBans.get(playerId) || new Map();

      playerSignals[context][playerId] = {};

      for (const [championName, x] of champBans) {  // x = banCount
        const observed = x / n;
        const expected = contextBaselines[championName]?.banRate || EXP_FALLBACK;

        // Compute Beta prior
        const { a0, b0 } = computePrior(expected, priorStrengthM);

        // Compute conservative lower bound
        const obsLower = betaQuantile(ALPHA / 2, a0 + x, b0 + (n - x));

        // Compute raw values
        const ratio = (observed + s) / (expected + s);
        const rawObs = Math.log(ratio);
        const rawLower = Math.log((obsLower + s) / (expected + s));

        // Confidence based on sample size
        const confidence = clamp(n / playerN0, 0, 1);

        // Score using rawLower (conservative)
        const score = rawLower > 0
          ? 100 * confidence * sigmoid(k * rawLower)
          : 0;

        playerSignals[context][playerId][championName] = {
          championId: championName,
          championName,
          observed,
          obsLower,
          expected,
          ratio,
          rawObs,
          rawLower,
          confidence,
          score,
          gamesPlayed: n,
          banCount: x,
          context,
          credibleLevel: CREDIBLE_LEVEL,
          priorStrengthM,
          a0,
          b0,
        };
      }
    }
  }

  // ============ STATISTICS ============
  console.log('\nStatistics:');

  // Count signals
  let totalTeamSignals = 0;
  let totalPlayerSignals = 0;
  let highTeamSignals = 0;
  let highPlayerSignals = 0;
  let score100TeamSignals = 0;
  let score100PlayerSignals = 0;

  for (const context in teamSignals) {
    for (const teamId in teamSignals[context]) {
      for (const champ in teamSignals[context][teamId]) {
        totalTeamSignals++;
        const score = teamSignals[context][teamId][champ].score;
        if (score >= 50) {
          highTeamSignals++;
        }
        if (score >= 99.9) {
          score100TeamSignals++;
        }
      }
    }
  }

  for (const context in playerSignals) {
    for (const playerId in playerSignals[context]) {
      for (const champ in playerSignals[context][playerId]) {
        totalPlayerSignals++;
        const score = playerSignals[context][playerId][champ].score;
        if (score >= 50) {
          highPlayerSignals++;
        }
        if (score >= 99.9) {
          score100PlayerSignals++;
        }
      }
    }
  }

  console.log(`  Total team signals: ${totalTeamSignals}`);
  console.log(`  High team signals (score >= 50): ${highTeamSignals}`);
  console.log(`  Score ~100 team signals: ${score100TeamSignals} (${(score100TeamSignals / totalTeamSignals * 100).toFixed(2)}%)`);
  console.log(`  Total player signals: ${totalPlayerSignals}`);
  console.log(`  High player signals (score >= 50): ${highPlayerSignals}`);
  console.log(`  Score ~100 player signals: ${score100PlayerSignals} (${(score100PlayerSignals / totalPlayerSignals * 100).toFixed(2)}%)`);

  // Sample high-threat signals
  const globalTeamSignals = teamSignals[GLOBAL_CONTEXT] || {};
  const sampleHighThreats: Array<{
    teamId: string;
    champion: string;
    score: number;
    rawObs: number;
    rawLower: number;
    ratio: number;
    obs: number;
    obsLower: number;
    n: number;
  }> = [];

  for (const teamId in globalTeamSignals) {
    for (const champ in globalTeamSignals[teamId]) {
      const signal = globalTeamSignals[teamId][champ];
      if (signal.score >= 50) {
        sampleHighThreats.push({
          teamId,
          champion: champ,
          score: signal.score,
          rawObs: signal.rawObs,
          rawLower: signal.rawLower,
          ratio: signal.ratio,
          obs: signal.observed,
          obsLower: signal.obsLower,
          n: signal.gamesPlayed,
        });
      }
    }
  }

  sampleHighThreats.sort((a, b) => b.score - a.score);
  console.log('\nTop 10 Team Threats (Global):');
  console.log('  Team   | Champion         | Score | Obs%   | ObsLower% | Exp%   | n');
  console.log('  -------|------------------|-------|--------|-----------|--------|----');
  for (const threat of sampleHighThreats.slice(0, 10)) {
    const signal = globalTeamSignals[threat.teamId][threat.champion];
    console.log(
      `  ${threat.teamId.padEnd(6)} | ${threat.champion.padEnd(16)} | ${threat.score.toFixed(1).padStart(5)} | ${(threat.obs * 100).toFixed(1).padStart(5)}% | ${(threat.obsLower * 100).toFixed(1).padStart(8)}% | ${(signal.expected * 100).toFixed(1).padStart(5)}% | ${threat.n}`
    );
  }

  // ============ OUTPUT ============
  const meta: ThreatSignalsMeta = {
    teamN0,
    playerN0,
    generatedAt: new Date().toISOString(),
    smoothingFactor: s,
    scoringVersion: 'log-sigmoid-v1',
    k,
    raw_p90,
    credibleLevel: CREDIBLE_LEVEL,
    priorStrengthM,
  };

  const output: ThreatSignalsData = {
    meta,
    team: teamSignals,
    player: playerSignals,
  };

  const outputPath = path.join(process.cwd(), 'data/lol/threat-signals.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\n✓ Saved to ${outputPath}`);
  console.log('\n=== COMPLETE ===\n');
}

main().catch(console.error);
