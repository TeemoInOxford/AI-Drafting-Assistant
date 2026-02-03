# M4: Player Pool Validation

## What is Tested

This validation assesses the player pool layer that tracks champion concentration
for each professional player. The system uses pick counts and pick shares to
identify player specialties.

## Why It Matters

Player pools drive the PLAYER_SPECIALTY evidence type. They must:
- Be temporally stable (players maintain similar pools over time)
- Apply low-sample gating (players with <10 games cannot produce STRONG evidence)
- Have complete coverage with no missing fields

## Method

### Temporal Stability

1. Split games into train (70%) and test (30%) by patch
2. Build player pools from each split
3. Compute Recall@K: what fraction of test top-K champions were in train top-K

### Low-Sample Gating

Verify that players with <10 games have 0 STRONG entries.
STRONG requires pickCount >= 9 AND pickShare >= 11.1%.

### Coverage

Count total players, champion entries, and check for missing fields.

## Results

### Temporal Stability

| Period | Patches |
|--------|---------|
| Train | 14.1 - 15.5 |
| Test | 15.5 - 15.9 |

| K | Recall | Players Evaluated |
|---|--------|-------------------|
| 5 | 44.0% | 255 |
| 10 | 58.5% | 212 |

**Interpretation:** Moderate temporal stability

### Low-Sample Gating

| Metric | Value |
|--------|-------|
| Threshold | <10 games |
| Total Players | 413 |
| Low-Sample Players | 27 (6.5%) |
| STRONG from Low-Sample | 0 |
| **Status** | **PASS** |

### Coverage

| Metric | Value |
|--------|-------|
| Total Players | 413 |
| Total Champion Entries | 6525 |
| Unique Champions | 162 |
| Players with Pool | 413 |
| Avg Pool Size | 15.8 |
| Median Pool Size | 15 |

**Missing Fields:**

| Field | Missing Count |
|-------|---------------|
| playerId | 0 |
| playerName | 0 |
| totalGames | 0 |
| champions | 0 |

## Limitations

- Temporal split assumes patch ordering reflects time
- Recall@K does not account for champion meta shifts
- Low-sample gating test checks raw counts, not actual evidence layer output

---
*Generated: 2026-01-23T15:42:54.263Z*