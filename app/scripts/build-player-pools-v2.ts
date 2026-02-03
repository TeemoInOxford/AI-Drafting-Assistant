/**
 * Build Player Champion Pools V2
 *
 * 从 grid_series_data/series_*.json 直接读取数据
 * 不依赖旧的 states.json
 *
 * Generates player-pools.json with:
 * - Pick association (Dirichlet-smoothed)
 * - Win performance (Beta-Binomial conservative)
 * - Ban-against signals (from threat-signals)
 * - Pool strength score (percentile-calibrated)
 */

import * as fs from 'fs';
import * as path from 'path';

// ============ Paths ============

const GRID_DATA_DIR = '/www/wwwroot/grid_series_data';
const DATA_DIR = path.join(process.cwd(), 'data', 'lol');
const BAN_EVENTS_PATH = path.join(DATA_DIR, 'ban-events.json');
const THREAT_SIGNALS_PATH = path.join(DATA_DIR, 'threat-signals.json');
const OUTPUT_PATH = path.join(DATA_DIR, 'player-pools.json');

// ============ Types ============

interface PlayerInfo {
  id: string;
  name: string;
}

interface CharacterInfo {
  id: string;
  name: string;
}

interface GamePlayer {
  id: string;
  name: string;
  character?: CharacterInfo;
  participationStatus?: string;
}

interface GameTeam {
  id: string;
  name: string;
  side?: 'blue' | 'red';
  won?: boolean;
  players?: GamePlayer[];
}

interface Game {
  id: string;
  sequenceNumber: number;
  started?: boolean;
  finished?: boolean;
  teams?: GameTeam[];
}

interface Series {
  id: string;
  started?: boolean;
  finished?: boolean;
  format?: string;
  startedAt?: string;
  teams?: { id: string; name: string; players?: PlayerInfo[] }[];
  games?: Game[];
}

interface BanEvent {
  gameId: string;
  seriesId: string;
  patch: string;
  region: string;
  tournament: string;
  banTeamId: string;
  targetTeamId: string;
  banSide: 'blue' | 'red';
  banSlot: number;
  phaseGroup: 'early' | 'late';
  championId: string;
  championName: string;
  playersOnTargetTeam: PlayerInfo[];
  playersOnBanTeam: PlayerInfo[];
}

interface ThreatSignal {
  championId: string;
  championName: string;
  observed: number;
  expected: number;
  score: number;
  gamesPlayed: number;
  banCount: number;
}

// ============ Output Types ============

interface ChampionPoolEntry {
  championId: string;
  championName: string;
  gamesPlayed: number;
  pickCount: number;
  pickRateWithinPlayer: number;
  pickRateLowerBound: number;
  wins: number;
  winRate: number;
  winRateLowerBound: number;
  winRateUncertainty: number;
  banAgainstCount: number;
  banAgainstRate: number;
  banAgainstLowerBound: number;
  poolStrengthScore: number;
  notes: string[];
}

interface PlayerPool {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  totalGames: number;
  totalPicks: number;
  uniqueChampions: number;
  champions: ChampionPoolEntry[];
}

interface PlayerPoolsMeta {
  generatedAt: string;
  dataSource: string;
  totalPlayers: number;
  totalGames: number;
  dirichletAlpha: number;
  betaPriorStrength: number;
  globalWinRate: number;
  scoreP50: number;
  scoreP75: number;
  scoreP90: number;
  scoreP95: number;
  scoreP99: number;
}

interface PlayerPoolsData {
  meta: PlayerPoolsMeta;
  players: Record<string, PlayerPool>;
}

// ============ Statistical Functions ============

function betaQuantile(alpha: number, beta: number, p: number): number {
  const mean = alpha / (alpha + beta);
  const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
  const std = Math.sqrt(variance);
  const z = normalQuantile(p);
  let result = mean + z * std;
  return Math.max(0, Math.min(1, result));
}

function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0,
    -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1,
    2.445134137142996e0, 3.754408661907416e0,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    const r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
}

function computeWinRateLowerBound(
  wins: number,
  games: number,
  priorStrength: number,
  priorMean: number,
  credibleLevel: number = 0.1
): { mean: number; lowerBound: number; uncertainty: number } {
  const alpha0 = priorStrength * priorMean;
  const beta0 = priorStrength * (1 - priorMean);
  const alpha = alpha0 + wins;
  const beta = beta0 + (games - wins);
  const mean = alpha / (alpha + beta);
  const lowerBound = betaQuantile(alpha, beta, credibleLevel);
  const upper = betaQuantile(alpha, beta, 0.9);
  const lower = betaQuantile(alpha, beta, 0.1);
  const uncertainty = upper - lower;
  return { mean, lowerBound, uncertainty };
}

function computePickRateLowerBound(
  pickCount: number,
  totalPicks: number,
  numChampions: number,
  alpha: number = 1,
  credibleLevel: number = 0.1
): { mean: number; lowerBound: number } {
  const posteriorAlpha = alpha + pickCount;
  const posteriorBeta = alpha * (numChampions - 1) + (totalPicks - pickCount);
  const mean = posteriorAlpha / (posteriorAlpha + posteriorBeta);
  const lowerBound = betaQuantile(posteriorAlpha, posteriorBeta, credibleLevel);
  return { mean, lowerBound };
}

function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;
  const index = (p / 100) * (sortedArr.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedArr[lower];
  return sortedArr[lower] * (upper - index) + sortedArr[upper] * (index - lower);
}

// ============ Main Build Logic ============

async function buildPlayerPools(): Promise<void> {
  console.log('=== Building Player Champion Pools (V2 - New Data Source) ===\n');

  // Load ban events
  console.log('Loading ban events...');
  const banEventsData = JSON.parse(fs.readFileSync(BAN_EVENTS_PATH, 'utf-8'));
  const banEvents: BanEvent[] = banEventsData.events;
  console.log(`  Loaded ${banEvents.length} ban events`);

  // Load series files directly from grid_series_data
  console.log('\nLoading series data from grid_series_data...');
  const seriesFiles = fs.readdirSync(GRID_DATA_DIR).filter(f => f.startsWith('series_') && f.endsWith('.json'));
  console.log(`  Found ${seriesFiles.length} series files`);

  // ============ Step 1: Extract player pick data ============
  console.log('\nStep 1: Extracting player pick data...');

  interface PlayerPickData {
    playerId: string;
    playerName: string;
    teamId: string;
    teamName: string;
    picks: Array<{
      championName: string;
      won: boolean;
      gameId: string;
    }>;
  }

  const playerData = new Map<string, PlayerPickData>();
  let totalGames = 0;

  for (const file of seriesFiles) {
    const seriesPath = path.join(GRID_DATA_DIR, file);
    let series: Series;

    try {
      series = JSON.parse(fs.readFileSync(seriesPath, 'utf-8'));
    } catch (error) {
      continue;
    }

    if (!series.finished || !series.games) continue;

    for (const game of series.games) {
      if (!game.finished || !game.teams) continue;
      totalGames++;

      for (const team of game.teams) {
        if (!team.players) continue;

        for (const player of team.players) {
          if (!player.character || !player.character.name) continue;

          const playerId = player.id;
          const championName = player.character.name;

          if (!playerData.has(playerId)) {
            // Find team info from series
            const seriesTeam = series.teams?.find(t => t.players?.some(p => p.id === playerId));
            playerData.set(playerId, {
              playerId,
              playerName: player.name,
              teamId: seriesTeam?.id || team.id,
              teamName: seriesTeam?.name || team.name,
              picks: [],
            });
          }

          const data = playerData.get(playerId)!;
          data.picks.push({
            championName,
            won: team.won || false,
            gameId: game.id,
          });
        }
      }
    }
  }

  console.log(`  Found ${playerData.size} unique players`);
  console.log(`  Total games: ${totalGames}`);

  // ============ Step 2: Build ban-against index ============
  console.log('\nStep 2: Building ban-against index...');

  const banAgainstIndex = new Map<string, Map<string, { banCount: number; gamesInDataset: number }>>();
  const playerGameCounts = new Map<string, number>();

  for (const [playerId, data] of playerData) {
    playerGameCounts.set(playerId, data.picks.length);
  }

  for (const event of banEvents) {
    for (const player of event.playersOnTargetTeam) {
      if (!banAgainstIndex.has(player.id)) {
        banAgainstIndex.set(player.id, new Map());
      }
      const playerBans = banAgainstIndex.get(player.id)!;

      if (!playerBans.has(event.championName)) {
        playerBans.set(event.championName, {
          banCount: 0,
          gamesInDataset: playerGameCounts.get(player.id) || 0,
        });
      }
      playerBans.get(event.championName)!.banCount++;
    }
  }

  console.log(`  Built ban-against index for ${banAgainstIndex.size} players`);

  // ============ Step 3: Compute pool entries ============
  console.log('\nStep 3: Computing pool entries...');

  const DIRICHLET_ALPHA = 1;
  const BETA_PRIOR_STRENGTH = 10;
  const GLOBAL_WIN_RATE = 0.5;
  const CREDIBLE_LEVEL = 0.1;

  const playerPools = new Map<string, PlayerPool>();
  const allScores: number[] = [];

  for (const [playerId, data] of playerData) {
    const championStats = new Map<string, { picks: number; wins: number }>();

    for (const pick of data.picks) {
      if (!championStats.has(pick.championName)) {
        championStats.set(pick.championName, { picks: 0, wins: 0 });
      }
      const stats = championStats.get(pick.championName)!;
      stats.picks++;
      if (pick.won) stats.wins++;
    }

    const totalPicks = data.picks.length;
    const numChampions = championStats.size;

    if (totalPicks < 3) continue;

    const champions: ChampionPoolEntry[] = [];

    for (const [championName, stats] of championStats) {
      const pickRate = computePickRateLowerBound(
        stats.picks, totalPicks, numChampions, DIRICHLET_ALPHA, CREDIBLE_LEVEL
      );

      const winRate = computeWinRateLowerBound(
        stats.wins, stats.picks, BETA_PRIOR_STRENGTH, GLOBAL_WIN_RATE, CREDIBLE_LEVEL
      );

      const banData = banAgainstIndex.get(playerId)?.get(championName);
      const banAgainstCount = banData?.banCount || 0;
      const banAgainstGames = banData?.gamesInDataset || totalPicks;
      const banAgainstRate = banAgainstGames > 0 ? banAgainstCount / banAgainstGames : 0;

      const banAgainstBeta = computeWinRateLowerBound(
        banAgainstCount, banAgainstGames, 5, 0.1, CREDIBLE_LEVEL
      );

      const notes: string[] = [];
      if (stats.picks >= 10) {
        notes.push(`Played ${stats.picks} games on ${championName}`);
      }
      if (pickRate.mean > 0.2) {
        notes.push(`High pick share (${(pickRate.mean * 100).toFixed(1)}%)`);
      }
      if (winRate.lowerBound > 0.55 && stats.picks >= 5) {
        notes.push(`Strong win performance (${(winRate.lowerBound * 100).toFixed(1)}%+ conservative)`);
      }
      if (banAgainstCount >= 3) {
        notes.push(`Banned against ${banAgainstCount} times`);
      }

      const pickComponent = Math.log(1 + stats.picks) / Math.log(1 + totalPicks);
      const winExcess = Math.max(0, winRate.lowerBound - GLOBAL_WIN_RATE);
      const winComponent = winExcess * 2;
      const banComponent = banAgainstBeta.lowerBound;
      const sampleConfidence = Math.min(1, Math.sqrt(stats.picks / 20));

      const rawScore = sampleConfidence * (
        pickComponent * 0.5 + winComponent * 0.3 + banComponent * 0.2
      );

      champions.push({
        championId: championName,
        championName,
        gamesPlayed: totalPicks,
        pickCount: stats.picks,
        pickRateWithinPlayer: pickRate.mean,
        pickRateLowerBound: pickRate.lowerBound,
        wins: stats.wins,
        winRate: winRate.mean,
        winRateLowerBound: winRate.lowerBound,
        winRateUncertainty: winRate.uncertainty,
        banAgainstCount,
        banAgainstRate,
        banAgainstLowerBound: banAgainstBeta.lowerBound,
        poolStrengthScore: rawScore,
        notes,
      });

      allScores.push(rawScore);
    }

    champions.sort((a, b) => b.poolStrengthScore - a.poolStrengthScore);

    playerPools.set(playerId, {
      playerId,
      playerName: data.playerName,
      teamId: data.teamId,
      teamName: data.teamName,
      totalGames: totalPicks,
      totalPicks,
      uniqueChampions: numChampions,
      champions,
    });
  }

  console.log(`  Computed pools for ${playerPools.size} players`);
  console.log(`  Total champion entries: ${allScores.length}`);

  // ============ Step 4: Percentile calibration ============
  console.log('\nStep 4: Calibrating pool strength scores...');

  const nonZeroScores = allScores.filter(s => s > 0);
  const sortedScores = [...nonZeroScores].sort((a, b) => a - b);

  const p50 = percentile(sortedScores, 50);
  const p75 = percentile(sortedScores, 75);
  const p90 = percentile(sortedScores, 90);
  const p95 = percentile(sortedScores, 95);
  const p99 = percentile(sortedScores, 99);

  console.log(`  Raw score percentiles (non-zero only, n=${sortedScores.length}):`);
  console.log(`    P50: ${p50.toFixed(4)}`);
  console.log(`    P75: ${p75.toFixed(4)}`);
  console.log(`    P90: ${p90.toFixed(4)}`);
  console.log(`    P95: ${p95.toFixed(4)}`);
  console.log(`    P99: ${p99.toFixed(4)}`);

  function calibrateScore(rawScore: number): number {
    if (rawScore <= 0) return 0;
    const kExp = Math.log(10) / (p90 || 0.1);
    const score = 100 * (1 - Math.exp(-kExp * rawScore));
    return Math.min(100, Math.max(0, score));
  }

  for (const pool of playerPools.values()) {
    for (const champ of pool.champions) {
      champ.poolStrengthScore = calibrateScore(champ.poolStrengthScore);
    }
    pool.champions.sort((a, b) => b.poolStrengthScore - a.poolStrengthScore);
  }

  const calibratedScores: number[] = [];
  for (const pool of playerPools.values()) {
    for (const champ of pool.champions) {
      calibratedScores.push(champ.poolStrengthScore);
    }
  }
  calibratedScores.sort((a, b) => a - b);

  const calP50 = percentile(calibratedScores, 50);
  const calP75 = percentile(calibratedScores, 75);
  const calP90 = percentile(calibratedScores, 90);
  const calP95 = percentile(calibratedScores, 95);
  const calP99 = percentile(calibratedScores, 99);

  console.log(`  Calibrated score percentiles:`);
  console.log(`    P50: ${calP50.toFixed(1)}`);
  console.log(`    P75: ${calP75.toFixed(1)}`);
  console.log(`    P90: ${calP90.toFixed(1)}`);
  console.log(`    P95: ${calP95.toFixed(1)}`);
  console.log(`    P99: ${calP99.toFixed(1)}`);

  // ============ Step 5: Build output ============
  console.log('\nStep 5: Building output...');

  const output: PlayerPoolsData = {
    meta: {
      generatedAt: new Date().toISOString(),
      dataSource: 'grid_series_data (series_*.json)',
      totalPlayers: playerPools.size,
      totalGames,
      dirichletAlpha: DIRICHLET_ALPHA,
      betaPriorStrength: BETA_PRIOR_STRENGTH,
      globalWinRate: GLOBAL_WIN_RATE,
      scoreP50: calP50,
      scoreP75: calP75,
      scoreP90: calP90,
      scoreP95: calP95,
      scoreP99: calP99,
    },
    players: Object.fromEntries(playerPools),
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nOutput written to: ${OUTPUT_PATH}`);

  // ============ Summary ============
  console.log('\n=== Summary ===');
  console.log(`Total players: ${playerPools.size}`);
  console.log(`Total games: ${totalGames}`);
  console.log(`Total champion entries: ${calibratedScores.length}`);

  const topByDiversity = [...playerPools.values()]
    .sort((a, b) => b.uniqueChampions - a.uniqueChampions)
    .slice(0, 5);

  console.log('\nTop 5 players by champion diversity:');
  for (const pool of topByDiversity) {
    console.log(`  ${pool.playerName} (${pool.teamName}): ${pool.uniqueChampions} champions, ${pool.totalGames} games`);
  }

  const highScoreEntries: Array<{ player: string; champion: string; score: number; picks: number }> = [];
  for (const pool of playerPools.values()) {
    for (const champ of pool.champions) {
      if (champ.poolStrengthScore >= 95) {
        highScoreEntries.push({
          player: pool.playerName,
          champion: champ.championName,
          score: champ.poolStrengthScore,
          picks: champ.pickCount,
        });
      }
    }
  }
  highScoreEntries.sort((a, b) => b.score - a.score);

  console.log(`\nTop 10 high-score entries (score >= 95):`);
  for (const entry of highScoreEntries.slice(0, 10)) {
    console.log(`  ${entry.player} - ${entry.champion}: ${entry.score.toFixed(1)} (${entry.picks} picks)`);
  }
}

buildPlayerPools().catch(console.error);
