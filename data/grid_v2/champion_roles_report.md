# Champion Roles Canon Report

**生成时间**: 2026-01-31T18:22:54.344Z
**数据源**: `role_shift_diagnosis.json`

---

## 1. 总结

| 指标 | 数值 |
|------|------|
| 来源诊断事件总数 | 5,808 |
| 可信样本数（用于 canon 统计） | 4,364 |
| 涉及的比赛数 | 2,661 |
| canon 中英雄总数 | 115 |
| **有位置变化的英雄** | 115 |
| **新增 roles 总数** | 132 |
| **删除 roles 总数** | 120 |
| 排除的 swap matches | 256 |
| 排除的 swap samples | 286 |

---

## 2. 为什么排除 Player Swap 样本

### 问题

当选手从一个位置换到另一个位置（例如从打野转为辅助），该选手使用某英雄打的比赛会被错误地计入该英雄的"非主位置"统计，从而**污染英雄位置清单**。

### 排除机制

通过 `role_shift_diagnosis.json` 识别出 `player_role_swap` 事件后：

- **Player swap 样本被完全排除，不污染英雄位置清单**
- 去重后共排除 **286** 个唯一样本（来自 **256** 场唯一比赛）
- 排除条件：`classification == "player_role_swap"`，按 `(matchId, playerId)` 去重

### 收录规则

| 规则 | 值 |
|------|------|
| 可信样本条件 | estimatedRole != null AND assignmentConfidence >= 80% AND classification != "player_role_swap" |
| Role share 阈值 | 15% |
| Shares 归一化 | 求和 = 1 |

---

## 3. 旧静态 Prior vs 新 Canon 差异（Top 50）

| # | 英雄 | 旧 Roles | 新 Roles | 新增 | 删除 | Shares | 样本数 |
|---|------|----------|----------|------|------|--------|--------|
| 1 | Elise | jungle | top, mid, support | +top, mid, support | -jungle | top:28.6%, mid:23.8%, support:42.9% | 21 |
| 2 | MissFortune | bot | top, jungle, mid | +top, jungle, mid | -bot | top:42.9%, jungle:28.6%, mid:28.6% | 14 |
| 3 | Kaisa | bot | top, jungle, mid | +top, jungle, mid | -bot | top:16.7%, jungle:16.7%, mid:66.7% | 6 |
| 4 | Varus | bot | top, jungle, mid | +top, jungle, mid | -bot | top:25.0%, jungle:50.0%, mid:25.0% | 4 |
| 5 | Bard | support | top, jungle, mid | +top, jungle, mid | -support | top:25.0%, jungle:50.0%, mid:25.0% | 4 |
| 6 | Ashe | bot, support | jungle, mid, support | +jungle, mid | -bot | jungle:21.8%, mid:38.2%, support:35.5% | 110 |
| 7 | Pantheon | support, mid, top | jungle, mid | +jungle | -support, top | jungle:76.7%, mid:18.0% | 266 |
| 8 | Galio | mid, support | top, jungle, support | +top, jungle | -mid | top:38.8%, jungle:21.3%, support:31.3% | 80 |
| 9 | Yone | mid, top | top, jungle, bot | +jungle, bot | -mid | top:65.8%, jungle:17.8%, bot:15.1% | 73 |
| 10 | Annie | mid, support | jungle, bot, support | +jungle, bot | -mid | jungle:31.0%, bot:39.7%, support:15.5% | 58 |
| 11 | Corki | mid | top, bot | +top, bot | -mid | top:21.8%, bot:78.2% | 55 |
| 12 | Nautilus | support | top, jungle | +top, jungle | -support | top:17.1%, jungle:82.9% | 41 |
| 13 | Alistar | support | top, jungle | +top, jungle | -support | top:32.3%, jungle:67.7% | 31 |
| 14 | Rell | support | top, jungle | +top, jungle | -support | top:22.2%, jungle:77.8% | 27 |
| 15 | Rakan | support | top, jungle | +top, jungle | -support | top:27.3%, jungle:72.7% | 22 |
| 16 | Ornn | top | mid, bot | +mid, bot | -top | mid:31.8%, bot:54.5% | 22 |
| 17 | Renata | support | top, jungle | +top, jungle | -support | top:38.9%, jungle:61.1% | 18 |
| 18 | Ezreal | bot | top, mid | +top, mid | -bot | top:43.8%, mid:43.8% | 16 |
| 19 | Nami | support | top, jungle | +top, jungle | -support | top:15.4%, jungle:84.6% | 13 |
| 20 | Azir | mid | top, jungle | +top, jungle | -mid | top:76.9%, jungle:15.4% | 13 |
| 21 | Sett | top, support | jungle, mid, support | +jungle, mid | -top | jungle:16.7%, mid:16.7%, support:66.7% | 12 |
| 22 | Braum | support | top, jungle | +top, jungle | -support | top:33.3%, jungle:66.7% | 12 |
| 23 | Trundle | jungle, top | top, mid, bot | +mid, bot | -jungle | top:60.0%, mid:20.0%, bot:20.0% | 10 |
| 24 | Lulu | support | top, jungle | +top, jungle | -support | top:30.0%, jungle:70.0% | 10 |
| 25 | Cassiopeia | mid, top | top, jungle, bot | +jungle, bot | -mid | top:20.0%, jungle:20.0%, bot:60.0% | 10 |
| 26 | Jhin | bot | top, mid | +top, mid | -bot | top:33.3%, mid:66.7% | 9 |
| 27 | Ryze | mid | top, jungle | +top, jungle | -mid | top:37.5%, jungle:50.0% | 8 |
| 28 | Karthus | jungle, mid | top, mid, bot | +top, bot | -jungle | top:37.5%, mid:37.5%, bot:25.0% | 8 |
| 29 | Milio | support | top, jungle | +top, jungle | -support | top:57.1%, jungle:42.9% | 7 |
| 30 | Blitzcrank | support | top, jungle | +top, jungle | -support | top:16.7%, jungle:83.3% | 6 |
| 31 | Ambessa | top | jungle, mid | +jungle, mid | -top | jungle:20.0%, mid:80.0% | 5 |
| 32 | Viktor | mid | top, bot | +top, bot | -mid | top:66.7%, bot:33.3% | 3 |
| 33 | Orianna | mid | top, bot | +top, bot | -mid | top:66.7%, bot:33.3% | 3 |
| 34 | Sion | top | jungle, bot | +jungle, bot | -top | jungle:66.7%, bot:33.3% | 3 |
| 35 | Sylas | mid | top, jungle | +top, jungle | -mid | top:50.0%, jungle:50.0% | 2 |
| 36 | Fiddlesticks | jungle | top, support | +top, support | -jungle | top:50.0%, support:50.0% | 2 |
| 37 | Gwen | top | jungle, mid | +jungle, mid | -top | jungle:50.0%, mid:50.0% | 2 |
| 38 | Heimerdinger | mid, support, top | jungle | +jungle | -mid, support, top | jungle:100.0% | 1 |
| 39 | Brand | support, mid | jungle, mid | +jungle | -support | jungle:38.9%, mid:54.2% | 131 |
| 40 | Aurora | mid, top | top, bot | +bot | -mid | top:66.0%, bot:18.4% | 103 |
| 41 | Zilean | support, mid | jungle | +jungle | -support, mid | jungle:100.0% | 1 |
| 42 | Lux | support, mid | top | +top | -support, mid | top:100.0% | 1 |
| 43 | Karma | support, mid | jungle, mid | +jungle | -support | jungle:16.5%, mid:73.4% | 79 |
| 44 | TahmKench | top, support | bot, support | +bot | -top | bot:39.7%, support:47.6% | 63 |
| 45 | Rumble | top, mid | mid, support | +support | -top | mid:54.5%, support:27.3% | 44 |
| 46 | Leona | support | jungle | +jungle | -support | jungle:86.5% | 37 |
| 47 | Akali | mid, top | top, bot | +bot | -mid | top:61.1%, bot:27.8% | 36 |
| 48 | Seraphine | support, mid, bot | jungle, mid, bot | +jungle | -support | jungle:16.1%, mid:29.0%, bot:51.6% | 31 |
| 49 | Hwei | mid, support | bot, support | +bot | -mid | bot:25.9%, support:55.6% | 27 |
| 50 | XinZhao | jungle | top | +top | -jungle | top:100.0% | 26 |

---

## 4. Top 50 变化最大的英雄（详细）

### 1. Elise

- **旧 Prior**: [jungle]
- **新 Canon**: [top, mid, support]
- **新增位置**: top, mid, support
- **删除位置**: jungle
- **Shares**: top:28.6%, mid:23.8%, support:42.9%
- **样本数**: 21

### 2. MissFortune

- **旧 Prior**: [bot]
- **新 Canon**: [top, jungle, mid]
- **新增位置**: top, jungle, mid
- **删除位置**: bot
- **Shares**: top:42.9%, jungle:28.6%, mid:28.6%
- **样本数**: 14

### 3. Kaisa

- **旧 Prior**: [bot]
- **新 Canon**: [top, jungle, mid]
- **新增位置**: top, jungle, mid
- **删除位置**: bot
- **Shares**: top:16.7%, jungle:16.7%, mid:66.7%
- **样本数**: 6

### 4. Varus

- **旧 Prior**: [bot]
- **新 Canon**: [top, jungle, mid]
- **新增位置**: top, jungle, mid
- **删除位置**: bot
- **Shares**: top:25.0%, jungle:50.0%, mid:25.0%
- **样本数**: 4

### 5. Bard

- **旧 Prior**: [support]
- **新 Canon**: [top, jungle, mid]
- **新增位置**: top, jungle, mid
- **删除位置**: support
- **Shares**: top:25.0%, jungle:50.0%, mid:25.0%
- **样本数**: 4

### 6. Ashe

- **旧 Prior**: [bot, support]
- **新 Canon**: [jungle, mid, support]
- **新增位置**: jungle, mid
- **删除位置**: bot
- **Shares**: jungle:21.8%, mid:38.2%, support:35.5%
- **样本数**: 110

### 7. Pantheon

- **旧 Prior**: [support, mid, top]
- **新 Canon**: [jungle, mid]
- **新增位置**: jungle
- **删除位置**: support, top
- **Shares**: jungle:76.7%, mid:18.0%
- **样本数**: 266

### 8. Galio

- **旧 Prior**: [mid, support]
- **新 Canon**: [top, jungle, support]
- **新增位置**: top, jungle
- **删除位置**: mid
- **Shares**: top:38.8%, jungle:21.3%, support:31.3%
- **样本数**: 80

### 9. Yone

- **旧 Prior**: [mid, top]
- **新 Canon**: [top, jungle, bot]
- **新增位置**: jungle, bot
- **删除位置**: mid
- **Shares**: top:65.8%, jungle:17.8%, bot:15.1%
- **样本数**: 73

### 10. Annie

- **旧 Prior**: [mid, support]
- **新 Canon**: [jungle, bot, support]
- **新增位置**: jungle, bot
- **删除位置**: mid
- **Shares**: jungle:31.0%, bot:39.7%, support:15.5%
- **样本数**: 58

### 11. Corki

- **旧 Prior**: [mid]
- **新 Canon**: [top, bot]
- **新增位置**: top, bot
- **删除位置**: mid
- **Shares**: top:21.8%, bot:78.2%
- **样本数**: 55

### 12. Nautilus

- **旧 Prior**: [support]
- **新 Canon**: [top, jungle]
- **新增位置**: top, jungle
- **删除位置**: support
- **Shares**: top:17.1%, jungle:82.9%
- **样本数**: 41

### 13. Alistar

- **旧 Prior**: [support]
- **新 Canon**: [top, jungle]
- **新增位置**: top, jungle
- **删除位置**: support
- **Shares**: top:32.3%, jungle:67.7%
- **样本数**: 31

### 14. Rell

- **旧 Prior**: [support]
- **新 Canon**: [top, jungle]
- **新增位置**: top, jungle
- **删除位置**: support
- **Shares**: top:22.2%, jungle:77.8%
- **样本数**: 27

### 15. Rakan

- **旧 Prior**: [support]
- **新 Canon**: [top, jungle]
- **新增位置**: top, jungle
- **删除位置**: support
- **Shares**: top:27.3%, jungle:72.7%
- **样本数**: 22

### 16. Ornn

- **旧 Prior**: [top]
- **新 Canon**: [mid, bot]
- **新增位置**: mid, bot
- **删除位置**: top
- **Shares**: mid:31.8%, bot:54.5%
- **样本数**: 22

### 17. Renata

- **旧 Prior**: [support]
- **新 Canon**: [top, jungle]
- **新增位置**: top, jungle
- **删除位置**: support
- **Shares**: top:38.9%, jungle:61.1%
- **样本数**: 18

### 18. Ezreal

- **旧 Prior**: [bot]
- **新 Canon**: [top, mid]
- **新增位置**: top, mid
- **删除位置**: bot
- **Shares**: top:43.8%, mid:43.8%
- **样本数**: 16

### 19. Nami

- **旧 Prior**: [support]
- **新 Canon**: [top, jungle]
- **新增位置**: top, jungle
- **删除位置**: support
- **Shares**: top:15.4%, jungle:84.6%
- **样本数**: 13

### 20. Azir

- **旧 Prior**: [mid]
- **新 Canon**: [top, jungle]
- **新增位置**: top, jungle
- **删除位置**: mid
- **Shares**: top:76.9%, jungle:15.4%
- **样本数**: 13

### 21. Sett

- **旧 Prior**: [top, support]
- **新 Canon**: [jungle, mid, support]
- **新增位置**: jungle, mid
- **删除位置**: top
- **Shares**: jungle:16.7%, mid:16.7%, support:66.7%
- **样本数**: 12

### 22. Braum

- **旧 Prior**: [support]
- **新 Canon**: [top, jungle]
- **新增位置**: top, jungle
- **删除位置**: support
- **Shares**: top:33.3%, jungle:66.7%
- **样本数**: 12

### 23. Trundle

- **旧 Prior**: [jungle, top]
- **新 Canon**: [top, mid, bot]
- **新增位置**: mid, bot
- **删除位置**: jungle
- **Shares**: top:60.0%, mid:20.0%, bot:20.0%
- **样本数**: 10

### 24. Lulu

- **旧 Prior**: [support]
- **新 Canon**: [top, jungle]
- **新增位置**: top, jungle
- **删除位置**: support
- **Shares**: top:30.0%, jungle:70.0%
- **样本数**: 10

### 25. Cassiopeia

- **旧 Prior**: [mid, top]
- **新 Canon**: [top, jungle, bot]
- **新增位置**: jungle, bot
- **删除位置**: mid
- **Shares**: top:20.0%, jungle:20.0%, bot:60.0%
- **样本数**: 10

### 26. Jhin

- **旧 Prior**: [bot]
- **新 Canon**: [top, mid]
- **新增位置**: top, mid
- **删除位置**: bot
- **Shares**: top:33.3%, mid:66.7%
- **样本数**: 9

### 27. Ryze

- **旧 Prior**: [mid]
- **新 Canon**: [top, jungle]
- **新增位置**: top, jungle
- **删除位置**: mid
- **Shares**: top:37.5%, jungle:50.0%
- **样本数**: 8

### 28. Karthus

- **旧 Prior**: [jungle, mid]
- **新 Canon**: [top, mid, bot]
- **新增位置**: top, bot
- **删除位置**: jungle
- **Shares**: top:37.5%, mid:37.5%, bot:25.0%
- **样本数**: 8

### 29. Milio

- **旧 Prior**: [support]
- **新 Canon**: [top, jungle]
- **新增位置**: top, jungle
- **删除位置**: support
- **Shares**: top:57.1%, jungle:42.9%
- **样本数**: 7

### 30. Blitzcrank

- **旧 Prior**: [support]
- **新 Canon**: [top, jungle]
- **新增位置**: top, jungle
- **删除位置**: support
- **Shares**: top:16.7%, jungle:83.3%
- **样本数**: 6

### 31. Ambessa

- **旧 Prior**: [top]
- **新 Canon**: [jungle, mid]
- **新增位置**: jungle, mid
- **删除位置**: top
- **Shares**: jungle:20.0%, mid:80.0%
- **样本数**: 5

### 32. Viktor

- **旧 Prior**: [mid]
- **新 Canon**: [top, bot]
- **新增位置**: top, bot
- **删除位置**: mid
- **Shares**: top:66.7%, bot:33.3%
- **样本数**: 3

### 33. Orianna

- **旧 Prior**: [mid]
- **新 Canon**: [top, bot]
- **新增位置**: top, bot
- **删除位置**: mid
- **Shares**: top:66.7%, bot:33.3%
- **样本数**: 3

### 34. Sion

- **旧 Prior**: [top]
- **新 Canon**: [jungle, bot]
- **新增位置**: jungle, bot
- **删除位置**: top
- **Shares**: jungle:66.7%, bot:33.3%
- **样本数**: 3

### 35. Sylas

- **旧 Prior**: [mid]
- **新 Canon**: [top, jungle]
- **新增位置**: top, jungle
- **删除位置**: mid
- **Shares**: top:50.0%, jungle:50.0%
- **样本数**: 2

### 36. Fiddlesticks

- **旧 Prior**: [jungle]
- **新 Canon**: [top, support]
- **新增位置**: top, support
- **删除位置**: jungle
- **Shares**: top:50.0%, support:50.0%
- **样本数**: 2

### 37. Gwen

- **旧 Prior**: [top]
- **新 Canon**: [jungle, mid]
- **新增位置**: jungle, mid
- **删除位置**: top
- **Shares**: jungle:50.0%, mid:50.0%
- **样本数**: 2

### 38. Heimerdinger

- **旧 Prior**: [mid, support, top]
- **新 Canon**: [jungle]
- **新增位置**: jungle
- **删除位置**: mid, support, top
- **Shares**: jungle:100.0%
- **样本数**: 1

### 39. Brand

- **旧 Prior**: [support, mid]
- **新 Canon**: [jungle, mid]
- **新增位置**: jungle
- **删除位置**: support
- **Shares**: jungle:38.9%, mid:54.2%
- **样本数**: 131

### 40. Aurora

- **旧 Prior**: [mid, top]
- **新 Canon**: [top, bot]
- **新增位置**: bot
- **删除位置**: mid
- **Shares**: top:66.0%, bot:18.4%
- **样本数**: 103

### 41. Zilean

- **旧 Prior**: [support, mid]
- **新 Canon**: [jungle]
- **新增位置**: jungle
- **删除位置**: support, mid
- **Shares**: jungle:100.0%
- **样本数**: 1

### 42. Lux

- **旧 Prior**: [support, mid]
- **新 Canon**: [top]
- **新增位置**: top
- **删除位置**: support, mid
- **Shares**: top:100.0%
- **样本数**: 1

### 43. Karma

- **旧 Prior**: [support, mid]
- **新 Canon**: [jungle, mid]
- **新增位置**: jungle
- **删除位置**: support
- **Shares**: jungle:16.5%, mid:73.4%
- **样本数**: 79

### 44. TahmKench

- **旧 Prior**: [top, support]
- **新 Canon**: [bot, support]
- **新增位置**: bot
- **删除位置**: top
- **Shares**: bot:39.7%, support:47.6%
- **样本数**: 63

### 45. Rumble

- **旧 Prior**: [top, mid]
- **新 Canon**: [mid, support]
- **新增位置**: support
- **删除位置**: top
- **Shares**: mid:54.5%, support:27.3%
- **样本数**: 44

### 46. Leona

- **旧 Prior**: [support]
- **新 Canon**: [jungle]
- **新增位置**: jungle
- **删除位置**: support
- **Shares**: jungle:86.5%
- **样本数**: 37

### 47. Akali

- **旧 Prior**: [mid, top]
- **新 Canon**: [top, bot]
- **新增位置**: bot
- **删除位置**: mid
- **Shares**: top:61.1%, bot:27.8%
- **样本数**: 36

### 48. Seraphine

- **旧 Prior**: [support, mid, bot]
- **新 Canon**: [jungle, mid, bot]
- **新增位置**: jungle
- **删除位置**: support
- **Shares**: jungle:16.1%, mid:29.0%, bot:51.6%
- **样本数**: 31

### 49. Hwei

- **旧 Prior**: [mid, support]
- **新 Canon**: [bot, support]
- **新增位置**: bot
- **删除位置**: mid
- **Shares**: bot:25.9%, support:55.6%
- **样本数**: 27

### 50. XinZhao

- **旧 Prior**: [jungle]
- **新 Canon**: [top]
- **新增位置**: top
- **删除位置**: jungle
- **Shares**: top:100.0%
- **样本数**: 26

---

## 5. Player Role Swap 事件摘要

共 **286** 个去重事件被排除（286 唯一样本，256 唯一比赛）。

### Top 20 涉及的选手

| 选手 | 事件数 |
|------|--------|
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
| Caps | 6 |
| Palafox | 6 |
| Duro | 6 |
| Razork | 5 |
| Raptor | 5 |
| glfs | 5 |
| Zhuo | 5 |
| Xiaohu | 5 |
| Angel | 5 |
| Beichuan | 5 |


### 示例事件

- **DnDn**: jungle → top, 英雄: Rumble, 日期: 2025-08-03
- **Sylvie**: top → jungle, 英雄: Maokai, 日期: 2024-01-20
- **Sylvie**: support → jungle, 英雄: Poppy, 日期: 2024-02-04
- **Sylvie**: support → jungle, 英雄: Lee Sin, 日期: 2024-03-20
- **Sylvie**: jungle → top, 英雄: Taliyah, 日期: 2024-06-19

---

## 6. 输出文件

| 文件 | 路径 |
|------|------|
| 英雄位置清单（全英雄） | `data/grid_v2/champion_roles_canon.json` |
| 有变化的英雄 (delta) | `data/grid_v2/champion_roles_delta_from_prior.json` |
| Player Swap 事件 | `data/grid_v2/player_role_swap_cases.json` |
| 本报告 | `data/grid_v2/champion_roles_report.md` |

---

## 7. 运行命令

```bash
npm run build:champion-roles-canon
```

或

```bash
npx tsx app/scripts/build-champion-roles-canon.ts
```
