/**
 * Replace ON with GIDEON in NONGSHIM RED FORCE games
 */

import * as fs from 'fs';
import * as path from 'path';

interface Player {
  id: string;
  name: string;
  [key: string]: any;
}

interface Team {
  id: string;
  name: string;
  players?: Player[];
  [key: string]: any;
}

interface Game {
  id: string;
  sequenceNumber: number;
  teams?: Team[];
  [key: string]: any;
}

interface Series {
  id: string;
  startedAt?: string;
  teams?: { id: string; name: string }[];
  games?: Game[];
  [key: string]: any;
}

async function main() {
  const dataDir = path.join(process.cwd(), 'data/grid_v2');
  const files = fs.readdirSync(dataDir).filter(f => f.startsWith('series_') && f.endsWith('.json'));

  console.log('正在查找并替换 NONGSHIM 战队中的 ON...\n');

  let modifiedFiles = 0;
  let modifiedGames = 0;
  let totalReplacements = 0;

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const series: Series = JSON.parse(content);

    if (!series.games) continue;

    // 检查是否是 NONGSHIM 的比赛
    const hasNongshim = series.teams?.some(t => t.name.includes('NONGSHIM'));
    if (!hasNongshim) continue;

    let fileModified = false;

    for (const game of series.games) {
      if (!game.teams) continue;

      for (const team of game.teams) {
        if (!team.players) continue;
        if (!team.name.includes('NONGSHIM')) continue;

        // 查找 ON (ID: 25485)
        for (const player of team.players) {
          if (player.id === '25485' && player.name === 'ON') {
            console.log(`✓ Series ${series.id} Game ${game.sequenceNumber}: 替换 ON (25485) -> GIDEON (21032)`);

            // 替换 ID 和名字
            player.id = '21032';
            player.name = 'GIDEON';

            totalReplacements++;
            fileModified = true;
          }
        }
      }
    }

    if (fileModified) {
      // 写回文件
      fs.writeFileSync(filePath, JSON.stringify(series, null, 2));
      modifiedFiles++;

      // 统计这个 series 有多少场比赛被修改
      let gamesInSeries = 0;
      for (const game of series.games) {
        if (game.teams?.some(t => t.name.includes('NONGSHIM'))) {
          gamesInSeries++;
        }
      }
      modifiedGames += gamesInSeries;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('\n替换完成！');
  console.log(`修改的文件数: ${modifiedFiles}`);
  console.log(`修改的比赛数: ${modifiedGames}`);
  console.log(`总替换次数: ${totalReplacements}`);

  // 验证替换结果
  console.log('\n正在验证替换结果...\n');

  let onCount = 0;
  let gideonCount = 0;

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

        for (const player of team.players) {
          if (player.id === '25485' && player.name === 'ON') {
            onCount++;
          }
          if (player.id === '21032' && player.name === 'GIDEON') {
            gideonCount++;
          }
        }
      }
    }
  }

  console.log('验证结果:');
  console.log(`  NONGSHIM 中还有 ON (25485): ${onCount} 个`);
  console.log(`  NONGSHIM 中现有 GIDEON (21032): ${gideonCount} 个`);

  if (onCount === 0) {
    console.log('\n✓ 验证通过！所有 NONGSHIM 的 ON 都已替换为 GIDEON');
  } else {
    console.log('\n⚠️  警告：还有未替换的 ON');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
