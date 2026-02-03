/**
 * Analyze GIDEON's games across all teams
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
  const files = fs.readdirSync(dataDir).filter(f => f.startsWith('series_') && f.endsWith('.json'));

  console.log('正在分析 GIDEON (21032) 的所有比赛...\n');

  const gamesByTeam = new Map<string, number>();

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    const series: Series = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    if (!series.games) continue;

    for (const game of series.games) {
      if (!game.teams) continue;

      for (const team of game.teams) {
        if (!team.players) continue;

        const gideon = team.players.find(p => p.id === '21032' && p.name === 'GIDEON');
        if (gideon) {
          const teamName = team.name;
          gamesByTeam.set(teamName, (gamesByTeam.get(teamName) || 0) + 1);
        }
      }
    }
  }

  console.log('='.repeat(70));
  console.log('GIDEON (Player ID: 21032) 比赛分布\n');
  console.log('| 战队 | 比赛场次 |');
  console.log('|------|----------|');

  const sorted = Array.from(gamesByTeam.entries()).sort((a, b) => b[1] - a[1]);
  let total = 0;

  for (const [team, count] of sorted) {
    console.log(`| ${team.slice(0, 30).padEnd(30)} | ${String(count).padStart(8)} |`);
    total += count;
  }

  console.log('|------|----------|');
  console.log(`| 总计 | ${String(total).padStart(8)} |`);
  console.log('\n' + '='.repeat(70));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
