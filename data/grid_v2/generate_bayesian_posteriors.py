#!/usr/bin/env python3
"""
Generate Bayesian Role Posteriors using grid_v2 data and calibrated α=37.

Formula:
  posterior(role | champion) = (α × prior(role) + count(role)) / (α + total_count)

Output:
  data/grid_v2/bayesian-role-posteriors.json
"""

import json
import os
import glob
import re
from collections import defaultdict
from datetime import datetime

DATA_DIR = '/www/wwwroot/AI-Drafting-Assistant/data/grid_v2'
POSITIONS_FILE = '/www/wwwroot/AI-Drafting-Assistant/app/lib/positions.ts'

ALL_POSITIONS = ['top', 'jungle', 'mid', 'bot', 'support']
ALPHA = 37  # Calibrated prior strength


def load_champion_positions():
    """Parse CHAMPION_POSITIONS from positions.ts"""
    positions = {}

    with open(POSITIONS_FILE, 'r') as f:
        content = f.read()

    start = content.find('export const CHAMPION_POSITIONS')
    if start == -1:
        raise ValueError("Could not find CHAMPION_POSITIONS")

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

    # Normalize
    total = sum(posterior.values())
    if total > 0:
        for pos in ALL_POSITIONS:
            posterior[pos] /= total

    return posterior


def main():
    print("=" * 70)
    print("Generate Bayesian Role Posteriors (grid_v2, α=37)")
    print("=" * 70)
    print()

    # Load champion positions mapping
    print("Loading CHAMPION_POSITIONS...")
    champion_positions = load_champion_positions()
    print(f"  Loaded {len(champion_positions)} mappings")

    # Load all match data and infer player positions
    print("\nLoading match data from grid_v2...")
    series_files = glob.glob(os.path.join(DATA_DIR, 'series_*.json'))
    print(f"  Found {len(series_files)} series files")

    # First pass: collect player champion usage
    player_champion_usage = defaultdict(lambda: defaultdict(int))

    for sf in series_files:
        with open(sf, 'r') as f:
            series = json.load(f)

        for game in series.get('games', []):
            for team in game.get('teams', []):
                for player in team.get('players', []):
                    player_id = str(player.get('id', ''))
                    champion = player.get('character', {}).get('name')
                    if player_id and champion:
                        player_champion_usage[player_id][champion] += 1

    # Infer player positions
    print("  Inferring player positions...")
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

    print(f"  Inferred positions for {len(player_positions)} players")

    # Second pass: aggregate champion-role counts
    print("\nAggregating champion-role counts...")
    champion_role_counts = defaultdict(lambda: {'counts': defaultdict(int), 'total': 0})

    for sf in series_files:
        with open(sf, 'r') as f:
            series = json.load(f)

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

                    champion_role_counts[champion]['counts'][position] += 1
                    champion_role_counts[champion]['total'] += 1

    print(f"  Found {len(champion_role_counts)} unique champions")

    # Compute posteriors for all champions
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

        output[champion] = {
            'posterior': {pos: round(posterior[pos], 6) for pos in ALL_POSITIONS},
            'observedMatches': stats['total'],
            'alpha': ALPHA,
        }

    # Save output
    output_path = os.path.join(DATA_DIR, 'bayesian-role-posteriors.json')
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\n✓ Saved {len(output)} champion posteriors to:")
    print(f"  {output_path}")

    # Print sample
    print("\n" + "=" * 70)
    print("Sample Posteriors (Top 10 by observed matches)")
    print("=" * 70)

    sorted_champs = sorted(output.items(), key=lambda x: -x[1]['observedMatches'])[:10]

    print(f"{'Champion':<15} {'Matches':>8} {'Top':>8} {'Jng':>8} {'Mid':>8} {'Bot':>8} {'Sup':>8}")
    print("-" * 75)

    for champ, data in sorted_champs:
        p = data['posterior']
        print(f"{champ:<15} {data['observedMatches']:>8} "
              f"{p['top']*100:>7.1f}% {p['jungle']*100:>7.1f}% {p['mid']*100:>7.1f}% "
              f"{p['bot']*100:>7.1f}% {p['support']*100:>7.1f}%")

    print("\n" + "=" * 70)
    print("COMPLETE")
    print("=" * 70)


if __name__ == '__main__':
    main()
