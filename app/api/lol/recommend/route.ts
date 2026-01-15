import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'app/lol/data/lol_drafts.db');

interface RecommendRequest {
  action: 'ban' | 'pick';
  team: 'blue' | 'red';
  usedChampions: string[]; // 已经被ban/pick的英雄
  bluePicks: string[];
  redPicks: string[];
  blueBans: string[];
  redBans: string[];
}

interface Recommendation {
  champion: string;
  score: number;
  reason: string;
  winRate?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: RecommendRequest = await request.json();
    const { action, team, usedChampions, bluePicks, redPicks } = body;

    const db = new Database(DB_PATH, { readonly: true });

    let recommendations: Recommendation[] = [];

    if (action === 'ban') {
      // Ban 推荐：基于对方可能想要的高胜率/高选取率英雄
      const opponentPicks = team === 'blue' ? redPicks : bluePicks;

      // 获取热门且高胜率的英雄作为ban目标
      const topBanTargets = db.prepare(`
        SELECT
          da.champion_name,
          COUNT(*) as pick_count,
          SUM(CASE WHEN g.winner_team_id = da.team_id THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as win_rate
        FROM draft_actions da
        JOIN games g ON da.game_id = g.id
        WHERE da.action_type = 'pick'
          AND da.champion_name NOT IN (${usedChampions.map(() => '?').join(',') || "''"})
        GROUP BY da.champion_name
        HAVING COUNT(*) >= 5
        ORDER BY win_rate * pick_count DESC
        LIMIT 10
      `).all(...usedChampions) as any[];

      recommendations = topBanTargets.map((row, index) => ({
        champion: row.champion_name,
        score: 100 - index * 8,
        winRate: Math.round(row.win_rate * 100),
        reason: `Win rate ${Math.round(row.win_rate * 100)}%, picked ${row.pick_count} times in pro matches`
      }));

    } else {
      // Pick 推荐：基于己方阵容需求和英雄胜率
      const myPicks = team === 'blue' ? bluePicks : redPicks;
      const enemyPicks = team === 'blue' ? redPicks : bluePicks;

      // 获取高胜率英雄
      const topPickTargets = db.prepare(`
        SELECT
          da.champion_name,
          COUNT(*) as pick_count,
          SUM(CASE WHEN g.winner_team_id = da.team_id THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as win_rate
        FROM draft_actions da
        JOIN games g ON da.game_id = g.id
        WHERE da.action_type = 'pick'
          AND da.champion_name NOT IN (${usedChampions.map(() => '?').join(',') || "''"})
        GROUP BY da.champion_name
        HAVING COUNT(*) >= 3
        ORDER BY win_rate DESC, pick_count DESC
        LIMIT 15
      `).all(...usedChampions) as any[];

      // 计算协同分数
      const synergyScores: Record<string, number> = {};

      if (myPicks.length > 0) {
        // 查找与己方英雄经常一起出现且胜率高的英雄
        const synergyQuery = db.prepare(`
          SELECT
            da2.champion_name,
            COUNT(*) as combo_count,
            SUM(CASE WHEN g.winner_team_id = da1.team_id THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as combo_win_rate
          FROM draft_actions da1
          JOIN draft_actions da2 ON da1.game_id = da2.game_id AND da1.team_id = da2.team_id
          JOIN games g ON da1.game_id = g.id
          WHERE da1.action_type = 'pick'
            AND da2.action_type = 'pick'
            AND da1.champion_name IN (${myPicks.map(() => '?').join(',')})
            AND da2.champion_name NOT IN (${usedChampions.map(() => '?').join(',') || "''"})
            AND da1.champion_name != da2.champion_name
          GROUP BY da2.champion_name
          HAVING COUNT(*) >= 2
          ORDER BY combo_win_rate DESC
        `).all(...myPicks, ...usedChampions) as any[];

        for (const row of synergyQuery) {
          synergyScores[row.champion_name] = (synergyScores[row.champion_name] || 0) + row.combo_win_rate * 20;
        }
      }

      // 计算克制分数
      const counterScores: Record<string, number> = {};

      if (enemyPicks.length > 0) {
        // 查找对敌方英雄有优势的英雄
        const counterQuery = db.prepare(`
          SELECT
            da1.champion_name as my_champ,
            COUNT(*) as matchup_count,
            SUM(CASE WHEN g.winner_team_id = da1.team_id THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as matchup_win_rate
          FROM draft_actions da1
          JOIN draft_actions da2 ON da1.game_id = da2.game_id AND da1.team_id != da2.team_id
          JOIN games g ON da1.game_id = g.id
          WHERE da1.action_type = 'pick'
            AND da2.action_type = 'pick'
            AND da2.champion_name IN (${enemyPicks.map(() => '?').join(',')})
            AND da1.champion_name NOT IN (${usedChampions.map(() => '?').join(',') || "''"})
          GROUP BY da1.champion_name
          HAVING COUNT(*) >= 2
          ORDER BY matchup_win_rate DESC
        `).all(...enemyPicks, ...usedChampions) as any[];

        for (const row of counterQuery) {
          counterScores[row.my_champ] = (counterScores[row.my_champ] || 0) + (row.matchup_win_rate - 0.5) * 30;
        }
      }

      // 综合评分
      recommendations = topPickTargets.map((row) => {
        const baseScore = row.win_rate * 50 + Math.min(row.pick_count, 50) / 50 * 20;
        const synergy = synergyScores[row.champion_name] || 0;
        const counter = counterScores[row.champion_name] || 0;
        const totalScore = baseScore + synergy + counter;

        let reason = `${Math.round(row.win_rate * 100)}% win rate`;
        if (synergy > 5) reason += `, good synergy with team`;
        if (counter > 5) reason += `, counters enemy picks`;

        return {
          champion: row.champion_name,
          score: totalScore,
          winRate: Math.round(row.win_rate * 100),
          reason
        };
      }).sort((a, b) => b.score - a.score).slice(0, 10);
    }

    db.close();

    return NextResponse.json({
      success: true,
      action,
      team,
      recommendations
    });

  } catch (error) {
    console.error('Recommend API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get recommendations' },
      { status: 500 }
    );
  }
}
