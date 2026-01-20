# LOL数据架构文档

## 一、数据来源

### GRID API 层级
```
Central Data Feed (静态数据)
├── Title (游戏) - LOL ID=3
├── Tournament (赛事)
├── Team (战队)
├── Player (选手)
└── Series (系列赛)

Live Data Feed (实时数据)
├── SeriesState (系列赛状态)
│   ├── teams[] (战队)
│   │   └── players[] (选手)
│   └── games[] (单局)
│       ├── teams[] (战队单局状态)
│       │   └── players[] (选手单局状态)
│       ├── draftActions[] (BP)
│       └── structures[] (建筑)
└── GameTeamStateLol / GamePlayerStateLol (LOL专属扩展字段)
```

---

## 二、本地数据结构

### 文件说明

| 文件 | 说明 | 数据来源 |
|------|------|----------|
| `data/lol/index.json` | 索引文件，包含所有联赛、选手的汇总 | 自动生成 |
| `data/lol/series.json` | 系列赛基础信息列表 | Central Data Feed |
| `data/lol/states.json` | 系列赛详细状态数据 | Live Data Feed |

### index.json 结构
```json
{
  "updatedAt": "2025-01-20T...",
  "totalSeries": 1632,
  "totalStates": 1488,
  "tournaments": {
    "756907": {
      "name": "LCK - Spring 2024",
      "count": 50,
      "seriesIds": ["2616371", ...]
    }
  },
  "players": {
    "21575": {
      "name": "Knight",
      "count": 45,
      "seriesIds": ["2616371", ...]
    }
  }
}
```

### states.json 结构
```json
{
  "2616371": {
    "id": "2616371",
    "started": true,
    "finished": true,
    "format": "best-of-3",
    "teams": [
      {
        "id": "47494",
        "name": "T1",
        "score": 2,
        "won": true,
        "kills": 31,
        "deaths": 16,
        "players": [
          {
            "id": "23596",
            "name": "Zeus",
            "kills": 4,
            "deaths": 6
          }
        ]
      }
    ],
    "games": [
      {
        "id": "game-uuid",
        "sequenceNumber": 1,
        "teams": [
          {
            "id": "47494",
            "name": "T1",
            "side": "blue",
            "won": true,
            "players": [
              {
                "id": "23596",
                "name": "Zeus",
                "character": {"id": "...", "name": "Twisted Fate"},
                "kills": 4,
                "deaths": 6,
                "netWorth": 12652,
                "damageDealt": 15000,
                "visionScore": 25.5
              }
            ]
          }
        ],
        "draftActions": [
          {"type": "ban", "drafter": {...}, "draftable": {"name": "Aatrox"}}
        ]
      }
    ]
  }
}
```

---

## 三、赛区层级结构

### 推荐的赛区划分

```javascript
const REGIONS = {
  "LCK": {
    name: "韩国",
    leagues: ["LCK"]
  },
  "LPL": {
    name: "中国大陆",
    leagues: ["LPL"]
  },
  "LEC": {
    name: "欧洲",
    leagues: ["LEC"]
  },
  "LCS": {
    name: "北美",
    leagues: ["LCS"]
  },
  "LTA": {
    name: "拉丁美洲/南美",
    leagues: ["LTA North", "LTA South", "LTA Cross-Conference"]
  },
  "LJL": {
    name: "日本",
    leagues: ["LJL"]
  },
  "PCS": {
    name: "太平洋",
    leagues: ["PCS"]
  },
  "VCS": {
    name: "越南",
    leagues: ["VCS"]
  },
  "INTERNATIONAL": {
    name: "国际赛事",
    leagues: ["Worlds", "MSI", "First Stand"]
  }
};
```

---

## 四、数据字段说明 (LOL专属)

### GameTeamStateLol (战队单局数据)

| 字段 | 类型 | 说明 | 版本要求 |
|------|------|------|----------|
| id | ID | 战队ID | - |
| name | String | 战队名称 | - |
| side | String | blue/red | - |
| won | Boolean | 是否获胜 | - |
| score | Int | 得分 | - |
| kills | Int | 击杀数 | - |
| deaths | Int | 死亡数 | - |
| netWorth | Int | 净资产 | - |
| damageDealt | Int | 总伤害 | v3.23+ |
| damageTaken | Int | 承受伤害 | v3.23+ |
| visionScore | Float | 视野得分 | v3.30+ |
| experiencePoints | Int | 总经验 | - |
| moneyDifference | Int | 经济差 | v3.28+ |
| objectives | [Objective] | 目标(龙/男爵) | - |
| structuresDestroyed | Int | 拆塔数 | - |

### GamePlayerStateLol (选手单局数据)

| 字段 | 类型 | 说明 | 版本要求 |
|------|------|------|----------|
| id | ID | 选手ID | - |
| name | String | 选手名称 | - |
| character | Character | 英雄 | - |
| kills | Int | 击杀 | - |
| deaths | Int | 死亡 | - |
| killAssistsGiven | Int | 助攻 | - |
| netWorth | Int | 经济 | - |
| alive | Boolean | 存活状态 | - |
| currentHealth | Int | 当前血量 | - |
| maxHealth | Int | 最大血量 | - |
| currentArmor | Int | 护甲 | - |
| experiencePoints | Int | 经验值 | - |
| damageDealt | Int | 伤害输出 | v3.23+ |
| damagePercentage | Float | 伤害占比 | v3.23+ |
| visionScore | Float | 视野得分 | v3.30+ |
| kdaRatio | Float | KDA | v3.27+ |
| killParticipation | Float | 参团率 | v3.35+ |

---

## 五、数据清洗规则

### 已实现的清洗规则

1. **LGD前缀移除**: `LGDBurdol` -> `Burdol`
2. **Cryin重复合并**: `"Cryin "` -> `"Cryin"` (ID合并)
3. **大小写统一**: `knight` -> `Knight`
4. **空格移除**: `"Quantum "` -> `"Quantum"`

### 清洗脚本位置
```
scripts/clean_player_data.py
```

---

## 六、前端页面结构建议

### /data 页面层级

```
/data
├── /data/regions                    # 赛区列表
├── /data/regions/[region]           # 单个赛区详情
├── /data/leagues/[league]           # 联赛详情
├── /data/teams/[teamId]             # 战队详情
├── /data/players/[playerId]         # 选手详情
├── /data/series/[seriesId]          # 系列赛详情
└── /data/games/[gameId]             # 单局详情
```

### 数据展示层级

```
赛区页面 (/data)
  ├── 显示所有赛区卡片
  └── 每个赛区显示该赛区的联赛数量、队伍数量

联赛页面 (/data/leagues/[league])
  ├── 显示联赛信息
  ├── 参赛战队列表
  └── 最近比赛列表

战队页面 (/data/teams/[teamId])
  ├── 战队基本信息
  ├── 选手阵容
  └── 历史比赛记录

选手页面 (/data/players/[playerId])
  ├── 选手基本信息
  ├── 英雄池统计
  ├── 数据统计 (KDA, 场均伤害等)
  └── 参与的比赛列表

比赛详情页面 (/data/series/[seriesId])
  ├── 比赛基本信息 (时间、联赛、对阵)
  ├── 比分和胜负
  ├── 每局游戏的BP
  ├── 每局游戏的选手数据
  └── 数据对比图表
```

---

## 七、下一步开发建议

1. **重建index.json**: 添加赛区和联赛的层级关系
2. **创建赛区映射**: 根据联赛名称自动归类到赛区
3. **增量更新机制**: 只更新最近的比赛数据
4. **数据验证**: 添加数据完整性检查
5. **缓存策略**: 前端缓存常用数据减少加载时间
