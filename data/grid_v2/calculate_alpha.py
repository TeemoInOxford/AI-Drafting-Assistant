#!/usr/bin/env python3
"""
Bayesian Role Posterior - Prior Strength (α) Calibration

This script performs systematic calibration of the prior strength parameter α
for Bayesian role posterior estimation using grid_v2 professional match data.

Methodology:
- Temporal train/validation split (2024 train, 2025 validation)
- Dense α grid search (1-200)
- Primary metrics: Log Loss, Expected Calibration Error (ECE)
- Secondary metrics: Top-1 Accuracy, Mean Posterior Entropy
- Selection rule: ECE ≤ 0.10, then lowest Log Loss, prefer larger α within tolerance

Model:
  posterior(role | champion) = (α × prior(role) + count(role)) / (α + total_count)

Output:
- alpha_results.json with all metrics
- Console summary table
- Academic-grade conclusion text
"""

import json
import os
import glob
import math
import re
from collections import defaultdict
from datetime import datetime

DATA_DIR = '/www/wwwroot/AI-Drafting-Assistant/data/grid_v2'
POSITIONS_FILE = '/www/wwwroot/AI-Drafting-Assistant/app/lib/positions.ts'

ALL_POSITIONS = ['top', 'jungle', 'mid', 'bot', 'support']

# =============================================================================
# Data Loading
# =============================================================================

def load_champion_positions():
    """Parse CHAMPION_POSITIONS from positions.ts"""
    positions = {}

    with open(POSITIONS_FILE, 'r') as f:
        content = f.read()

    start = content.find('export const CHAMPION_POSITIONS')
    if start == -1:
        raise ValueError("Could not find CHAMPION_POSITIONS in positions.ts")

    brace_start = content.find('{', start)
    brace_count = 1
    i = brace_start + 1
    while brace_count > 0 and i < len(content):
        if content[i] == '{':
            brace_count += 1
        elif content[i] == '}':
            brace_count -= 1
        i += 1

    obj_content = content[brace_start:i]
    pattern = r"(\w+):\s*\[([^\]]*)\]"
    matches = re.findall(pattern, obj_content)

    for champ, roles_str in matches:
        roles = re.findall(r"'(\w+)'", roles_str)
        positions[champ] = roles

    return positions


def load_match_data(champion_positions):
    """
    Load match records from grid_v2 series_*.json files.

    Role inference: Player's role is inferred from their historical champion usage
    weighted by CHAMPION_POSITIONS static mapping.
    """
    series_files = glob.glob(os.path.join(DATA_DIR, 'series_*.json'))

    # First pass: collect player champion usage
    player_champion_usage = defaultdict(lambda: defaultdict(int))
    player_dates = defaultdict(list)

    for sf in series_files:
        with open(sf, 'r') as f:
            series = json.load(f)

        started_at = series.get('startedAt')
        if not started_at:
            continue

        try:
            date = datetime.fromisoformat(started_at.replace('Z', '+00:00'))
        except:
            continue

        for game in series.get('games', []):
            for team in game.get('teams', []):
                for player in team.get('players', []):
                    player_id = str(player.get('id', ''))
                    champion = player.get('character', {}).get('name')
                    if player_id and champion:
                        player_champion_usage[player_id][champion] += 1
                        player_dates[player_id].append(date)

    # Infer player positions based on champion usage
    player_positions = {}

    for player_id, champions in player_champion_usage.items():
        position_scores = defaultdict(float)

        for champion, count in champions.items():
            positions = champion_positions.get(champion, [])
            for pos in positions:
                position_scores[pos] += count

        if position_scores:
            best_pos = max(position_scores.keys(), key=lambda p: position_scores[p])
            player_positions[player_id] = best_pos
        else:
            player_positions[player_id] = 'mid'

    # Second pass: create match records
    records = []

    for sf in series_files:
        with open(sf, 'r') as f:
            series = json.load(f)

        started_at = series.get('startedAt')
        if not started_at:
            continue

        try:
            date = datetime.fromisoformat(started_at.replace('Z', '+00:00'))
        except:
            continue

        for game in series.get('games', []):
            for team in game.get('teams', []):
                for player in team.get('players', []):
                    player_id = str(player.get('id', ''))
                    champion = player.get('character', {}).get('name')

                    if not player_id or not champion:
                        continue

                    position = player_positions.get(player_id)
                    if not position:
                        continue

                    records.append({
                        'player_id': player_id,
                        'champion': champion,
                        'position': position,
                        'date': date,
                        'year': date.year,
                    })

    return records


def split_data_temporally(records):
    """
    Temporal split: 2024 for training, 2025 for validation.
    This prevents temporal leakage and accounts for meta drift.
    """
    train = [r for r in records if r['year'] == 2024]
    validation = [r for r in records if r['year'] == 2025]

    return train, validation


# =============================================================================
# Prior and Posterior Computation
# =============================================================================

def get_default_prior(champion, champion_positions):
    """
    Get prior distribution for a champion based on CHAMPION_POSITIONS.
    Primary role receives higher weight.
    """
    positions = champion_positions.get(champion, [])
    prior = {pos: 0.0 for pos in ALL_POSITIONS}

    if not positions:
        for pos in ALL_POSITIONS:
            prior[pos] = 0.2
        return prior

    total = len(positions)
    for i, pos in enumerate(positions):
        if i == 0:
            prior[pos] = 1.0 if total == 1 else 0.5 + (0.5 / total)
        else:
            prior[pos] = (0.5 - (0.5 / total)) / (total - 1)

    return prior


def compute_posterior(champion, role_counts, total_matches, alpha, champion_positions):
    """
    Compute Bayesian posterior:
    posterior(role) = (α × prior(role) + count(role)) / (α + total_count)
    """
    prior = get_default_prior(champion, champion_positions)
    posterior = {}

    denom = alpha + total_matches
    for pos in ALL_POSITIONS:
        prior_val = prior.get(pos, 0)
        count = role_counts.get(pos, 0)
        posterior[pos] = (alpha * prior_val + count) / denom

    # Normalize (should already sum to ~1, but ensure precision)
    total = sum(posterior.values())
    if total > 0:
        for pos in ALL_POSITIONS:
            posterior[pos] /= total

    return posterior


def aggregate_role_counts(records):
    """Aggregate role counts per champion from records."""
    champion_stats = defaultdict(lambda: {'counts': defaultdict(int), 'total': 0})

    for record in records:
        champion = record['champion']
        position = record['position']
        champion_stats[champion]['counts'][position] += 1
        champion_stats[champion]['total'] += 1

    return champion_stats


# =============================================================================
# Evaluation Metrics
# =============================================================================

def compute_entropy(posterior):
    """Compute Shannon entropy of a probability distribution."""
    entropy = 0.0
    for p in posterior.values():
        if p > 0:
            entropy -= p * math.log2(p)
    return entropy


def compute_ece(predictions, n_bins=10):
    """
    Compute Expected Calibration Error (ECE).

    predictions: list of (predicted_prob, is_correct) tuples
    n_bins: number of equal-width bins
    """
    bins = [[] for _ in range(n_bins)]

    for prob, correct in predictions:
        bin_idx = min(int(prob * n_bins), n_bins - 1)
        bins[bin_idx].append((prob, correct))

    ece = 0.0
    total_samples = len(predictions)

    for bin_data in bins:
        if not bin_data:
            continue

        bin_size = len(bin_data)
        avg_confidence = sum(p for p, _ in bin_data) / bin_size
        avg_accuracy = sum(c for _, c in bin_data) / bin_size

        ece += (bin_size / total_samples) * abs(avg_accuracy - avg_confidence)

    return ece


def evaluate_alpha(alpha, train_stats, validation_records, champion_positions):
    """
    Evaluate a specific α value on validation set.

    Returns:
    - log_loss: Negative log likelihood (lower is better)
    - ece: Expected Calibration Error (lower is better)
    - top1_accuracy: Fraction of correct top-1 predictions
    - mean_entropy: Average posterior entropy
    """
    total_log_loss = 0.0
    correct_top1 = 0
    total_entropy = 0.0
    total_predictions = 0
    calibration_data = []  # (predicted_prob, is_correct)

    for record in validation_records:
        champion = record['champion']
        true_position = record['position']

        stats = train_stats.get(champion)

        if not stats:
            # Champion not seen in training - use pure prior
            posterior = get_default_prior(champion, champion_positions)
        else:
            posterior = compute_posterior(
                champion,
                stats['counts'],
                stats['total'],
                alpha,
                champion_positions
            )

        # Get predicted role and probability
        predicted_role = max(posterior.keys(), key=lambda p: posterior[p])
        true_prob = posterior.get(true_position, 0.001)
        predicted_prob = posterior.get(predicted_role, 0.001)

        # Log loss
        total_log_loss += -math.log(max(true_prob, 1e-10))

        # Top-1 accuracy
        is_correct = 1 if predicted_role == true_position else 0
        correct_top1 += is_correct

        # Entropy
        total_entropy += compute_entropy(posterior)

        # Calibration data (for ECE)
        calibration_data.append((predicted_prob, is_correct))

        total_predictions += 1

    if total_predictions == 0:
        return None

    return {
        'alpha': alpha,
        'log_loss': round(total_log_loss / total_predictions, 6),
        'ece': round(compute_ece(calibration_data, n_bins=10), 6),
        'top1_accuracy': round(correct_top1 / total_predictions, 6),
        'mean_entropy': round(total_entropy / total_predictions, 6),
    }


# =============================================================================
# Alpha Selection
# =============================================================================

def select_best_alpha(results, ece_threshold=0.10, log_loss_tolerance=0.005):
    """
    Select best α according to strict rules:
    1. Filter: ECE ≤ ece_threshold
    2. Among filtered: select lowest log_loss
    3. If log_loss difference < tolerance: prefer larger α (stability)
    """
    # Step 1: Filter by ECE threshold
    filtered = [r for r in results if r['ece'] <= ece_threshold]

    if not filtered:
        # Fallback: use all results if none pass ECE threshold
        filtered = results
        reason_prefix = f"No alpha with ECE ≤ {ece_threshold}; using all alphas. "
    else:
        reason_prefix = f"Filtered to {len(filtered)} alphas with ECE ≤ {ece_threshold}. "

    # Step 2: Sort by log_loss ascending
    filtered_sorted = sorted(filtered, key=lambda r: r['log_loss'])

    best = filtered_sorted[0]

    # Step 3: Check for ties within tolerance, prefer larger α
    candidates_within_tolerance = [
        r for r in filtered_sorted
        if r['log_loss'] - best['log_loss'] < log_loss_tolerance
    ]

    if len(candidates_within_tolerance) > 1:
        # Prefer larger α for stability
        best = max(candidates_within_tolerance, key=lambda r: r['alpha'])
        reason = (
            reason_prefix +
            f"Multiple alphas within log-loss tolerance ({log_loss_tolerance}); "
            f"selected α={best['alpha']} (largest for stability)."
        )
    else:
        reason = reason_prefix + f"Selected α={best['alpha']} with lowest log loss."

    return best, reason


# =============================================================================
# Main
# =============================================================================

def main():
    print("=" * 80)
    print("Bayesian Role Posterior - Prior Strength (α) Calibration")
    print("=" * 80)
    print()

    # Load champion positions mapping
    print("Loading CHAMPION_POSITIONS mapping...")
    champion_positions = load_champion_positions()
    print(f"  Loaded {len(champion_positions)} champion mappings")

    # Load match data
    print("\nLoading match data from grid_v2...")
    records = load_match_data(champion_positions)
    print(f"  Total records: {len(records)}")

    # Temporal split
    print("\nSplitting data temporally...")
    train, validation = split_data_temporally(records)
    print(f"  Train (2024): {len(train)} records")
    print(f"  Validation (2025): {len(validation)} records")

    if len(train) == 0 or len(validation) == 0:
        print("ERROR: Insufficient data for train/validation split")
        return

    # Aggregate training data
    print("\nAggregating training data...")
    train_stats = aggregate_role_counts(train)
    print(f"  Unique champions in training: {len(train_stats)}")

    # Dense α grid search (1-200)
    print("\n" + "=" * 80)
    print("α Grid Search (1-200)")
    print("=" * 80)

    results = []

    for alpha in range(1, 201):
        metrics = evaluate_alpha(alpha, train_stats, validation, champion_positions)
        if metrics:
            results.append(metrics)

        if alpha % 20 == 0:
            print(f"  Completed α = {alpha}")

    print(f"\n  Evaluated {len(results)} α values")

    # Select best α
    ECE_THRESHOLD = 0.10
    LOG_LOSS_TOLERANCE = 0.005

    best, selection_reason = select_best_alpha(
        results,
        ece_threshold=ECE_THRESHOLD,
        log_loss_tolerance=LOG_LOSS_TOLERANCE
    )

    # Print results table
    print("\n" + "=" * 80)
    print("Full Results Table")
    print("=" * 80)
    print(f"{'α':>6} {'Log Loss':>12} {'ECE':>10} {'Top-1 Acc':>12} {'Entropy':>10}")
    print("-" * 54)

    for r in results:
        marker = " *" if r['alpha'] == best['alpha'] else ""
        print(f"{r['alpha']:>6} {r['log_loss']:>12.6f} {r['ece']:>10.6f} "
              f"{r['top1_accuracy']*100:>11.2f}% {r['mean_entropy']:>10.4f}{marker}")

    # Print summary
    print("\n" + "=" * 80)
    print("CALIBRATION RESULT")
    print("=" * 80)
    print(f"\nSelected α: {best['alpha']}")
    print(f"  Log Loss: {best['log_loss']:.6f}")
    print(f"  ECE: {best['ece']:.6f}")
    print(f"  Top-1 Accuracy: {best['top1_accuracy']*100:.2f}%")
    print(f"  Mean Entropy: {best['mean_entropy']:.4f}")
    print(f"\nSelection Reason:")
    print(f"  {selection_reason}")

    # Save JSON output
    output = {
        'metadata': {
            'dataset': 'grid_v2',
            'train_period': '2024',
            'validation_period': '2025',
            'ece_threshold': ECE_THRESHOLD,
            'log_loss_tie_threshold': LOG_LOSS_TOLERANCE,
            'total_train_records': len(train),
            'total_validation_records': len(validation),
            'unique_champions_train': len(train_stats),
            'generated_at_utc': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
        },
        'results': results,
        'selected_alpha': best['alpha'],
        'selected_metrics': best,
        'selection_reason': selection_reason,
    }

    output_path = os.path.join(DATA_DIR, 'alpha_results.json')
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\n✓ Results saved to {output_path}")

    # Academic conclusion
    print("\n" + "=" * 80)
    print("PRIOR STRENGTH CALIBRATION - Academic Summary")
    print("=" * 80)
    print("""
The prior strength parameter α in the Bayesian role posterior model was calibrated
using a systematic grid search over α ∈ {1, 2, ..., 200}.

METHODOLOGY:
- Data: Professional match records from grid_v2 (GRID Esports API)
- Temporal split: 2024 data for training, 2025 data for validation
  (prevents temporal leakage and accounts for meta drift)
- Role inference: Player roles inferred from historical champion usage patterns
  weighted by static CHAMPION_POSITIONS mapping

MODEL:
  posterior(role | champion) = (α × prior(role) + count(role)) / (α + total_count)

Where α represents the prior strength as pseudo-count (equivalent to α virtual matches).

EVALUATION METRICS:
- Primary: Log Loss (negative log-likelihood) and Expected Calibration Error (ECE)
- Secondary: Top-1 Accuracy and Mean Posterior Entropy (for diagnostics only)

SELECTION CRITERIA:
1. Filter candidates to ECE ≤ 0.10 (well-calibrated probability estimates)
2. Select α with lowest Log Loss among filtered candidates
3. If multiple α values have Log Loss within 0.005 tolerance, prefer larger α
   (greater stability, resistance to temporal drift)

RESULT:
""")
    print(f"  Selected α = {best['alpha']}")
    print(f"  Log Loss = {best['log_loss']:.6f}")
    print(f"  ECE = {best['ece']:.6f}")
    print(f"  Top-1 Accuracy = {best['top1_accuracy']*100:.2f}% (diagnostic only)")
    print("""
INTERPRETATION:
- α = {0} means the prior is equivalent to {0} virtual matches
- For champions with few observations, the posterior relies more on prior knowledge
- For champions with many observations, the posterior is data-driven
- This calibration optimizes probabilistic calibration, not prediction accuracy
- The model does not make meta predictions or causal inferences
""".format(best['alpha']))

    print("=" * 80)
    print("CALIBRATION COMPLETE")
    print("=" * 80)


if __name__ == '__main__':
    main()
