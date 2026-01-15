/**
 * 初始化 SQLite 数据库
 * 用于存储 LOL 职业比赛 BP 数据
 */

import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'app/lol/data/lol_drafts.db');

export function initDatabase() {
  const db = new Database(DB_PATH);

  // 启用外键约束
  db.pragma('foreign_keys = ON');

  // 创建队伍表
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      short_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建选手表
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      team_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (team_id) REFERENCES teams(id)
    )
  `);

  // 创建比赛系列表
  db.exec(`
    CREATE TABLE IF NOT EXISTS series (
      id TEXT PRIMARY KEY,
      tournament_name TEXT,
      team1_id TEXT NOT NULL,
      team2_id TEXT NOT NULL,
      winner_team_id TEXT,
      format TEXT,
      start_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (team1_id) REFERENCES teams(id),
      FOREIGN KEY (team2_id) REFERENCES teams(id),
      FOREIGN KEY (winner_team_id) REFERENCES teams(id)
    )
  `);

  // 创建单局比赛表
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      series_id TEXT NOT NULL,
      game_number INTEGER NOT NULL,
      blue_team_id TEXT NOT NULL,
      red_team_id TEXT NOT NULL,
      winner_team_id TEXT,
      duration_seconds INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (series_id) REFERENCES series(id),
      FOREIGN KEY (blue_team_id) REFERENCES teams(id),
      FOREIGN KEY (red_team_id) REFERENCES teams(id),
      FOREIGN KEY (winner_team_id) REFERENCES teams(id)
    )
  `);

  // 创建 BP 动作表
  db.exec(`
    CREATE TABLE IF NOT EXISTS draft_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL,
      sequence_number INTEGER NOT NULL,
      action_type TEXT NOT NULL CHECK (action_type IN ('ban', 'pick')),
      team_id TEXT NOT NULL,
      champion_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (game_id) REFERENCES games(id),
      FOREIGN KEY (team_id) REFERENCES teams(id),
      UNIQUE (game_id, sequence_number)
    )
  `);

  // 创建选手-英雄对应表（每局比赛中选手使用的英雄）
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_picks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      champion_name TEXT NOT NULL,
      position TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (game_id) REFERENCES games(id),
      FOREIGN KEY (player_id) REFERENCES players(id),
      FOREIGN KEY (team_id) REFERENCES teams(id),
      UNIQUE (game_id, player_id)
    )
  `);

  // 创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_games_series ON games(series_id);
    CREATE INDEX IF NOT EXISTS idx_draft_actions_game ON draft_actions(game_id);
    CREATE INDEX IF NOT EXISTS idx_draft_actions_champion ON draft_actions(champion_name);
    CREATE INDEX IF NOT EXISTS idx_draft_actions_team ON draft_actions(team_id);
    CREATE INDEX IF NOT EXISTS idx_player_picks_game ON player_picks(game_id);
    CREATE INDEX IF NOT EXISTS idx_player_picks_player ON player_picks(player_id);
    CREATE INDEX IF NOT EXISTS idx_player_picks_champion ON player_picks(champion_name);
  `);

  console.log('Database initialized successfully at:', DB_PATH);

  db.close();
}

// 如果直接运行此脚本
if (require.main === module) {
  initDatabase();
}
