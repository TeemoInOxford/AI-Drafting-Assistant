/**
 * Debug Malrang's support games to see why they're detected as mid
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

  console.log('正在查找 Malrang 的辅助比赛...\n');

  const malrangGames: Array<{
    index: number;
    seriesId: string;
    gameNumber: number;
    date: string;
    teamName: string;
    champion: string;
    neutralMinion: number;
    minion: number;
    isHighestNeutral: boolean;
    isLowestMinion: boolean;
    teammates: Array<{ name: string; neutralMinion: number; minion: number }>;
  }> = [];

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
          name: p.name,
          neutralMinion: getUnitKillCount(p, 'neutralMinion'),
          minion: getUnitKillCount(p, 'minion'),
        }));

        const sortedByNeutral = [...players].sort((a, b) => b.neutralMinion - a.neutralMinion);
        const highestNeutral = sortedByNeutral[0];

        const sortedByMinion = [...players].sort((a, b) => a.minion - b.minion);
        const lowestMinion = sortedByMinion[0];

        const malrangData = players.find(p => p.name === 'Malrang')!;

        malrangGames.push({
          index: malrangGames.length + 1,
          seriesId: series.id,
          gameNumber: game.sequenceNumber,
          date: series.startedAt?.slice(0, 10) || 'N/A',
          teamName,
          champion: malrang.character?.name || 'Unknown',
          neutralMinion: malrangData.neutralMinion,
          minion: malrangData.minion,
          isHighestNeutral: malrangData.name === highestNeutral.name,
          isLowestMinion: malrangData.name === lowestMinion.name,
          teammates: players.filter(p => p.name !== 'Malrang'),
        });
      }
    }
  }

  malrangGames.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.seriesId !== b.seriesId) return a.seriesId.localeCompare(b.seriesId);
    return a.gameNumber - b.gameNumber;
  });

  // 重新编号
  for (let i = 0; i < malrangGames.length; i++) {
    malrangGames[i].index = i + 1;
  }

  console.log('========================================');
  console.log(`Malrang 的所有 ${malrangGames.length} 场比赛`);
  console.log('========================================\n');

  // 找出辅助比赛（小兵数最低）
  const supportGames = malrangGames.filter(g => g.isLowestMinion);

  console.log(`辅助比赛（小兵数最低）: ${supportGames.length} 场\n`);

  for (const g of supportGames) {
    console.log(`第${String(g.index).padStart(2)}场 | ${g.date} | ${g.seriesId} Game ${g.gameNumber}`);
    console.log(`  战队: ${g.teamName}`);
    console.log(`  英雄: ${g.champion}`);
    console.log(`  Malrang: neutral=${g.neutralMinion}, minion=${g.minion} ${g.isHighestNeutral ? '[最高野怪]' : ''} ${g.isLowestMinion ? '[最低小兵]' : ''}`);
    console.log(`  队友:`);
    for (const t of g.teammates) {
      console.log(`    ${t.name.padEnd(15)} neutral=${String(t.neutralMinion).padStart(3)}, minion=${String(t.minion).padStart(3)}`);
    }

    // 检查前后3场
    const before = malrangGames.slice(Math.max(0, g.index - 1 - 3), g.index - 1);
    const after = malrangGames.slice(g.index, Math.min(malrangGames.length, g.index + 3));

    console.log(`  前3场:`);
    for (const b of before) {
      console.log(`    第${String(b.index).padStart(2)}场: ${b.isHighestNeutral ? '[最高野怪]' : ''} ${b.isLowestMinion ? '[最低小兵]' : ''}`);
    }

    console.log(`  后3场:`);
    for (const a of after) {
      console.log(`    第${String(a.index).padStart(2)}场: ${a.isHighestNeutral ? '[最高野怪]' : ''} ${a.isLowestMinion ? '[最低小兵]' : ''}`);
    }

    // 计算时间序列判断
    let lowestMinionCount = 1;
    for (const b of before) {
      if (b.isLowestMinion) lowestMinionCount++;
    }
    for (const a of after) {
      if (a.isLowestMinion) lowestMinionCount++;
    }

    const totalNearby = 1 + before.length + after.length;
    const ratio = lowestMinionCount / totalNearby;

    console.log(`  时间序列判断: ${lowestMinionCount}/${totalNearby} = ${(ratio * 100).toFixed(1)}% 是最低小兵`);
    console.log(`  判定结果: ${ratio > 0.5 ? 'support ✓' : 'NOT support (会用时间序列推断为其他位置) ✗'}`);
    console.log('');
  }

  console.log('========================================');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
