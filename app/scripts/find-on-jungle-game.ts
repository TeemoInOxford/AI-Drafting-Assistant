/**
 * Find a game where ON played jungle
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

async function main() {
  const dataDir = path.join(process.cwd(), 'data/grid_v2');
  const files = fs.readdirSync(dataDir).filter(f => f.startsWith('series_') && f.endsWith('.json'));

  console.log('正在查找 ON 打野的比赛...\n');

  let found = 0;

  for (const file of files) {
    if (found >= 3) break; // 只展示3场

    const filePath = path.join(dataDir, file);
    const series: Series = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    if (!series.games) continue;

    for (const game of series.games) {
      if (found >= 3) break;
      if (!game.teams) continue;

      for (const team of game.teams) {
        if (!team.players || team.players.length !== 5) continue;

        const onPlayer = team.players.find(p => p.name === 'ON');
        if (!onPlayer) continue;

        const neutralMinion = getUnitKillCount(onPlayer, 'neutralMinion');
        const minion = getUnitKillCount(onPlayer, 'minion');

        // 如果 neutralMinion >= 100，说明是打野
        if (neutralMinion >= 100) {
          found++;

          const team1Name = series.teams?.[0]?.name || 'Team 1';
          const team2Name = series.teams?.[1]?.name || 'Team 2';

          console.log('='.repeat(70));
          console.log(`【比赛 ${found}】${team1Name} vs ${team2Name}`);
          console.log(`Series ID: ${series.id}`);
          console.log(`Game: ${game.sequenceNumber}`);
          console.log(`日期: ${series.startedAt?.slice(0, 10) || 'N/A'}`);
          console.log('');
          console.log(`ON 的数据:`);
          console.log(`  英雄: ${onPlayer.character?.name || 'Unknown'}`);
          console.log(`  neutralMinion: ${neutralMinion} (野怪击杀)`);
          console.log(`  minion: ${minion} (小兵击杀)`);
          console.log('');
          console.log(`${team.name} 全队数据:`);

          // 按 neutralMinion 排序展示
          const sorted = [...team.players].sort((a, b) =>
            getUnitKillCount(b, 'neutralMinion') - getUnitKillCount(a, 'neutralMinion')
          );

          for (const p of sorted) {
            const nm = getUnitKillCount(p, 'neutralMinion');
            const m = getUnitKillCount(p, 'minion');
            const isON = p.id === onPlayer.id ? ' ← ON' : '';
            console.log(`  ${p.name.padEnd(12)} ${(p.character?.name || 'Unknown').padEnd(14)} neutral=${String(nm).padStart(3)} minion=${String(m).padStart(3)}${isON}`);
          }
          console.log('');
        }
      }
    }
  }

  if (found === 0) {
    console.log('未找到 ON 打野的比赛');
  } else {
    console.log('='.repeat(70));
    console.log(`\n共找到 ${found} 场 ON 打野的比赛示例`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
