# LOL Esports 数据汇总报告（基于比赛记录清洗）

**生成时间**: 2026-01-24
**数据来源**: Grid Esports API
**清洗策略**: 只保留有比赛记录的选手和联赛

---

## 📊 数据概览

### 清洗前后对比

| 指标 | 原始数据 | 清洗后 | 说明 |
|------|---------|--------|------|
| 选手总数 | 18,804 | 573 | 只保留有比赛记录的选手 |
| 战队总数 | 2,165 | 54 | 只保留有参赛选手的战队 |
| 联赛总数 | 173 | 29 | 只保留有比赛的联赛 |
| 赛区总数 | 7 | 7 | 保持不变 |
| 比赛总数 | - | 1,632 | 统计的比赛场次 |

### 清洗规则

✅ **保留的数据**:
- 所有有比赛记录的选手（包括名字有数字后缀的）
- 所有有比赛记录的选手（包括名字为空的）
- 所有有参赛选手的战队
- 所有有比赛的联赛

❌ **移除的数据**:
- 没有任何比赛记录的选手（可能是主播、分析师等）
- 没有参赛选手的战队
- 没有比赛的联赛

---

## 🌍 赛区详情

### 1. LPL (中国)
- **联赛数**: 24
- **战队数**: 17
- **选手数**: 173

### 2. LCK (韩国)
- **联赛数**: 19
- **战队数**: 10
- **选手数**: 126

### 3. LEC (欧洲)
- **联赛数**: 20
- **战队数**: 11
- **选手数**: 82

### 4. LCS (北美)
- **联赛数**: 6
- **战队数**: 8
- **选手数**: 48

### 5. LTA Cross-Conference (美洲)
- **联赛数**: 4
- **战队数**: 11
- **选手数**: 85

### 6. LTA North (北美)
- **联赛数**: 10
- **战队数**: 8
- **选手数**: 63

### 7. LTA South (南美)
- **联赛数**: 10
- **战队数**: 8
- **选手数**: 60

---

## 🏆 联赛列表（按赛区分组）

### LPL 联赛
1. LPL - Split 3 2025
2. LPL - Split 2 2025
3. LPL - Split 1 2025
4. LPL - Regional Qualifier 2024
5. LPL - Summer 2024
6. LPL - Spring 2024
7. LPL - Spring 2024 (Regular Season)
8. LPL - Spring 2024 (Playoffs)
9. LPL - Spring 2024 (Playoffs: Playoffs)
10. LPL - Spring 2024 (Playoffs: Playoffs: Playoffs)
11. LPL - Spring 2024 (Playoffs: Playoffs: Playoffs: Playoffs)
12. LPL - Spring 2024 (Playoffs: Playoffs: Playoffs: Playoffs: Playoffs)
13. LPL - Spring 2024 (Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs)
14. LPL - Spring 2024 (Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs)
15. LPL - Spring 2024 (Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs)
16. LPL - Spring 2024 (Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs)
17. LPL - Spring 2024 (Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs)
18. LPL - Spring 2024 (Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs)
19. LPL - Spring 2024 (Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs)
20. LPL - Spring 2024 (Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs)
21. LPL - Spring 2024 (Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs)
22. LPL - Spring 2024 (Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs)
23. LPL - Spring 2024 (Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs)
24. LPL - Spring 2024 (Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs)

### LCK 联赛
1. LCK - LCK Cup 2025
2. LCK - LCK Cup 2025 (Groups)
3. LCK - LCK Cup 2025 (Play-Ins)
4. LCK - LCK Cup 2025 (Playoffs)
5. LCK - Regional Qualifier 2024
6. LCK - Regional Qualifier 2024 (regional_qualifier)
7. LCK - Split 2 2025
8. LCK - Split 2 2025 (Regular Season)
9. LCK - Split 2 2025 (Road to MSI)
10. LCK - Split 3 2025
11. LCK - Split 3 2025 (Groups)
12. LCK - Split 3 2025 (Play-Ins)
13. LCK - Split 3 2025 (Playoffs)
14. LCK - Summer 2024
15. LCK - Summer 2024 (Regular Season)
16. LCK - Summer 2024 (Playoffs)
17. LCK - Summer 2024 (Playoffs: Playoffs)
18. LCK - Summer 2024 (Playoffs: Playoffs: Playoffs)
19. LCK - Summer 2024 (Playoffs: Playoffs: Playoffs: Playoffs)

### LEC 联赛
1. LEC - Season Finals 2024
2. LEC - Season Finals 2024 (Season Finals)
3. LEC - Season Finals 2024 (Season Finals: Season Finals)
4. LEC - Season Finals 2024 (Season Finals: Season Finals: Season Finals)
5. LEC - Season Finals 2024 (Season Finals: Season Finals: Season Finals: Season Finals)
6. LEC - Season Finals 2024 (Season Finals: Season Finals: Season Finals: Season Finals: Season Finals)
7. LEC - Season Finals 2024 (Season Finals: Season Finals: Season Finals: Season Finals: Season Finals: Season Finals)
8. LEC - Season Finals 2024 (Season Finals: Season Finals: Season Finals: Season Finals: Season Finals: Season Finals: Season Finals)
9. LEC - Season Finals 2024 (Season Finals: Season Finals: Season Finals: Season Finals: Season Finals: Season Finals: Season Finals: Season Finals)
10. LEC - Season Finals 2024 (Season Finals: Season Finals: Season Finals: Season Finals: Season Finals: Season Finals: Season Finals: Season Finals: Season Finals)
11. LEC - Split 1 2025
12. LEC - Split 1 2025 (Regular Season)
13. LEC - Split 1 2025 (Playoffs)
14. LEC - Split 1 2025 (Playoffs: Playoffs)
15. LEC - Split 1 2025 (Playoffs: Playoffs: Playoffs)
16. LEC - Split 1 2025 (Playoffs: Playoffs: Playoffs: Playoffs)
17. LEC - Split 1 2025 (Playoffs: Playoffs: Playoffs: Playoffs: Playoffs)
18. LEC - Split 1 2025 (Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs)
19. LEC - Split 1 2025 (Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs)
20. LEC - Split 1 2025 (Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs)

### LCS 联赛
1. LCS - Split 1 2025
2. LCS - Split 1 2025 (Regular Season)
3. LCS - Split 1 2025 (Playoffs)
4. LCS - Split 1 2025 (Playoffs: Playoffs)
5. LCS - Split 1 2025 (Playoffs: Playoffs: Playoffs)
6. LCS - Split 1 2025 (Playoffs: Playoffs: Playoffs: Playoffs)

### LTA Cross-Conference 联赛
1. LTA Cross-Conference - Regional Championship 2025
2. LTA Cross-Conference - Regional Championship 2025 (Regional Finals)
3. LTA Cross-Conference - Regional Championship 2025 (Regional Finals: Regional Finals)
4. LTA Cross-Conference - Regional Championship 2025 (Regional Finals: Regional Finals: Regional Finals)

### LTA North 联赛
1. LTA North - Split 1 2025
2. LTA North - Split 1 2025 (Regular Season)
3. LTA North - Split 1 2025 (Playoffs)
4. LTA North - Split 1 2025 (Playoffs: Playoffs)
5. LTA North - Split 1 2025 (Playoffs: Playoffs: Playoffs)
6. LTA North - Split 1 2025 (Playoffs: Playoffs: Playoffs: Playoffs)
7. LTA North - Split 1 2025 (Playoffs: Playoffs: Playoffs: Playoffs: Playoffs)
8. LTA North - Split 1 2025 (Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs)
9. LTA North - Split 1 2025 (Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs)
10. LTA North - Split 1 2025 (Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs)

### LTA South 联赛
1. LTA South - Split 1 2025
2. LTA South - Split 1 2025 (Regular Season)
3. LTA South - Split 1 2025 (Playoffs)
4. LTA South - Split 1 2025 (Playoffs: Playoffs)
5. LTA South - Split 1 2025 (Playoffs: Playoffs: Playoffs)
6. LTA South - Split 1 2025 (Playoffs: Playoffs: Playoffs: Playoffs)
7. LTA South - Split 1 2025 (Playoffs: Playoffs: Playoffs: Playoffs: Playoffs)
8. LTA South - Split 1 2025 (Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs)
9. LTA South - Split 1 2025 (Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs)
10. LTA South - Split 1 2025 (Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs: Playoffs)

---

## 🛡️ 战队列表（54支）

| 战队ID | 战队名称 | 选手数 | 参与联赛数 |
|--------|---------|--------|-----------|
| 340 | FlyQuest | 10 | 4 |
| 356 | JD Gaming | 13 | 6 |
| 368 | Bilibili Gaming | 11 | 6 |
| 369 | LNG Esports | 8 | 2 |
| 375 | Top Esports | 11 | 6 |
| 406 | Hanwha Life Esports | 13 | 13 |
| 407 | T1 | 13 | 13 |
| 3113 | Rare Atom | 11 | 6 |
| 3483 | KT Rolster | 13 | 13 |
| 4035 | Dplus KIA | 13 | 13 |
| 20483 | Weibo Gaming | 11 | 6 |
| 47319 | Oh My God | 8 | 2 |
| 47370 | Team Vitality | 11 | 10 |
| 47380 | G2 Esports | 11 | 10 |
| 47472 | Anyone's Legend | 11 | 6 |
| 47494 | Nongshim RedForce | 13 | 13 |
| 47497 | 100 Thieves | 10 | 4 |
| 47509 | Ninjas in Pyjamas | 11 | 6 |
| 47514 | FunPlus Phoenix | 11 | 6 |
| 47558 | Gen.G Esports | 13 | 13 |
| 47619 | Movistar KOI | 11 | 10 |
| 47922 | Ultra Prime | 8 | 2 |
| 47961 | DRX | 13 | 13 |
| 48173 | Vivo Keyd Stars | 10 | 10 |
| 48179 | Kwangdong Freecs | 13 | 13 |
| 48180 | Shopify Rebellion | 10 | 4 |
| 52606 | THUNDERTALKGAMING | 11 | 6 |
| 52661 | Shifters | 11 | 10 |
| 52726 | Suzhou LNG Ninebot Esports | 11 | 6 |
| 52747 | OK Savings Bank BRION | 13 | 13 |
| 52796 | Team BDS | 11 | 6 |
| 52817 | Liiv SANDBOX | 13 | 13 |
| 52822 | Invictus Gaming | 11 | 6 |
| 52905 | Wolves Esports | 11 | 6 |
| 52910 | Xi'an Team WE | 11 | 6 |
| 53165 | Karmine Corp | 11 | 10 |
| 53166 | Team Heretics | 11 | 10 |
| 53167 | SK Gaming | 11 | 10 |
| 53168 | GIANTX | 11 | 10 |
| 53169 | MAD Lions KOI | 11 | 10 |
| 53170 | Team BDS | 11 | 10 |
| 53171 | Fnatic | 11 | 10 |
| 53172 | Dignitas | 10 | 4 |
| 53173 | M80 | 10 | 10 |
| 53174 | Disguised | 10 | 4 |
| 53175 | Team Liquid | 10 | 4 |
| 53176 | Cloud9 | 10 | 4 |
| 53177 | Fluxo | 10 | 10 |
| 53178 | Isurus | 10 | 10 |
| 53179 | Leviatán Esports | 10 | 10 |
| 53180 | Movistar R7 | 10 | 10 |
| 53181 | paiN Gaming | 10 | 10 |
| 53182 | Red Canids | 10 | 10 |
| 53183 | Team Aze | 10 | 10 |

---

## 👤 选手统计

**总选手数**: 573 名

**选手分布**:
- LPL: 173 名
- LCK: 126 名
- LEC: 82 名
- LTA Cross-Conference: 85 名
- LTA North: 63 名
- LTA South: 60 名
- LCS: 48 名

**注意事项**:
- 保留了所有有比赛记录的选手，包括名字有数字后缀的（如 Solbon2, KCGeneric4 等）
- 保留了名字为空或特殊字符的选手
- 这些选手都有真实的比赛记录，不是测试账号

---

## 📁 数据文件

### 项目数据文件
- `data/lol/hierarchy.json` - 原始清洗数据（5,804名选手，基于战队关系）
- `data/lol/hierarchy_match_based.json` - 基于比赛记录清洗的数据（573名选手）✨ 新增
- `data/lol/series.json` - 比赛数据（1,632场比赛）

### 脚本数据文件
- `scripts/grid-data-fetcher/data/lol_players.json` - 原始选手数据（18,804名）
- `scripts/grid-data-fetcher/data/lol_teams.json` - 原始战队数据（2,165支）
- `scripts/grid-data-fetcher/data/lol_player_relationships.json` - 选手关系和比赛记录
- `scripts/grid-data-fetcher/data/lol_hierarchy_match_based.json` - 清洗后层级数据
- `scripts/grid-data-fetcher/data/lol_hierarchy_match_based_api.json` - API格式数据

---

## 🔄 使用建议

### 选择哪个数据文件？

**使用 `hierarchy_match_based.json` 如果你需要**:
- ✅ 只关注有比赛记录的选手
- ✅ 更精简的数据集（573名选手）
- ✅ 确保所有选手都参加过比赛
- ✅ 适合比赛数据分析

**使用 `hierarchy.json` 如果你需要**:
- ✅ 包含所有有战队的选手（5,804名）
- ✅ 包含替补选手、分析师等
- ✅ 更完整的战队名单
- ✅ 适合战队管理分析

---

## 📝 清洗日志

**清洗脚本**: `scripts/grid-data-fetcher/clean_by_matches.py`

**清洗过程**:
1. 加载原始数据（18,804名选手）
2. 从 `lol_player_relationships.json` 提取有比赛记录的选手（573名）
3. 从 `series.json` 提取有比赛的联赛（29个）
4. 过滤层级数据，只保留有比赛的联赛和选手
5. 生成清洗后的数据文件

**清洗结果**:
- 移除了 18,231 名没有比赛记录的选手
- 移除了 144 个没有比赛的联赛
- 保留了所有 7 个赛区
- 保留了 54 支有参赛选手的战队

---

**报告生成时间**: 2026-01-24
**数据版本**: v1.0 (基于比赛记录清洗)
