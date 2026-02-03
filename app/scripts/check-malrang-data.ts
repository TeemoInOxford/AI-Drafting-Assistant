/**
 * Check Malrang's game data to understand why he's not detected as multi-position
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

async function main() {
  const dataDir = path.join(process.cwd(), 'data/grid_v2');
  const files = fs.readdirSync(dataDir).filter(f => f.startsWith('series_') && f.endsWith('.json'));

  console.log('正在查找 Malrang 的所有比赛数据...\n');

  interface MalrangGame {
    seriesId: string;
    gameNumber: number;
    date: string;
    teamName: string;
    champion: string;
    neutralMinion: number;
    minion: number;
    teammates: Array<{ name: string; neutralMinion: number; minion: number }>;
    isHighestNeutral: boolean;
    isLowestMinion: boolean;
    inferredRole: string;
  }

  const malrangGames: MalrangGame[] = [];

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

        const malrang = team.players.find(p => p.name === 'Malrang');
        if (!malrang) continue;

        const teamName = seriesTeamNames[team.id] || team.name || 'Unknown';

        const players = team.players.map(p => ({
          id: p.id,
          name: p.name,
          champion: p.character?.name || 'Unknown',
          neutralMinion: getUnitKillCount(p, 'neutralMinion'),
          minion: getUnitKillCount(p, 'minion'),
        }));

        // 确定打野（neutralMinion 最高）
        const sortedByNeutral = [...players].sort((a, b) => b.neutralMinion - a.neutralMinion);
        const jungler = sortedByNeutral[0];

        // 确定辅助（minion 最低，排除打野）
        const nonJunglers = players.filter(p => p.name !== jungler.name);
        const sortedByMinion = [...nonJunglers].sort((a, b) => a.minion - b.minion);
        const support = sortedByMinion[0];

        const malrangData = players.find(p => p.name === 'Malrang')!;
        const isHighestNeutral = malrangData.name === jungler.name;
        const isLowestMinion = malrangData.name === support.name;

        let inferredRole = '';
        if (isHighestNeutral) {
          inferredRole = 'jungle';
        } else if (isLowestMinion) {
          inferredRole = 'support';
        } else {
          inferredRole = 'laner';
        }

        malrangGames.push({
          seriesId: series.id,
          gameNumber: game.sequenceNumber,
          date: series.startedAt?.slice(0, 10) || 'N/A',
          teamName,
          champion: malrangData.champion,
          neutralMinion: malrangData.neutralMinion,
          minion: malrangData.minion,
          teammates: players.filter(p => p.name !== 'Malrang').map(p => ({
            name: p.name,
            neutralMinion: p.neutralMinion,
            minion: p.minion,
          })),
          isHighestNeutral,
          isLowestMinion,
          inferredRole,
        });
      }
    }
  }

  // 按时间排序
  malrangGames.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.seriesId !== b.seriesId) return a.seriesId.localeCompare(b.seriesId);
    return a.gameNumber - b.gameNumber;
  });

  console.log(`找到 Malrang 的 ${malrangGames.length} 场比赛\n`);
  console.log('='.repeat(120));
  console.log('Malrang 的所有比赛数据\n');
  console.log('| # | 日期 | Series | Game | 战队 | 英雄 | Neutral | Minion | 推断位置 | 详情 |');
  console.log('|---|------|--------|------|------|------|---------|--------|----------|------|');

  for (let i = 0; i < malrangGames.length; i++) {
    const g = malrangGames[i];
    const detail = g.isHighestNeutral ? '最高野怪' : g.isLowestMinion ? '最低小兵' : '中间';
    console.log(`| ${String(i + 1).padStart(3)} | ${g.date} | ${g.seriesId} | ${String(g.gameNumber).padStart(4)} | ${g.teamName.slice(0, 15).padEnd(15)} | ${g.champion.padEnd(12)} | ${String(g.neutralMinion).padStart(7)} | ${String(g.minion).padStart(6)} | ${g.inferredRole.padEnd(8)} | ${detail} |`);
  }

  console.log('\n' + '='.repeat(120));

  // 统计位置分布
  const positionCount: Record<string, number> = {
    jungle: 0,
    support: 0,
    laner: 0,
  };

  for (const game of malrangGames) {
    positionCount[game.inferredRole]++;
  }

  console.log('\n位置分布统计:');
  console.log(`  打野 (jungle): ${positionCount.jungle} 场`);
  console.log(`  辅助 (support): ${positionCount.support} 场`);
  console.log(`  线上 (laner): ${positionCount.laner} 场`);

  // 找出位置转换的时间点
  console.log('\n位置转换分析:');
  let lastRole = malrangGames[0]?.inferredRole;
  const transitions: Array<{ from: string; to: string; index: number; date: string }> = [];

  for (let i = 1; i < malrangGames.length; i++) {
    if (malrangGames[i].inferredRole !== lastRole) {
      transitions.push({
        from: lastRole,
        to: malrangGames[i].inferredRole,
        index: i,
        date: malrangGames[i].date,
      });
      lastRole = malrangGames[i].inferredRole;
    }
  }

  if (transitions.length > 0) {
    console.log(`\n发现 ${transitions.length} 次位置转换:`);
    for (const t of transitions) {
      console.log(`  第 ${t.index + 1} 场 (${t.date}): ${t.from} → ${t.to}`);
    }
  } else {
    console.log('\n没有发现位置转换，所有比赛都是同一个位置');
  }

  console.log('\n' + '='.repeat(120));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
