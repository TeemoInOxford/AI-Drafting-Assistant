#!/usr/bin/env python3
"""
Export Training Results to JSON
================================
Exports model training results and metrics to JSON for web display
"""

import json
import joblib
import pandas as pd
from pathlib import Path
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def export_training_results(
    model_path: str = "counter_model_lgb.pkl",
    training_data_path: str = "counter_train_data.csv",
    output_path: str = "../../public/training_results.json"
):
    """Export training results to JSON"""

    results = {
        "status": "success",
        "timestamp": pd.Timestamp.now().isoformat(),
        "model_info": {},
        "metrics": {},
        "feature_importance": [],
        "dataset_info": {}
    }

    try:
        # Load model
        model_data = joblib.load(model_path)
        model = model_data['model']
        metrics = model_data['metrics']

        results["model_info"] = {
            "algorithm": "LightGBM Binary Classifier",
            "objective": "binary",
            "n_features": metrics.get('n_features', 0),
            "best_iteration": metrics.get('best_iteration', 0)
        }

        results["metrics"] = {
            "auc": float(metrics.get('auc', 0)),
            "auc_display": f"{metrics.get('auc', 0):.4f}"
        }

        results["feature_importance"] = metrics.get('feature_importance', [])

        # Load training data info
        df = pd.read_csv(training_data_path)
        results["dataset_info"] = {
            "total_samples": len(df),
            "counter_cases": int(df['counter_label'].sum()),
            "non_counter_cases": int((df['counter_label'] == 0).sum()),
            "class_balance": float(df['counter_label'].mean())
        }

        logger.info(f"Successfully exported training results")

    except Exception as e:
        logger.error(f"Error exporting results: {e}")
        results["status"] = "error"
        results["error"] = str(e)

    # Save to JSON
    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    logger.info(f"Results exported to {output_path}")
    return results


if __name__ == "__main__":
    export_training_results()
