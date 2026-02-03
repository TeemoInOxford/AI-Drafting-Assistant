/**
 * Find all players named "ON" with different player IDs
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

interface ONPlayerRecord {
  playerId: string;
  playerName: string;
  seriesId: string;
  gameNumber: number;
  date: string;
  teamId: string;
  teamName: string;
  champion: string;
  teammates: Array<{ id: string; name: string }>;
}

async function main() {
  const dataDir = path.join(process.cwd(), 'data/grid_v2');
  const files = fs.readdirSync(dataDir).filter(f => f.startsWith('series_') && f.endsWith('.json'));

  console.log('正在查找所有名为 ON 的选手...\n');

  const allONRecords: ONPlayerRecord[] = [];
  const onPlayerIds = new Set<string>();

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
      if (!game.teams) continue;

      for (const team of game.teams) {
        if (!team.players) continue;

        const onPlayers = team.players.filter(p => p.name === 'ON');

        for (const onPlayer of onPlayers) {
          onPlayerIds.add(onPlayer.id);

          const teammates = team.players
            .filter(p => p.id !== onPlayer.id)
            .map(p => ({ id: p.id, name: p.name }));

          const teamName = seriesTeamNames[team.id] || team.name || 'Unknown';

          allONRecords.push({
            playerId: onPlayer.id,
            playerName: onPlayer.name,
            seriesId: series.id,
            gameNumber: game.sequenceNumber,
            date: series.startedAt?.slice(0, 10) || 'N/A',
            teamId: team.id,
            teamName: teamName,
            champion: onPlayer.character?.name || 'Unknown',
            teammates: teammates,
          });
        }
      }
    }
  }

  console.log(`找到 ${onPlayerIds.size} 个不同的 player ID 名为 ON\n`);
  console.log('='.repeat(80));

  // 按 player ID 分组
  const byPlayerId = new Map<string, ONPlayerRecord[]>();
  for (const record of allONRecords) {
    if (!byPlayerId.has(record.playerId)) {
      byPlayerId.set(record.playerId, []);
    }
    byPlayerId.get(record.playerId)!.push(record);
  }

  for (const [playerId, records] of byPlayerId.entries()) {
    console.log(`\n【Player ID: ${playerId}】`);
    console.log(`总比赛数: ${records.length}`);

    // 按战队分组
    const byTeam = new Map<string, ONPlayerRecord[]>();
    for (const record of records) {
      const key = record.teamName;
      if (!byTeam.has(key)) {
        byTeam.set(key, []);
      }
      byTeam.get(key)!.push(record);
    }

    console.log(`战队数: ${byTeam.size}`);
    console.log('');

    for (const [teamName, teamRecords] of byTeam.entries()) {
      console.log(`  【${teamName}】 - ${teamRecords.length} 场比赛`);

      // 统计队友
      const teammateCount = new Map<string, { id: string; count: number }>();
      for (const record of teamRecords) {
        for (const teammate of record.teammates) {
          const key = teammate.name;
          if (!teammateCount.has(key)) {
            teammateCount.set(key, { id: teammate.id, count: 0 });
          }
          teammateCount.get(key)!.count++;
        }
      }

      const sortedTeammates = Array.from(teammateCount.entries())
        .sort((a, b) => b[1].count - a[1].count);

      console.log('    队友:');
      for (const [name, data] of sortedTeammates) {
        console.log(`      ${name.padEnd(15)} (ID: ${data.id.padEnd(8)}) - ${data.count} 场`);
      }

      // 展示前3场比赛
      console.log('    前3场比赛:');
      for (let i = 0; i < Math.min(3, teamRecords.length); i++) {
        const r = teamRecords[i];
        console.log(`      ${r.date} | Series ${r.seriesId} Game ${r.gameNumber} | ${r.champion.padEnd(12)} | 队友: ${r.teammates.map(t => t.name).join(', ')}`);
      }
      console.log('');
    }

    console.log('-'.repeat(80));
  }

  // 输出表格
  console.log('\n\n=== 汇总表格 ===\n');
  console.log('| Player ID | 战队 | 比赛数 | 主要队友 |');
  console.log('|-----------|------|--------|----------|');

  for (const [playerId, records] of byPlayerId.entries()) {
    const byTeam = new Map<string, ONPlayerRecord[]>();
    for (const record of records) {
      const key = record.teamName;
      if (!byTeam.has(key)) {
        byTeam.set(key, []);
      }
      byTeam.get(key)!.push(record);
    }

    for (const [teamName, teamRecords] of byTeam.entries()) {
      const teammateCount = new Map<string, number>();
      for (const record of teamRecords) {
        for (const teammate of record.teammates) {
          teammateCount.set(teammate.name, (teammateCount.get(teammate.name) || 0) + 1);
        }
      }

      const topTeammates = Array.from(teammateCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([name, count]) => `${name}(${count})`)
        .join(', ');

      console.log(`| ${playerId.padEnd(9)} | ${teamName.slice(0, 25).padEnd(25)} | ${String(teamRecords.length).padStart(6)} | ${topTeammates} |`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
