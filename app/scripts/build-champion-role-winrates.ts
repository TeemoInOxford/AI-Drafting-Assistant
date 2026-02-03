/**
 * build-champion-role-winrates.ts
 *
 * 从 data/grid_v2/series_*.json 生成按 champion-role 聚合的胜率数据
 * 使用与 weighted-role-posteriors.json 相同的权重函数 W(g)
 *
 * 用法:
 *   npx tsx app/scripts/build-champion-role-winrates.ts             # 正式生成
 *   npx tsx app/scripts/build-champion-role-winrates.ts --dry-run   # 抽样打印 role 字段
 *
 * 输出: data/grid_v2/champion-role-winrates.json
 */

import * as fs from 'fs';
import * as path from 'path';

// ============= Types =============

interface ChampionRoleStats {
  raw_games: number;
  raw_wins: number;
  weighted_games: number;
  weighted_wins: number;
}

// ============= Constants & Config =============

const DATA_DIR = path.join(process.cwd(), 'data', 'grid_v2');
const OUTPUT_FILE = path.join(DATA_DIR, 'champion-role-winrates.json');
const PATCH_DATES_FILE = path.join(DATA_DIR, '_patch_start_dates.json');
const TEAM_POWER_FILE = path.join(DATA_DIR, 'team_power_score.json');
const POSTERIORS_FILE = path.join(DATA_DIR, 'weighted-role-posteriors.json');

const ALL_ROLES = ['top', 'jungle', 'mid', 'bot', 'support'] as const;
type Role = (typeof ALL_ROLES)[number];

const ROLE_MAPPING: Record<string, Role> = {
  top: 'top',
  jungle: 'jungle',
  mid: 'mid',
  middle: 'mid',
  bot: 'bot',
  bottom: 'bot',
  adc: 'bot',
  support: 'support',
  sup: 'support',
};

const DRY_RUN = process.argv.includes('--dry-run');

// ============= Load Parameters from Posteriors =============

function loadParameters() {
  const data = JSON.parse(fs.readFileSync(POSTERIORS_FILE, 'utf-8'));
  const meta = data.metadata;
  const params = meta.parameters;

  return {
    targetPatch: meta.target_patch as string,
    targetPatchIndex: meta.target_patch_index as number,
    beta: params.beta as number,
    gamma: params.gamma as number,
    teamWeightSensitivity: params.team_weight_sensitivity as number,
    deltaPatchCap: params.delta_patch_cap as number,
  };
}

// ============= Role Extraction =============

/**
 * Extract normalized role from a player object.
 * Primary source: player.roles (string[]), confirmed via data exploration.
 * player.role is always null, player.position is x/y coordinates.
 */
function extractRole(player: Record<string, unknown>): Role | null {
  const roles = player.roles;
  if (!Array.isArray(roles) || roles.length === 0) return null;

  const raw = roles[0];
  // Handle both string and {name: string} shapes
  const rawStr = typeof raw === 'string' ? raw : (raw as Record<string, unknown>)?.name;
  if (typeof rawStr !== 'string') return null;

  return ROLE_MAPPING[rawStr.toLowerCase()] ?? null;
}

// ============= Patch Parsing =============

function parsePatchIndex(titleVersion: unknown): number | null {
  let version: string | null = null;
  if (typeof titleVersion === 'string') {
    version = titleVersion;
  } else if (titleVersion && typeof titleVersion === 'object' && 'name' in (titleVersion as object)) {
    version = (titleVersion as { name: string }).name;
  }
  if (!version) return null;
  const match = version.match(/^(\d+)\.(\d+)/);
  if (!match) return null;
  return parseInt(match[1], 10) * 100 + parseInt(match[2], 10);
}

// ============= Weight Functions =============

function patchWeight(patchIndex: number, targetPatchIndex: number, beta: number, cap: number): number {
  const delta = Math.min(targetPatchIndex - patchIndex, cap);
  if (delta < 0) return 1; // Future patch
  return Math.pow(beta, delta);
}

function maturityWeight(gameDate: Date, patchStartDate: Date, gamma: number): number {
  const days = Math.max(0, (gameDate.getTime() - patchStartDate.getTime()) / 86_400_000);
  return 1 - Math.exp(-(days + 1) / gamma); // Option A: d_eff = d + 1
}

function teamWeight(score: number | null, mean: number, std: number, sensitivity: number): number {
  if (score === null || std === 0) return 1;
  return Math.exp(((score - mean) / std) * sensitivity);
}

// ============= Team Power Score Helpers =============

function loadTeamPowerScores(): Map<string, Map<string, number>> {
  const raw: Array<{ id: string; power_score: Record<string, number> }> =
    JSON.parse(fs.readFileSync(TEAM_POWER_FILE, 'utf-8'));
  const result = new Map<string, Map<string, number>>();
  for (const team of raw) {
    result.set(team.id, new Map(Object.entries(team.power_score)));
  }
  return result;
}

/** Pre-compute global mean/std across ALL team scores (all dates). */
function computeGlobalScoreStats(tps: Map<string, Map<string, number>>): { mean: number; std: number } {
  const scores: number[] = [];
  for (const scoreMap of tps.values()) {
    for (const s of scoreMap.values()) scores.push(s);
  }
  if (scores.length === 0) return { mean: 1300, std: 1 };
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
  return { mean, std: Math.sqrt(variance) || 1 };
}

/** Get most recent team score on or before gameDate. */
function getTeamScore(teamId: string, gameDate: string, tps: Map<string, Map<string, number>>): number | null {
  const scoreMap = tps.get(teamId);
  if (!scoreMap) return null;
  const gameDateMs = new Date(gameDate).getTime();
  let bestMs = -Infinity;
  let bestScore: number | null = null;
  for (const [dateStr, score] of scoreMap) {
    const ms = new Date(dateStr).getTime();
    if (ms <= gameDateMs && ms > bestMs) {
      bestMs = ms;
      bestScore = score;
    }
  }
  return bestScore;
}

// ============= Dry Run =============

function dryRun() {
  console.log('=== DRY RUN: Role Field Exploration ===\n');
  const seriesFiles = fs.readdirSync(DATA_DIR)
    .filter(f => f.startsWith('series_') && f.endsWith('.json'))
    .sort()
    .slice(0, 3);

  for (const sf of seriesFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, sf), 'utf-8'));
    console.log(`--- Series ${data.id} (${sf}) ---`);
    const games = (data.games || []).slice(0, 2);
    for (const g of games) {
      console.log(`  Game seq=${g.sequenceNumber} patch=${JSON.stringify(g.titleVersion)}`);
      for (const t of (g.teams || [])) {
        console.log(`    Team ${t.id} won=${t.won}`);
        for (const p of (t.players || []).slice(0, 3)) {
          const charName = p.character?.name ?? '?';
          console.log(`      ${p.name} (${charName})`);
          console.log(`        .roles     = ${JSON.stringify(p.roles)}`);
          console.log(`        .role      = ${JSON.stringify(p.role)}`);
          console.log(`        .position  = ${JSON.stringify(p.position)}`);
          const extracted = extractRole(p);
          console.log(`        extractRole => ${extracted}`);
        }
      }
    }
    console.log();
  }

  console.log('Conclusion: player.roles is string[] (e.g. ["top"]), player.role is always null,');
  console.log('player.position is {x,y} coordinates. Using roles[0] via extractRole().');
}

// ============= Main =============

function main() {
  if (DRY_RUN) {
    dryRun();
    return;
  }

  const startTime = Date.now();
  console.log('=== Building Champion-Role Win Rates ===\n');

  // Load params from posteriors metadata
  const params = loadParameters();
  console.log(`Target: ${params.targetPatch} (${params.targetPatchIndex})`);
  console.log(`Params: β=${params.beta} γ=${params.gamma} s=${params.teamWeightSensitivity} cap=${params.deltaPatchCap}\n`);

  // Load supporting data
  const patchStartDates: Record<string, string> = JSON.parse(fs.readFileSync(PATCH_DATES_FILE, 'utf-8'));
  const tps = loadTeamPowerScores();
  const { mean: globalMean, std: globalStd } = computeGlobalScoreStats(tps);
  console.log(`Team score stats: mean=${globalMean.toFixed(1)} std=${globalStd.toFixed(1)}`);

  // Data quality counters
  let totalGamesProcessed = 0;
  let gamesSkippedMissingPatch = 0;
  let gamesSkippedMissingDate = 0;
  let gamesFuturePatch = 0;
  let gamesMissingTeamsOrPlayers = 0;
  let playerRecordsMissingRoleField = 0;
  let rolesDroppedUnknown = 0;
  let gamesUsingDefaultTeamWeight = 0;
  let totalPlayerRecords = 0;
  const patchesUsingFallback = new Set<number>();

  // Fallback patch dates (built on first pass)
  const fallbackPatchDates = new Map<number, string>();

  // Aggregation maps (edge-read-edge-aggregate, no intermediate array)
  const championStats = new Map<string, Map<Role, ChampionRoleStats>>();
  let globalRawGames = 0;
  let globalRawWins = 0;
  let globalWeightedGames = 0;
  let globalWeightedWins = 0;

  function upsertStats(champion: string, role: Role): ChampionRoleStats {
    let roleMap = championStats.get(champion);
    if (!roleMap) {
      roleMap = new Map();
      championStats.set(champion, roleMap);
    }
    let stats = roleMap.get(role);
    if (!stats) {
      stats = { raw_games: 0, raw_wins: 0, weighted_games: 0, weighted_wins: 0 };
      roleMap.set(role, stats);
    }
    return stats;
  }

  // Process series files
  const seriesFiles = fs.readdirSync(DATA_DIR)
    .filter(f => f.startsWith('series_') && f.endsWith('.json'));

  console.log(`Processing ${seriesFiles.length} series files...\n`);

  for (const sf of seriesFiles) {
    const seriesData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, sf), 'utf-8'));
    const seriesStartedAt = seriesData.startedAt as string | undefined;

    for (const game of seriesData.games || []) {
      const patchIndex = parsePatchIndex(game.titleVersion);
      if (patchIndex === null) { gamesSkippedMissingPatch++; continue; }

      if (patchIndex > params.targetPatchIndex) { gamesFuturePatch++; continue; }

      const gameDateStr: string | undefined = game.startedAt || seriesStartedAt;
      if (!gameDateStr) { gamesSkippedMissingDate++; continue; }

      if (!game.teams || game.teams.length !== 2) { gamesMissingTeamsOrPlayers++; continue; }

      const gameDate = new Date(gameDateStr);

      // Patch start date with fallback
      let patchStartStr = patchStartDates[patchIndex.toString()];
      if (!patchStartStr) {
        const existing = fallbackPatchDates.get(patchIndex);
        if (!existing || gameDate < new Date(existing)) {
          fallbackPatchDates.set(patchIndex, gameDateStr);
        }
        patchStartStr = fallbackPatchDates.get(patchIndex)!;
        patchesUsingFallback.add(patchIndex);
      }
      const patchStartDate = new Date(patchStartStr);

      // Weights
      const wPatch = patchWeight(patchIndex, params.targetPatchIndex, params.beta, params.deltaPatchCap);
      const wMaturity = maturityWeight(gameDate, patchStartDate, params.gamma);

      const teamAId = game.teams[0].id as string;
      const teamBId = game.teams[1].id as string;
      const scoreA = getTeamScore(teamAId, gameDateStr, tps);
      const scoreB = getTeamScore(teamBId, gameDateStr, tps);

      let wTeam: number;
      if (scoreA === null || scoreB === null) {
        wTeam = 1;
        gamesUsingDefaultTeamWeight++;
      } else {
        wTeam = (teamWeight(scoreA, globalMean, globalStd, params.teamWeightSensitivity) +
                 teamWeight(scoreB, globalMean, globalStd, params.teamWeightSensitivity)) / 2;
      }

      const wTotal = wPatch * wMaturity * wTeam;
      totalGamesProcessed++;

      for (const team of game.teams) {
        const won = team.won === true;
        if (!team.players || !Array.isArray(team.players)) {
          gamesMissingTeamsOrPlayers++;
          continue;
        }

        for (const player of team.players) {
          if (!player.character?.name) continue;

          const role = extractRole(player);
          if (role === null) {
            // Distinguish: no roles field vs unknown label
            if (!player.roles || !Array.isArray(player.roles) || player.roles.length === 0) {
              playerRecordsMissingRoleField++;
            } else {
              rolesDroppedUnknown++;
            }
            continue;
          }

          totalPlayerRecords++;
          const stats = upsertStats(player.character.name, role);
          stats.raw_games++;
          stats.weighted_games += wTotal;
          if (won) {
            stats.raw_wins++;
            stats.weighted_wins += wTotal;
          }
          globalRawGames++;
          globalWeightedGames += wTotal;
          if (won) { globalRawWins++; globalWeightedWins += wTotal; }
        }
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Build output (only include roles with raw_games > 0)
  const championsOut: Record<string, Record<string, ChampionRoleStats>> = {};
  for (const [champion, roleMap] of championStats) {
    const roles: Record<string, ChampionRoleStats> = {};
    for (const [role, stats] of roleMap) {
      if (stats.raw_games > 0) {
        roles[role] = {
          raw_games: stats.raw_games,
          raw_wins: stats.raw_wins,
          weighted_games: parseFloat(stats.weighted_games.toFixed(4)),
          weighted_wins: parseFloat(stats.weighted_wins.toFixed(4)),
        };
      }
    }
    if (Object.keys(roles).length > 0) {
      championsOut[champion] = roles;
    }
  }

  const output = {
    metadata: {
      generated_at_utc: new Date().toISOString(),
      target_patch: params.targetPatch,
      target_patch_index: params.targetPatchIndex,
      parameters: {
        beta: params.beta,
        gamma: params.gamma,
        team_weight_sensitivity: params.teamWeightSensitivity,
        delta_patch_cap: params.deltaPatchCap,
      },
      data_quality: {
        total_games_processed: totalGamesProcessed,
        total_player_records: totalPlayerRecords,
        games_skipped_missing_patch: gamesSkippedMissingPatch,
        games_skipped_missing_date: gamesSkippedMissingDate,
        games_future_patch: gamesFuturePatch,
        player_records_missing_role_field: playerRecordsMissingRoleField,
        roles_dropped_unknown_label: rolesDroppedUnknown,
        patches_using_fallback_start_date: Array.from(patchesUsingFallback).sort((a, b) => a - b),
        games_using_default_team_weight: gamesUsingDefaultTeamWeight,
        games_missing_teams_or_players: gamesMissingTeamsOrPlayers,
      },
      global: {
        raw_games: globalRawGames,
        raw_wins: globalRawWins,
        weighted_games: parseFloat(globalWeightedGames.toFixed(4)),
        weighted_wins: parseFloat(globalWeightedWins.toFixed(4)),
      },
    },
    champions: championsOut,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  // Report
  console.log(`Done in ${elapsed}s`);
  console.log(`Total games processed: ${totalGamesProcessed}`);
  console.log(`Total player records: ${totalPlayerRecords}`);
  console.log(`Champions: ${Object.keys(championsOut).length}`);
  console.log(`\nSkipped: patch=${gamesSkippedMissingPatch} date=${gamesSkippedMissingDate} future=${gamesFuturePatch}`);
  console.log(`Missing teams/players: ${gamesMissingTeamsOrPlayers}`);
  console.log(`Player missing role field: ${playerRecordsMissingRoleField}`);
  console.log(`Roles dropped (unknown label): ${rolesDroppedUnknown}`);
  console.log(`Default team weight: ${gamesUsingDefaultTeamWeight}`);
  console.log(`Fallback patch dates: ${patchesUsingFallback.size} patches`);

  // Sample output
  console.log('\n=== Sample Champions ===');
  for (const name of ['Yone', 'Maokai', 'Pantheon', 'Aatrox']) {
    const c = championsOut[name];
    if (!c) { console.log(`\n${name}: NOT FOUND`); continue; }
    console.log(`\n${name}:`);
    for (const role of ALL_ROLES) {
      const s = c[role];
      if (!s) continue;
      const rawWr = s.raw_games > 0 ? (s.raw_wins / s.raw_games * 100).toFixed(1) : '-';
      const wWr = s.weighted_games > 0 ? (s.weighted_wins / s.weighted_games * 100).toFixed(1) : '-';
      console.log(`  ${role}: raw ${s.raw_games}G ${rawWr}%WR | weighted ${s.weighted_games.toFixed(2)}G ${wWr}%WR`);
    }
  }

  console.log(`\nOutput: ${OUTPUT_FILE}`);
}

main();
