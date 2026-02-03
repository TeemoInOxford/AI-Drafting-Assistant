# 角色调整层 (Role Adjustment Layer) - 使用文档

## 概述

角色调整层是一个**轻量级、非侵入式**的模块，用于在基础贝叶斯后验分布之上应用 Patch 和 Region 特定的校正。

### 核心原则

1. **不修改基础模型**: 原始贝叶斯后验 P0(role | champion) 保持不变
2. **乘性权重**: 使用乘法而非加法进行调整
3. **自动归一化**: 调整后的概率自动归一化为1.0
4. **数据驱动**: 仅在有足够样本时应用调整（默认 ≥10 场比赛）

## 方法论

### 权重计算公式

对于每个英雄 c 和角色 r：

```
w_patch(c, r) = (freq_patch(c, r) + ε) / (freq_global(c, r) + ε)
w_region(c, r) = (freq_region(c, r) + ε) / (freq_global(c, r) + ε)
```

其中：
- `freq_patch(c, r)`: 该英雄在特定 patch 中该角色的频率
- `freq_global(c, r)`: 该英雄在全局数据中该角色的频率
- `ε = 3`: 平滑常数（选择理由见下文）

### 调整公式

```
P(role | c, patch, region) ∝ P0(role | c) × w_patch(c, r) × w_region(c, r)
```

然后对所有5个位置重新归一化。

### 平滑常数 ε 的选择

我们选择 `ε = 3` 的原因：

1. **稳定性**: 防止小样本导致极端权重
2. **响应性**: 仍然允许真实的 patch/region 差异体现
3. **平衡**: 在 `ε = 1`（过于敏感）和 `ε = 5`（过于保守）之间取得平衡

**示例**:
- 如果 freq_patch = 0.5, freq_global = 0.4
  - w = (0.5 + 3) / (0.4 + 3) = 3.5 / 3.4 ≈ 1.03 (轻微增加)
- 如果 freq_patch = 0.8, freq_global = 0.4
  - w = (0.8 + 3) / (0.4 + 3) = 3.8 / 3.4 ≈ 1.12 (明显增加)

## 使用方法

### 基础用法

```typescript
import { adjustRolePosterior } from '@/app/lib/role-adjustment';
import bayesianPosteriors from '@/data/lol/bayesian-role-posteriors.json';

// 获取基础后验
const basePosterior = bayesianPosteriors['Poppy'].posterior;

// 应用 patch 调整
const adjusted = adjustRolePosterior('Poppy', basePosterior, {
  patch: '15.18',
});

console.log(adjusted.adjustedPosterior);
// { top: 0.171, jungle: 0.466, mid: 0.004, bot: 0.000, support: 0.359 }

console.log(adjusted.adjustments.notes);
// ["jungle usage increased in patch 15.18"]
```

### 集成到 Role Flexibility

```typescript
import { calculateRoleFlexibility } from '@/app/lib/role-flexibility';

// 不带调整（使用全局后验）
const flexibility = calculateRoleFlexibility(champion, {
  minDisplayThreshold: 0.05,
});

// 带 patch 调整
const flexibilityWithPatch = calculateRoleFlexibility(champion, {
  minDisplayThreshold: 0.05,
  patch: '15.18',
});

// 带 patch + region 调整
const flexibilityWithBoth = calculateRoleFlexibility(champion, {
  minDisplayThreshold: 0.05,
  patch: '15.18',
  region: 'LCK',
});

// 访问调整元数据
if (flexibilityWithBoth.adjustmentMeta) {
  console.log(flexibilityWithBoth.adjustmentMeta.notes);
  console.log(flexibilityWithBoth.adjustmentMeta.patchGames); // 样本量
}
```

### 批量调整

```typescript
import { adjustBatchRolePosteriors } from '@/app/lib/role-adjustment';

const champions = [
  { name: 'Poppy', basePosterior: {...} },
  { name: 'Aatrox', basePosterior: {...} },
];

const results = adjustBatchRolePosteriors(champions, {
  patch: '15.18',
  region: 'LCK',
});

for (const [name, adjusted] of results) {
  console.log(`${name}:`, adjusted.adjustedPosterior);
}
```

### 查询可用的 Patch 和 Region

```typescript
import {
  getAllPatches,
  getAllRegions,
  getAvailablePatches,
  getAvailableRegions
} from '@/app/lib/role-adjustment';

// 所有可用的 patch
console.log(getAllPatches());
// ['14.1', '14.2', ..., '15.18']

// 所有可用的 region
console.log(getAllRegions());
// ['LCK', 'LCS', 'LEC', 'LPL', 'LTA']

// 特定英雄的可用 patch
console.log(getAvailablePatches('Poppy'));
// ['14.1', '14.2', ..., '15.18']

// 特定英雄的可用 region
console.log(getAvailableRegions('Poppy'));
// ['LCK', 'LCS', 'LEC', 'LPL', 'LTA']
```

## 输出格式

### AdjustedPosterior 接口

```typescript
interface AdjustedPosterior {
  champion: string;
  basePosterior: Record<Position, number>;
  adjustedPosterior: Record<Position, number>;
  adjustments: AdjustmentMeta;
}

interface AdjustmentMeta {
  patch?: string;
  region?: string;
  patchGames?: number;      // 该 patch 的样本量
  regionGames?: number;     // 该 region 的样本量
  notes: string[];          // 人类可读的解释
  weights: {
    patch?: Record<Position, number>;
    region?: Record<Position, number>;
  };
}
```

### 示例输出

```json
{
  "champion": "Poppy",
  "basePosterior": {
    "top": 0.179,
    "jungle": 0.448,
    "mid": 0.004,
    "bot": 0.000,
    "support": 0.369
  },
  "adjustedPosterior": {
    "top": 0.166,
    "jungle": 0.460,
    "mid": 0.004,
    "bot": 0.000,
    "support": 0.370
  },
  "adjustments": {
    "patch": "15.18",
    "region": "LCK",
    "patchGames": 30,
    "regionGames": 178,
    "notes": [
      "jungle usage increased in patch 15.18",
      "support preference in LCK"
    ],
    "weights": {
      "patch": {
        "top": 0.956,
        "jungle": 1.040,
        "mid": 1.000,
        "bot": 1.000,
        "support": 0.973
      },
      "region": {
        "top": 0.972,
        "jungle": 0.987,
        "mid": 1.000,
        "bot": 1.000,
        "support": 1.030
      }
    }
  }
}
```

## 数据覆盖

### Patch 覆盖

- **时间范围**: 2024-01-10 至 2025-09-30
- **Patch 版本**: 14.1 至 15.18（共31个版本）
- **总比赛数**: 34,308 场

### Region 覆盖

- **LCK** (韩国): 最大样本量
- **LPL** (中国): 第二大样本量
- **LEC** (欧洲)
- **LCS** (北美)
- **LTA** (拉丁美洲)

### 样本量要求

- **最小样本量**: 10 场比赛（可配置）
- **不足样本处理**: 返回基础后验，不应用调整
- **通知机制**: 在 `notes` 中说明样本不足

## 配置选项

```typescript
interface RoleAdjustmentConfig {
  epsilon: number;              // 平滑常数（默认: 3）
  minSampleSize: number;        // 最小样本量（默认: 10）
}

// 自定义配置
const adjusted = adjustRolePosterior('Poppy', basePosterior, {
  patch: '15.18',
  config: {
    epsilon: 5,           // 更保守的平滑
    minSampleSize: 20,    // 更严格的样本要求
  },
});
```

## 实际案例

### 案例 1: Poppy 在 Patch 15.18

**基础后验**:
- Jungle: 44.8%
- Support: 36.9%
- Top: 17.9%

**Patch 15.18 调整后**:
- Jungle: 46.6% (+1.8%)
- Support: 35.9% (-1.0%)
- Top: 17.1% (-0.8%)

**解释**: 在 15.18 版本中，Poppy 的打野使用率相对全局数据有所上升。

### 案例 2: Lucian 在 LCK

**基础后验**:
- Bot: 71.0%
- Mid: 29.0%

**LCK 调整后**:
- Bot: 73.0% (+1.9%)
- Mid: 27.0% (-1.9%)

**解释**: 在 LCK 赛区，Lucian 更倾向于下路位置。

### 案例 3: Ivern 样本不足

**Patch 15.18 调整**:
- 返回基础后验（无变化）
- Notes: "Insufficient data for patch 15.18 (< 10 games)"

**解释**: Ivern 在 15.18 版本的比赛数不足10场，系统不应用调整以避免过拟合。

## 技术细节

### 权重解释

- **w = 1.0**: 该 patch/region 的频率与全局一致
- **w > 1.0**: 该 patch/region 的频率高于全局（增加概率）
- **w < 1.0**: 该 patch/region 的频率低于全局（降低概率）

### 归一化保证

调整后的概率始终满足：
```
Σ P(role | c, patch, region) = 1.0
```

### 不确定性保留

- 调整层**不改变**不确定性的本质
- 如果基础后验显示高不确定性（多个角色概率相近），调整后仍保持这种特征
- 调整只是**重新分配**概率质量，不创造或消除不确定性

## 局限性

### 1. 样本量依赖

- 某些英雄在特定 patch/region 的样本可能不足
- 系统会自动检测并在样本不足时回退到基础后验

### 2. 时间滞后

- 数据截至 2025-09-30
- 更新的 patch 需要重新运行统计脚本

### 3. Region 定义

- Region 从赛事名称推断（如 "LCK", "LPL"）
- 国际赛事（Worlds, MSI）标记为 "International"

## 更新数据

如需更新 patch/region 统计数据：

```bash
# 1. 确保 states.json 和 series.json 是最新的
# 2. 运行统计脚本
npx tsx app/scripts/build-patch-region-stats.ts

# 3. 重新构建应用
npm run build
```

## 总结

角色调整层提供了一个**灵活、透明、数据驱动**的方式来校正角色概率分布，同时：

✅ 保持基础贝叶斯模型不变
✅ 使用统计学上合理的乘性权重
✅ 自动处理样本不足情况
✅ 提供人类可读的解释
✅ 完全可选（不使用时回退到基础后验）

这使得系统能够在保持全局统计严谨性的同时，适应特定 patch 和 region 的元游戏变化。

---

**生成时间**: 2026-01-22
**数据版本**: Patch 14.1 - 15.18, 34,308 场比赛
**覆盖赛区**: LCK, LPL, LEC, LCS, LTA
