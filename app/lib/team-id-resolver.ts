/**
 * Team ID Resolver
 *
 * Handles mapping between different team ID formats:
 * - Numeric ID (e.g., "3389", "47494") - used by grid_v2 APIs
 * - OE ID (e.g., "oe:team:dd09e06e5ace9cc1bef2b5c7") - used by some legacy systems
 * - Team Name (e.g., "T1", "Gen.G Esports")
 *
 * Provides a unified resolution function with 10-minute memory cache.
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

interface TeamEntry {
  id: string;
  name: string;
  nameShortened?: string;
  logoUrl?: string;
  organization?: { id: string; name: string };
}

interface TeamHomeLgEntry {
  name: string;
  home_league: string;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// ============================================================================
// Cache Configuration
// ============================================================================

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// In-memory caches
let teamMappingCache: CacheEntry<{
  byNumericId: Map<string, TeamEntry>;
  byName: Map<string, string>; // name -> numeric ID
  byNameLower: Map<string, string>; // lowercase name -> numeric ID
  byShortName: Map<string, string>; // shortened name -> numeric ID
}> | null = null;

// ============================================================================
// Data Loading
// ============================================================================

function loadTeamMapping(): {
  byNumericId: Map<string, TeamEntry>;
  byName: Map<string, string>;
  byNameLower: Map<string, string>;
  byShortName: Map<string, string>;
} {
  const now = Date.now();

  // Return cached data if still valid
  if (teamMappingCache && now - teamMappingCache.timestamp < CACHE_TTL_MS) {
    return teamMappingCache.data;
  }

  const byNumericId = new Map<string, TeamEntry>();
  const byName = new Map<string, string>();
  const byNameLower = new Map<string, string>();
  const byShortName = new Map<string, string>();

  try {
    // Load from grid_v2/teams.json
    const teamsPath = path.join(process.cwd(), 'data', 'grid_v2', 'teams.json');
    if (fs.existsSync(teamsPath)) {
      const teamsData: TeamEntry[] = JSON.parse(fs.readFileSync(teamsPath, 'utf-8'));

      for (const team of teamsData) {
        if (!team.id) continue;

        byNumericId.set(team.id, team);

        if (team.name) {
          byName.set(team.name, team.id);
          byNameLower.set(team.name.toLowerCase(), team.id);
        }

        if (team.nameShortened) {
          byShortName.set(team.nameShortened, team.id);
          byShortName.set(team.nameShortened.toLowerCase(), team.id);
        }
      }
    }

    // Also load from team_home_league_map.json for additional mappings
    const homeLgPath = path.join(process.cwd(), 'data', 'grid_v2', 'team_home_league_map.json');
    if (fs.existsSync(homeLgPath)) {
      const homeLgData: Record<string, TeamHomeLgEntry> = JSON.parse(fs.readFileSync(homeLgPath, 'utf-8'));

      for (const [teamId, entry] of Object.entries(homeLgData)) {
        if (entry.name && !byName.has(entry.name)) {
          byName.set(entry.name, teamId);
          byNameLower.set(entry.name.toLowerCase(), teamId);
        }
      }
    }
  } catch (error) {
    console.error('[team-id-resolver] Failed to load team mapping:', error);
  }

  const result = { byNumericId, byName, byNameLower, byShortName };
  teamMappingCache = { data: result, timestamp: now };

  return result;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Normalize a team ID input to its canonical numeric form.
 *
 * Handles:
 * - Already numeric: "3389" -> "3389"
 * - OE format: "oe:team:xxx" -> attempts lookup, returns null if not found
 * - Team name: "T1" -> looks up numeric ID
 *
 * @param input - The team identifier (numeric ID, OE ID, or team name)
 * @returns The numeric team ID, or null if not found/resolvable
 */
export function normalizeTeamId(input: string | null | undefined): string | null {
  if (!input) return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  // Case 1: Already a numeric ID
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  // Case 2: OE format (oe:team:xxx)
  // We cannot reliably map OE IDs without a lookup table
  // For now, return null and let the caller handle fallback
  if (trimmed.startsWith('oe:')) {
    // Attempt to extract any numeric portion (unlikely to match)
    return null;
  }

  // Case 3: Try to lookup by team name
  const mapping = loadTeamMapping();

  // Exact match
  if (mapping.byName.has(trimmed)) {
    return mapping.byName.get(trimmed)!;
  }

  // Case-insensitive match
  if (mapping.byNameLower.has(trimmed.toLowerCase())) {
    return mapping.byNameLower.get(trimmed.toLowerCase())!;
  }

  // Short name match
  if (mapping.byShortName.has(trimmed)) {
    return mapping.byShortName.get(trimmed)!;
  }

  if (mapping.byShortName.has(trimmed.toLowerCase())) {
    return mapping.byShortName.get(trimmed.toLowerCase())!;
  }

  return null;
}

/**
 * Resolve a team identifier to a numeric ID with multiple input options.
 *
 * Priority:
 * 1. teamId (if numeric, use directly)
 * 2. teamId (if OE format or name, lookup)
 * 3. oeid (if provided, lookup)
 * 4. teamName (if provided, lookup)
 *
 * @param options - Object with optional teamId, oeid, teamName
 * @returns The resolved numeric team ID, or null if not resolvable
 */
export function resolveTeamId(options: {
  teamId?: string | null;
  oeid?: string | null;
  teamName?: string | null;
}): string | null {
  const { teamId, oeid, teamName } = options;

  // Try teamId first
  if (teamId) {
    const resolved = normalizeTeamId(teamId);
    if (resolved) return resolved;
  }

  // Try OE ID (though we can't currently resolve these)
  if (oeid) {
    const resolved = normalizeTeamId(oeid);
    if (resolved) return resolved;
  }

  // Try team name
  if (teamName) {
    const resolved = normalizeTeamId(teamName);
    if (resolved) return resolved;
  }

  return null;
}

/**
 * Get team info by numeric ID.
 *
 * @param numericId - The numeric team ID
 * @returns Team entry or null if not found
 */
export function getTeamById(numericId: string): TeamEntry | null {
  if (!numericId) return null;

  const mapping = loadTeamMapping();
  return mapping.byNumericId.get(numericId) || null;
}

/**
 * Check if a team ID exists in our database.
 *
 * @param numericId - The numeric team ID
 * @returns true if the team exists
 */
export function teamExists(numericId: string): boolean {
  if (!numericId) return false;

  const mapping = loadTeamMapping();
  return mapping.byNumericId.has(numericId);
}

/**
 * Get all known team IDs.
 *
 * @returns Array of numeric team IDs
 */
export function getAllTeamIds(): string[] {
  const mapping = loadTeamMapping();
  return Array.from(mapping.byNumericId.keys());
}

/**
 * Clear the team mapping cache.
 * Useful for testing or when data files are updated.
 */
export function clearTeamCache(): void {
  teamMappingCache = null;
}
