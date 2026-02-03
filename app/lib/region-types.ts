/**
 * Region types for role posteriors filtering
 */
export type RoleRegion = 'global' | 'lck' | 'lpl' | 'lec' | 'americas';

export const ALL_ROLE_REGIONS: RoleRegion[] = ['global', 'lck', 'lpl', 'lec', 'americas'];

/**
 * Map tournament name prefixes to regions
 */
export const TOURNAMENT_TO_REGION: Record<string, RoleRegion> = {
  'LCK -': 'lck',
  'LPL -': 'lpl',
  'LEC -': 'lec',
  'LCS -': 'americas',
  'LTA North -': 'americas',
  'LTA South -': 'americas',
  'LTA Cross-Conference -': 'americas',
};

/**
 * Map UI region labels to internal region keys
 */
export const UI_REGION_TO_INTERNAL: Record<string, RoleRegion> = {
  'LCK': 'lck',
  'LPL': 'lpl',
  'LEC': 'lec',
  'LCS': 'americas',
  'LTA': 'americas',
};

/**
 * Minimum total raw games for a champion in a region to use region-specific data
 * Below this threshold, fall back to global posteriors
 */
export const MIN_REGION_SAMPLE_SIZE = 10;
