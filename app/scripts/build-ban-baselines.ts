/**
 * Build Ban Baselines
 *
 * 计算每个上下文的 meta ban 率
 *
 * Context key format: "<patch|GLOBAL>::<region|GLOBAL>"
 * banRate = 该英雄被 ban 的比赛数 / 总比赛数
 */

import fs from 'fs';
import path from 'path';
import { BanEvent, BanBaselines, BanRateStats, makeContextKey, GLOBAL_CONTEXT } from '../lib/threat-types';

interface BanEventsData {
  meta: {
    generatedAt: string;
    totalEvents: number;
    totalGames: number;
    uniqueChampions: number;
    uniqueTeams: number;
  };
  events: BanEvent[];
}

interface GameKey {
  gameId: string;
  context: string;
}

async function main() {
  console.log('=== BUILD BAN BASELINES ===\n');

  const inputPath = path.join(process.cwd(), 'data/lol/ban-events.json');

  if (!fs.existsSync(inputPath)) {
    console.error('Error: ban-events.json not found. Run build-ban-events.ts first.');
    process.exit(1);
  }

  console.log('Loading ban events...');
  const data: BanEventsData = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  const events = data.events;

  console.log(`  Loaded ${events.length} ban events`);

  // Track unique games per context
  // Key: context, Value: Set of gameIds
  const gamesPerContext = new Map<string, Set<string>>();

  // Track bans per champion per context
  // Key: context, Value: Map<championName, Set<gameId>>
  const bansPerChampionPerContext = new Map<string, Map<string, Set<string>>>();

  // Same for early phase only
  const earlyGamesPerContext = new Map<string, Set<string>>();
  const earlyBansPerChampionPerContext = new Map<string, Map<string, Set<string>>>();

  // Process all events
  for (const event of events) {
    // Generate context keys
    const contexts = [
      GLOBAL_CONTEXT,
      makeContextKey(event.patch, undefined),
      makeContextKey(undefined, event.region),
      makeContextKey(event.patch, event.region),
    ];

    for (const context of contexts) {
      // Track game
      if (!gamesPerContext.has(context)) {
        gamesPerContext.set(context, new Set());
      }
      gamesPerContext.get(context)!.add(event.gameId);

      // Track ban
      if (!bansPerChampionPerContext.has(context)) {
        bansPerChampionPerContext.set(context, new Map());
      }
      const champBans = bansPerChampionPerContext.get(context)!;
      if (!champBans.has(event.championName)) {
        champBans.set(event.championName, new Set());
      }
      champBans.get(event.championName)!.add(event.gameId);

      // Early phase tracking
      if (event.phaseGroup === 'early') {
        if (!earlyGamesPerContext.has(context)) {
          earlyGamesPerContext.set(context, new Set());
        }
        earlyGamesPerContext.get(context)!.add(event.gameId);

        if (!earlyBansPerChampionPerContext.has(context)) {
          earlyBansPerChampionPerContext.set(context, new Map());
        }
        const earlyChampBans = earlyBansPerChampionPerContext.get(context)!;
        if (!earlyChampBans.has(event.championName)) {
          earlyChampBans.set(event.championName, new Set());
        }
        earlyChampBans.get(event.championName)!.add(event.gameId);
      }
    }
  }

  console.log(`\nContexts found: ${gamesPerContext.size}`);

  // Build output structure
  const baselines: BanBaselines = {
    global: {},
    early: {},
  };

  // Compute ban rates for all contexts
  for (const [context, gameIds] of gamesPerContext) {
    const totalGames = gameIds.size;
    const champBans = bansPerChampionPerContext.get(context) || new Map();

    baselines.global[context] = {};

    for (const [championName, bannedGameIds] of champBans) {
      const banRate = bannedGameIds.size / totalGames;
      baselines.global[context][championName] = {
        banRate,
        games: totalGames,
      };
    }
  }

  // Compute early-phase ban rates
  for (const [context, gameIds] of earlyGamesPerContext) {
    const totalGames = gameIds.size;
    const champBans = earlyBansPerChampionPerContext.get(context) || new Map();

    baselines.early[context] = {};

    for (const [championName, bannedGameIds] of champBans) {
      const banRate = bannedGameIds.size / totalGames;
      baselines.early[context][championName] = {
        banRate,
        games: totalGames,
      };
    }
  }

  // Statistics
  const globalStats = baselines.global[GLOBAL_CONTEXT] || {};
  const champCount = Object.keys(globalStats).length;
  const totalGames = gamesPerContext.get(GLOBAL_CONTEXT)?.size || 0;

  console.log(`\nGlobal Statistics:`);
  console.log(`  Total games: ${totalGames}`);
  console.log(`  Champions with bans: ${champCount}`);

  // Top banned champions globally
  const sortedChamps = Object.entries(globalStats)
    .sort((a, b) => b[1].banRate - a[1].banRate)
    .slice(0, 10);

  console.log(`\nTop 10 Banned Champions (Global):`);
  for (const [champ, stats] of sortedChamps) {
    console.log(`  ${champ}: ${(stats.banRate * 100).toFixed(1)}%`);
  }

  // Context breakdown
  const patchContexts = Array.from(gamesPerContext.keys())
    .filter(c => c.startsWith('14.') || c.startsWith('15.'))
    .filter(c => c.endsWith('::GLOBAL'));
  const regionContexts = Array.from(gamesPerContext.keys())
    .filter(c => c.startsWith('GLOBAL::') && c !== GLOBAL_CONTEXT);

  console.log(`\nContext Breakdown:`);
  console.log(`  Patch-specific contexts: ${patchContexts.length}`);
  console.log(`  Region-specific contexts: ${regionContexts.length}`);

  // Save output
  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      totalGames,
      totalContexts: gamesPerContext.size,
      championsWithBans: champCount,
    },
    ...baselines,
  };

  const outputPath = path.join(process.cwd(), 'data/lol/ban-baselines.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\n✓ Saved to ${outputPath}`);
  console.log('\n=== COMPLETE ===\n');
}

main().catch(console.error);
