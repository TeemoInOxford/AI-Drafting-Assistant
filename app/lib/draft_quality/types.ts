export type Side = 'blue' | 'red';
export type Role = 'top' | 'jungle' | 'mid' | 'bot' | 'support';
export const ROLES: Role[] = ['top', 'jungle', 'mid', 'bot', 'support'];

export type FixVersion = 'v0' | 'v1' | 'v2';

export interface FixConfig {
  version: FixVersion;
  rolePenalty: number;   // e.g. -0.3 for v1/v2
  cfK: number;           // shrink k for v2
}

export interface SlotModel {
  slot: string;
  weights: Record<string, number>;
  bias: number;
  normalization: Record<string, { mean: number; std: number }>;
}

export interface CounterForResult {
  value: number;
  count: number;
}

export interface CandidateFeatures {
  our_meta_sum: number;
  opp_meta_sum: number;
  our_synergy: number;
  opp_synergy: number;
  counter_for: number;
  counter_against: number;
  role_coverage: number;
}

export interface ScoredCandidate {
  champId: string;
  champName: string;
  role: Role | null;
  roleCov: number;
  cfCount: number;
  cfRaw: number;
  scores: Record<FixVersion, number>;
}

export interface DraftQualityRecord {
  gameId: string;
  patch: string | null;
  startedAt: string;
  side: Side;
  slot: string;
  teamId: string;
  actual_pick: string;
  actual_pick_id: string;
  actual_role: Role | null;
  actual_rank: number;
  actual_score: number;
  best_pick: string;
  best_pick_id: string;
  best_score: number;
  regret: number;
  percentile: number;
  num_candidates: number;
  outcome: number;
  counter_for_raw: number;
  counter_for_count: number;
  actual_role_coverage: number;
  best_role_coverage: number;
  bestIsActual: boolean;
  actual_was_unknown?: boolean;
}

export const DRAFT_FEATURES = [
  'our_meta_sum', 'opp_meta_sum', 'our_synergy', 'opp_synergy',
  'counter_for', 'counter_against', 'role_coverage',
] as const;

export const DEFAULT_FIX_CONFIGS: Record<FixVersion, FixConfig> = {
  v0: { version: 'v0', rolePenalty: 0, cfK: 0 },
  v1: { version: 'v1', rolePenalty: -0.3, cfK: 0 },
  v2: { version: 'v2', rolePenalty: -0.3, cfK: 10 },
};
