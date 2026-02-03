/**
 * Find all players with 2-5 secondary position games
 * Show summary and detailed information
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

interface SecondaryPositionGame {
  seriesId: string;
  gameNumber: number;
  date: string;
  champion: string;
  neutralMinion: number;
  minion: number;
  opponentTeam: string;
}

async function main() {
  const dataDir = path.join(process.cwd(), 'data/grid_v2');
  const files = fs.readdirSync(dataDir).filter(f => f.startsWith('series_') && f.endsWith('.json'));

  console.log('正在分析所有选手的位置...\n');

  // 第一遍：统计每个选手在各位置的场次
  const playerPositionCount = new Map<string, {
    playerId: string;
    playerName: string;
    teamName: string;
    positions: Record<string, number>;
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
          if (!playerPositionCount.has(key)) {
            playerPositionCount.set(key, {
              playerId: inf.playerId,
              playerName: inf.playerName,
              teamName: teamName,
              positions: { top: 0, jungle: 0, mid: 0, bot: 0, support: 0 },
            });
          }

          const stats = playerPositionCount.get(key)!;
          stats.teamName = teamName;
          stats.positions[inf.inferredRole]++;
        }
      }
    }
  }

  // 找出副位置2-5场的选手
  const twoToFivePlayers = new Map<string, { mainRole: string; secondaryRole: string; secondaryCount: number }>();

  for (const [playerId, stats] of playerPositionCount.entries()) {
    const ALL_ROLES = ['top', 'jungle', 'mid', 'bot', 'support'];
    const positionsPlayed = ALL_ROLES.filter(r => stats.positions[r] > 0);

    if (positionsPlayed.length === 2) {
      let mainRole = positionsPlayed[0];
      let secondaryRole = positionsPlayed[1];

      if (stats.positions[positionsPlayed[1]] > stats.positions[positionsPlayed[0]]) {
        mainRole = positionsPlayed[1];
        secondaryRole = positionsPlayed[0];
      }

      const secondaryCount = stats.positions[secondaryRole];
      if (secondaryCount >= 2 && secondaryCount <= 5) {
        twoToFivePlayers.set(playerId, { mainRole, secondaryRole, secondaryCount });
      }
    }
  }

  console.log(`找到 ${twoToFivePlayers.size} 个副位置2-5场的选手\n`);

  // 第二遍：收集这些选手的副位置比赛详情
  const playerGames = new Map<string, {
    playerId: string;
    playerName: string;
    teamName: string;
    mainRole: string;
    secondaryRole: string;
    games: SecondaryPositionGame[];
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

      const team1 = game.teams[0];
      const team2 = game.teams[1];

      for (const team of game.teams) {
        if (!team.players || team.players.length !== 5) continue;

        const teamName = seriesTeamNames[team.id] || team.name || 'Unknown';
        const opponentTeam = team.id === team1.id
          ? (seriesTeamNames[team2.id] || team2.name || 'Unknown')
          : (seriesTeamNames[team1.id] || team1.name || 'Unknown');

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
          const playerInfo = twoToFivePlayers.get(inf.playerId);
          if (playerInfo && inf.inferredRole === playerInfo.secondaryRole) {
            if (!playerGames.has(inf.playerId)) {
              playerGames.set(inf.playerId, {
                playerId: inf.playerId,
                playerName: inf.playerName,
                teamName: teamName,
                mainRole: playerInfo.mainRole,
                secondaryRole: playerInfo.secondaryRole,
                games: [],
              });
            }

            playerGames.get(inf.playerId)!.games.push({
              seriesId: series.id,
              gameNumber: game.sequenceNumber,
              date: series.startedAt?.slice(0, 10) || 'N/A',
              champion: inf.champion,
              neutralMinion: inf.neutralMinion,
              minion: inf.minion,
              opponentTeam: opponentTeam,
            });
          }
        }
      }
    }
  }

  // 按选手名字排序
  const sortedPlayers = Array.from(playerGames.values()).sort((a, b) => a.playerName.localeCompare(b.playerName));

  console.log('='.repeat(120));
  console.log('副位置2-5场的选手汇总\n');
  console.log('| # | 选手 | 战队 | 主位置 | 副位置 | 副位置场次 |');
  console.log('|---|------|------|--------|--------|------------|');

  for (let i = 0; i < sortedPlayers.length; i++) {
    const p = sortedPlayers[i];
    console.log(`| ${String(i + 1).padStart(3)} | ${p.playerName.padEnd(15)} | ${p.teamName.slice(0, 25).padEnd(25)} | ${p.mainRole.padEnd(7)} | ${p.secondaryRole.padEnd(7)} | ${String(p.games.length).padStart(10)} |`);
  }

  console.log('\n' + '='.repeat(120));
  console.log(`\n总计: ${sortedPlayers.length} 个选手\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
