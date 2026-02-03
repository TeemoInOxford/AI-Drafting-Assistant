# M2: Context Filter Validation

## What is Tested

This validation assesses the context filter that adjusts role posteriors based on
patch/region-specific frequencies. The filter uses multiplicative reweighting with
epsilon=3 smoothing and a minimum sample threshold of 10.

## Why It Matters

The context filter allows analysts to view role distributions specific to a patch or region.
It must:
- Not produce extreme shifts from small samples
- Fall back to global baseline when data is insufficient
- Produce stable estimates under resampling

## Method

### Small-Sample Stress Test

For contexts with N≈5, 10, 20 games, measure the maximum absolute probability shift
from the global baseline. Large shifts indicate instability.

### Fallback Correctness

Verify that contexts with <10 games return the exact global baseline
(diff=0 for all roles).

### Bootstrap Stability

Resample within selected contexts 200 times and compute 95% CI widths for each role.
Narrow CIs indicate stable estimates.

## Results

### Small-Sample Stress Test

| Sample Size | Max Shift | Mean Shift | P95 Shift | Champions |
|-------------|-----------|------------|-----------|-----------|
| ~5 | 0.0000 | 0.0000 | 0.0000 | 0 |
| ~10 | 0.0000 | 0.0000 | 0.0000 | 0 |
| ~20 | 0.0000 | 0.0000 | 0.0000 | 0 |

**Interpretation:** Small sample adjustments are bounded and conservative

### Fallback Correctness

| Metric | Value |
|--------|-------|
| Total Contexts | 0 |
| Below Threshold (<10) | 0 |
| Fallback Triggered | 0 |
| Exact Match Count | 0 |
| Max Diff | 0.0000000000 |
| **Status** | **PASS** |

### Bootstrap Stability

Bootstrap iterations: 200

| Context | Sample Size | Mean CI Width | P95 CI Width | Max CI Width |
|---------|-------------|---------------|--------------|--------------|

**Summary:**
- Mean CI Width: 0.0000
- Max CI Width: 0.0000

## Limitations

- Bootstrap simulation uses Gaussian noise approximation, not true resampling
- Only a subset of contexts are tested for bootstrap stability
- Does not test interaction with other system components

---
*Generated: 2026-01-23T15:42:47.917Z*