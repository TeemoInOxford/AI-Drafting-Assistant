/**
 * v4-1 L0 Data Layer Public API
 *
 * Unified interface for accessing L0 data with caching.
 * Provides data refresh mechanism and cache management.
 */

import {
  L0DataCache,
  L0Config,
  DEFAULT_L0_CONFIG,
  ChampionStats,
  PlayerPool,
  SynergyRelation,
  CounterRelation,
  BPSequence,
} from '../types/l0-types';

import { generateChampionStats } from './champion-stats';
import { generatePlayerPools } from './player-pools';
import { buildSynergyMatrix } from './synergy-matrix';
import { buildCounterMatrix } from './counter-matrix';
import { parseBPHistory } from './bp-history-parser';

// Global cache instance
let globalCache: L0DataCache | null = null;
let cacheGenerationPromise: Promise<L0DataCache> | null = null;

/**
 * Load L0 data with caching
 * Returns cached data if available and not expired
 */
export async function loadL0Data(
  config: L0Config = DEFAULT_L0_CONFIG,
  forceRefresh: boolean = false
): Promise<L0DataCache> {
  // Return cached data if valid
  if (!forceRefresh && globalCache && !isCacheExpired(globalCache, config)) {
    console.log('Using cached L0 data');
    return globalCache;
  }

  // If generation is already in progress, wait for it
  if (cacheGenerationPromise) {
    console.log('L0 data generation already in progress, waiting...');
    return cacheGenerationPromise;
  }

  // Start new generation
  console.log('Generating fresh L0 data...');
  cacheGenerationPromise = generateL0Data(config);

  try {
    globalCache = await cacheGenerationPromise;
    return globalCache;
  } finally {
    cacheGenerationPromise = null;
  }
}

/**
 * Generate L0 data from scratch
 */
async function generateL0Data(config: L0Config): Promise<L0DataCache> {
  const startTime = Date.now();

  console.log('Starting L0 data generation...');

  // Generate all data in parallel for efficiency
  const [championStats, playerPools, synergyMatrix, counterMatrix, bpSequences] =
    await Promise.all([
      generateChampionStats(config),
      generatePlayerPools(undefined, config),
      buildSynergyMatrix(config),
      buildCounterMatrix(config),
      parseBPHistory(config),
    ]);

  const generatedAt = new Date();
  const expiresAt = new Date(generatedAt.getTime() + config.cacheTTL);

  const cache: L0DataCache = {
    championStats,
    playerPools,
    synergyMatrix,
    counterMatrix,
    bpSequences,
    generatedAt,
    expiresAt,
    version: '1.0.0',
  };

  const duration = Date.now() - startTime;
  console.log(`L0 data generation completed in ${duration}ms`);
  console.log(`- Champions: ${championStats.size}`);
  console.log(`- Players: ${playerPools.size}`);
  console.log(`- Synergy relations: ${synergyMatrix.size}`);
  console.log(`- Counter relations: ${counterMatrix.size}`);
  console.log(`- BP sequences: ${bpSequences.length}`);

  return cache;
}

/**
 * Check if cache is expired
 */
function isCacheExpired(cache: L0DataCache, config: L0Config): boolean {
  return new Date() > cache.expiresAt;
}

/**
 * Get cached L0 data (returns null if not cached)
 */
export function getCachedL0Data(): L0DataCache | null {
  return globalCache;
}

/**
 * Clear cache
 */
export function clearL0Cache(): void {
  globalCache = null;
  console.log('L0 cache cleared');
}

/**
 * Get cache status
 */
export function getCacheStatus(): {
  isCached: boolean;
  isExpired: boolean;
  generatedAt: Date | null;
  expiresAt: Date | null;
} {
  if (!globalCache) {
    return {
      isCached: false,
      isExpired: true,
      generatedAt: null,
      expiresAt: null,
    };
  }

  return {
    isCached: true,
    isExpired: isCacheExpired(globalCache, DEFAULT_L0_CONFIG),
    generatedAt: globalCache.generatedAt,
    expiresAt: globalCache.expiresAt,
  };
}

/**
 * Refresh L0 data (force regeneration)
 */
export async function refreshL0Data(
  config: L0Config = DEFAULT_L0_CONFIG
): Promise<L0DataCache> {
  console.log('Forcing L0 data refresh...');
  return loadL0Data(config, true);
}

/**
 * Preload L0 data in the background
 */
export function preloadL0Data(config: L0Config = DEFAULT_L0_CONFIG): void {
  loadL0Data(config).catch(error => {
    console.error('Error preloading L0 data:', error);
  });
}

// ============ Convenience Accessors ============

/**
 * Get champion stats (with automatic cache loading)
 */
export async function getChampionStats(
  championId: string,
  config?: L0Config
): Promise<ChampionStats | undefined> {
  const cache = await loadL0Data(config);
  return cache.championStats.get(championId);
}

/**
 * Get all champion stats (with automatic cache loading)
 */
export async function getAllChampionStats(
  config?: L0Config
): Promise<Map<string, ChampionStats>> {
  const cache = await loadL0Data(config);
  return cache.championStats;
}

/**
 * Get player pool (with automatic cache loading)
 */
export async function getPlayerPool(
  playerId: string,
  config?: L0Config
): Promise<PlayerPool | undefined> {
  const cache = await loadL0Data(config);
  return cache.playerPools.get(playerId);
}

/**
 * Get all player pools (with automatic cache loading)
 */
export async function getAllPlayerPools(
  config?: L0Config
): Promise<Map<string, PlayerPool>> {
  const cache = await loadL0Data(config);
  return cache.playerPools;
}

/**
 * Get champion synergies (with automatic cache loading)
 */
export async function getChampionSynergies(
  championId: string,
  config?: L0Config
): Promise<SynergyRelation[]> {
  const cache = await loadL0Data(config);
  return cache.synergyMatrix.get(championId) || [];
}

/**
 * Get synergy matrix (with automatic cache loading)
 */
export async function getSynergyMatrix(
  config?: L0Config
): Promise<Map<string, SynergyRelation[]>> {
  const cache = await loadL0Data(config);
  return cache.synergyMatrix;
}

/**
 * Get champion counters (with automatic cache loading)
 */
export async function getChampionCounters(
  championId: string,
  config?: L0Config
): Promise<CounterRelation[]> {
  const cache = await loadL0Data(config);
  return cache.counterMatrix.get(championId) || [];
}

/**
 * Get counter matrix (with automatic cache loading)
 */
export async function getCounterMatrix(
  config?: L0Config
): Promise<Map<string, CounterRelation[]>> {
  const cache = await loadL0Data(config);
  return cache.counterMatrix;
}

/**
 * Get BP sequences (with automatic cache loading)
 */
export async function getBPSequences(config?: L0Config): Promise<BPSequence[]> {
  const cache = await loadL0Data(config);
  return cache.bpSequences;
}

// ============ Export all L0 modules ============

export * from './champion-stats';
export * from './player-pools';
export * from './synergy-matrix';
export * from './counter-matrix';
export * from './bp-history-parser';
