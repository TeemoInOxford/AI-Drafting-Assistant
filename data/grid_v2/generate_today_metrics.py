#!/usr/bin/env python3
"""
Generate all today_*_teamweighted.json files from scratch.

Phase 6 of the full pipeline rerun.

Generates:
- today_presence_union_global_teamweighted.json (union mode, global)
- today_presence_global_teamweighted.json (action-share mode, global)
- today_pick_rate_global_teamweighted.json
- today_ban_rate_global_teamweighted.json
- today_presence_union_by_league_teamweighted.json (union mode, by league)
- today_presence_by_league_teamweighted.json (action-share mode, by league)
- today_pick_rate_by_league_teamweighted.json
- today_ban_rate_by_league_teamweighted.json
"""

import json
import glob
import os
import math
from datetime import datetime, timezone
from collections import defaultdict

DATA_DIR = '/www/wwwroot/AI-Drafting-Assistant/data/grid_v2'

# Parameters
BETA = 0.5
GAMMA = 2
W_MIN = 0.75
W_MAX = 1.25

# Team ID mapping
TEAM_ID_MAPPING = {
    '48610': '47757',  # TBD-1 -> LEVIATÁN
}

def load_patch_start_dates():
    """Load patch start dates from JSON file"""
    with open(os.path.join(DATA_DIR, '_patch_start_dates.json'), 'r') as f:
        data = json.load(f)
    # Convert string keys to int
    return {int(k): v for k, v in data.items()}

def load_team_power_scores():
    """Load team power scores"""
    with open(os.path.join(DATA_DIR, 'team_power_score.json'), 'r') as f:
        teams = json.load(f)
    return {t['id']: t.get('power_score', {}) for t in teams}

def load_team_home_league_map():
    """Load team home league mapping"""
    with open(os.path.join(DATA_DIR, 'team_home_league_map.json'), 'r') as f:
        return json.load(f)

def parse_patch_index(title_version):
    """Parse patch version to patch_index (e.g., '15.18' -> 1518)"""
    if not title_version:
        return None
    if isinstance(title_version, dict):
        title_version = title_version.get('name')
        if not title_version:
            return None
    try:
        parts = str(title_version).split('.')
        if len(parts) >= 2:
            major = int(parts[0])
            minor = int(parts[1])
            return major * 100 + minor
    except:
        pass
    return None

def get_team_score(team_id, game_date, team_scores):
    """Get team's power score for game date"""
    if team_id not in team_scores:
        return None
    scores = team_scores[team_id]
    if not scores:
        return None

    # Find closest date <= game_date
    available_dates = sorted(scores.keys(), reverse=True)
    for date_key in available_dates:
        if date_key <= game_date:
            return scores[date_key]

    # Fallback: use earliest available date
    earliest_date = sorted(scores.keys())[0]
    return scores[earliest_date]

def main():
    print("=" * 80)
    print("Phase 6: Generate Today Metrics (Team-Weighted)")
    print("=" * 80)
    print()

    # Load data
    print("Loading data...")
    PATCH_START_DATES = load_patch_start_dates()
    team_scores = load_team_power_scores()
    team_home_league = load_team_home_league_map()

    print(f"  - Patch start dates: {len(PATCH_START_DATES)} patches")
    print(f"  - Team power scores: {len(team_scores)} teams")
    print(f"  - Team home leagues: {len(team_home_league)} teams")

    # Load all games
    series_files = glob.glob(os.path.join(DATA_DIR, 'series_*.json'))
    print(f"  - Series files: {len(series_files)}")

    # Find target patch (max patch_index)
    target_patch_index = None
    all_games = []

    for sf in series_files:
        with open(sf, 'r') as f:
            series = json.load(f)

        series_teams = series.get('teams', [])
        series_started_at = series.get('startedAt')

        for game in series.get('games', []):
            title_version = game.get('titleVersion')
            started_at = game.get('startedAt') or series_started_at
            draft_actions = game.get('draftActions', [])

            if not title_version or not started_at or len(draft_actions) != 20:
                continue

            patch_index = parse_patch_index(title_version)
            if patch_index is None:
                continue

            if target_patch_index is None or patch_index > target_patch_index:
                target_patch_index = patch_index

            all_games.append({
                'game': game,
                'series_teams': series_teams,
                'patch_index': patch_index,
                'started_at': started_at,
            })

    target_patch = f"{target_patch_index // 100}.{target_patch_index % 100}"
    print(f"\nTarget patch: {target_patch} (index: {target_patch_index})")
    print(f"Valid games loaded: {len(all_games)}")

    # Build team-game records with weights
    print("\nBuilding team-game records with weights...")

    team_games = []

    for game_info in all_games:
        game = game_info['game']
        patch_index = game_info['patch_index']
        started_at = game_info['started_at']
        series_teams = game_info['series_teams']

        # Calculate delta_patch
        delta_patch = target_patch_index - patch_index
        if delta_patch < 0:
            continue

        # Calculate w_patch
        w_patch = BETA ** delta_patch

        # Calculate d (days since patch start)
        if patch_index not in PATCH_START_DATES:
            continue

        patch_start_str = PATCH_START_DATES[patch_index]
        patch_start = datetime.strptime(patch_start_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        game_dt = datetime.fromisoformat(started_at.replace('Z', '+00:00'))
        d = (game_dt - patch_start).days

        if d < 0:
            d = 0  # Clamp to 0 if game is before patch start

        # Calculate w_day
        w_day = 1 - math.exp(-(d + 1) / GAMMA)

        game_date = game_dt.strftime('%Y-%m-%d')

        # Get teams
        teams_in_game = game.get('teams', []) or series_teams

        # Get draft actions
        draft_actions = game.get('draftActions', [])

        for team in teams_in_game:
            team_id = str(team.get('id', ''))
            team_id = TEAM_ID_MAPPING.get(team_id, team_id)
            if not team_id:
                continue

            # Get power score
            score = get_team_score(team_id, game_date, team_scores)
            if score is None:
                continue

            # Get home league
            home_league = team_home_league.get(team_id, {}).get('home_league', 'OTHER')

            # Get team's actions (picks and bans)
            team_name = team.get('name', '')
            team_picks = []
            team_bans = []

            for action in draft_actions:
                drafter_id = str(action.get('drafter', {}).get('id', ''))
                drafter_id = TEAM_ID_MAPPING.get(drafter_id, drafter_id)

                if drafter_id == team_id:
                    hero = action.get('draftable', {}).get('name')
                    if hero:
                        if action.get('type') == 'pick':
                            team_picks.append(hero)
                        elif action.get('type') == 'ban':
                            team_bans.append(hero)

            team_games.append({
                'game_id': game.get('id'),
                'team_id': team_id,
                'team_name': team_name,
                'home_league': home_league,
                'game_date': game_date,
                'patch_index': patch_index,
                'delta_patch': delta_patch,
                'd': d,
                'w_patch': w_patch,
                'w_day': w_day,
                'power_score': score,
                'picks': team_picks,
                'bans': team_bans,
            })

    print(f"Team-games built: {len(team_games)}")

    # Calculate team percentiles for weighting
    print("\nCalculating team percentiles...")

    all_scores = [tg['power_score'] for tg in team_games]
    all_scores_sorted = sorted(all_scores)
    n_scores = len(all_scores_sorted)

    def get_percentile(score):
        # Find position in sorted list
        pos = 0
        for i, s in enumerate(all_scores_sorted):
            if s <= score:
                pos = i + 1
        return pos / n_scores

    for tg in team_games:
        percentile = get_percentile(tg['power_score'])
        tg['percentile'] = percentile
        tg['w_team'] = W_MIN + (W_MAX - W_MIN) * percentile
        tg['w_total'] = tg['w_patch'] * tg['w_day'] * tg['w_team']

    # Calculate statistics
    print("\nCalculating presence/pick/ban statistics...")

    # =========================================================================
    # Global Union Presence
    # =========================================================================
    def calc_union_presence(team_games_subset):
        """Calculate union presence (hero appeared in picks OR bans)"""
        hero_weight = defaultdict(float)
        total_weight = 0

        for tg in team_games_subset:
            w = tg['w_total']
            total_weight += w

            # Union of picks and bans
            heroes_in_game = set(tg['picks']) | set(tg['bans'])
            for hero in heroes_in_game:
                hero_weight[hero] += w

        # Convert to presence values
        heroes = []
        for hero, weight in sorted(hero_weight.items(), key=lambda x: -x[1]):
            heroes.append({
                'hero': hero,
                'value': round(weight / total_weight, 6) if total_weight > 0 else 0,
                'support_weight': round(weight, 2),
            })

        return heroes, round(total_weight, 2), len(team_games_subset)

    # =========================================================================
    # Action-Share Presence (each pick/ban is an action)
    # =========================================================================
    def calc_action_share_presence(team_games_subset):
        """Calculate action-share presence (weighted by individual actions)"""
        hero_weight = defaultdict(float)
        total_weight = 0
        total_actions = 0

        for tg in team_games_subset:
            w = tg['w_total']

            # Each pick and ban is a separate action
            for hero in tg['picks']:
                hero_weight[hero] += w
                total_weight += w
                total_actions += 1

            for hero in tg['bans']:
                hero_weight[hero] += w
                total_weight += w
                total_actions += 1

        # Convert to presence values
        heroes = []
        for hero, weight in sorted(hero_weight.items(), key=lambda x: -x[1]):
            heroes.append({
                'hero': hero,
                'value': round(weight / total_weight, 6) if total_weight > 0 else 0,
                'support_weight': round(weight, 2),
            })

        return heroes, round(total_weight, 2), total_actions

    # =========================================================================
    # Pick Rate / Ban Rate
    # =========================================================================
    def calc_pick_rate(team_games_subset):
        """Calculate pick rate"""
        hero_weight = defaultdict(float)
        total_weight = 0

        for tg in team_games_subset:
            w = tg['w_total']
            total_weight += w

            for hero in tg['picks']:
                hero_weight[hero] += w

        heroes = []
        for hero, weight in sorted(hero_weight.items(), key=lambda x: -x[1]):
            heroes.append({
                'hero': hero,
                'value': round(weight / total_weight, 6) if total_weight > 0 else 0,
                'support_weight': round(weight, 2),
            })

        return heroes, round(total_weight, 2), len(team_games_subset)

    def calc_ban_rate(team_games_subset):
        """Calculate ban rate"""
        hero_weight = defaultdict(float)
        total_weight = 0

        for tg in team_games_subset:
            w = tg['w_total']
            total_weight += w

            for hero in tg['bans']:
                hero_weight[hero] += w

        heroes = []
        for hero, weight in sorted(hero_weight.items(), key=lambda x: -x[1]):
            heroes.append({
                'hero': hero,
                'value': round(weight / total_weight, 6) if total_weight > 0 else 0,
                'support_weight': round(weight, 2),
            })

        return heroes, round(total_weight, 2), len(team_games_subset)

    # =========================================================================
    # Generate all files
    # =========================================================================
    generated_at = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    base_metadata = {
        'target_patch': target_patch,
        'target_patch_index': target_patch_index,
        'beta_used': BETA,
        'gamma_used': GAMMA,
        'team_weighting': {
            'method': 'percentile_linear',
            'w_min': W_MIN,
            'w_max': W_MAX,
        },
        'generated_at_utc': generated_at,
    }

    # =========================================================================
    # 1. Global Union Presence
    # =========================================================================
    print("\n1. Generating today_presence_union_global_teamweighted.json...")
    heroes, total_weight, total_games = calc_union_presence(team_games)
    data = {
        **base_metadata,
        'definition': 'union_presence',
        'total_games_used': total_games,
        'total_weight_sum': total_weight,
        'heroes': heroes,
    }
    with open(os.path.join(DATA_DIR, 'today_presence_union_global_teamweighted.json'), 'w') as f:
        json.dump(data, f, indent=2)
    print(f"   - {len(heroes)} heroes, {total_games} team-games, weight={total_weight}")

    # =========================================================================
    # 2. Global Action-Share Presence
    # =========================================================================
    print("\n2. Generating today_presence_global_teamweighted.json...")
    heroes, total_weight, total_actions = calc_action_share_presence(team_games)
    data = {
        **base_metadata,
        'definition': 'action_share_presence',
        'total_actions_used': total_actions,
        'total_weight_sum': total_weight,
        'heroes': heroes,
    }
    with open(os.path.join(DATA_DIR, 'today_presence_global_teamweighted.json'), 'w') as f:
        json.dump(data, f, indent=2)
    print(f"   - {len(heroes)} heroes, {total_actions} actions, weight={total_weight}")

    # =========================================================================
    # 3. Global Pick Rate
    # =========================================================================
    print("\n3. Generating today_pick_rate_global_teamweighted.json...")
    heroes, total_weight, total_games = calc_pick_rate(team_games)
    data = {
        **base_metadata,
        'definition': 'pick_rate',
        'total_games_used': total_games,
        'total_weight_sum': total_weight,
        'heroes': heroes,
    }
    with open(os.path.join(DATA_DIR, 'today_pick_rate_global_teamweighted.json'), 'w') as f:
        json.dump(data, f, indent=2)
    print(f"   - {len(heroes)} heroes, {total_games} team-games, weight={total_weight}")

    # =========================================================================
    # 4. Global Ban Rate
    # =========================================================================
    print("\n4. Generating today_ban_rate_global_teamweighted.json...")
    heroes, total_weight, total_games = calc_ban_rate(team_games)
    data = {
        **base_metadata,
        'definition': 'ban_rate',
        'total_games_used': total_games,
        'total_weight_sum': total_weight,
        'heroes': heroes,
    }
    with open(os.path.join(DATA_DIR, 'today_ban_rate_global_teamweighted.json'), 'w') as f:
        json.dump(data, f, indent=2)
    print(f"   - {len(heroes)} heroes, {total_games} team-games, weight={total_weight}")

    # =========================================================================
    # By League calculations
    # =========================================================================
    LEAGUES = ['LCK', 'LPL', 'LEC', 'LTA_N', 'LTA_S']

    # Group team-games by league
    league_team_games = defaultdict(list)
    for tg in team_games:
        league = tg['home_league']
        if league in LEAGUES:
            league_team_games[league].append(tg)

    print(f"\nTeam-games by league:")
    for league in LEAGUES:
        print(f"  {league}: {len(league_team_games[league])} team-games")

    # =========================================================================
    # 5. Union Presence by League
    # =========================================================================
    print("\n5. Generating today_presence_union_by_league_teamweighted.json...")
    leagues_data = {}
    for league in LEAGUES:
        heroes, total_weight, total_games = calc_union_presence(league_team_games[league])
        leagues_data[league] = {
            'total_games_used': total_games,
            'total_weight_sum': total_weight,
            'heroes': heroes,
        }
        print(f"   - {league}: {len(heroes)} heroes, {total_games} team-games")

    data = {
        **base_metadata,
        'definition': 'union_presence',
        'leagues': leagues_data,
    }
    with open(os.path.join(DATA_DIR, 'today_presence_union_by_league_teamweighted.json'), 'w') as f:
        json.dump(data, f, indent=2)

    # =========================================================================
    # 6. Action-Share Presence by League
    # =========================================================================
    print("\n6. Generating today_presence_by_league_teamweighted.json...")
    leagues_data = {}
    for league in LEAGUES:
        heroes, total_weight, total_actions = calc_action_share_presence(league_team_games[league])
        leagues_data[league] = {
            'total_actions_used': total_actions,
            'total_weight_sum': total_weight,
            'heroes': heroes,
        }
        print(f"   - {league}: {len(heroes)} heroes, {total_actions} actions")

    data = {
        **base_metadata,
        'definition': 'action_share_presence',
        'leagues': leagues_data,
    }
    with open(os.path.join(DATA_DIR, 'today_presence_by_league_teamweighted.json'), 'w') as f:
        json.dump(data, f, indent=2)

    # =========================================================================
    # 7. Pick Rate by League
    # =========================================================================
    print("\n7. Generating today_pick_rate_by_league_teamweighted.json...")
    leagues_data = {}
    for league in LEAGUES:
        heroes, total_weight, total_games = calc_pick_rate(league_team_games[league])
        leagues_data[league] = {
            'total_games_used': total_games,
            'total_weight_sum': total_weight,
            'heroes': heroes,
        }
        print(f"   - {league}: {len(heroes)} heroes, {total_games} team-games")

    data = {
        **base_metadata,
        'definition': 'pick_rate',
        'leagues': leagues_data,
    }
    with open(os.path.join(DATA_DIR, 'today_pick_rate_by_league_teamweighted.json'), 'w') as f:
        json.dump(data, f, indent=2)

    # =========================================================================
    # 8. Ban Rate by League
    # =========================================================================
    print("\n8. Generating today_ban_rate_by_league_teamweighted.json...")
    leagues_data = {}
    for league in LEAGUES:
        heroes, total_weight, total_games = calc_ban_rate(league_team_games[league])
        leagues_data[league] = {
            'total_games_used': total_games,
            'total_weight_sum': total_weight,
            'heroes': heroes,
        }
        print(f"   - {league}: {len(heroes)} heroes, {total_games} team-games")

    data = {
        **base_metadata,
        'definition': 'ban_rate',
        'leagues': leagues_data,
    }
    with open(os.path.join(DATA_DIR, 'today_ban_rate_by_league_teamweighted.json'), 'w') as f:
        json.dump(data, f, indent=2)

    print("\n" + "=" * 80)
    print("Phase 6 Complete!")
    print("=" * 80)
    print("\nGenerated files:")
    print("  - today_presence_union_global_teamweighted.json")
    print("  - today_presence_global_teamweighted.json")
    print("  - today_pick_rate_global_teamweighted.json")
    print("  - today_ban_rate_global_teamweighted.json")
    print("  - today_presence_union_by_league_teamweighted.json")
    print("  - today_presence_by_league_teamweighted.json")
    print("  - today_pick_rate_by_league_teamweighted.json")
    print("  - today_ban_rate_by_league_teamweighted.json")

if __name__ == '__main__':
    main()
