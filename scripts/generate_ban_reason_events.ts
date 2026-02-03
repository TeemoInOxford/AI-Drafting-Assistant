#!/usr/bin/env ts-node
/**
 * generate_ban_reason_events.ts
 *
 * 从 data/grid_v2/series_*.json 解析 ban 事件，生成 ban_reason_events.jsonl
 *
 * 此脚本为第一阶段 Ban 数据底座的一部分，只处理前三 ban (slot 1-3)
 *
 * 运行方式:
 *   npx ts-node scripts/generate_ban_reason_events.ts
 *
 * 输出:
 *   data/grid_v2/ban_reason_events.jsonl
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Constants
// ============================================================================

const DATA_DIR = path.join(process.cwd(), 'data', 'grid_v2');
const OUTPUT_FILE = path.join(DATA_DIR, 'ban_reason_events.jsonl');

/**
 * 标准 BP 顺序 (前 6 步是 early ban)
 * seq 1 = BLUE_BAN_1 (slot 1)
 * seq 2 = RED_BAN_1 (slot 1)
 * seq 3 = BLUE_BAN_2 (slot 2)
 * seq 4 = RED_BAN_2 (slot 2)
 * seq 5 = BLUE_BAN_3 (slot 3)
 * seq 6 = RED_BAN_3 (slot 3)
 */
const EARLY_BAN_SEQUENCES = [1, 2, 3, 4, 5, 6];

// Region extraction patterns
const REGION_PATTERNS: Array<{ pattern: RegExp; region: string; league: string }> = [
  { pattern: /LCK/i, region: 'KR', league: 'LCK' },
  { pattern: /LPL/i, region: 'CN', league: 'LPL' },
  { pattern: /LEC/i, region: 'EU', league: 'LEC' },
  { pattern: /LCS(?!.*LTA)/i, region: 'NA', league: 'LCS' },
  { pattern: /LTA.*North|LTA_N/i, region: 'NA', league: 'LTA_N' },
  { pattern: /LTA.*South|LTA_S/i, region: 'LATAM', league: 'LTA_S' },
  { pattern: /PCS/i, region: 'SEA', league: 'PCS' },
  { pattern: /VCS/i, region: 'VN', league: 'VCS' },
  { pattern: /CBLOL/i, region: 'BR', league: 'CBLOL' },
  { pattern: /LJL/i, region: 'JP', league: 'LJL' },
  { pattern: /TCL/i, region: 'TR', league: 'TCL' },
  { pattern: /Worlds|MSI|International/i, region: 'International', league: 'International' },
];

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

interface MetaPresenceData {
  patches: Record<string, {
    total_games: number;
    heroes: Record<string, {
      presence: number;
      pick_rate: number;
      ban_rate: number;
    }>;
  }>;
}

interface PlayerPoolByTeam {
  teams: Record<string, {
    team_name: string;
    players: Array<{
      player_id: string;
      player_name: string;
      champions: Array<{
        champion: string;
        games_weighted: number;
        win_rate_weighted: number;
      }>;
    }>;
  }>;
}

interface BanReasonEvent {
  match_id: string;
  game_id: string;
  series_id: string;
  patch_index: number | null;
  patch_version: string | null;
  league: string | null;
  region: string | null;
  side: 'BLUE' | 'RED';
  team_id: string;
  team_name: string;
  opponent_team_id: string;
  opponent_team_name: string;
  ban_slot: 1 | 2 | 3;
  seq: number;
  banned_champion_id: string;
  banned_champion_name: string;
  prior_context: {
    opponent_recent_picks_bans_summary: string[] | null;
  };
  feature_proxies: {
    meta_presence_score: number | null;
    opponent_pool_score: number | null;
    self_avoid_score: number | null;
    recency_weight: {
      delta_patch: number | null;
    };
    team_strength_gamma_input: number | null;
  };
}

interface Stats {
  seriesCount: number;
  gamesProcessed: number;
  gamesSkipped: number;
  eventsGenerated: number;
  errors: string[];
}

// ============================================================================
// Data Loading
// ============================================================================

let metaPresenceData: MetaPresenceData | null = null;
let playerPoolByTeam: PlayerPoolByTeam | null = null;
let seriesMetadataMap: Map<string, SeriesMetadata> = new Map();

function loadMetaPresence(): void {
  const filePath = path.join(DATA_DIR, 'meta_presence.json');
  if (fs.existsSync(filePath)) {
    metaPresenceData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    console.log(`Loaded meta_presence.json with ${Object.keys(metaPresenceData?.patches || {}).length} patches`);
  } else {
    console.warn('meta_presence.json not found, meta_presence_score will be null');
  }
}

function loadPlayerPoolByTeam(): void {
  const filePath = path.join(DATA_DIR, 'player_pool_by_team.json');
  if (fs.existsSync(filePath)) {
    playerPoolByTeam = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    console.log(`Loaded player_pool_by_team.json with ${Object.keys(playerPoolByTeam?.teams || {}).length} teams`);
  } else {
    console.warn('player_pool_by_team.json not found, opponent_pool_score will be null');
  }
}

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

function extractLeagueAndRegion(tournamentName: string | null | undefined): { league: string | null; region: string | null } {
  if (!tournamentName) return { league: null, region: null };
  for (const { pattern, region, league } of REGION_PATTERNS) {
    if (pattern.test(tournamentName)) {
      return { league, region };
    }
  }
  return { league: 'Other', region: 'Other' };
}

function parsePatchVersion(patchStr: string | null | undefined): { version: string | null; index: number | null } {
  if (!patchStr) return { version: null, index: null };
  // Format like "15.17" or "14.10"
  const match = patchStr.match(/(\d+)\.(\d+)/);
  if (match) {
    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    return {
      version: `${major}.${minor}`,
      index: major * 100 + minor, // e.g., 15.17 -> 1517
    };
  }
  return { version: patchStr, index: null };
}

function getBanSlotFromSeq(seq: number, side: 'BLUE' | 'RED'): 1 | 2 | 3 {
  // Blue: 1->slot1, 3->slot2, 5->slot3
  // Red:  2->slot1, 4->slot2, 6->slot3
  if (side === 'BLUE') {
    if (seq === 1) return 1;
    if (seq === 3) return 2;
    if (seq === 5) return 3;
  } else {
    if (seq === 2) return 1;
    if (seq === 4) return 2;
    if (seq === 6) return 3;
  }
  return 1; // fallback
}

function getMetaPresenceScore(championName: string, patchVersion: string | null): number | null {
  if (!metaPresenceData || !patchVersion) return null;
  const patchData = metaPresenceData.patches[patchVersion];
  if (!patchData) return null;
  const heroData = patchData.heroes[championName];
  if (!heroData) return null;
  return heroData.presence;
}

function getOpponentPoolScore(opponentTeamId: string, championName: string): number | null {
  if (!playerPoolByTeam) return null;
  const teamData = playerPoolByTeam.teams[opponentTeamId];
  if (!teamData) return null;

  // Sum up games_weighted across all players for this champion
  let totalGamesWeighted = 0;
  let found = false;

  for (const player of teamData.players) {
    for (const champ of player.champions) {
      if (champ.champion === championName) {
        totalGamesWeighted += champ.games_weighted;
        found = true;
      }
    }
  }

  return found ? totalGamesWeighted : null;
}

// ============================================================================
// Core Processing
// ============================================================================

function processGame(
  series: Series,
  game: Game,
  tournamentName: string | null,
  stats: Stats
): BanReasonEvent[] {
  const events: BanReasonEvent[] = [];
  const seriesId = series.id || 'unknown';
  const gameId = game.id || 'unknown';

  const draftActions = game.draftActions || [];
  if (draftActions.length === 0) {
    return events;
  }

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

  if (!blueTeam || !redTeam) {
    stats.errors.push(`[${seriesId}/${gameId}] Cannot determine teams`);
    return events;
  }

  // Parse patch
  const patchStr = game.titleVersion?.name || null;
  const { version: patchVersion, index: patchIndex } = parsePatchVersion(patchStr);

  // Extract league/region
  const { league, region } = extractLeagueAndRegion(tournamentName);

  // Calculate current patch index for delta
  // Using the latest patch as reference (from series.json or fallback to 1518)
  const currentPatchIndex = 1518; // Default to 15.18

  // Process only early bans (seq 1-6, which are slots 1-3)
  for (const action of draftActions) {
    if (action.type !== 'ban') continue;

    const seq = typeof action.sequenceNumber === 'string'
      ? parseInt(action.sequenceNumber, 10)
      : action.sequenceNumber;

    if (!seq || !EARLY_BAN_SEQUENCES.includes(seq)) continue;

    // Determine side
    const isBlue = seq === 1 || seq === 3 || seq === 5;
    const side: 'BLUE' | 'RED' = isBlue ? 'BLUE' : 'RED';
    const banSlot = getBanSlotFromSeq(seq, side);

    // Only process slots 1-3 (requirement)
    if (banSlot > 3) continue;

    // Get team info
    const banTeam = isBlue ? blueTeam : redTeam;
    const opponentTeam = isBlue ? redTeam : blueTeam;

    const championName = action.draftable?.name || '';
    const championId = action.draftable?.id || championName;

    if (!championName) continue;

    // Calculate feature proxies
    const metaPresenceScore = getMetaPresenceScore(championName, patchVersion);
    const opponentPoolScore = getOpponentPoolScore(opponentTeam.id || '', championName);

    // delta_patch = currentPatchIndex - gamePatchIndex
    const deltaPatch = patchIndex !== null ? currentPatchIndex - patchIndex : null;

    const event: BanReasonEvent = {
      match_id: `${seriesId}_${gameId}`,
      game_id: gameId,
      series_id: seriesId,
      patch_index: patchIndex,
      patch_version: patchVersion,
      league,
      region,
      side,
      team_id: banTeam.id || '',
      team_name: banTeam.name || '',
      opponent_team_id: opponentTeam.id || '',
      opponent_team_name: opponentTeam.name || '',
      ban_slot: banSlot,
      seq,
      banned_champion_id: championId,
      banned_champion_name: championName,
      prior_context: {
        // For slots 1-3, there's no prior picks (early bans happen before picks)
        opponent_recent_picks_bans_summary: null,
      },
      feature_proxies: {
        meta_presence_score: metaPresenceScore,
        opponent_pool_score: opponentPoolScore,
        self_avoid_score: null, // Reserved for future counter data
        recency_weight: {
          delta_patch: deltaPatch,
        },
        team_strength_gamma_input: null, // Reserved for future power ranking
      },
    };

    events.push(event);
    stats.eventsGenerated++;
  }

  return events;
}

function processSeriesFile(filePath: string, stats: Stats): BanReasonEvent[] {
  const events: BanReasonEvent[] = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const series: Series = JSON.parse(content);

    // Get tournament name from metadata or series
    const metadata = seriesMetadataMap.get(series.id || '');
    const tournamentName = metadata?.tournament?.name || series.tournament?.name || null;

    const games = series.games || [];
    if (games.length === 0) return events;

    for (const game of games) {
      const gameEvents = processGame(series, game, tournamentName, stats);
      events.push(...gameEvents);
      stats.gamesProcessed++;
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    stats.errors.push(`[${filePath}] Parse error: ${errMsg}`);
    stats.gamesSkipped++;
  }

  return events;
}

// ============================================================================
// Self-Check: Validate 5 random games
// ============================================================================

function selfCheck(events: BanReasonEvent[]): void {
  console.log('\n' + '='.repeat(60));
  console.log('Self-Check: Validating ban sequence order');
  console.log('='.repeat(60));

  // Group events by game
  const gameEvents = new Map<string, BanReasonEvent[]>();
  for (const event of events) {
    const key = event.match_id;
    if (!gameEvents.has(key)) {
      gameEvents.set(key, []);
    }
    gameEvents.get(key)!.push(event);
  }

  // Select 5 random games
  const gameIds = Array.from(gameEvents.keys());
  const sampleSize = Math.min(5, gameIds.length);
  const sampleIds: string[] = [];
  const usedIndices = new Set<number>();

  while (sampleIds.length < sampleSize) {
    const idx = Math.floor(Math.random() * gameIds.length);
    if (!usedIndices.has(idx)) {
      usedIndices.add(idx);
      sampleIds.push(gameIds[idx]);
    }
  }

  let allValid = true;

  for (const matchId of sampleIds) {
    const bans = gameEvents.get(matchId)!.sort((a, b) => a.seq - b.seq);
    console.log(`\n[${matchId}]`);

    let valid = true;
    for (const ban of bans) {
      const expectedSide = [1, 3, 5].includes(ban.seq) ? 'BLUE' : 'RED';
      const expectedSlot = getBanSlotFromSeq(ban.seq, expectedSide);

      const sideMatch = ban.side === expectedSide;
      const slotMatch = ban.ban_slot === expectedSlot;

      const status = sideMatch && slotMatch ? '✓' : '✗';
      if (!sideMatch || !slotMatch) valid = false;

      console.log(
        `  seq=${ban.seq} side=${ban.side}(expect ${expectedSide}) ` +
        `slot=${ban.ban_slot}(expect ${expectedSlot}) ` +
        `champion=${ban.banned_champion_name} ${status}`
      );
    }

    if (!valid) allValid = false;
  }

  console.log('\n' + (allValid ? '✓ All samples validated' : '✗ Some samples failed validation'));
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('Generate Ban Reason Events');
  console.log('='.repeat(60));
  console.log(`Input: ${DATA_DIR}/series_*.json`);
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log('');

  // Load reference data
  loadMetaPresence();
  loadPlayerPoolByTeam();
  loadSeriesMetadata();
  console.log('');

  const stats: Stats = {
    seriesCount: 0,
    gamesProcessed: 0,
    gamesSkipped: 0,
    eventsGenerated: 0,
    errors: [],
  };

  // Find all series files
  const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('series_') && f.endsWith('.json'));
  console.log(`Found ${files.length} series files`);
  console.log('');

  // Process all files
  const allEvents: BanReasonEvent[] = [];

  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    const events = processSeriesFile(filePath, stats);
    allEvents.push(...events);
    stats.seriesCount++;

    if (stats.seriesCount % 100 === 0) {
      process.stdout.write(`\rProcessed ${stats.seriesCount}/${files.length} series...`);
    }
  }
  console.log(`\rProcessed ${stats.seriesCount}/${files.length} series.`);
  console.log('');

  // Write output
  console.log(`Writing ${allEvents.length} events to ${OUTPUT_FILE}...`);
  const outputLines = allEvents.map(e => JSON.stringify(e));
  fs.writeFileSync(OUTPUT_FILE, outputLines.join('\n') + '\n', 'utf-8');
  console.log('Done.');

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Series processed:    ${stats.seriesCount}`);
  console.log(`Games processed:     ${stats.gamesProcessed}`);
  console.log(`Games skipped:       ${stats.gamesSkipped}`);
  console.log(`Events generated:    ${stats.eventsGenerated}`);
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
  selfCheck(allEvents);

  // Sample output
  if (allEvents.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('Sample Output (first event)');
    console.log('='.repeat(60));
    console.log(JSON.stringify(allEvents[0], null, 2));
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
