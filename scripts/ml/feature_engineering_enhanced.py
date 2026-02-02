#!/usr/bin/env python3
"""
Enhanced Feature Engineering Module
====================================
Optimized version with more features for better model performance
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional
import logging
from hero_database import get_hero_role, get_hero_tags, has_tag, count_role_in_team, count_tag_in_team

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class EnhancedFeatureEngineering:
    """Enhanced feature engineering with hero roles, matchups, and composition analysis"""

    def __init__(self, hero_stats: pd.DataFrame, player_stats: pd.DataFrame):
        self.hero_stats = hero_stats
        self.player_stats = player_stats
        self.hero_matchups = self._build_matchup_matrix()

    def _build_matchup_matrix(self) -> Dict:
        """Build hero vs hero matchup win rates"""
        matchups = {}

        # Group by game to get matchups
        for game_id in self.player_stats['game_id'].unique():
            game_data = self.player_stats[self.player_stats['game_id'] == game_id]

            blue_team = game_data[game_data['team_side'] == 'blue']
            red_team = game_data[game_data['team_side'] == 'red']

            blue_won = blue_team['won'].iloc[0] if len(blue_team) > 0 else False

            # Record all matchups
            for _, blue_player in blue_team.iterrows():
                for _, red_player in red_team.iterrows():
                    blue_hero = blue_player['hero_name']
                    red_hero = red_player['hero_name']

                    key = f"{blue_hero}_vs_{red_hero}"
                    if key not in matchups:
                        matchups[key] = {'wins': 0, 'games': 0}

                    matchups[key]['games'] += 1
                    if blue_won:
                        matchups[key]['wins'] += 1

        # Calculate win rates
        for key in matchups:
            games = matchups[key]['games']
            if games > 0:
                matchups[key]['win_rate'] = matchups[key]['wins'] / games
            else:
                matchups[key]['win_rate'] = 0.5

        return matchups

    def get_matchup_win_rate(self, hero_a: str, hero_b: str) -> float:
        """Get win rate of hero_a vs hero_b"""
        key = f"{hero_a}_vs_{hero_b}"
        if key in self.hero_matchups:
            return self.hero_matchups[key]['win_rate']
        return 0.5  # Default 50% if no data

    def extract_ally_context(self, ally_picks: List[str]) -> Dict:
        """Extract enhanced ally team composition context"""
        context = {
            # Basic composition
            'has_adc': 0,
            'single_core': 0,
            'missing_cc': 1,
            'missing_frontline': 1,
            'execution_difficulty': 0.5,

            # Role counts (NEW)
            'tank_count': 0,
            'fighter_count': 0,
            'assassin_count': 0,
            'mage_count': 0,
            'adc_count': 0,
            'support_count': 0,

            # Tag counts (NEW)
            'engage_count': 0,
            'cc_count': 0,
            'damage_count': 0,
            'mobility_count': 0,
            'peel_count': 0,

            # Composition metrics (NEW)
            'physical_damage_ratio': 0.5,
            'magic_damage_ratio': 0.5,
            'team_size': len(ally_picks)
        }

        if not ally_picks:
            return context

        # Count roles
        context['tank_count'] = count_role_in_team(ally_picks, 'tank')
        context['fighter_count'] = count_role_in_team(ally_picks, 'fighter')
        context['assassin_count'] = count_role_in_team(ally_picks, 'assassin')
        context['mage_count'] = count_role_in_team(ally_picks, 'mage')
        context['adc_count'] = count_role_in_team(ally_picks, 'adc')
        context['support_count'] = count_role_in_team(ally_picks, 'support')

        # Count tags
        context['engage_count'] = count_tag_in_team(ally_picks, 'engage')
        context['cc_count'] = count_tag_in_team(ally_picks, 'cc')
        context['damage_count'] = count_tag_in_team(ally_picks, 'damage')
        context['mobility_count'] = count_tag_in_team(ally_picks, 'mobility')
        context['peel_count'] = count_tag_in_team(ally_picks, 'peel')

        # Basic features
        context['has_adc'] = 1 if context['adc_count'] > 0 else 0
        context['single_core'] = 1 if (context['adc_count'] + context['assassin_count']) == 1 else 0
        context['missing_cc'] = 0 if context['cc_count'] >= 2 else 1
        context['missing_frontline'] = 0 if context['tank_count'] >= 1 else 1

        # Damage type ratio
        physical_dealers = context['adc_count'] + context['fighter_count'] + context['assassin_count']
        magic_dealers = context['mage_count']
        total_dealers = physical_dealers + magic_dealers

        if total_dealers > 0:
            context['physical_damage_ratio'] = physical_dealers / total_dealers
            context['magic_damage_ratio'] = magic_dealers / total_dealers

        # Execution difficulty
        context['execution_difficulty'] = min(
            0.3 + (context['assassin_count'] * 0.2) + (context['mobility_count'] * 0.1),
            1.0
        )

        return context

    def extract_hero_profile(self, hero_name: str) -> Dict:
        """Extract enhanced hero profile with role information"""
        profile = {
            'dpm': 0,
            'damage_pct': 0,
            'forward_pct': 0,
            'kda': 0,
            'kp': 0,
            'dpm_per_gold': 0,

            # Role features (NEW)
            'is_tank': 0,
            'is_fighter': 0,
            'is_assassin': 0,
            'is_mage': 0,
            'is_adc': 0,
            'is_support': 0,

            # Tag features (NEW)
            'has_engage': 0,
            'has_cc': 0,
            'has_mobility': 0,
            'has_burst': 0,
        }

        # Get stats
        if hero_name in self.hero_stats.index:
            stats = self.hero_stats.loc[hero_name]
            profile['dpm'] = stats.get('avg_dpm', 0)
            profile['damage_pct'] = stats.get('avg_damage_pct', 0)
            profile['forward_pct'] = stats.get('avg_forward_pct', 0)
            profile['kda'] = stats.get('avg_kda', 0)
            profile['kp'] = stats.get('avg_kp', 0)
            profile['dpm_per_gold'] = stats.get('avg_dpm_per_gold', 0)

        # Get role
        role = get_hero_role(hero_name)
        profile[f'is_{role}'] = 1

        # Get tags
        tags = get_hero_tags(hero_name)
        if 'engage' in tags:
            profile['has_engage'] = 1
        if 'cc' in tags:
            profile['has_cc'] = 1
        if 'mobility' in tags:
            profile['has_mobility'] = 1
        if 'burst' in tags:
            profile['has_burst'] = 1

        return profile

    def extract_matchup_features(self, ally_picks: List[str], enemy_hero: str) -> Dict:
        """Extract matchup-based features (NEW)"""
        features = {
            'avg_matchup_win_rate': 0.5,
            'worst_matchup_win_rate': 0.5,
            'best_matchup_win_rate': 0.5,
        }

        if not ally_picks:
            return features

        matchup_rates = []
        for ally_hero in ally_picks:
            win_rate = self.get_matchup_win_rate(ally_hero, enemy_hero)
            matchup_rates.append(win_rate)

        if matchup_rates:
            features['avg_matchup_win_rate'] = np.mean(matchup_rates)
            features['worst_matchup_win_rate'] = np.min(matchup_rates)
            features['best_matchup_win_rate'] = np.max(matchup_rates)

        return features

    def get_bp_stage(self, pick_number: int, total_picks: int = 10) -> str:
        """Determine BP stage"""
        if pick_number <= 3:
            return "Early"
        elif pick_number <= 7:
            return "Mid"
        else:
            return "Late"

    def generate_training_sample(
        self,
        ally_picks: List[str],
        enemy_pick: str,
        pick_number: int,
        won: bool
    ) -> Dict:
        """Generate enhanced training sample with all features"""

        # Extract all feature groups
        ally_context = self.extract_ally_context(ally_picks)
        hero_profile = self.extract_hero_profile(enemy_pick)
        matchup_features = self.extract_matchup_features(ally_picks, enemy_pick)
        stage = self.get_bp_stage(pick_number)

        # Combine all features
        sample = {
            # Ally context (original + new)
            'ally_has_adc_core': ally_context['has_adc'],
            'ally_has_single_core': ally_context['single_core'],
            'ally_missing_cc': ally_context['missing_cc'],
            'ally_missing_frontline': ally_context['missing_frontline'],
            'execution_difficulty': ally_context['execution_difficulty'],

            # NEW: Role counts
            'ally_tank_count': ally_context['tank_count'],
            'ally_assassin_count': ally_context['assassin_count'],
            'ally_mage_count': ally_context['mage_count'],

            # NEW: Tag counts
            'ally_engage_count': ally_context['engage_count'],
            'ally_cc_count': ally_context['cc_count'],
            'ally_mobility_count': ally_context['mobility_count'],

            # NEW: Damage composition
            'ally_physical_ratio': ally_context['physical_damage_ratio'],
            'ally_magic_ratio': ally_context['magic_damage_ratio'],

            # Hero profile (original)
            'hero_dpm': hero_profile['dpm'],
            'hero_damage_pct': hero_profile['damage_pct'],
            'hero_forward_pct': hero_profile['forward_pct'],
            'hero_kda': hero_profile['kda'],
            'hero_kp': hero_profile['kp'],
            'hero_dpm_per_gold': hero_profile['dpm_per_gold'],

            # NEW: Hero role
            'hero_is_assassin': hero_profile['is_assassin'],
            'hero_is_tank': hero_profile['is_tank'],
            'hero_is_mage': hero_profile['is_mage'],

            # NEW: Hero tags
            'hero_has_engage': hero_profile['has_engage'],
            'hero_has_mobility': hero_profile['has_mobility'],
            'hero_has_burst': hero_profile['has_burst'],

            # NEW: Matchup features
            'avg_matchup_win_rate': matchup_features['avg_matchup_win_rate'],
            'worst_matchup_win_rate': matchup_features['worst_matchup_win_rate'],

            # BP stage (one-hot)
            'stage_early': 1 if stage == "Early" else 0,
            'stage_mid': 1 if stage == "Mid" else 0,
            'stage_late': 1 if stage == "Late" else 0,

            # Label
            'counter_label': 0 if won else 1
        }

        return sample

    def generate_training_data(self) -> pd.DataFrame:
        """Generate full training dataset"""
        training_samples = []

        games = self.player_stats.groupby(['game_id', 'team_side'])

        for (game_id, team_side), team_data in games:
            won = team_data['won'].iloc[0]
            team_picks = team_data['hero_name'].tolist()

            enemy_data = self.player_stats[
                (self.player_stats['game_id'] == game_id) &
                (self.player_stats['team_side'] != team_side)
            ]
            enemy_picks = enemy_data['hero_name'].tolist()

            for i, ally_pick in enumerate(team_picks):
                pick_number = i + 1
                ally_picks_so_far = team_picks[:i]

                for enemy_pick in enemy_picks:
                    sample = self.generate_training_sample(
                        ally_picks=ally_picks_so_far,
                        enemy_pick=enemy_pick,
                        pick_number=pick_number,
                        won=won
                    )
                    training_samples.append(sample)

        df = pd.DataFrame(training_samples)
        logger.info(f"Generated {len(df)} training samples with {len(df.columns)-1} features")

        return df


def main():
    """Main pipeline"""
    logger.info("=" * 70)
    logger.info("Enhanced Feature Engineering Pipeline")
    logger.info("=" * 70)

    try:
        hero_stats = pd.read_csv("hero_aggregates.csv", index_col=0)
        player_stats = pd.read_csv("player_stats.csv")
        logger.info(f"Loaded {len(hero_stats)} heroes and {len(player_stats)} player records")
    except FileNotFoundError as e:
        logger.error(f"Data files not found: {e}")
        return

    fe = EnhancedFeatureEngineering(hero_stats, player_stats)

    logger.info("\nGenerating enhanced training features...")
    training_df = fe.generate_training_data()

    output_path = "counter_train_data_enhanced.csv"
    training_df.to_csv(output_path, index=False)
    logger.info(f"\n✅ Enhanced training data saved to {output_path}")

    logger.info(f"\nDataset Statistics:")
    logger.info(f"  Total samples: {len(training_df)}")
    logger.info(f"  Total features: {len(training_df.columns) - 1}")
    logger.info(f"  Counter cases (label=1): {training_df['counter_label'].sum()}")
    logger.info(f"  Non-counter cases (label=0): {(training_df['counter_label'] == 0).sum()}")
    logger.info(f"  Class balance: {training_df['counter_label'].mean():.2%}")


if __name__ == "__main__":
    main()
