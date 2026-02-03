# Validation & Diagnostics Index

## Overview

This document provides a comprehensive validation suite for the LoL Draft Assistant system.
All validations focus on reliability, stability, calibration, and correctness—not win rate prediction.

## What is Tested

| Module | Description | Report |
|--------|-------------|--------|
| Data QA | Data integrity, null checks, imputation verification | [data-qa.md](./data-qa.md) |
| M1 Role Posterior | Bayesian role distribution calibration | [m1-role-posterior.md](./m1-role-posterior.md) |
| M2 Context Filter | Patch/region reweighting stability | [m2-context-filter.md](./m2-context-filter.md) |
| M3 Threat Signals | Ban pressure signal validity | [m3-threat-signals.md](./m3-threat-signals.md) |
| M4 Player Pool | Player champion pool consistency | [m4-player-pool.md](./m4-player-pool.md) |
| M5 Evidence Trace | Evidence attribution correctness | [m5-evidence-trace.md](./m5-evidence-trace.md) |
| M6 Draft Decision | Draft state machine safety | [m6-draft-decision.md](./m6-draft-decision.md) |

## Why It Matters

This validation suite ensures:

1. **Data Integrity**: No random imputation, complete coverage disclosure
2. **Model Calibration**: Predictions match observed frequencies
3. **Stability**: Outputs are consistent under resampling and temporal shifts
4. **Safety**: Actions cannot be triggered accidentally
5. **Conservatism**: Small samples do not produce overconfident outputs

## Latest Run Summary

| Metric | Value |
|--------|-------|
| Run Date | 2026-01-23T15:42:39.843Z |
| Total Modules | 7 |
| Duration | 16.0s |
| **Overall Status** | **PASS** |

### Module Results

| Module | Status | Duration |
|--------|--------|----------|
| Data QA | ✓ PASS | 4.6s |
| M1 Role Posterior | ✓ PASS | 2.5s |
| M2 Context Filter | ✓ PASS | 1.0s |
| M3 Threat Signals | ✓ PASS | 4.3s |
| M4 Player Pool | ✓ PASS | 2.1s |
| M5 Evidence Trace | ✓ PASS | 0.7s |
| M6 Draft Decision | ✓ PASS | 0.8s |

## Key Results

### M1: Role Posterior

- Temporal split validation with 70/30 train/test
- Log loss, Brier score, and accuracy metrics
- ECE (Expected Calibration Error) analysis
- Alpha sensitivity analysis

### M2: Context Filter

- Small-sample stress test (N=5, 10, 20)
- Fallback correctness verification (sample < 10 → exact baseline)
- Bootstrap stability with 95% CI widths

### M3: Threat Signals

- Monotonicity (Spearman correlation between rawLift and score)
- Low-exposure robustness (cold champions do not dominate)
- Conservatism analysis (obs vs obsLower gap)
- Permutation test (real vs shuffled top-K)

### M4: Player Pool

- Temporal stability (Recall@5, Recall@10)
- Low-sample gating (players < 10 games cannot produce STRONG)
- Coverage disclosure

### M5: Evidence Trace

- Deterministic unit tests for boundary values
- Explanation stability (100% deterministic)

### M6: Draft Decision

- State machine tests for all phases
- Action safety (view never triggers ban)
- Phase transition validation

## Limitations

This validation suite:

- Does NOT predict win rates or meta shifts
- Does NOT claim causal relationships
- Does NOT test UI rendering or network behavior
- Uses simulated inputs for some tests

## Running the Suite

```bash
# Run all validations
npm run validate:all

# Run individual modules
npx tsx app/scripts/data-qa.ts
npx tsx app/scripts/validate-m1-role-posterior.ts
npx tsx app/scripts/validate-m2-context-filter.ts
npx tsx app/scripts/validate-m3-threat-signals.ts
npx tsx app/scripts/validate-m4-player-pool.ts
npx tsx app/scripts/validate-m5-evidence-trace.ts
npx tsx app/scripts/validate-m6-draft-decision.ts
```

## Data Coverage

All validations use data from:
- Professional matches: 2024-01 to 2025-09
- Patches: 14.1 through 15.18
- Regions: LCK, LPL, LEC, LCS, LTA, International

---
*Generated: 2026-01-23T15:42:39.843Z*