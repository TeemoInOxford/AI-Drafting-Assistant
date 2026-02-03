# M6: Draft Decision Layer Validation

## What is Tested

This validation assesses the draft decision layer that manages:
- Evidence visibility based on draft phase
- Action panel availability and mode
- Action safety (view vs ban vs pick)

## Why It Matters

The draft decision layer ensures:
- Ban evidence is shown during ban phases (1-3, 4-5)
- Pick evidence is shown during pick phases
- Actions can only be taken on the correct turn
- View actions never trigger bans or picks

## Method

### State Machine Tests

Verify evidence visibility rules for each phase:
- Ban Phase 1 (steps 1-6): showBanEvidence=true
- Pick Phase 1 (steps 7-12): showBanEvidence=false, showPickEvidence=true
- Ban Phase 2 (steps 13-16): showBanEvidence=true
- Pick Phase 2 (steps 17-20): showPickEvidence=true

### Action Safety Tests

Verify that:
- View action never affects champions
- Ban action only succeeds on our ban turn
- Pick action only succeeds on our pick turn

## Results

### State Machine Tests

| Metric | Value |
|--------|-------|
| Total Tests | 9 |
| Passed | 9 |
| Failed | 0 |

| Test | Phase | Status |
|------|-------|--------|
| Ban Phase 1 - blue-ban-1 shows ban evidence | ban-phase-1 | PASS |
| Ban Phase 1 - blue-ban-1 shows action panel for blue | ban-phase-1 | PASS |
| Ban Phase 1 - blue-ban-1 hides action panel for red | ban-phase-1 | PASS |
| Pick Phase 1 - blue-pick-1 hides ban evidence | pick-phase-1 | PASS |
| Pick Phase 1 - blue-pick-1 shows pick evidence | pick-phase-1 | PASS |
| Pick Phase 1 - blue-pick-1 shows action panel in pick mode | pick-phase-1 | PASS |
| Ban Phase 2 - red-ban-4 shows ban evidence again | ban-phase-2 | PASS |
| Ban Phase 2 - blue-ban-4 shows action panel for blue | ban-phase-2 | PASS |
| Complete - hides all evidence and action panel | complete | PASS |

### Action Safety Tests

| Metric | Value |
|--------|-------|
| Total Tests | 7 |
| Passed | 7 |
| Failed | 0 |

| Test | Action | Expected | Status |
|------|--------|----------|--------|
| View action does not trigger ban | view | No champion affected | PASS |
| View action does not trigger pick | view | No champion affected | PASS |
| Ban action only works on our ban turn | ban | Ban succeeds | PASS |
| Ban action fails on opponent turn | ban | Ban fails | PASS |
| Ban action fails during pick phase | ban | Ban fails | PASS |
| Pick action only works on our pick turn | pick | Pick succeeds | PASS |
| Pick action fails during ban phase | pick | Pick fails | PASS |

### Phase Transitions

| Metric | Value |
|--------|-------|
| Total Transitions | 23 |
| Valid Transitions | 20 |
| Invalid Transitions Tested | 3 |

## Limitations

- Tests use simulated state, not actual UI interactions
- Does not test network latency or race conditions
- Does not test undo/redo functionality

---
*Generated: 2026-01-23T15:42:55.794Z*