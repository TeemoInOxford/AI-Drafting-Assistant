#!/usr/bin/env python3
"""
Generate player champion pool statistics files (Career Pool - no patch decay).

Outputs:
- player_pool_career_global.json
- player_pool_career_by_league.json
- player_pool_career_by_team.json

No weighted metrics - raw historical data only.
"""

import json
import glob
import os
from datetime import datetime, timezone
from collections import defaultdict

DATA_DIR = '/www/wwwroot/AI-Drafting-Assistant/data/grid_v2'

# Team ID mapping
TEAM_ID_MAPPING = {
    '48610': '47757',  # TBD-1 -> LEVIATÁN
}

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

def main():
    print("=" * 80)
    print("Generate Player Champion Pool Statistics (Career Pool)")
    print("=" * 80)
    print()

    # Load data
    print("Loading data...")
    team_home_league = load_team_home_league_map()

    # Load all series
    series_files = glob.glob(os.path.join(DATA_DIR, 'series_*.json'))
    print(f"  - Series files: {len(series_files)}")

    # Find target patch, latest game date, and collect all player-game records
    target_patch_index = None
    latest_game_date = None
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

            # Parse game date
            game_dt = datetime.fromisoformat(started_at.replace('Z', '+00:00'))
            game_date = game_dt.strftime('%Y-%m-%d')

            # Track latest game date in dataset
            if latest_game_date is None or game_date > latest_game_date:
                latest_game_date = game_date

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

                    # Get home league
                    home_league = team_home_league.get(team_id, {}).get('home_league', 'OTHER')

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
                        'game_date': game_date,
                        'home_league': home_league,
                    })

    target_patch = f"{target_patch_index // 100}.{target_patch_index % 100}"
    print(f"\nTarget patch: {target_patch} (index: {target_patch_index})")
    print(f"Latest game date in dataset: {latest_game_date}")
    print(f"Total player-game records: {len(all_player_games)}")

    # Parse latest_game_date for days calculation
    latest_dt = datetime.strptime(latest_game_date, '%Y-%m-%d')

    # Aggregate statistics by player-champion (no weighting)
    print("\nAggregating statistics (raw, no weighting)...")

    # Structure: player_id -> champion -> stats
    player_champion_stats = defaultdict(lambda: defaultdict(lambda: {
        'games': 0,
        'wins': 0,
        'total_kills': 0,
        'total_deaths': 0,
        'total_assists': 0,
        'last_played_at': None,
        'last_played_patch_index': None,
    }))

    player_info = {}  # player_id -> {name, team_id, team_name, home_league}
    player_teams = defaultdict(set)  # player_id -> set of team_ids
    player_leagues = defaultdict(set)  # player_id -> set of leagues

    for pg in all_player_games:
        player_id = pg['player_id']
        champion = pg['champion']

        stats = player_champion_stats[player_id][champion]
        stats['games'] += 1
        stats['total_kills'] += pg['kills']
        stats['total_deaths'] += pg['deaths']
        stats['total_assists'] += pg['assists']

        if pg['won']:
            stats['wins'] += 1

        # Update last_played_at and last_played_patch_index
        game_date = pg['game_date']
        game_patch_index = pg['patch_index']
        if stats['last_played_at'] is None or game_date > stats['last_played_at']:
            stats['last_played_at'] = game_date
            stats['last_played_patch_index'] = game_patch_index

        # Track player info (use most recent game's info)
        if player_id not in player_info:
            player_info[player_id] = {
                'name': pg['player_name'],
                'team_id': pg['team_id'],
                'team_name': pg['team_name'],
                'home_league': pg['home_league'],
                'last_game_date': game_date,
            }
        else:
            if game_date > player_info[player_id].get('last_game_date', ''):
                player_info[player_id] = {
                    'name': pg['player_name'],
                    'team_id': pg['team_id'],
                    'team_name': pg['team_name'],
                    'home_league': pg['home_league'],
                    'last_game_date': game_date,
                }

        player_teams[player_id].add(pg['team_id'])
        player_leagues[player_id].add(pg['home_league'])

    # Build output structures
    print("\nBuilding output structures...")

    def build_champion_output(stats, target_patch_index, latest_dt):
        """Build champion output dict"""
        games = stats['games']
        wins = stats['wins']
        win_rate = wins / games if games > 0 else 0

        # Calculate average KDA
        avg_kills = stats['total_kills'] / games if games > 0 else 0
        avg_deaths = stats['total_deaths'] / games if games > 0 else 0
        avg_assists = stats['total_assists'] / games if games > 0 else 0

        # KDA ratio
        if avg_deaths > 0:
            avg_kda = (avg_kills + avg_assists) / avg_deaths
        else:
            avg_kda = avg_kills + avg_assists

        # Patch distance
        last_patch_idx = stats['last_played_patch_index']
        if last_patch_idx is not None:
            patch_distance = target_patch_index - last_patch_idx
            last_patch_str = f"{last_patch_idx // 100}.{last_patch_idx % 100}"
        else:
            patch_distance = None
            last_patch_str = None

        # Days since last played (from dataset's latest_game_date)
        last_played_at = stats['last_played_at']
        if last_played_at:
            last_played_dt = datetime.strptime(last_played_at, '%Y-%m-%d')
            days_since = (latest_dt - last_played_dt).days
        else:
            days_since = None

        return {
            'games': games,
            'wins': wins,
            'win_rate': round(win_rate, 4),
            'avg_kda': round(avg_kda, 2),
            'last_played_at': last_played_at,
            'last_played_patch': last_patch_str,
            'last_played_patch_index': last_patch_idx,
            'patch_distance_to_target': patch_distance,
            'days_since_last_played': days_since,
        }

    def build_player_output(player_id, player_champion_stats, player_info, target_patch_index, latest_dt):
        info = player_info[player_id]
        champions = []

        for champion, stats in player_champion_stats[player_id].items():
            champ_data = build_champion_output(stats, target_patch_index, latest_dt)
            champ_data['champion'] = champion
            champions.append(champ_data)

        # Sort by games descending (default for career view)
        champions.sort(key=lambda x: -x['games'])

        return {
            'player_id': player_id,
            'player_name': info['name'],
            'team_id': info['team_id'],
            'team_name': info['team_name'],
            'home_league': info['home_league'],
            'total_games': sum(c['games'] for c in champions),
            'unique_champions': len(champions),
            'champions': champions,
        }

    # =========================================================================
    # 1. Global player pool
    # =========================================================================
    print("\n1. Generating player_pool_career_global.json...")

    global_players = []
    for player_id in player_champion_stats.keys():
        global_players.append(build_player_output(
            player_id, player_champion_stats, player_info, target_patch_index, latest_dt
        ))

    # Sort by total_games descending
    global_players.sort(key=lambda x: -x['total_games'])

    total_player_games = sum(p['total_games'] for p in global_players)

    global_output = {
        'target_patch': target_patch,
        'target_patch_index': target_patch_index,
        'latest_game_date': latest_game_date,
        'generated_at_utc': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'metadata': {
            'total_players': len(global_players),
            'total_player_games': total_player_games,
            'filter_options': {
                'league': ['LCK', 'LPL', 'LEC', 'LTA_N', 'LTA_S'],
            },
        },
        'players': global_players,
    }

    with open(os.path.join(DATA_DIR, 'player_pool_career_global.json'), 'w') as f:
        json.dump(global_output, f, indent=2, ensure_ascii=False)

    print(f"   - {len(global_players)} players, {total_player_games} player-games")

    # =========================================================================
    # 2. By League player pool
    # =========================================================================
    print("\n2. Generating player_pool_career_by_league.json...")

    leagues = ['LCK', 'LPL', 'LEC', 'LTA_N', 'LTA_S']
    league_data = {}
    league_stats = {}

    for league in leagues:
        # Filter player-games by league
        league_player_games = [pg for pg in all_player_games if pg['home_league'] == league]

        # Re-aggregate for this league
        league_player_champion = defaultdict(lambda: defaultdict(lambda: {
            'games': 0,
            'wins': 0,
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

            stats = league_player_champion[player_id][champion]
            stats['games'] += 1
            stats['total_kills'] += pg['kills']
            stats['total_deaths'] += pg['deaths']
            stats['total_assists'] += pg['assists']

            if pg['won']:
                stats['wins'] += 1

            game_date = pg['game_date']
            game_patch_index = pg['patch_index']
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
                champ_data = build_champion_output(stats, target_patch_index, latest_dt)
                champ_data['champion'] = champion
                champions.append(champ_data)

            champions.sort(key=lambda x: -x['games'])

            league_players.append({
                'player_id': player_id,
                'player_name': info['name'],
                'team_id': info['team_id'],
                'team_name': info['team_name'],
                'total_games': sum(c['games'] for c in champions),
                'unique_champions': len(champions),
                'champions': champions,
            })

        league_players.sort(key=lambda x: -x['total_games'])

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
        'latest_game_date': latest_game_date,
        'generated_at_utc': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'leagues': league_data,
    }

    with open(os.path.join(DATA_DIR, 'player_pool_career_by_league.json'), 'w') as f:
        json.dump(by_league_output, f, indent=2, ensure_ascii=False)

    # =========================================================================
    # 3. By Team player pool
    # =========================================================================
    print("\n3. Generating player_pool_career_by_team.json...")

    # Group by team
    team_player_games = defaultdict(list)
    for pg in all_player_games:
        team_player_games[pg['team_id']].append(pg)

    team_data = {}

    for team_id, pgs in team_player_games.items():
        # Re-aggregate for this team
        team_player_champion = defaultdict(lambda: defaultdict(lambda: {
            'games': 0,
            'wins': 0,
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
            team_name = pg['team_name']

            stats = team_player_champion[player_id][champion]
            stats['games'] += 1
            stats['total_kills'] += pg['kills']
            stats['total_deaths'] += pg['deaths']
            stats['total_assists'] += pg['assists']

            if pg['won']:
                stats['wins'] += 1

            game_date = pg['game_date']
            game_patch_index = pg['patch_index']
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
                champ_data = build_champion_output(stats, target_patch_index, latest_dt)
                champ_data['champion'] = champion
                champions.append(champ_data)

            champions.sort(key=lambda x: -x['games'])

            team_players.append({
                'player_id': player_id,
                'player_name': info['name'],
                'total_games': sum(c['games'] for c in champions),
                'unique_champions': len(champions),
                'champions': champions,
            })

        team_players.sort(key=lambda x: -x['total_games'])

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
        'latest_game_date': latest_game_date,
        'generated_at_utc': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'teams': team_data,
    }

    with open(os.path.join(DATA_DIR, 'player_pool_career_by_team.json'), 'w') as f:
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
    print(f"Target Patch: {target_patch}")
    print(f"Latest Game Date: {latest_game_date}")
    print()
    print("By League:")
    for league, stats in league_stats.items():
        print(f"  {league}: {stats['players']} players, {stats['player_games']} player-games")
    print()

    # Sanity check: Random 10 samples
    print("=" * 80)
    print("Sanity Check: 10 Random Champion Records")
    print("=" * 80)
    print(f"Target Patch: {target_patch} | Latest Game Date: {latest_game_date}")
    print()
    print(f"{'Player':<18} {'Champion':<14} {'Games':>6} {'WR':>7} {'KDA':>6} {'Patch':<7} {'Dist':>5} {'Days':>5} {'Flag'}")
    print("-" * 95)

    import random
    sample_records = []
    for player in global_players:
        for champ in player['champions']:
            sample_records.append((player, champ))

    random.seed(42)  # Reproducible
    samples = random.sample(sample_records, min(10, len(sample_records)))

    for player, champ in samples:
        patch_str = champ.get('last_played_patch', 'N/A') or 'N/A'
        dist = champ.get('patch_distance_to_target')
        dist_str = str(dist) if dist is not None else 'N/A'
        days = champ.get('days_since_last_played')
        days_str = str(days) if days is not None else 'N/A'
        flag = "2+ patches" if dist is not None and dist >= 2 else ""
        print(f"{player['player_name']:<18} {champ['champion']:<14} {champ['games']:>6} "
              f"{champ['win_rate']*100:>6.1f}% {champ['avg_kda']:>6.2f} {patch_str:<7} {dist_str:>5} {days_str:>5} {flag}")

    print()
    print("=" * 80)
    print("Generation Complete!")
    print("=" * 80)
    print("\nGenerated files:")
    print("  - player_pool_career_global.json")
    print("  - player_pool_career_by_league.json")
    print("  - player_pool_career_by_team.json")

if __name__ == '__main__':
    main()
