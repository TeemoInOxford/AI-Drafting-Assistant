# Context Filter 测试指南

## 重要前提条件

### 1. 必须激活 AI 模式

**DRAFTING ASSISTANT（PTSRiskBoard）只在 AI 模式下显示！**

激活步骤：
1. 打开 BP 页面：http://localhost:3004/bp
2. 点击页面顶部的 **"Your Team: Blue"** 或 **"Your Team: Red"** 按钮
3. 确认按钮变为高亮状态（表示已选择队伍）
4. 只有在选择队伍后，DRAFTING ASSISTANT 才会出现在屏幕左侧或右侧

### 2. 必须进入 Pick 阶段

- 完成 6 个 Ban（蓝方 3 个，红方 3 个）
- 进入 Pick 阶段后，DRAFTING ASSISTANT 才会显示敌方英雄

### 3. 必须有敌方 Pick

- 对方必须至少 Pick 一个英雄
- DRAFTING ASSISTANT 的 "Enemy Picks" 区域才会显示位置分布

## 完整测试流程

### 步骤 1：准备环境

1. 打开浏览器（推荐 Chrome）
2. 按 F12 打开开发者工具
3. 切换到 **Console** 标签（查看调试日志）
4. 切换到 **Network** 标签（查看 API 调用）
5. 访问 http://localhost:3004/bp

### 步骤 2：激活 AI 模式

1. 点击 **"Your Team: Blue"** 按钮
2. 确认按钮高亮
3. 此时 DRAFTING ASSISTANT 应该出现在屏幕左侧

### 步骤 3：完成 Ban 阶段

随意 Ban 6 个英雄（蓝方 3 个，红方 3 个）

### 步骤 4：进入 Pick 阶段并让对方 Pick

1. 如果你是蓝方，等待红方 Pick（或手动切换到红方 Pick）
2. 让对方 Pick **Brand**（重要：选择 Brand 因为我们知道他的数据）
3. 观察 DRAFTING ASSISTANT 的 "Enemy Picks" 区域

### 步骤 5：记录基础值（Global 模式）

在 Console 中应该看到类似的日志：
```
[PTSRiskBoard] Brand flexibility: {
  original: [
    { role: "jungle", probability: 0.7544... },
    { role: "support", probability: 0.1897... },
    { role: "mid", probability: 0.0558... }
  ],
  adjustmentMeta: { notes: [], weights: {} }
}
```

**记录这些值**：
- jungle: ~75.4%
- support: ~19.0%
- mid: ~5.6%

### 步骤 6：切换到 Patch 14.15

1. 在 Context Filter 区域，点击 **Patch** 下拉菜单
2. 选择 **Patch 14.15**（这个版本有 12 场比赛，足够样本）
3. 观察 Console 日志

**预期日志**：
```
[PTSRiskBoard] useEffect triggered {
  enemyPicksCount: 1,
  selectedPatch: "14.15",
  selectedRegion: null,
  enemyPickNames: ["Brand"]
}

[PTSRiskBoard] Fetching role flexibility from API...

[PTSRiskBoard] API response: {
  results: [{
    championId: "Brand",
    flexibility: {
      adjustmentMeta: {
        patch: "14.15",
        patchGames: 12,
        weights: {
          jungle: 0.9863,
          support: 1.0180
        }
      }
    }
  }]
}

[PTSRiskBoard] Brand flexibility: {
  original: [
    { role: "jungle", probability: 0.7493... },  // 减少了！
    { role: "support", probability: 0.1945... }, // 增加了！
    { role: "mid", probability: 0.0562... }
  ]
}
```

**预期变化**：
- jungle: 75.4% → **74.9%**（减少 0.5%）
- support: 19.0% → **19.5%**（增加 0.5%）

### 步骤 7：切换回 Global

1. 点击 **GLOBAL** 按钮
2. 观察 Console 日志
3. 值应该恢复到原始的 75.4% / 19.0% / 5.6%

### 步骤 8：测试样本不足的补丁

1. 选择 **Patch 15.18**（只有 8 场比赛）
2. 观察 Console 日志

**预期日志**：
```
[PTSRiskBoard] Brand flexibility: {
  adjustmentMeta: {
    patch: "15.18",
    notes: ["Insufficient data for patch 15.18 (< 10 games)"],
    weights: {}
  }
}
```

**预期结果**：
- 值保持在 75.4% / 19.0% / 5.6%（没有调整）
- adjustmentMeta.notes 包含 "Insufficient data" 消息

## 检查清单

### ✓ 如果功能正常工作

- [ ] Console 显示 `[PTSRiskBoard] useEffect triggered` 日志
- [ ] Console 显示 `[PTSRiskBoard] Fetching role flexibility from API...`
- [ ] Network 标签显示 `POST /api/role-flexibility` 请求
- [ ] API 返回 200 状态码
- [ ] Console 显示 `[PTSRiskBoard] API response:` 包含 results
- [ ] 切换到 Patch 14.15 时，百分比发生微小变化（±0.5%）
- [ ] 切换回 Global 时，百分比恢复原值
- [ ] 切换到 Patch 15.18 时，adjustmentMeta.notes 包含 "Insufficient data"

### ✗ 如果功能不工作

**症状 1：Console 没有任何日志**
- 原因：PTSRiskBoard 组件没有渲染
- 检查：是否点击了 "Your Team: Blue/Red" 按钮？
- 检查：是否进入了 Pick 阶段？
- 检查：对方是否 Pick 了英雄？

**症状 2：Console 显示 "No enemy picks"**
- 原因：enemyPicks 数组为空
- 检查：确保对方（不是你的队伍）Pick 了英雄

**症状 3：Console 显示错误 "Failed to fetch"**
- 原因：API 调用失败
- 检查：开发服务器是否运行？
- 检查：Network 标签是否显示 404 或 500 错误？

**症状 4：API 调用成功但百分比不变**
- 原因：可能是样本量不足
- 检查：adjustmentMeta.notes 是否包含 "Insufficient data"？
- 解决：切换到有效的补丁版本（14.12-14.17）

**症状 5：百分比变化太小，看不出来**
- 原因：调整幅度通常 < 1%
- 解决：查看 Console 日志中的精确数值
- 解决：使用计算器对比变化

## 有效的测试补丁版本

### Brand

| 补丁 | 样本量 | 预期变化 |
|------|--------|---------|
| 14.12 | 20场 | 微小变化 |
| 14.13 | 38场 | 微小变化 |
| 14.14 | 46场 | 几乎无变化（< 0.1%） |
| **14.15** | **12场** | **明显变化（±0.5%）** ⭐ 推荐 |
| 14.16 | 11场 | 中等变化 |
| 14.17 | 10场 | 中等变化 |

### 其他 Flex 英雄

如果 Brand 的变化不明显，可以尝试：
- **Sylas**：通常有更大的位置分布变化
- **Swain**：Support/Mid flex，可能有明显调整
- **Gragas**：Jungle/Top flex

## 故障排除

### 问题：DRAFTING ASSISTANT 根本不显示

**解决方案**：
1. 确认已点击 "Your Team: Blue" 或 "Red"
2. 确认按钮处于高亮状态
3. 刷新页面重试

### 问题：Enemy Picks 区域为空

**解决方案**：
1. 确保对方队伍 Pick 了英雄（不是你的队伍）
2. 如果你是蓝方，红方必须先 Pick
3. 检查 Console 是否显示 "No enemy picks"

### 问题：切换 Context 后没有任何反应

**解决方案**：
1. 打开 Console 查看是否有 `[PTSRiskBoard] useEffect triggered` 日志
2. 如果没有日志，说明 props 没有传递到组件
3. 检查 Network 标签是否有 API 调用
4. 如果有 API 调用但没有变化，检查 adjustmentMeta.notes

### 问题：API 返回 500 错误

**解决方案**：
1. 检查服务器日志：`tail -f /tmp/nextjs-dev.log`
2. 查找 "Role flexibility API error" 消息
3. 可能是数据文件损坏或缺失

## 预期结果总结

### 正常情况

1. **Global 模式**：
   - Brand: jungle 75.4%, support 19.0%, mid 5.6%
   - 无调整应用

2. **Patch 14.15 模式**：
   - Brand: jungle 74.9%, support 19.5%, mid 5.6%
   - 调整应用，变化 ±0.5%

3. **Patch 15.18 模式**：
   - Brand: jungle 75.4%, support 19.0%, mid 5.6%
   - 样本不足，无调整应用

### 关键指标

- **变化幅度**：通常 ±0.5-1%，不会超过 ±3%
- **API 响应时间**：< 500ms
- **Console 日志**：每次切换都应该有完整的日志链

---

**测试日期**：2026-01-22
**服务器地址**：http://localhost:3004/bp
**调试模式**：已启用详细日志
**下一步**：按照此指南逐步测试，并报告 Console 中的日志内容
