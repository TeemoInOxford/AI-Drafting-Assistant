#!/usr/bin/env python3
"""
Generate player champion pool statistics files.

Outputs:
- player_pool_global.json
- player_pool_by_league.json
- player_pool_by_team.json
"""

import json
import glob
import os
import math
from datetime import datetime, timezone
from collections import defaultdict

DATA_DIR = '/www/wwwroot/AI-Drafting-Assistant/data/grid_v2'

# Parameters (same as Meta Priority)
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
    """Parse patch version to patch_index"""
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

    available_dates = sorted(scores.keys(), reverse=True)
    for date_key in available_dates:
        if date_key <= game_date:
            return scores[date_key]

    earliest_date = sorted(scores.keys())[0]
    return scores[earliest_date]

def main():
    print("=" * 80)
    print("Generate Player Champion Pool Statistics")
    print("=" * 80)
    print()

    # Load data
    print("Loading data...")
    PATCH_START_DATES = load_patch_start_dates()
    team_scores = load_team_power_scores()
    team_home_league = load_team_home_league_map()

    # Load all series
    series_files = glob.glob(os.path.join(DATA_DIR, 'series_*.json'))
    print(f"  - Series files: {len(series_files)}")

    # Find target patch and collect all player-game records
    target_patch_index = None
    all_player_games = []

    for sf in series_files:
        with open(sf, 'r') as f:
            series = json.load(f)

        series_started_at = series.get('startedAt')

        for game in series.get('games', []):
            title_version = game.get('titleVersion')
            started_at = game.get('startedAt') or series_started_at

            if not title_version or not started_at:
                continue

            patch_index = parse_patch_index(title_version)
            if patch_index is None:
                continue

            if target_patch_index is None or patch_index > target_patch_index:
                target_patch_index = patch_index

            # Get teams from game
            teams = game.get('teams', [])
            if not teams:
                continue

            for team in teams:
                team_id = str(team.get('id', ''))
                team_id = TEAM_ID_MAPPING.get(team_id, team_id)
                if not team_id:
                    continue

                team_won = team.get('won', False)
                team_name = team.get('name', '')

                players = team.get('players', [])
                for player in players:
                    player_id = str(player.get('id', ''))
                    player_name = player.get('name', '')
                    character = player.get('character', {})
                    champion_name = character.get('name') if character else None

                    if not player_id or not champion_name:
                        continue

                    # KDA data
                    kills = player.get('kills', 0) or 0
                    deaths = player.get('deaths', 0) or 0
                    assists = player.get('killAssistsGiven', 0) or 0

                    all_player_games.append({
                        'player_id': player_id,
                        'player_name': player_name,
                        'team_id': team_id,
                        'team_name': team_name,
                        'champion': champion_name,
                        'won': team_won,
                        'kills': kills,
                        'deaths': deaths,
                        'assists': assists,
                        'patch_index': patch_index,
                        'started_at': started_at,
                    })

    target_patch = f"{target_patch_index // 100}.{target_patch_index % 100}"
    print(f"\nTarget patch: {target_patch} (index: {target_patch_index})")
    print(f"Total player-game records: {len(all_player_games)}")

    # Calculate weights for each player-game
    print("\nCalculating weights...")

    # First, collect all team scores for percentile calculation
    all_team_scores_for_percentile = []

    for pg in all_player_games:
        patch_index = pg['patch_index']
        started_at = pg['started_at']
        team_id = pg['team_id']

        delta_patch = target_patch_index - patch_index
        if delta_patch < 0 or patch_index not in PATCH_START_DATES:
            pg['w_final'] = 0
            continue

        # w_patch
        w_patch = BETA ** delta_patch

        # w_day
        patch_start_str = PATCH_START_DATES[patch_index]
        patch_start = datetime.strptime(patch_start_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        game_dt = datetime.fromisoformat(started_at.replace('Z', '+00:00'))
        d = max(0, (game_dt - patch_start).days)
        w_day = 1 - math.exp(-(d + 1) / GAMMA)

        game_date = game_dt.strftime('%Y-%m-%d')
        pg['game_date'] = game_date

        # Get team score
        score = get_team_score(team_id, game_date, team_scores)
        if score is not None:
            all_team_scores_for_percentile.append(score)
            pg['power_score'] = score
        else:
            pg['power_score'] = None

        pg['w_patch'] = w_patch
        pg['w_day'] = w_day

    # Calculate percentiles
    all_scores_sorted = sorted(all_team_scores_for_percentile)
    n_scores = len(all_scores_sorted)

    def get_percentile(score):
        if score is None or n_scores == 0:
            return 0.5
        pos = 0
        for i, s in enumerate(all_scores_sorted):
            if s <= score:
                pos = i + 1
        return pos / n_scores

    # Apply weights
    valid_player_games = []
    for pg in all_player_games:
        if pg.get('w_patch') is None:
            continue

        percentile = get_percentile(pg.get('power_score'))
        w_team = W_MIN + (W_MAX - W_MIN) * percentile
        w_final = pg['w_patch'] * pg['w_day'] * w_team

        pg['w_team'] = w_team
        pg['w_final'] = w_final

        # Get home league
        home_league = team_home_league.get(pg['team_id'], {}).get('home_league', 'OTHER')
        pg['home_league'] = home_league

        valid_player_games.append(pg)

    print(f"Valid player-games with weights: {len(valid_player_games)}")

    # Aggregate statistics by player-champion
    print("\nAggregating statistics...")

    # Structure: player_id -> champion -> stats
    player_champion_stats = defaultdict(lambda: defaultdict(lambda: {
        'games': 0,
        'games_weighted': 0.0,
        'wins': 0,
        'wins_weighted': 0.0,
        'total_kills': 0,
        'total_deaths': 0,
        'total_assists': 0,
        'last_played_at': None,
        'last_played_patch_index': None,  # New field
    }))

    player_info = {}  # player_id -> {name, team_id, team_name, home_league}
    player_teams = defaultdict(set)  # player_id -> set of team_ids
    player_leagues = defaultdict(set)  # player_id -> set of leagues

    for pg in valid_player_games:
        player_id = pg['player_id']
        champion = pg['champion']
        w_final = pg['w_final']

        stats = player_champion_stats[player_id][champion]
        stats['games'] += 1
        stats['games_weighted'] += w_final
        stats['total_kills'] += pg['kills']
        stats['total_deaths'] += pg['deaths']
        stats['total_assists'] += pg['assists']

        if pg['won']:
            stats['wins'] += 1
            stats['wins_weighted'] += w_final

        # Update last_played_at and last_played_patch_index
        game_date = pg.get('game_date')
        game_patch_index = pg.get('patch_index')
        if game_date:
            if stats['last_played_at'] is None or game_date > stats['last_played_at']:
                stats['last_played_at'] = game_date
                stats['last_played_patch_index'] = game_patch_index

        # Track player info
        if player_id not in player_info:
            player_info[player_id] = {
                'name': pg['player_name'],
                'team_id': pg['team_id'],
                'team_name': pg['team_name'],
                'home_league': pg['home_league'],
            }
        else:
            # Update to most recent team
            if pg.get('game_date', '') > player_info[player_id].get('last_game_date', ''):
                player_info[player_id] = {
                    'name': pg['player_name'],
                    'team_id': pg['team_id'],
                    'team_name': pg['team_name'],
                    'home_league': pg['home_league'],
                    'last_game_date': pg.get('game_date'),
                }

        player_teams[player_id].add(pg['team_id'])
        player_leagues[player_id].add(pg['home_league'])

    # Build output structures
    print("\nBuilding output structures...")

    def build_player_output(player_id):
        info = player_info[player_id]
        champions = []

        for champion, stats in player_champion_stats[player_id].items():
            games = stats['games']
            games_weighted = stats['games_weighted']
            wins = stats['wins']
            wins_weighted = stats['wins_weighted']

            win_rate = wins / games if games > 0 else 0
            win_rate_weighted = wins_weighted / games_weighted if games_weighted > 0 else 0

            # Calculate average KDA
            total_games = stats['games']
            avg_kills = stats['total_kills'] / total_games if total_games > 0 else 0
            avg_deaths = stats['total_deaths'] / total_games if total_games > 0 else 0
            avg_assists = stats['total_assists'] / total_games if total_games > 0 else 0

            # KDA ratio (kills + assists) / deaths
            if avg_deaths > 0:
                avg_kda = (avg_kills + avg_assists) / avg_deaths
            else:
                avg_kda = avg_kills + avg_assists  # Perfect KDA

            # Calculate patch distance
            last_patch_idx = stats['last_played_patch_index']
            if last_patch_idx is not None:
                patch_distance = target_patch_index - last_patch_idx
                last_patch_str = f"{last_patch_idx // 100}.{last_patch_idx % 100}"
            else:
                patch_distance = None
                last_patch_str = None

            champions.append({
                'champion': champion,
                'games': games,
                'games_weighted': round(games_weighted, 4),
                'wins': wins,
                'wins_weighted': round(wins_weighted, 4),
                'win_rate': round(win_rate, 4),
                'win_rate_weighted': round(win_rate_weighted, 4),
                'avg_kda': round(avg_kda, 2),
                'last_played_at': stats['last_played_at'],
                'last_played_patch': last_patch_str,
                'last_played_patch_index': last_patch_idx,
                'patch_distance_to_target': patch_distance,
            })

        # Sort by games_weighted descending
        champions.sort(key=lambda x: -x['games_weighted'])

        return {
            'player_id': player_id,
            'player_name': info['name'],
            'team_id': info['team_id'],
            'team_name': info['team_name'],
            'home_league': info['home_league'],
            'total_games': sum(c['games'] for c in champions),
            'total_games_weighted': round(sum(c['games_weighted'] for c in champions), 4),
            'unique_champions': len(champions),
            'champions': champions,
        }

    # =========================================================================
    # 1. Global player pool
    # =========================================================================
    print("\n1. Generating player_pool_global.json...")

    global_players = []
    for player_id in player_champion_stats.keys():
        global_players.append(build_player_output(player_id))

    # Sort by total_games_weighted descending
    global_players.sort(key=lambda x: -x['total_games_weighted'])

    # Calculate global statistics
    total_player_games = sum(p['total_games'] for p in global_players)
    total_player_games_weighted = sum(p['total_games_weighted'] for p in global_players)

    global_output = {
        'target_patch': target_patch,
        'target_patch_index': target_patch_index,
        'generated_at_utc': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'parameters': {
            'beta': BETA,
            'gamma': GAMMA,
            'w_min': W_MIN,
            'w_max': W_MAX,
        },
        'metadata': {
            'total_players': len(global_players),
            'total_player_games': total_player_games,
            'total_player_games_weighted': round(total_player_games_weighted, 2),
            'filter_options': {
                'league': ['LCK', 'LPL', 'LEC', 'LTA_N', 'LTA_S'],
                'patch_range': 'Use w_patch decay (default: all history)',
            },
        },
        'players': global_players,
    }

    with open(os.path.join(DATA_DIR, 'player_pool_global.json'), 'w') as f:
        json.dump(global_output, f, indent=2, ensure_ascii=False)

    print(f"   - {len(global_players)} players, {total_player_games} player-games")

    # =========================================================================
    # 2. By League player pool
    # =========================================================================
    print("\n2. Generating player_pool_by_league.json...")

    leagues = ['LCK', 'LPL', 'LEC', 'LTA_N', 'LTA_S']
    league_data = {}
    league_stats = {}

    for league in leagues:
        # Filter player-games by league
        league_player_games = [pg for pg in valid_player_games if pg['home_league'] == league]

        # Re-aggregate for this league
        league_player_champion = defaultdict(lambda: defaultdict(lambda: {
            'games': 0,
            'games_weighted': 0.0,
            'wins': 0,
            'wins_weighted': 0.0,
            'total_kills': 0,
            'total_deaths': 0,
            'total_assists': 0,
            'last_played_at': None,
            'last_played_patch_index': None,
        }))

        league_player_info = {}

        for pg in league_player_games:
            player_id = pg['player_id']
            champion = pg['champion']
            w_final = pg['w_final']

            stats = league_player_champion[player_id][champion]
            stats['games'] += 1
            stats['games_weighted'] += w_final
            stats['total_kills'] += pg['kills']
            stats['total_deaths'] += pg['deaths']
            stats['total_assists'] += pg['assists']

            if pg['won']:
                stats['wins'] += 1
                stats['wins_weighted'] += w_final

            game_date = pg.get('game_date')
            game_patch_index = pg.get('patch_index')
            if game_date:
                if stats['last_played_at'] is None or game_date > stats['last_played_at']:
                    stats['last_played_at'] = game_date
                    stats['last_played_patch_index'] = game_patch_index

            if player_id not in league_player_info:
                league_player_info[player_id] = {
                    'name': pg['player_name'],
                    'team_id': pg['team_id'],
                    'team_name': pg['team_name'],
                    'home_league': pg['home_league'],
                }

        # Build league players output
        league_players = []
        for player_id in league_player_champion.keys():
            info = league_player_info[player_id]
            champions = []

            for champion, stats in league_player_champion[player_id].items():
                games = stats['games']
                games_weighted = stats['games_weighted']
                wins = stats['wins']
                wins_weighted = stats['wins_weighted']

                win_rate = wins / games if games > 0 else 0
                win_rate_weighted = wins_weighted / games_weighted if games_weighted > 0 else 0

                total_games = stats['games']
                avg_kills = stats['total_kills'] / total_games if total_games > 0 else 0
                avg_deaths = stats['total_deaths'] / total_games if total_games > 0 else 0
                avg_assists = stats['total_assists'] / total_games if total_games > 0 else 0

                if avg_deaths > 0:
                    avg_kda = (avg_kills + avg_assists) / avg_deaths
                else:
                    avg_kda = avg_kills + avg_assists

                # Calculate patch distance
                last_patch_idx = stats['last_played_patch_index']
                if last_patch_idx is not None:
                    patch_distance = target_patch_index - last_patch_idx
                    last_patch_str = f"{last_patch_idx // 100}.{last_patch_idx % 100}"
                else:
                    patch_distance = None
                    last_patch_str = None

                champions.append({
                    'champion': champion,
                    'games': games,
                    'games_weighted': round(games_weighted, 4),
                    'wins': wins,
                    'wins_weighted': round(wins_weighted, 4),
                    'win_rate': round(win_rate, 4),
                    'win_rate_weighted': round(win_rate_weighted, 4),
                    'avg_kda': round(avg_kda, 2),
                    'last_played_at': stats['last_played_at'],
                    'last_played_patch': last_patch_str,
                    'last_played_patch_index': last_patch_idx,
                    'patch_distance_to_target': patch_distance,
                })

            champions.sort(key=lambda x: -x['games_weighted'])

            league_players.append({
                'player_id': player_id,
                'player_name': info['name'],
                'team_id': info['team_id'],
                'team_name': info['team_name'],
                'total_games': sum(c['games'] for c in champions),
                'total_games_weighted': round(sum(c['games_weighted'] for c in champions), 4),
                'unique_champions': len(champions),
                'champions': champions,
            })

        league_players.sort(key=lambda x: -x['total_games_weighted'])

        total_pg = sum(p['total_games'] for p in league_players)
        league_data[league] = {
            'total_players': len(league_players),
            'total_player_games': total_pg,
            'players': league_players,
        }
        league_stats[league] = {'players': len(league_players), 'player_games': total_pg}
        print(f"   - {league}: {len(league_players)} players, {total_pg} player-games")

    by_league_output = {
        'target_patch': target_patch,
        'target_patch_index': target_patch_index,
        'generated_at_utc': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'parameters': {
            'beta': BETA,
            'gamma': GAMMA,
            'w_min': W_MIN,
            'w_max': W_MAX,
        },
        'leagues': league_data,
    }

    with open(os.path.join(DATA_DIR, 'player_pool_by_league.json'), 'w') as f:
        json.dump(by_league_output, f, indent=2, ensure_ascii=False)

    # =========================================================================
    # 3. By Team player pool
    # =========================================================================
    print("\n3. Generating player_pool_by_team.json...")

    # Group by team
    team_player_games = defaultdict(list)
    for pg in valid_player_games:
        team_player_games[pg['team_id']].append(pg)

    team_data = {}

    for team_id, pgs in team_player_games.items():
        # Re-aggregate for this team
        team_player_champion = defaultdict(lambda: defaultdict(lambda: {
            'games': 0,
            'games_weighted': 0.0,
            'wins': 0,
            'wins_weighted': 0.0,
            'total_kills': 0,
            'total_deaths': 0,
            'total_assists': 0,
            'last_played_at': None,
            'last_played_patch_index': None,
        }))

        team_player_info = {}
        team_name = ''

        for pg in pgs:
            player_id = pg['player_id']
            champion = pg['champion']
            w_final = pg['w_final']
            team_name = pg['team_name']

            stats = team_player_champion[player_id][champion]
            stats['games'] += 1
            stats['games_weighted'] += w_final
            stats['total_kills'] += pg['kills']
            stats['total_deaths'] += pg['deaths']
            stats['total_assists'] += pg['assists']

            if pg['won']:
                stats['wins'] += 1
                stats['wins_weighted'] += w_final

            game_date = pg.get('game_date')
            game_patch_index = pg.get('patch_index')
            if game_date:
                if stats['last_played_at'] is None or game_date > stats['last_played_at']:
                    stats['last_played_at'] = game_date
                    stats['last_played_patch_index'] = game_patch_index

            if player_id not in team_player_info:
                team_player_info[player_id] = {
                    'name': pg['player_name'],
                }

        # Build team players output
        team_players = []
        for player_id in team_player_champion.keys():
            info = team_player_info[player_id]
            champions = []

            for champion, stats in team_player_champion[player_id].items():
                games = stats['games']
                games_weighted = stats['games_weighted']
                wins = stats['wins']
                wins_weighted = stats['wins_weighted']

                win_rate = wins / games if games > 0 else 0
                win_rate_weighted = wins_weighted / games_weighted if games_weighted > 0 else 0

                total_games = stats['games']
                avg_kills = stats['total_kills'] / total_games if total_games > 0 else 0
                avg_deaths = stats['total_deaths'] / total_games if total_games > 0 else 0
                avg_assists = stats['total_assists'] / total_games if total_games > 0 else 0

                if avg_deaths > 0:
                    avg_kda = (avg_kills + avg_assists) / avg_deaths
                else:
                    avg_kda = avg_kills + avg_assists

                # Calculate patch distance
                last_patch_idx = stats['last_played_patch_index']
                if last_patch_idx is not None:
                    patch_distance = target_patch_index - last_patch_idx
                    last_patch_str = f"{last_patch_idx // 100}.{last_patch_idx % 100}"
                else:
                    patch_distance = None
                    last_patch_str = None

                champions.append({
                    'champion': champion,
                    'games': games,
                    'games_weighted': round(games_weighted, 4),
                    'wins': wins,
                    'wins_weighted': round(wins_weighted, 4),
                    'win_rate': round(win_rate, 4),
                    'win_rate_weighted': round(win_rate_weighted, 4),
                    'avg_kda': round(avg_kda, 2),
                    'last_played_at': stats['last_played_at'],
                    'last_played_patch': last_patch_str,
                    'last_played_patch_index': last_patch_idx,
                    'patch_distance_to_target': patch_distance,
                })

            champions.sort(key=lambda x: -x['games_weighted'])

            team_players.append({
                'player_id': player_id,
                'player_name': info['name'],
                'total_games': sum(c['games'] for c in champions),
                'total_games_weighted': round(sum(c['games_weighted'] for c in champions), 4),
                'unique_champions': len(champions),
                'champions': champions,
            })

        team_players.sort(key=lambda x: -x['total_games_weighted'])

        home_league = team_home_league.get(team_id, {}).get('home_league', 'OTHER')

        team_data[team_id] = {
            'team_name': team_name,
            'home_league': home_league,
            'total_players': len(team_players),
            'total_player_games': sum(p['total_games'] for p in team_players),
            'players': team_players,
        }

    by_team_output = {
        'target_patch': target_patch,
        'target_patch_index': target_patch_index,
        'generated_at_utc': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'parameters': {
            'beta': BETA,
            'gamma': GAMMA,
            'w_min': W_MIN,
            'w_max': W_MAX,
        },
        'teams': team_data,
    }

    with open(os.path.join(DATA_DIR, 'player_pool_by_team.json'), 'w') as f:
        json.dump(by_team_output, f, indent=2, ensure_ascii=False)

    print(f"   - {len(team_data)} teams")

    # =========================================================================
    # Summary
    # =========================================================================
    print("\n" + "=" * 80)
    print("Summary")
    print("=" * 80)
    print()
    print(f"Total Players: {len(global_players)}")
    print(f"Total Player-Games: {total_player_games}")
    print()
    print("By League:")
    for league, stats in league_stats.items():
        print(f"  {league}: {stats['players']} players, {stats['player_games']} player-games")
    print()

    # Sanity check: Print 3 sample players
    print("=" * 80)
    print("Sanity Check: Sample Players (Top 10 Champions)")
    print("=" * 80)

    # Pick 3 players from different leagues
    sample_players = []
    for league in ['LCK', 'LPL', 'LEC']:
        league_players = [p for p in global_players if p['home_league'] == league]
        if league_players:
            # Pick the player with most games
            sample_players.append(league_players[0])

    for player in sample_players[:3]:
        print()
        print(f"Player: {player['player_name']} ({player['team_name']}, {player['home_league']})")
        print(f"Total Games: {player['total_games']}, Weighted: {player['total_games_weighted']:.2f}")
        print(f"Unique Champions: {player['unique_champions']}")
        print()
        print(f"{'Rank':<5} {'Champion':<15} {'Games':>7} {'W':>5} {'WR':>8} {'WR_w':>8} {'KDA':>7} {'Patch':>8} {'Dist':>5} {'Flag'}")
        print("-" * 95)

        for i, champ in enumerate(player['champions'][:10], 1):
            patch_str = champ.get('last_played_patch', 'N/A') or 'N/A'
            dist = champ.get('patch_distance_to_target')
            dist_str = str(dist) if dist is not None else 'N/A'
            flag = "⚠ STALE" if dist is not None and dist >= 2 else ""
            print(f"{i:<5} {champ['champion']:<15} {champ['games']:>7} {champ['wins']:>5} "
                  f"{champ['win_rate']*100:>7.1f}% {champ['win_rate_weighted']*100:>7.1f}% "
                  f"{champ['avg_kda']:>7.2f} {patch_str:>8} {dist_str:>5} {flag}")

    # Additional sanity check: 20 sample champion records with patch distance
    print()
    print("=" * 80)
    print("Patch Distance Sanity Check: 20 Sample Champion Records")
    print("=" * 80)
    print(f"Target Patch: {target_patch} (index: {target_patch_index})")
    print()
    print(f"{'Player':<20} {'Champion':<15} {'LastPlayed':<12} {'Patch':<8} {'Dist':>5} {'Flag'}")
    print("-" * 80)

    sample_count = 0
    for player in global_players:
        for champ in player['champions']:
            if sample_count >= 20:
                break
            patch_str = champ.get('last_played_patch', 'N/A') or 'N/A'
            dist = champ.get('patch_distance_to_target')
            dist_str = str(dist) if dist is not None else 'N/A'
            flag = "⚠ 2+" if dist is not None and dist >= 2 else "OK"
            print(f"{player['player_name']:<20} {champ['champion']:<15} {champ['last_played_at'] or 'N/A':<12} "
                  f"{patch_str:<8} {dist_str:>5} {flag}")
            sample_count += 1
        if sample_count >= 20:
            break

    print()
    print("=" * 80)
    print("Generation Complete!")
    print("=" * 80)
    print("\nGenerated files:")
    print("  - player_pool_global.json")
    print("  - player_pool_by_league.json")
    print("  - player_pool_by_team.json")

if __name__ == '__main__':
    main()
