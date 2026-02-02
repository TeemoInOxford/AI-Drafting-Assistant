# Troubleshooting & Degradation Strategy

## AI不可用时的降级策略

### 触发条件
- API调用失败 (网络错误、超时)
- API配额耗尽
- 响应格式错误

### Fallback逻辑

**代码位置**: `app/api/lol/recommend/route.ts`

```typescript
try {
  const aiReasoning = await callAI(prompt);
} catch (error) {
  console.error('[AI Fallback] Using rule-based reasoning');
  const reasoning = generateRuleBasedReasoning(champion, bpState);
}
```

**规则生成逻辑**:
```typescript
function generateRuleBasedReasoning(champion, bpState) {
  if (action === 'ban') {
    return `威胁评估: 对手可能选择该英雄填补${position}位置`;
  } else {
    return `协同分析: 与我方${ourPicks}形成${synergy}协同`;
  }
}
```

**用户体验**:
- 推荐列表正常显示
- 推荐理由简化为规则模板
- 显示提示: "AI暂时不可用，使用基础推荐"

## 博弈论失败时的降级

### 触发条件
- 计算异常
- 状态不一致
- 候选池过滤错误

### Fallback逻辑

**代码位置**: `app/api/lol/pts/route.ts:54-76`

```typescript
if (enableGameTheory && gameTheoryState) {
  try {
    const enhanced = enhancePTSWithHybridModel(...);
    results = enhanced;
  } catch (gtError) {
    console.error('[Game Theory Fallback]', gtError);
    // 继续使用基础PTS结果
  }
}
```

**效果**:
- 基础PTS推荐不受影响
- 对手分析面板显示"分析失败"
- 用户可禁用博弈论功能

## 数据缺失时的默认行为

### 战队英雄池缺失
**触发**: 用户未选择战队或数据未加载

**处理**:
```typescript
if (!enemyTeamPool) {
  // 使用纯PTS推荐，不调整Ban分数
  return calculateBasePTS(champion, bpState);
}
```

### 历史数据缺失
**触发**: 新英雄、新赛季、数据未更新

**处理**:
- 使用Meta热度作为主要指标
- 降低championPool权重
- 提示用户"数据不足"

## 常见问题排查

### Q1: PTS推荐为空
**症状**: 侧边栏不显示推荐

**排查步骤**:
1. 检查候选池是否为空
   ```typescript
   console.log('[Debug] Candidate pool size:', candidates.length);
   ```
2. 检查DraftState是否正确
   ```typescript
   console.log('[Debug] Used champions:', bpState.usedChampions.size);
   ```
3. 检查API响应
   - 浏览器控制台 → Network → 筛选 `recommend`
   - 查看Response状态码和内容

**常见原因**:
- 所有英雄已被Ban/Pick (候选池为空)
- DraftState未正确更新
- API路由错误

### Q2: 博弈论不生效
**症状**: 对手分析面板显示"观察中..."不变化

**排查步骤**:
1. 确认功能已启用
   ```typescript
   console.log('[Debug] Game theory enabled:', enableGameTheory);
   ```
2. 检查观察次数
   ```typescript
   console.log('[Debug] Observed actions:', gameTheoryState.observedActions.length);
   ```
3. 检查信心度
   ```typescript
   console.log('[Debug] Confidence:', gameTheoryState.confidence);
   ```

**常见原因**:
- 信心度 < 0.4 (需要更多观察)
- 对手选择次数不足 (< 3次)
- 状态未正确更新

### Q3: 推荐分数异常
**症状**: 所有英雄PTS分数相同或为0

**排查步骤**:
1. 检查PTS配置
   ```typescript
   console.log('[Debug] PTS config:', OPTIMIZED_PTS_CONFIG);
   ```
2. 检查特征计算
   ```typescript
   console.log('[Debug] Features:', {
     roleVacancy,
     championPool,
     metaPresence
   });
   ```

**常见原因**:
- 配置权重全为0
- 特征计算函数返回NaN
- 数据源缺失

## 调试工具

### 1. 浏览器控制台日志
**筛选关键词**:
- `[PTS` - PTS计算相关
- `[Game Theory` - 博弈论相关
- `[候选池` - 候选池过滤
- `[AI` - AI调用相关

### 2. API调试端点 (可选实现)
```typescript
// GET /api/debug/pts?champion=Ahri&step=7
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const champion = searchParams.get('champion');
  const step = parseInt(searchParams.get('step') || '0');

  // 返回详细PTS计算过程
  return Response.json({
    champion,
    step,
    features: { ... },
    weights: { ... },
    finalPTS: ...
  });
}
```

### 3. 状态快照
```typescript
// 在关键位置添加状态快照
console.log('[Snapshot]', {
  step: bpState.currentStep,
  usedChampions: Array.from(bpState.usedChampions),
  candidatePoolSize: candidates.length,
  gameTheoryEnabled: enableGameTheory,
  opponentType: gameTheoryState?.predictedType
});
```

## 性能问题排查

### 症状: 推荐生成缓慢 (> 3s)

**排查步骤**:
1. 检查候选池大小
   ```
   [候选池过滤] 原始: 170 -> 过滤后: 85
   ```
   - 如果过滤后仍 > 100，检查过滤逻辑

2. 检查Softmax计算时间
   ```
   [计算时间] Softmax: 45ms, 总计: 120ms
   ```
   - 如果 > 100ms，考虑优化

3. 检查AI调用时间
   - 正常: < 2s
   - 异常: > 5s (可能网络问题)

**优化建议**:
- 使用Web Worker异步计算
- 缓存中间结果
- 进一步优化候选池过滤

## 完全禁用博弈论

### 方案1: UI禁用 (推荐)
**默认状态**: `app/bp/page.tsx:49`
```typescript
const [enableGameTheory, setEnableGameTheory] = useState(false);
```

### 方案2: 代码禁用
**注释相关代码**:
```typescript
// app/api/lol/pts/route.ts
// 注释掉整个博弈论增强块

// app/bp/page.tsx
// 注释掉 OpponentAnalysisPanel 组件
```

### 方案3: 移除功能
```bash
rm app/lib/hybrid-game-theory.ts
rm app/components/OpponentAnalysisPanel.tsx
git checkout app/api/lol/pts/route.ts
```

## 成功标志

### 基础功能正常
- ✅ PTS推荐显示Top 3英雄
- ✅ 分数有差异 (不全相同)
- ✅ 点击英雄可选择
- ✅ 状态正确更新

### 博弈论功能正常 (启用后)
- ✅ 对手分析面板显示
- ✅ 3-5次观察后显示对手类型
- ✅ 信念分布动画
- ✅ PTS分数根据对手调整

### 性能正常
- ✅ 候选池过滤日志显示
- ✅ 计算时间 < 100ms
- ✅ 无明显卡顿

## 工程价值

本文档定义系统降级策略和常见问题排查方法，确保系统在异常情况下仍能提供基础功能。
