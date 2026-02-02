/**
 * Champion Stats Helper
 * 提供英雄统计数据的辅助函数
 *
 * TODO: 这些数据应该从真实的职业比赛数据库中获取
 * 目前使用模拟数据作为占位符
 */

/**
 * 获取英雄统计数据
 * @param championId 英雄ID
 * @returns 英雄统计数据（胜率、Ban率、Pick率）
 */
export function getChampionStats(championId: string): {
  winRate: number;
  banRate: number;
  pickRate: number;
} {
  // TODO: 从数据库或API获取真实数据
  // 目前返回基于英雄名称的模拟数据

  // 高优先级英雄列表（通常在职业比赛中很强势）
  const highPriorityChampions = [
    'Aatrox', 'Azir', 'Kalista', 'Sylas', 'Yone', 'KSante', 'Xayah',
    'Varus', 'Jax', 'Graves', 'Nautilus', 'Thresh', 'Renekton',
    'Orianna', 'Ahri', 'Zeri', 'Aphelios', 'Jinx', 'Caitlyn',
    'Lee Sin', 'Jarvan IV', 'Vi', 'Sejuani', 'Maokai', 'Ornn',
  ];

  // 中等优先级英雄
  const mediumPriorityChampions = [
    'Gnar', 'Jayce', 'Fiora', 'Camille', 'Gangplank',
    'Twisted Fate', 'Syndra', 'Viktor', 'Cassiopeia',
    'Kai\'Sa', 'Ezreal', 'Lucian', 'Ashe', 'Miss Fortune',
    'Elise', 'Nidalee', 'Kindred', 'Kha\'Zix',
    'Leona', 'Alistar', 'Rakan', 'Braum', 'Lulu',
  ];

  const isHighPriority = highPriorityChampions.includes(championId);
  const isMediumPriority = mediumPriorityChampions.includes(championId);

  if (isHighPriority) {
    // 高优先级英雄：高胜率、高Ban率、高Pick率
    return {
      winRate: 50 + Math.random() * 8, // 50-58%
      banRate: 20 + Math.random() * 30, // 20-50%
      pickRate: 15 + Math.random() * 20, // 15-35%
    };
  } else if (isMediumPriority) {
    // 中等优先级英雄：中等数据
    return {
      winRate: 48 + Math.random() * 6, // 48-54%
      banRate: 10 + Math.random() * 15, // 10-25%
      pickRate: 8 + Math.random() * 12, // 8-20%
    };
  } else {
    // 低优先级英雄：较低数据
    return {
      winRate: 46 + Math.random() * 8, // 46-54%
      banRate: 2 + Math.random() * 10, // 2-12%
      pickRate: 2 + Math.random() * 8, // 2-10%
    };
  }
}

/**
 * 批量获取英雄统计数据
 * @param championIds 英雄ID列表
 * @returns Map<championId, stats>
 */
export function getChampionStatsMap(
  championIds: string[]
): Map<string, { winRate: number; banRate: number; pickRate: number }> {
  const statsMap = new Map();

  for (const championId of championIds) {
    statsMap.set(championId, getChampionStats(championId));
  }

  return statsMap;
}

/**
 * 从真实数据源获取统计数据（未来实现）
 * @param championId 英雄ID
 * @param patch 版本号
 * @param region 赛区
 */
export async function fetchRealChampionStats(
  championId: string,
  patch?: string,
  region?: string
): Promise<{
  winRate: number;
  banRate: number;
  pickRate: number;
} | null> {
  // TODO: 实现从GRID API或其他数据源获取真实数据
  // 例如：
  // const response = await fetch(`/api/lol/champion-stats?id=${championId}&patch=${patch}&region=${region}`);
  // const data = await response.json();
  // return data.stats;

  console.warn('fetchRealChampionStats not implemented yet, using mock data');
  return getChampionStats(championId);
}

/**
 * 获取版本Meta英雄列表
 * @param patch 版本号
 * @returns 高优先级英雄ID列表
 */
export function getMetaChampions(patch?: string): string[] {
  // TODO: 从数据库获取当前版本的Meta英雄
  return [
    'Aatrox', 'Azir', 'Kalista', 'Sylas', 'Yone', 'KSante', 'Xayah',
    'Varus', 'Jax', 'Graves', 'Nautilus', 'Thresh',
  ];
}

/**
 * 获取英雄在特定位置的统计数据
 * @param championId 英雄ID
 * @param position 位置
 */
export function getChampionStatsByPosition(
  championId: string,
  position: 'top' | 'jungle' | 'mid' | 'bot' | 'support'
): {
  winRate: number;
  banRate: number;
  pickRate: number;
  games: number;
} {
  // TODO: 实现按位置的统计数据
  const baseStats = getChampionStats(championId);

  return {
    ...baseStats,
    games: Math.floor(Math.random() * 100) + 50, // 50-150场
  };
}
