/**
 * v4-1 L0 Synergy Matrix Builder
 *
 * Builds champion synergy matrix from win rates when paired together.
 * Classifies synergies as Hard/Soft/Meta based on win rate delta.
 */

import fs from 'fs';
import path from 'path';
import { SynergyRelation, SynergyType, L0Config, DEFAULT_L0_CONFIG } from '../types/l0-types';
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

interface SynergyAccumulator {
  championA: string;
  championB: string;
  pairWins: number;
  pairLosses: number;
  pairGames: number;
}

/**
 * Build synergy matrix from series data files
 */
export async function buildSynergyMatrix(
  config: L0Config = DEFAULT_L0_CONFIG
): Promise<Map<string, SynergyRelation[]>> {
  const seriesDataDir = path.join(process.cwd(), 'data', 'lol', 'series_data');

  if (!fs.existsSync(seriesDataDir)) {
    console.warn('Series data directory not found:', seriesDataDir);
    return new Map();
  }

  const files = fs.readdirSync(seriesDataDir)
    .filter(f => f.startsWith('series_') && f.endsWith('.json'));

  console.log(`Processing ${files.length} series files for synergy matrix...`);

  // Accumulate synergy data
  const synergyMap = new Map<string, SynergyAccumulator>();
  const championWins = new Map<string, number>();
  const championGames = new Map<string, number>();
  let totalGamesProcessed = 0;

  for (const file of files) {
    const filePath = path.join(seriesDataDir, file);

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const seriesData: SeriesData = JSON.parse(content);

      for (const game of seriesData.games || []) {
        totalGamesProcessed++;
        processGameForSynergies(game, synergyMap, championWins, championGames);
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }

  console.log(`Processed ${totalGamesProcessed} games for synergy analysis`);

  // Calculate baseline win rates
  const baselineWinRates = new Map<string, number>();
  for (const [championId, wins] of championWins.entries()) {
    const games = championGames.get(championId) || 0;
    baselineWinRates.set(championId, games > 0 ? wins / games : 0.5);
  }

  // Convert accumulators to SynergyRelation
  const synergyMatrix = new Map<string, SynergyRelation[]>();

  for (const [pairKey, acc] of synergyMap.entries()) {
    // Skip pairs with insufficient data
    if (acc.pairGames < config.minPairings) {
      continue;
    }

    const pairWinRate = acc.pairWins / acc.pairGames;

    // Calculate expected win rate (average of both champions' baseline)
    const baselineA = baselineWinRates.get(acc.championA) || 0.5;
    const baselineB = baselineWinRates.get(acc.championB) || 0.5;
    const baselineWinRate = (baselineA + baselineB) / 2;

    const winRateDelta = pairWinRate - baselineWinRate;

    // Classify synergy type
    const type = classifySynergyType(winRateDelta);

    // Calculate synergy score (0-1)
    const score = calculateSynergyScore(winRateDelta);

    // Calculate confidence
    const confidence = calculateSampleConfidence(
      acc.pairGames,
      config.confidenceThreshold,
      config.confidenceSteepness
    );

    const relation: SynergyRelation = {
      championA: acc.championA,
      championB: acc.championB,
      type,
      score,
      confidence,
      pairWinRate,
      baselineWinRate,
      winRateDelta,
      sampleSize: acc.pairGames,
      lastUpdated: new Date(),
    };

    // Add to both champions' synergy lists
    addSynergyToMatrix(synergyMatrix, acc.championA, relation);

    // Create reverse relation
    const reverseRelation: SynergyRelation = {
      ...relation,
      championA: acc.championB,
      championB: acc.championA,
    };
    addSynergyToMatrix(synergyMatrix, acc.championB, reverseRelation);
  }

  console.log(`Generated synergy matrix for ${synergyMatrix.size} champions`);

  return synergyMatrix;
}

/**
 * Process a single game for synergy data
 */
function processGameForSynergies(
  game: GameData,
  synergyMap: Map<string, SynergyAccumulator>,
  championWins: Map<string, number>,
  championGames: Map<string, number>
): void {
  for (const team of game.teams) {
    const champions = team.players.map(p => p.character.id);
    const won = team.won;

    // Update individual champion stats
    for (const championId of champions) {
      championGames.set(championId, (championGames.get(championId) || 0) + 1);
      if (won) {
        championWins.set(championId, (championWins.get(championId) || 0) + 1);
      }
    }

    // Generate all pairs within the team
    for (let i = 0; i < champions.length; i++) {
      for (let j = i + 1; j < champions.length; j++) {
        const champA = champions[i];
        const champB = champions[j];

        // Create canonical pair key (sorted alphabetically)
        const pairKey = createPairKey(champA, champB);

        let acc = synergyMap.get(pairKey);
        if (!acc) {
          acc = {
            championA: champA < champB ? champA : champB,
            championB: champA < champB ? champB : champA,
            pairWins: 0,
            pairLosses: 0,
            pairGames: 0,
          };
          synergyMap.set(pairKey, acc);
        }

        acc.pairGames++;
        if (won) {
          acc.pairWins++;
        } else {
          acc.pairLosses++;
        }
      }
    }
  }
}

/**
 * Create canonical pair key (sorted)
 */
function createPairKey(championA: string, championB: string): string {
  return championA < championB
    ? `${championA}:${championB}`
    : `${championB}:${championA}`;
}

/**
 * Classify synergy type based on win rate delta
 */
function classifySynergyType(winRateDelta: number): SynergyType {
  if (winRateDelta > 0.10) return 'Hard';
  if (winRateDelta > 0.05) return 'Soft';
  return 'Meta';
}

/**
 * Calculate synergy score (0-1) from win rate delta
 */
function calculateSynergyScore(winRateDelta: number): number {
  // Map win rate delta to 0-1 score
  // Delta of 0.20 (20%) = score of 1.0
  // Delta of 0.00 (0%) = score of 0.5
  // Delta of -0.20 (-20%) = score of 0.0
  const normalized = (winRateDelta + 0.20) / 0.40;
  return Math.max(0, Math.min(1, normalized));
}

/**
 * Add synergy relation to matrix
 */
function addSynergyToMatrix(
  matrix: Map<string, SynergyRelation[]>,
  championId: string,
  relation: SynergyRelation
): void {
  const existing = matrix.get(championId) || [];
  existing.push(relation);
  matrix.set(championId, existing);
}

/**
 * Get synergies for a champion
 */
export function getChampionSynergies(
  championId: string,
  synergyMatrix: Map<string, SynergyRelation[]>
): SynergyRelation[] {
  return synergyMatrix.get(championId) || [];
}

/**
 * Get top synergies for a champion
 */
export function getTopSynergies(
  championId: string,
  synergyMatrix: Map<string, SynergyRelation[]>,
  topN: number = 5,
  minConfidence: number = 0.5
): SynergyRelation[] {
  const synergies = synergyMatrix.get(championId) || [];

  return synergies
    .filter(s => s.confidence >= minConfidence)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

/**
 * Get synergy between two specific champions
 * Original O(n) lookup - kept for backward compatibility
 */
export function getSynergyBetween(
  championA: string,
  championB: string,
  synergyMatrix: Map<string, SynergyRelation[]>
): SynergyRelation | undefined {
  const synergies = synergyMatrix.get(championA) || [];
  return synergies.find(s => s.championB === championB);
}

/**
 * OPTIMIZED: Create nested Map for O(1) lookups
 * Converts array-based structure to nested Map for 50-100x faster lookups
 */
export function createOptimizedSynergyMatrix(
  synergyMatrix: Map<string, SynergyRelation[]>
): Map<string, Map<string, SynergyRelation>> {
  const optimized = new Map<string, Map<string, SynergyRelation>>();

  for (const [championA, relations] of synergyMatrix.entries()) {
    const innerMap = new Map<string, SynergyRelation>();
    for (const relation of relations) {
      innerMap.set(relation.championB, relation);
    }
    optimized.set(championA, innerMap);
  }

  return optimized;
}

/**
 * OPTIMIZED: Fast synergy lookup using nested Map (O(1) instead of O(n))
 */
export function getSynergyBetweenFast(
  championA: string,
  championB: string,
  optimizedMatrix: Map<string, Map<string, SynergyRelation>>
): SynergyRelation | undefined {
  return optimizedMatrix.get(championA)?.get(championB);
}

/**
 * Calculate team synergy score
 */
export function calculateTeamSynergy(
  championIds: string[],
  synergyMatrix: Map<string, SynergyRelation[]>
): { score: number; confidence: number } {
  if (championIds.length < 2) {
    return { score: 0.5, confidence: 0 };
  }

  let totalScore = 0;
  let totalConfidence = 0;
  let pairCount = 0;

  // Calculate average synergy across all pairs
  for (let i = 0; i < championIds.length; i++) {
    for (let j = i + 1; j < championIds.length; j++) {
      const synergy = getSynergyBetween(championIds[i], championIds[j], synergyMatrix);
      if (synergy) {
        totalScore += synergy.score;
        totalConfidence += synergy.confidence;
        pairCount++;
      }
    }
  }

  if (pairCount === 0) {
    return { score: 0.5, confidence: 0 };
  }

  return {
    score: totalScore / pairCount,
    confidence: totalConfidence / pairCount,
  };
}
