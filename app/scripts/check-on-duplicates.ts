/**
 * Check the abnormal games where ON has 5 teammates
 */

import * as fs from 'fs';
import * as path from 'path';

interface Player {
  id: string;
  name: string;
  character?: { name: string };
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

async function main() {
  const dataDir = path.join(process.cwd(), 'data/grid_v2');

  const abnormalSeriesIds = ['2849603', '2852517', '2852988'];

  console.log('检查异常比赛的详细情况\n');
  console.log('='.repeat(80));

  for (const seriesId of abnormalSeriesIds) {
    const filePath = path.join(dataDir, `series_${seriesId}.json`);
    if (!fs.existsSync(filePath)) {
      console.log(`\n⚠️  文件不存在: ${filePath}`);
      continue;
    }

    const series: Series = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    console.log(`\n【Series ${seriesId}】`);
    console.log(`日期: ${series.startedAt?.slice(0, 10)}`);
    console.log(`对阵: ${series.teams?.map(t => t.name).join(' vs ')}`);

    if (!series.games) continue;

    for (const game of series.games) {
      if (!game.teams) continue;

      for (const team of game.teams) {
        if (!team.players) continue;

        // 检查是否有 ON
        const onPlayers = team.players.filter(p => p.name === 'ON');

        if (onPlayers.length > 0) {
          console.log(`\n  Game ${game.sequenceNumber} - ${team.name}:`);
          console.log(`  发现 ${onPlayers.length} 个名为 ON 的选手`);
          console.log(`  队伍总人数: ${team.players.length}`);
          console.log('');
          console.log('  所有选手:');

          for (const player of team.players) {
            const isON = player.name === 'ON' ? ' ← ON' : '';
            console.log(`    ID: ${player.id.padEnd(8)} | 名字: ${player.name.padEnd(12)} | 英雄: ${player.character?.name || 'Unknown'}${isON}`);
          }

          // 检查是否有重复的 player ID
          const playerIds = team.players.map(p => p.id);
          const uniqueIds = new Set(playerIds);
          if (playerIds.length !== uniqueIds.size) {
            console.log('\n  ⚠️  发现重复的 player ID!');
            const duplicates = playerIds.filter((id, index) => playerIds.indexOf(id) !== index);
            console.log(`  重复的 ID: ${[...new Set(duplicates)].join(', ')}`);
          }
        }
      }
    }
    console.log('\n' + '-'.repeat(80));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
