#!/usr/bin/env python3
"""
Optimized Counter Model Training with Hyperparameter Tuning
============================================================
Compares baseline vs optimized model performance
"""

import pandas as pd
import numpy as np
import lightgbm as lgb
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import roc_auc_score, classification_report, confusion_matrix, precision_recall_curve
import joblib
import logging
import json
from pathlib import Path
from typing import Dict, Tuple
import optuna

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

RANDOM_SEED = 42


def load_data(path: str) -> pd.DataFrame:
    """Load training data"""
    df = pd.read_csv(path)
    logger.info(f"Loaded {len(df)} rows with {len(df.columns)-1} features from {path}")
    return df


def train_baseline_model(X_train, y_train, X_val, y_val) -> Tuple[lgb.LGBMClassifier, Dict]:
    """Train baseline model with default parameters"""
    logger.info("\n" + "="*70)
    logger.info("Training BASELINE Model (default parameters)")
    logger.info("="*70)

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

    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        eval_metric="auc",
        callbacks=[
            lgb.early_stopping(stopping_rounds=50, verbose=False),
            lgb.log_evaluation(period=50)
        ]
    )

    val_pred_proba = model.predict_proba(X_val)[:, 1]
    val_pred = model.predict(X_val)
    auc = roc_auc_score(y_val, val_pred_proba)

    metrics = {
        'auc': auc,
        'best_iteration': model.best_iteration_,
        'classification_report': classification_report(y_val, val_pred, output_dict=True),
        'confusion_matrix': confusion_matrix(y_val, val_pred).tolist()
    }

    logger.info(f"✅ Baseline AUC: {auc:.4f}")
    logger.info(f"\nClassification Report:\n{classification_report(y_val, val_pred)}")

    return model, metrics


def objective(trial, X_train, y_train, X_val, y_val):
    """Optuna objective function for hyperparameter tuning"""
    params = {
        'objective': 'binary',
        'boosting_type': 'gbdt',
        'num_leaves': trial.suggest_int('num_leaves', 20, 100),
        'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.2, log=True),
        'n_estimators': trial.suggest_int('n_estimators', 100, 1000),
        'subsample': trial.suggest_float('subsample', 0.6, 1.0),
        'colsample_bytree': trial.suggest_float('colsample_bytree', 0.6, 1.0),
        'reg_alpha': trial.suggest_float('reg_alpha', 0.0, 1.0),
        'reg_lambda': trial.suggest_float('reg_lambda', 0.0, 1.0),
        'max_depth': trial.suggest_int('max_depth', 3, 15),
        'min_child_samples': trial.suggest_int('min_child_samples', 5, 50),
        'random_state': RANDOM_SEED,
        'verbose': -1
    }

    model = lgb.LGBMClassifier(**params)
    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        eval_metric='auc',
        callbacks=[lgb.early_stopping(stopping_rounds=30, verbose=False)]
    )

    val_pred_proba = model.predict_proba(X_val)[:, 1]
    auc = roc_auc_score(y_val, val_pred_proba)

    return auc


def train_optimized_model(X_train, y_train, X_val, y_val, n_trials=50) -> Tuple[lgb.LGBMClassifier, Dict]:
    """Train optimized model with hyperparameter tuning"""
    logger.info("\n" + "="*70)
    logger.info(f"Training OPTIMIZED Model (tuning {n_trials} trials)")
    logger.info("="*70)

    # Run Optuna optimization
    study = optuna.create_study(direction='maximize', sampler=optuna.samplers.TPESampler(seed=RANDOM_SEED))
    study.optimize(
        lambda trial: objective(trial, X_train, y_train, X_val, y_val),
        n_trials=n_trials,
        show_progress_bar=False
    )

    logger.info(f"\n✅ Best trial AUC: {study.best_value:.4f}")
    logger.info(f"Best parameters: {study.best_params}")

    # Train final model with best parameters
    best_params = study.best_params
    best_params.update({
        'objective': 'binary',
        'boosting_type': 'gbdt',
        'random_state': RANDOM_SEED,
        'verbose': -1
    })

    model = lgb.LGBMClassifier(**best_params)
    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        eval_metric='auc',
        callbacks=[
            lgb.early_stopping(stopping_rounds=50, verbose=False),
            lgb.log_evaluation(period=50)
        ]
    )

    val_pred_proba = model.predict_proba(X_val)[:, 1]
    val_pred = model.predict(X_val)
    auc = roc_auc_score(y_val, val_pred_proba)

    metrics = {
        'auc': auc,
        'best_iteration': model.best_iteration_,
        'best_params': study.best_params,
        'classification_report': classification_report(y_val, val_pred, output_dict=True),
        'confusion_matrix': confusion_matrix(y_val, val_pred).tolist()
    }

    logger.info(f"✅ Optimized AUC: {auc:.4f}")
    logger.info(f"\nClassification Report:\n{classification_report(y_val, val_pred)}")

    return model, metrics


def compare_models(baseline_metrics: Dict, optimized_metrics: Dict, feature_names: list):
    """Compare baseline vs optimized model"""
    logger.info("\n" + "="*70)
    logger.info("MODEL COMPARISON")
    logger.info("="*70)

    baseline_auc = baseline_metrics['auc']
    optimized_auc = optimized_metrics['auc']
    improvement = ((optimized_auc - baseline_auc) / baseline_auc) * 100

    logger.info(f"\nAUC Scores:")
    logger.info(f"  Baseline:  {baseline_auc:.4f}")
    logger.info(f"  Optimized: {optimized_auc:.4f}")
    logger.info(f"  Improvement: {improvement:+.2f}%")

    baseline_acc = baseline_metrics['classification_report']['accuracy']
    optimized_acc = optimized_metrics['classification_report']['accuracy']

    logger.info(f"\nAccuracy:")
    logger.info(f"  Baseline:  {baseline_acc:.4f}")
    logger.info(f"  Optimized: {optimized_acc:.4f}")
    logger.info(f"  Improvement: {(optimized_acc - baseline_acc)*100:+.2f}%")

    comparison = {
        'baseline': {
            'auc': baseline_auc,
            'accuracy': baseline_acc,
            'n_features': len(feature_names)
        },
        'optimized': {
            'auc': optimized_auc,
            'accuracy': optimized_acc,
            'n_features': len(feature_names)
        },
        'improvement': {
            'auc_improvement_pct': improvement,
            'accuracy_improvement_pct': (optimized_acc - baseline_acc) * 100
        }
    }

    return comparison


def main():
    """Main training pipeline with comparison"""
    logger.info("="*70)
    logger.info("Optimized Counter Model Training Pipeline")
    logger.info("="*70)

    # Load enhanced data
    try:
        df_enhanced = load_data("counter_train_data_enhanced.csv")
    except FileNotFoundError:
        logger.error("Enhanced training data not found. Run feature_engineering_enhanced.py first.")
        return

    # Prepare data
    feature_cols = [col for col in df_enhanced.columns if col != 'counter_label']
    X = df_enhanced[feature_cols]
    y = df_enhanced['counter_label']

    logger.info(f"\nDataset: {len(X)} samples, {len(feature_cols)} features")
    logger.info(f"Class distribution: {y.value_counts().to_dict()}")

    # Split data
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_SEED, stratify=y
    )

    # Train baseline model
    baseline_model, baseline_metrics = train_baseline_model(X_train, y_train, X_val, y_val)

    # Train optimized model
    optimized_model, optimized_metrics = train_optimized_model(X_train, y_train, X_val, y_val, n_trials=30)

    # Compare models
    comparison = compare_models(baseline_metrics, optimized_metrics, feature_cols)

    # Save optimized model
    model_data = {
        'model': optimized_model,
        'metrics': optimized_metrics,
        'features': feature_cols,
        'comparison': comparison
    }

    joblib.dump(model_data, "counter_model_optimized.pkl")
    logger.info(f"\n💾 Optimized model saved to counter_model_optimized.pkl")

    # Save comparison results
    with open("../../public/training_comparison.json", 'w') as f:
        json.dump({
            'baseline': baseline_metrics,
            'optimized': optimized_metrics,
            'comparison': comparison,
            'timestamp': pd.Timestamp.now().isoformat()
        }, f, indent=2, default=str)

    logger.info(f"📊 Comparison results saved to public/training_comparison.json")

    logger.info("\n✅ Training complete!")


if __name__ == "__main__":
    main()
