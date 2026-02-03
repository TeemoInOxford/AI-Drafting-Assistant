# Step X - Role Shift vs Player Swap 诊断报告

**生成时间**: 2026-01-31T17:40:03.221Z
**数据源**: `data/grid_v2/series_*.json`
**脚本**: `app/scripts/diagnose-role-shift-vs-player-swap.ts`

---

## 1. 背景与目的

在 grid_v2 数据中，我们发现"某选手用某英雄被推断成错误位置"的现象。这可能来自两种原因：

**A. Hero Role Shift（英雄换路）**
- 同一名选手在异常局前后，整体仍在同一位置
- 但该英雄在该时期被职业比赛普遍用于不同位置
- 例如：Skarner 在某段时间大量走上单，而非打野

**B. Player Role Swap（选手换位置）**
- 该选手从某时点开始，其大多数出场都落在另一条路
- 例如：Malrang 后面长期打辅助

**本诊断的目的是区分这两类变化，为数据修复决策提供依据。**

---

## 2. 方法论

### 2.1 局内位置估计

由于数据中没有显式的位置字段，我们使用以下方法估计每局每名玩家的位置：

1. **英雄-位置先验表**：使用 `app/lib/positions.ts` 中的 `CHAMPION_POSITIONS`
2. **贪心分配算法**：
   - 按英雄先验位置的"专一性"排序（位置越少越优先分配）
   - 依次为每名玩家分配其先验位置列表中第一个未被占用的位置
   - 如果所有先验位置都被占用，分配剩余位置（记录冲突）
3. **置信度**：无冲突为 1，每个冲突减少 0.2

### 2.2 异常事件定义

当玩家在某局的 `estimatedRole` 与该英雄的先验主位置（第一个位置）不一致时，记为一个异常事件。

### 2.3 时间邻域判别

| 参数 | 值 |
|------|------|
| windowSize | 5 场（前后各取） |
| roleStabilityThreshold | 60% |

**判别规则**：

| 条件 | 分类 |
|------|------|
| prevRoleMode == nextRoleMode 且稳定性 >= 60% | Hero Role Shift |
| prevRoleMode != nextRoleMode 且稳定性 >= 60% | Player Role Swap |
| 其他 | Ambiguous |

### 2.4 英雄层面共识验证

对判为 Hero Role Shift 的事件，在该事件日期前后 ±30 天内收集所有比赛中该英雄的位置分布：

- 若主导位置与先验主位置不同，且占比 >= 35% → **heroShiftConfirmed = true**
- 否则 → **heroShiftWeakEvidence = true**

### 2.5 局限性

1. 位置估计依赖英雄先验，可能引入循环偏差
2. 部分比赛缺少时间字段，使用 series 级别时间
3. 贪心分配在有冲突时可能不是最优解
4. 窗口大小和阈值是经验值，可能需要根据数据调整

---

## 3. 数据质量

| 指标 | 数值 |
|------|------|
| 总比赛数 | 3,383 |
| 总选手数 | 441 |
| 缺少日期的比赛 | 0 |
| 缺少玩家的比赛 | 61 |
| 位置分配有冲突的比赛 | 2204 |
| 未知英雄的玩家 | 1 |

---

## 4. 结果摘要

### 4.1 异常事件分类

| 分类 | 数量 | 占比 |
|------|------|------|
| **Hero Role Shift** | 4751 | 81.8% |
| **Player Role Swap** | 286 | 4.9% |
| **Ambiguous** | 771 | 13.3% |
| **总计** | 5808 | 100% |

### 4.2 Hero Role Shift 验证

| 状态 | 数量 |
|------|------|
| Confirmed（共识验证通过） | 2501 |
| Weak Evidence（共识验证未通过） | 2250 |

### 4.3 Top 10 Hero Role Shift 英雄

| 英雄 | 异常事件数 |
|------|------|
| Taliyah | 514 |
| Maokai | 314 |
| Neeko | 290 |
| Pantheon | 270 |
| Poppy | 262 |
| Tristana | 195 |
| Senna | 186 |
| Corki | 149 |
| Aurora | 124 |
| Naafiri | 124 |

### 4.4 Top 10 Player Role Swap 选手

| 选手 | 异常事件数 |
|------|------|
| ON | 19 |
| Sylvie | 8 |
| ShowMaker | 8 |
| Peanut | 8 |
| Faker | 7 |
| Lucid | 7 |
| Myrwn | 7 |
| Fresskowy | 7 |
| Canyon | 6 |
| Peyz | 6 |

---

## 5. 案例分析

### 5.1 Skarner - Hero Role Shift 案例

**事件详情**：
- 选手: Canyon
- 日期: 2025-05-21
- 估计位置: top
- 先验主位置: jungle
- 分类: hero_role_shift
- 原因: Player stable at jungle (prev: 60%, next: 80%), but champion played at top

**时间邻域**：
- 前窗口众数: jungle (稳定性: 60%)
- 后窗口众数: jungle (稳定性: 80%)

**英雄窗口统计**：
- 窗口: 2025-04-21 ~ 2025-06-20
- 总场次: 101
- 位置分布: {"top":3,"jungle":97,"mid":1,"bot":0,"support":0}
- 主导位置: jungle (96.0%)
- 共识验证: ⚠️ 弱证据

### 5.2 Neeko 案例

**事件详情**：
- 选手: Peter
- 日期: 2025-04-25
- 估计位置: support
- 先验主位置: mid
- 分类: hero_role_shift
- 原因: Player stable at support (prev: 60%, next: 80%), but champion played at support

**时间邻域**：
- 前窗口众数: support (稳定性: 60%)
- 后窗口众数: support (稳定性: 80%)

---

## 6. 声明

**本报告是诊断与数据修复决策辅助工具，不做胜率预测。**

结果用于：
1. 识别需要更新英雄-位置映射的情况（Hero Role Shift）
2. 识别选手位置变更的情况（Player Role Swap）
3. 为后续数据清洗和模型训练提供依据

---

## 7. 输出文件

| 文件 | 路径 |
|------|------|
| 诊断 JSON | `data/grid_v2/role_shift_diagnosis.json` |
| 本报告 | `app/docs/migration/step-x-role-shift-vs-player-swap.md` |

---

## 8. 运行命令

```bash
npx tsx app/scripts/diagnose-role-shift-vs-player-swap.ts
```
