# Data Quality Assurance Report

## What is Tested

This report validates data integrity across all datasets used by the LoL Draft Assistant system.
It checks for null/undefined values, confirms no random imputation occurs, and documents data coverage.

## Why It Matters

Data quality directly impacts the reliability of all downstream analyses. Missing or imputed values
could lead to incorrect probability estimates or misleading evidence attribution. This report ensures
that all data used by the system is complete and unmodified from source.

## Method

For each dataset:
1. Load the JSON file and enumerate all records
2. Check key fields for null, undefined, or empty values
3. Verify no random imputation (e.g., posteriors sum to 1.0)
4. Document coverage dates and record counts

## Results

### Summary

| Metric | Value |
|--------|-------|
| Run Date | 2026-01-23T15:42:40.851Z |
| Total Datasets | 6 |
| Total Records | 16,045 |
| Total Null Fields | 0 |
| Total Missing Fields | 21262 |
| Imputation Check | **PASS** |

### Per-Dataset Analysis

#### states

| Property | Value |
|----------|-------|
| File | states.json |
| Size | 111.9 MB |
| Records | 1,488 |

**Field Coverage:**

| Field | Present | Null | Undefined | Coverage |
|-------|---------|------|-----------|----------|
| gameId | 0 | 0 | 1488 | 0.0% |
| platformGameId | 0 | 0 | 1488 | 0.0% |
| state.patch | 0 | 0 | 1488 | 0.0% |
| state.blueTeam.id | 0 | 0 | 1488 | 0.0% |
| state.redTeam.id | 0 | 0 | 1488 | 0.0% |
| state.blueTeam.bans | 0 | 0 | 1488 | 0.0% |
| state.redTeam.bans | 0 | 0 | 1488 | 0.0% |
| state.blueTeam.picks | 0 | 0 | 1488 | 0.0% |
| state.redTeam.picks | 0 | 0 | 1488 | 0.0% |

#### bayesian-role-posteriors

| Property | Value |
|----------|-------|
| File | bayesian-role-posteriors.json |
| Size | 33.9 KB |
| Records | 162 |

**Field Coverage:**

| Field | Present | Null | Undefined | Coverage |
|-------|---------|------|-----------|----------|
| posterior.top | 162 | 0 | 0 | 100.0% |
| posterior.jungle | 162 | 0 | 0 | 100.0% |
| posterior.mid | 162 | 0 | 0 | 100.0% |
| posterior.bot | 162 | 0 | 0 | 100.0% |
| posterior.support | 162 | 0 | 0 | 100.0% |
| observedMatches | 162 | 0 | 0 | 100.0% |
| alpha | 162 | 0 | 0 | 100.0% |

#### player-pools

| Property | Value |
|----------|-------|
| File | player-pools.json |
| Size | 4.1 MB |
| Records | 6,525 |

**Field Coverage:**

| Field | Present | Null | Undefined | Coverage |
|-------|---------|------|-----------|----------|
| playerId | 6525 | 0 | 0 | 100.0% |
| playerName | 6525 | 0 | 0 | 100.0% |
| totalGames | 6525 | 0 | 0 | 100.0% |
| championId | 6525 | 0 | 0 | 100.0% |
| championName | 6525 | 0 | 0 | 100.0% |
| pickCount | 6525 | 0 | 0 | 100.0% |
| pickRateWithinPlayer | 6525 | 0 | 0 | 100.0% |

**Notes:**

- 27 players have <10 games (low-sample gating applies)

#### threat-signals

| Property | Value |
|----------|-------|
| File | threat-signals.json |
| Size | 172.6 MB |
| Records | 0 |

**Field Coverage:**

| Field | Present | Null | Undefined | Coverage |
|-------|---------|------|-----------|----------|
| championId | 0 | 0 | 0 | 0.0% |
| championName | 0 | 0 | 0 | 0.0% |
| entityType | 0 | 0 | 0 | 0.0% |
| entityId | 0 | 0 | 0 | 0.0% |
| score | 0 | 0 | 0 | 0.0% |
| rawLift | 0 | 0 | 0 | 0.0% |
| obsLower | 0 | 0 | 0 | 0.0% |
| exp | 0 | 0 | 0 | 0.0% |
| n | 0 | 0 | 0 | 0.0% |

**Notes:**

- Score distribution: 0 positive, 0 zero, 0 negative

#### ban-baselines

| Property | Value |
|----------|-------|
| File | ban-baselines.json |
| Size | 1.1 MB |
| Records | 0 |

**Field Coverage:**

| Field | Present | Null | Undefined | Coverage |
|-------|---------|------|-----------|----------|
| championId | 0 | 0 | 0 | 0.0% |
| championName | 0 | 0 | 0 | 0.0% |
| totalBans | 0 | 0 | 0 | 0.0% |
| totalGames | 0 | 0 | 0 | 0.0% |
| banRate | 0 | 0 | 0 | 0.0% |

#### patch-region-stats

| Property | Value |
|----------|-------|
| File | patch-region-stats.json |
| Size | 549.6 KB |
| Records | 7,870 |
| Coverage | Aatrox to Zyra |

**Field Coverage:**

| Field | Present | Null | Undefined | Coverage |
|-------|---------|------|-----------|----------|
| patch | 7870 | 0 | 0 | 100.0% |
| region | 7870 | 0 | 0 | 100.0% |
| championName | 7870 | 0 | 0 | 100.0% |
| games | 0 | 0 | 7870 | 0.0% |

**Notes:**

- Patches covered: 162 (Aatrox to Zyra)
- Regions covered: global, byPatch, byRegion, gamesByPatch, gamesByRegion

## Limitations

- This report checks structural integrity only, not semantic correctness
- Field coverage is based on key fields; not all fields are enumerated
- Date coverage is derived from patch strings, not actual timestamps

---
*Generated: 2026-01-23T15:42:40.851Z*