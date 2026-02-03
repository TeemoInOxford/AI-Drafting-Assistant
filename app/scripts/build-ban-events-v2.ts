/**
 * Build Ban Events V2
 *
 * 从 grid_series_data/series_*.json 提取所有 ban 事件到扁平数组
 *
 * 数据源：series_list.json + series_*.json（1488个文件）
 * 不使用旧的 states.json
 *
 * Draft sequence:
 * - 1-6 = early bans (Blue: 1,3,5 | Red: 2,4,6)
 * - 7-12 = picks
 * - 13-16 = late bans (Blue: 13,15 | Red: 14,16)
 * - 17-20 = picks
 */

import fs from 'fs';
import path from 'path';
import { BanEvent, PlayerInfo } from '../lib/threat-types';
import {
  loadAllSeriesData,
  NormalizedDraftAction,
  getPhaseGroup,
  getBanSlot,
  SeriesListEntry,
  ParseResult,
} from '../lib/draft-actions-adapter-v2';

// ============ Constants ============

// LOL Patch version mapping (2024-2025)
const PATCH_TIMELINE: Array<{ start: Date; end: Date; version: string }> = [
  { start: new Date('2024-01-10'), end: new Date('2024-01-23'), version: '14.1' },
  { start: new Date('2024-01-24'), end: new Date('2024-02-06'), version: '14.2' },
  { start: new Date('2024-02-07'), end: new Date('2024-02-20'), version: '14.3' },
  { start: new Date('2024-02-21'), end: new Date('2024-03-05'), version: '14.4' },
  { start: new Date('2024-03-06'), end: new Date('2024-03-19'), version: '14.5' },
  { start: new Date('2024-03-20'), end: new Date('2024-04-02'), version: '14.6' },
  { start: new Date('2024-04-03'), end: new Date('2024-04-16'), version: '14.7' },
  { start: new Date('2024-04-17'), end: new Date('2024-04-30'), version: '14.8' },
  { start: new Date('2024-05-01'), end: new Date('2024-05-14'), version: '14.9' },
  { start: new Date('2024-05-15'), end: new Date('2024-05-28'), version: '14.10' },
  { start: new Date('2024-05-29'), end: new Date('2024-06-11'), version: '14.11' },
  { start: new Date('2024-06-12'), end: new Date('2024-06-25'), version: '14.12' },
  { start: new Date('2024-06-26'), end: new Date('2024-07-16'), version: '14.13' },
  { start: new Date('2024-07-17'), end: new Date('2024-07-30'), version: '14.14' },
  { start: new Date('2024-07-31'), end: new Date('2024-08-13'), version: '14.15' },
  { start: new Date('2024-08-14'), end: new Date('2024-08-27'), version: '14.16' },
  { start: new Date('2024-08-28'), end: new Date('2024-09-10'), version: '14.17' },
  { start: new Date('2024-09-11'), end: new Date('2024-09-24'), version: '14.18' },
  { start: new Date('2024-09-25'), end: new Date('2024-10-08'), version: '14.19' },
  { start: new Date('2024-10-09'), end: new Date('2024-10-22'), version: '14.20' },
  { start: new Date('2024-10-23'), end: new Date('2024-11-05'), version: '14.21' },
  { start: new Date('2024-11-06'), end: new Date('2024-11-19'), version: '14.22' },
  { start: new Date('2024-11-20'), end: new Date('2024-12-10'), version: '14.23' },
  { start: new Date('2024-12-11'), end: new Date('2025-01-07'), version: '14.24' },
  { start: new Date('2025-01-08'), end: new Date('2025-01-21'), version: '15.1' },
  { start: new Date('2025-01-22'), end: new Date('2025-02-04'), version: '15.2' },
  { start: new Date('2025-02-05'), end: new Date('2025-02-18'), version: '15.3' },
  { start: new Date('2025-02-19'), end: new Date('2025-03-04'), version: '15.4' },
  { start: new Date('2025-03-05'), end: new Date('2025-03-18'), version: '15.5' },
  { start: new Date('2025-03-19'), end: new Date('2025-04-01'), version: '15.6' },
  { start: new Date('2025-04-02'), end: new Date('2025-04-15'), version: '15.7' },
  { start: new Date('2025-04-16'), end: new Date('2025-04-29'), version: '15.8' },
  { start: new Date('2025-04-30'), end: new Date('2025-05-13'), version: '15.9' },
  { start: new Date('2025-05-14'), end: new Date('2025-05-27'), version: '15.10' },
  { start: new Date('2025-05-28'), end: new Date('2025-06-10'), version: '15.11' },
  { start: new Date('2025-06-11'), end: new Date('2025-06-24'), version: '15.12' },
  { start: new Date('2025-06-25'), end: new Date('2025-07-15'), version: '15.13' },
  { start: new Date('2025-07-16'), end: new Date('2025-07-29'), version: '15.14' },
  { start: new Date('2025-07-30'), end: new Date('2025-08-12'), version: '15.15' },
  { start: new Date('2025-08-13'), end: new Date('2025-08-26'), version: '15.16' },
  { start: new Date('2025-08-27'), end: new Date('2025-09-09'), version: '15.17' },
  { start: new Date('2025-09-10'), end: new Date('2025-09-30'), version: '15.18' },
];

// Region extraction from tournament names
const REGION_PATTERNS: Array<{ pattern: RegExp; region: string }> = [
  { pattern: /LCK|Korea/i, region: 'LCK' },
  { pattern: /LPL|China/i, region: 'LPL' },
  { pattern: /LEC|Europe/i, region: 'LEC' },
  { pattern: /LCS|North America/i, region: 'LCS' },
  { pattern: /LTA|Latin America/i, region: 'LTA' },
  { pattern: /PCS|Pacific/i, region: 'PCS' },
  { pattern: /VCS|Vietnam/i, region: 'VCS' },
  { pattern: /CBLOL|Brazil/i, region: 'CBLOL' },
  { pattern: /LJL|Japan/i, region: 'LJL' },
  { pattern: /TCL|Turkey/i, region: 'TCL' },
  { pattern: /Worlds|MSI|International/i, region: 'International' },
];

// ============ Helper Functions ============

function getPatchVersion(date: Date): string {
  for (const patch of PATCH_TIMELINE) {
    if (date >= patch.start && date <= patch.end) {
      return patch.version;
    }
  }
  if (date < PATCH_TIMELINE[0].start) return PATCH_TIMELINE[0].version;
  return PATCH_TIMELINE[PATCH_TIMELINE.length - 1].version;
}

function extractRegion(tournamentName: string): string {
  for (const { pattern, region } of REGION_PATTERNS) {
    if (pattern.test(tournamentName)) {
      return region;
    }
  }
  return 'Other';
}

// ============ Types ============

interface RawGameTeam {
  id: string;
  name: string;
  side?: 'blue' | 'red';
  won?: boolean;
  players?: Array<{
    id: string;
    name: string;
    character?: {
      id: string;
      name: string;
    };
  }>;
}

interface RawGame {
  id: string;
  sequenceNumber: number;
  finished?: boolean;
  teams?: RawGameTeam[];
}

interface RawSeries {
  id: string;
  startedAt?: string;
  teams?: Array<{
    id: string;
    name: string;
    players?: Array<{
      id: string;
      name: string;
    }>;
  }>;
  games?: RawGame[];
}

// ============ Main ============

async function main() {
  console.log('=== BUILD BAN EVENTS (V2 - New Data Source) ===\n');

  const gridDataDir = '/www/wwwroot/grid_series_data';
  const outputDir = path.join(process.cwd(), 'data/lol');

  console.log('Loading data from grid_series_data...');

  // 加载 series_list.json 获取元数据
  const seriesListPath = path.join(gridDataDir, 'series_list.json');
  const seriesList: SeriesListEntry[] = JSON.parse(fs.readFileSync(seriesListPath, 'utf-8'));

  // 构建 series 元数据映射
  const seriesMetadata = new Map<string, { tournament: string; startedAt: string | null }>();
  for (const series of seriesList) {
    seriesMetadata.set(series.id, {
      tournament: series.tournament?.name || 'Unknown',
      startedAt: series.startedAt || null,
    });
  }

  console.log(`  Loaded ${seriesList.length} series metadata entries`);

  // 遍历所有 series 文件
  const seriesFiles = fs.readdirSync(gridDataDir).filter(f => f.startsWith('series_') && f.endsWith('.json'));
  console.log(`  Found ${seriesFiles.length} series files`);

  const banEvents: BanEvent[] = [];
  let processedGames = 0;
  let skippedGames = 0;
  let totalActions = 0;
  let totalBans = 0;
  let totalPicks = 0;
  let picksWithPlayer = 0;
  let picksWithoutPlayer = 0;

  const uniqueTeams = new Set<string>();
  const uniquePlayers = new Set<string>();
  const uniqueChampions = new Set<string>();

  for (const file of seriesFiles) {
    const seriesPath = path.join(gridDataDir, file);
    let series: RawSeries;

    try {
      series = JSON.parse(fs.readFileSync(seriesPath, 'utf-8'));
    } catch (error) {
      console.error(`Error parsing ${file}:`, error);
      continue;
    }

    if (!series.games || !series.startedAt) {
      continue;
    }

    const date = new Date(series.startedAt);
    const patch = getPatchVersion(date);
    const metadata = seriesMetadata.get(series.id);
    const tournament = metadata?.tournament || 'Unknown';
    const region = extractRegion(tournament);

    // 获取 series 级别的 team 信息
    const seriesTeams = series.teams || [];

    for (const game of series.games) {
      if (!game.finished || !game.teams) {
        skippedGames++;
        continue;
      }

      processedGames++;

      // 构建 team side map
      const teamSideMap = new Map<string, 'blue' | 'red'>();
      const teamPlayersMap = new Map<string, PlayerInfo[]>();

      for (const team of game.teams) {
        if (team.side) {
          teamSideMap.set(team.id, team.side);
        }
        if (team.players) {
          teamPlayersMap.set(team.id, team.players.map(p => ({
            id: p.id,
            name: p.name,
          })));
        }
        uniqueTeams.add(team.id);
      }

      // 如果 game teams 没有 side 信息，从 draft 顺序推断
      // 读取 draftActions
      const seriesData: RawSeries = JSON.parse(fs.readFileSync(seriesPath, 'utf-8'));
      const gameData = seriesData.games?.find(g => g.id === game.id);
      const draftActions = (gameData as any)?.draftActions || [];

      if (teamSideMap.size < 2 && game.teams.length >= 2) {
        const firstBan = draftActions.find((a: any) => a.type === 'ban' && a.sequenceNumber === '1');
        if (firstBan) {
          const blueTeamId = firstBan.drafter.id;
          const redTeamId = game.teams.find(t => t.id !== blueTeamId)?.id;
          if (blueTeamId) teamSideMap.set(blueTeamId, 'blue');
          if (redTeamId) teamSideMap.set(redTeamId, 'red');
        }
      }

      // 处理 draft actions
      let banSlot = 0;
      for (const action of draftActions) {
        totalActions++;

        if (action.type === 'pick') {
          totalPicks++;
          // 检查 pick 是否能归因到 player
          const champKey = action.draftable.name.toLowerCase();
          const teamPlayers = teamPlayersMap.get(action.drafter.id) || [];
          const gameTeam = game.teams.find(t => t.id === action.drafter.id);
          const gamePlayers = gameTeam?.players || [];

          let found = false;
          for (const player of gamePlayers) {
            if (player.character?.name?.toLowerCase() === champKey) {
              found = true;
              uniquePlayers.add(player.id);
              break;
            }
          }
          if (found) {
            picksWithPlayer++;
          } else {
            picksWithoutPlayer++;
          }
        }

        if (action.type !== 'ban') continue;

        totalBans++;
        const seqNum = parseInt(action.sequenceNumber, 10);
        if (isNaN(seqNum)) continue;

        const isBan = [1, 2, 3, 4, 5, 6, 13, 14, 15, 16].includes(seqNum);
        if (!isBan) continue;

        banSlot++;

        const banTeamId = action.drafter.id;
        const banSide = teamSideMap.get(banTeamId) ||
          ([1, 3, 5, 13, 15].includes(seqNum) ? 'blue' : 'red');

        // Target team 是对手
        const targetTeamId = Array.from(teamSideMap.keys()).find(id => id !== banTeamId) ||
          game.teams.find(t => t.id !== banTeamId)?.id || '';

        const phaseGroup: 'early' | 'late' = [1, 2, 3, 4, 5, 6].includes(seqNum) ? 'early' : 'late';

        const playersOnTargetTeam = teamPlayersMap.get(targetTeamId) || [];
        const playersOnBanTeam = teamPlayersMap.get(banTeamId) || [];

        // 收集 player IDs
        for (const p of playersOnTargetTeam) uniquePlayers.add(p.id);
        for (const p of playersOnBanTeam) uniquePlayers.add(p.id);

        const championName = action.draftable.name;
        const championId = championName;
        uniqueChampions.add(championName);

        banEvents.push({
          gameId: game.id,
          seriesId: series.id,
          patch,
          region,
          tournament,
          banTeamId,
          targetTeamId,
          banSide,
          banSlot,
          phaseGroup,
          championId,
          championName,
          playersOnTargetTeam,
          playersOnBanTeam,
        });
      }
    }
  }

  console.log(`\nProcessed ${processedGames} games, skipped ${skippedGames}`);
  console.log(`Extracted ${banEvents.length} ban events`);

  // Statistics
  const uniquePatches = new Set(banEvents.map(e => e.patch));
  const uniqueRegions = new Set(banEvents.map(e => e.region));

  console.log(`\nStatistics:`);
  console.log(`  Unique champions: ${uniqueChampions.size}`);
  console.log(`  Unique teams: ${uniqueTeams.size}`);
  console.log(`  Unique players: ${uniquePlayers.size}`);
  console.log(`  Patches: ${Array.from(uniquePatches).sort().join(', ')}`);
  console.log(`  Regions: ${Array.from(uniqueRegions).sort().join(', ')}`);

  // Phase distribution
  const earlyBans = banEvents.filter(e => e.phaseGroup === 'early').length;
  const lateBans = banEvents.filter(e => e.phaseGroup === 'late').length;
  console.log(`  Early bans: ${earlyBans} (${(earlyBans / banEvents.length * 100).toFixed(1)}%)`);
  console.log(`  Late bans: ${lateBans} (${(lateBans / banEvents.length * 100).toFixed(1)}%)`);

  // Pick attribution
  const pickAttributionRate = totalPicks > 0 ? (picksWithPlayer / totalPicks * 100).toFixed(1) : '0.0';
  console.log(`\nPick Attribution:`);
  console.log(`  Total picks: ${totalPicks}`);
  console.log(`  Picks with player: ${picksWithPlayer}`);
  console.log(`  Picks without player: ${picksWithoutPlayer}`);
  console.log(`  Attribution rate: ${pickAttributionRate}%`);

  // Save output
  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      dataSource: 'grid_series_data (series_list.json + series_*.json)',
      totalEvents: banEvents.length,
      totalGames: processedGames,
      uniqueChampions: uniqueChampions.size,
      uniqueTeams: uniqueTeams.size,
      uniquePlayers: uniquePlayers.size,
      pickAttributionRate: parseFloat(pickAttributionRate),
    },
    events: banEvents,
  };

  const outputPath = path.join(outputDir, 'ban-events.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\n✓ Saved to ${outputPath}`);

  // Print summary for CLI
  console.log('\n=== SUMMARY ===');
  console.log(`matches: ${processedGames}`);
  console.log(`actions: ${totalActions}`);
  console.log(`bans: ${totalBans}`);
  console.log(`picks: ${totalPicks}`);
  console.log(`pick attribution success %: ${pickAttributionRate}%`);
  console.log(`null player picks: ${picksWithoutPlayer}`);
  console.log(`output files rows: ${banEvents.length}`);

  console.log('\n=== COMPLETE ===\n');
}

main().catch(console.error);
