# v4-1 Complete System Documentation

## Overview

The **v4-1 Four-Layer Architecture** is a trustworthy, phase-aware AI drafting assistant for League of Legends. It provides data-driven recommendations with explicit uncertainty reporting and human-readable explanations.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     v4-1 Engine (Main)                      │
│                  Orchestrates all layers                     │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐     ┌──────────────┐
│  L0: Data    │      │ L1: Evaluate │     │ L3: Strategic│
│  - Champion  │──────▶│ - PTS        │────▶│ - Opponent   │
│    Stats     │      │ - Synergy    │     │   Prediction │
│  - Player    │      │ - Counter    │     │ - Simulation │
│    Pools     │      │ - Deny       │     │ - Optimizer  │
│  - Synergy   │      │ - Composition│     │              │
│  - Counter   │      │              │     │              │
└──────────────┘      └──────────────┘     └──────────────┘
                              │                     │
                              └──────────┬──────────┘
                                         ▼
                              ┌──────────────────┐
                              │ L2: Recommend    │
                              │ - Aggregate      │
                              │ - Classify       │
                              │ - Explain        │
                              │ - Report         │
                              │   Uncertainty    │
                              └──────────────────┘
                                         │
                                         ▼
                              ┌──────────────────┐
                              │  Final           │
                              │  Recommendations │
                              └──────────────────┘
```

## Layer Descriptions

### L0: Data Layer
**Purpose**: Provide trustworthy data with confidence scores

**Components**:
- **Champion Stats**: Pick rate, ban rate, win rate, role distribution
- **Player Pools**: Champion frequency per player
- **Synergy Matrix**: Champion pair synergies (Hard/Soft/Meta)
- **Counter Matrix**: Champion matchup counters (Hard/Soft/Meta)
- **BP History**: Historical draft sequences

**Key Features**:
- All data includes confidence scores
- Time decay weighting (recent matches weighted higher)
- Sample size validation
- 2-hour TTL caching

**Data Quality**:
- 117 champions with statistics
- 361 players with champion pools
- 1,914 synergy relations
- 1,127 counter relations
- 1,694 BP sequences

### L1: Evaluation Layer
**Purpose**: Phase-aware evaluation of champions

**Components**:
- **PTS (Pick Threat Score)**: Phase-aware threat evaluation
  - Role Vacancy, Meta Presence, Recent Trend, Synergy Ban
  - Weights change across Early/Mid/Late phases
- **Composition Evaluator**: Team balance analysis
- **Synergy Evaluator**: Champion-team synergy
- **Counter Evaluator**: Matchup analysis
- **Deny Evaluator**: Pick-to-deny value

**Phase Weights**:
| Phase | Role Vacancy | Meta | Trend | Synergy Ban |
|-------|--------------|------|-------|-------------|
| Early | 30% | 40% | 20% | 10% |
| Mid   | 35% | 20% | 15% | 30% |
| Late  | 50% | 15% | 25% | 10% |

**Output**: L1ChampionEvaluation with confidence scores

### L2: Recommendation Layer
**Purpose**: Generate human-readable recommendations

**Components**:
- **Score Aggregator**: Combines L1 (85%) + L3 (15%)
- **Recommendation Classifier**: 5-tier classification
  - MustPick (≥0.80), Strong (≥0.65), Stable (≥0.50), Situational (≥0.35), Avoid (<0.35)
- **Reason Generator**: Explains recommendations
  - Why Pick (up to 3 reasons)
  - Why Not (up to 2 reasons)
  - What If (scenario description)
- **Uncertainty Reporter**: Detects 4 types of uncertainty
  - Low Confidence, Insufficient Data, High Variance, Conflicting Signals

**Output**: Recommendation with tier, reasons, and uncertainties

### L3: Strategic Layer
**Purpose**: Bounded game-theoretic optimization

**Components**:
- **Opponent Predictor**: Predicts opponent picks with entropy
  - Player pool (40%), Meta (25%), Role fit (20%), Synergy (15%)
- **BP Simulator**: 2-3 turn lookahead with Monte Carlo
  - Simulates 100 paths, aggregates top 5
- **Game Optimizer**: Strategic value calculation
  - Flex value, Information value, Counterplay value, Tempo value
- **Confidence Gate**: Only applies if confidence ≥ 0.50

**Adjustments**: Bounded to ±0.20 range

**Output**: L3Adjustments with confidence gating

## Usage

### Basic Usage

```typescript
import { generateV4Recommendations } from './app/lib/v4/engine';

// Generate recommendations
const result = await generateV4Recommendations(
  bpState,           // Current BP state
  currentStep,       // Current BP step
  'blue',            // Our side
  availableChampions // Available champions
);

// Display top 5
for (let i = 0; i < 5; i++) {
  const rec = result.recommendations[i];
  console.log(`${i + 1}. ${rec.champion.name} [${rec.tier}]`);
  console.log(`   Score: ${rec.finalScore.toFixed(3)}`);
  console.log(`   Confidence: ${(rec.confidence * 100).toFixed(1)}%`);

  // Show reasons
  rec.whyPick.forEach(r => console.log(`   ✓ ${r.text}`));

  // Show uncertainties
  rec.uncertainties.forEach(u => {
    console.log(`   ⚠️ [${u.severity}] ${u.message}`);
  });
}
```

### Quick Recommendations (No L3)

```typescript
import { generateQuickRecommendations } from './app/lib/v4/engine';

// Faster, skips strategic analysis
const result = await generateQuickRecommendations(
  bpState,
  currentStep,
  'blue',
  availableChampions
);
```

### Custom Configuration

```typescript
const result = await generateV4Recommendations(
  bpState,
  currentStep,
  'blue',
  availableChampions,
  opponentPlayerIds, // Optional
  {
    enableL3: true,
    l1Config: {
      ptsThresholds: { critical: 70, high: 50, moderate: 30 },
      // ... other L1 config
    },
    l2Config: {
      l1Weight: 0.85,
      l3Weight: 0.15,
      // ... other L2 config
    },
    l3Config: {
      enabled: true,
      minConfidence: 0.50,
      maxAdjustment: 0.20,
      // ... other L3 config
    },
  }
);
```

## File Structure

```
app/lib/v4/
├── types/
│   ├── common-types.ts          # Foundation types
│   ├── l0-types.ts              # L0 data types
│   ├── l1-types.ts              # L1 evaluation types
│   ├── l2-types.ts              # L2 recommendation types
│   └── l3-types.ts              # L3 strategic types
├── core/
│   └── draft-state.ts           # DraftState management
├── l0-data/
│   ├── champion-stats.ts        # Champion statistics
│   ├── player-pools.ts          # Player champion pools
│   ├── synergy-matrix.ts        # Synergy matrix
│   ├── counter-matrix.ts        # Counter matrix
│   ├── bp-history-parser.ts    # BP history
│   ├── index.ts                 # L0 public API
│   └── test-l0.ts               # L0 tests
├── l1-evaluation/
│   ├── pts-evaluator.ts         # Phase-aware PTS
│   ├── composition-evaluator.ts # Composition analysis
│   ├── synergy-evaluator.ts     # Synergy evaluation
│   ├── counter-evaluator.ts     # Counter evaluation
│   ├── deny-evaluator.ts        # Deny evaluation
│   ├── index.ts                 # L1 public API
│   ├── test-l1.ts               # L1 tests
│   └── README.md                # L1 documentation
├── l2-recommendation/
│   ├── score-aggregator.ts      # L1 + L3 aggregation
│   ├── recommendation-classifier.ts # Tier classification
│   ├── reason-generator.ts      # Explanation generation
│   ├── uncertainty-reporter.ts  # Uncertainty detection
│   ├── index.ts                 # L2 public API
│   ├── test-l2.ts               # L2 tests
│   └── README.md                # L2 documentation
├── l3-strategic/
│   ├── opponent-predictor.ts    # Opponent prediction
│   ├── bp-simulator.ts          # BP simulation
│   ├── game-optimizer.ts        # Strategic optimization
│   ├── index.ts                 # L3 public API
│   └── README.md                # L3 documentation
├── engine.ts                    # Main orchestrator
├── test-v4-integration.ts       # Integration tests
└── README.md                    # This file
```

## Performance

| Layer | Time | Notes |
|-------|------|-------|
| L0 | 2-26s (first), <1ms (cached) | One-time load, then instant |
| L1 | 10-50ms | Per champion evaluation |
| L2 | 10-30ms | Aggregation and classification |
| L3 | 50-200ms | Strategic analysis (optional) |
| **Total** | **~100-300ms** | With L3 enabled |
| **Quick** | **~50-100ms** | Without L3 |

## Testing

```bash
# Test L0 data layer
npx tsx app/lib/v4/l0-data/test-l0.ts

# Test L1 evaluation
npx tsx app/lib/v4/l1-evaluation/test-l1.ts

# Test L2 recommendations
npx tsx app/lib/v4/l2-recommendation/test-l2.ts

# Test complete integration
npx tsx app/lib/v4/test-v4-integration.ts
```

## Design Principles

### 1. Trustworthiness
- All scores include confidence values
- Explicit uncertainty reporting
- Data quality indicators
- No evaluation without sufficient data

### 2. Phase-Aware
- PTS semantics change across Early/Mid/Late
- Different priorities at different stages
- Adaptive weight configurations

### 3. Bounded Game Theory
- L3 provides adjustments, not rankings
- Bounded to ±0.20 range
- Confidence gating prevents low-quality L3

### 4. Explainability
- Human-readable reasons (Why Pick, Why Not, What If)
- Structured explanations with importance scores
- Clear reasoning for all recommendations

### 5. Layer Separation
- L1 never depends on L3
- Each layer has clear responsibilities
- Independent testing and validation

## Key Features

✅ **Data-Driven**: 1,694 games, 117 champions, 361 players
✅ **Confidence Scores**: All evaluations include confidence
✅ **Phase-Aware**: Adapts to draft progression
✅ **Explainable**: Why pick, why not, what if
✅ **Uncertainty Reporting**: 4 types of uncertainty detected
✅ **Strategic Analysis**: Opponent prediction, simulation, optimization
✅ **Bounded Adjustments**: L3 limited to ±0.20
✅ **Confidence Gating**: L3 only applied if reliable
✅ **Fast**: ~100-300ms total (with caching)

## Limitations

1. **L3 Simulation**: Simplified 2-3 turn lookahead
2. **Player Pools**: Requires opponent player IDs for best results
3. **Data Freshness**: 2-hour cache TTL
4. **Sample Size**: Some champions have limited data
5. **Role Inference**: Heuristic-based role detection

## Future Improvements

1. **Deeper Simulation**: Extend to 4-5 turns
2. **Machine Learning**: Replace heuristics with learned models
3. **Real-time Updates**: Reduce cache TTL
4. **More Data**: Integrate additional data sources
5. **Role Detection**: Improve with champion-specific data
6. **UI Integration**: Connect to frontend
7. **Historical Validation**: Validate against pro matches

## Credits

**Architecture**: v4-1 Four-Layer Design
**Implementation**: Complete L0-L3 + Engine
**Date**: 2026-01-30

---

**Status**: ✅ Complete and Tested
**Version**: 1.0.0
