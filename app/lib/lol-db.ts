import Database from 'better-sqlite3';
import path from 'path';
import { League, Team, Player, CompositionsData } from './grid-types';

// Database path - separate from lol_drafts.db
const DB_PATH = path.join(process.cwd(), 'app', 'data', 'lol.db');

// Get database instance (singleton pattern for connection reuse)
let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = new Database(DB_PATH);
    dbInstance.pragma('journal_mode = WAL');
  }
  return dbInstance;
}

// Initialize database schema with complete Static Data structure
export function initializeDatabase(): void {
  const db = getDb();

  // Organizations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tournaments table (hierarchical - parent_id references self)
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_shortened TEXT,
      logo_url TEXT,
      start_date TEXT,
      end_date TEXT,
      parent_id TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Teams table
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_shortened TEXT,
      logo_url TEXT,
      color_primary TEXT,
      color_secondary TEXT,
      organization_id TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Players table
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      full_name TEXT,
      image_url TEXT,
      age INTEGER,
      nationality TEXT,
      team_id TEXT,
      roles TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Series table
  db.exec(`
    CREATE TABLE IF NOT EXISTS series (
      id TEXT PRIMARY KEY,
      tournament_id TEXT,
      format_id TEXT,
      format_name TEXT,
      start_time TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Series-Teams junction table
  db.exec(`
    CREATE TABLE IF NOT EXISTS series_teams (
      series_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      PRIMARY KEY (series_id, team_id)
    )
  `);

  // Team-Tournament junction table (which teams participate in which tournaments)
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournament_teams (
      tournament_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      PRIMARY KEY (tournament_id, team_id)
    )
  `);

  // Sync progress table (for resumable sync)
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_progress (
      entity_type TEXT PRIMARY KEY,
      last_cursor TEXT,
      fetched_count INTEGER DEFAULT 0,
      total_count INTEGER DEFAULT 0,
      completed INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Sync status table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_status (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_sync TEXT,
      series_count INTEGER DEFAULT 0,
      players_count INTEGER DEFAULT 0,
      teams_count INTEGER DEFAULT 0,
      tournaments_count INTEGER DEFAULT 0,
      organizations_count INTEGER DEFAULT 0
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);
    CREATE INDEX IF NOT EXISTS idx_teams_org ON teams(organization_id);
    CREATE INDEX IF NOT EXISTS idx_series_tournament ON series(tournament_id);
    CREATE INDEX IF NOT EXISTS idx_tournaments_parent ON tournaments(parent_id);
  `);

  // Initialize sync_status if not exists
  db.prepare('INSERT OR IGNORE INTO sync_status (id) VALUES (1)').run();
}

// Sync progress functions
export function getSyncProgress(entityType: string): {
  lastCursor: string | null;
  fetchedCount: number;
  totalCount: number;
  completed: boolean;
} {
  const db = getDb();
  const row = db.prepare('SELECT * FROM sync_progress WHERE entity_type = ?').get(entityType) as {
    last_cursor: string | null;
    fetched_count: number;
    total_count: number;
    completed: number;
  } | undefined;

  return {
    lastCursor: row?.last_cursor || null,
    fetchedCount: row?.fetched_count || 0,
    totalCount: row?.total_count || 0,
    completed: row?.completed === 1,
  };
}

export function updateSyncProgress(
  entityType: string,
  cursor: string | null,
  fetchedCount: number,
  totalCount: number,
  completed: boolean
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO sync_progress (entity_type, last_cursor, fetched_count, total_count, completed, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(entity_type) DO UPDATE SET
      last_cursor = excluded.last_cursor,
      fetched_count = excluded.fetched_count,
      total_count = excluded.total_count,
      completed = excluded.completed,
      updated_at = datetime('now')
  `).run(entityType, cursor, fetchedCount, totalCount, completed ? 1 : 0);
}

export function resetSyncProgress(entityType?: string): void {
  const db = getDb();
  if (entityType) {
    db.prepare('DELETE FROM sync_progress WHERE entity_type = ?').run(entityType);
  } else {
    db.prepare('DELETE FROM sync_progress').run();
  }
}

// Get sync status
export function getSyncStatus(): {
  lastSync: string | null;
  seriesCount: number;
  playersCount: number;
  teamsCount: number;
  tournamentsCount: number;
  organizationsCount: number;
} {
  const db = getDb();
  const row = db.prepare('SELECT * FROM sync_status WHERE id = 1').get() as {
    last_sync: string | null;
    series_count: number;
    players_count: number;
    teams_count: number;
    tournaments_count: number;
    organizations_count: number;
  } | undefined;

  return {
    lastSync: row?.last_sync || null,
    seriesCount: row?.series_count || 0,
    playersCount: row?.players_count || 0,
    teamsCount: row?.teams_count || 0,
    tournamentsCount: row?.tournaments_count || 0,
    organizationsCount: row?.organizations_count || 0,
  };
}

// Update sync status
export function updateSyncStatus(stats: {
  seriesCount?: number;
  playersCount?: number;
  teamsCount?: number;
  tournamentsCount?: number;
  organizationsCount?: number;
}): void {
  const db = getDb();
  const current = getSyncStatus();
  db.prepare(`
    UPDATE sync_status
    SET last_sync = datetime('now'),
        series_count = ?,
        players_count = ?,
        teams_count = ?,
        tournaments_count = ?,
        organizations_count = ?
    WHERE id = 1
  `).run(
    stats.seriesCount ?? current.seriesCount,
    stats.playersCount ?? current.playersCount,
    stats.teamsCount ?? current.teamsCount,
    stats.tournamentsCount ?? current.tournamentsCount,
    stats.organizationsCount ?? current.organizationsCount
  );
}

// Batch upsert functions
export function batchUpsertOrganizations(orgs: { id: string; name: string }[]): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO organizations (id, name, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = datetime('now')
  `);
  const transaction = db.transaction((items: typeof orgs) => {
    for (const org of items) {
      stmt.run(org.id, org.name);
    }
  });
  transaction(orgs);
}

export function batchUpsertTournaments(tournaments: {
  id: string;
  name: string;
  nameShortened?: string;
  logoUrl?: string;
  startDate?: string;
  endDate?: string;
  parentId?: string;
}[]): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO tournaments (id, name, name_shortened, logo_url, start_date, end_date, parent_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      name_shortened = excluded.name_shortened,
      logo_url = excluded.logo_url,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      parent_id = excluded.parent_id,
      updated_at = datetime('now')
  `);
  const transaction = db.transaction((items: typeof tournaments) => {
    for (const t of items) {
      stmt.run(t.id, t.name, t.nameShortened || null, t.logoUrl || null, t.startDate || null, t.endDate || null, t.parentId || null);
    }
  });
  transaction(tournaments);
}

export function batchUpsertTeams(teams: {
  id: string;
  name: string;
  nameShortened?: string;
  logoUrl?: string | null;
  colorPrimary?: string | null;
  colorSecondary?: string | null;
  organizationId?: string | null;
}[]): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO teams (id, name, name_shortened, logo_url, color_primary, color_secondary, organization_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      name_shortened = excluded.name_shortened,
      logo_url = excluded.logo_url,
      color_primary = excluded.color_primary,
      color_secondary = excluded.color_secondary,
      organization_id = COALESCE(excluded.organization_id, teams.organization_id),
      updated_at = datetime('now')
  `);
  const transaction = db.transaction((items: typeof teams) => {
    for (const team of items) {
      stmt.run(
        team.id,
        team.name,
        team.nameShortened || team.name,
        team.logoUrl || null,
        team.colorPrimary || null,
        team.colorSecondary || null,
        team.organizationId || null
      );
    }
  });
  transaction(teams);
}

export function batchUpsertPlayers(players: {
  id: string;
  nickname: string;
  fullName?: string | null;
  imageUrl?: string | null;
  age?: number | null;
  nationality?: string | null;
  teamId?: string | null;
  roles?: string[];
}[]): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO players (id, nickname, full_name, image_url, age, nationality, team_id, roles, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      nickname = excluded.nickname,
      full_name = COALESCE(excluded.full_name, players.full_name),
      image_url = COALESCE(excluded.image_url, players.image_url),
      age = COALESCE(excluded.age, players.age),
      nationality = COALESCE(excluded.nationality, players.nationality),
      team_id = COALESCE(excluded.team_id, players.team_id),
      roles = excluded.roles,
      updated_at = datetime('now')
  `);
  const transaction = db.transaction((items: typeof players) => {
    for (const player of items) {
      stmt.run(
        player.id,
        player.nickname,
        player.fullName || null,
        player.imageUrl || null,
        player.age || null,
        player.nationality || null,
        player.teamId || null,
        player.roles ? JSON.stringify(player.roles) : null
      );
    }
  });
  transaction(players);
}

export function batchUpsertSeries(seriesList: {
  id: string;
  tournamentId?: string;
  formatId?: string;
  formatName?: string;
  startTime?: string;
  teamIds?: string[];
}[]): void {
  const db = getDb();
  const seriesStmt = db.prepare(`
    INSERT INTO series (id, tournament_id, format_id, format_name, start_time, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      tournament_id = excluded.tournament_id,
      format_id = excluded.format_id,
      format_name = excluded.format_name,
      start_time = excluded.start_time,
      updated_at = datetime('now')
  `);
  const teamStmt = db.prepare(`
    INSERT OR IGNORE INTO series_teams (series_id, team_id) VALUES (?, ?)
  `);

  const transaction = db.transaction((items: typeof seriesList) => {
    for (const s of items) {
      seriesStmt.run(s.id, s.tournamentId || null, s.formatId || null, s.formatName || null, s.startTime || null);
      if (s.teamIds) {
        for (const teamId of s.teamIds) {
          teamStmt.run(s.id, teamId);
        }
      }
    }
  });
  transaction(seriesList);
}

export function batchUpsertTournamentTeams(relations: { tournamentId: string; teamId: string }[]): void {
  const db = getDb();
  const stmt = db.prepare('INSERT OR IGNORE INTO tournament_teams (tournament_id, team_id) VALUES (?, ?)');
  const transaction = db.transaction((items: typeof relations) => {
    for (const r of items) {
      stmt.run(r.tournamentId, r.teamId);
    }
  });
  transaction(relations);
}

// Get compositions data for frontend (teams grouped by season/tournament)
export function getCompositionsData(): CompositionsData {
  const db = getDb();

  // Get season-level tournaments (those whose parent is a top-level region)
  // These are like "LCK - Spring 2024", "LEC - Winter 2024", etc.
  const leaguesRows = db.prepare(`
    SELECT DISTINCT t.id, t.name, p.name as region_name
    FROM tournaments t
    JOIN tournaments p ON t.parent_id = p.id
    WHERE p.parent_id IS NULL
    AND EXISTS (
      SELECT 1 FROM tournament_teams tt WHERE tt.tournament_id = t.id
    )
    ORDER BY p.name, t.name DESC
  `).all() as { id: string; name: string; region_name: string }[];

  // Get teams for these season-level tournaments
  const teamsRows = db.prepare(`
    SELECT DISTINCT tm.*, tt.tournament_id as league_id
    FROM teams tm
    INNER JOIN tournament_teams tt ON tm.id = tt.team_id
    INNER JOIN tournaments t ON tt.tournament_id = t.id
    INNER JOIN tournaments p ON t.parent_id = p.id
    WHERE p.parent_id IS NULL
  `).all() as {
    id: string;
    name: string;
    name_shortened: string;
    logo_url: string | null;
    color_primary: string | null;
    color_secondary: string | null;
    league_id: string | null;
  }[];

  // Get players only for teams that are in our filtered list
  const teamIds = [...new Set(teamsRows.map(t => t.id))];
  const playersRows = teamIds.length > 0 ? db.prepare(`
    SELECT * FROM players
    WHERE team_id IN (${teamIds.map(() => '?').join(',')})
    ORDER BY nickname
  `).all(...teamIds) as {
    id: string;
    nickname: string;
    team_id: string | null;
    roles: string | null;
  }[] : [];

  // Build player map by team
  const playersByTeam = new Map<string, Player[]>();
  for (const p of playersRows) {
    if (p.team_id) {
      const players = playersByTeam.get(p.team_id) || [];
      players.push({
        id: p.id,
        nickname: p.nickname,
        roles: p.roles ? JSON.parse(p.roles) : [],
        teamId: p.team_id,
      });
      playersByTeam.set(p.team_id, players);
    }
  }

  // Build teams map by league
  const teamsByLeague = new Map<string, Team[]>();

  for (const t of teamsRows) {
    const team: Team = {
      id: t.id,
      name: t.name,
      nameShortened: t.name_shortened || t.name,
      logoUrl: t.logo_url,
      colorPrimary: t.color_primary,
      colorSecondary: t.color_secondary,
      players: playersByTeam.get(t.id) || [],
    };

    if (t.league_id) {
      const teams = teamsByLeague.get(t.league_id) || [];
      // Avoid duplicates
      if (!teams.find(existing => existing.id === team.id)) {
        teams.push(team);
        teamsByLeague.set(t.league_id, teams);
      }
    }
  }

  // Build leagues array
  const leagues: League[] = leaguesRows
    .filter(l => teamsByLeague.has(l.id))
    .map(l => ({
      id: l.id,
      name: l.name,
      teams: (teamsByLeague.get(l.id) || []).sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      // Sort by region priority, then by name (descending for most recent first)
      const majorRegions = ['LCK', 'LEC', 'LPL', 'LCS', 'LTA'];
      const aRegion = majorRegions.find(r => a.name.startsWith(r)) || 'ZZZ';
      const bRegion = majorRegions.find(r => b.name.startsWith(r)) || 'ZZZ';

      const aRegionIndex = majorRegions.indexOf(aRegion);
      const bRegionIndex = majorRegions.indexOf(bRegion);

      if (aRegionIndex !== bRegionIndex) {
        if (aRegionIndex === -1) return 1;
        if (bRegionIndex === -1) return -1;
        return aRegionIndex - bRegionIndex;
      }

      // Same region, sort by name descending (2025 before 2024)
      return b.name.localeCompare(a.name);
    });

  const syncStatus = getSyncStatus();

  return {
    leagues,
    lastUpdated: syncStatus.lastSync || new Date().toISOString(),
  };
}

// Get database statistics
export function getDbStats(): {
  organizations: number;
  tournaments: number;
  teams: number;
  players: number;
  series: number;
} {
  const db = getDb();
  return {
    organizations: (db.prepare('SELECT COUNT(*) as c FROM organizations').get() as { c: number }).c,
    tournaments: (db.prepare('SELECT COUNT(*) as c FROM tournaments').get() as { c: number }).c,
    teams: (db.prepare('SELECT COUNT(*) as c FROM teams').get() as { c: number }).c,
    players: (db.prepare('SELECT COUNT(*) as c FROM players').get() as { c: number }).c,
    series: (db.prepare('SELECT COUNT(*) as c FROM series').get() as { c: number }).c,
  };
}

// Close database connection
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
