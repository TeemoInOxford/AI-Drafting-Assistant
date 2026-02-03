/**
 * Compare position inference before and after champion prior changes
 * Show which players had their positions changed
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

// 旧的 prior（修改前）
const OLD_CHAMPION_POSITIONS: Record<string, string[]> = {
  Corki: ['mid'],
  Ezreal: ['bot'],
};

// 新的 prior（修改后）
const NEW_CHAMPION_POSITIONS: Record<string, string[]> = {
  Corki: ['mid', 'bot'],
  Ezreal: ['bot', 'mid'],
};

function findChampionPrior(championName: string, useOld: boolean): string[] {
  const { CHAMPION_POSITIONS } = require('../lib/positions');

  // 如果是 Corki 或 Ezreal，使用指定的版本
  if (useOld) {
    if (championName === 'Corki') return OLD_CHAMPION_POSITIONS.Corki;
    if (championName === 'Ezreal') return OLD_CHAMPION_POSITIONS.Ezreal;
  }

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

interface PositionChange {
  seriesId: string;
  gameNumber: number;
  date: string;
  playerId: string;
  playerName: string;
  teamName: string;
  champion: string;
  oldRole: string;
  newRole: string;
  neutralMinion: number;
  minion: number;
}

async function main() {
  const dataDir = path.join(process.cwd(), 'data/grid_v2');
  const files = fs.readdirSync(dataDir).filter(f => f.startsWith('series_') && f.endsWith('.json'));

  console.log('正在对比修改前后的位置推断差异...\n');

  const changes: PositionChange[] = [];
  let totalGames = 0;

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

        totalGames++;

        const teamName = seriesTeamNames[team.id] || team.name || 'Unknown';

        // 使用旧 prior 推断
        const oldPlayerStats: PlayerStats[] = team.players.map(p => ({
          playerId: p.id,
          playerName: p.name,
          champion: p.character?.name || 'Unknown',
          neutralMinion: getUnitKillCount(p, 'neutralMinion'),
          minion: getUnitKillCount(p, 'minion'),
          championPrior: findChampionPrior(p.character?.name || '', true)
        }));

        const oldInferred = inferPositions(oldPlayerStats);

        // 使用新 prior 推断
        const newPlayerStats: PlayerStats[] = team.players.map(p => ({
          playerId: p.id,
          playerName: p.name,
          champion: p.character?.name || 'Unknown',
          neutralMinion: getUnitKillCount(p, 'neutralMinion'),
          minion: getUnitKillCount(p, 'minion'),
          championPrior: findChampionPrior(p.character?.name || '', false)
        }));

        const newInferred = inferPositions(newPlayerStats);

        // 对比差异
        for (let i = 0; i < oldInferred.length; i++) {
          const oldPlayer = oldInferred[i];
          const newPlayer = newInferred.find(p => p.playerId === oldPlayer.playerId);

          if (newPlayer && oldPlayer.inferredRole !== newPlayer.inferredRole) {
            changes.push({
              seriesId: series.id,
              gameNumber: game.sequenceNumber,
              date: series.startedAt?.slice(0, 10) || 'N/A',
              playerId: oldPlayer.playerId,
              playerName: oldPlayer.playerName,
              teamName: teamName,
              champion: oldPlayer.champion,
              oldRole: oldPlayer.inferredRole,
              newRole: newPlayer.inferredRole,
              neutralMinion: oldPlayer.neutralMinion,
              minion: oldPlayer.minion,
            });
          }
        }
      }
    }
  }

  console.log(`总比赛数: ${totalGames}`);
  console.log(`位置发生变化的选手: ${changes.length}\n`);

  console.log('='.repeat(120));
  console.log('位置推断变化详情\n');
  console.log('| # | 选手 | 战队 | 英雄 | 旧位置 | 新位置 | Series ID | Game | 日期 | Neutral | Minion |');
  console.log('|---|------|------|------|--------|--------|-----------|------|------|---------|--------|');

  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    console.log(`| ${String(i + 1).padStart(3)} | ${c.playerName.padEnd(12)} | ${c.teamName.slice(0, 20).padEnd(20)} | ${c.champion.padEnd(12)} | ${c.oldRole.padEnd(7)} | ${c.newRole.padEnd(7)} | ${c.seriesId.padEnd(9)} | ${String(c.gameNumber).padStart(4)} | ${c.date} | ${String(c.neutralMinion).padStart(7)} | ${String(c.minion).padStart(6)} |`);
  }

  console.log('\n' + '='.repeat(120));

  // 统计每个选手的变化次数
  const playerChangeCount = new Map<string, { playerName: string; count: number; changes: Array<{ oldRole: string; newRole: string; champion: string }> }>();

  for (const change of changes) {
    const key = change.playerId;
    if (!playerChangeCount.has(key)) {
      playerChangeCount.set(key, {
        playerName: change.playerName,
        count: 0,
        changes: [],
      });
    }
    const stats = playerChangeCount.get(key)!;
    stats.count++;
    stats.changes.push({
      oldRole: change.oldRole,
      newRole: change.newRole,
      champion: change.champion,
    });
  }

  const sortedPlayers = Array.from(playerChangeCount.values()).sort((a, b) => b.count - a.count);

  console.log('\n\n=== 按选手统计位置变化 ===\n');
  console.log('| # | 选手 | 变化次数 | 主要变化 |');
  console.log('|---|------|----------|----------|');

  for (let i = 0; i < sortedPlayers.length; i++) {
    const p = sortedPlayers[i];
    const mainChange = `${p.changes[0].oldRole}→${p.changes[0].newRole}`;
    console.log(`| ${String(i + 1).padStart(3)} | ${p.playerName.padEnd(15)} | ${String(p.count).padStart(8)} | ${mainChange} |`);
  }

  console.log('\n' + '='.repeat(120));
  console.log(`\n总计: ${changes.length} 次位置变化，涉及 ${sortedPlayers.length} 个选手\n`);

  // 统计变化类型
  const changeTypes = new Map<string, number>();
  for (const change of changes) {
    const key = `${change.oldRole}→${change.newRole}`;
    changeTypes.set(key, (changeTypes.get(key) || 0) + 1);
  }

  console.log('=== 位置变化类型统计 ===\n');
  const sortedTypes = Array.from(changeTypes.entries()).sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sortedTypes) {
    console.log(`  ${type.padEnd(20)} ${count} 次`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
