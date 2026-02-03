/**
 * Step 1: New Structure Adaptation - Migration Report Generator
 *
 * Generates a Before vs After comparison report for the data structure migration.
 * This script:
 * 1. Parses all games using the new draft-actions-adapter
 * 2. Compares with existing output files
 * 3. Generates a detailed markdown report
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  parseAllGames,
  parseDraftActions,
  StandardizedDraftAction,
  RawGame,
} from '../lib/draft-actions-adapter';

// ============ Paths ============

const DATA_DIR = path.join(process.cwd(), 'data', 'lol');
const STATES_PATH = path.join(DATA_DIR, 'states.json');
const SERIES_PATH = path.join(DATA_DIR, 'series.json');
const HIERARCHY_PATH = path.join(DATA_DIR, 'hierarchy.json');
const BAN_EVENTS_PATH = path.join(DATA_DIR, 'ban-events.json');
const BAN_BASELINES_PATH = path.join(DATA_DIR, 'ban-baselines.json');
const THREAT_SIGNALS_PATH = path.join(DATA_DIR, 'threat-signals.json');
const PLAYER_POOLS_PATH = path.join(DATA_DIR, 'player-pools.json');

const REPORT_DIR = path.join(process.cwd(), 'app', 'docs', 'migration');
const REPORT_PATH = path.join(REPORT_DIR, 'step-1-new-structure-adaptation.md');

// ============ Types ============

interface Series {
  id: string;
  games?: RawGame[];
  teams?: Array<{
    id: string;
    name: string;
    players?: Array<{ id: string; name: string }>;
  }>;
}

interface ReportData {
  // Data scale
  matchesCount: number;
  totalDraftActions: number;
  bansCount: number;
  picksCount: number;
  uniqueTeams: number;
  uniquePlayers: number;

  // Consistency checks
  gamesWithExactly20Actions: number;
  gamesWithNon20Actions: number;
  non20ActionGameIds: string[];
  sequenceValid: boolean;
  pickAttributionSuccessRate: number;
  pickAttributionFailures: number;
  unmatchedChampions: Array<{ name: string; count: number }>;
  teamsWithComplete5Players: number;
  teamsWithIncomplete5Players: number;

  // Existing file stats
  existingBanEvents: {
    count: number;
    uniqueTeamChampion: number;
  };
  existingBanBaselines: {
    contextCount: number;
  };
  existingThreatSignals: {
    teamSignals: number;
    playerSignals: number;
  };
  existingPlayerPools: {
    players: number;
    entries: number;
  };
}

// ============ Main ============

async function generateMigrationReport(): Promise<void> {
  console.log('=== Step 1: New Structure Adaptation - Migration Report ===\n');

  // Ensure report directory exists
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }

  // Load data
  console.log('Loading data...');
  const states: Record<string, Series> = JSON.parse(fs.readFileSync(STATES_PATH, 'utf-8'));
  const seriesList = JSON.parse(fs.readFileSync(SERIES_PATH, 'utf-8'));
  const hierarchy = JSON.parse(fs.readFileSync(HIERARCHY_PATH, 'utf-8'));

  console.log(`  Loaded ${Object.keys(states).length} series from states.json`);

  // Parse all games with new adapter
  console.log('\nParsing all games with draft-actions-adapter...');
  const { allActions, summary } = parseAllGames(states);

  console.log(`  Total series: ${summary.totalSeries}`);
  console.log(`  Total games: ${summary.totalGames}`);
  console.log(`  Valid games (20 actions): ${summary.validGames}`);
  console.log(`  Invalid games: ${summary.invalidGames}`);

  // Collect unique teams and players
  const uniqueTeams = new Set<string>();
  const uniquePlayers = new Set<string>();

  for (const seriesId in states) {
    const series = states[seriesId];
    if (series.teams) {
      for (const team of series.teams) {
        uniqueTeams.add(team.id);
        if (team.players) {
          for (const player of team.players) {
            uniquePlayers.add(player.id);
          }
        }
      }
    }
    if (series.games) {
      for (const game of series.games) {
        if (game.teams) {
          for (const team of game.teams) {
            uniqueTeams.add(team.id);
            if (team.players) {
              for (const player of team.players) {
                uniquePlayers.add(player.id);
              }
            }
          }
        }
      }
    }
  }

  // Check team player completeness (5 players per team per game)
  let teamsWithComplete5 = 0;
  let teamsWithIncomplete5 = 0;

  for (const seriesId in states) {
    const series = states[seriesId];
    if (!series.games) continue;
    for (const game of series.games) {
      if (!game.teams) continue;
      for (const team of game.teams) {
        const playersWithCharacter = (team.players || []).filter(p => p.character?.name).length;
        if (playersWithCharacter === 5) {
          teamsWithComplete5++;
        } else {
          teamsWithIncomplete5++;
        }
      }
    }
  }

  // Load existing output files for comparison
  console.log('\nLoading existing output files...');

  let existingBanEvents = { count: 0, uniqueTeamChampion: 0 };
  if (fs.existsSync(BAN_EVENTS_PATH)) {
    const banEventsData = JSON.parse(fs.readFileSync(BAN_EVENTS_PATH, 'utf-8'));
    existingBanEvents.count = banEventsData.events?.length || 0;
    const teamChampPairs = new Set<string>();
    for (const event of (banEventsData.events || [])) {
      teamChampPairs.add(`${event.banTeamId}::${event.championName}`);
    }
    existingBanEvents.uniqueTeamChampion = teamChampPairs.size;
    console.log(`  ban-events.json: ${existingBanEvents.count} events`);
  }

  let existingBanBaselines = { contextCount: 0 };
  if (fs.existsSync(BAN_BASELINES_PATH)) {
    const baselinesData = JSON.parse(fs.readFileSync(BAN_BASELINES_PATH, 'utf-8'));
    existingBanBaselines.contextCount = Object.keys(baselinesData.global || {}).length;
    console.log(`  ban-baselines.json: ${existingBanBaselines.contextCount} contexts`);
  }

  let existingThreatSignals = { teamSignals: 0, playerSignals: 0 };
  if (fs.existsSync(THREAT_SIGNALS_PATH)) {
    const threatData = JSON.parse(fs.readFileSync(THREAT_SIGNALS_PATH, 'utf-8'));
    // Count team signals
    for (const context in (threatData.team || {})) {
      for (const teamId in threatData.team[context]) {
        existingThreatSignals.teamSignals += Object.keys(threatData.team[context][teamId]).length;
      }
    }
    // Count player signals
    for (const context in (threatData.player || {})) {
      for (const playerId in threatData.player[context]) {
        existingThreatSignals.playerSignals += Object.keys(threatData.player[context][playerId]).length;
      }
    }
    console.log(`  threat-signals.json: ${existingThreatSignals.teamSignals} team, ${existingThreatSignals.playerSignals} player`);
  }

  let existingPlayerPools = { players: 0, entries: 0 };
  if (fs.existsSync(PLAYER_POOLS_PATH)) {
    const poolsData = JSON.parse(fs.readFileSync(PLAYER_POOLS_PATH, 'utf-8'));
    existingPlayerPools.players = Object.keys(poolsData.players || {}).length;
    for (const playerId in (poolsData.players || {})) {
      existingPlayerPools.entries += (poolsData.players[playerId].champions || []).length;
    }
    console.log(`  player-pools.json: ${existingPlayerPools.players} players, ${existingPlayerPools.entries} entries`);
  }

  // Prepare report data
  const reportData: ReportData = {
    matchesCount: summary.totalGames,
    totalDraftActions: summary.totalBans + summary.totalPicks,
    bansCount: summary.totalBans,
    picksCount: summary.totalPicks,
    uniqueTeams: uniqueTeams.size,
    uniquePlayers: uniquePlayers.size,

    gamesWithExactly20Actions: summary.validGames,
    gamesWithNon20Actions: summary.invalidGames,
    non20ActionGameIds: summary.invalidGameIds.slice(0, 20),
    sequenceValid: summary.invalidGames === 0,
    pickAttributionSuccessRate: summary.picksWithPlayer / (summary.picksWithPlayer + summary.picksWithoutPlayer) * 100,
    pickAttributionFailures: summary.picksWithoutPlayer,
    unmatchedChampions: Array.from(summary.unmatchedChampions.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    teamsWithComplete5Players: teamsWithComplete5,
    teamsWithIncomplete5Players: teamsWithIncomplete5,

    existingBanEvents,
    existingBanBaselines,
    existingThreatSignals,
    existingPlayerPools,
  };

  // Generate markdown report
  console.log('\nGenerating report...');
  const report = generateMarkdownReport(reportData);

  fs.writeFileSync(REPORT_PATH, report);
  console.log(`\n✓ Report saved to: ${REPORT_PATH}`);

  // Print summary to console
  printConsoleSummary(reportData);
}

function generateMarkdownReport(data: ReportData): string {
  const now = new Date().toISOString();

  return `# Step 1: New Structure Adaptation - Before vs After Report

Generated: ${now}

## Overview

This report documents the migration to the new data structure using the unified \`draft-actions-adapter.ts\` parser.

---

## 1. Data Scale Comparison

| Metric | Value |
|--------|-------|
| Total Matches (Games) | ${data.matchesCount.toLocaleString()} |
| Total Draft Actions | ${data.totalDraftActions.toLocaleString()} |
| Bans | ${data.bansCount.toLocaleString()} |
| Picks | ${data.picksCount.toLocaleString()} |
| Unique Teams | ${data.uniqueTeams.toLocaleString()} |
| Unique Players | ${data.uniquePlayers.toLocaleString()} |

### Expected Values
- Draft Actions per Game: ${(data.totalDraftActions / data.matchesCount).toFixed(2)} (expected: 20.00)
- Bans per Game: ${(data.bansCount / data.matchesCount).toFixed(2)} (expected: 10.00)
- Picks per Game: ${(data.picksCount / data.matchesCount).toFixed(2)} (expected: 10.00)

---

## 2. Key Consistency Checks

### 2.1 Draft Action Count Validation

| Check | Result |
|-------|--------|
| Games with exactly 20 actions | ${data.gamesWithExactly20Actions.toLocaleString()} ✅ |
| Games with ≠20 actions | ${data.gamesWithNon20Actions.toLocaleString()} ${data.gamesWithNon20Actions === 0 ? '✅' : '⚠️'} |
| Sequence validation | ${data.sequenceValid ? 'PASS ✅' : 'FAIL ⚠️'} |

${data.gamesWithNon20Actions > 0 ? `
**Anomalous Game IDs (top 20):**
\`\`\`
${data.non20ActionGameIds.join('\n')}
\`\`\`
` : ''}

### 2.2 Pick Attribution to Players

| Metric | Value |
|--------|-------|
| Picks successfully attributed to player | ${(data.pickAttributionSuccessRate).toFixed(2)}% |
| Picks without player attribution | ${data.pickAttributionFailures.toLocaleString()} |

${data.unmatchedChampions.length > 0 ? `
**Top Unmatched Champions:**
| Champion | Count |
|----------|-------|
${data.unmatchedChampions.map(c => `| ${c.name} | ${c.count} |`).join('\n')}
` : '**All picks successfully attributed to players ✅**'}

### 2.3 Team Player Completeness

| Metric | Value |
|--------|-------|
| Teams with 5 players (complete) | ${data.teamsWithComplete5Players.toLocaleString()} |
| Teams with <5 players (incomplete) | ${data.teamsWithIncomplete5Players.toLocaleString()} |
| Completeness Rate | ${(data.teamsWithComplete5Players / (data.teamsWithComplete5Players + data.teamsWithIncomplete5Players) * 100).toFixed(2)}% |

---

## 3. Output File Comparison

### 3.1 ban-events.json

| Metric | Current Value |
|--------|---------------|
| Total Events | ${data.existingBanEvents.count.toLocaleString()} |
| Unique (teamId, championName) pairs | ${data.existingBanEvents.uniqueTeamChampion.toLocaleString()} |

**Expected after rebuild:** ${data.bansCount.toLocaleString()} events (should match current)

### 3.2 ban-baselines.json

| Metric | Current Value |
|--------|---------------|
| Context Count | ${data.existingBanBaselines.contextCount} |

**Note:** Contexts are combinations of patch and region. Count depends on data coverage.

### 3.3 threat-signals.json

| Metric | Current Value |
|--------|---------------|
| Team Signals | ${data.existingThreatSignals.teamSignals.toLocaleString()} |
| Player Signals | ${data.existingThreatSignals.playerSignals.toLocaleString()} |

**Why signal counts are large:**
- Team signals = (teams × champions banned against them × contexts)
- Player signals = (players × champions banned against them × contexts)
- Each context (GLOBAL, patch-specific, region-specific, patch+region) multiplies the count

### 3.4 player-pools.json

| Metric | Current Value |
|--------|---------------|
| Players | ${data.existingPlayerPools.players.toLocaleString()} |
| (Player, Champion) Entries | ${data.existingPlayerPools.entries.toLocaleString()} |

**Note:** Entries = sum of unique champions played by each player.

---

## 4. Side Inference Logic

When \`team.side\` is not provided in the data, the adapter infers side from the draft sequence:

| Sequence | Side | Action Type |
|----------|------|-------------|
| 1, 3, 5 | Blue | Early Ban |
| 2, 4, 6 | Red | Early Ban |
| 7, 9, 10 | Blue | First Pick |
| 8, 11, 12 | Red | First Pick |
| 13, 15 | Blue | Late Ban |
| 14, 16 | Red | Late Ban |
| 17, 20 | Blue | Final Pick |
| 18, 19 | Red | Final Pick |

This follows the standard League of Legends draft order.

---

## 5. Pick Attribution Logic

For each pick action:
1. Get the champion name from \`draftAction.draftable.name\`
2. Find the player on the drafting team whose \`character.name\` matches
3. If match found: \`playerId\` = player's ID
4. If no match: \`playerId\` = null (counted as attribution failure)

**Ban actions always have \`playerId = null\`** - we do not speculate which player a ban was "targeting".

---

## 6. Validation Summary

| Check | Status |
|-------|--------|
| All games have 20 draft actions | ${data.gamesWithNon20Actions === 0 ? '✅ PASS' : '⚠️ FAIL'} |
| Sequence numbers 1-20 without gaps | ${data.sequenceValid ? '✅ PASS' : '⚠️ FAIL'} |
| Pick attribution rate > 95% | ${data.pickAttributionSuccessRate > 95 ? '✅ PASS' : '⚠️ FAIL'} |
| Team completeness rate > 95% | ${(data.teamsWithComplete5Players / (data.teamsWithComplete5Players + data.teamsWithIncomplete5Players) * 100) > 95 ? '✅ PASS' : '⚠️ FAIL'} |

---

## 7. Next Steps

After this report validates the new structure:
1. Run \`npm run build:ban-events\` to rebuild ban-events.json
2. Run \`npm run build:ban-baselines\` to rebuild ban-baselines.json
3. Run \`npm run build:threat-signals\` to rebuild threat-signals.json
4. Run \`npm run build:player-pools\` to rebuild player-pools.json

Or run all at once: \`npm run build:all\`
`;
}

function printConsoleSummary(data: ReportData): void {
  console.log('\n' + '='.repeat(60));
  console.log('MIGRATION REPORT SUMMARY');
  console.log('='.repeat(60));
  console.log(`
📊 Data Scale:
   - Matches: ${data.matchesCount.toLocaleString()}
   - Draft Actions: ${data.totalDraftActions.toLocaleString()} (${data.bansCount} bans + ${data.picksCount} picks)
   - Teams: ${data.uniqueTeams}
   - Players: ${data.uniquePlayers}

✅ Consistency Checks:
   - Games with 20 actions: ${data.gamesWithExactly20Actions} / ${data.matchesCount} (${(data.gamesWithExactly20Actions / data.matchesCount * 100).toFixed(1)}%)
   - Pick attribution rate: ${data.pickAttributionSuccessRate.toFixed(1)}%
   - Team completeness: ${(data.teamsWithComplete5Players / (data.teamsWithComplete5Players + data.teamsWithIncomplete5Players) * 100).toFixed(1)}%

📁 Existing Output Files:
   - ban-events.json: ${data.existingBanEvents.count} events
   - ban-baselines.json: ${data.existingBanBaselines.contextCount} contexts
   - threat-signals.json: ${data.existingThreatSignals.teamSignals} team + ${data.existingThreatSignals.playerSignals} player signals
   - player-pools.json: ${data.existingPlayerPools.players} players, ${data.existingPlayerPools.entries} entries
`);
  console.log('='.repeat(60));
}

// Run
generateMigrationReport().catch(console.error);
