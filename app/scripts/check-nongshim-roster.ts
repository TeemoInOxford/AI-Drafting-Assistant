/**
 * Check NONGSHIM RED FORCE roster to find the real jungler
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

  console.log('正在检查 NONGSHIM RED FORCE 的阵容...\n');

  // 找几场 NONGSHIM 的比赛
  let found = 0;

  for (const file of files) {
    if (found >= 5) break;

    const filePath = path.join(dataDir, file);
    const series: Series = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    if (!series.games) continue;

    // 检查是否是 NONGSHIM 的比赛
    const hasNongshim = series.teams?.some(t => t.name.includes('NONGSHIM'));
    if (!hasNongshim) continue;

    for (const game of series.games) {
      if (found >= 5) break;
      if (!game.teams) continue;

      for (const team of game.teams) {
        if (!team.players || team.players.length !== 5) continue;
        if (!team.name.includes('NONGSHIM')) continue;

        // 检查是否有 ON
        const hasON = team.players.some(p => p.name === 'ON');
        if (!hasON) continue;

        found++;

        console.log('='.repeat(70));
        console.log(`【比赛 ${found}】Series ${series.id} Game ${game.sequenceNumber}`);
        console.log(`日期: ${series.startedAt?.slice(0, 10)}`);
        console.log(`对阵: ${series.teams?.map(t => t.name).join(' vs ')}`);
        console.log('');
        console.log('NONGSHIM RED FORCE 阵容:');

        // 按 neutralMinion 排序
        const sorted = [...team.players].sort((a, b) =>
          getUnitKillCount(b, 'neutralMinion') - getUnitKillCount(a, 'neutralMinion')
        );

        for (const p of sorted) {
          const nm = getUnitKillCount(p, 'neutralMinion');
          const m = getUnitKillCount(p, 'minion');
          const isON = p.name === 'ON' ? ' ← ON' : '';
          const isJungle = nm >= 100 ? ' [打野]' : '';
          console.log(`  ID: ${p.id.padEnd(8)} | ${p.name.padEnd(12)} | ${(p.character?.name || 'Unknown').padEnd(14)} | neutral=${String(nm).padStart(3)} minion=${String(m).padStart(3)}${isJungle}${isON}`);
        }
        console.log('');
      }
    }
  }

  console.log('='.repeat(70));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
