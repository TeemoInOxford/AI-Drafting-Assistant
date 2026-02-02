#!/usr/bin/env python3
"""
Top-K Threat Prediction
=======================
Predicts the most threatening heroes enemy could pick for ban recommendations
"""

import pandas as pd
import numpy as np
import joblib
import logging
from typing import List, Dict, Tuple
from pathlib import Path
from feature_engineering_enhanced import EnhancedFeatureEngineering
from hero_database import HERO_ROLES

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ThreatPredictor:
    """Predicts top-K most threatening enemy heroes for ban recommendations"""

    def __init__(self, model_path: str, hero_stats_path: str, player_stats_path: str):
        """
        Initialize predictor with trained model and data

        Args:
            model_path: Path to trained LightGBM model
            hero_stats_path: Path to hero aggregated stats CSV
            player_stats_path: Path to player stats CSV
        """
        # Load model
        model_data = joblib.load(model_path)
        self.model = model_data['model']
        self.features = model_data['features']
        logger.info(f"Loaded model from {model_path}")

        # Load data for feature engineering
        self.hero_stats = pd.read_csv(hero_stats_path, index_col=0)
        self.player_stats = pd.read_csv(player_stats_path)

        # Initialize feature engineering
        self.fe = EnhancedFeatureEngineering(self.hero_stats, self.player_stats)

        # Get all available heroes
        self.all_heroes = list(HERO_ROLES.keys())
        logger.info(f"Initialized with {len(self.all_heroes)} heroes")

    def predict_threat_score(
        self,
        ally_picks: List[str],
        enemy_hero: str,
        pick_stage: str = "Mid"
    ) -> float:
        """
        Predict threat score for a single enemy hero

        Args:
            ally_picks: List of heroes already picked by ally team
            enemy_hero: Enemy hero to evaluate
            pick_stage: BP stage ("Early", "Mid", "Late")

        Returns:
            Threat score between 0 and 1 (higher = more threatening)
        """
        # Generate features
        sample = self.fe.generate_training_sample(
            ally_picks=ally_picks,
            enemy_pick=enemy_hero,
            pick_number=len(ally_picks) + 1,
            won=False  # Dummy value, not used in prediction
        )

        # Extract only the features needed for prediction
        feature_dict = {feat: sample[feat] for feat in self.features}
        df = pd.DataFrame([feature_dict])

        # Predict threat score
        threat_score = self.model.predict_proba(df)[0][1]
        return float(threat_score)

    def predict_top_threats(
        self,
        ally_picks: List[str],
        enemy_picks: List[str],
        top_k: int = 3,
        pick_stage: str = "Mid"
    ) -> List[Tuple[str, float]]:
        """
        Predict top-K most threatening heroes enemy could pick

        Args:
            ally_picks: List of heroes already picked by ally team
            enemy_picks: List of heroes already picked by enemy team
            top_k: Number of top threats to return
            pick_stage: BP stage ("Early", "Mid", "Late")

        Returns:
            List of (hero_name, threat_score) tuples, sorted by threat score descending
        """
        # Get available heroes (not picked by either team)
        picked_heroes = set(ally_picks + enemy_picks)
        available_heroes = [h for h in self.all_heroes if h not in picked_heroes]

        if not available_heroes:
            logger.warning("No available heroes to evaluate")
            return []

        # Calculate threat score for each available hero
        threat_scores = []
        for hero in available_heroes:
            try:
                score = self.predict_threat_score(ally_picks, hero, pick_stage)
                threat_scores.append((hero, score))
            except Exception as e:
                logger.warning(f"Failed to predict for {hero}: {e}")
                continue

        # Sort by threat score descending and return top K
        threat_scores.sort(key=lambda x: x[1], reverse=True)
        return threat_scores[:top_k]

    def format_ban_recommendations(
        self,
        ally_picks: List[str],
        enemy_picks: List[str],
        top_k: int = 3
    ) -> Dict:
        """
        Generate formatted ban recommendations

        Args:
            ally_picks: Ally team picks
            enemy_picks: Enemy team picks
            top_k: Number of recommendations

        Returns:
            Dict with input state and ban recommendations
        """
        threats = self.predict_top_threats(ally_picks, enemy_picks, top_k)

        return {
            "ally_picks": ally_picks,
            "enemy_picks": enemy_picks,
            "ban_recommendations": [
                {
                    "rank": i + 1,
                    "hero": hero,
                    "threat_score": round(score, 3)
                }
                for i, (hero, score) in enumerate(threats)
            ]
        }


def main():
    """Demo usage"""
    logger.info("=" * 70)
    logger.info("Top-K Threat Prediction Demo")
    logger.info("=" * 70)

    # Initialize predictor
    predictor = ThreatPredictor(
        model_path="counter_model_optimized.pkl",
        hero_stats_path="hero_aggregates.csv",
        player_stats_path="player_stats.csv"
    )

    # Example 1: Early game draft
    print("\n" + "=" * 70)
    print("Example 1: Early Game Draft")
    print("=" * 70)
    ally_picks = ["Kai'Sa", "Alistar", "Orianna"]
    enemy_picks = ["Wukong", "K'Sante"]

    result = predictor.format_ban_recommendations(ally_picks, enemy_picks, top_k=3)

    print(f"\n我方已选: {', '.join(result['ally_picks'])}")
    print(f"对方已选: {', '.join(result['enemy_picks'])}")
    print("\n建议Ban:")
    for rec in result['ban_recommendations']:
        print(f"  {rec['rank']}. {rec['hero']} (威胁度: {rec['threat_score']:.3f})")

    # Example 2: Mid game draft with more picks
    print("\n" + "=" * 70)
    print("Example 2: Mid Game Draft")
    print("=" * 70)
    ally_picks = ["Ezreal", "Nautilus", "Azir", "Jarvan IV"]
    enemy_picks = ["Aatrox", "Lee Sin", "Akali"]

    result = predictor.format_ban_recommendations(ally_picks, enemy_picks, top_k=3)

    print(f"\n我方已选: {', '.join(result['ally_picks'])}")
    print(f"对方已选: {', '.join(result['enemy_picks'])}")
    print("\n建议Ban:")
    for rec in result['ban_recommendations']:
        print(f"  {rec['rank']}. {rec['hero']} (威胁度: {rec['threat_score']:.3f})")


if __name__ == "__main__":
    main()
