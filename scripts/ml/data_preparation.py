#!/usr/bin/env python3
"""
Data Preparation Module for GRID API Data
==========================================
Extracts and prepares training data from GRID API JSON format
"""

import json
import pandas as pd
from pathlib import Path
from typing import Dict, List, Optional
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class GridDataPreparation:
    """Prepare training data from GRID API series data"""

    def __init__(self):
        self.hero_stats = {}  # Aggregated hero statistics

    def load_series_data(self, json_path: str) -> Optional[Dict]:
        """Load a single series JSON file"""
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load {json_path}: {e}")
            return None

    def extract_game_data(self, series_data: Dict) -> List[Dict]:
        """Extract game-level data from series"""
        games_data = []

        for game in series_data.get('games', []):
            if not game.get('finished'):
                continue

            game_info = {
                'game_id': game['id'],
                'sequence_number': game['sequenceNumber'],
                'duration': game.get('duration', ''),
                'draft_actions': game.get('draftActions', []),
                'teams': game.get('teams', [])
            }
            games_data.append(game_info)

        return games_data

    def extract_player_stats(self, game_data: Dict) -> List[Dict]:
        """Extract player statistics from a game"""
        player_stats = []
        game_id = game_data.get('game_id', game_data.get('id', 'unknown'))

        for team in game_data.get('teams', []):
            team_won = team.get('won', False)

            for player in team.get('players', []):
                character = player.get('character', {})
                if not character:
                    continue

                stats = {
                    'game_id': game_id,
                    'player_id': player['id'],
                    'player_name': player['name'],
                    'hero_id': character['id'],
                    'hero_name': character['name'],
                    'team_side': team.get('side', 'unknown'),
                    'won': team_won,

                    # Combat stats
                    'kills': player.get('kills', 0),
                    'deaths': player.get('deaths', 0),
                    'damage_dealt': player.get('damageDealt', 0),
                    'damage_taken': player.get('damageTaken', 0),
                    'damage_percentage': player.get('damagePercentage', 0),
                    'damage_per_minute': player.get('damagePerMinute', 0),
                    'damage_per_money': player.get('damagePerMoney', 0),

                    # Vision stats
                    'vision_score': player.get('visionScore', 0),
                    'vision_score_per_minute': player.get('visionScorePerMinute', 0),

                    # Performance stats
                    'kda_ratio': player.get('kdaRatio', 0),
                    'kill_participation': player.get('killParticipation', 0),
                    'kills_and_assists': player.get('killsAndAssists', 0),

                    # Economy stats
                    'money_percentage': player.get('moneyPercentage', 0),
                    'money_per_minute': player.get('moneyPerMinute', 0),
                    'total_money_earned': player.get('totalMoneyEarned', 0),

                    # Positioning
                    'forward_percentage': player.get('forwardPercentage', 0),
                }

                player_stats.append(stats)

        return player_stats

    def extract_draft_data(self, game_data: Dict) -> Dict[str, List[str]]:
        """Extract ban/pick data from a game"""
        draft_data = {
            'bans': [],
            'picks': []
        }

        for action in game_data.get('draft_actions', []):
            hero_name = action.get('draftable', {}).get('name', '')
            if not hero_name:
                continue

            if action['type'] == 'ban':
                draft_data['bans'].append(hero_name)
            elif action['type'] == 'pick':
                draft_data['picks'].append(hero_name)

        return draft_data

    def aggregate_hero_stats(self, player_stats_list: List[Dict]) -> Dict[str, Dict]:
        """Aggregate statistics for each hero across all games"""
        hero_aggregates = {}

        for stats in player_stats_list:
            hero_name = stats['hero_name']

            if hero_name not in hero_aggregates:
                hero_aggregates[hero_name] = {
                    'games_played': 0,
                    'wins': 0,
                    'total_dpm': 0,
                    'total_damage_pct': 0,
                    'total_forward_pct': 0,
                    'total_kda': 0,
                    'total_kp': 0,
                    'total_dpm_per_gold': 0,
                }

            agg = hero_aggregates[hero_name]
            agg['games_played'] += 1
            agg['wins'] += 1 if stats['won'] else 0
            agg['total_dpm'] += stats['damage_per_minute']
            agg['total_damage_pct'] += stats['damage_percentage']
            agg['total_forward_pct'] += stats['forward_percentage']
            agg['total_kda'] += stats['kda_ratio']
            agg['total_kp'] += stats['kill_participation']
            agg['total_dpm_per_gold'] += stats['damage_per_money']

        # Calculate averages
        for hero_name, agg in hero_aggregates.items():
            games = agg['games_played']
            if games > 0:
                hero_aggregates[hero_name] = {
                    'games_played': games,
                    'win_rate': agg['wins'] / games,
                    'avg_dpm': agg['total_dpm'] / games,
                    'avg_damage_pct': agg['total_damage_pct'] / games,
                    'avg_forward_pct': agg['total_forward_pct'] / games,
                    'avg_kda': agg['total_kda'] / games,
                    'avg_kp': agg['total_kp'] / games,
                    'avg_dpm_per_gold': agg['total_dpm_per_gold'] / games,
                }

        return hero_aggregates

    def process_directory(self, data_dir: str) -> pd.DataFrame:
        """Process all series JSON files in a directory"""
        data_path = Path(data_dir)
        all_player_stats = []

        json_files = list(data_path.glob('series_*.json'))
        logger.info(f"Found {len(json_files)} series files")

        for json_file in json_files:
            series_data = self.load_series_data(str(json_file))
            if not series_data:
                continue

            games_data = self.extract_game_data(series_data)

            for game_data in games_data:
                player_stats = self.extract_player_stats(game_data)
                all_player_stats.extend(player_stats)

        logger.info(f"Extracted {len(all_player_stats)} player game records")

        # Aggregate hero statistics
        self.hero_stats = self.aggregate_hero_stats(all_player_stats)
        logger.info(f"Aggregated stats for {len(self.hero_stats)} heroes")

        return pd.DataFrame(all_player_stats)


def main():
    """Example usage"""
    prep = GridDataPreparation()

    # Process data from grid-data-fetcher directory
    data_dir = "../grid-data-fetcher"
    df = prep.process_directory(data_dir)

    if not df.empty:
        output_path = "player_stats.csv"
        df.to_csv(output_path, index=False)
        logger.info(f"Saved player stats to {output_path}")

        # Save hero aggregates
        hero_df = pd.DataFrame.from_dict(prep.hero_stats, orient='index')
        hero_df.to_csv("hero_aggregates.csv")
        logger.info(f"Saved hero aggregates to hero_aggregates.csv")


if __name__ == "__main__":
    main()
