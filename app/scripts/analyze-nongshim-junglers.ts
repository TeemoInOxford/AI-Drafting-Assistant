/**
 * Find all NONGSHIM games and check who is the jungler
 */

import * as fs from 'fs';
import * as path from 'path';

interface Player {
  id: string;
  name: string;
  character?: { name: string };
  unitKills?: Array<{ unitName: string; count: number }>;
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

  console.log('正在分析 NONGSHIM RED FORCE 的所有比赛...\n');

  // 统计打野选手
  const junglerStats = new Map<string, { id: string; count: number; champions: string[] }>();

  let totalGames = 0;

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    const series: Series = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    if (!series.games) continue;

    const hasNongshim = series.teams?.some(t => t.name.includes('NONGSHIM'));
    if (!hasNongshim) continue;

    for (const game of series.games) {
      if (!game.teams) continue;

      for (const team of game.teams) {
        if (!team.players || team.players.length !== 5) continue;
        if (!team.name.includes('NONGSHIM')) continue;

        totalGames++;

        // 找出打野（neutralMinion 最高的）
        let jungler: Player | null = null;
        let maxNeutral = 0;

        for (const p of team.players) {
          const nm = getUnitKillCount(p, 'neutralMinion');
          if (nm > maxNeutral) {
            maxNeutral = nm;
            jungler = p;
          }
        }

        if (jungler && maxNeutral >= 80) {
          const key = jungler.name;
          if (!junglerStats.has(key)) {
            junglerStats.set(key, { id: jungler.id, count: 0, champions: [] });
          }
          const stats = junglerStats.get(key)!;
          stats.count++;
          const champ = jungler.character?.name || 'Unknown';
          if (!stats.champions.includes(champ)) {
            stats.champions.push(champ);
          }
        }
      }
    }
  }

  console.log(`NONGSHIM RED FORCE 总比赛数: ${totalGames}\n`);
  console.log('='.repeat(70));
  console.log('\n打野选手统计:\n');

  const sorted = Array.from(junglerStats.entries())
    .sort((a, b) => b[1].count - a[1].count);

  for (const [name, stats] of sorted) {
    console.log(`【${name}】 (Player ID: ${stats.id})`);
    console.log(`  比赛数: ${stats.count}`);
    console.log(`  使用英雄: ${stats.champions.slice(0, 10).join(', ')}${stats.champions.length > 10 ? '...' : ''}`);
    console.log('');
  }

  console.log('='.repeat(70));

  // 检查 ON 在 NONGSHIM 的第一场和最后一场比赛
  console.log('\n\nON 在 NONGSHIM 的第一场和最后一场比赛:\n');

  const onGames: Array<{ date: string; seriesId: string; gameNum: number; champion: string }> = [];

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    const series: Series = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    if (!series.games) continue;

    const hasNongshim = series.teams?.some(t => t.name.includes('NONGSHIM'));
    if (!hasNongshim) continue;

    for (const game of series.games) {
      if (!game.teams) continue;

      for (const team of game.teams) {
        if (!team.players) continue;
        if (!team.name.includes('NONGSHIM')) continue;

        const onPlayer = team.players.find(p => p.name === 'ON');
        if (onPlayer) {
          onGames.push({
            date: series.startedAt?.slice(0, 10) || 'N/A',
            seriesId: series.id,
            gameNum: game.sequenceNumber,
            champion: onPlayer.character?.name || 'Unknown',
          });
        }
      }
    }
  }

  onGames.sort((a, b) => a.date.localeCompare(b.date));

  if (onGames.length > 0) {
    console.log('第一场:');
    const first = onGames[0];
    console.log(`  ${first.date} | Series ${first.seriesId} Game ${first.gameNum} | ${first.champion}`);

    console.log('\n最后一场:');
    const last = onGames[onGames.length - 1];
    console.log(`  ${last.date} | Series ${last.seriesId} Game ${last.gameNum} | ${last.champion}`);

    console.log(`\n总共: ${onGames.length} 场`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
