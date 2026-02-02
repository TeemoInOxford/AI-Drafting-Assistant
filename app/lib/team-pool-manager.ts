/**
 * Team Champion Pool Manager
 * 管理队伍英雄池的加载和缓存
 */

import { Champion } from './types';
import { PlayerPool } from './v4/types/l0-types';
import { TeamChampionPool, TeamSetupState, PlayerInTeam } from './team-champion-pool.types';
import { buildTeamChampionPool } from './team-champion-pool';

/**
 * 从 API 加载选手英雄池数据
 */
export async function loadPlayerPools(playerIds: string[]): Promise<Map<string, PlayerPool>> {
  try {
    const response = await fetch(`/api/lol/player-pools?playerIds=${playerIds.join(',')}`);
    const data = await response.json();

    if (!data.success) {
      console.error('Failed to load player pools:', data.error);
      return new Map();
    }

    const poolsMap = new Map<string, PlayerPool>();
    for (const [playerId, pool] of Object.entries(data.playerPools)) {
      poolsMap.set(playerId, pool as PlayerPool);
    }

    console.log(`[Team Pool Manager] Loaded ${poolsMap.size} player pools`);
    return poolsMap;
  } catch (error) {
    console.error('[Team Pool Manager] Error loading player pools:', error);
    return new Map();
  }
}

/**
 * 从战队设置构建双方队伍英雄池
 */
export async function buildTeamPools(
  teamSetup: TeamSetupState,
  allChampions: Champion[]
): Promise<{
  blueTeamPool: TeamChampionPool | null;
  redTeamPool: TeamChampionPool | null;
}> {
  let blueTeamPool: TeamChampionPool | null = null;
  let redTeamPool: TeamChampionPool | null = null;

  try {
    // 收集所有选手 ID
    const allPlayerIds: string[] = [];
    if (teamSetup.blueTeam.playerOrder.length > 0) {
      allPlayerIds.push(...teamSetup.blueTeam.playerOrder.map(p => p.playerId));
    }
    if (teamSetup.redTeam.playerOrder.length > 0) {
      allPlayerIds.push(...teamSetup.redTeam.playerOrder.map(p => p.playerId));
    }

    if (allPlayerIds.length === 0) {
      return { blueTeamPool, redTeamPool };
    }

    // 加载所有选手的英雄池数据
    console.log('[Team Pool Manager] Loading player pools for', allPlayerIds.length, 'players');
    const playerPoolsMap = await loadPlayerPools(allPlayerIds);

    // 构建蓝色方队伍英雄池
    if (teamSetup.blueTeam.teamId && teamSetup.blueTeam.playerOrder.length > 0) {
      console.log('[Team Pool Manager] Building blue team pool for', teamSetup.blueTeam.teamName);
      blueTeamPool = await buildTeamChampionPool(
        teamSetup.blueTeam.teamId,
        teamSetup.blueTeam.teamName,
        teamSetup.blueTeam.playerOrder,
        allChampions,
        playerPoolsMap
      );
      console.log(`[Team Pool Manager] Blue team pool: ${blueTeamPool.totalChampions} champions available`);
    }

    // 构建红色方队伍英雄池
    if (teamSetup.redTeam.teamId && teamSetup.redTeam.playerOrder.length > 0) {
      console.log('[Team Pool Manager] Building red team pool for', teamSetup.redTeam.teamName);
      redTeamPool = await buildTeamChampionPool(
        teamSetup.redTeam.teamId,
        teamSetup.redTeam.teamName,
        teamSetup.redTeam.playerOrder,
        allChampions,
        playerPoolsMap
      );
      console.log(`[Team Pool Manager] Red team pool: ${redTeamPool.totalChampions} champions available`);
    }
  } catch (error) {
    console.error('[Team Pool Manager] Error building team pools:', error);
  }

  return { blueTeamPool, redTeamPool };
}

/**
 * 获取当前操作方的队伍英雄池
 */
export function getCurrentTeamPool(
  currentTeam: 'blue' | 'red',
  blueTeamPool: TeamChampionPool | null,
  redTeamPool: TeamChampionPool | null
): TeamChampionPool | null {
  return currentTeam === 'blue' ? blueTeamPool : redTeamPool;
}

/**
 * 获取敌方队伍英雄池
 */
export function getEnemyTeamPool(
  currentTeam: 'blue' | 'red',
  blueTeamPool: TeamChampionPool | null,
  redTeamPool: TeamChampionPool | null
): TeamChampionPool | null {
  return currentTeam === 'blue' ? redTeamPool : blueTeamPool;
}
