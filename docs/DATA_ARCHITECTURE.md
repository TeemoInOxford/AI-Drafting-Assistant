# Data Architecture

## 数据来源

### GRID API
```
Central Data (静态)
├── Tournament → League
├── Team → Roster
└── Player → Profile

Live Data (实时)
└── SeriesState
    └── games[]
        ├── draftActions[] (BP序列)
        └── teams[].players[] (单局数据)
```

**API端点**: `https://api-op.grid.gg/central-data/graphql`

## 本地数据文件

| 文件 | 内容 | 大小 |
|------|------|------|
| `data/lol/hierarchy.json` | 赛区→联赛→战队→选手 | ~2MB |
| `data/lol/series.json` | 系列赛列表 | ~500KB |
| `data/lol/states.json` | 系列赛详细状态 | ~10MB |

### hierarchy.json 结构
```typescript
{
  regions: {
    [regionId]: {
      name: string,
      leagues: string[],  // league IDs
      teams: string[],    // team IDs
      players: string[]   // player IDs
    }
  },
  leagues: { [id]: { name, teams[] } },
  teams: { [id]: { name, players[] } },
  players: { [id]: { name, team } }
}
```

## 核心数据模型

### DraftAction (BP动作)
```typescript
{
  type: 'ban' | 'pick',
  sequenceNumber: string,  // "0"-"19"
  drafter: { id: string, type: 'team' },
  draftable: { id: string, type: 'character', name: string }
}
```

### GameTeamStateLol (战队单局)
| 字段 | 类型 | 版本要求 | 说明 |
|------|------|----------|------|
| kills | Int | - | 击杀数 |
| deaths | Int | - | 死亡数 |
| netWorth | Int | - | 净资产 |
| damageDealt | Int | v3.23+ | 总伤害 |
| visionScore | Float | v3.30+ | 视野得分 |

### GamePlayerStateLol (选手单局)
| 字段 | 类型 | 版本要求 | 说明 |
|------|------|----------|------|
| character | Character | - | 使用英雄 |
| kills/deaths | Int | - | KDA |
| netWorth | Int | - | 经济 |
| damageDealt | Int | v3.23+ | 伤害输出 |
| kdaRatio | Float | v3.27+ | KDA比率 |
| killParticipation | Float | v3.35+ | 参团率 |

## 数据清洗规则

### 1. 重复账号移除
**规则**: 移除数字后缀账号 (如 `Barracks01`, `Barracks02`)
```python
pattern = r'^(.+?)(\d{1,2})$'
if match and base_name in seen:
    remove_player()
```

### 2. 测试账号过滤
**特征**: 包含 `test`, `OBS`, `Observer`, `Staff`, `centraldev`
**处理**: 自动移除

### 3. 关联完整性
**规则**:
- 只保留有战队的选手
- 只保留有选手的战队
- 只保留有战队的联赛

### 清洗效果
```
选手: 18,804 → 5,804 (-69%)
战队: 2,165 → 56 (-97%)
联赛: 173 → 93 (-46%)
```

**脚本位置**: `scripts/grid-data-fetcher/rebuild_clean_hierarchy.py`

## 赛区划分

```typescript
const REGIONS = {
  LPL: { name: '中国', leagues: ['LPL'] },
  LCK: { name: '韩国', leagues: ['LCK'] },
  LEC: { name: '欧洲', leagues: ['LEC'] },
  LCS: { name: '北美', leagues: ['LCS'] },
  LTA: { name: '拉美', leagues: ['LTA North', 'LTA South'] },
  INTERNATIONAL: { name: '国际', leagues: ['Worlds', 'MSI'] }
};
```

## 数据约束

### 版本兼容性
- **v3.23+**: damageDealt, damageTaken
- **v3.27+**: kdaRatio
- **v3.30+**: visionScore
- **v3.35+**: killParticipation

**处理**: 旧版本数据缺失字段时使用默认值或跳过

### 数据完整性校验
```typescript
function validateSeriesState(state: SeriesState): boolean {
  return (
    state.games.every(g => g.draftActions.length === 20) &&
    state.teams.length === 2 &&
    state.teams.every(t => t.players.length === 5)
  );
}
```

## GraphQL查询示例

### 获取系列赛BP数据
```graphql
query GetSeriesState($seriesId: ID!) {
  seriesState(id: $seriesId) {
    games {
      draftActions {
        type
        sequenceNumber
        drafter { id }
        draftable { id name }
      }
      teams {
        side
        won
        players {
          name
          character { name }
          ... on GamePlayerStateLol {
            kills
            deaths
            kdaRatio
          }
        }
      }
    }
  }
}
```

## 数据更新流程

```bash
# 1. 获取原始数据
cd scripts/grid-data-fetcher
python3 fetch_lol_data.py

# 2. 清洗数据
python3 rebuild_clean_hierarchy.py

# 3. 转换为API格式
python3 convert_clean_to_api.py

# 4. 更新项目数据
cp data/lol_hierarchy_clean_api.json ../../data/lol/hierarchy.json
```

## 工程价值

本文档定义数据模型、清洗规则和唯一事实源，确保数据一致性。任何数据相关问题应首先参考此文档。
