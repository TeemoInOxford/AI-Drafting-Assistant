#!/usr/bin/env python3
"""
Counter Model Training Script
==============================
LightGBM Binary Classifier for Hero Counter Prediction

Improvements over original:
- Fixed all syntax errors (quotes, type hints, operators)
- Integrated with GRID API data structure
- Added proper logging and error handling
- Added model evaluation metrics
- Added feature importance analysis
"""

import pandas as pd
import numpy as np
import lightgbm as lgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, classification_report, confusion_matrix
import joblib
import logging
from pathlib import Path
from typing import Dict, Optional, Tuple

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ========================================
# 1. Configuration
# ========================================

DATA_PATH = "counter_train_data.csv"  # Training data path
MODEL_PATH = "counter_model_lgb.pkl"  # Model save path
HERO_STATS_PATH = "hero_aggregates.csv"  # Hero statistics from GRID API
RANDOM_SEED = 42

FEATURES = [
    # Ally Core Context
    "ally_has_adc_core",
    "ally_has_single_core",
    "ally_missing_cc",
    "ally_missing_frontline",
    "execution_difficulty",

    # Enemy Hero Profile (historical aggregated stats)
    "hero_dpm",
    "hero_damage_pct",
    "hero_forward_pct",
    "hero_kda",
    "hero_kp",
    "hero_dpm_per_gold",

    # BP Stage (one-hot encoded)
    "stage_early",
    "stage_mid",
    "stage_late",
]

TARGET = "counter_label"


# ========================================
# 2. Data Loading
# ========================================

def load_data(path: str) -> pd.DataFrame:
    """Load training data from CSV"""
    try:
        df = pd.read_csv(path)
        logger.info(f"Loaded {len(df)} rows from {path}")

        # Validate required columns
        missing = set(FEATURES + [TARGET]) - set(df.columns)
        if missing:
            raise ValueError(f"Missing columns: {missing}")

        return df

    except FileNotFoundError:
        logger.error(f"Data file not found: {path}")
        raise
    except Exception as e:
        logger.error(f"Error loading data: {e}")
        raise


def load_hero_stats(path: str) -> Optional[pd.DataFrame]:
    """Load aggregated hero statistics"""
    try:
        df = pd.read_csv(path, index_col=0)
        logger.info(f"Loaded stats for {len(df)} heroes")
        return df
    except FileNotFoundError:
        logger.warning(f"Hero stats file not found: {path}")
        return None
    except Exception as e:
        logger.error(f"Error loading hero stats: {e}")
        return None


# ========================================
# 3. Model Training
# ========================================

def train_counter_model(df: pd.DataFrame) -> Tuple[lgb.LGBMClassifier, Dict]:
    """Train Counter prediction model"""
    X = df[FEATURES]
    y = df[TARGET]

    logger.info(f"Training data shape: {X.shape}")
    logger.info(f"Target distribution: {y.value_counts().to_dict()}")

    # Split data
    X_train, X_val, y_train, y_val = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=RANDOM_SEED,
        stratify=y
    )

    logger.info(f"Train size: {len(X_train)}, Validation size: {len(X_val)}")

    # Initialize model
    model = lgb.LGBMClassifier(
        objective="binary",
        boosting_type="gbdt",
        num_leaves=31,
        learning_rate=0.05,
        n_estimators=500,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_alpha=0.1,
        reg_lambda=0.1,
        random_state=RANDOM_SEED,
        verbose=-1
    )

    # Train model
    logger.info("Training model...")
    model.fit(
        X_train,
        y_train,
        eval_set=[(X_val, y_val)],
        eval_metric="auc",
        callbacks=[
            lgb.early_stopping(stopping_rounds=50, verbose=False),
            lgb.log_evaluation(period=50)
        ]
    )

    # Evaluate model
    val_pred_proba = model.predict_proba(X_val)[:, 1]
    val_pred = model.predict(X_val)
    auc = roc_auc_score(y_val, val_pred_proba)

    logger.info(f"✅ Counter Model AUC: {auc:.4f}")

    # Detailed evaluation
    logger.info("\nClassification Report:")
    logger.info("\n" + classification_report(y_val, val_pred))

    logger.info("\nConfusion Matrix:")
    logger.info("\n" + str(confusion_matrix(y_val, val_pred)))

    # Feature importance
    feature_importance = pd.DataFrame({
        'feature': FEATURES,
        'importance': model.feature_importances_
    }).sort_values('importance', ascending=False)

    logger.info("\nTop 10 Feature Importances:")
    logger.info("\n" + str(feature_importance.head(10)))

    # Store evaluation metrics
    metrics = {
        'auc': auc,
        'feature_importance': feature_importance.to_dict('records'),
        'best_iteration': model.best_iteration_,
        'n_features': len(FEATURES)
    }

    return model, metrics


# ========================================
# 4. Inference Functions
# ========================================

def predict_counter_degree(
    model: lgb.LGBMClassifier,
    ally_context: Dict,
    hero_profile: Dict,
    stage: str
) -> float:
    """
    Predict counter degree for a hero given ally context and BP stage

    Args:
        model: Trained LightGBM model
        ally_context: Dict with ally team composition info
        hero_profile: Dict with hero's historical stats
        stage: BP stage ("Early", "Mid", or "Late")

    Returns:
        Counter score between 0 and 1
    """
    feature = {
        # Ally Core Context
        "ally_has_adc_core": ally_context.get("has_adc", 0),
        "ally_has_single_core": ally_context.get("single_core", 0),
        "ally_missing_cc": ally_context.get("missing_cc", 0),
        "ally_missing_frontline": ally_context.get("missing_frontline", 0),
        "execution_difficulty": ally_context.get("execution_difficulty", 0.5),

        # Hero Profile
        "hero_dpm": hero_profile.get("dpm", 0),
        "hero_damage_pct": hero_profile.get("damage_pct", 0),
        "hero_forward_pct": hero_profile.get("forward_pct", 0),
        "hero_kda": hero_profile.get("kda", 0),
        "hero_kp": hero_profile.get("kp", 0),
        "hero_dpm_per_gold": hero_profile.get("dpm_per_gold", 0),

        # BP Stage (one-hot)
        "stage_early": int(stage == "Early"),
        "stage_mid": int(stage == "Mid"),
        "stage_late": int(stage == "Late"),
    }

    df = pd.DataFrame([feature])
    score = model.predict_proba(df)[0][1]
    return float(score)


# ========================================
# 5. Rule-based Adjustments
# ========================================

def apply_counter_rules(
    counter_score: float,
    ally_context: Dict,
    hero_tags: Dict
) -> float:
    """
    Apply expert rules to adjust counter score

    Args:
        counter_score: Model prediction
        ally_context: Ally team composition
        hero_tags: Hero role/type tags

    Returns:
        Adjusted counter score
    """
    score = counter_score

    # Assassin vs ADC single core
    if hero_tags.get("assassin") and ally_context.get("has_adc"):
        score = max(score, 0.6)

    # Strong frontline reduces counter threat
    if not ally_context.get("missing_frontline"):
        score *= 0.85

    # High execution difficulty reduces effective counter
    if ally_context.get("execution_difficulty", 0) > 0.7:
        score *= 0.9

    return min(score, 1.0)


# ========================================
# 6. Model Persistence
# ========================================

def save_model(model: lgb.LGBMClassifier, metrics: Dict, path: str):
    """Save model and metadata"""
    model_data = {
        'model': model,
        'metrics': metrics,
        'features': FEATURES,
        'target': TARGET
    }

    joblib.dump(model_data, path)
    logger.info(f"💾 Model saved to {path}")


def load_model(path: str) -> Tuple[lgb.LGBMClassifier, Dict]:
    """Load model and metadata"""
    model_data = joblib.load(path)
    logger.info(f"📥 Model loaded from {path}")
    return model_data['model'], model_data['metrics']


# ========================================
# 7. Main Entry Point
# ========================================

def main():
    """Main training pipeline"""
    logger.info("=" * 70)
    logger.info("Counter Model Training Pipeline")
    logger.info("=" * 70)

    # Load data
    logger.info("\n📥 Loading training data...")
    try:
        df = load_data(DATA_PATH)
    except Exception as e:
        logger.error(f"Failed to load data: {e}")
        logger.info("\nTo generate training data, run:")
        logger.info("  python data_preparation.py")
        logger.info("  python feature_engineering.py")
        return

    # Train model
    logger.info("\n🧠 Training Counter model...")
    model, metrics = train_counter_model(df)

    # Save model
    logger.info(f"\n💾 Saving model to {MODEL_PATH}...")
    save_model(model, metrics, MODEL_PATH)

    logger.info("\n✅ Training complete!")
    logger.info(f"   AUC: {metrics['auc']:.4f}")
    logger.info(f"   Best iteration: {metrics['best_iteration']}")


if __name__ == "__main__":
    main()
