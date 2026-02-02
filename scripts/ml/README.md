# Counter Model ML Pipeline

Machine learning pipeline for predicting hero counter relationships in League of Legends, integrated with GRID API data.

## Overview

This pipeline trains a LightGBM binary classifier to predict whether an enemy hero pick effectively counters your team composition based on:
- Ally team composition context
- Enemy hero historical performance statistics
- Ban/Pick stage timing

## What's New

This is an improved version of the original `counter_model_lgb.py` with the following fixes and enhancements:

### Fixed Issues
- **Syntax Errors**: Fixed all Python syntax errors (missing quotes, incorrect type hints, wrong operators)
- **Type Hints**: Corrected all type annotations to proper Python syntax
- **String Literals**: Added missing quotes around all string values

### New Features
- **GRID API Integration**: Full integration with GRID API data structure
- **Data Pipeline**: Complete data preparation and feature engineering modules
- **Logging**: Comprehensive logging throughout the pipeline
- **Model Evaluation**: Detailed metrics including AUC, classification report, confusion matrix
- **Feature Importance**: Analysis of which features matter most
- **Error Handling**: Robust error handling and validation

## Pipeline Components

### 1. Data Preparation (`data_preparation.py`)

Extracts and processes data from GRID API JSON files.

**Input**: GRID API series JSON files (e.g., `series_2825123_data.json`)

**Output**:
- `player_stats.csv`: Individual player game statistics
- `hero_aggregates.csv`: Aggregated hero performance metrics

**Key Features**:
- Extracts player statistics (KDA, damage, vision, economy)
- Aggregates hero performance across multiple games
- Handles GRID API data structure with LOL-specific fragments

**Usage**:
```bash
cd scripts/ml
python data_preparation.py
```

### 2. Feature Engineering (`feature_engineering.py`)

Generates training features from processed data.

**Input**:
- `player_stats.csv`
- `hero_aggregates.csv`

**Output**:
- `counter_train_data.csv`: Training dataset with features and labels

**Features Generated**:
- **Ally Context**: Team composition analysis (ADC core, frontline, CC availability)
- **Hero Profile**: Historical performance metrics (DPM, KDA, KP, forward %)
- **BP Stage**: One-hot encoded pick timing (Early/Mid/Late)

**Usage**:
```bash
python feature_engineering.py
```

### 3. Model Training (`counter_model_lgb.py`)

Trains the counter prediction model.

**Input**: `counter_train_data.csv`

**Output**: `counter_model_lgb.pkl` (trained model with metadata)

**Model Details**:
- Algorithm: LightGBM Binary Classifier
- Objective: Predict counter effectiveness (0-1 score)
- Validation: 80/20 train/test split with stratification
- Early stopping: 50 rounds based on AUC

**Usage**:
```bash
python counter_model_lgb.py
```

## Complete Workflow

```bash
# Step 1: Prepare data from GRID API JSON files
cd scripts/ml
python data_preparation.py

# Step 2: Generate training features
python feature_engineering.py

# Step 3: Train the model
python counter_model_lgb.py
```

## Data Flow

```
GRID API JSON Files
        ↓
[data_preparation.py]
        ↓
player_stats.csv + hero_aggregates.csv
        ↓
[feature_engineering.py]
        ↓
counter_train_data.csv
        ↓
[counter_model_lgb.py]
        ↓
counter_model_lgb.pkl (trained model)
```

## Model Features

### Input Features (14 total)

**Ally Context (5 features)**:
- `ally_has_adc_core`: Whether team has ADC carry
- `ally_has_single_core`: Whether team has single damage core
- `ally_missing_cc`: Whether team lacks crowd control
- `ally_missing_frontline`: Whether team lacks tanks
- `execution_difficulty`: Team composition execution difficulty

**Hero Profile (6 features)**:
- `hero_dpm`: Damage per minute
- `hero_damage_pct`: Damage percentage of team
- `hero_forward_pct`: Forward positioning percentage
- `hero_kda`: Kill/Death/Assist ratio
- `hero_kp`: Kill participation percentage
- `hero_dpm_per_gold`: Damage efficiency

**BP Stage (3 features, one-hot)**:
- `stage_early`: Pick in early phase (1-3)
- `stage_mid`: Pick in mid phase (4-7)
- `stage_late`: Pick in late phase (8-10)

### Output

- `counter_label`: Binary label (1 = counters, 0 = doesn't counter)
- Prediction: Probability score 0-1 indicating counter strength

## Using the Trained Model

```python
import joblib
from counter_model_lgb import predict_counter_degree, apply_counter_rules

# Load model
model_data = joblib.load('counter_model_lgb.pkl')
model = model_data['model']

# Prepare input
ally_context = {
    'has_adc': 1,
    'single_core': 1,
    'missing_cc': 0,
    'missing_frontline': 0,
    'execution_difficulty': 0.6
}

hero_profile = {
    'dpm': 450.5,
    'damage_pct': 28.3,
    'forward_pct': 35.2,
    'kda': 3.2,
    'kp': 68.5,
    'dpm_per_gold': 0.15
}

# Predict counter score
score = predict_counter_degree(
    model=model,
    ally_context=ally_context,
    hero_profile=hero_profile,
    stage="Mid"
)

# Apply expert rules
hero_tags = {'assassin': True}
adjusted_score = apply_counter_rules(score, ally_context, hero_tags)

print(f"Counter Score: {adjusted_score:.2f}")
```

## Model Performance

After training, the model outputs:
- AUC score on validation set
- Classification report (precision, recall, F1)
- Confusion matrix
- Feature importance rankings

## Requirements

```bash
pip install pandas numpy lightgbm scikit-learn joblib
```

## Integration with GRID API

The pipeline is designed to work seamlessly with GRID API data:

1. Use `grid_ingame_data_fetcher.py` to fetch series data
2. Run the ML pipeline on the fetched JSON files
3. Model learns from professional match data
4. Apply predictions to your drafting assistant

## File Structure

```
scripts/ml/
├── README.md                    # This file
├── data_preparation.py          # GRID API data extraction
├── feature_engineering.py       # Feature generation
├── counter_model_lgb.py         # Model training
├── player_stats.csv             # Generated: player statistics
├── hero_aggregates.csv          # Generated: hero aggregates
├── counter_train_data.csv       # Generated: training data
└── counter_model_lgb.pkl        # Generated: trained model
```

## Notes

- The original `counter_model_lgb.py` had multiple syntax errors and no data pipeline
- This version provides a complete, working ML pipeline
- Hero role inference is simplified and should be enhanced with actual role data
- Model hyperparameters can be tuned based on your dataset size
- Consider adding more features like champion synergies and matchup history

## Future Improvements

- Add champion role/tag database
- Include champion synergy features
- Add temporal features (patch version, meta shifts)
- Implement cross-validation
- Add model versioning and A/B testing
- Create inference API endpoint
