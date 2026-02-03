import { promises as fs } from 'fs';
import * as path from 'path';
import type {
  WeightedRolePosteriorsData,
  ChampionRolePosterior,
  Role,
  RoleDistribution,
  RoleCounts,
  WeightedPosteriorMetadata,
} from './weighted-role-types';

const ROLES: Role[] = ['top', 'jungle', 'mid', 'bot', 'support'];

/**
 * Internal type for weighted counts (floats, not integers).
 * Note: ChampionRolePosterior.weighted_counts_by_role uses RoleCounts type,
 * but the actual values are floats representing weighted game counts.
 */
type RoleWeights = {
  top: number;
  jungle: number;
  mid: number;
  bot: number;
  support: number;
};

// Module-level cache
let cachedData: WeightedRolePosteriorsData | null = null;

/**
 * Debug counter: tracks how many times readFile is called.
 * Used to verify caching works correctly.
 *
 * Test cache correctness:
 *   import { loadWeightedRolePosteriors, __debugReadCount, clearCache } from './weighted-role-loader';
 *   clearCache();
 *   await loadWeightedRolePosteriors(); // readCount = 1
 *   await loadWeightedRolePosteriors(); // readCount still 1 (cached)
 *   console.log(__debugReadCount); // should be 1
 */
export let __debugReadCount = 0;

/**
 * Validation error with detailed context
 */
export class WeightedRoleValidationError extends Error {
  constructor(
    message: string,
    public readonly context: {
      champion?: string;
      field?: string;
      value?: unknown;
    } = {}
  ) {
    super(message);
    this.name = 'WeightedRoleValidationError';
  }
}

/**
 * Validate that a value is a non-empty string
 */
function assertNonEmptyString(
  value: unknown,
  champion: string,
  field: string
): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WeightedRoleValidationError(
      `${field} must be a non-empty string`,
      { champion, field, value }
    );
  }
}

/**
 * Validate that a value is a string (for metadata fields)
 */
function assertString(
  value: unknown,
  field: string
): asserts value is string {
  if (typeof value !== 'string') {
    throw new WeightedRoleValidationError(
      `${field} must be a string`,
      { field, value }
    );
  }
}

/**
 * Validate that a value is a number
 */
function assertNumber(
  value: unknown,
  champion: string,
  field: string
): asserts value is number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new WeightedRoleValidationError(`${field} must be a number`, {
      champion,
      field,
      value,
    });
  }
}

/**
 * Validate that a value is a number (for metadata fields without champion context)
 */
function assertMetadataNumber(
  value: unknown,
  field: string
): asserts value is number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new WeightedRoleValidationError(`${field} must be a number`, {
      field,
      value,
    });
  }
}

/**
 * Validate that a value is an integer
 */
function assertInteger(
  value: unknown,
  champion: string,
  field: string
): asserts value is number {
  assertNumber(value, champion, field);
  if (!Number.isInteger(value)) {
    throw new WeightedRoleValidationError(`${field} must be an integer`, {
      champion,
      field,
      value,
    });
  }
}

/**
 * Validate RoleCounts (all integers) - for raw_counts_by_role
 */
function validateRoleCounts(
  obj: unknown,
  champion: string,
  field: string
): RoleCounts {
  if (typeof obj !== 'object' || obj === null) {
    throw new WeightedRoleValidationError(`${field} must be an object`, {
      champion,
      field,
      value: obj,
    });
  }
  const counts = obj as Record<string, unknown>;
  for (const role of ROLES) {
    assertInteger(counts[role], champion, `${field}.${role}`);
  }
  return counts as unknown as RoleCounts;
}

/**
 * Validate RoleWeights (all numbers/floats) - for weighted_counts_by_role
 * Note: Returns as RoleCounts to match ChampionRolePosterior type,
 * but values are floats representing weighted game counts, not raw integers.
 */
function validateRoleWeights(
  obj: unknown,
  champion: string,
  field: string
): RoleWeights {
  if (typeof obj !== 'object' || obj === null) {
    throw new WeightedRoleValidationError(`${field} must be an object`, {
      champion,
      field,
      value: obj,
    });
  }
  const weights = obj as Record<string, unknown>;
  for (const role of ROLES) {
    assertNumber(weights[role], champion, `${field}.${role}`);
  }
  return weights as unknown as RoleWeights;
}

/**
 * Validate RoleDistribution (all numbers, sum ~= 1)
 */
function validateRoleDistribution(
  obj: unknown,
  champion: string,
  field: string
): RoleDistribution {
  if (typeof obj !== 'object' || obj === null) {
    throw new WeightedRoleValidationError(`${field} must be an object`, {
      champion,
      field,
      value: obj,
    });
  }
  const dist = obj as Record<string, unknown>;
  let sum = 0;
  for (const role of ROLES) {
    assertNumber(dist[role], champion, `${field}.${role}`);
    sum += dist[role] as number;
  }
  if (sum < 0.999 || sum > 1.001) {
    throw new WeightedRoleValidationError(
      `${field} sum must be in [0.999, 1.001], got ${sum}`,
      { champion, field, value: sum }
    );
  }
  return dist as unknown as RoleDistribution;
}

/**
 * Validate global role distribution in metadata (sum ~= 1)
 */
function validateGlobalRoleDistribution(
  obj: unknown,
  field: string
): RoleDistribution {
  if (typeof obj !== 'object' || obj === null) {
    throw new WeightedRoleValidationError(`${field} must be an object`, {
      field,
      value: obj,
    });
  }
  const dist = obj as Record<string, unknown>;
  let sum = 0;
  for (const role of ROLES) {
    assertMetadataNumber(dist[role], `${field}.${role}`);
    sum += dist[role] as number;
  }
  if (sum < 0.999 || sum > 1.001) {
    throw new WeightedRoleValidationError(
      `${field} sum must be in [0.999, 1.001], got ${sum}`,
      { field, value: sum }
    );
  }
  return dist as unknown as RoleDistribution;
}

/**
 * Validate a single champion entry
 */
function validateChampionEntry(
  key: string,
  entry: unknown
): ChampionRolePosterior {
  if (typeof entry !== 'object' || entry === null) {
    throw new WeightedRoleValidationError('Champion entry must be an object', {
      champion: key,
    });
  }

  const e = entry as Record<string, unknown>;

  // champion_name must match key
  assertNonEmptyString(e.champion_name, key, 'champion_name');
  if (e.champion_name !== key) {
    throw new WeightedRoleValidationError(
      `champion_name "${e.champion_name}" does not match key "${key}"`,
      { champion: key, field: 'champion_name', value: e.champion_name }
    );
  }

  // champion_id
  assertNonEmptyString(e.champion_id, key, 'champion_id');

  // raw_counts_by_role (integers)
  const rawCounts = validateRoleCounts(e.raw_counts_by_role, key, 'raw_counts_by_role');

  // weighted_counts_by_role (floats - weighted game counts, not raw integers)
  const weightedCounts = validateRoleWeights(
    e.weighted_counts_by_role,
    key,
    'weighted_counts_by_role'
  );

  // role_probabilities
  const roleProbs = validateRoleDistribution(e.role_probabilities, key, 'role_probabilities');

  // effective_sample_size
  assertNumber(e.effective_sample_size, key, 'effective_sample_size');

  // isFlexPick
  if (typeof e.isFlexPick !== 'boolean') {
    throw new WeightedRoleValidationError('isFlexPick must be a boolean', {
      champion: key,
      field: 'isFlexPick',
      value: e.isFlexPick,
    });
  }

  // flexibilityScore
  assertNumber(e.flexibilityScore, key, 'flexibilityScore');

  // significantRoles
  if (!Array.isArray(e.significantRoles)) {
    throw new WeightedRoleValidationError('significantRoles must be an array', {
      champion: key,
      field: 'significantRoles',
      value: e.significantRoles,
    });
  }
  for (const r of e.significantRoles) {
    if (!ROLES.includes(r as Role)) {
      throw new WeightedRoleValidationError(`Invalid role in significantRoles: ${r}`, {
        champion: key,
        field: 'significantRoles',
        value: r,
      });
    }
  }

  return {
    champion_id: e.champion_id as string,
    champion_name: e.champion_name as string,
    raw_counts_by_role: rawCounts,
    // Cast RoleWeights to RoleCounts to satisfy type (values are floats)
    weighted_counts_by_role: weightedCounts as unknown as RoleCounts,
    role_probabilities: roleProbs,
    effective_sample_size: e.effective_sample_size as number,
    isFlexPick: e.isFlexPick as boolean,
    flexibilityScore: e.flexibilityScore as number,
    significantRoles: e.significantRoles as Role[],
  };
}

/**
 * Validate metadata.parameters
 */
function validateMetadataParameters(params: unknown): void {
  if (typeof params !== 'object' || params === null) {
    throw new WeightedRoleValidationError('metadata.parameters must be an object', {
      field: 'metadata.parameters',
    });
  }
  const p = params as Record<string, unknown>;

  // delta_patch_cap
  assertMetadataNumber(p.delta_patch_cap, 'metadata.parameters.delta_patch_cap');

  // delta_patch_stats
  if (typeof p.delta_patch_stats !== 'object' || p.delta_patch_stats === null) {
    throw new WeightedRoleValidationError('delta_patch_stats must be an object', {
      field: 'metadata.parameters.delta_patch_stats',
    });
  }
  const dps = p.delta_patch_stats as Record<string, unknown>;
  const requiredFields = ['games_in_major', 'target_major', 'min', 'median', 'p90', 'max'];
  for (const f of requiredFields) {
    assertMetadataNumber(dps[f], `metadata.parameters.delta_patch_stats.${f}`);
  }
}

/**
 * Validate the entire metadata structure
 */
function validateMetadata(metadata: unknown): WeightedPosteriorMetadata {
  if (typeof metadata !== 'object' || metadata === null) {
    throw new WeightedRoleValidationError('metadata must be an object', {
      field: 'metadata',
    });
  }
  const m = metadata as Record<string, unknown>;

  // Required string fields
  assertString(m.generated_at_utc, 'metadata.generated_at_utc');
  assertString(m.target_patch, 'metadata.target_patch');

  // Required number fields
  assertMetadataNumber(m.target_patch_index, 'metadata.target_patch_index');
  assertMetadataNumber(m.total_effective_weight, 'metadata.total_effective_weight');

  // Validate parameters
  validateMetadataParameters(m.parameters);

  // Validate global_role_distribution (sum ~= 1)
  validateGlobalRoleDistribution(m.global_role_distribution, 'metadata.global_role_distribution');

  // validation_split must be an object (minimal check)
  if (typeof m.validation_split !== 'object' || m.validation_split === null) {
    throw new WeightedRoleValidationError('validation_split must be an object', {
      field: 'metadata.validation_split',
    });
  }

  // data_quality must be an object (minimal check)
  if (typeof m.data_quality !== 'object' || m.data_quality === null) {
    throw new WeightedRoleValidationError('data_quality must be an object', {
      field: 'metadata.data_quality',
    });
  }

  return metadata as WeightedPosteriorMetadata;
}

/**
 * Validate the entire data structure
 */
function validateData(data: unknown): WeightedRolePosteriorsData {
  if (typeof data !== 'object' || data === null) {
    throw new WeightedRoleValidationError('Data must be an object');
  }

  const d = data as Record<string, unknown>;

  // Validate metadata
  const metadata = validateMetadata(d.metadata);

  // champions
  if (typeof d.champions !== 'object' || d.champions === null) {
    throw new WeightedRoleValidationError('champions must be an object');
  }
  const championsRaw = d.champions as Record<string, unknown>;
  const champions: Record<string, ChampionRolePosterior> = {};

  for (const [key, entry] of Object.entries(championsRaw)) {
    champions[key] = validateChampionEntry(key, entry);
  }

  return {
    metadata,
    champions,
  };
}

/**
 * Load and validate weighted role posteriors data.
 * Uses module-level caching to avoid repeated file reads.
 */
export async function loadWeightedRolePosteriors(): Promise<WeightedRolePosteriorsData> {
  if (cachedData !== null) {
    return cachedData;
  }

  // Support env override for path flexibility; fallback to cwd-based path
  const filePath =
    process.env.WEIGHTED_ROLE_POSTERIORS_PATH ||
    path.join(process.cwd(), 'data', 'grid_v2', 'weighted-role-posteriors.json');

  __debugReadCount++;
  const raw = await fs.readFile(filePath, 'utf-8');
  const parsed = JSON.parse(raw);

  cachedData = validateData(parsed);
  return cachedData;
}

/**
 * Get the primary role (argmax of role_probabilities)
 */
export function getPrimaryRole(probs: RoleDistribution): Role {
  let maxProb = -1;
  let maxRole: Role = 'mid';
  for (const role of ROLES) {
    if (probs[role] > maxProb) {
      maxProb = probs[role];
      maxRole = role;
    }
  }
  return maxRole;
}

/**
 * Clear the cache (useful for testing)
 */
export function clearCache(): void {
  cachedData = null;
}
