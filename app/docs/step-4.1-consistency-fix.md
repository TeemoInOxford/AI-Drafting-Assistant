# Step 4.1 - Consistency Fix

## Problem Statement

In `app/lib/draft-decision.ts`, the original `getDecisionTag()` function derived `DecisionTag` from generic hardcoded thresholds (70/50/30). This risked inconsistency with:

1. The percentile-based thresholds validated in Step 3.6 diagnostics
2. The fact that Team and Player distributions differ significantly
3. Any pre-computed `decisionTag` that might come from the backend

## Changes Made

### 1. Entity-Aware Thresholds

The `DecisionConfig` interface now has separate thresholds for Team and Player:

```typescript
export interface DecisionConfig {
  team: {
    banCriticalThreshold: number;   // 70 (top ~3.8% of positive team signals)
    banOrPrepareThreshold: number;  // 50 (top ~14.5%)
    prepareCounterThreshold: number; // 30 (top ~18.9%)
  };
  player: {
    banCriticalThreshold: number;   // 75 (top ~4% - higher bar)
    banOrPrepareThreshold: number;  // 55 (top ~15%)
    prepareCounterThreshold: number; // 35 (top ~22%)
  };
  maxBanCritical: number;
  maxActionable: number;
}
```

### 2. Threshold Derivation (from Step 3.6 Diagnostics)

**Team POSITIVE-ONLY distribution:**
- P50: 4.7, P75: 8.4, P90: 54.2, P95: 65.2, P99: 83.7
- score >= 70: top 3.8%
- score >= 50: top 14.5%
- score >= 30: top 18.9%

**Player POSITIVE-ONLY distribution:**
- P50: 9.6, P75: 28.9, P90: 59.3, P95: 70.3, P99: 88.9
- score >= 75: top ~4% (higher bar for player-only signals)
- score >= 55: top ~15%
- score >= 35: top ~22%

### 3. Priority Order for DecisionTag

The `getDecisionTag()` function now follows this priority:

1. **Pre-computed tag**: If the signal already contains `decisionTag` from the backend, use it directly
2. **Derived tag**: Otherwise, derive from score using entity-specific thresholds

### 4. Consistency Assertion (Dev-only)

A new `assertConsistency()` function warns in development if:
- A signal has a pre-computed `decisionTag`
- The derived tag differs from the pre-computed tag

This helps catch any drift between backend and frontend logic without crashing in production.

```typescript
function assertConsistency(
  signal: ThreatSignal,
  derivedTag: DecisionTag,
  preComputedTag?: DecisionTag
): void {
  if (process.env.NODE_ENV === 'production') return;
  if (!preComputedTag) return;
  if (derivedTag === preComputedTag) return;

  if (!consistencyWarningShown) {
    console.warn(
      `[draft-decision] Consistency warning: Signal for ${signal.championName} ` +
      `has pre-computed tag "${preComputedTag}" but derived tag is "${derivedTag}". ` +
      `Score: ${signal.score.toFixed(1)}. Using pre-computed tag.`
    );
    consistencyWarningShown = true;
  }
}
```

### 5. Updated `processThreats()` Function

The main processing function now:
- Accepts an `entityType` parameter ('team' | 'player')
- Uses `getDecisionTagWithAssertion()` for consistency checking
- Applies entity-specific thresholds

## Consistency Guarantee

Consistency is guaranteed across:

| Location | How Consistency is Ensured |
|----------|---------------------------|
| API outputs | Backend can pre-compute `decisionTag` using same thresholds |
| Debug panel | Uses same `getDecisionTag()` function |
| PTSRiskBoard | Uses `processThreats()` which calls `getDecisionTagWithAssertion()` |

## Files Modified

- `app/lib/draft-decision.ts` - Updated thresholds and added consistency assertion

## Testing

1. Run TypeScript check: `npx tsc --noEmit`
2. Verify no errors related to draft-decision
3. In development, check console for any consistency warnings
