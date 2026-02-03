# M5: Evidence Trace Validation

## What is Tested

This validation assesses the evidence trace and strength gating system that
determines primary and secondary evidence attribution for each signal.

## Why It Matters

Evidence attribution explains WHY a champion appears in recommendations.
The system must:
- Correctly classify evidence strength at boundary values
- Apply low-sample gating consistently
- Produce deterministic, stable outputs

## Method

### Unit Tests

Test boundary values for each evidence type:
- TEAM_DENIAL: scores at 25, 35, 55
- ROLE_FLEX_PRESSURE: entropy at 0.40, 0.45
- PLAYER_SPECIALTY: pickCount at 5, 7, 10 with various pickShare
- Low-sample gating: playerGames < 10

### Explanation Stability

Run the same inputs multiple times and verify outputs are identical.

## Results

### Unit Tests

| Metric | Value |
|--------|-------|
| Total Tests | 13 |
| Passed | 13 |
| Failed | 0 |
| Pass Rate | 100.0% |

#### Test Details

| Test | Status | Expected Primary | Actual Primary |
|------|--------|------------------|----------------|
| TEAM_DENIAL score=25 (below moderate) | PASS | META_PTS | META_PTS |
| TEAM_DENIAL score=35 (moderate) | PASS | TEAM_DENIAL | TEAM_DENIAL |
| TEAM_DENIAL score=55 (strong) | PASS | TEAM_DENIAL | TEAM_DENIAL |
| ROLE_FLEX entropy=0.40 (below threshold) | PASS | META_PTS | META_PTS |
| ROLE_FLEX entropy=0.45 (above threshold) | PASS | ROLE_FLEX_PRESSURE | ROLE_FLEX_PRESSURE |
| ROLE_FLEX not flex but high entropy | PASS | META_PTS | META_PTS |
| PLAYER_SPECIALTY pickCount=5 (below moderate) | PASS | META_PTS | META_PTS |
| PLAYER_SPECIALTY pickCount=7 (moderate) | PASS | META_PTS | META_PTS |
| PLAYER_SPECIALTY pickCount=10, pickShare=0.12 (strong) | PASS | PLAYER_SPECIALTY | PLAYER_SPECIALTY |
| Low-sample player (8 games) with strong metrics | PASS | META_PTS | META_PTS |
| STRONG TEAM_DENIAL + MODERATE PLAYER_SPECIALTY | PASS | TEAM_DENIAL | TEAM_DENIAL |
| MODERATE TEAM_DENIAL + STRONG PLAYER_SPECIALTY | PASS | PLAYER_SPECIALTY | PLAYER_SPECIALTY |
| STRONG ROLE_FLEX + MODERATE TEAM_DENIAL | PASS | ROLE_FLEX_PRESSURE | ROLE_FLEX_PRESSURE |

### Explanation Stability

| Metric | Value |
|--------|-------|
| Total Signals | 4 |
| Stable Signals | 4 |
| Stability Rate | 100.0% |
| Primary Switch Rate | 0.0% |

**Interpretation:** Perfect stability: deterministic function produces consistent outputs

## Limitations

- Unit tests cover boundary values but not all combinations
- Stability test uses synthetic inputs, not real draft data
- Does not test UI rendering of evidence

---
*Generated: 2026-01-23T15:42:55.004Z*