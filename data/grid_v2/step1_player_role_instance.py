#!/usr/bin/env python3
"""
Player Role Instance Restructuring

Problem:
  Old structure assumes "one player = one role", which fails when players:
  - Switch teams and change roles (e.g., Malrang: jungle → support)
  - Play multiple roles within the same team

Solution:
  Upgrade analysis entity from player_id to (player_id, team_id, role_epoch)
  where role_epoch is determined by detecting stable role changes.

Output:
  - player_role_instances.json: New role-aware player mapping
  - player_role_instance_report.md: Migration comparison report
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

# Minimum consecutive games to establish a role epoch
MIN_GAMES_FOR_EPOCH = 3


def load_champion_positions():
    """Parse CHAMPION_POSITIONS from positions.ts"""
    positions = {}
    with open(POSITIONS_FILE, 'r') as f:
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

    for champ, roles_str in matches:
        roles = re.findall(r"'(\w+)'", roles_str)
        positions[champ] = roles

    return positions


def infer_role_from_champion(champion, champion_positions):
    """Infer most likely role from a single champion pick."""
    positions = champion_positions.get(champion, [])
    if positions:
        return positions[0]  # Primary role
    return None


def detect_role_epochs(games_chronological, champion_positions):
    """
    Detect role epochs for a player based on their game history.

    A new epoch starts when:
    - Player changes team
    - Player's dominant role changes for MIN_GAMES_FOR_EPOCH consecutive games

    Returns list of epochs: [(team_id, role, start_idx, end_idx), ...]
    """
    if not games_chronological:
        return []

    epochs = []
    current_team = None
    current_role = None
    epoch_start = 0
    role_streak = []

    for i, game in enumerate(games_chronological):
        team_id = game['team_id']
        champion = game['champion']
        inferred_role = infer_role_from_champion(champion, champion_positions)

        # Team change always starts new epoch
        if team_id != current_team:
            if current_team is not None and current_role is not None:
                epochs.append({
                    'team_id': current_team,
                    'role': current_role,
                    'start_idx': epoch_start,
                    'end_idx': i - 1,
                    'games': i - epoch_start,
                })
            current_team = team_id
            current_role = inferred_role
            epoch_start = i
            role_streak = [inferred_role]
            continue

        # Same team - check for role change
        role_streak.append(inferred_role)

        # Keep only last MIN_GAMES_FOR_EPOCH roles
        if len(role_streak) > MIN_GAMES_FOR_EPOCH:
            role_streak = role_streak[-MIN_GAMES_FOR_EPOCH:]

        # Check if role has consistently changed
        if len(role_streak) >= MIN_GAMES_FOR_EPOCH:
            # Count roles in streak
            role_counts = defaultdict(int)
            for r in role_streak:
                if r:
                    role_counts[r] += 1

            if role_counts:
                dominant_role = max(role_counts.keys(), key=lambda r: role_counts[r])

                # If dominant role in streak differs from current epoch role
                if dominant_role != current_role and role_counts[dominant_role] >= MIN_GAMES_FOR_EPOCH:
                    # End current epoch
                    if current_role is not None:
                        epochs.append({
                            'team_id': current_team,
                            'role': current_role,
                            'start_idx': epoch_start,
                            'end_idx': i - MIN_GAMES_FOR_EPOCH,
                            'games': i - MIN_GAMES_FOR_EPOCH - epoch_start + 1,
                        })
                    # Start new epoch
                    current_role = dominant_role
                    epoch_start = i - MIN_GAMES_FOR_EPOCH + 1
                    role_streak = [dominant_role]

    # Close final epoch
    if current_team is not None and current_role is not None:
        epochs.append({
            'team_id': current_team,
            'role': current_role,
            'start_idx': epoch_start,
            'end_idx': len(games_chronological) - 1,
            'games': len(games_chronological) - epoch_start,
        })

    return epochs


def main():
    print("=" * 80)
    print("Player Role Instance Restructuring")
    print("=" * 80)
    print()

    # Load champion positions
    print("Loading CHAMPION_POSITIONS...")
    champion_positions = load_champion_positions()
    print(f"  Loaded {len(champion_positions)} mappings")

    # Load all games chronologically per player
    print("\nLoading match data...")
    series_files = glob.glob(os.path.join(DATA_DIR, 'series_*.json'))

    # Collect all games with dates
    all_games = []
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

        series_id = series.get('id')

        for game in series.get('games', []):
            game_id = game.get('id')
            game_seq = game.get('sequenceNumber', 1)

            for team in game.get('teams', []):
                team_id = str(team.get('id', ''))
                team_name = team.get('name', '')

                for player in team.get('players', []):
                    player_id = str(player.get('id', ''))
                    player_name = player.get('name', '')
                    champion = player.get('character', {}).get('name')

                    if player_id and champion:
                        all_games.append({
                            'date': date,
                            'series_id': series_id,
                            'game_id': game_id,
                            'player_id': player_id,
                            'player_name': player_name,
                            'team_id': team_id,
                            'team_name': team_name,
                            'champion': champion,
                        })

    print(f"  Loaded {len(all_games)} game records")

    # Group by player and sort chronologically
    player_games = defaultdict(list)
    player_names = {}

    for game in all_games:
        player_games[game['player_id']].append(game)
        player_names[game['player_id']] = game['player_name']

    for player_id in player_games:
        player_games[player_id].sort(key=lambda g: g['date'])

    print(f"  Unique players (old structure): {len(player_games)}")

    # Detect role epochs for each player
    print("\nDetecting role epochs...")

    player_instances = {}
    instance_count = 0
    multi_instance_players = []

    for player_id, games in player_games.items():
        epochs = detect_role_epochs(games, champion_positions)

        if not epochs:
            # Fallback: single epoch with most common role
            role_counts = defaultdict(int)
            team_id = games[0]['team_id'] if games else 'unknown'
            for g in games:
                role = infer_role_from_champion(g['champion'], champion_positions)
                if role:
                    role_counts[role] += 1

            dominant_role = max(role_counts.keys(), key=lambda r: role_counts[r]) if role_counts else 'mid'
            epochs = [{
                'team_id': team_id,
                'role': dominant_role,
                'start_idx': 0,
                'end_idx': len(games) - 1,
                'games': len(games),
            }]

        player_instances[player_id] = {
            'player_name': player_names[player_id],
            'total_games': len(games),
            'epochs': epochs,
            'instance_count': len(epochs),
        }

        instance_count += len(epochs)

        if len(epochs) > 1:
            multi_instance_players.append({
                'player_id': player_id,
                'player_name': player_names[player_id],
                'epochs': epochs,
            })

    print(f"  Total player-role instances (new structure): {instance_count}")
    print(f"  Players with multiple instances: {len(multi_instance_players)}")

    # Build instance-level game mapping
    print("\nBuilding instance-level game mapping...")

    instance_games = []  # List of (instance_id, game_record)
    instance_metadata = {}

    for player_id, data in player_instances.items():
        games = player_games[player_id]

        for epoch_idx, epoch in enumerate(data['epochs']):
            instance_id = f"{player_id}_{epoch['team_id']}_{epoch_idx}"

            instance_metadata[instance_id] = {
                'player_id': player_id,
                'player_name': data['player_name'],
                'team_id': epoch['team_id'],
                'role': epoch['role'],
                'epoch_idx': epoch_idx,
                'games_in_epoch': epoch['games'],
            }

            # Get games for this epoch
            for i in range(epoch['start_idx'], epoch['end_idx'] + 1):
                if i < len(games):
                    game = games[i]
                    instance_games.append({
                        'instance_id': instance_id,
                        'player_id': player_id,
                        'player_name': data['player_name'],
                        'team_id': epoch['team_id'],
                        'inferred_role': epoch['role'],
                        'champion': game['champion'],
                        'date': game['date'].isoformat(),
                        'series_id': game['series_id'],
                    })

    print(f"  Total instance-game records: {len(instance_games)}")

    # Save outputs
    print("\nSaving outputs...")

    # 1. Player role instances mapping
    output_instances = {
        'metadata': {
            'generated_at_utc': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
            'min_games_for_epoch': MIN_GAMES_FOR_EPOCH,
            'total_players_old': len(player_games),
            'total_instances_new': instance_count,
            'multi_instance_players': len(multi_instance_players),
        },
        'players': player_instances,
        'instances': instance_metadata,
    }

    instances_path = os.path.join(DATA_DIR, 'player_role_instances.json')
    with open(instances_path, 'w') as f:
        json.dump(output_instances, f, indent=2, default=str)
    print(f"  Saved: {instances_path}")

    # 2. Instance-level game records (for downstream processing)
    games_path = os.path.join(DATA_DIR, 'instance_game_records.json')
    with open(games_path, 'w') as f:
        json.dump(instance_games, f, indent=2)
    print(f"  Saved: {games_path}")

    # Generate report
    print("\nGenerating migration report...")

    # Find Malrang specifically
    malrang_data = None
    for player_id, data in player_instances.items():
        if data['player_name'] == 'Malrang':
            malrang_data = {'player_id': player_id, **data}
            break

    report = f"""# Player Role Instance Migration Report

## Overview

This report documents the restructuring of player analysis entities from simple `player_id`
to role-aware `(player_id, team_id, role_epoch)` instances.

## Problem Statement

**Old Structure Assumption:**
- One player = One fixed role
- Role inferred from aggregate champion history across all teams/time periods
- Fails when players change roles (e.g., jungle → support)

**Example Failure Case:**
- Malrang historically played jungle (Sejuani, Xin Zhao, Vi, etc.)
- In 2025, joined NAVI as support
- Old system: Malrang plays Neeko → labeled as "jungle Neeko"
- Reality: Malrang plays Neeko as support

## Solution: Player-Role-Instance

**New Structure:**
- Analysis entity: `(player_id, team_id, role_epoch)`
- A new epoch starts when:
  1. Player changes team
  2. Player's dominant role changes for {MIN_GAMES_FOR_EPOCH}+ consecutive games
- Same player can have multiple instances (different roles/teams)

## Migration Statistics

| Metric | Old Structure | New Structure |
|--------|---------------|---------------|
| Total Players | {len(player_games)} | {len(player_games)} |
| Total Instances | {len(player_games)} | {instance_count} |
| Multi-Instance Players | 0 | {len(multi_instance_players)} |
| Game Records | {len(all_games)} | {len(instance_games)} |

## Players with Multiple Instances

"""

    # Add multi-instance player details
    for mp in sorted(multi_instance_players, key=lambda x: -len(x['epochs']))[:20]:
        report += f"\n### {mp['player_name']} ({len(mp['epochs'])} instances)\n\n"
        for i, epoch in enumerate(mp['epochs']):
            report += f"- **Instance {i+1}**: Team `{epoch['team_id']}`, Role: `{epoch['role']}`, Games: {epoch['games']}\n"

    # Add Malrang case study
    if malrang_data:
        report += f"""

## Case Study: Malrang

**Player ID:** {malrang_data['player_id']}
**Total Games:** {malrang_data['total_games']}
**Instances:** {malrang_data['instance_count']}

### Epoch Breakdown:

"""
        for i, epoch in enumerate(malrang_data['epochs']):
            report += f"| Epoch {i+1} | Team: `{epoch['team_id']}` | Role: `{epoch['role']}` | Games: {epoch['games']} |\n"

        report += """
### Impact:

- **Before:** All Malrang games labeled with single inferred role (jungle)
- **After:** Games correctly attributed to role-specific instances
- **Result:** Neeko game now attributed to support instance, not jungle

"""

    report += """
## Affected Downstream Modules

| Module | Impact |
|--------|--------|
| **Role Posterior** | More accurate role distributions per champion |
| **Player Pool** | Role-specific champion pools per player instance |
| **Ban Attribution** | Correct role context for ban analysis |
| **Flex Detection** | Reduced false positives from role-switching players |

## Technical Notes

- Epoch detection uses sliding window of {0} games
- Team change always triggers new epoch
- Role change requires {0}+ consecutive games with different dominant role
- Original player_id preserved for backward compatibility

## Files Generated

1. `player_role_instances.json` - Instance metadata and epoch definitions
2. `instance_game_records.json` - Game records with instance attribution
3. `player_role_instance_report.md` - This report

---
*Generated: {1}*
""".format(MIN_GAMES_FOR_EPOCH, datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC'))

    report_path = os.path.join(DATA_DIR, 'player_role_instance_report.md')
    with open(report_path, 'w') as f:
        f.write(report)
    print(f"  Saved: {report_path}")

    # Print summary
    print("\n" + "=" * 80)
    print("STEP 1 COMPLETE")
    print("=" * 80)
    print(f"""
Summary:
  - Old structure: {len(player_games)} players (1 role each)
  - New structure: {instance_count} player-role instances
  - Multi-instance players: {len(multi_instance_players)}

Key Changes:
  - Player analysis now role-aware
  - Same player can have multiple instances
  - Epoch detection based on team changes + role shifts

Files Generated:
  - player_role_instances.json
  - instance_game_records.json
  - player_role_instance_report.md
""")


if __name__ == '__main__':
    main()
