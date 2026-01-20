#!/usr/bin/env python3
"""
Build hierarchical index structure for LOL data
Region -> League -> Team -> Player
"""

import json
import os
import re
from collections import defaultdict
from datetime import datetime

DATA_DIR = '/www/wwwroot/AI-Drafting-Assistant/data/lol'

# Region mapping based on tournament name prefix
REGION_MAPPING = {
    'LCK': {
        'id': 'LCK',
        'name': 'Korea',
        'shortName': 'KR',
    },
    'LPL': {
        'id': 'LPL',
        'name': 'China',
        'shortName': 'CN',
    },
    'LEC': {
        'id': 'LEC',
        'name': 'Europe',
        'shortName': 'EU',
    },
    'LCS': {
        'id': 'LCS',
        'name': 'North America',
        'shortName': 'NA',
    },
    'LTA North': {
        'id': 'LTA_NORTH',
        'name': 'Latin America North',
        'shortName': 'LAN',
    },
    'LTA South': {
        'id': 'LTA_SOUTH',
        'name': 'Latin America South',
        'shortName': 'LAS',
    },
    'LTA Cross-Conference': {
        'id': 'LTA_CROSS',
        'name': 'Latin America',
        'shortName': 'LATAM',
    },
    'Worlds': {
        'id': 'WORLDS',
        'name': 'World Championship',
        'shortName': 'WC',
    },
    'MSI': {
        'id': 'MSI',
        'name': 'Mid-Season Invitational',
        'shortName': 'MSI',
    },
}


def get_region_for_tournament(tournament_name):
    """Determine which region a tournament belongs to"""
    for prefix, region in REGION_MAPPING.items():
        if tournament_name.startswith(prefix):
            return region
    return {
        'id': 'OTHER',
        'name': 'Other',
        'shortName': 'OTH',
    }


def extract_league_name(tournament_name):
    """Extract the main league name from tournament full name"""
    # Pattern: "LCK - Split 3 2025 (Groups: Legend Group)"
    # We want: "LCK - Split 3 2025"
    match = re.match(r'^([^(]+)', tournament_name)
    if match:
        return match.group(1).strip()
    return tournament_name


def extract_split_info(tournament_name):
    """Extract split/season info from tournament name"""
    # Look for patterns like "Spring 2024", "Split 1 2025", "Summer 2024"
    patterns = [
        r'(Split \d+ \d{4})',
        r'(Spring \d{4})',
        r'(Summer \d{4})',
        r'(Winter \d{4})',
        r'(Season Finals \d{4})',
        r'(LCK Cup \d{4})',
        r'(Regional Qualifier \d{4})',
        r'(Regional Championship \d{4})',
    ]
    for pattern in patterns:
        match = re.search(pattern, tournament_name)
        if match:
            return match.group(1)
    return None


def build_hierarchy():
    """Build the complete hierarchical structure"""

    # Load existing data
    print("Loading data...")
    with open(os.path.join(DATA_DIR, 'index.json'), 'r') as f:
        index_data = json.load(f)

    with open(os.path.join(DATA_DIR, 'states.json'), 'r') as f:
        states_data = json.load(f)

    with open(os.path.join(DATA_DIR, 'series.json'), 'r') as f:
        series_data = json.load(f)

    tournaments = index_data.get('tournaments', {})
    players_index = index_data.get('players', {})

    print(f"  Tournaments: {len(tournaments)}")
    print(f"  States: {len(states_data)}")
    print(f"  Series: {len(series_data)}")
    print(f"  Players: {len(players_index)}")

    # Build region -> league -> tournament structure
    regions = {}

    for tid, t_data in tournaments.items():
        t_name = t_data.get('name', '')
        region_info = get_region_for_tournament(t_name)
        region_id = region_info['id']

        if region_id not in regions:
            regions[region_id] = {
                'id': region_id,
                'name': region_info['name'],
                'shortName': region_info['shortName'],
                'leagues': {},
                'teams': {},
                'players': {},
            }

        # Extract league name (e.g., "LCK - Split 3 2025")
        league_name = extract_league_name(t_name)

        if league_name not in regions[region_id]['leagues']:
            regions[region_id]['leagues'][league_name] = {
                'name': league_name,
                'split': extract_split_info(t_name),
                'tournaments': {},
                'teams': set(),
            }

        # Add tournament to league
        regions[region_id]['leagues'][league_name]['tournaments'][tid] = {
            'id': tid,
            'name': t_name,
            'count': t_data.get('count', 0),
            'seriesIds': t_data.get('seriesIds', []),
        }

    # Build team -> player relationships from states data
    print("\nBuilding team-player relationships...")

    team_players = defaultdict(lambda: {
        'info': None,
        'players': {},
        'leagues': set(),
        'seriesIds': set(),
    })

    player_info = {}

    for series_id, state in states_data.items():
        # Find which tournament this series belongs to
        tournament_id = None
        tournament_name = None
        for tid, t_data in tournaments.items():
            if series_id in t_data.get('seriesIds', []):
                tournament_id = tid
                tournament_name = t_data.get('name', '')
                break

        league_name = extract_league_name(tournament_name) if tournament_name else None

        for team in state.get('teams', []):
            team_id = str(team.get('id', ''))
            team_name = team.get('name', '')

            if not team_id:
                continue

            # Update team info
            if team_players[team_id]['info'] is None:
                team_players[team_id]['info'] = {
                    'id': team_id,
                    'name': team_name,
                }

            if league_name:
                team_players[team_id]['leagues'].add(league_name)

            team_players[team_id]['seriesIds'].add(series_id)

            # Add players
            for player in team.get('players', []):
                player_id = str(player.get('id', ''))
                player_name = player.get('name', '')

                if not player_id:
                    continue

                team_players[team_id]['players'][player_id] = player_name

                if player_id not in player_info:
                    player_info[player_id] = {
                        'id': player_id,
                        'name': player_name,
                        'teams': set(),
                        'seriesCount': 0,
                    }

                player_info[player_id]['teams'].add(team_id)

    # Update player series counts from index
    for pid, p_data in players_index.items():
        if pid in player_info:
            player_info[pid]['seriesCount'] = p_data.get('count', 0)

    # Associate teams and players with regions
    print("\nAssociating teams with regions...")

    for team_id, team_data in team_players.items():
        for league_name in team_data['leagues']:
            # Find which region this league belongs to
            for region_id, region_data in regions.items():
                if league_name in region_data['leagues']:
                    # Add team to region
                    if team_id not in region_data['teams']:
                        region_data['teams'][team_id] = {
                            'id': team_id,
                            'name': team_data['info']['name'] if team_data['info'] else 'Unknown',
                            'players': list(team_data['players'].keys()),
                            'seriesCount': len(team_data['seriesIds']),
                        }

                    # Add team to league
                    region_data['leagues'][league_name]['teams'].add(team_id)

                    # Add players to region
                    for pid in team_data['players'].keys():
                        if pid not in region_data['players'] and pid in player_info:
                            region_data['players'][pid] = {
                                'id': pid,
                                'name': player_info[pid]['name'],
                                'teamId': team_id,
                                'seriesCount': player_info[pid]['seriesCount'],
                            }

    # Convert sets to lists for JSON serialization
    print("\nPreparing output...")

    output = {
        'updatedAt': datetime.utcnow().isoformat() + 'Z',
        'stats': {
            'totalRegions': len(regions),
            'totalLeagues': sum(len(r['leagues']) for r in regions.values()),
            'totalTeams': len(team_players),
            'totalPlayers': len(player_info),
            'totalSeries': len(states_data),
        },
        'regions': {},
        'teams': {},
        'players': {},
    }

    for region_id, region_data in regions.items():
        output['regions'][region_id] = {
            'id': region_data['id'],
            'name': region_data['name'],
            'shortName': region_data['shortName'],
            'stats': {
                'leagues': len(region_data['leagues']),
                'teams': len(region_data['teams']),
                'players': len(region_data['players']),
            },
            'leagues': {},
        }

        for league_name, league_data in region_data['leagues'].items():
            output['regions'][region_id]['leagues'][league_name] = {
                'name': league_data['name'],
                'split': league_data['split'],
                'teams': list(league_data['teams']),
                'tournamentCount': len(league_data['tournaments']),
                'tournaments': league_data['tournaments'],
            }

    # Build global teams index
    for team_id, team_data in team_players.items():
        if team_data['info']:
            output['teams'][team_id] = {
                'id': team_id,
                'name': team_data['info']['name'],
                'players': team_data['players'],  # {player_id: player_name}
                'leagues': list(team_data['leagues']),
                'seriesCount': len(team_data['seriesIds']),
            }

    # Build global players index
    for pid, p_data in player_info.items():
        output['players'][pid] = {
            'id': pid,
            'name': p_data['name'],
            'teams': list(p_data['teams']),
            'seriesCount': p_data['seriesCount'],
        }

    return output


def main():
    print("=" * 50)
    print("Building Hierarchical LOL Data Index")
    print("=" * 50 + "\n")

    hierarchy = build_hierarchy()

    # Save new index
    output_path = os.path.join(DATA_DIR, 'hierarchy.json')
    print(f"\nSaving to {output_path}...")

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(hierarchy, f, ensure_ascii=False, indent=2)

    # Print summary
    print("\n" + "=" * 50)
    print("Summary")
    print("=" * 50)
    print(f"Regions: {hierarchy['stats']['totalRegions']}")
    print(f"Leagues: {hierarchy['stats']['totalLeagues']}")
    print(f"Teams: {hierarchy['stats']['totalTeams']}")
    print(f"Players: {hierarchy['stats']['totalPlayers']}")
    print(f"Series: {hierarchy['stats']['totalSeries']}")

    print("\nRegion breakdown:")
    for rid, r_data in hierarchy['regions'].items():
        print(f"  {r_data['name']} ({r_data['shortName']}): {r_data['stats']['leagues']} leagues, {r_data['stats']['teams']} teams, {r_data['stats']['players']} players")


if __name__ == '__main__':
    main()
