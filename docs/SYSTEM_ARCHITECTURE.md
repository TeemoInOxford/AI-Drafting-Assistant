# LOL AI Drafting System Architecture

## 系统层级

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  BP Simulator │  │ Data Explorer │  │  ERD Viewer  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                      API Layer                           │
│  /api/lol/recommend  /api/lol/data  /api/lol/series    │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   Core Engine                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  BP Logic    │  │ PTS Engine   │  │ Game Theory  │  │
│  │  (20 steps)  │  │ (Threat Calc)│  │ (Softmax)    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                     Data Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  GRID API    │  │ Local Cache  │  │  DDragon API │  │
│  │  (Esports)   │  │ (JSON files) │  │  (Champions) │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 模块职责

### 1. BP State Manager
**职责**: 管理20步BP序列的状态机

**核心数据结构**: `DraftState`
```typescript
{
  currentStep: number,           // 0-19
  usedChampions: Set<string>,    // 已Ban/Pick的英雄
  bluePicks: Champion[],         // 蓝方选择
  redPicks: Champion[],          // 红方选择
  blueBans: Champion[],          // 蓝方Ban
  redBans: Champion[]            // 红方Ban
}
```

**关键函数**:
- `getCurrentStep(state)`: 返回当前步骤信息 (team, action, step)
- `isValidSelection(champion, state)`: 验证选择合法性
- `updateState(champion, state)`: 更新状态

### 2. Recommendation Engine
**职责**: 计算推荐分数并排序

**输入**: DraftState + 候选池 + 配置
**输出**: 排序后的推荐列表 (championName, pts, reasoning)

**核心流程**:
```
1. 过滤候选池 (排除已用英雄、不可用位置)
2. 计算PTS分数 (PickLikelihood × LossSeverity)
3. 应用博弈论增强 (可选)
4. 排序并返回Top N
```

### 3. AI Prompt Generator
**职责**: 生成结构化Prompt并调用AI

**输入**: DraftState + 推荐英雄 + 阶段信息
**输出**: 推荐理由 (JSON格式)

**Prompt类型**:
- Ban Phase: 威胁分析 + 时机判断
- Pick Phase: 协同分析 + 位置推荐

### 4. Data Normalizer
**职责**: 清洗和标准化数据

**清洗规则**:
- 移除重复选手账号 (数字后缀)
- 过滤测试账号 (test, OBS, Staff)
- 确保关联完整性 (选手→战队→联赛)

**数据来源**:
- GRID API: 职业比赛数据
- DDragon API: 英雄基础数据
- 本地缓存: hierarchy.json, series.json

## 数据流向

### 用户选择英雄流程
```
1. User clicks champion
   ↓
2. Frontend validates selection
   ↓
3. Update DraftState
   ↓
4. POST /api/lol/recommend
   {
     bpState: DraftState,
     enableGameTheory: boolean,
     gameTheoryState?: OpponentModel
   }
   ↓
5. Backend calculates PTS
   - Filter candidate pool
   - Compute PTS scores
   - Apply game theory (if enabled)
   ↓
6. Return recommendations
   {
     recommendations: Array<{
       championName: string,
       pts: number,
       reasoning: string
     }>
   }
   ↓
7. Frontend updates UI
   - Display top 3 recommendations
   - Update opponent analysis panel
   - Highlight next action
```

### 博弈论增强流程 (可选)
```
1. Opponent picks champion
   ↓
2. Update OpponentModel
   - Observe champion type (tank/assassin/mage)
   - Update belief distribution (Bayesian)
   - Calculate confidence
   ↓
3. If confidence > 0.4:
   - Predict opponent style
   - Adjust PTS scores based on style
   - Filter candidate pool by occupied positions
   ↓
4. Return enhanced recommendations
```

## 降级策略

### AI不可用时
**触发条件**: API调用失败、超时、配额耗尽

**Fallback逻辑**:
1. 使用纯PTS排序 (无AI解释)
2. 显示简化推荐理由 (基于规则)
3. 提示用户"AI暂时不可用"

**代码位置**: `app/api/lol/recommend/route.ts`
```typescript
try {
  const aiReasoning = await callAI(prompt);
} catch (error) {
  // Fallback to rule-based reasoning
  const reasoning = generateRuleBasedReasoning(champion, bpState);
}
```

### 博弈论失败时
**触发条件**: 计算错误、状态异常

**Fallback逻辑**:
1. 捕获异常，记录日志
2. 继续使用基础PTS结果
3. 不影响核心推荐功能

**代码位置**: `app/api/lol/pts/route.ts:54-76`

### 数据缺失时
**触发条件**: 本地数据文件不存在、GRID API失败

**默认行为**:
1. 使用DDragon API的基础英雄数据
2. 禁用战队英雄池功能
3. 仅基于Meta和位置推荐

## 关键配置

### BP序列定义
```typescript
// 20步BP序列 (官方竞技规则)
const BP_SEQUENCE = [
  // Ban Phase 1 (0-5)
  { team: 'blue', action: 'ban' },   // 0
  { team: 'red', action: 'ban' },    // 1
  { team: 'blue', action: 'ban' },   // 2
  { team: 'red', action: 'ban' },    // 3
  { team: 'blue', action: 'ban' },   // 4
  { team: 'red', action: 'ban' },    // 5

  // Pick Phase 1 (6-11)
  { team: 'blue', action: 'pick' },  // 6
  { team: 'red', action: 'pick' },   // 7
  { team: 'red', action: 'pick' },   // 8
  { team: 'blue', action: 'pick' },  // 9
  { team: 'blue', action: 'pick' },  // 10
  { team: 'red', action: 'pick' },   // 11

  // Ban Phase 2 (12-15)
  { team: 'red', action: 'ban' },    // 12
  { team: 'blue', action: 'ban' },   // 13
  { team: 'red', action: 'ban' },    // 14
  { team: 'blue', action: 'ban' },   // 15

  // Pick Phase 2 (16-19)
  { team: 'red', action: 'pick' },   // 16
  { team: 'blue', action: 'pick' },  // 17
  { team: 'blue', action: 'pick' },  // 18
  { team: 'red', action: 'pick' }    // 19
];
```

### 阶段划分
```typescript
const STAGE_CONFIG = {
  early: { steps: [0, 1, 2, 3, 4, 5, 6], focus: 'Meta + 高价值英雄' },
  mid: { steps: [7, 8, 9, 10, 11, 12], focus: '阵容构建 + 博弈' },
  late: { steps: [13, 14, 15, 16, 17, 18, 19], focus: '补位 + 风险规避' }
};
```

## 性能指标

### 目标响应时间
- PTS计算: < 50ms
- 博弈论增强: < 100ms
- AI推理: < 2s
- 总推荐生成: < 3s

### 候选池优化
```
Step 1-6:  170 champions (无过滤)
Step 7-12: 90-130 champions (-30~50%)
Step 13+:  20-60 champions (-65~90%)
```

## 部署架构

```
Nginx (反向代理)
  ↓
PM2 (进程管理)
  ↓
Next.js Server (Port 3003)
  ↓
GRID API (外部) + Local JSON (内部)
```

**启动命令**:
```bash
pm2 start npm --name "lol-drafting" -- start -- -p 3003
```

**环境变量**:
```env
GRID_API_URL=https://api-op.grid.gg/central-data/graphql
GRID_API_KEY=your_api_key_here
```

## 工程价值

本文档定义了系统的整体架构，是理解系统运作的唯一入口。任何模块修改都应参考此文档确保不破坏系统边界。
