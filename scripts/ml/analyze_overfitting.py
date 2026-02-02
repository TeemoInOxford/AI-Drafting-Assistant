#!/usr/bin/env python3
"""
Overfitting Analysis Script
============================
Analyzes if the model is overfitting by comparing train vs validation performance
"""

import pandas as pd
import numpy as np
import joblib
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import roc_auc_score, accuracy_score
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

RANDOM_SEED = 42


def analyze_overfitting():
    """Comprehensive overfitting analysis"""

    logger.info("="*70)
    logger.info("OVERFITTING ANALYSIS")
    logger.info("="*70)

    # Load data
    df = pd.read_csv("counter_train_data_enhanced.csv")
    feature_cols = [col for col in df.columns if col != 'counter_label']
    X = df[feature_cols]
    y = df['counter_label']

    # Split data
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_SEED, stratify=y
    )

    # Load optimized model
    model_data = joblib.load("counter_model_optimized.pkl")
    model = model_data['model']

    # 1. Train vs Validation Performance
    logger.info("\n1. TRAIN VS VALIDATION PERFORMANCE")
    logger.info("-" * 70)

    # Training set performance
    train_pred_proba = model.predict_proba(X_train)[:, 1]
    train_pred = model.predict(X_train)
    train_auc = roc_auc_score(y_train, train_pred_proba)
    train_acc = accuracy_score(y_train, train_pred)

    # Validation set performance
    val_pred_proba = model.predict_proba(X_val)[:, 1]
    val_pred = model.predict(X_val)
    val_auc = roc_auc_score(y_val, val_pred_proba)
    val_acc = accuracy_score(y_val, val_pred)

    logger.info(f"Training Set:")
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

    # 2. Cross-Validation Analysis
    logger.info("\n2. CROSS-VALIDATION ANALYSIS (5-Fold)")
    logger.info("-" * 70)

    cv_auc_scores = cross_val_score(model, X, y, cv=5, scoring='roc_auc')
    cv_acc_scores = cross_val_score(model, X, y, cv=5, scoring='accuracy')

    logger.info(f"AUC Scores: {[f'{s:.4f}' for s in cv_auc_scores]}")
    logger.info(f"  Mean: {cv_auc_scores.mean():.4f}")
    logger.info(f"  Std:  {cv_auc_scores.std():.4f}")

    logger.info(f"\nAccuracy Scores: {[f'{s:.4f}' for s in cv_acc_scores]}")
    logger.info(f"  Mean: {cv_acc_scores.mean():.4f}")
    logger.info(f"  Std:  {cv_acc_scores.std():.4f}")

    # 3. Data Size Analysis
    logger.info("\n3. DATA SIZE ANALYSIS")
    logger.info("-" * 70)

    n_samples = len(X)
    n_features = len(feature_cols)
    samples_per_feature = n_samples / n_features

    logger.info(f"Total Samples: {n_samples}")
    logger.info(f"Total Features: {n_features}")
    logger.info(f"Samples per Feature: {samples_per_feature:.1f}")
    logger.info(f"Recommended Minimum: {n_features * 10} samples (10x features)")

    # 4. Overfitting Diagnosis
    logger.info("\n4. OVERFITTING DIAGNOSIS")
    logger.info("="*70)

    issues = []
    warnings = []

    # Check AUC gap
    if auc_gap > 0.05:
        issues.append(f"Large AUC gap ({auc_gap:.4f}) - Strong overfitting")
    elif auc_gap > 0.02:
        warnings.append(f"Moderate AUC gap ({auc_gap:.4f}) - Mild overfitting")

    # Check accuracy gap
    if acc_gap > 0.10:
        issues.append(f"Large accuracy gap ({acc_gap:.4f}) - Strong overfitting")
    elif acc_gap > 0.05:
        warnings.append(f"Moderate accuracy gap ({acc_gap:.4f}) - Mild overfitting")

    # Check CV variance
    if cv_auc_scores.std() > 0.05:
        warnings.append(f"High CV variance ({cv_auc_scores.std():.4f}) - Unstable model")

    # Check samples per feature
    if samples_per_feature < 10:
        issues.append(f"Too few samples per feature ({samples_per_feature:.1f}) - High risk of overfitting")
    elif samples_per_feature < 20:
        warnings.append(f"Low samples per feature ({samples_per_feature:.1f}) - Moderate risk")

    # Check training performance
    if train_auc > 0.99:
        issues.append(f"Near-perfect training AUC ({train_auc:.4f}) - Likely overfitting")

    # Print diagnosis
    if not issues and not warnings:
        logger.info("✅ NO OVERFITTING DETECTED")
        logger.info("   Model appears to generalize well")
        verdict = "healthy"
    elif issues:
        logger.info("🚨 OVERFITTING DETECTED")
        for issue in issues:
            logger.info(f"   ❌ {issue}")
        for warning in warnings:
            logger.info(f"   ⚠️  {warning}")
        verdict = "overfitting"
    else:
        logger.info("⚠️  MILD OVERFITTING CONCERNS")
        for warning in warnings:
            logger.info(f"   ⚠️  {warning}")
        verdict = "mild_overfitting"

    # 5. Recommendations
    logger.info("\n5. RECOMMENDATIONS")
    logger.info("-" * 70)

    if verdict == "overfitting":
        logger.info("To reduce overfitting:")
        logger.info("  1. Collect more training data (target: 1500+ samples)")
        logger.info("  2. Reduce model complexity (fewer features or simpler model)")
        logger.info("  3. Increase regularization (higher reg_alpha/reg_lambda)")
        logger.info("  4. Use feature selection to remove less important features")
        logger.info("  5. Apply dropout or early stopping more aggressively")
    elif verdict == "mild_overfitting":
        logger.info("To improve generalization:")
        logger.info("  1. Collect more training data (target: 1000+ samples)")
        logger.info("  2. Monitor validation performance more closely")
        logger.info("  3. Consider slight increase in regularization")
    else:
        logger.info("Model is healthy! To further improve:")
        logger.info("  1. Collect more data to increase confidence")
        logger.info("  2. Try ensemble methods for even better performance")
        logger.info("  3. Monitor performance on completely new data")

    # Save analysis results
    results = {
        'verdict': verdict,
        'train_auc': float(train_auc),
        'val_auc': float(val_auc),
        'train_acc': float(train_acc),
        'val_acc': float(val_acc),
        'auc_gap': float(auc_gap),
        'acc_gap': float(acc_gap),
        'cv_auc_mean': float(cv_auc_scores.mean()),
        'cv_auc_std': float(cv_auc_scores.std()),
        'samples_per_feature': float(samples_per_feature),
        'issues': issues,
        'warnings': warnings
    }

    import json
    with open('../../public/overfitting_analysis.json', 'w') as f:
        json.dump(results, f, indent=2)

    logger.info(f"\n📊 Analysis saved to public/overfitting_analysis.json")

    return results


if __name__ == "__main__":
    analyze_overfitting()
