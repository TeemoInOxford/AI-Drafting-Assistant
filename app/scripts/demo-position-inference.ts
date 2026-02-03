/**
 * Demo Position Inference
 *
 * 随机挑选10场比赛，使用游戏统计数据 (neutralMinion, minion) 推断位置
 * 输出结果供用户审核
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
  roles?: string[];
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
  // 标准化英雄名称
  return name
    .replace(/\s+/g, '')
    .replace(/'/g, '')
    .replace(/\./g, '')
    .toLowerCase();
}

function findChampionPrior(championName: string): Position[] {
  // 尝试直接匹配
  if (CHAMPION_POSITIONS[championName]) {
    return CHAMPION_POSITIONS[championName];
  }

  // 标准化后匹配
  const normalized = normalizeChampionName(championName);
  for (const [key, positions] of Object.entries(CHAMPION_POSITIONS)) {
    if (normalizeChampionName(key) === normalized) {
      return positions;
    }
  }

  // 特殊处理
  const specialMappings: Record<string, string> = {
    'jarvaniv': 'JarvanIV',
    'jarvan iv': 'JarvanIV',
    'reksai': 'RekSai',
    'rek\'sai': 'RekSai',
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
  reason: string;
}

function inferPositions(teamPlayers: PlayerStats[]): InferredPlayer[] {
  if (teamPlayers.length !== 5) {
    // 不是完整的5人阵容，跳过
    return teamPlayers.map(p => ({
      ...p,
      inferredRole: 'mid' as Position,
      confidence: 'LOW' as const,
      reason: '队伍人数不足5人'
    }));
  }

  const result: InferredPlayer[] = [];
  const usedRoles = new Set<Position>();

  // 按 neutralMinion 排序，最高的是打野
  const sortedByNeutral = [...teamPlayers].sort((a, b) => b.neutralMinion - a.neutralMinion);

  // 第一步：确定打野 (neutralMinion 最高且 >= 80)
  const jungleCandidate = sortedByNeutral[0];
  let junglePlayer: PlayerStats | null = null;

  if (jungleCandidate.neutralMinion >= 80) {
    junglePlayer = jungleCandidate;
    usedRoles.add('jungle');
    result.push({
      ...jungleCandidate,
      inferredRole: 'jungle',
      confidence: jungleCandidate.neutralMinion >= 150 ? 'HIGH' : 'MEDIUM',
      reason: `neutralMinion=${jungleCandidate.neutralMinion} (最高)`
    });
  }

  // 剩余玩家按 minion CS 排序
  const remaining = teamPlayers.filter(p => p !== junglePlayer);
  const sortedByMinion = [...remaining].sort((a, b) => b.minion - a.minion);

  // 第二步：确定辅助 (minion CS 最低且 < 100)
  const supportCandidate = sortedByMinion[sortedByMinion.length - 1];
  let supportPlayer: PlayerStats | null = null;

  if (supportCandidate.minion < 100) {
    supportPlayer = supportCandidate;
    usedRoles.add('support');
    result.push({
      ...supportCandidate,
      inferredRole: 'support',
      confidence: supportCandidate.minion < 50 ? 'HIGH' : 'MEDIUM',
      reason: `minion=${supportCandidate.minion} (最低)`
    });
  }

  // 第三步：剩下3人是 top/mid/bot，用 champion prior 推断
  const laners = remaining.filter(p => p !== supportPlayer);
  const remainingRoles = ALL_ROLES.filter(r => !usedRoles.has(r));

  // 为每个 laner 计算与各 role 的匹配度
  interface Assignment {
    player: PlayerStats;
    role: Position;
    score: number;
    reason: string;
  }

  const assignments: Assignment[] = [];

  for (const player of laners) {
    for (const role of remainingRoles) {
      const hasRoleInPrior = player.championPrior.includes(role);
      // 优先分配 prior 中包含的 role
      const score = hasRoleInPrior ? 100 : 0;
      assignments.push({
        player,
        role,
        score,
        reason: hasRoleInPrior ? `${player.champion} prior 包含 ${role}` : `${player.champion} prior 不包含 ${role}`
      });
    }
  }

  // 贪心分配：按分数排序，尽量匹配
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
      reason: a.reason
    });
  }

  // 如果还有未分配的玩家，随便填
  for (const player of teamPlayers) {
    if (result.find(r => r.playerId === player.playerId)) continue;
    const role = remainingRoles.find(r => !usedRoles.has(r)) || 'mid';
    usedRoles.add(role as Position);
    result.push({
      ...player,
      inferredRole: role as Position,
      confidence: 'LOW',
      reason: '无法确定，随机分配'
    });
  }

  return result;
}

async function main() {
  console.log('=== DEMO POSITION INFERENCE ===\n');
  console.log('推断逻辑：');
  console.log('1. Jungle = neutralMinion 击杀最高者（通常 100-200+）');
  console.log('2. Support = minion CS 最低者（通常 < 80）');
  console.log('3. Top/Mid/Bot = 剩余3人，使用英雄 prior 分配\n');
  console.log('='.repeat(80));

  const dataDir = path.join(process.cwd(), 'data/grid_v2');
  const files = fs.readdirSync(dataDir).filter(f => f.startsWith('series_') && f.endsWith('.json'));

  // 随机选取10个 series
  const shuffled = files.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 10);

  let demoCount = 0;

  for (const file of selected) {
    if (demoCount >= 10) break;

    const filePath = path.join(dataDir, file);
    const series: Series = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    if (!series.games || series.games.length === 0) continue;

    // 取第一场比赛
    const game = series.games[0];
    if (!game.teams || game.teams.length !== 2) continue;

    const team1Name = series.teams?.[0]?.name || game.teams[0].name || 'Team 1';
    const team2Name = series.teams?.[1]?.name || game.teams[1].name || 'Team 2';

    console.log(`\n【比赛 ${demoCount + 1}】${team1Name} vs ${team2Name}`);
    console.log(`  Series ID: ${series.id}`);
    console.log(`  日期: ${series.startedAt?.slice(0, 10) || 'N/A'}`);
    console.log('');

    for (let teamIdx = 0; teamIdx < 2; teamIdx++) {
      const team = game.teams[teamIdx];
      if (!team.players || team.players.length !== 5) continue;

      const teamName = teamIdx === 0 ? team1Name : team2Name;
      const side = team.side || (teamIdx === 0 ? 'blue' : 'red');

      console.log(`  [${side.toUpperCase()}] ${teamName}`);

      const playerStats: PlayerStats[] = team.players.map(p => ({
        playerId: p.id,
        playerName: p.name,
        champion: p.character?.name || 'Unknown',
        neutralMinion: getUnitKillCount(p, 'neutralMinion'),
        minion: getUnitKillCount(p, 'minion'),
        championPrior: findChampionPrior(p.character?.name || '')
      }));

      const inferred = inferPositions(playerStats);

      // 按 role 顺序排列输出
      const roleOrder: Position[] = ['top', 'jungle', 'mid', 'bot', 'support'];
      const sorted = [...inferred].sort((a, b) =>
        roleOrder.indexOf(a.inferredRole) - roleOrder.indexOf(b.inferredRole)
      );

      for (const p of sorted) {
        const priorStr = p.championPrior.length > 0 ? p.championPrior.join('/') : '无prior';
        const confIcon = p.confidence === 'HIGH' ? '✓' : p.confidence === 'MEDIUM' ? '~' : '?';
        console.log(`    ${confIcon} ${p.inferredRole.padEnd(7)} ${p.playerName.padEnd(12)} ${p.champion.padEnd(14)} minion=${String(p.minion).padStart(3)} neutral=${String(p.neutralMinion).padStart(3)} prior=[${priorStr}]`);
      }
      console.log('');
    }

    demoCount++;
  }

  console.log('='.repeat(80));
  console.log(`\n共展示 ${demoCount} 场比赛的位置推断结果`);
  console.log('\n置信度图例：✓=HIGH  ~=MEDIUM  ?=LOW');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
