/**
 * Step 4.2 + 4.3 — Evidence Threshold Calibration Script
 *
 * This script calibrates evidence strength thresholds from actual data distributions.
 * It reads:
 * - bayesian-role-posteriors.json for FLEX_ENTROPY calibration
 * - player-pools.json for PLAYER_SPECIALTY calibration
 * - champion-position-stats.json for coverage disclosure
 *
 * Output:
 * - Coverage disclosure (Part A)
 * - Entropy sanity report with top/bottom 20 champions (Part B)
 * - Player specialty low-sample analysis (Part C)
 * - Percentile distributions
 * - Recommended thresholds
 * - Calibration metadata for evidence-thresholds.json
 *
 * Usage: npx tsx app/scripts/calibrate-evidence-thresholds.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ============ Types ============

interface RolePosterior {
  posterior: {
    top: number;
    jungle: number;
    mid: number;
    bot: number;
    support: number;
  };
  observedMatches: number;
  alpha: number;
}

interface PlayerPoolChampion {
  championId: string;
  championName: string;
  gamesPlayed: number;
  pickCount: number;
  pickRateWithinPlayer: number;
  pickRateLowerBound: number;
  wins: number;
  winRate: number;
  poolStrengthScore: number;
}

interface PlayerPoolEntry {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  totalGames: number;
  totalPicks: number;
  uniqueChampions: number;
  champions: PlayerPoolChampion[];
}

interface PlayerPoolsData {
  meta: {
    generatedAt: string;
    totalPlayers: number;
    totalGames: number;
  };
  players: Record<string, PlayerPoolEntry>;
}

interface CalibrationResult {
  meta: {
    calibrationDate: string;
    dataSource: string;
    description: string;
  };
  coverage: {
    championsWithPosterior: number;
    championsWithProGames: number;
    championsUsedForEntropyCalibration: number;
    totalPlayersInPool: number;
    lowSamplePlayerCount: number;
    lowSampleThreshold: number;
  };
  ROLE_FLEX_PRESSURE: {
    entropyThreshold: number;
    percentileUsed: string;
    distribution: {
      p50: number;
      p75: number;
      p85: number;
      p90: number;
      p95: number;
    };
    sampleSize: number;
    strongFlexPercent: number;
    examplesNearThreshold: Array<{ champion: string; entropy: number }>;
    top20HighEntropy: Array<{ champion: string; entropy: number; topRoles: string }>;
    bottom20LowEntropy: Array<{ champion: string; entropy: number; topRoles: string }>;
  };
  PLAYER_SPECIALTY: {
    strongPickCount: number;
    strongPickShare: number;
    moderatePickCount: number;
    lowSampleThreshold: number;
    percentileUsed: {
      strongPickCount: string;
      strongPickShare: string;
      moderatePickCount: string;
    };
    distribution: {
      pickCount: { p50: number; p75: number; p85: number; p90: number; p95: number };
      pickShare: { p50: number; p75: number; p85: number; p90: number; p95: number };
      playerGames: { p10: number; p25: number; p50: number; p75: number; p90: number };
    };
    sampleSize: number;
    strongSpecialtyPercent: number;
    moderateSpecialtyPercent: number;
    lowSamplePlayerPercent: number;
  };
}

// ============ Entropy Calculation ============

/**
 * Calculate normalized Shannon entropy from role posterior
 * H_norm = H / ln(5), range [0, 1]
 */
function calculateNormalizedEntropy(posterior: RolePosterior['posterior']): number {
  const probabilities = [
    posterior.top,
    posterior.jungle,
    posterior.mid,
    posterior.bot,
    posterior.support,
  ];

  let entropy = 0;
  for (const p of probabilities) {
    if (p > 0) {
      entropy -= p * Math.log(p);
    }
  }

  const maxEntropy = Math.log(5); // ln(5) for 5 roles
  return entropy / maxEntropy;
}

/**
 * Get top 2 roles with percentages for display
 */
function getTopRolesString(posterior: RolePosterior['posterior']): string {
  const roles = [
    { role: 'top', prob: posterior.top },
    { role: 'jg', prob: posterior.jungle },
    { role: 'mid', prob: posterior.mid },
    { role: 'bot', prob: posterior.bot },
    { role: 'sup', prob: posterior.support },
  ];

  roles.sort((a, b) => b.prob - a.prob);

  const top2 = roles.slice(0, 2).filter(r => r.prob > 0.01);
  return top2.map(r => `${r.role}:${(r.prob * 100).toFixed(0)}%`).join(' / ');
}

// ============ Percentile Calculation ============

function calculatePercentile(sortedValues: number[], percentile: number): number {
  const index = Math.floor((percentile / 100) * (sortedValues.length - 1));
  return sortedValues[index];
}

function getPercentiles(values: number[]): { p50: number; p75: number; p85: number; p90: number; p95: number } {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: calculatePercentile(sorted, 50),
    p75: calculatePercentile(sorted, 75),
    p85: calculatePercentile(sorted, 85),
    p90: calculatePercentile(sorted, 90),
    p95: calculatePercentile(sorted, 95),
  };
}

function getPlayerGamesPercentiles(values: number[]): { p10: number; p25: number; p50: number; p75: number; p90: number } {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p10: calculatePercentile(sorted, 10),
    p25: calculatePercentile(sorted, 25),
    p50: calculatePercentile(sorted, 50),
    p75: calculatePercentile(sorted, 75),
    p90: calculatePercentile(sorted, 90),
  };
}

// ============ Constants ============

const LOW_SAMPLE_THRESHOLD = 10; // Players with < 10 games are considered low-sample

// ============ Main Calibration ============

async function main() {
  const dataDir = path.join(process.cwd(), 'data', 'lol');
  const outputDir = path.join(process.cwd(), 'app', 'lib');

  console.log('='.repeat(70));
  console.log('Step 4.2 + 4.3 — Evidence Threshold Calibration');
  console.log('='.repeat(70));
  console.log();

  // ============ Part A: Coverage Disclosure ============

  console.log('Part A: Coverage Disclosure');
  console.log('-'.repeat(50));

  // Load all data sources
  const posteriorPath = path.join(dataDir, 'bayesian-role-posteriors.json');
  const positionStatsPath = path.join(dataDir, 'champion-position-stats.json');
  const playerPoolsPath = path.join(dataDir, 'player-pools.json');

  const posteriorData: Record<string, RolePosterior> = JSON.parse(
    fs.readFileSync(posteriorPath, 'utf-8')
  );
  const positionStatsData: Record<string, Record<string, number>> = JSON.parse(
    fs.readFileSync(positionStatsPath, 'utf-8')
  );
  const playerPoolsData: PlayerPoolsData = JSON.parse(
    fs.readFileSync(playerPoolsPath, 'utf-8')
  );

  const championsWithPosterior = Object.keys(posteriorData).length;
  const championsWithProGames = Object.keys(positionStatsData).length;
  const championsUsedForEntropyCalibration = championsWithPosterior; // Same source

  console.log(`Champions with Bayesian posterior: ${championsWithPosterior}`);
  console.log(`Champions with pro game data: ${championsWithProGames}`);
  console.log(`Champions used for entropy calibration: ${championsUsedForEntropyCalibration}`);
  console.log();

  // Player coverage
  const totalPlayers = Object.keys(playerPoolsData.players).length;
  const playerGameCounts = Object.values(playerPoolsData.players).map(p => p.totalGames);
  const lowSamplePlayers = playerGameCounts.filter(g => g < LOW_SAMPLE_THRESHOLD).length;
  const lowSamplePlayerPercent = (lowSamplePlayers / totalPlayers) * 100;

  console.log(`Total players in pool: ${totalPlayers}`);
  console.log(`Players with < ${LOW_SAMPLE_THRESHOLD} games (low-sample): ${lowSamplePlayers} (${lowSamplePlayerPercent.toFixed(1)}%)`);
  console.log();

  // ============ Part B: FLEX_ENTROPY Calibration + Sanity Report ============

  console.log('Part B: FLEX_ENTROPY Calibration + Sanity Report');
  console.log('-'.repeat(50));

  const championEntropies: Array<{
    champion: string;
    entropy: number;
    posterior: RolePosterior['posterior'];
  }> = [];

  for (const [champion, data] of Object.entries(posteriorData)) {
    const entropy = calculateNormalizedEntropy(data.posterior);
    championEntropies.push({ champion, entropy, posterior: data.posterior });
  }

  // Sort by entropy for analysis
  championEntropies.sort((a, b) => a.entropy - b.entropy);

  const entropyValues = championEntropies.map(c => c.entropy);
  const entropyPercentiles = getPercentiles(entropyValues);

  console.log(`Sample size: ${championEntropies.length} champions`);
  console.log();
  console.log('Entropy Distribution (H_norm):');
  console.log(`  P50: ${entropyPercentiles.p50.toFixed(4)}`);
  console.log(`  P75: ${entropyPercentiles.p75.toFixed(4)}`);
  console.log(`  P85: ${entropyPercentiles.p85.toFixed(4)}`);
  console.log(`  P90: ${entropyPercentiles.p90.toFixed(4)}`);
  console.log(`  P95: ${entropyPercentiles.p95.toFixed(4)}`);
  console.log();

  // Use P85 as threshold (top 15% are considered STRONG FLEX)
  const flexEntropyThreshold = entropyPercentiles.p85;

  // Find examples near threshold
  const nearThreshold = championEntropies.filter(
    c => Math.abs(c.entropy - flexEntropyThreshold) < 0.05
  ).slice(0, 5);

  const strongFlexCount = championEntropies.filter(c => c.entropy >= flexEntropyThreshold).length;
  const strongFlexPercent = (strongFlexCount / championEntropies.length) * 100;

  console.log(`Selected threshold (P85): ${flexEntropyThreshold.toFixed(4)}`);
  console.log(`Champions >= threshold: ${strongFlexCount} (${strongFlexPercent.toFixed(1)}%)`);
  console.log();

  // SANITY REPORT: Top 20 highest entropy champions
  console.log('SANITY CHECK: Top 20 highest entropy champions (should be known flex picks):');
  const top20 = championEntropies.slice(-20).reverse();
  top20.forEach((c, i) => {
    const topRoles = getTopRolesString(c.posterior);
    console.log(`  ${(i + 1).toString().padStart(2)}. ${c.champion.padEnd(15)} H=${c.entropy.toFixed(4)}  [${topRoles}]`);
  });
  console.log();

  // SANITY REPORT: Bottom 20 lowest entropy champions
  console.log('SANITY CHECK: Bottom 20 lowest entropy champions (should be single-role):');
  const bottom20 = championEntropies.slice(0, 20);
  bottom20.forEach((c, i) => {
    const topRoles = getTopRolesString(c.posterior);
    console.log(`  ${(i + 1).toString().padStart(2)}. ${c.champion.padEnd(15)} H=${c.entropy.toFixed(4)}  [${topRoles}]`);
  });
  console.log();

  // ============ Part C: PLAYER_SPECIALTY Calibration + Low-Sample Analysis ============

  console.log('Part C: PLAYER_SPECIALTY Calibration + Low-Sample Analysis');
  console.log('-'.repeat(50));

  const pickCounts: number[] = [];
  const pickShares: number[] = [];
  const allEntries: Array<{
    playerId: string;
    playerName: string;
    championName: string;
    pickCount: number;
    pickShare: number;
    playerGames: number;
  }> = [];

  for (const player of Object.values(playerPoolsData.players)) {
    for (const champ of player.champions) {
      pickCounts.push(champ.pickCount);
      pickShares.push(champ.pickRateWithinPlayer);
      allEntries.push({
        playerId: player.playerId,
        playerName: player.playerName,
        championName: champ.championName,
        pickCount: champ.pickCount,
        pickShare: champ.pickRateWithinPlayer,
        playerGames: player.totalGames,
      });
    }
  }

  const pickCountPercentiles = getPercentiles(pickCounts);
  const pickSharePercentiles = getPercentiles(pickShares);
  const playerGamesPercentiles = getPlayerGamesPercentiles(playerGameCounts);

  console.log(`Sample size: ${allEntries.length} (player, champion) entries`);
  console.log();
  console.log('pickCount Distribution:');
  console.log(`  P50: ${pickCountPercentiles.p50}`);
  console.log(`  P75: ${pickCountPercentiles.p75}`);
  console.log(`  P85: ${pickCountPercentiles.p85}`);
  console.log(`  P90: ${pickCountPercentiles.p90}`);
  console.log(`  P95: ${pickCountPercentiles.p95}`);
  console.log();
  console.log('pickShare Distribution:');
  console.log(`  P50: ${(pickSharePercentiles.p50 * 100).toFixed(1)}%`);
  console.log(`  P75: ${(pickSharePercentiles.p75 * 100).toFixed(1)}%`);
  console.log(`  P85: ${(pickSharePercentiles.p85 * 100).toFixed(1)}%`);
  console.log(`  P90: ${(pickSharePercentiles.p90 * 100).toFixed(1)}%`);
  console.log(`  P95: ${(pickSharePercentiles.p95 * 100).toFixed(1)}%`);
  console.log();
  console.log('playerGames Distribution:');
  console.log(`  P10: ${playerGamesPercentiles.p10}`);
  console.log(`  P25: ${playerGamesPercentiles.p25}`);
  console.log(`  P50: ${playerGamesPercentiles.p50}`);
  console.log(`  P75: ${playerGamesPercentiles.p75}`);
  console.log(`  P90: ${playerGamesPercentiles.p90}`);
  console.log();

  // STRONG: P85 for both pickCount AND pickShare (more inclusive than P90)
  // MODERATE: P75 for pickCount only
  // Rationale: P90 was too strict (2.6%), P85 gives ~10-15% which is more reasonable
  const strongPickCount = pickCountPercentiles.p85;
  const strongPickShare = pickSharePercentiles.p85;
  const moderatePickCount = pickCountPercentiles.p75;

  // Count STRONG and MODERATE entries
  const strongEntries = allEntries.filter(
    e => e.pickCount >= strongPickCount && e.pickShare >= strongPickShare
  );
  const moderateEntries = allEntries.filter(
    e => e.pickCount >= moderatePickCount && !(e.pickCount >= strongPickCount && e.pickShare >= strongPickShare)
  );

  // Low-sample analysis
  const lowSampleEntries = allEntries.filter(e => e.playerGames < LOW_SAMPLE_THRESHOLD);
  const strongEntriesFromLowSample = strongEntries.filter(e => e.playerGames < LOW_SAMPLE_THRESHOLD);

  const strongSpecialtyPercent = (strongEntries.length / allEntries.length) * 100;
  const moderateSpecialtyPercent = (moderateEntries.length / allEntries.length) * 100;

  console.log('Selected thresholds:');
  console.log(`  STRONG: pickCount >= ${strongPickCount} AND pickShare >= ${(strongPickShare * 100).toFixed(1)}% (P85)`);
  console.log(`  MODERATE: pickCount >= ${moderatePickCount} (P75)`);
  console.log(`  LOW_SAMPLE: playerGames < ${LOW_SAMPLE_THRESHOLD} (cap at MODERATE)`);
  console.log();
  console.log(`STRONG entries: ${strongEntries.length} (${strongSpecialtyPercent.toFixed(1)}%)`);
  console.log(`MODERATE entries: ${moderateEntries.length} (${moderateSpecialtyPercent.toFixed(1)}%)`);
  console.log();

  // Low-sample warning
  console.log('LOW-SAMPLE ANALYSIS:');
  console.log(`  Entries from low-sample players: ${lowSampleEntries.length} (${(lowSampleEntries.length / allEntries.length * 100).toFixed(1)}%)`);
  console.log(`  STRONG entries from low-sample players: ${strongEntriesFromLowSample.length}`);
  if (strongEntriesFromLowSample.length > 0) {
    console.log('  WARNING: These STRONG entries will be capped at MODERATE due to low sample:');
    strongEntriesFromLowSample.slice(0, 5).forEach(e => {
      console.log(`    ${e.playerName} - ${e.championName}: ${e.pickCount} picks, ${e.playerGames} total games`);
    });
  }
  console.log();

  // Show some STRONG examples (excluding low-sample)
  console.log('Top 10 STRONG specialty examples (excluding low-sample):');
  strongEntries
    .filter(e => e.playerGames >= LOW_SAMPLE_THRESHOLD)
    .sort((a, b) => b.pickCount - a.pickCount)
    .slice(0, 10)
    .forEach(e => {
      console.log(`  ${e.playerName} - ${e.championName}: ${e.pickCount} picks (${(e.pickShare * 100).toFixed(1)}%) [${e.playerGames} games]`);
    });
  console.log();

  // ============ Generate Calibration Result ============

  const calibrationResult: CalibrationResult = {
    meta: {
      calibrationDate: new Date().toISOString(),
      dataSource: 'bayesian-role-posteriors.json, player-pools.json, champion-position-stats.json',
      description: 'Data-driven thresholds for evidence strength attribution (Step 4.2 + 4.3)',
    },
    coverage: {
      championsWithPosterior,
      championsWithProGames,
      championsUsedForEntropyCalibration,
      totalPlayersInPool: totalPlayers,
      lowSamplePlayerCount: lowSamplePlayers,
      lowSampleThreshold: LOW_SAMPLE_THRESHOLD,
    },
    ROLE_FLEX_PRESSURE: {
      entropyThreshold: Number(flexEntropyThreshold.toFixed(4)),
      percentileUsed: 'P85',
      distribution: {
        p50: Number(entropyPercentiles.p50.toFixed(4)),
        p75: Number(entropyPercentiles.p75.toFixed(4)),
        p85: Number(entropyPercentiles.p85.toFixed(4)),
        p90: Number(entropyPercentiles.p90.toFixed(4)),
        p95: Number(entropyPercentiles.p95.toFixed(4)),
      },
      sampleSize: championEntropies.length,
      strongFlexPercent: Number(strongFlexPercent.toFixed(1)),
      examplesNearThreshold: nearThreshold.map(c => ({
        champion: c.champion,
        entropy: Number(c.entropy.toFixed(4)),
      })),
      top20HighEntropy: top20.map(c => ({
        champion: c.champion,
        entropy: Number(c.entropy.toFixed(4)),
        topRoles: getTopRolesString(c.posterior),
      })),
      bottom20LowEntropy: bottom20.map(c => ({
        champion: c.champion,
        entropy: Number(c.entropy.toFixed(4)),
        topRoles: getTopRolesString(c.posterior),
      })),
    },
    PLAYER_SPECIALTY: {
      strongPickCount,
      strongPickShare: Number(strongPickShare.toFixed(4)),
      moderatePickCount,
      lowSampleThreshold: LOW_SAMPLE_THRESHOLD,
      percentileUsed: {
        strongPickCount: 'P85',
        strongPickShare: 'P85',
        moderatePickCount: 'P75',
      },
      distribution: {
        pickCount: pickCountPercentiles,
        pickShare: {
          p50: Number(pickSharePercentiles.p50.toFixed(4)),
          p75: Number(pickSharePercentiles.p75.toFixed(4)),
          p85: Number(pickSharePercentiles.p85.toFixed(4)),
          p90: Number(pickSharePercentiles.p90.toFixed(4)),
          p95: Number(pickSharePercentiles.p95.toFixed(4)),
        },
        playerGames: playerGamesPercentiles,
      },
      sampleSize: allEntries.length,
      strongSpecialtyPercent: Number(strongSpecialtyPercent.toFixed(1)),
      moderateSpecialtyPercent: Number(moderateSpecialtyPercent.toFixed(1)),
      lowSamplePlayerPercent: Number(lowSamplePlayerPercent.toFixed(1)),
    },
  };

  // Write calibration result
  const outputPath = path.join(outputDir, 'evidence-thresholds.json');
  fs.writeFileSync(outputPath, JSON.stringify(calibrationResult, null, 2));
  console.log(`Calibration result written to: ${outputPath}`);
  console.log();

  // ============ Part D: Diagnostic Summary ============

  console.log('Part D: Diagnostic Summary');
  console.log('-'.repeat(50));
  console.log(`% of champions considered "STRONG FLEX": ${strongFlexPercent.toFixed(1)}%`);
  console.log(`% of player pool entries considered "STRONG SPECIALTY": ${strongSpecialtyPercent.toFixed(1)}%`);
  console.log(`% of player pool entries considered "MODERATE SPECIALTY": ${moderateSpecialtyPercent.toFixed(1)}%`);
  console.log(`% of players with low sample (< ${LOW_SAMPLE_THRESHOLD} games): ${lowSamplePlayerPercent.toFixed(1)}%`);
  console.log();

  // Validate not extreme
  const isFlexReasonable = strongFlexPercent > 5 && strongFlexPercent < 30;
  const isSpecialtyReasonable = strongSpecialtyPercent > 2 && strongSpecialtyPercent < 30;

  console.log('Validation:');
  console.log(`  STRONG FLEX in reasonable range (5-30%): ${isFlexReasonable ? '✓' : '✗'}`);
  console.log(`  STRONG SPECIALTY in reasonable range (2-30%): ${isSpecialtyReasonable ? '✓' : '✗'}`);
  console.log();

  // Sanity check: verify top entropy champions are known flex picks
  console.log('SANITY VERIFICATION:');
  const knownFlexPicks = ['Poppy', 'Twisted Fate', 'Aurelion Sol', 'Rek\'Sai', 'Lucian', 'Corki', 'Neeko'];
  const topEntropyNames = top20.slice(0, 10).map(c => c.champion);
  const matchedFlex = knownFlexPicks.filter(name => topEntropyNames.includes(name));
  console.log(`  Known flex picks in top 10 entropy: ${matchedFlex.length}/${knownFlexPicks.length}`);
  console.log(`  Matched: ${matchedFlex.join(', ') || 'none'}`);
  console.log();

  console.log('='.repeat(70));
  console.log('Calibration complete.');
  console.log('='.repeat(70));
}

main().catch(console.error);
