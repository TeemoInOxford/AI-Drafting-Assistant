# Core Algorithms

## PTS (Pick Threat Score)

### 定义
量化"不行动的代价" - 衡量如果不选择该英雄，我方将损失多少价值。

### 计算公式
```typescript
PTS = PickLikelihood × LossSeverity × 100

PickLikelihood = 对手拿到该英雄的可能性
LossSeverity = 对手拿到后对我方的损失程度
```

### PickLikelihood 组成
```typescript
PickLikelihood =
  roleVacancy × w1 +        // 对手位置需求
  championPool × w2 +       // 对手选手英雄池
  metaPresence × w3 +       // Meta热度
  synergyBan × w4           // 协同Ban信号
```

### LossSeverity 组成
```typescript
LossSeverity =
  roleCollapse × w5 +       // 我方位置受限
  compositionLock × w6 +    // 我方阵容锁定
  strategicDenial × w7      // 战略拒绝价值
```

### 阶段权重配置

**Ban阶段**:
```typescript
{
  // PickLikelihood
  roleVacancy: 0.25,
  championPool: 0.35,      // 重点: 对手英雄池
  metaPresence: 0.25,
  synergyBan: 0.15,

  // LossSeverity
  roleCollapse: 0.20,      // 降低: Ban不关心我方位置
  compositionLock: 0.25,
  strategicDenial: 0.55    // 提高: 破坏对手协同
}
```

**Pick阶段**:
```typescript
{
  // PickLikelihood
  roleVacancy: 0.30,
  championPool: 0.25,
  metaPresence: 0.25,
  synergyBan: 0.20,

  // LossSeverity
  roleCollapse: 0.40,      // 提高: Pick需要填位置
  compositionLock: 0.30,
  strategicDenial: 0.30    // 降低: 平衡考虑
}
```

## 阶段感知逻辑

### 20步BP序列划分
```typescript
const STAGES = {
  early: [0, 1, 2, 3, 4, 5, 6],      // Ban1 + Pick1前期
  mid: [7, 8, 9, 10, 11, 12],        // Pick1后期 + Ban2
  late: [13, 14, 15, 16, 17, 18, 19] // Pick2全部
};
```

### 阶段决策优先级
| 阶段 | 关注点 | 权重倾向 |
|------|--------|----------|
| Early | Meta强势英雄、高价值Ban | Meta权重高 |
| Mid | 阵容构建、博弈对抗 | 风格匹配权重高 |
| Late | 补位、风险规避 | 位置权重高、风险权重高 |

## 博弈论模型 (Hybrid Approach)

### 核心创新: 动态候选池过滤
```typescript
// 根据已确定位置过滤候选池
function filterCandidatePool(
  allChampions: Champion[],
  occupiedPositions: string[]
): Champion[] {
  return allChampions.filter(c =>
    !c.positions.every(p => occupiedPositions.includes(p))
  );
}

// 效果
Step 1-6:  170 champions (无过滤)
Step 7-12: 90-130 champions (-30~50%)
Step 13+:  20-60 champions (-65~90%)
```

**计算量优化**: 60-90%

### Softmax概率计算

**五维特征**:
```typescript
score =
  w1 × (PTS / 100) +           // f1: PTS威胁
  w2 × styleMatch +            // f2: 风格匹配
  w3 × roleUrgency +           // f3: 位置紧迫
  w4 × riskAvoidance +         // f4: 风险规避
  w5 × metaStrength            // f5: Meta强度
```

**阶段权重**:
```typescript
Early: [0.25, 0.20, 0.15, 0.15, 0.25]  // Meta重要
Mid:   [0.35, 0.25, 0.20, 0.10, 0.10]  // PTS+风格并重
Late:  [0.40, 0.15, 0.20, 0.20, 0.05]  // PTS+风险重要
```

**Softmax转换**:
```typescript
probability = exp(score) / Σ exp(scores)
```

### 融合公式
```typescript
finalPTS = originalPTS × 0.6 + softmaxProb × 100 × 0.4
```

**权重说明**:
- 60% 保留原始PTS (保证基础质量)
- 40% 引入博弈论 (增加适应性)

### 对手类型建模 (简化版)

**类型定义**:
```typescript
type OpponentStyle =
  | 'aggressive'    // 激进: carry/刺客
  | 'defensive'     // 防守: 坦克/辅助
  | 'meta'          // Meta: 版本强度
  | 'counter'       // 针对: counter对手
  | 'unknown';      // 未知
```

**信念更新 (Bayesian)**:
```typescript
// 观察对手选择后更新
posterior = (likelihood × prior) / evidence

// 信心度计算
confidence = (observedCount / 5 + maxBelief) / 2

// 只有 confidence > 0.4 才应用博弈调整
```

## Ban vs Pick 差异化

### Ban阶段逻辑
**目标**: 破坏对手战略、保护我方战略

**strategicDenial计算**:
```typescript
// Ban阶段: 重点关注对手协同 + Counter我方
strategicDenial =
  opponentSynergy × 0.6 +    // 与对手已选的协同
  counterToUs × 0.4           // Counter我方已选
```

**战队英雄池调整**:
```typescript
adjustedScore = baseScore ×
  proficiencyFactor ×         // 熟练度系数 (0-1)
  flexibilityPenalty ×        // 灵活性惩罚 (0.7-1.0)
  signatureBonus ×            // 招牌加成 (1.0-1.3)
  uniqueBonus                 // 唯一加成 (1.0-1.2)
```

### Pick阶段逻辑
**目标**: 构建我方阵容、Counter对手阵容

**strategicDenial计算**:
```typescript
// Pick阶段: 重点关注我方协同 + Counter对手
strategicDenial =
  ourSynergy × 0.6 +          // 与我方已选的协同
  counterToOpponent × 0.4     // Counter对手已选
```

## 工程接口

### computePTS
```typescript
function computePTS(
  champion: Champion,
  bpState: DraftState,
  action: 'ban' | 'pick'
): number {
  const config = action === 'ban' ? BAN_CONFIG : PICK_CONFIG;
  const pickLikelihood = calculatePickLikelihood(champion, bpState, config);
  const lossSeverity = calculateLossSeverity(champion, bpState, config);
  return pickLikelihood * lossSeverity * 100;
}
```

### enhancePTSWithGameTheory
```typescript
function enhancePTSWithGameTheory(
  ptsResults: PTSResult[],
  allChampions: Champion[],
  gameTheoryState: OpponentModel,
  bpState: DraftState,
  currentStep: number,
  side: Team
): PTSResult[] {
  // 1. 过滤候选池
  const candidates = filterCandidatePool(allChampions, bpState);

  // 2. 计算Softmax概率
  const probabilities = computeSoftmaxProbabilities(candidates, ...);

  // 3. 融合PTS
  return ptsResults.map(r => ({
    ...r,
    pts: r.pts * 0.6 + probabilities[r.championName] * 100 * 0.4
  }));
}
```

### filterCandidatePool
```typescript
function filterCandidatePool(
  allChampions: Champion[],
  bpState: DraftState
): Champion[] {
  const occupiedPositions = getOccupiedPositions(bpState);

  return allChampions.filter(c =>
    !bpState.usedChampions.has(c.name) &&
    !c.positions.every(p => occupiedPositions.includes(p))
  );
}
```

### updateOpponentModel
```typescript
function updateOpponentModel(
  state: OpponentModel,
  observation: { champion: Champion, action: string },
  bpState: DraftState
): OpponentModel {
  // 1. 计算似然
  const likelihoods = calculateLikelihoods(observation);

  // 2. 贝叶斯更新
  const newBelief = bayesianUpdate(state.belief, likelihoods);

  // 3. 计算信心度
  const confidence = calculateConfidence(newBelief, state.observedActions.length);

  // 4. 预测类型
  const predictedType = Object.keys(newBelief).reduce((a, b) =>
    newBelief[a] > newBelief[b] ? a : b
  );

  return { ...state, belief: newBelief, confidence, predictedType };
}
```

## 关键参数

### PTS稳定性优化
```typescript
// 归一化范围
const PTS_MIN = 0;
const PTS_MAX = 100;

// 平滑因子
const SMOOTHING_FACTOR = 0.1;

// 最小差异阈值
const MIN_DIFF_THRESHOLD = 5;
```

### 博弈论参数
```typescript
// 信心度阈值
const CONFIDENCE_THRESHOLD = 0.4;

// 观察窗口
const OBSERVATION_WINDOW = 5;

// 融合权重
const PTS_WEIGHT = 0.6;
const SOFTMAX_WEIGHT = 0.4;
```

## 性能指标

### 计算复杂度
| 方案 | 候选池 | 复杂度 | 响应时间 |
|------|--------|--------|----------|
| 纯PTS | 170 | O(n) | ~10ms |
| 融合方案 (Early) | 130 | O(n²) | ~50ms |
| 融合方案 (Mid) | 90 | O(n²) | ~20ms |
| 融合方案 (Late) | 50 | O(n²) | ~5ms |

### 准确率提升 (预估)
```
Early: 基础 65% → 融合 85% (+20%)
Mid:   基础 70% → 融合 88% (+18%)
Late:  基础 75% → 融合 90% (+15%)
```

## 工程价值

本文档定义PTS、阶段感知、博弈论算法的核心思想和工程接口。任何算法修改都应参考此文档确保不破坏系统一致性。
