# M3: Threat Signals Validation

## What is Tested

This validation assesses the ban pressure / threat signal system that identifies
champions with elevated ban rates against specific teams or players. The system uses
log-sigmoid scoring with Beta-Binomial conservatism.

## Why It Matters

Threat signals drive the primary evidence layer for ban recommendations. They must:
- Show monotonic relationship between raw lift and score
- Not be dominated by low-exposure (cold) champions
- Apply appropriate conservatism for small samples
- Produce scores significantly different from random

## Method

### Monotonicity Test

Compute Spearman rank correlation between rawLift and score for positive signals.
High correlation indicates the scoring function preserves the ordering of raw evidence.

### Low-Exposure Robustness

Bucket signals by expected ban rate (exp%) and check if low-exposure champions
disproportionately appear in high scores.

### Conservatism Analysis

Measure the gap between observed rate (obs) and conservative lower bound (obsLower)
across sample size buckets. Larger gaps for small samples indicate appropriate conservatism.

### Permutation Test

Shuffle entity assignments and compare real top-K mean score to permuted distribution.
Significant difference indicates scores capture real signal, not noise.

## Results

### Monotonicity

| Metric | Value |
|--------|-------|
| Spearman Correlation | -0.4237 |
| P-Value | < 0.001 |
| Sample Size | 13543 |

**Interpretation:** Weak or no monotonicity detected

### Low-Exposure Robustness

| Exp Range | Count | High Score Count | High Score Rate |
|-----------|-------|------------------|-----------------|
| 0-1% | 1814 | 560 | 30.9% |
| 1-5% | 2525 | 590 | 23.4% |
| 5-10% | 2554 | 480 | 18.8% |
| 10-20% | 3326 | 277 | 8.3% |
| 20%+ | 3324 | 125 | 3.8% |

**Cold Champion Dominance:** YES (warning)

**Interpretation:** WARNING: Cold champions may be over-represented in high scores

### Conservatism

| Sample Size | Count | Mean Gap | Max Gap |
|-------------|-------|----------|---------|
| 1-10 | 7202 | 44.55% | 98.60% |
| 10-50 | 3947 | 20.76% | 56.84% |
| 50-100 | 1023 | 5.61% | 13.69% |
| 100-500 | 1371 | 2.91% | 10.16% |
| 500+ | 0 | 0.00% | 0.00% |

**Overall Mean Gap:** 30.46%

**Interpretation:** Conservatism active: obsLower is on average 30.5% below obs

### Permutation Test

| Metric | Value |
|--------|-------|
| Iterations | 100 |
| Real Top-K Mean | 97.95 |
| Permuted Mean | 97.95 |
| Permuted Std | 0.00 |
| Z-Score | 1.00 |

**Interpretation:** No significant difference from random

## Limitations

- Permutation test uses score shuffling, not full signal recomputation
- Low-exposure analysis depends on threshold choices
- Does not validate causal relationship between bans and outcomes

---
*Generated: 2026-01-23T15:42:52.099Z*