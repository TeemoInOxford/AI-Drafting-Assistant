/**
 * Recommendation Cache System
 * 推荐缓存系统 - 优化性能，减少重复计算
 */

import { BanScoreResult } from './advanced-ban-scoring.types';
import { PTSResult, BPState } from './types';

/**
 * 缓存条目
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  hits: number;
}

/**
 * 缓存配置
 */
export interface CacheConfig {
  maxSize: number;           // 最大缓存条目数
  ttl: number;               // 生存时间（毫秒）
  enableStats: boolean;      // 是否启用统计
}

/**
 * 缓存统计
 */
export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
  avgHitCount: number;
}

/**
 * 推荐缓存类
 */
export class RecommendationCache<T = any> {
  private cache: Map<string, CacheEntry<T>>;
  private config: CacheConfig;
  private stats: {
    hits: number;
    misses: number;
  };

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      maxSize: 1000,
      ttl: 5 * 60 * 1000, // 5分钟
      enableStats: true,
      ...config,
    };

    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
    };
  }

  /**
   * 获取缓存数据
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      if (this.config.enableStats) {
        this.stats.misses++;
      }
      return null;
    }

    // 检查是否过期
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      if (this.config.enableStats) {
        this.stats.misses++;
      }
      return null;
    }

    // 更新命中次数
    entry.hits++;

    if (this.config.enableStats) {
      this.stats.hits++;
    }

    return entry.data;
  }

  /**
   * 设置缓存数据
   */
  set(key: string, data: T): void {
    // 检查缓存大小
    if (this.cache.size >= this.config.maxSize) {
      this.evict();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      hits: 0,
    });
  }

  /**
   * 删除缓存数据
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
  }

  /**
   * 获取缓存统计
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;

    let totalHits = 0;
    for (const entry of this.cache.values()) {
      totalHits += entry.hits;
    }
    const avgHitCount = this.cache.size > 0 ? totalHits / this.cache.size : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.cache.size,
      hitRate,
      avgHitCount,
    };
  }

  /**
   * 检查是否过期
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp > this.config.ttl;
  }

  /**
   * 驱逐策略：LRU（最少使用）
   */
  private evict(): void {
    // 找出命中次数最少的条目
    let minHits = Infinity;
    let keyToEvict: string | null = null;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.hits < minHits) {
        minHits = entry.hits;
        keyToEvict = key;
      }
    }

    if (keyToEvict) {
      this.cache.delete(keyToEvict);
    }
  }
}

/**
 * Ban推荐缓存
 */
export class BanRecommendationCache extends RecommendationCache<BanScoreResult[]> {
  /**
   * 生成缓存键
   */
  static generateKey(bpState: BPState, enemyTeamId?: string): string {
    const bans = [
      ...bpState.blueBans.map(b => b.champion?.id || 'null'),
      ...bpState.redBans.map(b => b.champion?.id || 'null'),
    ].join(',');

    const picks = [
      ...bpState.bluePicks.map(p => p?.id || 'null'),
      ...bpState.redPicks.map(p => p?.id || 'null'),
    ].join(',');

    return `ban:${bpState.currentStep}:${bans}:${picks}:${enemyTeamId || 'unknown'}`;
  }

  /**
   * 获取缓存的Ban推荐
   */
  getCached(bpState: BPState, enemyTeamId?: string): BanScoreResult[] | null {
    const key = BanRecommendationCache.generateKey(bpState, enemyTeamId);
    return this.get(key);
  }

  /**
   * 缓存Ban推荐
   */
  setCached(bpState: BPState, results: BanScoreResult[], enemyTeamId?: string): void {
    const key = BanRecommendationCache.generateKey(bpState, enemyTeamId);
    this.set(key, results);
  }
}

/**
 * PTS推荐缓存
 */
export class PTSRecommendationCache extends RecommendationCache<PTSResult[]> {
  /**
   * 生成缓存键
   */
  static generateKey(bpState: BPState, side: 'blue' | 'red'): string {
    const picks = side === 'blue'
      ? bpState.bluePicks.map(p => p?.id || 'null').join(',')
      : bpState.redPicks.map(p => p?.id || 'null').join(',');

    const opponentPicks = side === 'blue'
      ? bpState.redPicks.map(p => p?.id || 'null').join(',')
      : bpState.bluePicks.map(p => p?.id || 'null').join(',');

    return `pts:${bpState.currentStep}:${side}:${picks}:${opponentPicks}`;
  }

  /**
   * 获取缓存的PTS推荐
   */
  getCached(bpState: BPState, side: 'blue' | 'red'): PTSResult[] | null {
    const key = PTSRecommendationCache.generateKey(bpState, side);
    return this.get(key);
  }

  /**
   * 缓存PTS推荐
   */
  setCached(bpState: BPState, results: PTSResult[], side: 'blue' | 'red'): void {
    const key = PTSRecommendationCache.generateKey(bpState, side);
    this.set(key, results);
  }
}

/**
 * 全局缓存实例
 */
let globalBanCache: BanRecommendationCache | null = null;
let globalPTSCache: PTSRecommendationCache | null = null;

/**
 * 获取Ban推荐缓存
 */
export function getBanCache(config?: Partial<CacheConfig>): BanRecommendationCache {
  if (!globalBanCache) {
    globalBanCache = new BanRecommendationCache(config);
  }
  return globalBanCache;
}

/**
 * 获取PTS推荐缓存
 */
export function getPTSCache(config?: Partial<CacheConfig>): PTSRecommendationCache {
  if (!globalPTSCache) {
    globalPTSCache = new PTSRecommendationCache(config);
  }
  return globalPTSCache;
}

/**
 * 并行计算Ban分数（带缓存）
 */
export async function calculateBanScoresParallel(
  champions: Champion[],
  bpState: BPState,
  enemyTeamPool: any | null,
  calculateFn: (champion: Champion) => Promise<BanScoreResult>,
  batchSize: number = 20
): Promise<BanScoreResult[]> {
  // 检查缓存
  const cache = getBanCache();
  const cached = cache.getCached(bpState, enemyTeamPool?.teamId);

  if (cached) {
    console.log('[Cache] Ban recommendations cache hit');
    return cached;
  }

  console.log('[Cache] Ban recommendations cache miss, calculating...');

  // 分批并行计算
  const results: BanScoreResult[] = [];
  const batches: Champion[][] = [];

  for (let i = 0; i < champions.length; i += batchSize) {
    batches.push(champions.slice(i, i + batchSize));
  }

  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map(champion => calculateFn(champion))
    );
    results.push(...batchResults);
  }

  // 缓存结果
  cache.setCached(bpState, results, enemyTeamPool?.teamId);

  return results;
}

/**
 * 并行计算PTS分数（带缓存）
 */
export async function calculatePTSScoresParallel(
  champions: Champion[],
  bpState: BPState,
  side: 'blue' | 'red',
  calculateFn: (champion: Champion) => Promise<PTSResult>,
  batchSize: number = 20
): Promise<PTSResult[]> {
  // 检查缓存
  const cache = getPTSCache();
  const cached = cache.getCached(bpState, side);

  if (cached) {
    console.log('[Cache] PTS recommendations cache hit');
    return cached;
  }

  console.log('[Cache] PTS recommendations cache miss, calculating...');

  // 分批并行计算
  const results: PTSResult[] = [];
  const batches: Champion[][] = [];

  for (let i = 0; i < champions.length; i += batchSize) {
    batches.push(champions.slice(i, i + batchSize));
  }

  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map(champion => calculateFn(champion))
    );
    results.push(...batchResults);
  }

  // 缓存结果
  cache.setCached(bpState, results, side);

  return results;
}

/**
 * 打印缓存统计
 */
export function printCacheStats(): void {
  const banCache = getBanCache();
  const ptsCache = getPTSCache();

  const banStats = banCache.getStats();
  const ptsStats = ptsCache.getStats();

  console.log('========== Cache Statistics ==========');
  console.log('Ban Cache:');
  console.log(`  Hits: ${banStats.hits}, Misses: ${banStats.misses}`);
  console.log(`  Hit Rate: ${(banStats.hitRate * 100).toFixed(2)}%`);
  console.log(`  Size: ${banStats.size}, Avg Hits: ${banStats.avgHitCount.toFixed(2)}`);

  console.log('PTS Cache:');
  console.log(`  Hits: ${ptsStats.hits}, Misses: ${ptsStats.misses}`);
  console.log(`  Hit Rate: ${(ptsStats.hitRate * 100).toFixed(2)}%`);
  console.log(`  Size: ${ptsStats.size}, Avg Hits: ${ptsStats.avgHitCount.toFixed(2)}`);
  console.log('======================================');
}

// 导入Champion类型
import { Champion } from './types';
