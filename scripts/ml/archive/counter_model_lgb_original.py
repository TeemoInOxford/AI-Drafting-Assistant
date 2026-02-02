# ================================
# Counter Model Training Script
# LightGBM Binary Classifier
# ================================

import pandas as pd
import lightgbm as lgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score
import joblib


# ---------- 1. 配置区 ----------

DATA_PATH = counter_train_data.csv   # 你的训练数据
MODEL_PATH = counter_model_lgb.pkl    # 模型保存路径
RANDOM_SEED = 42


FEATURES = [
    # Ally Core Context
    ally_has_adc_core,
    ally_has_single_core,
    ally_missing_cc,
    ally_missing_frontline,
    execution_difficulty,

    # Enemy Hero Profile (历史聚合画像)
    hero_dpm,
    hero_damage_pct,
    hero_forward_pct,
    hero_kda,
    hero_kp,
    hero_dpm_per_gold,

    # BP Stage (one-hot)
    stage_early,
    stage_mid,
    stage_late,
]

TARGET = counter_label


# ---------- 2. 数据加载 ----------

def load_data(path str) - pd.DataFrame
    df = pd.read_csv(path)

    missing = set(FEATURES + [TARGET]) - set(df.columns)
    if missing
        raise ValueError(fMissing columns {missing})

    return df


# ---------- 3. 训练 Counter 模型 ----------

def train_counter_model(df pd.DataFrame)
    X = df[FEATURES]
    y = df[TARGET]

    X_train, X_val, y_train, y_val = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=RANDOM_SEED,
        stratify=y
    )

    model = lgb.LGBMClassifier(
        objective=binary,
        boosting_type=gbdt,
        num_leaves=31,
        learning_rate=0.05,
        n_estimators=500,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_alpha=0.1,
        reg_lambda=0.1,
        random_state=RANDOM_SEED
    )

    model.fit(
        X_train,
        y_train,
        eval_set=[(X_val, y_val)],
        eval_metric=auc,
        early_stopping_rounds=50,
        verbose=50
    )

    val_pred = model.predict_proba(X_val)[, 1]
    auc = roc_auc_score(y_val, val_pred)

    print(fn✅ Counter Model AUC {auc.4f})

    return model


# ---------- 4. 推理函数（CounterDegree 输出） ----------

def predict_counter_degree(
    model,
    ally_context dict,
    hero_profile dict,
    stage str
) - float
    feature = {
        # Ally Core Context
        ally_has_adc_core ally_context[has_adc],
        ally_has_single_core ally_context[single_core],
        ally_missing_cc ally_context[missing_cc],
        ally_missing_frontline ally_context[missing_frontline],
        execution_difficulty ally_context[execution_difficulty],

        # Hero Profile
        hero_dpm hero_profile[dpm],
        hero_damage_pct hero_profile[damage_pct],
        hero_forward_pct hero_profile[forward_pct],
        hero_kda hero_profile[kda],
        hero_kp hero_profile[kp],
        hero_dpm_per_gold hero_profile[dpm_per_gold],

        # BP Stage
        stage_early int(stage == Early),
        stage_mid int(stage == Mid),
        stage_late int(stage == Late),
    }

    df = pd.DataFrame([feature])
    score = model.predict_proba(df)[0][1]
    return float(score)


# ---------- 5. 教练兜底规则（强烈建议） ----------

def apply_counter_rules(
    counter_score float,
    ally_context dict,
    hero_tags dict
) - float
    score = counter_score

    # 刺客打 ADC 单核
    if hero_tags.get(assassin) and ally_context.get(has_adc)
        score = max(score, 0.6)

    # 阵容前排充足，降低 Counter
    if not ally_context.get(missing_frontline)
        score = 0.85

    return min(score, 1.0)


# ---------- 6. 主入口 ----------

def main()
    print(📥 Loading data...)
    df = load_data(DATA_PATH)

    print(🧠 Training Counter model...)
    model = train_counter_model(df)

    print(f💾 Saving model to {MODEL_PATH})
    joblib.dump(model, MODEL_PATH)

    print(✅ Done.)


if __name__ == __main__
    main()