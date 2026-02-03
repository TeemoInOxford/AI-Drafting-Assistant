#!/usr/bin/env python3
"""
Generate Weighted Role Posteriors with β/γ Authority Weighting

This script implements Champion → Role posterior probabilities with:
- Patch-level time decay (β)
- Intra-patch maturity weighting (γ)
- Team strength weighting (z-score based)

Formula:
  w(g) = D(g; β) × M(g; γ) × W(g)
  p(r|c) = (weighted_count(c,r) + κ×q_r) / (weighted_total(c) + κ)

Where:
  D(g; β) = β^Δ_patch                # Patch decay
  M(g; γ) = 1 - exp(-(d+1)/γ)        # Maturity (Option A: Time Shift)
  W(g) = mean(w_team_A, w_team_B)    # Team strength (z-score mapping)
"""

import json
import os
import glob
import math
import re
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from typing import Dict, List, Tuple, Optional

# Constants
DATA_DIR = '/www/wwwroot/AI-Drafting-Assistant/data/grid_v2'
CONFIG_PATH = os.path.join(DATA_DIR, 'weighted_posterior_config.json')
OUTPUT_PATH = os.path.join(DATA_DIR, 'weighted-role-posteriors.json')
PARAMS_PATH = os.path.join(DATA_DIR, 'weighted_posterior_params.json')

# Role mapping for normalization
ROLE_MAPPING = {
    'top': 'top',
    'jungle': 'jungle',
    'mid': 'mid',
    'middle': 'mid',
    'bot': 'bot',
    'bottom': 'bot',
    'adc': 'bot',
    'support': 'support',
    'sup': 'support',
}

ALL_ROLES = ['top', 'jungle', 'mid', 'bot', 'support']

# Data quality counters
data_quality = {
    'total_games_processed': 0,
    'games_skipped_missing_patch': 0,
    'games_skipped_missing_team_score': 0,
    'roles_dropped_unknown_label': 0,
    'patches_using_fallback_start_date': 0,
    'games_using_default_team_weight': 0,
}


def load_config() -> dict:
    """Load configuration from JSON file."""
    with open(CONFIG_PATH, 'r') as f:
        return json.load(f)


def load_patch_start_dates() -> Dict[int, str]:
    """Load patch start dates from JSON file."""
    path = os.path.join(DATA_DIR, '_patch_start_dates.json')
    with open(path, 'r') as f:
        data = json.load(f)
    return {int(k): v for k, v in data.items()}


def load_team_power_scores() -> Dict[str, Dict[str, int]]:
    """Load team power scores."""
    path = os.path.join(DATA_DIR, 'team_power_score.json')
    with open(path, 'r') as f:
        teams = json.load(f)
    return {t['id']: t.get('power_score', {}) for t in teams}


def parse_patch_index(title_version) -> Optional[int]:
    """
    Parse patch version to index.
    Handles: "15.18", "15.18b", "15.18.1", etc.

    Returns: patch_index (e.g., 1518) or None
    """
    if not title_version:
        return None
    if isinstance(title_version, dict):
        title_version = title_version.get('name')
    if not title_version:
        return None

    try:
        # Extract major.minor using regex
        match = re.match(r'^(\d+)\.(\d+)', str(title_version))
        if match:
            major, minor = int(match.group(1)), int(match.group(2))
            return major * 100 + minor
    except:
        pass
    return None


def normalize_role(role: str) -> Optional[str]:
    """Normalize role to standard 5 roles."""
    if not role:
        return None
    role_lower = role.lower().strip()
    return ROLE_MAPPING.get(role_lower)


def calculate_team_weight(score: int, mean: float, std: float, sensitivity: float) -> float:
    """
    Calculate team weight using z-score mapping.

    w_team = exp(z_score × sensitivity)

    If std == 0 or insufficient data, return 1.0 (default weight).
    """
    if std == 0 or std is None or mean is None:
        return 1.0

    z_score = (score - mean) / std
    return math.exp(z_score * sensitivity)


def calculate_game_weight(
    patch_index: int,
    target_patch_index: int,
    game_date: datetime,
    patch_start_date: datetime,
    team_a_score: Optional[int],
    team_b_score: Optional[int],
    score_mean: float,
    score_std: float,
    config: dict
) -> Tuple[float, float, float, float]:
    """
    Calculate all weight components for a game.

    Returns: (w_patch, w_maturity, w_team, w_total)
    """
    beta = config['beta']
    gamma = config['gamma']
    sensitivity = config['team_weight_sensitivity']

    # Patch decay (with data-driven soft cap on Δ)
    delta_patch = target_patch_index - patch_index
    if delta_patch < 0:
        return 0, 0, 0, 0  # Future patch, skip
    delta_cap = config.get('delta_patch_cap')  # Set in main() from p90 of data
    if delta_cap is not None and delta_patch > delta_cap:
        delta_patch = delta_cap
    w_patch = beta ** delta_patch

    # Maturity (Option A: Time Shift)
    d = (game_date - patch_start_date).days
    if d < 0:
        d = 0  # Clamp to 0
    d_eff = d + 1  # Time shift for day-0
    w_maturity = 1 - math.exp(-d_eff / gamma)

    # Team strength - compute separately for team A and team B, then average
    if team_a_score is None or team_b_score is None:
        w_team = 1.0
        data_quality['games_using_default_team_weight'] += 1
    else:
        # Calculate w_team_A and w_team_B separately
        w_team_a = calculate_team_weight(team_a_score, score_mean, score_std, sensitivity)
        w_team_b = calculate_team_weight(team_b_score, score_mean, score_std, sensitivity)
        # W(g) = mean(w_team_A, w_team_B)
        w_team = (w_team_a + w_team_b) / 2

    # Total weight
    w_total = w_patch * w_maturity * w_team

    return w_patch, w_maturity, w_team, w_total


def get_team_score(team_id: str, game_date: str, team_scores: Dict, window_days: int) -> Optional[int]:
    """
    Get team's power score for game date.

    Uses rolling window (no data leakage): only scores with date <= game_date.
    """
    if team_id not in team_scores:
        return None
    scores = team_scores[team_id]
    if not scores:
        return None

    # Find closest date <= game_date within window
    game_dt = datetime.strptime(game_date, '%Y-%m-%d')
    window_start = (game_dt - timedelta(days=window_days)).strftime('%Y-%m-%d')

    available_dates = sorted([d for d in scores.keys() if window_start <= d <= game_date], reverse=True)

    if available_dates:
        return scores[available_dates[0]]

    # Fallback: use earliest available date (if no data in window)
    earliest_date = sorted(scores.keys())[0]
    return scores[earliest_date]


def build_weighted_game_records(config: dict) -> Tuple[List[Dict], Dict[int, str], Dict[str, str]]:
    """
    Build game records with weights from series files.

    Returns:
    - List of game records with weights
    - Dict of patch_index -> earliest_observed_date (for fallback)
    - Dict of champion_id -> champion_name mapping
    """
    print("\n=== Building Weighted Game Records ===\n")

    # Load data
    patch_start_dates = load_patch_start_dates()
    team_scores = load_team_power_scores()

    print(f"Loaded {len(patch_start_dates)} patch start dates")
    print(f"Loaded {len(team_scores)} team power scores")

    # Load all series files
    series_files = glob.glob(os.path.join(DATA_DIR, 'series_*.json'))
    print(f"Found {len(series_files)} series files")

    # First pass: find target patch and build fallback patch dates + champion mapping
    target_patch_index = None
    patch_earliest_dates = defaultdict(lambda: None)
    champion_id_to_name = {}
    observed_patch_indices_per_game = []  # One entry per game for accurate Δ distribution

    print("\nFirst pass: scanning patches...")
    for sf in series_files:
        with open(sf, 'r') as f:
            series = json.load(f)

        for game in series.get('games', []):
            title_version = game.get('titleVersion')
            started_at = game.get('startedAt') or series.get('startedAt')

            if not title_version or not started_at:
                continue

            patch_index = parse_patch_index(title_version)
            if patch_index is None:
                continue

            observed_patch_indices_per_game.append(patch_index)

            # Update target patch
            if target_patch_index is None or patch_index > target_patch_index:
                target_patch_index = patch_index

            # Track earliest date for each patch (for fallback)
            game_dt = datetime.fromisoformat(started_at.replace('Z', '+00:00'))
            game_date = game_dt.strftime('%Y-%m-%d')

            if patch_earliest_dates[patch_index] is None or game_date < patch_earliest_dates[patch_index]:
                patch_earliest_dates[patch_index] = game_date

            # Build champion ID mapping
            for team in game.get('teams', []):
                for player in team.get('players', []):
                    character = player.get('character', {})
                    champ_id = character.get('id')
                    champ_name = character.get('name')
                    if champ_id and champ_name:
                        champion_id_to_name[champ_id] = champ_name

    target_patch = f"{target_patch_index // 100}.{target_patch_index % 100}"
    print(f"\nTarget patch: {target_patch} (index: {target_patch_index})")
    print(f"Built champion mapping: {len(champion_id_to_name)} champions")

    # Merge patch_start_dates with fallback
    effective_patch_dates = {}
    for patch_idx in patch_earliest_dates:
        if patch_idx in patch_start_dates:
            effective_patch_dates[patch_idx] = patch_start_dates[patch_idx]
        else:
            effective_patch_dates[patch_idx] = patch_earliest_dates[patch_idx]
            data_quality['patches_using_fallback_start_date'] += 1
            print(f"  Using fallback date for patch {patch_idx // 100}.{patch_idx % 100}: {patch_earliest_dates[patch_idx]}")

    # Compute data-driven delta_patch_cap (p90 of per-game Δ distribution, same major version only)
    target_major = target_patch_index // 100
    filtered_patches = [pi for pi in observed_patch_indices_per_game if (pi // 100) == target_major]
    all_deltas = sorted([target_patch_index - pi for pi in filtered_patches if target_patch_index - pi >= 0])
    if all_deltas:
        idx = max(0, min(len(all_deltas) - 1, math.ceil(0.90 * len(all_deltas)) - 1))
        delta_cap = all_deltas[idx]
        config['delta_patch_cap'] = delta_cap
        config['delta_patch_stats'] = {
            'games_in_major': len(all_deltas),
            'target_major': target_major,
            'min': all_deltas[0],
            'median': all_deltas[len(all_deltas) // 2],
            'p90': delta_cap,
            'max': all_deltas[-1],
        }
        print(f"\nDelta_patch distribution ({len(all_deltas)} games, major={target_major}): min={all_deltas[0]}, median={all_deltas[len(all_deltas)//2]}, p90={delta_cap}, max={all_deltas[-1]}")
        print(f"  delta_patch_cap = {delta_cap} (β^cap = {config['beta'] ** delta_cap:.6e})")

    # Second pass: build records with weights
    print("\nSecond pass: building weighted records...")

    records = []
    all_scores = []  # For computing global stats

    # Collect all scores first (for percentile calculation)
    for sf in series_files:
        with open(sf, 'r') as f:
            series = json.load(f)

        for game in series.get('games', []):
            title_version = game.get('titleVersion')
            started_at = game.get('startedAt') or series.get('startedAt')

            if not title_version or not started_at:
                continue

            patch_index = parse_patch_index(title_version)
            if patch_index is None or patch_index not in effective_patch_dates:
                data_quality['games_skipped_missing_patch'] += 1
                continue

            game_dt = datetime.fromisoformat(started_at.replace('Z', '+00:00'))
            game_date = game_dt.strftime('%Y-%m-%d')

            # Get teams
            teams = game.get('teams', [])
            if len(teams) != 2:
                continue

            # Get team scores
            team_ids = [str(t.get('id', '')) for t in teams]
            window_days = config['team_weight_window_days']

            for team_id in team_ids:
                score = get_team_score(team_id, game_date, team_scores, window_days)
                if score is not None:
                    all_scores.append({'date': game_date, 'score': score})

    # Sort scores by date for rolling window stats
    all_scores.sort(key=lambda x: x['date'])

    # Now process games and calculate weights
    for sf in series_files:
        with open(sf, 'r') as f:
            series = json.load(f)

        for game in series.get('games', []):
            title_version = game.get('titleVersion')
            started_at = game.get('startedAt') or series.get('startedAt')

            if not title_version or not started_at:
                continue

            patch_index = parse_patch_index(title_version)
            if patch_index is None or patch_index not in effective_patch_dates:
                continue

            game_dt = datetime.fromisoformat(started_at.replace('Z', '+00:00'))
            game_date = game_dt.strftime('%Y-%m-%d')

            # Get patch start date
            patch_start_str = effective_patch_dates[patch_index]
            patch_start = datetime.strptime(patch_start_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)

            # Get teams
            teams = game.get('teams', [])
            if len(teams) != 2:
                continue

            team_ids = [str(t.get('id', '')) for t in teams]

            # Get team scores
            window_days = config['team_weight_window_days']
            team_scores_list = []
            for team_id in team_ids:
                score = get_team_score(team_id, game_date, team_scores, window_days)
                team_scores_list.append(score)

            # Track if both team scores are missing
            if team_scores_list[0] is None and team_scores_list[1] is None:
                data_quality['games_skipped_missing_team_score'] += 1

            # Calculate rolling mean/std (no data leakage: only scores within window <= game_date)
            window_days = config['team_weight_window_days']
            game_dt_simple = datetime.strptime(game_date, '%Y-%m-%d')
            window_start = (game_dt_simple - timedelta(days=window_days)).strftime('%Y-%m-%d')

            relevant_scores = [s['score'] for s in all_scores if window_start <= s['date'] <= game_date]

            if len(relevant_scores) >= 2:
                score_mean = sum(relevant_scores) / len(relevant_scores)
                score_variance = sum((s - score_mean) ** 2 for s in relevant_scores) / len(relevant_scores)
                score_std = math.sqrt(score_variance)
            else:
                score_mean = None
                score_std = None

            # Calculate weights
            w_patch, w_maturity, w_team, w_total = calculate_game_weight(
                patch_index,
                target_patch_index,
                game_dt,
                patch_start,
                team_scores_list[0],
                team_scores_list[1],
                score_mean,
                score_std,
                config
            )

            if w_total == 0:
                continue

            # Extract champion-role observations
            for team in teams:
                team_id = str(team.get('id', ''))
                players = team.get('players', [])

                for player in players:
                    character = player.get('character', {})
                    champion_id = character.get('id')
                    champion_name = character.get('name')
                    roles = player.get('roles', [])

                    if not champion_id or not champion_name or not roles:
                        continue

                    # Normalize role
                    role = normalize_role(roles[0]) if roles else None
                    if role is None:
                        data_quality['roles_dropped_unknown_label'] += 1
                        continue

                    records.append({
                        'champion_id': champion_id,
                        'champion_name': champion_name,
                        'role': role,
                        'game_date': game_date,
                        'patch_index': patch_index,
                        'w_patch': w_patch,
                        'w_maturity': w_maturity,
                        'w_team': w_team,
                        'w_total': w_total,
                    })

            data_quality['total_games_processed'] += 1

    print(f"\nBuilt {len(records)} champion-role observations")
    print(f"From {data_quality['total_games_processed']} games")

    return records, effective_patch_dates, champion_id_to_name


def calculate_weighted_counts(records: List[Dict]) -> Tuple[Dict[str, Dict[str, float]], Dict[str, float]]:
    """
    Calculate weighted counts per champion-role.

    Returns:
    - champion_role_counts: {champion_name: {role: weighted_count}}
    - champion_totals: {champion_name: weighted_total}
    """
    champion_role_counts = defaultdict(lambda: defaultdict(float))
    champion_totals = defaultdict(float)

    for record in records:
        champion_name = record['champion_name']
        role = record['role']
        w = record['w_total']

        champion_role_counts[champion_name][role] += w
        champion_totals[champion_name] += w

    return dict(champion_role_counts), dict(champion_totals)


def calculate_raw_counts(records: List[Dict]) -> Dict[str, Dict[str, int]]:
    """Calculate raw (unweighted) counts per champion-role."""
    champion_role_counts = defaultdict(lambda: defaultdict(int))

    for record in records:
        champion_name = record['champion_name']
        role = record['role']
        champion_role_counts[champion_name][role] += 1

    return dict(champion_role_counts)


def calculate_global_role_distribution(champion_role_counts: Dict[str, Dict[str, float]]) -> Dict[str, float]:
    """
    Calculate global role distribution q_r from weighted counts.

    q_r = Σ_c weighted_count(c, r) / Σ_{c,r} weighted_count(c, r)
    """
    role_totals = defaultdict(float)
    grand_total = 0

    for champion_id, role_counts in champion_role_counts.items():
        for role, count in role_counts.items():
            role_totals[role] += count
            grand_total += count

    # Normalize
    q = {}
    for role in ALL_ROLES:
        q[role] = role_totals[role] / grand_total if grand_total > 0 else 1.0 / len(ALL_ROLES)

    return q


def compute_posterior(
    role_counts: Dict[str, float],
    total_weight: float,
    kappa: float,
    q: Dict[str, float]
) -> Dict[str, float]:
    """
    Compute Bayesian posterior with Dirichlet prior.

    p(r|c) = (weighted_count(c,r) + κ×q_r) / (weighted_total(c) + κ)
    """
    posterior = {}

    for role in ALL_ROLES:
        count = role_counts.get(role, 0)
        prior = kappa * q[role]
        posterior[role] = (count + prior) / (total_weight + kappa)

    # Normalize to ensure sum = 1.0
    total = sum(posterior.values())
    if total > 0:
        for role in ALL_ROLES:
            posterior[role] /= total

    return posterior


def calculate_flex_metrics(posterior: Dict[str, float], threshold: float) -> Dict:
    """
    Calculate flex pick metrics.

    Returns:
    - significantRoles: list of roles with p >= threshold
    - isFlexPick: bool
    - flexibilityScore: normalized entropy
    """
    significant_roles = [r for r in ALL_ROLES if posterior[r] >= threshold]
    is_flex = len(significant_roles) > 1

    # Calculate entropy
    entropy = 0
    for role in ALL_ROLES:
        p = posterior[role]
        if p > 0:
            entropy -= p * math.log2(p)

    # Normalize by max entropy (log2(5))
    max_entropy = math.log2(len(ALL_ROLES))
    flexibility_score = entropy / max_entropy if max_entropy > 0 else 0

    return {
        'significantRoles': significant_roles,
        'isFlexPick': is_flex,
        'flexibilityScore': round(flexibility_score, 4)
    }


def cross_validate_kappa(
    train_records: List[Dict],
    val_records: List[Dict],
    kappa_candidates: List[int],
    config: dict
) -> Tuple[int, List[Dict]]:
    """
    Cross-validate kappa using time-split validation.

    Returns:
    - best_kappa: int
    - cv_results: List[Dict] with metrics for each kappa
    """
    print("\n=== Cross-Validating Kappa ===\n")

    # Calculate counts on train set
    train_champion_role_counts, train_champion_totals = calculate_weighted_counts(train_records)
    train_q = calculate_global_role_distribution(train_champion_role_counts)

    # Calculate counts on val set (for ground truth)
    val_champion_roles = []
    for record in val_records:
        val_champion_roles.append({
            'champion_name': record['champion_name'],
            'role': record['role']
        })

    print(f"Train records: {len(train_records)}")
    print(f"Val records: {len(val_records)}")
    print(f"Kappa candidates: {kappa_candidates}")

    cv_results = []

    for kappa in kappa_candidates:
        # Compute posteriors on train set
        posteriors = {}
        for champion_name, role_counts in train_champion_role_counts.items():
            total_weight = train_champion_totals[champion_name]
            posteriors[champion_name] = compute_posterior(role_counts, total_weight, kappa, train_q)

        # Evaluate on validation set
        correct_top1 = 0
        total_log_loss = 0

        for val_obs in val_champion_roles:
            champion_name = val_obs['champion_name']
            true_role = val_obs['role']

            # Get posterior for this champion
            if champion_name in posteriors:
                posterior = posteriors[champion_name]
            else:
                # Unseen champion - use pure prior
                posterior = train_q

            # Top-1 prediction
            predicted_role = max(posterior.items(), key=lambda x: x[1])[0]
            if predicted_role == true_role:
                correct_top1 += 1

            # Log loss
            prob = max(posterior.get(true_role, 0.001), 0.001)  # Avoid log(0)
            total_log_loss += -math.log(prob)

        n_val = len(val_champion_roles)
        top1_accuracy = correct_top1 / n_val if n_val > 0 else 0
        log_loss = total_log_loss / n_val if n_val > 0 else 0

        cv_results.append({
            'kappa': kappa,
            'log_loss': round(log_loss, 4),
            'top1_accuracy': round(top1_accuracy, 4)
        })

        print(f"  κ={kappa:3d}  Log Loss={log_loss:.4f}  Top-1 Acc={top1_accuracy:.4f}")

    # Select best kappa (lowest log loss)
    best_result = min(cv_results, key=lambda x: x['log_loss'])
    best_kappa = best_result['kappa']

    print(f"\nBest κ: {best_kappa} (Log Loss: {best_result['log_loss']:.4f})")

    return best_kappa, cv_results


def validate_kappa_selection(
    train_records: List[Dict],
    val_records: List[Dict],
    kappa: int,
    config: dict
) -> None:
    """
    Perform 3 validation checks for κ selection:
    1. Top1 accuracy & logloss by champion sample size buckets
    2. Unseen champion stats in validation set
    3. Calibration check (predicted p̂ vs actual hit rate in 10 bins)
    """
    print("\n" + "=" * 80)
    print("κ VALIDATION CHECKS")
    print("=" * 80)

    # Calculate counts on train set
    train_champion_role_counts, train_champion_totals = calculate_weighted_counts(train_records)
    train_q = calculate_global_role_distribution(train_champion_role_counts)

    # Calculate RAW counts for bucketing
    train_raw_counts = defaultdict(int)
    for record in train_records:
        train_raw_counts[record['champion_name']] += 1

    # Compute posteriors on train set
    posteriors = {}
    for champion_name, role_counts in train_champion_role_counts.items():
        total_weight = train_champion_totals[champion_name]
        posteriors[champion_name] = compute_posterior(role_counts, total_weight, kappa, train_q)

    # Prepare validation observations
    val_observations = []
    for record in val_records:
        champion_name = record['champion_name']
        true_role = record['role']

        # Get posterior
        if champion_name in posteriors:
            posterior = posteriors[champion_name]
            is_unseen = False
        else:
            posterior = train_q  # Pure prior for unseen
            is_unseen = True

        # Get predicted role and probability
        predicted_role = max(posterior.items(), key=lambda x: x[1])[0]
        predicted_prob = posterior[predicted_role]
        true_prob = max(posterior.get(true_role, 0.001), 0.001)

        # Raw count for this champion in train
        raw_count = train_raw_counts.get(champion_name, 0)

        val_observations.append({
            'champion_name': champion_name,
            'true_role': true_role,
            'predicted_role': predicted_role,
            'predicted_prob': predicted_prob,
            'true_prob': true_prob,
            'is_unseen': is_unseen,
            'raw_count': raw_count,
            'is_correct': predicted_role == true_role
        })

    # ====== CHECK 1: By Sample Size Buckets ======
    print(f"\n[Check 1] Top1 Accuracy & LogLoss by Champion Sample Size Buckets (κ={kappa})")
    print("-" * 70)

    buckets = [
        (0, 0, 'unseen (0)'),
        (1, 2, '[1-2]'),
        (3, 5, '[3-5]'),
        (6, 10, '[6-10]'),
        (11, 20, '[11-20]'),
        (21, float('inf'), '[21+]'),
    ]

    print(f"{'Bucket':<15} {'Count':>8} {'Top1 Acc':>12} {'LogLoss':>12}")
    print("-" * 47)

    for min_count, max_count, label in buckets:
        bucket_obs = [o for o in val_observations if min_count <= o['raw_count'] <= max_count]
        if not bucket_obs:
            print(f"{label:<15} {'0':>8} {'N/A':>12} {'N/A':>12}")
            continue

        correct = sum(1 for o in bucket_obs if o['is_correct'])
        total = len(bucket_obs)
        accuracy = correct / total

        log_loss = sum(-math.log(o['true_prob']) for o in bucket_obs) / total

        print(f"{label:<15} {total:>8} {accuracy:>11.4f} {log_loss:>11.4f}")

    # ====== CHECK 2: Unseen Champion Stats ======
    print(f"\n[Check 2] Unseen Champion Stats")
    print("-" * 70)

    unseen_obs = [o for o in val_observations if o['is_unseen']]
    seen_obs = [o for o in val_observations if not o['is_unseen']]

    unseen_ratio = len(unseen_obs) / len(val_observations) if val_observations else 0
    unseen_champions = set(o['champion_name'] for o in unseen_obs)

    print(f"Unseen observations: {len(unseen_obs)} / {len(val_observations)} ({unseen_ratio*100:.2f}%)")
    print(f"Unseen unique champions: {len(unseen_champions)}")

    if unseen_obs:
        unseen_correct = sum(1 for o in unseen_obs if o['is_correct'])
        unseen_accuracy = unseen_correct / len(unseen_obs)
        unseen_logloss = sum(-math.log(o['true_prob']) for o in unseen_obs) / len(unseen_obs)
        print(f"Unseen Top1 Accuracy: {unseen_accuracy:.4f}")
        print(f"Unseen LogLoss: {unseen_logloss:.4f}")

    if seen_obs:
        seen_correct = sum(1 for o in seen_obs if o['is_correct'])
        seen_accuracy = seen_correct / len(seen_obs)
        seen_logloss = sum(-math.log(o['true_prob']) for o in seen_obs) / len(seen_obs)
        print(f"Seen Top1 Accuracy: {seen_accuracy:.4f}")
        print(f"Seen LogLoss: {seen_logloss:.4f}")

    # ====== CHECK 3: Calibration Check (10 bins) ======
    print(f"\n[Check 3] Calibration Check (10 Equal-Frequency Bins)")
    print("-" * 70)

    # Sort by predicted probability
    sorted_obs = sorted(val_observations, key=lambda x: x['predicted_prob'])
    n = len(sorted_obs)
    bin_size = n // 10

    print(f"{'Bin':<8} {'p̂ Range':>18} {'Count':>8} {'Pred Acc':>12} {'Actual Acc':>12} {'Gap':>10}")
    print("-" * 68)

    for i in range(10):
        start_idx = i * bin_size
        end_idx = (i + 1) * bin_size if i < 9 else n

        bin_obs = sorted_obs[start_idx:end_idx]
        if not bin_obs:
            continue

        p_min = bin_obs[0]['predicted_prob']
        p_max = bin_obs[-1]['predicted_prob']
        mean_pred = sum(o['predicted_prob'] for o in bin_obs) / len(bin_obs)

        actual_correct = sum(1 for o in bin_obs if o['is_correct'])
        actual_acc = actual_correct / len(bin_obs)

        gap = actual_acc - mean_pred

        print(f"Bin {i+1:<3} [{p_min:.3f}-{p_max:.3f}] {len(bin_obs):>8} {mean_pred:>11.4f} {actual_acc:>11.4f} {gap:>+10.4f}")

    print("\n" + "-" * 70)
    print("Calibration interpretation:")
    print("  - Gap ≈ 0: Well-calibrated")
    print("  - Gap > 0: Underconfident (actual accuracy higher than predicted)")
    print("  - Gap < 0: Overconfident (actual accuracy lower than predicted)")


def main():
    print("=" * 80)
    print("Generate Weighted Role Posteriors (β/γ Authority-Weighted)")
    print("=" * 80)

    # Load config
    config = load_config()
    print(f"\nConfig loaded:")
    print(f"  β = {config['beta']}")
    print(f"  γ = {config['gamma']}")
    print(f"  team_weight_sensitivity = {config['team_weight_sensitivity']}")
    print(f"  team_weight_window_days = {config['team_weight_window_days']}")
    print(f"  validation_split_percentile = {config['validation_split_percentile']}")

    # Build weighted records
    records, effective_patch_dates, champion_id_to_name = build_weighted_game_records(config)

    if not records:
        print("\nERROR: No records built. Exiting.")
        return

    # Compute validation split date (percentile-based)
    all_dates = sorted(set(r['game_date'] for r in records))
    split_idx = int(len(all_dates) * config['validation_split_percentile'])
    validation_split_date = all_dates[split_idx]

    print(f"\nValidation split date: {validation_split_date} (p={config['validation_split_percentile']})")

    train_records = [r for r in records if r['game_date'] < validation_split_date]
    val_records = [r for r in records if r['game_date'] >= validation_split_date]

    print(f"  Train: {len(train_records)} records")
    print(f"  Val: {len(val_records)} records")

    # Cross-validate kappa
    best_kappa, cv_results = cross_validate_kappa(
        train_records,
        val_records,
        config['kappa_candidates'],
        config
    )

    # Run κ validation checks
    validate_kappa_selection(train_records, val_records, best_kappa, config)

    # Generate final posteriors on all data
    print("\n=== Generating Final Posteriors ===\n")

    champion_role_counts, champion_totals = calculate_weighted_counts(records)
    champion_raw_counts = calculate_raw_counts(records)
    global_q = calculate_global_role_distribution(champion_role_counts)

    print(f"Global role distribution (weighted):")
    for role in ALL_ROLES:
        print(f"  {role}: {global_q[role]:.4f}")

    # Calculate total effective weight
    total_effective_weight = sum(r['w_total'] for r in records)

    # Find target patch
    max_patch_index = max(r['patch_index'] for r in records)
    target_patch = f"{max_patch_index // 100}.{max_patch_index % 100}"

    # Build output
    output = {
        'metadata': {
            'generated_at_utc': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'target_patch': target_patch,
            'target_patch_index': max_patch_index,
            'parameters': {
                'beta': config['beta'],
                'gamma': config['gamma'],
                'kappa': best_kappa,
                'kappa_selection_method': 'cross_validation',
                'kappa_candidates': config['kappa_candidates'],
                'kappa_cv_results': cv_results,
                'team_weight_sensitivity': config['team_weight_sensitivity'],
                'team_weight_window_days': config['team_weight_window_days'],
                'min_display_threshold': config['min_display_threshold'],
                'delta_patch_cap': config.get('delta_patch_cap'),
                'delta_patch_stats': config.get('delta_patch_stats'),
            },
            'validation_split': {
                'method': 'percentile',
                'percentile': config['validation_split_percentile'],
                'computed_date': validation_split_date,
                'train_records': len(train_records),
                'val_records': len(val_records),
            },
            'data_quality': data_quality,
            'total_effective_weight': round(total_effective_weight, 2),
            'global_role_distribution': {role: round(global_q[role], 4) for role in ALL_ROLES},
        },
        'champions': {}
    }

    # Generate posteriors for all champions
    print(f"\nGenerating posteriors for {len(champion_role_counts)} champions...")

    # Build reverse mapping: name -> id (for reference)
    champion_name_to_id = {v: k for k, v in champion_id_to_name.items()}

    for champion_name, role_counts in champion_role_counts.items():
        total_weight = champion_totals[champion_name]
        raw_counts = champion_raw_counts.get(champion_name, {})
        champion_id = champion_name_to_id.get(champion_name, '')

        # Compute posterior
        posterior = compute_posterior(role_counts, total_weight, best_kappa, global_q)

        # Calculate flex metrics
        flex_metrics = calculate_flex_metrics(posterior, config['min_display_threshold'])

        # Build output entry (keyed by champion_name)
        output['champions'][champion_name] = {
            'champion_id': champion_id,
            'champion_name': champion_name,
            'role_probabilities': {role: round(posterior[role], 6) for role in ALL_ROLES},
            'raw_counts_by_role': {role: raw_counts.get(role, 0) for role in ALL_ROLES},
            'weighted_counts_by_role': {role: round(role_counts.get(role, 0.0), 6) for role in ALL_ROLES},
            'effective_sample_size': round(total_weight, 6),
            'significantRoles': flex_metrics['significantRoles'],
            'isFlexPick': flex_metrics['isFlexPick'],
            'flexibilityScore': flex_metrics['flexibilityScore'],
        }

    # Save output
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\n✓ Saved to {OUTPUT_PATH}")

    # Save params
    with open(PARAMS_PATH, 'w') as f:
        json.dump({
            'best_kappa': best_kappa,
            'cv_results': cv_results,
            'timestamp': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        }, f, indent=2)

    print(f"✓ Saved params to {PARAMS_PATH}")

    # Print sanity check report
    print("\n" + "=" * 80)
    print("SANITY CHECK REPORT")
    print("=" * 80)

    # Find example champions by name
    example_names = ['Aatrox', 'Pantheon', 'Orianna', 'Sett', 'Senna']
    example_champions = []

    for champ_name in example_names:
        if champ_name in output['champions']:
            example_champions.append(champ_name)

    if len(example_champions) < 3:
        # Fallback: get any 3 champions
        example_champions = list(output['champions'].keys())[:3]

    for champion_name in example_champions[:3]:
        data = output['champions'][champion_name]
        print(f"\nChampion: {champion_name}")
        print(f"  raw_counts_by_role: {data['raw_counts_by_role']}")
        print(f"  weighted_counts_by_role: {data['weighted_counts_by_role']}")
        print(f"  effective_sample_size: {data['effective_sample_size']}")
        print(f"  role_probabilities: {data['role_probabilities']}")
        print(f"  isFlexPick: {data['isFlexPick']}")
        print(f"  flexibilityScore: {data['flexibilityScore']}")

    # Print metadata summary
    print("\n" + "=" * 80)
    print("METADATA SUMMARY")
    print("=" * 80)
    print(f"\nChosen κ: {best_kappa}")
    print(f"\nCV Results:")
    for result in cv_results:
        print(f"  κ={result['kappa']:3d}  Log Loss={result['log_loss']:.4f}  Top-1 Acc={result['top1_accuracy']:.4f}")

    print(f"\nData Quality:")
    for key, value in data_quality.items():
        print(f"  {key}: {value}")

    print("\n" + "=" * 80)
    print("COMPLETE")
    print("=" * 80)


if __name__ == '__main__':
    main()
