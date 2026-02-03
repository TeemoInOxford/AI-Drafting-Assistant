# CFR-Based Ban/Pick Engine

A game-theory-based decision system for League of Legends Ban/Pick phase using Counterfactual Regret Minimization (CFR) and online learning.

## Overview

This engine implements the algorithms described in `docs/ban-pick-algorithm.md`, combining:
- **Offline CFR Training**: Pre-computed strategies for common scenarios
- **Online Lookahead Search**: Real-time 2-step forward simulation
- **Bayesian Belief Update**: Opponent modeling and adaptation
- **Hybrid Decision Making**: Intelligent combination of offline and online approaches

## Architecture

```
cfr-engine/
├── types.ts                    # Core type definitions
├── models/
│   ├── GameTree.ts            # Game tree representation
│   ├── Strategy.ts            # CFR strategy management
│   └── OpponentModel.ts       # Opponent behavior tracking
├── algorithms/
│   ├── BeliefUpdate.ts        # Bayesian inference
│   ├── LookaheadSearch.ts     # N-step forward simulation
│   └── MCCFRSolver.ts         # CFR training algorithm
├── engines/
│   ├── OnlineEngine.ts        # Real-time decision making
│   ├── OfflineEngine.ts       # CFR training orchestration
│   └── HybridBanPickEngine.ts # Main orchestrator
├── utils/
│   ├── StateAbstraction.ts    # State space reduction
│   └── PerformanceMonitor.ts  # Performance tracking
└── index.ts                    # Public API
```

## Quick Start

### Basic Usage

```typescript
import { HybridBanPickEngine } from '@/lib/cfr-engine';

// Create engine
const engine = new HybridBanPickEngine();

// Make a decision
const result = await engine.makeDecision({
  state: currentBPState,
  opponentModel: engine.getOnlineEngine().getOpponentModel(),
  availableChampions: champions,
  useOffline: true,
  timeLimit: 500,
});

console.log(`Recommended: ${result.action}`);
console.log(`Confidence: ${result.confidence}`);
console.log(`Reasoning: ${result.reasoning.join(', ')}`);
```

### With Offline Training

```typescript
// One-time training (can be done offline)
await engine.trainOfflineStrategies(availableChampions);

// Use trained strategies during draft
const result = await engine.makeDecision({
  state: currentBPState,
  opponentModel: engine.getOnlineEngine().getOpponentModel(),
  availableChampions: champions,
  useOffline: true, // Enable offline strategy usage
  timeLimit: 500,
});
```

### Opponent Modeling

```typescript
// Update opponent model after observing their action
engine.updateOpponentModel(
  champion,
  'pick', // or 'ban'
  round,
  currentState
);

// Get opponent insights
const opponentModel = engine.getOnlineEngine().getOpponentModel();
const mostLikelyStyle = opponentModel.getMostLikelyStyle();
const preferences = opponentModel.getChampionPreferences();
```

## Core Algorithms

### 1. Belief Update (Bayesian Inference)

Updates beliefs about opponent strategy based on observed actions.

**Formula**: `P(θ|a) ∝ P(a|θ) × P(θ)`

```typescript
import { BeliefUpdate } from '@/lib/cfr-engine';

const beliefUpdate = new BeliefUpdate(0.1); // learning rate

const result = beliefUpdate.update({
  priorBeliefs: currentBeliefs,
  observedAction: { champion, phase, context: state },
  learningRate: 0.1,
});

console.log(`Surprise score: ${result.surpriseScore}`);
console.log(`Confidence: ${result.confidence}`);
```

### 2. Lookahead Search

Simulates N steps forward to evaluate candidate actions.

**Formula**: `V(s, a) = Σ P(θ) × Σ P(a'|θ) × V(s', a')`

```typescript
import { LookaheadSearch } from '@/lib/cfr-engine';

const search = new LookaheadSearch(2, 10); // 2-step, top 10 candidates

const result = search.search(
  currentState,
  availableChampions,
  opponentModel
);

console.log(`Best action: ${result.bestAction}`);
console.log(`Expected value: ${result.expectedValue}`);
```

### 3. CFR Training

Trains strategies using Counterfactual Regret Minimization.

**Formulas**:
- Regret: `R(I, a) = Σ π^-i(h) × [u(h, a) - u(h, σ(I))]`
- Strategy: `σ^(t+1)(I, a) ∝ max(R^t(I, a), 0)`

```typescript
import { GameTree, MCCFRSolver } from '@/lib/cfr-engine';

// Build game tree
const gameTree = new GameTree(initialState);

// Create solver
const solver = new MCCFRSolver(gameTree, {
  iterations: 10000,
  mcSamples: 100,
  explorationRate: 0.15,
});

// Train
const strategy = await solver.train();

console.log(`Exploitability: ${strategy.getExploitability()}`);
```

## Configuration

### Online Engine Configuration

```typescript
const onlineEngine = engine.getOnlineEngine();

// Set lookahead depth (default: 2)
onlineEngine.setLookaheadDepth(3);

// Set candidate limit (default: 10)
onlineEngine.setCandidateLimit(15);

// Set learning rate (default: 0.1)
onlineEngine.setLearningRate(0.15);
```

### Offline Engine Configuration

```typescript
const offlineEngine = new OfflineEngine({
  iterations: 10000,      // CFR iterations
  mcSamples: 100,         // Monte Carlo samples
  explorationRate: 0.15,  // Exploration rate
  discountFactor: 0.99,   // Discount factor
  pruningThreshold: -300, // Pruning threshold
});
```

### Hybrid Engine Configuration

```typescript
// Set offline usage threshold (default: 0.7)
engine.setOfflineThreshold(0.8);
```

## Training Scenarios

The offline engine trains strategies for four common scenarios:

1. **Early Ban Phase** (first 3 bans)
   - Objective: Deny meta threats
   - Depth: 6 steps

2. **First Pick Phase** (first 3 picks)
   - Objective: Secure priority champions
   - Depth: 6 steps

3. **Counter Pick Phase** (picks 4-5)
   - Objective: Counter opponent picks
   - Depth: 4 steps

4. **Final Pick Phase** (last pick)
   - Objective: Complete composition
   - Depth: 2 steps

## Performance Monitoring

```typescript
import { globalPerformanceMonitor } from '@/lib/cfr-engine';

// Track operation
const result = globalPerformanceMonitor.track(
  'my_operation',
  () => expensiveOperation()
);

// Generate report
const report = globalPerformanceMonitor.generateReport();
console.log(`Average duration: ${report.averageDuration}ms`);
console.log(`P95 duration: ${report.p95Duration}ms`);

// Print report
globalPerformanceMonitor.printReport();
```

## State Abstraction

Reduce state space complexity by abstracting similar states:

```typescript
import { StateAbstraction } from '@/lib/cfr-engine';

// Abstract a state
const abstractState = StateAbstraction.abstractState(currentState);

// Check similarity
const areSimilar = StateAbstraction.areStatesSimilar(
  state1,
  state2,
  0.8 // threshold
);

// Get abstract state ID
const stateId = StateAbstraction.getAbstractStateId(currentState);
```

## Integration with Existing V4 System

The CFR engine can work alongside the existing V4 recommendation system:

```typescript
// Use V4 for evaluation, CFR for strategic decisions
const v4Result = await generateV4Recommendations(bpState, ...);
const cfrResult = await engine.makeDecision({
  state: convertToFRState(bpState),
  ...
});

// Combine recommendations
const finalRecommendation = combineRecommendations(v4Result, cfrResult);
```

## Performance Characteristics

### Online Engine
- Decision time: 50-200ms
- Memory: ~10MB
- Scales with: Number of available champions

### Offline Engine
- Training time: 1-24 hours per scenario
- Memory: ~100MB-1GB
- One-time cost, reusable strategies

### Hybrid Engine
- Decision time: 100-300ms (with offline)
- Decision time: 50-100ms (without offline)
- Memory: ~50MB

## Opponent Styles

The engine models six opponent styles:

1. **Aggressive**: Prioritizes carry champions
2. **Defensive**: Prioritizes tanks/supports
3. **Meta Follower**: Follows version strength
4. **Counter Focused**: Prefers counter picks
5. **Flex Master**: Prefers multi-role champions
6. **Unknown**: Insufficient data

## Future Enhancements

- [ ] Integration with champion stats from V4 system
- [ ] Persistent strategy storage (file system)
- [ ] Parallel CFR training
- [ ] Online strategy fine-tuning
- [ ] Advanced state abstraction techniques
- [ ] Exploitability calculation improvements

## References

See `docs/ban-pick-algorithm.md` for detailed algorithm documentation.

## License

Part of the C9LOL AI Drafting Assistant project.
