#!/usr/bin/env tsx
/**
 * enrich_draft_timeline.ts
 *
 * Enriches draft_timeline.jsonl with:
 *   1. Game outcome (winnerSide, winnerTeamId, loserTeamId, isWinner per action)
 *   2. Final champion role for PICK actions
 *
 * Usage:
 *   npx tsx scripts/enrich_draft_timeline.ts
 *
 * Input:  data/grid_v2/draft_timeline.jsonl
 * Output: data/grid_v2/draft_timeline_enriched.jsonl
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ============================================================================
// Constants
// ============================================================================

const DATA_DIR = path.join(process.cwd(), 'data', 'grid_v2');
const INPUT_FILE = path.join(DATA_DIR, 'draft_timeline.jsonl');
const OUTPUT_FILE = path.join(DATA_DIR, 'draft_timeline_enriched.jsonl');

type Role = 'top' | 'jungle' | 'mid' | 'bot' | 'support';

// ============================================================================
// Types (Input)
// ============================================================================

interface TimelineAction {
  i: number;
  slot: string;
  side: 'blue' | 'red';
  type: 'ban' | 'pick';
  championId: string;
  championName: string;
  teamId: string;
}

interface TimelineEntry {
  seriesId: string;
  gameId: string;
  gameSequence: number;
  patch: string | null;
  tournament: string | null;
  blueTeamId: string;
  blueTeamName: string;
  redTeamId: string;
  redTeamName: string;
  actions: TimelineAction[];
}

// ============================================================================
// Types (Output)
// ============================================================================

interface EnrichedAction extends TimelineAction {
  isWinner: boolean;
  role: Role | null;
}

interface EnrichedEntry {
  seriesId: string;
  gameId: string;
  gameSequence: number;
  patch: string | null;
  tournament: string | null;
  blueTeamId: string;
  blueTeamName: string;
  redTeamId: string;
  redTeamName: string;
  winnerSide: 'blue' | 'red';
  winnerTeamId: string;
  loserTeamId: string;
  actions: EnrichedAction[];
}

// ============================================================================
// Types (GRID source)
// ============================================================================

interface GridPlayer {
  id: string;
  name: string;
  character?: {
    id: string;
    name: string;
  };
  roles?: string[];
}

interface GridTeam {
  id: string;
  name: string;
  side?: 'blue' | 'red' | string;
  won?: boolean;
  players?: GridPlayer[];
}

interface GridGame {
  id: string;
  teams?: GridTeam[];
}

interface GridSeries {
  id: string;
  games?: GridGame[];
}

// ============================================================================
// Stats
// ============================================================================

interface Stats {
  gamesProcessed: number;
  gamesSkippedNoOutcome: number;
  gamesSkippedNoSeriesFile: number;
  gamesSkippedNoGameMatch: number;
  picksWithRole: number;
  picksWithoutRole: number;
  bans: number;
}

// ============================================================================
// Cache for series files
// ============================================================================

const seriesCache = new Map<string, GridSeries | null>();

function loadSeries(seriesId: string): GridSeries | null {
  if (seriesCache.has(seriesId)) {
    return seriesCache.get(seriesId)!;
  }

  const filePath = path.join(DATA_DIR, `series_${seriesId}.json`);
  if (!fs.existsSync(filePath)) {
    seriesCache.set(seriesId, null);
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const series: GridSeries = JSON.parse(content);
    seriesCache.set(seriesId, series);
    return series;
  } catch {
    seriesCache.set(seriesId, null);
    return null;
  }
}

// ============================================================================
// Enrichment Logic
// ============================================================================

function normalizeRole(role: string): Role | null {
  const lower = role.toLowerCase();
  if (lower === 'top') return 'top';
  if (lower === 'jungle' || lower === 'jng') return 'jungle';
  if (lower === 'mid' || lower === 'middle') return 'mid';
  if (lower === 'bot' || lower === 'adc' || lower === 'bottom') return 'bot';
  if (lower === 'support' || lower === 'sup') return 'support';
  return null;
}

function enrichEntry(entry: TimelineEntry, stats: Stats): EnrichedEntry | null {
  const series = loadSeries(entry.seriesId);
  if (!series) {
    stats.gamesSkippedNoSeriesFile++;
    return null;
  }

  // Find matching game
  const gridGame = series.games?.find(g => g.id === entry.gameId);
  if (!gridGame) {
    stats.gamesSkippedNoGameMatch++;
    return null;
  }

  // Find teams
  const teams = gridGame.teams || [];
  if (teams.length < 2) {
    stats.gamesSkippedNoOutcome++;
    return null;
  }

  // Determine winner
  let winnerTeam: GridTeam | undefined;
  let loserTeam: GridTeam | undefined;
  let blueTeam: GridTeam | undefined;
  let redTeam: GridTeam | undefined;

  for (const t of teams) {
    if (t.side === 'blue') blueTeam = t;
    if (t.side === 'red') redTeam = t;
    if (t.won === true) winnerTeam = t;
    if (t.won === false) loserTeam = t;
  }

  // Validate outcome
  if (!winnerTeam || !loserTeam) {
    stats.gamesSkippedNoOutcome++;
    return null;
  }

  if (!blueTeam || !redTeam) {
    stats.gamesSkippedNoOutcome++;
    return null;
  }

  const winnerSide: 'blue' | 'red' = winnerTeam.side === 'blue' ? 'blue' : 'red';
  const winnerTeamId = winnerTeam.id;
  const loserTeamId = loserTeam.id;

  // Build champion -> role map from both teams
  const championRoleMap = new Map<string, Role>();

  for (const team of [blueTeam, redTeam]) {
    if (!team.players) continue;
    for (const player of team.players) {
      if (player.character?.id && player.roles && player.roles.length > 0) {
        const role = normalizeRole(player.roles[0]);
        if (role) {
          championRoleMap.set(player.character.id, role);
        }
      }
    }
  }

  // Enrich actions
  const enrichedActions: EnrichedAction[] = [];

  for (const action of entry.actions) {
    const isWinner = action.teamId === winnerTeamId;

    let role: Role | null = null;
    if (action.type === 'pick') {
      role = championRoleMap.get(action.championId) || null;
      if (role) {
        stats.picksWithRole++;
      } else {
        stats.picksWithoutRole++;
      }
    } else {
      stats.bans++;
    }

    enrichedActions.push({
      ...action,
      isWinner,
      role,
    });
  }

  stats.gamesProcessed++;

  return {
    seriesId: entry.seriesId,
    gameId: entry.gameId,
    gameSequence: entry.gameSequence,
    patch: entry.patch,
    tournament: entry.tournament,
    blueTeamId: entry.blueTeamId,
    blueTeamName: entry.blueTeamName,
    redTeamId: entry.redTeamId,
    redTeamName: entry.redTeamName,
    winnerSide,
    winnerTeamId,
    loserTeamId,
    actions: enrichedActions,
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('Enrich Draft Timeline');
  console.log('='.repeat(60));
  console.log(`Input:  ${INPUT_FILE}`);
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log('');

  const stats: Stats = {
    gamesProcessed: 0,
    gamesSkippedNoOutcome: 0,
    gamesSkippedNoSeriesFile: 0,
    gamesSkippedNoGameMatch: 0,
    picksWithRole: 0,
    picksWithoutRole: 0,
    bans: 0,
  };

  // Open input/output streams
  const inputStream = fs.createReadStream(INPUT_FILE, 'utf-8');
  const outputStream = fs.createWriteStream(OUTPUT_FILE, 'utf-8');

  const rl = readline.createInterface({
    input: inputStream,
    crlfDelay: Infinity,
  });

  let lineCount = 0;
  let sampleEntry: EnrichedEntry | null = null;

  for await (const line of rl) {
    if (!line.trim()) continue;

    lineCount++;
    if (lineCount % 500 === 0) {
      process.stdout.write(`\rProcessing line ${lineCount}...`);
    }

    try {
      const entry: TimelineEntry = JSON.parse(line);
      const enriched = enrichEntry(entry, stats);

      if (enriched) {
        outputStream.write(JSON.stringify(enriched) + '\n');
        if (!sampleEntry) {
          sampleEntry = enriched;
        }
      }
    } catch (err) {
      // Skip malformed lines
      continue;
    }
  }

  outputStream.end();
  console.log(`\rProcessed ${lineCount} lines.`);
  console.log('');

  // Summary
  console.log('='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Games processed:              ${stats.gamesProcessed}`);
  console.log(`Games skipped (no outcome):   ${stats.gamesSkippedNoOutcome}`);
  console.log(`Games skipped (no series):    ${stats.gamesSkippedNoSeriesFile}`);
  console.log(`Games skipped (no game match):${stats.gamesSkippedNoGameMatch}`);
  console.log(`Pick actions with role:       ${stats.picksWithRole}`);
  console.log(`Pick actions without role:    ${stats.picksWithoutRole}`);
  console.log(`Ban actions:                  ${stats.bans}`);
  console.log('');

  const totalSkipped = stats.gamesSkippedNoOutcome + stats.gamesSkippedNoSeriesFile + stats.gamesSkippedNoGameMatch;
  const successRate = lineCount > 0 ? ((stats.gamesProcessed / lineCount) * 100).toFixed(1) : '0';
  console.log(`Success rate: ${successRate}% (${stats.gamesProcessed}/${lineCount})`);
  console.log('');

  // Sample output
  if (sampleEntry) {
    console.log('='.repeat(60));
    console.log('Sample Enriched Entry');
    console.log('='.repeat(60));
    // Print condensed version
    const sample = {
      ...sampleEntry,
      actions: sampleEntry.actions.slice(0, 5).map(a => ({
        i: a.i,
        slot: a.slot,
        type: a.type,
        championName: a.championName,
        isWinner: a.isWinner,
        role: a.role,
      })),
    };
    console.log(JSON.stringify(sample, null, 2));
    console.log(`  ... (${sampleEntry.actions.length - 5} more actions)`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
