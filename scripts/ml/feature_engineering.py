#!/usr/bin/env python3
"""
Feature Engineering Module
===========================
Generates training features for counter prediction model from GRID API data
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class FeatureEngineering:
    """Generate features for counter prediction model"""

    def __init__(self, hero_stats: pd.DataFrame, player_stats: pd.DataFrame):
        """
        Initialize with aggregated hero and player statistics

        Args:
            hero_stats: DataFrame with hero aggregates (from data_preparation.py)
            player_stats: DataFrame with player game records
        """
        self.hero_stats = hero_stats
        self.player_stats = player_stats

        # Hero role mapping (simplified - should be loaded from data)
        self.hero_roles = self._infer_hero_roles()

    def _infer_hero_roles(self) -> Dict[str, str]:
        """Infer hero roles based on statistics"""
        roles = {}

        for hero_name in self.hero_stats.index:
            stats = self.hero_stats.loc[hero_name]

            # Simple role inference based on stats
            if stats.get('avg_damage_pct', 0) > 25:
                roles[hero_name] = 'carry'
            elif stats.get('avg_forward_pct', 0) < 20:
                roles[hero_name] = 'support'
            elif stats.get('avg_forward_pct', 0) > 30:
                roles[hero_name] = 'tank'
            else:
                roles[hero_name] = 'flex'

        return roles

    def extract_ally_context(self, ally_picks: List[str]) -> Dict:
        """
        Extract ally team composition context

        Args:
            ally_picks: List of hero names already picked by ally team

        Returns:
            Dict with ally context features
        """
        context = {
            'has_adc': 0,
            'single_core': 0,
            'missing_cc': 1,  # Assume missing until found
            'missing_frontline': 1,
            'execution_difficulty': 0.5
        }

        carry_count = 0
        has_tank = False

        for hero in ally_picks:
            role = self.hero_roles.get(hero, 'flex')

            if role == 'carry':
                carry_count += 1
            elif role == 'tank':
                has_tank = True

        # Set features
        context['has_adc'] = 1 if carry_count > 0 else 0
        context['single_core'] = 1 if carry_count == 1 else 0
        context['missing_frontline'] = 0 if has_tank else 1

        # Execution difficulty (simplified)
        context['execution_difficulty'] = min(0.3 + (carry_count * 0.2), 1.0)

        return context

    def extract_hero_profile(self, hero_name: str) -> Dict:
        """
        Extract hero profile features from aggregated statistics

        Args:
            hero_name: Name of the hero

        Returns:
            Dict with hero profile features
        """
        if hero_name not in self.hero_stats.index:
            logger.warning(f"Hero {hero_name} not found in stats, using defaults")
            return {
                'dpm': 0,
                'damage_pct': 0,
                'forward_pct': 0,
                'kda': 0,
                'kp': 0,
                'dpm_per_gold': 0
            }

        stats = self.hero_stats.loc[hero_name]

        return {
            'dpm': stats.get('avg_dpm', 0),
            'damage_pct': stats.get('avg_damage_pct', 0),
            'forward_pct': stats.get('avg_forward_pct', 0),
            'kda': stats.get('avg_kda', 0),
            'kp': stats.get('avg_kp', 0),
            'dpm_per_gold': stats.get('avg_dpm_per_gold', 0)
        }

    def get_bp_stage(self, pick_number: int, total_picks: int = 10) -> str:
        """
        Determine BP stage based on pick number

        Args:
            pick_number: Current pick number (1-indexed)
            total_picks: Total number of picks per team

        Returns:
            Stage name: "Early", "Mid", or "Late"
        """
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
        """
        Generate a single training sample

        Args:
            ally_picks: List of ally hero picks so far
            enemy_pick: Enemy hero being evaluated
            pick_number: Current pick number
            won: Whether the game was won

        Returns:
            Dict with all features and label
        """
        # Extract features
        ally_context = self.extract_ally_context(ally_picks)
        hero_profile = self.extract_hero_profile(enemy_pick)
        stage = self.get_bp_stage(pick_number)

        # Combine features
        sample = {
            # Ally context
            'ally_has_adc_core': ally_context['has_adc'],
            'ally_has_single_core': ally_context['single_core'],
            'ally_missing_cc': ally_context['missing_cc'],
            'ally_missing_frontline': ally_context['missing_frontline'],
            'execution_difficulty': ally_context['execution_difficulty'],

            # Hero profile
            'hero_dpm': hero_profile['dpm'],
            'hero_damage_pct': hero_profile['damage_pct'],
            'hero_forward_pct': hero_profile['forward_pct'],
            'hero_kda': hero_profile['kda'],
            'hero_kp': hero_profile['kp'],
            'hero_dpm_per_gold': hero_profile['dpm_per_gold'],

            # BP stage (one-hot)
            'stage_early': 1 if stage == "Early" else 0,
            'stage_mid': 1 if stage == "Mid" else 0,
            'stage_late': 1 if stage == "Late" else 0,

            # Label: 1 if enemy pick countered ally (ally lost), 0 otherwise
            'counter_label': 0 if won else 1
        }

        return sample

    def generate_training_data(self) -> pd.DataFrame:
        """
        Generate full training dataset from player stats

        Returns:
            DataFrame with training samples
        """
        training_samples = []

        # Group by game
        games = self.player_stats.groupby(['game_id', 'team_side'])

        for (game_id, team_side), team_data in games:
            # Get team result
            won = team_data['won'].iloc[0]

            # Get picks for this team
            team_picks = team_data['hero_name'].tolist()

            # Get enemy team picks
            enemy_data = self.player_stats[
                (self.player_stats['game_id'] == game_id) &
                (self.player_stats['team_side'] != team_side)
            ]
            enemy_picks = enemy_data['hero_name'].tolist()

            # Generate samples for each pick
            for i, ally_pick in enumerate(team_picks):
                pick_number = i + 1
                ally_picks_so_far = team_picks[:i]

                # For each enemy pick, generate a counter sample
                for enemy_pick in enemy_picks:
                    sample = self.generate_training_sample(
                        ally_picks=ally_picks_so_far,
                        enemy_pick=enemy_pick,
                        pick_number=pick_number,
                        won=won
                    )
                    training_samples.append(sample)

        df = pd.DataFrame(training_samples)
        logger.info(f"Generated {len(df)} training samples")

        return df


def main():
    """Example usage"""
    logger.info("=" * 70)
    logger.info("Feature Engineering Pipeline")
    logger.info("=" * 70)

    # Load preprocessed data
    try:
        hero_stats = pd.read_csv("hero_aggregates.csv", index_col=0)
        player_stats = pd.read_csv("player_stats.csv")
        logger.info(f"Loaded {len(hero_stats)} heroes and {len(player_stats)} player records")
    except FileNotFoundError as e:
        logger.error(f"Data files not found: {e}")
        logger.info("\nPlease run data_preparation.py first to generate the required data files")
        return

    # Initialize feature engineering
    fe = FeatureEngineering(hero_stats, player_stats)

    # Generate training data
    logger.info("\nGenerating training features...")
    training_df = fe.generate_training_data()

    # Save training data
    output_path = "counter_train_data.csv"
    training_df.to_csv(output_path, index=False)
    logger.info(f"\n✅ Training data saved to {output_path}")

    # Display statistics
    logger.info(f"\nDataset Statistics:")
    logger.info(f"  Total samples: {len(training_df)}")
    logger.info(f"  Counter cases (label=1): {training_df['counter_label'].sum()}")
    logger.info(f"  Non-counter cases (label=0): {(training_df['counter_label'] == 0).sum()}")
    logger.info(f"  Class balance: {training_df['counter_label'].mean():.2%}")


if __name__ == "__main__":
    main()
