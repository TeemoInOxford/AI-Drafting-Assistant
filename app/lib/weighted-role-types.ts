export type Role = 'top' | 'jungle' | 'mid' | 'bot' | 'support';

export interface RoleDistribution {
  top: number;
  jungle: number;
  mid: number;
  bot: number;
  support: number;
}

export interface RoleCounts {
  top: number;
  jungle: number;
  mid: number;
  bot: number;
  support: number;
}

export interface KappaCVResult {
  kappa: number;
  log_loss: number;
  top1_accuracy: number;
}

export interface DeltaPatchStats {
  games_in_major: number;
  target_major: number;
  min: number;
  median: number;
  p90: number;
  max: number;
}

export interface WeightedPosteriorParameters {
  beta: number;
  gamma: number;
  kappa: number;
  kappa_selection_method: string;
  kappa_candidates: number[];
  kappa_cv_results: KappaCVResult[];
  team_weight_sensitivity: number;
  team_weight_window_days: number;
  min_display_threshold: number;
  delta_patch_cap: number;
  delta_patch_stats: DeltaPatchStats;
}

export interface ValidationSplit {
  method: string;
  percentile: number;
  computed_date: string;
  train_records: number;
  val_records: number;
}

export interface DataQuality {
  total_games_processed: number;
  games_skipped_missing_patch: number;
  games_skipped_missing_team_score: number;
  roles_dropped_unknown_label: number;
  patches_using_fallback_start_date: number;
  games_using_default_team_weight: number;
}

export interface WeightedPosteriorMetadata {
  generated_at_utc: string;
  target_patch: string;
  target_patch_index: number;
  parameters: WeightedPosteriorParameters;
  validation_split: ValidationSplit;
  data_quality: DataQuality;
  total_effective_weight: number;
  global_role_distribution: RoleDistribution;
}

export interface ChampionRolePosterior {
  champion_id: string;
  champion_name: string;
  role_probabilities: RoleDistribution;
  raw_counts_by_role: RoleCounts;
  weighted_counts_by_role: RoleCounts;
  effective_sample_size: number;
  significantRoles: Role[];
  isFlexPick: boolean;
  flexibilityScore: number;
}

export interface WeightedRolePosteriorsData {
  metadata: WeightedPosteriorMetadata;
  champions: Record<string, ChampionRolePosterior>;
}
