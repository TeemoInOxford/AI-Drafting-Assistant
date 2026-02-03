/**
 * Check jungle and support detection accuracy
 * Find exceptions where the rules don't work
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

interface JungleException {
  seriesId: string;
  gameNumber: number;
  date: string;
  teamName: string;
  players: Array<{
    name: string;
    champion: string;
    neutralMinion: number;
    minion: number;
  }>;
  reason: string;
}

interface SupportException {
  seriesId: string;
  gameNumber: number;
  date: string;
  teamName: string;
  players: Array<{
    name: string;
    champion: string;
    neutralMinion: number;
    minion: number;
  }>;
  reason: string;
}

async function main() {
  const dataDir = path.join(process.cwd(), 'data/grid_v2');
  const files = fs.readdirSync(dataDir).filter(f => f.startsWith('series_') && f.endsWith('.json'));

  console.log('正在检查打野和辅助检测的准确率...\n');

  const jungleExceptions: JungleException[] = [];
  const supportExceptions: SupportException[] = [];
  let totalGames = 0;
  let validGames = 0;

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

        totalGames++;
        const teamName = seriesTeamNames[team.id] || team.name || 'Unknown';

        const players = team.players.map(p => ({
          id: p.id,
          name: p.name,
          champion: p.character?.name || 'Unknown',
          neutralMinion: getUnitKillCount(p, 'neutralMinion'),
          minion: getUnitKillCount(p, 'minion'),
        }));

        // 检查打野规则
        const sortedByNeutral = [...players].sort((a, b) => b.neutralMinion - a.neutralMinion);
        const jungleCandidate = sortedByNeutral[0];

        if (jungleCandidate.neutralMinion < 80) {
          jungleExceptions.push({
            seriesId: series.id,
            gameNumber: game.sequenceNumber,
            date: series.startedAt?.slice(0, 10) || 'N/A',
            teamName,
            players: players.map(p => ({
              name: p.name,
              champion: p.champion,
              neutralMinion: p.neutralMinion,
              minion: p.minion,
            })),
            reason: `最高 neutralMinion 只有 ${jungleCandidate.neutralMinion} < 80`,
          });
        } else {
          validGames++;
        }

        // 检查辅助规则
        const sortedByMinion = [...players].sort((a, b) => b.minion - a.minion);
        const supportCandidate = sortedByMinion[sortedByMinion.length - 1];

        if (supportCandidate.minion >= 100) {
          supportExceptions.push({
            seriesId: series.id,
            gameNumber: game.sequenceNumber,
            date: series.startedAt?.slice(0, 10) || 'N/A',
            teamName,
            players: players.map(p => ({
              name: p.name,
              champion: p.champion,
              neutralMinion: p.neutralMinion,
              minion: p.minion,
            })),
            reason: `最低 minion 有 ${supportCandidate.minion} >= 100`,
          });
        }
      }
    }
  }

  console.log('='.repeat(120));
  console.log('检测结果统计\n');
  console.log(`总比赛数（team-games）: ${totalGames}`);
  console.log(`打野检测成功: ${validGames} (${(validGames / totalGames * 100).toFixed(2)}%)`);
  console.log(`打野检测失败: ${jungleExceptions.length} (${(jungleExceptions.length / totalGames * 100).toFixed(2)}%)`);
  console.log(`辅助检测失败: ${supportExceptions.length} (${(supportExceptions.length / totalGames * 100).toFixed(2)}%)`);

  if (jungleExceptions.length > 0) {
    console.log('\n' + '='.repeat(120));
    console.log(`\n打野检测例外 (${jungleExceptions.length} 场)\n`);
    console.log('| # | Series ID | Game | 日期 | 战队 | 原因 |');
    console.log('|---|-----------|------|------|------|------|');

    for (let i = 0; i < Math.min(20, jungleExceptions.length); i++) {
      const ex = jungleExceptions[i];
      console.log(`| ${String(i + 1).padStart(2)} | ${ex.seriesId} | ${String(ex.gameNumber).padStart(4)} | ${ex.date} | ${ex.teamName.slice(0, 20).padEnd(20)} | ${ex.reason} |`);
    }

    if (jungleExceptions.length > 20) {
      console.log(`\n... 还有 ${jungleExceptions.length - 20} 个例外未显示`);
    }

    // 显示前3个例外的详细信息
    console.log('\n前3个打野例外的详细信息:\n');
    for (let i = 0; i < Math.min(3, jungleExceptions.length); i++) {
      const ex = jungleExceptions[i];
      console.log(`【例外 ${i + 1}】Series ${ex.seriesId} Game ${ex.gameNumber} - ${ex.teamName}`);
      console.log(`日期: ${ex.date}`);
      console.log(`原因: ${ex.reason}\n`);
      console.log('选手数据:');
      for (const p of ex.players) {
        console.log(`  ${p.name.padEnd(15)} ${p.champion.padEnd(15)} neutral=${String(p.neutralMinion).padStart(3)} minion=${String(p.minion).padStart(3)}`);
      }
      console.log('');
    }
  }

  if (supportExceptions.length > 0) {
    console.log('\n' + '='.repeat(120));
    console.log(`\n辅助检测例外 (${supportExceptions.length} 场)\n`);
    console.log('| # | Series ID | Game | 日期 | 战队 | 原因 |');
    console.log('|---|-----------|------|------|------|------|');

    for (let i = 0; i < Math.min(20, supportExceptions.length); i++) {
      const ex = supportExceptions[i];
      console.log(`| ${String(i + 1).padStart(2)} | ${ex.seriesId} | ${String(ex.gameNumber).padStart(4)} | ${ex.date} | ${ex.teamName.slice(0, 20).padEnd(20)} | ${ex.reason} |`);
    }

    if (supportExceptions.length > 20) {
      console.log(`\n... 还有 ${supportExceptions.length - 20} 个例外未显示`);
    }

    // 显示前3个例外的详细信息
    console.log('\n前3个辅助例外的详细信息:\n');
    for (let i = 0; i < Math.min(3, supportExceptions.length); i++) {
      const ex = supportExceptions[i];
      console.log(`【例外 ${i + 1}】Series ${ex.seriesId} Game ${ex.gameNumber} - ${ex.teamName}`);
      console.log(`日期: ${ex.date}`);
      console.log(`原因: ${ex.reason}\n`);
      console.log('选手数据:');
      for (const p of ex.players) {
        console.log(`  ${p.name.padEnd(15)} ${p.champion.padEnd(15)} neutral=${String(p.neutralMinion).padStart(3)} minion=${String(p.minion).padStart(3)}`);
      }
      console.log('');
    }
  }

  console.log('\n' + '='.repeat(120));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
