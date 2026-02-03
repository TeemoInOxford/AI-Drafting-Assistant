#!/usr/bin/env python3
"""
Step 3: Generate Bayesian Role Posteriors (Instance-Based, α=32)

Uses:
- Player-role-instance structure from Step 1
- Calibrated α=32 from Step 2
- Full grid_v2 data

Output:
- bayesian-role-posteriors.json (overwrites old file)

Note: This step only affects role probability display.
Does NOT affect PTS, Threat Signals, or Draft Decision ranking.
"""

import json
import os
import math
from collections import defaultdict
from datetime import datetime

DATA_DIR = '/www/wwwroot/AI-Drafting-Assistant/data/grid_v2'

ALL_POSITIONS = ['top', 'jungle', 'mid', 'bot', 'support']
ALPHA = 32  # Calibrated from Step 2


def load_champion_positions():
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

    total = sum(posterior.values())
    if total > 0:
        for pos in ALL_POSITIONS:
            posterior[pos] /= total

    return posterior


def compute_entropy(posterior):
    """Compute Shannon entropy of posterior distribution."""
    entropy = 0.0
    for p in posterior.values():
        if p > 0:
            entropy -= p * math.log2(p)
    return entropy


def main():
    print("=" * 80)
    print(f"Step 3: Generate Bayesian Role Posteriors (α={ALPHA})")
    print("=" * 80)
    print()

    # Load champion positions
    print("Loading CHAMPION_POSITIONS...")
    champion_positions = load_champion_positions()
    print(f"  Loaded {len(champion_positions)} mappings")

    # Load instance game records
    print("\nLoading instance game records...")
    with open(os.path.join(DATA_DIR, 'instance_game_records.json'), 'r') as f:
        records = json.load(f)
    print(f"  Loaded {len(records)} records")

    # Count unique instances
    unique_instances = set(r['instance_id'] for r in records)
    print(f"  Unique player-role instances: {len(unique_instances)}")

    # Aggregate champion-role counts
    print("\nAggregating champion-role counts...")
    champion_role_counts = defaultdict(lambda: {'counts': defaultdict(int), 'total': 0})

    for record in records:
        champion = record['champion']
        position = record['inferred_role']
        champion_role_counts[champion]['counts'][position] += 1
        champion_role_counts[champion]['total'] += 1

    print(f"  Unique champions: {len(champion_role_counts)}")

    # Compute posteriors
    print(f"\nComputing Bayesian posteriors (α={ALPHA})...")
    output = {}

    for champion, stats in champion_role_counts.items():
        posterior = compute_posterior(
            champion,
            stats['counts'],
            stats['total'],
            ALPHA,
            champion_positions
        )

        entropy = compute_entropy(posterior)
        max_entropy = math.log2(len(ALL_POSITIONS))
        flexibility_score = entropy / max_entropy if max_entropy > 0 else 0

        output[champion] = {
            'posterior': {pos: round(posterior[pos], 6) for pos in ALL_POSITIONS},
            'observedMatches': stats['total'],
            'alpha': ALPHA,
            'entropy': round(entropy, 4),
            'flexibilityScore': round(flexibility_score, 4),
        }

    # Backup old file if exists
    output_path = os.path.join(DATA_DIR, 'bayesian-role-posteriors.json')
    backup_path = os.path.join(DATA_DIR, 'bayesian-role-posteriors.backup.json')

    if os.path.exists(output_path):
        print(f"\nBacking up old file to {backup_path}...")
        with open(output_path, 'r') as f:
            old_data = json.load(f)
        with open(backup_path, 'w') as f:
            json.dump(old_data, f, indent=2)

    # Save new posteriors
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\n✓ Saved {len(output)} champion posteriors to:")
    print(f"  {output_path}")

    # Print sample
    print("\n" + "=" * 80)
    print("Sample Posteriors (Top 10 by observed matches)")
    print("=" * 80)

    sorted_champs = sorted(output.items(), key=lambda x: -x[1]['observedMatches'])[:10]

    print(f"{'Champion':<15} {'Matches':>8} {'Top':>8} {'Jng':>8} {'Mid':>8} {'Bot':>8} {'Sup':>8} {'Flex':>6}")
    print("-" * 85)

    for champ, data in sorted_champs:
        p = data['posterior']
        print(f"{champ:<15} {data['observedMatches']:>8} "
              f"{p['top']*100:>7.1f}% {p['jungle']*100:>7.1f}% {p['mid']*100:>7.1f}% "
              f"{p['bot']*100:>7.1f}% {p['support']*100:>7.1f}% {data['flexibilityScore']:>6.2f}")

    # Check Neeko specifically
    print("\n" + "=" * 80)
    print("Verification: Neeko (previously had jungle attribution)")
    print("=" * 80)

    if 'Neeko' in output:
        neeko = output['Neeko']
        print(f"Observed Matches: {neeko['observedMatches']}")
        print(f"Posterior:")
        for pos in ALL_POSITIONS:
            print(f"  {pos}: {neeko['posterior'][pos]*100:.2f}%")
        print(f"Flexibility Score: {neeko['flexibilityScore']:.4f}")

    # Summary log
    print("\n" + "=" * 80)
    print("STEP 3 COMPLETE")
    print("=" * 80)
    print(f"""
Generation Summary:
  - Data Structure: Player-Role-Instance
  - α (prior strength): {ALPHA}
  - Total Champions: {len(output)}
  - Total Game Records: {len(records)}
  - Unique Instances: {len(unique_instances)}

Output File:
  - {output_path}

Backup File:
  - {backup_path}

Note:
  - This update affects role probability display only
  - Does NOT affect PTS, Threat Signals, or Draft Decision ranking
  - Flex interpretation is for informational purposes
""")


if __name__ == '__main__':
    main()
