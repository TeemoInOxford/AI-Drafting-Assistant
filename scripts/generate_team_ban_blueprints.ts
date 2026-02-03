#!/usr/bin/env ts-node
/**
 * generate_team_ban_blueprints.ts
 *
 * 从 data/grid_v2/series_*.json 解析 ban 事件，生成 team_ban_blueprints.json
 *
 * 此脚本为第一阶段 Ban 数据底座的一部分，只处理前三 ban (slot 1-3)
 *
 * 运行方式:
 *   npx ts-node scripts/generate_team_ban_blueprints.ts
 *
 * 输出:
 *   data/grid_v2/team_ban_blueprints.json
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Constants
// ============================================================================

const DATA_DIR = path.join(process.cwd(), 'data', 'grid_v2');
const OUTPUT_FILE = path.join(DATA_DIR, 'team_ban_blueprints.json');

// Number of recent patches to track for trends
const RECENT_PATCH_COUNT = 5;

// Top K for response-ban statistics
const RESPONSE_BAN_TOP_K = 10;

// ============================================================================
// Types
// ============================================================================

interface DraftAction {
  type?: string;
  sequenceNumber?: string | number;
  drafter?: { id?: string };
  draftable?: { id?: string; name?: string };
}

interface Team {
  id?: string;
  name?: string;
  side?: 'blue' | 'red' | string;
}

interface Game {
  id?: string;
  sequenceNumber?: number;
  draftActions?: DraftAction[];
  teams?: Team[];
  titleVersion?: { name?: string };
}

interface Series {
  id?: string;
  startedAt?: string;
  tournament?: { name?: string };
  games?: Game[];
}

interface SeriesMetadata {
  id: string;
  startedAt?: string;
  tournament?: { name?: string };
}

// Intermediate structures for aggregation
interface BanRecord {
  championName: string;
  slot: 1 | 2 | 3;
  patchIndex: number | null;
}

interface TeamBanData {
  teamId: string;
  teamName: string;
  blueSide: {
    totalGames: number;
    bansBySlot: Map<1 | 2 | 3, Map<string, number>>;
    allBans: Map<string, number>;
    byPatch: Map<number, Map<string, number>>;
  };
  redSide: {
    totalGames: number;
    bansBySlot: Map<1 | 2 | 3, Map<string, number>>;
    allBans: Map<string, number>;
    byPatch: Map<number, Map<string, number>>;
  };
  responseBans: {
    blue: Map<string, Map<string, number>>; // opponent_ban -> our_response -> count
    red: Map<string, Map<string, number>>;
  };
}

// Output structures
interface ChampionBanStat {
  champion_id: string;
  champion_name: string;
  count: number;
  rate: number;
}

interface SlotBans {
  slot: 1 | 2 | 3;
  total_bans: number;
  top_bans: ChampionBanStat[];
}

interface PatchTrend {
  patch_index: number;
  top_bans: ChampionBanStat[];
}

interface ResponseBanEntry {
  opponent_banned: string;
  responses: Array<{ champion: string; count: number; rate: number }>;
}

interface SideBanBlueprint {
  total_games: number;
  ban_slots: SlotBans[];
  overall_top_bans: ChampionBanStat[];
  patch_trends: PatchTrend[];
  response_bans: ResponseBanEntry[];
}

interface TeamBanBlueprint {
  team_id: string;
  team_name: string;
  blue_side: SideBanBlueprint;
  red_side: SideBanBlueprint;
}

interface BlueprintOutput {
  generated_at: string;
  data_source: string;
  total_teams: number;
  total_games: number;
  recent_patch_count: number;
  response_ban_top_k: number;
  teams: Record<string, TeamBanBlueprint>;
}

interface Stats {
  seriesCount: number;
  gamesProcessed: number;
  teamsFound: number;
  bansProcessed: number;
  errors: string[];
}

// ============================================================================
// Data Loading
// ============================================================================

let seriesMetadataMap: Map<string, SeriesMetadata> = new Map();

function loadSeriesMetadata(): void {
  const filePath = path.join(DATA_DIR, 'series.json');
  if (fs.existsSync(filePath)) {
    const seriesList: SeriesMetadata[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    for (const s of seriesList) {
      seriesMetadataMap.set(s.id, s);
    }
    console.log(`Loaded series.json with ${seriesMetadataMap.size} entries`);
  }
}

// ============================================================================
// Helpers
// ============================================================================

function parsePatchIndex(patchStr: string | null | undefined): number | null {
  if (!patchStr) return null;
  const match = patchStr.match(/(\d+)\.(\d+)/);
  if (match) {
    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    return major * 100 + minor;
  }
  return null;
}

function getBanSlotFromSeq(seq: number, side: 'blue' | 'red'): 1 | 2 | 3 | null {
  if (side === 'blue') {
    if (seq === 1) return 1;
    if (seq === 3) return 2;
    if (seq === 5) return 3;
  } else {
    if (seq === 2) return 1;
    if (seq === 4) return 2;
    if (seq === 6) return 3;
  }
  return null;
}

function mapToSortedArray(
  banMap: Map<string, number>,
  totalGames: number
): ChampionBanStat[] {
  const entries = Array.from(banMap.entries())
    .sort((a, b) => b[1] - a[1]);

  return entries.map(([champion, count]) => ({
    champion_id: champion,
    champion_name: champion,
    count,
    rate: totalGames > 0 ? count / totalGames : 0,
  }));
}

// ============================================================================
// Core Processing
// ============================================================================

const teamDataMap = new Map<string, TeamBanData>();

function getOrCreateTeamData(teamId: string, teamName: string): TeamBanData {
  if (!teamDataMap.has(teamId)) {
    teamDataMap.set(teamId, {
      teamId,
      teamName,
      blueSide: {
        totalGames: 0,
        bansBySlot: new Map([
          [1, new Map()],
          [2, new Map()],
          [3, new Map()],
        ]),
        allBans: new Map(),
        byPatch: new Map(),
      },
      redSide: {
        totalGames: 0,
        bansBySlot: new Map([
          [1, new Map()],
          [2, new Map()],
          [3, new Map()],
        ]),
        allBans: new Map(),
        byPatch: new Map(),
      },
      responseBans: {
        blue: new Map(),
        red: new Map(),
      },
    });
  }
  return teamDataMap.get(teamId)!;
}

function processGame(series: Series, game: Game, stats: Stats): void {
  const draftActions = game.draftActions || [];
  if (draftActions.length === 0) return;

  // Get teams
  const teams = game.teams || [];
  let blueTeam: Team | undefined;
  let redTeam: Team | undefined;

  for (const team of teams) {
    if (team.side === 'blue') blueTeam = team;
    else if (team.side === 'red') redTeam = team;
  }

  // Fallback: infer from first ban
  if (!blueTeam || !redTeam) {
    const firstBan = draftActions.find(a => a.type === 'ban' && String(a.sequenceNumber) === '1');
    if (firstBan && firstBan.drafter?.id && teams.length >= 2) {
      const blueTeamId = firstBan.drafter.id;
      blueTeam = teams.find(t => t.id === blueTeamId) || { id: blueTeamId, name: 'Unknown' };
      redTeam = teams.find(t => t.id !== blueTeamId) || { id: 'unknown', name: 'Unknown' };
    }
  }

  if (!blueTeam?.id || !redTeam?.id) return;

  // Parse patch
  const patchIndex = parsePatchIndex(game.titleVersion?.name || null);

  // Initialize team data
  const blueData = getOrCreateTeamData(blueTeam.id, blueTeam.name || '');
  const redData = getOrCreateTeamData(redTeam.id, redTeam.name || '');

  blueData.blueSide.totalGames++;
  redData.redSide.totalGames++;

  // Track bans in order for response-ban analysis
  const banSequence: Array<{ seq: number; side: 'blue' | 'red'; champion: string }> = [];

  // Process early bans (seq 1-6)
  for (const action of draftActions) {
    if (action.type !== 'ban') continue;

    const seq = typeof action.sequenceNumber === 'string'
      ? parseInt(action.sequenceNumber, 10)
      : action.sequenceNumber;

    if (!seq || seq > 6) continue;

    const isBlue = seq === 1 || seq === 3 || seq === 5;
    const side: 'blue' | 'red' = isBlue ? 'blue' : 'red';
    const slot = getBanSlotFromSeq(seq, side);

    if (!slot || slot > 3) continue;

    const championName = action.draftable?.name || '';
    if (!championName) continue;

    banSequence.push({ seq, side, champion: championName });

    // Update team data
    const teamData = isBlue ? blueData : redData;
    const sideData = isBlue ? teamData.blueSide : teamData.redSide;

    // By slot
    const slotMap = sideData.bansBySlot.get(slot)!;
    slotMap.set(championName, (slotMap.get(championName) || 0) + 1);

    // Overall
    sideData.allBans.set(championName, (sideData.allBans.get(championName) || 0) + 1);

    // By patch
    if (patchIndex !== null) {
      if (!sideData.byPatch.has(patchIndex)) {
        sideData.byPatch.set(patchIndex, new Map());
      }
      const patchMap = sideData.byPatch.get(patchIndex)!;
      patchMap.set(championName, (patchMap.get(championName) || 0) + 1);
    }

    stats.bansProcessed++;
  }

  // Analyze response bans
  // When opponent bans champion A, and we ban champion B next
  // Blue seq: 1, 3, 5
  // Red seq: 2, 4, 6
  //
  // Response pairs:
  // - After Red ban at seq 2, Blue responds at seq 3
  // - After Red ban at seq 4, Blue responds at seq 5
  // - After Blue ban at seq 1, Red responds at seq 2
  // - After Blue ban at seq 3, Red responds at seq 4
  // - After Blue ban at seq 5, Red responds at seq 6

  const banMap = new Map<number, string>();
  for (const b of banSequence) {
    banMap.set(b.seq, b.champion);
  }

  // Blue responses (after Red bans)
  const blueResponses: Array<[string, string]> = [];
  if (banMap.has(2) && banMap.has(3)) {
    blueResponses.push([banMap.get(2)!, banMap.get(3)!]);
  }
  if (banMap.has(4) && banMap.has(5)) {
    blueResponses.push([banMap.get(4)!, banMap.get(5)!]);
  }

  for (const [oppBan, ourBan] of blueResponses) {
    const responseMap = blueData.responseBans.blue;
    if (!responseMap.has(oppBan)) {
      responseMap.set(oppBan, new Map());
    }
    const ourBanMap = responseMap.get(oppBan)!;
    ourBanMap.set(ourBan, (ourBanMap.get(ourBan) || 0) + 1);
  }

  // Red responses (after Blue bans)
  const redResponses: Array<[string, string]> = [];
  if (banMap.has(1) && banMap.has(2)) {
    redResponses.push([banMap.get(1)!, banMap.get(2)!]);
  }
  if (banMap.has(3) && banMap.has(4)) {
    redResponses.push([banMap.get(3)!, banMap.get(4)!]);
  }
  if (banMap.has(5) && banMap.has(6)) {
    redResponses.push([banMap.get(5)!, banMap.get(6)!]);
  }

  for (const [oppBan, ourBan] of redResponses) {
    const responseMap = redData.responseBans.red;
    if (!responseMap.has(oppBan)) {
      responseMap.set(oppBan, new Map());
    }
    const ourBanMap = responseMap.get(oppBan)!;
    ourBanMap.set(ourBan, (ourBanMap.get(ourBan) || 0) + 1);
  }

  stats.gamesProcessed++;
}

function processSeriesFile(filePath: string, stats: Stats): void {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const series: Series = JSON.parse(content);

    const games = series.games || [];
    for (const game of games) {
      processGame(series, game, stats);
    }

    stats.seriesCount++;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    stats.errors.push(`[${filePath}] Parse error: ${errMsg}`);
  }
}

// ============================================================================
// Output Generation
// ============================================================================

function buildSideBlueprint(
  sideData: TeamBanData['blueSide'] | TeamBanData['redSide'],
  responseBans: Map<string, Map<string, number>>
): SideBanBlueprint {
  const totalGames = sideData.totalGames;

  // Ban slots
  const banSlots: SlotBans[] = [];
  for (const slot of [1, 2, 3] as const) {
    const slotMap = sideData.bansBySlot.get(slot)!;
    const topBans = mapToSortedArray(slotMap, totalGames).slice(0, 10);
    banSlots.push({
      slot,
      total_bans: Array.from(slotMap.values()).reduce((a, b) => a + b, 0),
      top_bans: topBans,
    });
  }

  // Overall top bans
  const overallTopBans = mapToSortedArray(sideData.allBans, totalGames).slice(0, 20);

  // Patch trends (recent N patches)
  const patchIndices = Array.from(sideData.byPatch.keys()).sort((a, b) => b - a);
  const recentPatches = patchIndices.slice(0, RECENT_PATCH_COUNT);

  const patchTrends: PatchTrend[] = recentPatches.map(patchIndex => {
    const patchBans = sideData.byPatch.get(patchIndex)!;
    const patchTotal = Array.from(patchBans.values()).reduce((a, b) => a + b, 0);
    const patchGames = Math.ceil(patchTotal / 3); // Approximate games (3 bans per game)
    return {
      patch_index: patchIndex,
      top_bans: mapToSortedArray(patchBans, patchGames).slice(0, 10),
    };
  });

  // Response bans
  const responseEntries: ResponseBanEntry[] = [];
  const sortedOppBans = Array.from(responseBans.entries())
    .sort((a, b) => {
      const aTotal = Array.from(a[1].values()).reduce((x, y) => x + y, 0);
      const bTotal = Array.from(b[1].values()).reduce((x, y) => x + y, 0);
      return bTotal - aTotal;
    })
    .slice(0, 20);

  for (const [oppBan, responseMap] of sortedOppBans) {
    const totalResponses = Array.from(responseMap.values()).reduce((a, b) => a + b, 0);
    const responses = Array.from(responseMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, RESPONSE_BAN_TOP_K)
      .map(([champion, count]) => ({
        champion,
        count,
        rate: totalResponses > 0 ? count / totalResponses : 0,
      }));

    responseEntries.push({
      opponent_banned: oppBan,
      responses,
    });
  }

  return {
    total_games: totalGames,
    ban_slots: banSlots,
    overall_top_bans: overallTopBans,
    patch_trends: patchTrends,
    response_bans: responseEntries,
  };
}

function buildTeamBlueprint(teamData: TeamBanData): TeamBanBlueprint {
  return {
    team_id: teamData.teamId,
    team_name: teamData.teamName,
    blue_side: buildSideBlueprint(teamData.blueSide, teamData.responseBans.blue),
    red_side: buildSideBlueprint(teamData.redSide, teamData.responseBans.red),
  };
}

// ============================================================================
// Self-Check
// ============================================================================

function selfCheck(output: BlueprintOutput): void {
  console.log('\n' + '='.repeat(60));
  console.log('Self-Check: Validating sample team blueprints');
  console.log('='.repeat(60));

  const teamIds = Object.keys(output.teams);
  const sampleSize = Math.min(5, teamIds.length);
  const sampleIds = teamIds.slice(0, sampleSize);

  for (const teamId of sampleIds) {
    const team = output.teams[teamId];
    console.log(`\n[${team.team_id}] ${team.team_name}`);
    console.log(`  Blue side: ${team.blue_side.total_games} games`);
    console.log(`  Red side:  ${team.red_side.total_games} games`);

    // Validate ban slots
    let valid = true;
    for (const side of ['blue_side', 'red_side'] as const) {
      const sideData = team[side];
      for (const slotData of sideData.ban_slots) {
        if (slotData.slot < 1 || slotData.slot > 3) {
          console.log(`  ✗ Invalid slot: ${slotData.slot}`);
          valid = false;
        }
      }

      // Check rates sum approximately to 1 per slot
      for (const slotData of sideData.ban_slots) {
        const totalRate = slotData.top_bans.reduce((acc, b) => acc + b.rate, 0);
        if (slotData.top_bans.length > 0 && totalRate > 1.1) {
          console.log(`  ⚠ ${side} slot ${slotData.slot}: total rate > 1 (${totalRate.toFixed(2)})`);
        }
      }
    }

    // Show top 3 bans per side
    console.log(`  Blue top 3: ${team.blue_side.overall_top_bans.slice(0, 3).map(b => b.champion_name).join(', ')}`);
    console.log(`  Red top 3:  ${team.red_side.overall_top_bans.slice(0, 3).map(b => b.champion_name).join(', ')}`);
    console.log(`  ${valid ? '✓' : '✗'} Validated`);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('Generate Team Ban Blueprints');
  console.log('='.repeat(60));
  console.log(`Input: ${DATA_DIR}/series_*.json`);
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log('');

  loadSeriesMetadata();
  console.log('');

  const stats: Stats = {
    seriesCount: 0,
    gamesProcessed: 0,
    teamsFound: 0,
    bansProcessed: 0,
    errors: [],
  };

  // Find all series files
  const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('series_') && f.endsWith('.json'));
  console.log(`Found ${files.length} series files`);
  console.log('');

  // Process all files
  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    processSeriesFile(filePath, stats);

    if (stats.seriesCount % 100 === 0) {
      process.stdout.write(`\rProcessed ${stats.seriesCount}/${files.length} series...`);
    }
  }
  console.log(`\rProcessed ${stats.seriesCount}/${files.length} series.`);
  console.log('');

  // Build output
  const teamsOutput: Record<string, TeamBanBlueprint> = {};
  for (const [teamId, teamData] of teamDataMap) {
    teamsOutput[teamId] = buildTeamBlueprint(teamData);
    stats.teamsFound++;
  }

  const output: BlueprintOutput = {
    generated_at: new Date().toISOString(),
    data_source: 'data/grid_v2/series_*.json',
    total_teams: stats.teamsFound,
    total_games: stats.gamesProcessed,
    recent_patch_count: RECENT_PATCH_COUNT,
    response_ban_top_k: RESPONSE_BAN_TOP_K,
    teams: teamsOutput,
  };

  // Write output
  console.log(`Writing ${stats.teamsFound} team blueprints to ${OUTPUT_FILE}...`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log('Done.');

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Series processed:    ${stats.seriesCount}`);
  console.log(`Games processed:     ${stats.gamesProcessed}`);
  console.log(`Teams found:         ${stats.teamsFound}`);
  console.log(`Bans processed:      ${stats.bansProcessed}`);
  console.log(`Errors:              ${stats.errors.length}`);

  // Show errors
  if (stats.errors.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('Errors (first 10)');
    console.log('='.repeat(60));
    for (const err of stats.errors.slice(0, 10)) {
      console.log(`  - ${err}`);
    }
  }

  // Self-check
  selfCheck(output);

  // Sample output
  const sampleTeamId = Object.keys(teamsOutput)[0];
  if (sampleTeamId) {
    console.log('\n' + '='.repeat(60));
    console.log(`Sample Output (team ${sampleTeamId})`);
    console.log('='.repeat(60));

    const sample = teamsOutput[sampleTeamId];
    console.log(JSON.stringify({
      team_id: sample.team_id,
      team_name: sample.team_name,
      blue_side: {
        total_games: sample.blue_side.total_games,
        ban_slots: sample.blue_side.ban_slots.map(s => ({
          slot: s.slot,
          total_bans: s.total_bans,
          top_bans: s.top_bans.slice(0, 3),
        })),
        overall_top_bans: sample.blue_side.overall_top_bans.slice(0, 5),
        response_bans: sample.blue_side.response_bans.slice(0, 2),
      },
      red_side: {
        total_games: sample.red_side.total_games,
        overall_top_bans: sample.red_side.overall_top_bans.slice(0, 5),
      },
    }, null, 2));
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
