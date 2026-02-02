/**
 * v4-1 L0 Counter Matrix Builder
 *
 * Builds champion counter matrix from head-to-head matchup data.
 * Classifies counters as Hard/Soft/Meta based on win rate.
 */

import fs from 'fs';
import path from 'path';
import { CounterRelation, CounterType, L0Config, DEFAULT_L0_CONFIG } from '../types/l0-types';
import { calculateSampleConfidence } from '../types/common-types';

interface SeriesData {
  id: string;
  games: GameData[];
}

interface GameData {
  id: string;
  teams: TeamData[];
}

interface TeamData {
  id: string;
  side: 'blue' | 'red';
  won: boolean;
  players: PlayerData[];
}

interface PlayerData {
  id: string;
  character: {
    id: string;
    name: string;
  };
}

interface CounterAccumulator {
  championA: string;
  championB: string;
  aWins: number;  // Games where A won against B
  bWins: number;  // Games where B won against A
  totalMatchups: number;
}

/**
 * Build counter matrix from series data files
 * Analyzes head-to-head matchups between champions
 */
export async function buildCounterMatrix(
  config: L0Config = DEFAULT_L0_CONFIG
): Promise<Map<string, CounterRelation[]>> {
  const seriesDataDir = path.join(process.cwd(), 'data', 'lol', 'series_data');

  if (!fs.existsSync(seriesDataDir)) {
    console.warn('Series data directory not found:', seriesDataDir);
    return new Map();
  }

  const files = fs.readdirSync(seriesDataDir)
    .filter(f => f.startsWith('series_') && f.endsWith('.json'));

  console.log(`Processing ${files.length} series files for counter matrix...`);

  // Accumulate matchup data
  const matchupMap = new Map<string, CounterAccumulator>();
  let totalGamesProcessed = 0;

  for (const file of files) {
    const filePath = path.join(seriesDataDir, file);

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const seriesData: SeriesData = JSON.parse(content);

      for (const game of seriesData.games || []) {
        totalGamesProcessed++;
        processGameForCounters(game, matchupMap);
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }

  console.log(`Processed ${totalGamesProcessed} games for counter analysis`);

  // Convert accumulators to CounterRelation
  const counterMatrix = new Map<string, CounterRelation[]>();

  for (const [matchupKey, acc] of matchupMap.entries()) {
    // Skip matchups with insufficient data
    if (acc.totalMatchups < config.minMatchups) {
      continue;
    }

    // Calculate win rates
    const aWinRate = acc.aWins / acc.totalMatchups;
    const bWinRate = acc.bWins / acc.totalMatchups;

    // Create counter relation for A vs B
    if (aWinRate < 0.50) {
      // B counters A
      const type = classifyCounterType(aWinRate);
      const score = calculateCounterScore(aWinRate);
      const confidence = calculateSampleConfidence(
        acc.totalMatchups,
        config.confidenceThreshold,
        config.confidenceSteepness
      );

      const relation: CounterRelation = {
        championA: acc.championA,
        championB: acc.championB,
        type,
        score,
        confidence,
        matchupWinRate: aWinRate,
        sampleSize: acc.totalMatchups,
        lastUpdated: new Date(),
      };

      addCounterToMatrix(counterMatrix, acc.championA, relation);
    }

    // Create counter relation for B vs A
    if (bWinRate < 0.50) {
      // A counters B
      const type = classifyCounterType(bWinRate);
      const score = calculateCounterScore(bWinRate);
      const confidence = calculateSampleConfidence(
        acc.totalMatchups,
        config.confidenceThreshold,
        config.confidenceSteepness
      );

      const relation: CounterRelation = {
        championA: acc.championB,
        championB: acc.championA,
        type,
        score,
        confidence,
        matchupWinRate: bWinRate,
        sampleSize: acc.totalMatchups,
        lastUpdated: new Date(),
      };

      addCounterToMatrix(counterMatrix, acc.championB, relation);
    }
  }

  console.log(`Generated counter matrix for ${counterMatrix.size} champions`);

  return counterMatrix;
}

/**
 * Process a single game for counter data
 * Tracks all cross-team champion matchups
 */
function processGameForCounters(
  game: GameData,
  matchupMap: Map<string, CounterAccumulator>
): void {
  if (game.teams.length !== 2) return;

  const team1 = game.teams[0];
  const team2 = game.teams[1];

  const team1Champions = team1.players.map(p => p.character.id);
  const team2Champions = team2.players.map(p => p.character.id);

  // Generate all cross-team matchups
  for (const champ1 of team1Champions) {
    for (const champ2 of team2Champions) {
      // Create canonical matchup key (sorted)
      const matchupKey = createMatchupKey(champ1, champ2);

      let acc = matchupMap.get(matchupKey);
      if (!acc) {
        acc = {
          championA: champ1 < champ2 ? champ1 : champ2,
          championB: champ1 < champ2 ? champ2 : champ1,
          aWins: 0,
          bWins: 0,
          totalMatchups: 0,
        };
        matchupMap.set(matchupKey, acc);
      }

      acc.totalMatchups++;

      // Record win
      if (team1.won) {
        if (champ1 === acc.championA) {
          acc.aWins++;
        } else {
          acc.bWins++;
        }
      } else {
        if (champ2 === acc.championA) {
          acc.aWins++;
        } else {
          acc.bWins++;
        }
      }
    }
  }
}

/**
 * Create canonical matchup key (sorted)
 */
function createMatchupKey(championA: string, championB: string): string {
  return championA < championB
    ? `${championA}:${championB}`
    : `${championB}:${championA}`;
}

/**
 * Classify counter type based on win rate
 */
function classifyCounterType(winRate: number): CounterType {
  if (winRate < 0.40) return 'Hard';
  if (winRate < 0.45) return 'Soft';
  return 'Meta';
}

/**
 * Calculate counter score (0-1) from win rate
 * Lower win rate = higher counter score
 */
function calculateCounterScore(winRate: number): number {
  // Map win rate to counter score
  // WR 0.30 (30%) = score 1.0 (hard counter)
  // WR 0.45 (45%) = score 0.5 (soft counter)
  // WR 0.50 (50%) = score 0.0 (no counter)
  const normalized = (0.50 - winRate) / 0.20;
  return Math.max(0, Math.min(1, normalized));
}

/**
 * Add counter relation to matrix
 */
function addCounterToMatrix(
  matrix: Map<string, CounterRelation[]>,
  championId: string,
  relation: CounterRelation
): void {
  const existing = matrix.get(championId) || [];
  existing.push(relation);
  matrix.set(championId, existing);
}

/**
 * Get counters for a champion
 */
export function getChampionCounters(
  championId: string,
  counterMatrix: Map<string, CounterRelation[]>
): CounterRelation[] {
  return counterMatrix.get(championId) || [];
}

/**
 * Get top counters for a champion
 */
export function getTopCounters(
  championId: string,
  counterMatrix: Map<string, CounterRelation[]>,
  topN: number = 5,
  minConfidence: number = 0.5
): CounterRelation[] {
  const counters = counterMatrix.get(championId) || [];

  return counters
    .filter(c => c.confidence >= minConfidence)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

/**
 * Get counter relationship between two specific champions
 * OPTIMIZED: O(1) lookup using nested Map structure
 */
export function getCounterBetween(
  championA: string,
  championB: string,
  counterMatrix: Map<string, CounterRelation[]>
): CounterRelation | undefined {
  const counters = counterMatrix.get(championA) || [];
  return counters.find(c => c.championB === championB);
}

/**
 * OPTIMIZED: Create nested Map for O(1) lookups
 * Use this for performance-critical operations
 */
export function createOptimizedCounterMatrix(
  counterMatrix: Map<string, CounterRelation[]>
): Map<string, Map<string, CounterRelation>> {
  const optimized = new Map<string, Map<string, CounterRelation>>();

  for (const [championA, relations] of counterMatrix.entries()) {
    const innerMap = new Map<string, CounterRelation>();
    for (const relation of relations) {
      innerMap.set(relation.championB, relation);
    }
    optimized.set(championA, innerMap);
  }

  return optimized;
}

/**
 * OPTIMIZED: Fast lookup using nested Map (O(1) instead of O(n))
 */
export function getCounterBetweenFast(
  championA: string,
  championB: string,
  optimizedMatrix: Map<string, Map<string, CounterRelation>>
): CounterRelation | undefined {
  return optimizedMatrix.get(championA)?.get(championB);
}

/**
 * Check if championB counters championA
 */
export function isCounter(
  championA: string,
  championB: string,
  counterMatrix: Map<string, CounterRelation[]>,
  minScore: number = 0.5
): boolean {
  const counter = getCounterBetween(championA, championB, counterMatrix);
  return counter !== undefined && counter.score >= minScore;
}

/**
 * Get hard counters only
 */
export function getHardCounters(
  championId: string,
  counterMatrix: Map<string, CounterRelation[]>
): CounterRelation[] {
  const counters = counterMatrix.get(championId) || [];
  return counters.filter(c => c.type === 'Hard');
}

/**
 * Calculate how countered a team composition is
 */
export function calculateTeamCounterScore(
  teamChampions: string[],
  opponentChampions: string[],
  counterMatrix: Map<string, CounterRelation[]>
): { score: number; confidence: number; hardCounters: number } {
  if (teamChampions.length === 0 || opponentChampions.length === 0) {
    return { score: 0, confidence: 0, hardCounters: 0 };
  }

  let totalScore = 0;
  let totalConfidence = 0;
  let matchupCount = 0;
  let hardCounters = 0;

  // Check each team champion against opponent champions
  for (const teamChamp of teamChampions) {
    for (const oppChamp of opponentChampions) {
      const counter = getCounterBetween(teamChamp, oppChamp, counterMatrix);
      if (counter) {
        totalScore += counter.score;
        totalConfidence += counter.confidence;
        matchupCount++;

        if (counter.type === 'Hard') {
          hardCounters++;
        }
      }
    }
  }

  if (matchupCount === 0) {
    return { score: 0, confidence: 0, hardCounters: 0 };
  }

  return {
    score: totalScore / matchupCount,
    confidence: totalConfidence / matchupCount,
    hardCounters,
  };
}

/**
 * Find champions that counter multiple enemy champions
 */
export function findMultiCounters(
  enemyChampions: string[],
  counterMatrix: Map<string, CounterRelation[]>,
  minCounters: number = 2
): Array<{ championId: string; countersCount: number; avgScore: number }> {
  const counterCounts = new Map<string, { count: number; totalScore: number }>();

  // For each enemy champion, find what counters it
  for (const enemyChamp of enemyChampions) {
    const counters = counterMatrix.get(enemyChamp) || [];

    for (const counter of counters) {
      const existing = counterCounts.get(counter.championB) || { count: 0, totalScore: 0 };
      existing.count++;
      existing.totalScore += counter.score;
      counterCounts.set(counter.championB, existing);
    }
  }

  // Filter and format results
  const results: Array<{ championId: string; countersCount: number; avgScore: number }> = [];

  for (const [championId, data] of counterCounts.entries()) {
    if (data.count >= minCounters) {
      results.push({
        championId,
        countersCount: data.count,
        avgScore: data.totalScore / data.count,
      });
    }
  }

  return results.sort((a, b) => {
    // Sort by count first, then by average score
    if (b.countersCount !== a.countersCount) {
      return b.countersCount - a.countersCount;
    }
    return b.avgScore - a.avgScore;
  });
}
