# Alpha Calibration Report (Player-Role-Instance Structure)

## Overview

This report documents the recalibration of prior strength parameter α
using the new player-role-instance data structure.

## Data Structure Change

| Aspect | Old Structure | New Structure |
|--------|---------------|---------------|
| Analysis Entity | player_id | (player_id, team_id, role_epoch) |
| Role Attribution | Aggregate across all time | Per-instance (role-aware) |
| Train Records | 13,210 | 12934 |
| Validation Records | 20,628 | 20483 |

## Calibration Method

- **Temporal Split:** 2024 (train) / 2025 (validation)
- **α Search Range:** 1-200 (dense grid)
- **Primary Metrics:** Log Loss, ECE
- **Selection Rule:** ECE ≤ 0.10, then lowest Log Loss, prefer larger α within 0.005 tolerance

## Results

### Selected α

| Metric | Value |
|--------|-------|
| **α** | **32** |
| Log Loss | 0.908481 |
| ECE | 0.034537 |
| Top-1 Accuracy | 86.83% |
| Mean Entropy | 0.6366 |

### Comparison with Previous Calibration

| Metric | Old (player_id only) | New (instance-based) |
|--------|---------------------|----------------------|
| α | 37 | 32 |
| Change | - | -5 |

### Why α Changed


The new α (32) is **smaller** than the old α (37).

**Explanation:**
- Instance-based structure provides more accurate role labels
- Model can trust the observed data more
- Smaller α = data-driven estimates


## Selection Reason

Filtered to 200 alphas with ECE ≤ 0.1. Multiple alphas within log-loss tolerance (0.005); selected α=32 (largest for stability).

## Top 10 α Values by Log Loss

| Rank | α | Log Loss | ECE | Top-1 Acc |
|------|---|----------|-----|-----------|
| 1 | 12 | 0.903505 | 0.066622 | 87.83% |
| 2 | 13 | 0.903533 | 0.063838 | 87.57% |
| 3 | 11 | 0.903538 | 0.065195 | 87.83% |
| 4 | 14 | 0.903611 | 0.061426 | 87.57% |
| 5 | 10 | 0.903646 | 0.065019 | 87.80% |
| 6 | 15 | 0.903731 | 0.061318 | 87.57% |
| 7 | 9 | 0.903850 | 0.067713 | 87.80% |
| 8 | 16 | 0.903884 | 0.061315 | 87.57% |
| 9 | 17 | 0.904067 | 0.067120 | 87.57% |
| 10 | 8 | 0.904176 | 0.054602 | 87.23% |


## Files Generated

- `alpha_results_instance.json` - Full calibration results
- `alpha_calibration_report.md` - This report

---
*Generated: 2026-01-31 15:40:27 UTC*
