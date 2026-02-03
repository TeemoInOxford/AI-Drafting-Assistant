/**
 * Generate a table showing all possible positions for each player
 * Based on position inference algorithm
 */

import * as fs from 'fs';
import * as path from 'path';

interface UnitKill {
  unitName: string;
  count: number;
}

interface Character {
  id: string;
  name: string;
}

interface Player {
  id: string;
  name: string;
  character?: Character;
  unitKills?: UnitKill[];
}

interface Team {
  id: string;
  name: string;
  side: string;
  players?: Player[];
}

interface Game {
  id: string;
  sequenceNumber: number;
  teams?: Team[];
}

interface Series {
  id: string;
  startedAt?: string;
  teams?: { id: string; name: string }[];
  games?: Game[];
}

function getUnitKillCount(player: Player, unitName: string): number {
  if (!player.unitKills) return 0;
  const kill = player.unitKills.find(u => u.unitName === unitName);
  return kill?.count || 0;
}

function normalizeChampionName(name: string): string {
  return name
    .replace(/\s+/g, '')
    .replace(/'/g, '')
    .replace(/\./g, '')
    .toLowerCase();
}

function findChampionPrior(championName: string): string[] {
  const { CHAMPION_POSITIONS } = require('../lib/positions');

  if (CHAMPION_POSITIONS[championName]) {
    return CHAMPION_POSITIONS[championName];
  }

  const normalized = normalizeChampionName(championName);
  for (const [key, positions] of Object.entries(CHAMPION_POSITIONS)) {
    if (normalizeChampionName(key) === normalized) {
      return positions as string[];
    }
  }

  const specialMappings: Record<string, string> = {
    'jarvaniv': 'JarvanIV',
    'reksai': 'RekSai',
    'leesin': 'LeeSin',
    'missfortune': 'MissFortune',
    'twistedfate': 'TwistedFate',
    'tahmkench': 'TahmKench',
    'xinzhao': 'XinZhao',
    'aurelionsol': 'AurelionSol',
    'drmundo': 'DrMundo',
    'masteryi': 'MasterYi',
    'monkeyking': 'MonkeyKing',
    'wukong': 'MonkeyKing',
    'renataglasc': 'Renata',
  };

  const mapped = specialMappings[normalized];
  if (mapped && CHAMPION_POSITIONS[mapped]) {
    return CHAMPION_POSITIONS[mapped];
  }

  return [];
}

interface PlayerStats {
  playerId: string;
  playerName: string;
  champion: string;
  neutralMinion: number;
  minion: number;
  championPrior: string[];
}

interface InferredPlayer extends PlayerStats {
  inferredRole: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

function inferPositions(teamPlayers: PlayerStats[]): InferredPlayer[] {
  if (teamPlayers.length !== 5) {
    return [];
  }

  const ALL_ROLES = ['top', 'jungle', 'mid', 'bot', 'support'];
  const result: InferredPlayer[] = [];
  const usedRoles = new Set<string>();

  const sortedByNeutral = [...teamPlayers].sort((a, b) => b.neutralMinion - a.neutralMinion);
  const jungleCandidate = sortedByNeutral[0];
  let junglePlayer: PlayerStats | null = null;

  if (jungleCandidate.neutralMinion >= 80) {
    junglePlayer = jungleCandidate;
    usedRoles.add('jungle');
    result.push({
      ...jungleCandidate,
      inferredRole: 'jungle',
      confidence: jungleCandidate.neutralMinion >= 150 ? 'HIGH' : 'MEDIUM',
    });
  }

  const remaining = teamPlayers.filter(p => p !== junglePlayer);
  const sortedByMinion = [...remaining].sort((a, b) => b.minion - a.minion);
  const supportCandidate = sortedByMinion[sortedByMinion.length - 1];
  let supportPlayer: PlayerStats | null = null;

  if (supportCandidate && supportCandidate.minion < 100) {
    supportPlayer = supportCandidate;
    usedRoles.add('support');
    result.push({
      ...supportCandidate,
      inferredRole: 'support',
      confidence: supportCandidate.minion < 50 ? 'HIGH' : 'MEDIUM',
    });
  }

  const laners = remaining.filter(p => p !== supportPlayer);
  const remainingRoles = ALL_ROLES.filter(r => !usedRoles.has(r));

  interface Assignment {
    player: PlayerStats;
    role: string;
    score: number;
  }

  const assignments: Assignment[] = [];

  for (const player of laners) {
    for (const role of remainingRoles) {
      const hasRoleInPrior = player.championPrior.includes(role);
      const score = hasRoleInPrior ? 100 : 0;
      assignments.push({ player, role, score });
    }
  }

  assignments.sort((a, b) => b.score - a.score);
  const assignedPlayers = new Set<string>();
  const assignedRoles = new Set<string>();

  for (const a of assignments) {
    if (assignedPlayers.has(a.player.playerId) || assignedRoles.has(a.role)) continue;
    if (usedRoles.has(a.role)) continue;

    assignedPlayers.add(a.player.playerId);
    assignedRoles.add(a.role);
    usedRoles.add(a.role);

    result.push({
      ...a.player,
      inferredRole: a.role,
      confidence: a.score > 0 ? 'HIGH' : 'LOW',
    });
  }

  for (const player of teamPlayers) {
    if (result.find(r => r.playerId === player.playerId)) continue;
    const role = remainingRoles.find(r => !usedRoles.has(r)) || 'mid';
    usedRoles.add(role);
    result.push({
      ...player,
      inferredRole: role,
      confidence: 'LOW',
    });
  }

  return result;
}

async function main() {
  const dataDir = path.join(process.cwd(), 'data/grid_v2');
  const files = fs.readdirSync(dataDir).filter(f => f.startsWith('series_') && f.endsWith('.json'));

  console.log('正在分析所有选手的位置...\n');

  // 统计每个选手在各位置的场次
  const playerData = new Map<string, {
    playerId: string;
    playerName: string;
    teamName: string;
    positions: Set<string>;
    positionCounts: Record<string, number>;
  }>();

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    const series: Series = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    if (!series.games) continue;

    const seriesTeamNames: Record<string, string> = {};
    if (series.teams) {
      for (const t of series.teams) {
        seriesTeamNames[t.id] = t.name;
      }
    }

    for (const game of series.games) {
      if (!game.teams || game.teams.length !== 2) continue;

      for (const team of game.teams) {
        if (!team.players || team.players.length !== 5) continue;

        const teamName = seriesTeamNames[team.id] || team.name || 'Unknown';

        const teamPlayerStats: PlayerStats[] = team.players.map(p => ({
          playerId: p.id,
          playerName: p.name,
          champion: p.character?.name || 'Unknown',
          neutralMinion: getUnitKillCount(p, 'neutralMinion'),
          minion: getUnitKillCount(p, 'minion'),
          championPrior: findChampionPrior(p.character?.name || '')
        }));

        const inferred = inferPositions(teamPlayerStats);

        for (const inf of inferred) {
          const key = inf.playerId;
          if (!playerData.has(key)) {
            playerData.set(key, {
              playerId: inf.playerId,
              playerName: inf.playerName,
              teamName: teamName,
              positions: new Set<string>(),
              positionCounts: { top: 0, jungle: 0, mid: 0, bot: 0, support: 0 },
            });
          }

          const data = playerData.get(key)!;
          data.teamName = teamName;
          data.positions.add(inf.inferredRole);
          data.positionCounts[inf.inferredRole]++;
        }
      }
    }
  }

  // 转换为数组并排序
  const players = Array.from(playerData.values()).sort((a, b) => {
    // 先按位置数量排序（多位置的在前）
    const aPositions = a.positions.size;
    const bPositions = b.positions.size;
    if (aPositions !== bPositions) {
      return bPositions - aPositions;
    }
    // 再按选手名字排序
    return a.playerName.localeCompare(b.playerName);
  });

  console.log('='.repeat(120));
  console.log('所有选手的位置推断结果\n');
  console.log('| 选手ID | 选手姓名 | 所在战队 | 可能的位置 | 位置详情 |');
  console.log('|--------|----------|----------|------------|----------|');

  for (const player of players) {
    const positionsArray = Array.from(player.positions).sort();
    const positionsStr = positionsArray.join(', ');

    // 生成位置详情（显示每个位置的场次）
    const details = positionsArray
      .map(pos => `${pos}(${player.positionCounts[pos]})`)
      .join(', ');

    console.log(`| ${player.playerId.padEnd(6)} | ${player.playerName.padEnd(12)} | ${player.teamName.slice(0, 25).padEnd(25)} | ${positionsStr.padEnd(30)} | ${details} |`);
  }

  console.log('\n' + '='.repeat(120));

  // 统计
  const singlePositionPlayers = players.filter(p => p.positions.size === 1);
  const multiPositionPlayers = players.filter(p => p.positions.size > 1);

  console.log(`\n总选手数: ${players.length}`);
  console.log(`单一位置选手: ${singlePositionPlayers.length} (${(singlePositionPlayers.length / players.length * 100).toFixed(1)}%)`);
  console.log(`多位置选手: ${multiPositionPlayers.length} (${(multiPositionPlayers.length / players.length * 100).toFixed(1)}%)`);

  // 按位置数量分组统计
  const positionCountGroups = new Map<number, number>();
  for (const player of players) {
    const count = player.positions.size;
    positionCountGroups.set(count, (positionCountGroups.get(count) || 0) + 1);
  }

  console.log('\n位置数量分布:');
  for (const [count, num] of Array.from(positionCountGroups.entries()).sort((a, b) => a[0] - b[0])) {
    console.log(`  ${count}个位置: ${num} 人`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
