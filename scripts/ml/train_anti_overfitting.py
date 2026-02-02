#!/usr/bin/env python3
"""
Anti-Overfitting Training Script
=================================
Implements multiple techniques to reduce overfitting:
1. Stronger regularization
2. Feature selection
3. More aggressive early stopping
4. Ensemble methods
"""

import pandas as pd
import numpy as np
import lightgbm as lgb
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import roc_auc_score, accuracy_score, classification_report
from sklearn.feature_selection import SelectFromModel
import joblib
import logging
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

RANDOM_SEED = 42


def load_data():
    """Load training data"""
    df = pd.read_csv("counter_train_data_enhanced.csv")
    feature_cols = [col for col in df.columns if col != 'counter_label']
    X = df[feature_cols]
    y = df['counter_label']
    return X, y, feature_cols


def feature_selection(X_train, y_train, X_val, feature_names, n_features=20):
    """Select most important features to reduce overfitting"""
    logger.info("\n" + "="*70)
    logger.info("FEATURE SELECTION")
    logger.info("="*70)

    # Train a simple model for feature selection
    selector_model = lgb.LGBMClassifier(
        n_estimators=100,
        learning_rate=0.1,
        random_state=RANDOM_SEED,
        verbose=-1
    )
    selector_model.fit(X_train, y_train)

    # Get feature importances
    importances = pd.DataFrame({
        'feature': feature_names,
        'importance': selector_model.feature_importances_
    }).sort_values('importance', ascending=False)

    logger.info(f"\nTop {n_features} most important features:")
    for idx, row in importances.head(n_features).iterrows():
        logger.info(f"  {row['feature']:30s}: {row['importance']:.1f}")

    # Select top features
    selected_features = importances.head(n_features)['feature'].tolist()

    logger.info(f"\n✅ Selected {len(selected_features)} features (from {len(feature_names)})")

    return selected_features, importances


def train_regularized_model(X_train, y_train, X_val, y_val, model_name="regularized"):
    """Train model with strong regularization to prevent overfitting"""
    logger.info("\n" + "="*70)
    logger.info(f"TRAINING {model_name.upper()} MODEL")
    logger.info("="*70)

    # Strong regularization parameters
    params = {
        'objective': 'binary',
        'boosting_type': 'gbdt',
        'num_leaves': 15,  # Reduced from 21
        'max_depth': 3,    # Keep shallow
        'learning_rate': 0.05,  # Slower learning
        'n_estimators': 500,
        'subsample': 0.7,  # More aggressive subsampling
        'colsample_bytree': 0.7,
        'reg_alpha': 1.5,  # Strong L1 regularization
        'reg_lambda': 1.0,  # Strong L2 regularization
        'min_child_samples': 50,  # Require more samples per leaf
        'min_child_weight': 0.01,
        'random_state': RANDOM_SEED,
        'verbose': -1
    }

    model = lgb.LGBMClassifier(**params)

    # Train with early stopping
    model.fit(
        X_train, y_train,
        eval_set=[(X_train, y_train), (X_val, y_val)],
        eval_metric='auc',
        eval_names=['train', 'val'],
        callbacks=[
            lgb.early_stopping(stopping_rounds=30, verbose=False),
            lgb.log_evaluation(period=50)
        ]
    )

    # Evaluate
    train_pred_proba = model.predict_proba(X_train)[:, 1]
    train_pred = model.predict(X_train)
    val_pred_proba = model.predict_proba(X_val)[:, 1]
    val_pred = model.predict(X_val)

    train_auc = roc_auc_score(y_train, train_pred_proba)
    train_acc = accuracy_score(y_train, train_pred)
    val_auc = roc_auc_score(y_val, val_pred_proba)
    val_acc = accuracy_score(y_val, val_pred)

    logger.info(f"\nTraining Set:")
    logger.info(f"  AUC: {train_auc:.4f}")
    logger.info(f"  Accuracy: {train_acc:.4f}")

    logger.info(f"\nValidation Set:")
    logger.info(f"  AUC: {val_auc:.4f}")
    logger.info(f"  Accuracy: {val_acc:.4f}")

    auc_gap = train_auc - val_auc
    acc_gap = train_acc - val_acc

    logger.info(f"\nPerformance Gap:")
    logger.info(f"  AUC Gap: {auc_gap:.4f} ({auc_gap/train_auc*100:.2f}%)")
    logger.info(f"  Accuracy Gap: {acc_gap:.4f} ({acc_gap/train_acc*100:.2f}%)")

    metrics = {
        'train_auc': float(train_auc),
        'train_acc': float(train_acc),
        'val_auc': float(val_auc),
        'val_acc': float(val_acc),
        'auc_gap': float(auc_gap),
        'acc_gap': float(acc_gap),
        'best_iteration': model.best_iteration_
    }

    return model, metrics


def train_ensemble(X_train, y_train, X_val, y_val, n_models=5):
    """Train ensemble of models with different random seeds"""
    logger.info("\n" + "="*70)
    logger.info("TRAINING ENSEMBLE (Bagging)")
    logger.info("="*70)

    models = []

    for i in range(n_models):
        logger.info(f"\nTraining model {i+1}/{n_models}...")

        params = {
            'objective': 'binary',
            'boosting_type': 'gbdt',
            'num_leaves': 15,
            'max_depth': 3,
            'learning_rate': 0.05,
            'n_estimators': 300,
            'subsample': 0.7,
            'colsample_bytree': 0.7,
            'reg_alpha': 1.5,
            'reg_lambda': 1.0,
            'min_child_samples': 50,
            'random_state': RANDOM_SEED + i,  # Different seed
            'verbose': -1
        }

        model = lgb.LGBMClassifier(**params)
        model.fit(
            X_train, y_train,
            eval_set=[(X_val, y_val)],
            eval_metric='auc',
            callbacks=[lgb.early_stopping(stopping_rounds=30, verbose=False)]
        )

        models.append(model)

    # Ensemble predictions
    train_preds = np.mean([m.predict_proba(X_train)[:, 1] for m in models], axis=0)
    val_preds = np.mean([m.predict_proba(X_val)[:, 1] for m in models], axis=0)

    train_auc = roc_auc_score(y_train, train_preds)
    val_auc = roc_auc_score(y_val, val_preds)

    train_acc = accuracy_score(y_train, (train_preds > 0.5).astype(int))
    val_acc = accuracy_score(y_val, (val_preds > 0.5).astype(int))

    logger.info(f"\n✅ Ensemble Results:")
    logger.info(f"  Train AUC: {train_auc:.4f}")
    logger.info(f"  Val AUC: {val_auc:.4f}")
    logger.info(f"  AUC Gap: {train_auc - val_auc:.4f}")
    logger.info(f"  Val Accuracy: {val_acc:.4f}")

    metrics = {
        'train_auc': float(train_auc),
        'val_auc': float(val_auc),
        'train_acc': float(train_acc),
        'val_acc': float(val_acc),
        'auc_gap': float(train_auc - val_auc),
        'n_models': n_models
    }

    return models, metrics


def compare_models(original_metrics, regularized_metrics, ensemble_metrics):
    """Compare all models"""
    logger.info("\n" + "="*70)
    logger.info("MODEL COMPARISON")
    logger.info("="*70)

    logger.info(f"\n{'Model':<20} {'Train AUC':<12} {'Val AUC':<12} {'Gap':<10} {'Val Acc':<10}")
    logger.info("-" * 70)

    # Original (from previous analysis)
    logger.info(f"{'Original':<20} {0.9896:<12.4f} {0.9619:<12.4f} {0.0277:<10.4f} {0.8733:<10.4f}")

    # Regularized
    logger.info(f"{'Regularized':<20} {regularized_metrics['train_auc']:<12.4f} "
                f"{regularized_metrics['val_auc']:<12.4f} "
                f"{regularized_metrics['auc_gap']:<10.4f} "
                f"{regularized_metrics['val_acc']:<10.4f}")

    # Ensemble
    logger.info(f"{'Ensemble':<20} {ensemble_metrics['train_auc']:<12.4f} "
                f"{ensemble_metrics['val_auc']:<12.4f} "
                f"{ensemble_metrics['auc_gap']:<10.4f} "
                f"{ensemble_metrics['val_acc']:<10.4f}")

    logger.info("\n" + "="*70)
    logger.info("OVERFITTING REDUCTION")
    logger.info("="*70)

    original_gap = 0.0277
    reg_gap = regularized_metrics['auc_gap']
    ens_gap = ensemble_metrics['auc_gap']

    logger.info(f"Original AUC Gap:     {original_gap:.4f}")
    logger.info(f"Regularized AUC Gap:  {reg_gap:.4f} ({(reg_gap-original_gap)/original_gap*100:+.1f}%)")
    logger.info(f"Ensemble AUC Gap:     {ens_gap:.4f} ({(ens_gap-original_gap)/original_gap*100:+.1f}%)")

    # Determine best model
    if ens_gap < reg_gap and ens_gap < original_gap:
        best_model = "Ensemble"
        best_gap = ens_gap
    elif reg_gap < original_gap:
        best_model = "Regularized"
        best_gap = reg_gap
    else:
        best_model = "Original"
        best_gap = original_gap

    logger.info(f"\n✅ Best Model: {best_model} (Gap: {best_gap:.4f})")

    return {
        'original': {'train_auc': 0.9896, 'val_auc': 0.9619, 'gap': original_gap, 'val_acc': 0.8733},
        'regularized': regularized_metrics,
        'ensemble': ensemble_metrics,
        'best_model': best_model
    }


def main():
    """Main anti-overfitting pipeline"""
    logger.info("="*70)
    logger.info("ANTI-OVERFITTING TRAINING PIPELINE")
    logger.info("="*70)

    # Load data
    X, y, feature_names = load_data()
    logger.info(f"\nDataset: {len(X)} samples, {len(feature_names)} features")

    # Split data
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_SEED, stratify=y
    )

    # 1. Feature Selection
    selected_features, feature_importance = feature_selection(
        X_train, y_train, X_val, feature_names, n_features=20
    )

    # Use selected features
    X_train_selected = X_train[selected_features]
    X_val_selected = X_val[selected_features]

    # 2. Train Regularized Model
    regularized_model, regularized_metrics = train_regularized_model(
        X_train_selected, y_train, X_val_selected, y_val, "regularized"
    )

    # 3. Train Ensemble
    ensemble_models, ensemble_metrics = train_ensemble(
        X_train_selected, y_train, X_val_selected, y_val, n_models=5
    )

    # 4. Compare Models
    comparison = compare_models(
        {'train_auc': 0.9896, 'val_auc': 0.9619, 'auc_gap': 0.0277, 'val_acc': 0.8733},
        regularized_metrics,
        ensemble_metrics
    )

    # 5. Save Best Model
    if comparison['best_model'] == 'Ensemble':
        logger.info("\n💾 Saving ensemble models...")
        model_data = {
            'models': ensemble_models,
            'type': 'ensemble',
            'metrics': ensemble_metrics,
            'features': selected_features,
            'comparison': comparison
        }
        joblib.dump(model_data, "counter_model_anti_overfitting.pkl")
    else:
        logger.info("\n💾 Saving regularized model...")
        model_data = {
            'model': regularized_model,
            'type': 'single',
            'metrics': regularized_metrics,
            'features': selected_features,
            'comparison': comparison
        }
        joblib.dump(model_data, "counter_model_anti_overfitting.pkl")

    logger.info("✅ Model saved to counter_model_anti_overfitting.pkl")

    # Save comparison results
    with open('../../public/anti_overfitting_results.json', 'w') as f:
        json.dump(comparison, f, indent=2, default=str)

    logger.info("📊 Results saved to public/anti_overfitting_results.json")

    # Save feature importance
    feature_importance.to_csv('feature_importance.csv', index=False)
    logger.info("📊 Feature importance saved to feature_importance.csv")

    logger.info("\n✅ Anti-overfitting training complete!")


if __name__ == "__main__":
    main()
