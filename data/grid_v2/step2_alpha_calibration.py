#!/usr/bin/env python3
"""
Step 2: Alpha Calibration with Player-Role-Instance Structure

Uses the new instance-based data structure from Step 1 to recalibrate
the prior strength parameter α for Bayesian role posterior.

Method:
- Temporal split: 2024 train, 2025 validation
- Dense α grid: 1-200
- Primary metrics: Log Loss, ECE
- Selection: Lowest Log Loss among ECE ≤ 0.10, prefer larger α within tolerance
"""

import json
import os
import math
from collections import defaultdict
from datetime import datetime

DATA_DIR = '/www/wwwroot/AI-Drafting-Assistant/data/grid_v2'

ALL_POSITIONS = ['top', 'jungle', 'mid', 'bot', 'support']

# Load instance game records
def load_instance_records():
    """Load game records with instance-level role attribution."""
    with open(os.path.join(DATA_DIR, 'instance_game_records.json'), 'r') as f:
        records = json.load(f)

    # Parse dates
    for r in records:
        r['date'] = datetime.fromisoformat(r['date'].replace('Z', '+00:00'))
        r['year'] = r['date'].year

    return records


def load_champion_prior():
    """Load CHAMPION_POSITIONS for prior calculation."""
    import re
    positions_file = '/www/wwwroot/AI-Drafting-Assistant/app/lib/positions.ts'

    with open(positions_file, 'r') as f:
        content = f.read()

    start = content.find('export const CHAMPION_POSITIONS')
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

    positions = {}
    for champ, roles_str in matches:
        roles = re.findall(r"'(\w+)'", roles_str)
        positions[champ] = roles

    return positions


def get_default_prior(champion, champion_positions):
    """Get prior distribution based on CHAMPION_POSITIONS."""
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
    """Compute Bayesian posterior."""
    prior = get_default_prior(champion, champion_positions)
    posterior = {}

    denom = alpha + total_matches
    for pos in ALL_POSITIONS:
        prior_val = prior.get(pos, 0)
        count = role_counts.get(pos, 0)
        posterior[pos] = (alpha * prior_val + count) / denom

    total = sum(posterior.values())
    if total > 0:
        for pos in ALL_POSITIONS:
            posterior[pos] /= total

    return posterior


def aggregate_role_counts(records):
    """Aggregate role counts per champion."""
    champion_stats = defaultdict(lambda: {'counts': defaultdict(int), 'total': 0})

    for record in records:
        champion = record['champion']
        position = record['inferred_role']
        champion_stats[champion]['counts'][position] += 1
        champion_stats[champion]['total'] += 1

    return champion_stats


def compute_entropy(posterior):
    """Compute Shannon entropy."""
    entropy = 0.0
    for p in posterior.values():
        if p > 0:
            entropy -= p * math.log2(p)
    return entropy


def compute_ece(predictions, n_bins=10):
    """Compute Expected Calibration Error."""
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
    """Evaluate a specific α value."""
    total_log_loss = 0.0
    correct_top1 = 0
    total_entropy = 0.0
    total_predictions = 0
    calibration_data = []

    for record in validation_records:
        champion = record['champion']
        true_position = record['inferred_role']

        stats = train_stats.get(champion)

        if not stats:
            posterior = get_default_prior(champion, champion_positions)
        else:
            posterior = compute_posterior(
                champion,
                stats['counts'],
                stats['total'],
                alpha,
                champion_positions
            )

        predicted_role = max(posterior.keys(), key=lambda p: posterior[p])
        true_prob = posterior.get(true_position, 0.001)
        predicted_prob = posterior.get(predicted_role, 0.001)

        total_log_loss += -math.log(max(true_prob, 1e-10))

        is_correct = 1 if predicted_role == true_position else 0
        correct_top1 += is_correct

        total_entropy += compute_entropy(posterior)

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


def select_best_alpha(results, ece_threshold=0.10, log_loss_tolerance=0.005):
    """Select best α according to rules."""
    filtered = [r for r in results if r['ece'] <= ece_threshold]

    if not filtered:
        filtered = results
        reason_prefix = f"No alpha with ECE ≤ {ece_threshold}; using all alphas. "
    else:
        reason_prefix = f"Filtered to {len(filtered)} alphas with ECE ≤ {ece_threshold}. "

    filtered_sorted = sorted(filtered, key=lambda r: r['log_loss'])

    best = filtered_sorted[0]

    candidates_within_tolerance = [
        r for r in filtered_sorted
        if r['log_loss'] - best['log_loss'] < log_loss_tolerance
    ]

    if len(candidates_within_tolerance) > 1:
        best = max(candidates_within_tolerance, key=lambda r: r['alpha'])
        reason = (
            reason_prefix +
            f"Multiple alphas within log-loss tolerance ({log_loss_tolerance}); "
            f"selected α={best['alpha']} (largest for stability)."
        )
    else:
        reason = reason_prefix + f"Selected α={best['alpha']} with lowest log loss."

    return best, reason


def main():
    print("=" * 80)
    print("Step 2: Alpha Calibration (Player-Role-Instance Structure)")
    print("=" * 80)
    print()

    # Load data
    print("Loading instance game records...")
    records = load_instance_records()
    print(f"  Total records: {len(records)}")

    print("\nLoading champion positions...")
    champion_positions = load_champion_prior()
    print(f"  Loaded {len(champion_positions)} mappings")

    # Temporal split
    print("\nSplitting data temporally...")
    train = [r for r in records if r['year'] == 2024]
    validation = [r for r in records if r['year'] == 2025]
    print(f"  Train (2024): {len(train)} records")
    print(f"  Validation (2025): {len(validation)} records")

    # Aggregate training data
    print("\nAggregating training data...")
    train_stats = aggregate_role_counts(train)
    print(f"  Unique champions in training: {len(train_stats)}")

    # Dense α grid search
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

    # Load old alpha for comparison
    old_alpha = 37  # From previous calibration without instance structure

    # Print results
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
    print(f"\nComparison with Previous α:")
    print(f"  Old α (without instance structure): {old_alpha}")
    print(f"  New α (with instance structure): {best['alpha']}")

    # Save JSON output
    output = {
        'metadata': {
            'dataset': 'grid_v2',
            'structure': 'player-role-instance',
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
        'comparison': {
            'old_alpha': old_alpha,
            'new_alpha': best['alpha'],
            'change': best['alpha'] - old_alpha,
        },
    }

    output_path = os.path.join(DATA_DIR, 'alpha_results_instance.json')
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\n✓ Results saved to {output_path}")

    # Generate calibration report
    report = f"""# Alpha Calibration Report (Player-Role-Instance Structure)

## Overview

This report documents the recalibration of prior strength parameter α
using the new player-role-instance data structure.

## Data Structure Change

| Aspect | Old Structure | New Structure |
|--------|---------------|---------------|
| Analysis Entity | player_id | (player_id, team_id, role_epoch) |
| Role Attribution | Aggregate across all time | Per-instance (role-aware) |
| Train Records | 13,210 | {len(train)} |
| Validation Records | 20,628 | {len(validation)} |

## Calibration Method

- **Temporal Split:** 2024 (train) / 2025 (validation)
- **α Search Range:** 1-200 (dense grid)
- **Primary Metrics:** Log Loss, ECE
- **Selection Rule:** ECE ≤ 0.10, then lowest Log Loss, prefer larger α within 0.005 tolerance

## Results

### Selected α

| Metric | Value |
|--------|-------|
| **α** | **{best['alpha']}** |
| Log Loss | {best['log_loss']:.6f} |
| ECE | {best['ece']:.6f} |
| Top-1 Accuracy | {best['top1_accuracy']*100:.2f}% |
| Mean Entropy | {best['mean_entropy']:.4f} |

### Comparison with Previous Calibration

| Metric | Old (player_id only) | New (instance-based) |
|--------|---------------------|----------------------|
| α | {old_alpha} | {best['alpha']} |
| Change | - | {'+' if best['alpha'] > old_alpha else ''}{best['alpha'] - old_alpha} |

### Why α Changed

"""

    if best['alpha'] != old_alpha:
        if best['alpha'] > old_alpha:
            report += f"""
The new α ({best['alpha']}) is **larger** than the old α ({old_alpha}).

**Explanation:**
- Instance-based structure provides cleaner role attribution
- Less noise from role-switching players (e.g., Malrang jungle→support)
- Cleaner data allows the model to rely more on prior knowledge
- Larger α = stronger prior = more stable estimates for rare champions
"""
        else:
            report += f"""
The new α ({best['alpha']}) is **smaller** than the old α ({old_alpha}).

**Explanation:**
- Instance-based structure provides more accurate role labels
- Model can trust the observed data more
- Smaller α = data-driven estimates
"""
    else:
        report += f"""
The α value remained unchanged at {best['alpha']}.

**Explanation:**
- The instance-based restructuring did not significantly change the optimal prior strength
- The model's balance between prior and data remains similar
"""

    report += f"""

## Selection Reason

{selection_reason}

## Top 10 α Values by Log Loss

| Rank | α | Log Loss | ECE | Top-1 Acc |
|------|---|----------|-----|-----------|
"""

    sorted_results = sorted(results, key=lambda r: r['log_loss'])[:10]
    for i, r in enumerate(sorted_results, 1):
        marker = " ✓" if r['alpha'] == best['alpha'] else ""
        report += f"| {i} | {r['alpha']}{marker} | {r['log_loss']:.6f} | {r['ece']:.6f} | {r['top1_accuracy']*100:.2f}% |\n"

    report += f"""

## Files Generated

- `alpha_results_instance.json` - Full calibration results
- `alpha_calibration_report.md` - This report

---
*Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}*
"""

    report_path = os.path.join(DATA_DIR, 'alpha_calibration_report.md')
    with open(report_path, 'w') as f:
        f.write(report)

    print(f"✓ Report saved to {report_path}")

    print("\n" + "=" * 80)
    print("STEP 2 COMPLETE")
    print("=" * 80)


if __name__ == '__main__':
    main()
