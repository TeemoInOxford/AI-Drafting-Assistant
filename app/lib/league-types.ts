/**
 * League types for role posteriors filtering
 *
 * Based on leagues.json truth source:
 * - LCK: Korea major league
 * - LPL: China major league
 * - LEC: Europe major league
 * - LCS: Americas 2024 (league_id "LCS", display "LCS (2024)")
 * - LTA_N: Americas 2025 North (league_id "LTA_N", display "LTA North")
 * - LTA_S: Americas 2025 South (league_id "LTA_S", display "LTA South")
 */
export type LeagueKey = 'global' | 'lck' | 'lpl' | 'lec' | 'lcs' | 'lta_n' | 'lta_s';

export const ALL_LEAGUES: LeagueKey[] = ['global', 'lck', 'lpl', 'lec', 'lcs', 'lta_n', 'lta_s'];

/**
 * Human-readable labels for each league (matches display_name from leagues.json)
 */
export const LEAGUE_LABELS: Record<LeagueKey, string> = {
  global: 'Global',
  lck: 'LCK',
  lpl: 'LPL',
  lec: 'LEC',
  lcs: 'LCS (2024)',
  lta_n: 'LTA North',
  lta_s: 'LTA South',
};

/**
 * Map tournament name prefixes to leagues.
 * Used when parsing series.json tournament names.
 *
 * Note: "LTA Cross-Conference -" maps to global because cross-conference
 * matches don't belong to a single league.
 */
export const TOURNAMENT_TO_LEAGUE: Record<string, LeagueKey> = {
  'LCK -': 'lck',
  'LPL -': 'lpl',
  'LEC -': 'lec',
  'LCS -': 'lcs',
  'LTA North -': 'lta_n',
  'LTA South -': 'lta_s',
  // Cross-conference doesn't belong to a single league, fall back to global
  'LTA Cross-Conference -': 'global',
};

/**
 * Map UI league labels/inputs to internal league keys.
 * Supports various input formats (case variations, abbreviations).
 */
export const UI_LABEL_TO_LEAGUE: Record<string, LeagueKey> = {
  // Global
  'Global': 'global',
  'GLOBAL': 'global',
  'global': 'global',
  // LCK
  'LCK': 'lck',
  'lck': 'lck',
  // LPL
  'LPL': 'lpl',
  'lpl': 'lpl',
  // LEC
  'LEC': 'lec',
  'lec': 'lec',
  // LCS
  'LCS': 'lcs',
  'lcs': 'lcs',
  'LCS (2024)': 'lcs',
  // LTA North
  'LTA_N': 'lta_n',
  'lta_n': 'lta_n',
  'LTA N': 'lta_n',
  'LTA North': 'lta_n',
  'lta north': 'lta_n',
  'LTA_NORTH': 'lta_n',
  'LTA North (2025)': 'lta_n',
  // LTA South
  'LTA_S': 'lta_s',
  'lta_s': 'lta_s',
  'LTA S': 'lta_s',
  'LTA South': 'lta_s',
  'lta south': 'lta_s',
  'LTA_SOUTH': 'lta_s',
  'LTA South (2025)': 'lta_s',
};

/**
 * Check if a string is a valid LeagueKey
 */
export function isValidLeagueKey(key: string): key is LeagueKey {
  return ALL_LEAGUES.includes(key as LeagueKey);
}

/**
 * Migrate legacy region string to LeagueKey.
 * Handles: trim, case-insensitive, LTA variants, empty/null values.
 *
 * IMPORTANT:
 * - "americas" is NOT a valid league (it's a region), falls back to global
 * - Only explicit league identifiers are mapped
 */
export function migrateRegionToLeague(region: string | null | undefined): LeagueKey {
  if (!region || region === '') return 'global';

  const trimmed = region.trim();
  if (!trimmed) return 'global';

  // Check if already a valid LeagueKey (lowercase)
  const lower = trimmed.toLowerCase();
  if (isValidLeagueKey(lower)) return lower;

  // UI label lookup
  const labelMatch = UI_LABEL_TO_LEAGUE[trimmed] || UI_LABEL_TO_LEAGUE[lower] || UI_LABEL_TO_LEAGUE[trimmed.toUpperCase()];
  if (labelMatch) return labelMatch;

  // Handle legacy variants with hyphens/underscores/spaces
  const normalized = lower.replace(/[-_\s]+/g, '');
  const legacyMapping: Record<string, LeagueKey> = {
    // Compact forms
    'ltan': 'lta_n',
    'ltanorth': 'lta_n',
    'ltas': 'lta_s',
    'ltasouth': 'lta_s',
  };
  if (legacyMapping[normalized]) return legacyMapping[normalized];

  // Handle underscore/space variants that didn't match UI_LABEL_TO_LEAGUE
  // (e.g., old localStorage might have "lta_north" or "lta south")
  const underscoreMapping: Record<string, LeagueKey> = {
    'lta_north': 'lta_n',
    'lta_south': 'lta_s',
    'lta north': 'lta_n',
    'lta south': 'lta_s',
  };
  if (underscoreMapping[lower]) return underscoreMapping[lower];

  // "americas" is a region, not a league - cannot determine which league
  // (could be LCS, LTA North, or LTA South), so fall back to global
  if (normalized === 'americas') {
    return 'global';
  }

  return 'global';
}

/**
 * Minimum total raw games for a champion in a league to use league-specific data.
 * Below this threshold, fall back to global posteriors.
 */
export const MIN_LEAGUE_SAMPLE_SIZE = 10;
