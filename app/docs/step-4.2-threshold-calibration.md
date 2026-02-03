# Step 4.2 + 4.3 — Threshold Calibration & Sanity Checks

## Overview

This document explains the data-driven calibration of evidence strength thresholds for the Evidence Trace Layer. All thresholds are derived from actual data distributions, not arbitrary hand-picked values.

## Step 4.3 Additions

### Coverage Disclosure

The calibration script now outputs coverage information:
- Champions with Bayesian posterior
- Champions with pro game data
- Total players in pool
- Low-sample player count and percentage

### Entropy Sanity Report

Top 20 and Bottom 20 champions by entropy are displayed with their role distributions to verify:
- High entropy champions should be known flex picks
- Low entropy champions should be single-role specialists

### Low-Sample Player Gating

Players with fewer than 10 games are considered "low-sample":
- Their PLAYER_SPECIALTY strength is capped at MODERATE (never STRONG)
- This prevents over-attribution from small sample sizes
- Implemented in `getPlayerSpecialtyStrength()` function

## Entropy Definition

### Shannon Entropy (H)

For a role probability distribution P = {p_top, p_jungle, p_mid, p_bot, p_support}:

```
H = -Σ p_i * ln(p_i)  for p_i > 0
```

### Normalized Entropy (H_norm)

To get a [0, 1] range:

```
H_norm = H / ln(5)
```

Where ln(5) ≈ 1.609 is the maximum entropy (uniform distribution over 5 roles).

**Interpretation:**
- H_norm = 0: Single role (no ambiguity)
- H_norm = 1: Uniform distribution (maximum ambiguity)

### Implementation

See `app/lib/entropy-utils.ts` for the canonical implementation:

```typescript
export function calculateNormalizedRoleEntropy(distribution): number
```

## ROLE_FLEX_PRESSURE Threshold

### Data Source

`data/lol/bayesian-role-posteriors.json` - 162 champions with Bayesian role posteriors.

### Distribution Summary

| Percentile | H_norm |
|------------|--------|
| P50 | 0.1824 |
| P75 | 0.3777 |
| P85 | 0.4435 |
| P90 | 0.5497 |
| P95 | 0.6566 |

### Selected Threshold

**P85 = 0.4435**

- Champions with H_norm >= 0.4435 are considered STRONG FLEX
- This captures the top 16% of champions by role entropy
- Examples near threshold: Xerath (0.40), Vladimir (0.41), Zed (0.41)

### Why P85?

- P90/P95 would be too restrictive (only 10-5% of champions)
- P75 would be too inclusive (25% of champions)
- P85 provides a reasonable balance: ~16% of champions qualify as STRONG FLEX

### Top Flex Champions (by entropy)

1. Bel'Veth: 0.9962
2. Kog'Maw: 0.9744
3. Mel: 0.9605
4. Kha'Zix: 0.9598
5. Dr. Mundo: 0.9577

## PLAYER_SPECIALTY Threshold

### Data Source

`data/lol/player-pools.json` - 6,525 (player, champion) entries.

### Distribution Summary

**pickCount:**
| Percentile | Value |
|------------|-------|
| P50 | 3 |
| P75 | 6 |
| P85 | 9 |
| P90 | 11 |
| P95 | 16 |

**pickShare:**
| Percentile | Value |
|------------|-------|
| P50 | 4.9% |
| P75 | 8.7% |
| P85 | 11.1% |
| P90 | 13.0% |
| P95 | 16.7% |

### Selected Thresholds

**STRONG:** pickCount >= 9 AND pickShare >= 11.1% (P85 for both)
**MODERATE:** pickCount >= 6 (P75)

### Why P85 for STRONG?

- P90 was too restrictive (only 2.6% of entries)
- P85 gives ~5.4% STRONG entries, which is reasonable
- Requires BOTH high count AND high share to avoid false positives

### Why P75 for MODERATE?

- P75 captures entries with meaningful sample size (6+ picks)
- Results in ~23% MODERATE entries
- Provides useful secondary evidence without over-attribution

### Top STRONG Specialty Examples

1. Peanut - Sejuani: 40 picks (16.5%)
2. Delight - Rell: 38 picks (15.9%)
3. PerfecT - K'Sante: 37 picks (18.0%)
4. Lehends - Nautilus: 37 picks (15.9%)
5. Faker - Azir: 35 picks (14.0%)

## Why This Is Non-Arbitrary

1. **Percentile-based**: Thresholds are derived from actual data distributions, not guessed values.

2. **Documented calibration**: The calibration script (`app/scripts/calibrate-evidence-thresholds.ts`) can be re-run to update thresholds when data changes.

3. **Metadata preserved**: `app/lib/evidence-thresholds.json` stores:
   - Calibration date
   - Percentile used
   - Full distribution summary
   - Sample sizes
   - Resulting percentages

4. **Validation checks**: The calibration script validates that STRONG percentages are in reasonable ranges (5-30%).

## Recalibration

To recalibrate thresholds with updated data:

```bash
npx tsx app/scripts/calibrate-evidence-thresholds.ts
```

This will:
1. Read latest data files
2. Compute distributions
3. Output new thresholds
4. Update `evidence-thresholds.json`

## Invariants Preserved

- ✅ PTS scores unchanged
- ✅ Ban candidate ranking unchanged
- ✅ Decision engine ordering unchanged
- ✅ Only evidence attribution affected
