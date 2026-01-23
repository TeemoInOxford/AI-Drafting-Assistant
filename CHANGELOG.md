# LOL Esports 数据清洗与更新日志

## 版本 v0.1.1 (2026-01-24)

### 🎯 主要更新

本次更新重新设计了数据清洗策略，从基于战队关系的清洗改为**基于比赛记录的清洗**，确保所有保留的数据都有真实的比赛支撑。

### ✨ 新增功能

1. **基于比赛记录的数据清洗**
   - 新增清洗脚本：`scripts/grid-data-fetcher/clean_by_matches.py`
   - 只保留有比赛记录的选手（573名）
   - 只保留有比赛的联赛（29个）
   - 保留所有有参赛选手的战队（54支）

2. **新的数据文件**
   - `data/lol/hierarchy_match_based.json` - 基于比赛清洗的数据
   - 原始数据文件 `data/lol/hierarchy.json` 保持不变

3. **完整的数据列表文档**
   - `docs/complete-data-list.md` - 人类可读的完整列表
   - `docs/complete-data-list.json` - 机器可读的JSON格式
   - 包含所有573名选手、54支战队、29个联赛、1,632场比赛的详细信息

### 📊 数据统计

| 指标 | 原始数据 | v0.1.1 |
|------|---------|--------|
| 选手 | 18,804 | 573 |
| 战队 | 2,165 | 54 |
| 联赛 | 173 | 29 |
| 比赛 | 1,632 | 1,632 |

### 🔧 使用方法

```bash
cd scripts/grid-data-fetcher
python clean_by_matches.py
python convert_match_based_to_api.py
python generate_complete_list.py
```

### 📝 文档

- [完整数据列表](./docs/complete-data-list.md)
- [数据汇总报告](./docs/data-summary-match-based.md)
- [数据清洗报告](./docs/data-cleaning-report.md)
