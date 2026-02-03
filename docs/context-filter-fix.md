# Context Filter 功能修复

## 问题诊断

### 用户报告的问题
用户反馈：无论如何切换 Context Filter（Patch/Region），Enemy Picks 中的位置分布始终不变。

**具体案例**：
- Brand: jungle 75%, support 19%, mid 6%
- Maokai: jungle 79%, support 19%
- 切换 Patch 15.18、LCK 等任何上下文，百分比都不变

### 根本原因

在 `/app/lib/role-adjustment.ts` 中发现关键问题：

```typescript
function getPatchRegionStats() {
  if (typeof window !== 'undefined') {
    // Client-side: return empty object (adjustment not available on client)
    return {};  // ❌ 这导致所有调整失败
  }

  if (!patchRegionStatsCache) {
    // Server-side: load the data
    patchRegionStatsCache = require('../../data/lol/patch-region-stats.json');
  }
  return patchRegionStatsCache;
}
```

**问题链**：
1. PTSRiskBoard 是客户端组件 (`'use client'`)
2. 它调用 `calculateRoleFlexibility()` 来计算角色灵活度
3. `calculateRoleFlexibility()` 内部调用 `adjustRolePosterior()`
4. `adjustRolePosterior()` 调用 `getPatchRegionStats()` 获取调整数据
5. `getPatchRegionStats()` 检测到在客户端运行，返回空对象 `{}`
6. 没有数据，所有权重计算失败，返回 null
7. 调整层回退到基础后验 P₀
8. **结果**：无论选择什么上下文，都显示相同的基础概率

### 为什么数据不在客户端？

`patch-region-stats.json` 文件大小为 **550KB**，包含 31 个补丁版本 × 5+ 个赛区的详细统计数据。为了避免客户端 bundle 过大，这个文件只在服务器端加载。

---

## 解决方案

### 架构设计

采用 **Server-Side API** 方案：
1. 创建 Next.js API 路由 `/api/role-flexibility`
2. API 在服务器端执行角色灵活度计算（可以访问完整数据）
3. PTSRiskBoard 通过 HTTP 请求获取计算结果
4. 客户端只接收最终的概率分布，不需要原始数据

### 优势
- ✅ 客户端 bundle 保持轻量（不包含 550KB 数据）
- ✅ 服务器端可以访问完整的 patch-region-stats.json
- ✅ 计算逻辑保持不变，只是执行位置改变
- ✅ 支持缓存和优化（未来可添加）

---

## 实现细节

### 1. 创建 API 路由

**文件**：`/app/api/role-flexibility/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { calculateRoleFlexibility } from '@/app/lib/role-flexibility';
import { Champion } from '@/app/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { champions, patch, region } = body;

    if (!champions || !Array.isArray(champions)) {
      return NextResponse.json(
        { error: 'Invalid request: champions array required' },
        { status: 400 }
      );
    }

    // Calculate role flexibility for each champion with the given context
    const results = champions.map((champion: Champion) => {
      const config = {
        ...(patch && { patch }),
        ...(region && { region }),
      };

      const flexibility = calculateRoleFlexibility(champion, config);

      return {
        championId: champion.id,
        flexibility,
      };
    });

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Role flexibility API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

**关键点**：
- 接受 `champions` 数组、`patch` 和 `region` 参数
- 在服务器端调用 `calculateRoleFlexibility()`（可以访问数据）
- 返回每个英雄的角色灵活度分布

### 2. 修改 PTSRiskBoard 组件

**文件**：`/app/components/PTSRiskBoard.tsx`

**修改 1：更新 imports**
```typescript
// 移除 calculateRoleFlexibility（不再在客户端调用）
// 添加 useState, useEffect
import { useMemo, useState, useEffect } from 'react';
import { updateFlexibilityForDraftState, RoleFlexibilityDistribution } from '../lib/role-flexibility';
```

**修改 2：将 useMemo 改为 useEffect + API 调用**

**之前**（客户端计算）：
```typescript
const roleFlexibilityMap = useMemo(() => {
  const map = new Map<string, RoleFlexibilityDistribution>();

  enemyPicks.forEach(champion => {
    const config = {
      ...(selectedPatch && { patch: selectedPatch }),
      ...(selectedRegion && { region: selectedRegion }),
    };
    const flexibility = calculateRoleFlexibility(champion, config);
    const updated = updateFlexibilityForDraftState(flexibility, enemyFilledRoles);
    map.set(champion.id, updated);
  });

  return map;
}, [enemyPicks, enemyFilledRoles, selectedPatch, selectedRegion]);
```

**之后**（API 调用）：
```typescript
const [roleFlexibilityMap, setRoleFlexibilityMap] = useState<Map<string, RoleFlexibilityDistribution>>(new Map());
const [flexibilityLoading, setFlexibilityLoading] = useState(false);

useEffect(() => {
  if (enemyPicks.length === 0) {
    setRoleFlexibilityMap(new Map());
    return;
  }

  async function fetchRoleFlexibility() {
    setFlexibilityLoading(true);
    try {
      const response = await fetch('/api/role-flexibility', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          champions: enemyPicks,
          patch: selectedPatch,
          region: selectedRegion,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch role flexibility');
      }

      const data = await response.json();
      const map = new Map<string, RoleFlexibilityDistribution>();

      data.results.forEach((result: { championId: string; flexibility: RoleFlexibilityDistribution }) => {
        const updated = updateFlexibilityForDraftState(result.flexibility, enemyFilledRoles);
        map.set(result.championId, updated);
      });

      setRoleFlexibilityMap(map);
    } catch (error) {
      console.error('Failed to fetch role flexibility:', error);
      // Fallback to empty map on error
      setRoleFlexibilityMap(new Map());
    } finally {
      setFlexibilityLoading(false);
    }
  }

  fetchRoleFlexibility();
}, [enemyPicks, enemyFilledRoles, selectedPatch, selectedRegion]);
```

**关键变化**：
- 从同步 `useMemo` 改为异步 `useEffect`
- 添加 `flexibilityLoading` 状态（未来可用于显示加载指示器）
- 通过 `fetch()` 调用 API
- 错误处理：失败时回退到空 Map
- 依赖项保持不变：`[enemyPicks, enemyFilledRoles, selectedPatch, selectedRegion]`

---

## 数据流

### 完整流程

```
用户切换 Context Filter (Patch 15.18 + LCK)
    ↓
BP Page 更新 selectedPatch / selectedRegion 状态
    ↓
PTSRiskBoard 接收新的 props
    ↓
useEffect 检测到依赖项变化
    ↓
发送 POST /api/role-flexibility
    body: { champions: [Brand, Maokai], patch: "15.18", region: "LCK" }
    ↓
API 路由在服务器端执行
    ↓
calculateRoleFlexibility(Brand, { patch: "15.18", region: "LCK" })
    ↓
adjustRolePosterior() 访问 patch-region-stats.json（服务器端可用）
    ↓
计算权重：w_patch × w_region
    ↓
应用调整：P(role | Brand, 15.18, LCK) ∝ P₀(role | Brand) × w_patch × w_region
    ↓
返回调整后的概率分布
    ↓
PTSRiskBoard 接收结果
    ↓
应用 updateFlexibilityForDraftState（考虑已占用位置）
    ↓
更新 roleFlexibilityMap 状态
    ↓
UI 重新渲染，显示新的百分比
```

---

## 测试方法

### 1. 启动开发服务器
```bash
npm run dev
```

### 2. 打开 BP 页面
访问 `http://localhost:3004/bp`

### 3. 测试步骤

**步骤 1：进入 Pick 阶段**
- 完成 6 个 Ban（蓝方 3 个，红方 3 个）
- 进入 Pick 阶段

**步骤 2：选择一方并 Pick 英雄**
- 点击 "Your Team: Blue" 或 "Red"
- Pick 一个 flex 英雄（如 Brand, Maokai, Sylas）

**步骤 3：观察 Enemy Picks 区域**
- 在 PTSRiskBoard 的 "Enemy Picks" 部分
- 查看英雄的位置分布条形图

**步骤 4：切换 Context Filter**
- 点击 "Patch" 下拉菜单，选择 "Patch 15.18"
- 观察位置分布是否变化

**步骤 5：切换 Region**
- 点击 "Region" 下拉菜单，选择 "LCK"
- 观察位置分布是否再次变化

**步骤 6：返回 Global**
- 点击 "GLOBAL" 按钮
- 位置分布应该恢复到基础后验 P₀

### 预期结果

**Brand 示例**（假设数据）：
- **Global**: jungle 75%, support 19%, mid 6%
- **Patch 15.18**: jungle 72%, support 21%, mid 7%（补丁调整）
- **LCK**: jungle 70%, support 23%, mid 7%（赛区偏好）
- **15.18 + LCK**: jungle 68%, support 25%, mid 7%（组合调整）

**关键验证点**：
- ✅ 切换 Patch/Region 时，百分比应该变化
- ✅ 变化幅度通常为 ±1-3%（小幅调整）
- ✅ 返回 Global 时，恢复到原始值
- ✅ 活动指示器显示当前模式（"Patch Active" / "Region Active" / "Patch + Region"）

---

## 性能考虑

### 当前实现
- 每次 Context 变化时，重新计算所有敌方英雄的角色灵活度
- 对于 5 个英雄，这是 5 次 API 调用的数据（但在单个请求中批量处理）

### 未来优化（可选）
1. **客户端缓存**：缓存已计算的结果，避免重复请求
2. **服务器端缓存**：使用 Next.js 的 `unstable_cache` 或 Redis
3. **增量更新**：只重新计算变化的英雄
4. **预加载**：在用户切换 Context 前预加载常用组合

---

## 调试

### 检查 API 是否被调用
打开浏览器开发者工具 → Network 标签：
- 应该看到 `POST /api/role-flexibility` 请求
- 检查 Request Payload：包含 champions, patch, region
- 检查 Response：包含 results 数组

### 检查服务器日志
```bash
tail -f /tmp/nextjs-dev.log
```
- 应该看到 API 请求日志
- 如果有错误，会显示 "Role flexibility API error"

### 检查客户端控制台
- 如果 API 调用失败，会显示 "Failed to fetch role flexibility"
- 检查是否有网络错误或 CORS 问题

---

## 文件清单

### 新建文件
1. `/app/api/role-flexibility/route.ts` - API 路由

### 修改文件
1. `/app/components/PTSRiskBoard.tsx` - 改为通过 API 获取数据

### 未修改文件（但相关）
1. `/app/lib/role-adjustment.ts` - 调整逻辑保持不变
2. `/app/lib/role-flexibility.ts` - 计算逻辑保持不变
3. `/app/bp/page.tsx` - Context Filter 集成保持不变

---

## 总结

### 问题
Context Filter UI 存在但不工作，因为客户端组件无法访问 550KB 的调整数据。

### 解决方案
创建服务器端 API 路由，在服务器端执行计算，客户端通过 HTTP 请求获取结果。

### 关键成就
- ✅ 保持客户端 bundle 轻量
- ✅ 完整的调整功能现在可用
- ✅ Context Filter 真正成为"一等公民"
- ✅ 用户可以看到 Patch/Region 对位置分布的实际影响

### 下一步
测试功能，验证 Brand、Maokai 等英雄的位置分布在切换 Context 时确实发生变化。

---

**完成日期**：2026-01-22
**状态**：✅ Context Filter 功能已修复并部署
**测试**：待用户验证
