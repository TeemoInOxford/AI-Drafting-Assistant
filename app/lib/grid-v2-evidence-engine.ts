/**
 * Grid V2 Evidence Engine - Client-Safe Types and Helpers
 *
 * Unified evidence types and display helpers for grid_v2 data.
 * This file contains only client-safe code (no Node.js fs/path imports).
 *
 * Data fetching should be done via API calls in components.
 */

// ============================================================================
// Types
// ============================================================================

export type EvidenceType = 'TEAM_DENIAL' | 'PLAYER_SPECIALTY' | 'META_PTS' | 'ROLE_FLEX_PRESSURE';
export type EvidenceSource = 'grid_v2' | 'lol_fallback';

export interface Evidence {
  type: EvidenceType;
  score: number;
  components?: Record<string, number>;
  summary: string;
  details: EvidenceDetails;
  source: EvidenceSource;
}

export interface EvidenceDetails {
  // TEAM_DENIAL specific
  top_opponent_teams?: Array<{ team_name: string; count: number }>;
  raw_opponent_ban?: number;
  raw_meta_ban?: number;
  raw_self_ban?: number;

  // PLAYER_SPECIALTY specific
  top_players?: Array<{
    player_name: string;
    games_weighted: number;
    win_rate_weighted: number;
    last_played_patch: string;
  }>;
  players_count?: number;
  total_games_weighted?: number;

  // META_PTS specific
  meta_presence?: number;
  meta_ban_rate?: number;
  meta_pick_rate?: number;

  // ROLE_FLEX_PRESSURE specific
  role_distribution?: Record<string, number>;
  flexibility_score?: number;
  primary_role?: string;
}

export interface DraftContext {
  opponentTeamId: string;
  opponentTeamName?: string;
  championName: string;
  side?: 'blue' | 'red';
  phase?: 'ban' | 'pick';
  alreadyBanned?: string[];
}

export interface ChampionEvidence {
  championName: string;
  evidences: Evidence[];
  primaryEvidence: Evidence | null;
  totalScore: number;
}

// ============================================================================
// Evidence Labels and Display Helpers
// ============================================================================

export const EVIDENCE_TYPE_LABELS: Record<EvidenceType, string> = {
  TEAM_DENIAL: 'Team Denial',
  PLAYER_SPECIALTY: 'Player Pool',
  META_PTS: 'Meta',
  ROLE_FLEX_PRESSURE: 'Flex Threat',
};

export const EVIDENCE_TYPE_ICONS: Record<EvidenceType, string> = {
  TEAM_DENIAL: '🎯',
  PLAYER_SPECIALTY: '👤',
  META_PTS: '📊',
  ROLE_FLEX_PRESSURE: '🔄',
};

export const EVIDENCE_TYPE_COLORS: Record<EvidenceType, string> = {
  TEAM_DENIAL: 'text-blue-300 bg-blue-500/20 border-blue-500/40',
  PLAYER_SPECIALTY: 'text-purple-300 bg-purple-500/20 border-purple-500/40',
  META_PTS: 'text-slate-300 bg-slate-500/20 border-slate-500/40',
  ROLE_FLEX_PRESSURE: 'text-amber-300 bg-amber-500/20 border-amber-500/40',
};

/**
 * Format evidence details for display in popover
 */
export function formatEvidenceDetails(evidence: Evidence): string[] {
  const lines: string[] = [];

  switch (evidence.type) {
    case 'TEAM_DENIAL':
      if (evidence.details.raw_opponent_ban !== undefined) {
        lines.push(`Opponent ban rate: ${(evidence.details.raw_opponent_ban * 100).toFixed(1)}%`);
      }
      if (evidence.details.raw_meta_ban !== undefined) {
        lines.push(`Meta ban rate: ${(evidence.details.raw_meta_ban * 100).toFixed(1)}%`);
      }
      if (evidence.details.top_opponent_teams?.length) {
        lines.push('Top opponents:');
        evidence.details.top_opponent_teams.slice(0, 3).forEach(t => {
          lines.push(`  • ${t.team_name} (${t.count}x)`);
        });
      }
      break;

    case 'PLAYER_SPECIALTY':
      if (evidence.details.players_count !== undefined) {
        lines.push(`Players: ${evidence.details.players_count}`);
      }
      if (evidence.details.total_games_weighted !== undefined) {
        lines.push(`Weighted games: ${evidence.details.total_games_weighted.toFixed(1)}`);
      }
      if (evidence.details.top_players?.length) {
        lines.push('Top players:');
        evidence.details.top_players.slice(0, 3).forEach(p => {
          lines.push(`  • ${p.player_name}: ${p.games_weighted.toFixed(1)}g, ${(p.win_rate_weighted * 100).toFixed(0)}% WR`);
        });
      }
      break;

    case 'META_PTS':
      if (evidence.details.meta_presence !== undefined) {
        lines.push(`Presence: ${(evidence.details.meta_presence * 100).toFixed(1)}%`);
      }
      if (evidence.details.meta_ban_rate !== undefined) {
        lines.push(`Ban rate: ${(evidence.details.meta_ban_rate * 100).toFixed(1)}%`);
      }
      break;

    case 'ROLE_FLEX_PRESSURE':
      if (evidence.details.flexibility_score !== undefined) {
        lines.push(`Flex score: ${evidence.details.flexibility_score.toFixed(2)}`);
      }
      if (evidence.details.role_distribution) {
        lines.push('Roles:');
        Object.entries(evidence.details.role_distribution)
          .filter(([_, prob]) => prob > 0.05)
          .sort((a, b) => b[1] - a[1])
          .forEach(([role, prob]) => {
            lines.push(`  • ${role}: ${(prob * 100).toFixed(0)}%`);
          });
      }
      break;
  }

  if (evidence.source === 'lol_fallback') {
    lines.push('');
    lines.push('⚠️ Using legacy data (grid_v2 unavailable)');
  }

  return lines;
}

// ============================================================================
// Evidence Builder Helpers (for use in components after API fetch)
// ============================================================================

/**
 * Build TEAM_DENIAL evidence from API response data
 */
export function buildTeamDenialEvidence(signal: {
  score: number;
  components?: { OPPONENT_BAN?: number; META?: number; SELF?: number };
  evidence?: {
    top_opponent_teams?: Array<{ team_name: string; count: number }>;
    raw_scores?: {
      opponent_ban_weighted?: number;
      meta_ban_rate?: number;
      self_ban_rate?: number;
    };
  };
}): Evidence {
  const opponentBan = signal.components?.OPPONENT_BAN || 0;
  return {
    type: 'TEAM_DENIAL',
    score: signal.score,
    components: signal.components,
    summary: `Frequently banned against this team (${(opponentBan * 100).toFixed(0)}% opponent-driven)`,
    details: {
      top_opponent_teams: signal.evidence?.top_opponent_teams,
      raw_opponent_ban: signal.evidence?.raw_scores?.opponent_ban_weighted,
      raw_meta_ban: signal.evidence?.raw_scores?.meta_ban_rate,
      raw_self_ban: signal.evidence?.raw_scores?.self_ban_rate,
    },
    source: 'grid_v2',
  };
}

/**
 * Build PLAYER_SPECIALTY evidence from API response data
 */
export function buildPlayerSpecialtyEvidence(signal: {
  score: number;
  components?: { TEAM_POOL?: number; TOP_PLAYER?: number; RECENCY?: number };
  players_count?: number;
  evidence?: {
    top_players?: Array<{
      player_id?: string;
      player_name: string;
      games_weighted: number;
      win_rate_weighted: number;
      last_played_patch: string;
    }>;
    raw_scores?: {
      team_pool?: number;
      top_player?: number;
      recency?: number;
    };
  };
}): Evidence {
  const topPlayer = signal.evidence?.top_players?.[0];
  const topPlayerSummary = topPlayer
    ? `${topPlayer.player_name} specialty (${topPlayer.games_weighted.toFixed(1)} weighted games)`
    : 'Team pool threat';

  return {
    type: 'PLAYER_SPECIALTY',
    score: signal.score,
    components: signal.components,
    summary: topPlayerSummary,
    details: {
      top_players: signal.evidence?.top_players,
      players_count: signal.players_count,
      total_games_weighted: signal.evidence?.raw_scores?.team_pool,
    },
    source: 'grid_v2',
  };
}

/**
 * Build META_PTS evidence from meta data
 */
export function buildMetaPtsEvidence(
  metaData: { presence?: number; ban_rate?: number; pick_rate?: number }
): Evidence | null {
  const presence = metaData.presence || 0;
  const banRate = metaData.ban_rate || 0;

  if (presence <= 0 && banRate <= 0) return null;

  const score = presence + banRate;

  return {
    type: 'META_PTS',
    score,
    summary: `Meta presence ${(presence * 100).toFixed(0)}%, ban rate ${(banRate * 100).toFixed(0)}%`,
    details: {
      meta_presence: presence,
      meta_ban_rate: banRate,
      meta_pick_rate: metaData.pick_rate,
    },
    source: 'grid_v2',
  };
}

/**
 * Build ROLE_FLEX_PRESSURE evidence from role data
 */
export function buildRoleFlexEvidence(
  roleDistribution: Record<string, number>,
  flexibilityScore: number
): Evidence | null {
  if (!roleDistribution || flexibilityScore < 0.3) {
    return null;
  }

  const roles = Object.entries(roleDistribution)
    .filter(([_, prob]) => prob > 0.1)
    .sort((a, b) => b[1] - a[1]);

  if (roles.length < 2) return null;

  const primaryRole = roles[0][0];
  const secondaryRole = roles[1][0];

  return {
    type: 'ROLE_FLEX_PRESSURE',
    score: flexibilityScore,
    summary: `Flex threat: ${primaryRole}/${secondaryRole}`,
    details: {
      role_distribution: roleDistribution,
      flexibility_score: flexibilityScore,
      primary_role: primaryRole,
    },
    source: 'grid_v2',
  };
}
