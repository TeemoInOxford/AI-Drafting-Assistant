# M1: Role Posterior Validation

## What is Tested

This validation assesses the Bayesian role posterior model that estimates the probability
distribution of roles for each champion. The model uses a Dirichlet-Multinomial conjugate
prior with strength parameter alpha.

## Why It Matters

Role posteriors are foundational to the system. They determine:
- Role flexibility evidence (entropy-based)
- Context filter adjustments
- Draft state interpretation

Poor calibration would lead to overconfident or underconfident role predictions.

## Method

### Temporal Split Validation

1. Sort all games by patch version
2. Use first 70% for training, last 30% for testing
3. Build posteriors on training data only
4. Evaluate predictions on held-out test data

### Metrics

- **Log Loss**: Measures prediction confidence calibration
- **Brier Score**: Measures probability accuracy
- **Accuracy**: Top-1 role prediction accuracy
- **ECE**: Expected Calibration Error
- **MCE**: Maximum Calibration Error

## Results

### Temporal Split

| Period | Patches | Games |
|--------|---------|-------|
| Train | 14.1 - 15.5 | 2,412 |
| Test | 15.5 - 15.9 | 1,034 |

### Overall Metrics

| Metric | Value |
|--------|-------|
| Log Loss | 1.4784 |
| Brier Score | 0.4187 |
| Accuracy | 56.9% |

### Calibration

| Metric | Value | Interpretation |
|--------|-------|----------------|
| ECE | 0.0849 | Acceptable |
| MCE | 0.3107 | Maximum bucket deviation |

#### Calibration Buckets

| Predicted Range | Predicted Mean | Observed Freq | Count | Gap |
|-----------------|----------------|---------------|-------|-----|
| 0.0-0.1 | 0.038 | 0.101 | 33750 | 0.063 |
| 0.1-0.2 | 0.132 | 0.131 | 5377 | 0.001 |
| 0.2-0.3 | 0.241 | 0.170 | 1188 | 0.071 |
| 0.3-0.4 | 0.355 | 0.292 | 657 | 0.062 |
| 0.4-0.5 | 0.460 | 0.444 | 725 | 0.016 |
| 0.5-0.6 | 0.551 | 0.572 | 975 | 0.022 |
| 0.6-0.7 | 0.665 | 0.564 | 1205 | 0.100 |
| 0.7-0.8 | 0.753 | 0.517 | 1818 | 0.237 |
| 0.8-0.9 | 0.848 | 0.594 | 2802 | 0.255 |
| 0.9-1.0 | 0.920 | 0.609 | 2478 | 0.311 |

### Alpha Sensitivity

| Alpha | Log Loss | Mean Entropy | Stability |
|-------|----------|--------------|-----------|
| 10 | 1.8137 | 0.5178 | 0.9149 |
| 25 | 1.6131 | 0.6266 | 0.9210 |
| 50 | 1.4784 | 0.7127 | 0.9361 |
| 100 | 1.3772 | 0.7975 | 0.9567 |

**Recommendation:** alpha=100 achieves lowest log loss (1.3772)

### Top Champions by Test Games

| Champion | Test Games | Log Loss | Brier | Accuracy |
|----------|------------|----------|-------|----------|
| Xin Zhao | 303 | 1.5118 | 0.3708 | 61.7% |
| Rumble | 294 | 1.4012 | 0.3618 | 62.6% |
| Alistar | 282 | 1.5755 | 0.3693 | 62.1% |
| Rell | 264 | 1.6145 | 0.3731 | 62.1% |
| Taliyah | 261 | 1.6323 | 0.4153 | 56.3% |
| Wukong | 256 | 1.1963 | 0.3530 | 64.1% |
| Rakan | 246 | 1.5538 | 0.3675 | 62.2% |
| Sion | 240 | 1.0897 | 0.3191 | 68.3% |
| Corki | 232 | 2.3961 | 0.6906 | 14.2% |
| Ambessa | 220 | 1.2824 | 0.3588 | 62.7% |

## Limitations

- Temporal split assumes patch ordering reflects time; actual dates not used
- Champions with few test games have high variance in per-champion metrics
- This validation does not assess context filter adjustments

---
*Generated: 2026-01-23T15:42:46.838Z*