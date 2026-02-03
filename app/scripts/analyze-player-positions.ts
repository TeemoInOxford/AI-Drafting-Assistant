/**
 * Analyze Player Positions
 *
 * 遍历所有比赛，使用游戏统计数据推断位置
 * 统计每个选手在不同位置的场次
 * 找出有多个位置的选手
 */

import * as fs from 'fs';
import * as path from 'path';
import { CHAMPION_POSITIONS } from '../lib/positions';
import { Position } from '../lib/types';

const ALL_ROLES: Position[] = ['top', 'jungle', 'mid', 'bot', 'support'];

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

function findChampionPrior(championName: string): Position[] {
  if (CHAMPION_POSITIONS[championName]) {
    return CHAMPION_POSITIONS[championName];
  }

  const normalized = normalizeChampionName(championName);
  for (const [key, positions] of Object.entries(CHAMPION_POSITIONS)) {
    if (normalizeChampionName(key) === normalized) {
      return positions;
    }
  }

  const specialMappings: Record<string, string> = {
    'jarvaniv': 'JarvanIV',
    'jarvan iv': 'JarvanIV',
    'reksai': 'RekSai',
    'leesin': 'LeeSin',
    'lee sin': 'LeeSin',
    'missfortune': 'MissFortune',
    'miss fortune': 'MissFortune',
    'twistedfate': 'TwistedFate',
    'twisted fate': 'TwistedFate',
    'tahmkench': 'TahmKench',
    'tahm kench': 'TahmKench',
    'xinzhao': 'XinZhao',
    'xin zhao': 'XinZhao',
    'aurelionsol': 'AurelionSol',
    'aurelion sol': 'AurelionSol',
    'drmundo': 'DrMundo',
    'dr. mundo': 'DrMundo',
    'masteryi': 'MasterYi',
    'master yi': 'MasterYi',
    'monkeyking': 'MonkeyKing',
    'wukong': 'MonkeyKing',
    'renataglasc': 'Renata',
    'renata glasc': 'Renata',
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
  championPrior: Position[];
}

interface InferredPlayer extends PlayerStats {
  inferredRole: Position;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

function inferPositions(teamPlayers: PlayerStats[]): InferredPlayer[] {
  if (teamPlayers.length !== 5) {
    return [];
  }

  const result: InferredPlayer[] = [];
  const usedRoles = new Set<Position>();

  // 按 neutralMinion 排序，最高的是打野
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

  // 剩余玩家按 minion CS 排序
  const remaining = teamPlayers.filter(p => p !== junglePlayer);
  const sortedByMinion = [...remaining].sort((a, b) => b.minion - a.minion);

  // 确定辅助 (minion CS 最低)
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

  // 剩下3人是 top/mid/bot
  const laners = remaining.filter(p => p !== supportPlayer);
  const remainingRoles = ALL_ROLES.filter(r => !usedRoles.has(r));

  interface Assignment {
    player: PlayerStats;
    role: Position;
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
  const assignedRoles = new Set<Position>();

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

  // 未分配的玩家
  for (const player of teamPlayers) {
    if (result.find(r => r.playerId === player.playerId)) continue;
    const role = remainingRoles.find(r => !usedRoles.has(r)) || 'mid';
    usedRoles.add(role as Position);
    result.push({
      ...player,
      inferredRole: role as Position,
      confidence: 'LOW',
    });
  }

  return result;
}

// 选手位置统计
interface PlayerPositionStats {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  positions: Record<Position, number>;
  totalGames: number;
  champions: Record<Position, string[]>;  // 每个位置用过的英雄
}

async function main() {
  console.log('=== ANALYZE PLAYER POSITIONS ===\n');

  const dataDir = path.join(process.cwd(), 'data/grid_v2');
  const files = fs.readdirSync(dataDir).filter(f => f.startsWith('series_') && f.endsWith('.json'));

  console.log(`Found ${files.length} series files\n`);

  // playerId -> PlayerPositionStats
  const playerStats = new Map<string, PlayerPositionStats>();

  let totalSeries = 0;
  let totalGames = 0;
  let skippedGames = 0;

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    const series: Series = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    if (!series.games || series.games.length === 0) continue;
    totalSeries++;

    const seriesTeamNames: Record<string, string> = {};
    if (series.teams) {
      for (const t of series.teams) {
        seriesTeamNames[t.id] = t.name;
      }
    }

    for (const game of series.games) {
      if (!game.teams || game.teams.length !== 2) continue;

      for (const team of game.teams) {
        if (!team.players || team.players.length !== 5) {
          skippedGames++;
          continue;
        }

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
          let stats = playerStats.get(inf.playerId);
          if (!stats) {
            stats = {
              playerId: inf.playerId,
              playerName: inf.playerName,
              teamId: team.id,
              teamName: teamName,
              positions: { top: 0, jungle: 0, mid: 0, bot: 0, support: 0 },
              totalGames: 0,
              champions: { top: [], jungle: [], mid: [], bot: [], support: [] },
            };
            playerStats.set(inf.playerId, stats);
          }

          // 更新最新的队伍名
          stats.teamName = teamName;
          stats.positions[inf.inferredRole]++;
          stats.totalGames++;

          // 记录该位置使用的英雄
          if (!stats.champions[inf.inferredRole].includes(inf.champion)) {
            stats.champions[inf.inferredRole].push(inf.champion);
          }
        }

        totalGames++;
      }
    }
  }

  console.log(`Processed: ${totalSeries} series, ${totalGames} team-games`);
  console.log(`Skipped: ${skippedGames} team-games (incomplete data)\n`);

  // 找出有多个位置的选手
  const multiPositionPlayers: PlayerPositionStats[] = [];

  for (const stats of playerStats.values()) {
    const positionsPlayed = ALL_ROLES.filter(r => stats.positions[r] > 0);
    if (positionsPlayed.length > 1) {
      multiPositionPlayers.push(stats);
    }
  }

  // 按总场次排序
  multiPositionPlayers.sort((a, b) => b.totalGames - a.totalGames);

  console.log(`=== 有多个位置的选手 (共 ${multiPositionPlayers.length} 人) ===\n`);

  // 输出表格
  console.log('| 战队 | 选手 | 总场次 | Top | Jungle | Mid | Bot | Support | 主位置 | 副位置详情 |');
  console.log('|------|------|--------|-----|--------|-----|-----|---------|--------|------------|');

  for (const stats of multiPositionPlayers) {
    // 确定主位置（场次最多的）
    let mainRole: Position = 'mid';
    let maxGames = 0;
    for (const role of ALL_ROLES) {
      if (stats.positions[role] > maxGames) {
        maxGames = stats.positions[role];
        mainRole = role;
      }
    }

    // 副位置详情
    const secondaryDetails: string[] = [];
    for (const role of ALL_ROLES) {
      if (role !== mainRole && stats.positions[role] > 0) {
        const champs = stats.champions[role].slice(0, 3).join(', ');
        secondaryDetails.push(`${role}(${stats.positions[role]}场: ${champs})`);
      }
    }

    const top = stats.positions.top || '-';
    const jg = stats.positions.jungle || '-';
    const mid = stats.positions.mid || '-';
    const bot = stats.positions.bot || '-';
    const sup = stats.positions.support || '-';

    console.log(`| ${stats.teamName.slice(0, 20).padEnd(20)} | ${stats.playerName.padEnd(12)} | ${String(stats.totalGames).padStart(6)} | ${String(top).padStart(3)} | ${String(jg).padStart(6)} | ${String(mid).padStart(3)} | ${String(bot).padStart(3)} | ${String(sup).padStart(7)} | ${mainRole.padEnd(7)} | ${secondaryDetails.join('; ').slice(0, 60)} |`);
  }

  // 输出 JSON 供后续使用
  const outputPath = path.join(dataDir, 'player_position_analysis.json');
  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      totalSeries,
      totalGames,
      skippedGames,
      totalPlayers: playerStats.size,
      multiPositionPlayers: multiPositionPlayers.length,
    },
    players: multiPositionPlayers.map(p => ({
      playerId: p.playerId,
      playerName: p.playerName,
      teamName: p.teamName,
      totalGames: p.totalGames,
      positions: p.positions,
      champions: p.champions,
    })),
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n\nJSON 已保存至: ${outputPath}`);

  // 统计摘要
  console.log('\n=== 摘要 ===');
  console.log(`总选手数: ${playerStats.size}`);
  console.log(`有多位置的选手: ${multiPositionPlayers.length}`);

  // 按副位置场次分类
  const bySecondaryGames: Record<string, number> = {
    '1场': 0,
    '2-5场': 0,
    '6-10场': 0,
    '10场以上': 0,
  };

  for (const stats of multiPositionPlayers) {
    let mainRole: Position = 'mid';
    let maxGames = 0;
    for (const role of ALL_ROLES) {
      if (stats.positions[role] > maxGames) {
        maxGames = stats.positions[role];
        mainRole = role;
      }
    }

    const secondaryGames = stats.totalGames - maxGames;
    if (secondaryGames === 1) bySecondaryGames['1场']++;
    else if (secondaryGames <= 5) bySecondaryGames['2-5场']++;
    else if (secondaryGames <= 10) bySecondaryGames['6-10场']++;
    else bySecondaryGames['10场以上']++;
  }

  console.log('\n副位置场次分布:');
  for (const [range, count] of Object.entries(bySecondaryGames)) {
    console.log(`  ${range}: ${count} 人`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
