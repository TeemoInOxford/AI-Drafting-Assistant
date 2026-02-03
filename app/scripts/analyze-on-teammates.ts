/**
 * Analyze ON player's teammates across all games
 */

import * as fs from 'fs';
import * as path from 'path';

interface Player {
  id: string;
  name: string;
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

interface GameRecord {
  seriesId: string;
  gameNumber: number;
  date: string;
  teamId: string;
  teamName: string;
  teammates: string[];
}

async function main() {
  const dataDir = path.join(process.cwd(), 'data/grid_v2');
  const files = fs.readdirSync(dataDir).filter(f => f.startsWith('series_') && f.endsWith('.json'));

  console.log('正在分析 ON 选手的所有比赛...\n');

  const gameRecords: GameRecord[] = [];

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

        const onPlayer = team.players.find(p => p.name === 'ON');
        if (!onPlayer) continue;

        const teammates = team.players
          .filter(p => p.id !== onPlayer.id)
          .map(p => p.name);

        const teamName = seriesTeamNames[team.id] || team.name || 'Unknown';

        gameRecords.push({
          seriesId: series.id,
          gameNumber: game.sequenceNumber,
          date: series.startedAt?.slice(0, 10) || 'N/A',
          teamId: team.id,
          teamName: teamName,
          teammates: teammates,
        });
      }
    }
  }

  console.log(`找到 ON 选手的 ${gameRecords.length} 场比赛\n`);

  // 按战队分组
  const byTeam = new Map<string, GameRecord[]>();
  for (const record of gameRecords) {
    const key = `${record.teamName}`;
    if (!byTeam.has(key)) {
      byTeam.set(key, []);
    }
    byTeam.get(key)!.push(record);
  }

  console.log('='.repeat(80));
  console.log('ON 选手按战队分组的比赛记录\n');

  for (const [teamName, records] of byTeam.entries()) {
    console.log(`\n【${teamName}】 - ${records.length} 场比赛`);
    console.log('-'.repeat(80));

    // 统计队友出现次数
    const teammateCount = new Map<string, number>();
    for (const record of records) {
      for (const teammate of record.teammates) {
        teammateCount.set(teammate, (teammateCount.get(teammate) || 0) + 1);
      }
    }

    // 按出现次数排序
    const sortedTeammates = Array.from(teammateCount.entries())
      .sort((a, b) => b[1] - a[1]);

    console.log('\n队友统计:');
    for (const [name, count] of sortedTeammates) {
      console.log(`  ${name.padEnd(15)} ${count} 场`);
    }

    // 展示前5场比赛的详细信息
    console.log('\n前5场比赛详情:');
    for (let i = 0; i < Math.min(5, records.length); i++) {
      const r = records[i];
      console.log(`  ${r.date} | Series ${r.seriesId} Game ${r.gameNumber} | 队友: ${r.teammates.join(', ')}`);
    }
  }

  console.log('\n' + '='.repeat(80));

  // 输出表格格式
  console.log('\n\n=== 表格格式 ===\n');
  console.log('| 战队 | 比赛场次 | 队友1 | 队友2 | 队友3 | 队友4 | 备注 |');
  console.log('|------|----------|-------|-------|-------|-------|------|');

  for (const [teamName, records] of byTeam.entries()) {
    // 找出最常见的4个队友
    const teammateCount = new Map<string, number>();
    for (const record of records) {
      for (const teammate of record.teammates) {
        teammateCount.set(teammate, (teammateCount.get(teammate) || 0) + 1);
      }
    }

    const topTeammates = Array.from(teammateCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);

    const t1 = topTeammates[0] ? `${topTeammates[0][0]}(${topTeammates[0][1]})` : '-';
    const t2 = topTeammates[1] ? `${topTeammates[1][0]}(${topTeammates[1][1]})` : '-';
    const t3 = topTeammates[2] ? `${topTeammates[2][0]}(${topTeammates[2][1]})` : '-';
    const t4 = topTeammates[3] ? `${topTeammates[3][0]}(${topTeammates[3][1]})` : '-';

    const note = teammateCount.size > 4 ? `还有${teammateCount.size - 4}个其他队友` : '固定阵容';

    console.log(`| ${teamName.slice(0, 25).padEnd(25)} | ${String(records.length).padStart(8)} | ${t1.padEnd(12)} | ${t2.padEnd(12)} | ${t3.padEnd(12)} | ${t4.padEnd(12)} | ${note} |`);
  }

  // 检查是否有异常情况（同一场比赛队友不是4个人）
  console.log('\n\n=== 异常检查 ===\n');
  let abnormalCount = 0;
  for (const record of gameRecords) {
    if (record.teammates.length !== 4) {
      abnormalCount++;
      console.log(`⚠️  Series ${record.seriesId} Game ${record.gameNumber}: 只有 ${record.teammates.length} 个队友 - ${record.teammates.join(', ')}`);
    }
  }

  if (abnormalCount === 0) {
    console.log('✓ 所有比赛都有4个队友，数据正常');
  } else {
    console.log(`\n发现 ${abnormalCount} 场比赛的队友数量异常`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
