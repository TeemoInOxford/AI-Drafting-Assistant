# LOL AI Drafting Assistant

一个基于 AI 的英雄联盟 BP（Ban/Pick）辅助工具，提供实时战队阵容数据和智能推荐。

## 功能特性

### 1. BP 辅助工具
- 实时 Ban/Pick 模拟
- AI 智能推荐（基于战队历史数据）
- 支持所有主流赛区（LPL, LCK, LEC, LCS 等）
- 实时战队阵容数据

### 2. 电竞数据浏览 (`/data`)
- **层级数据展示**：赛区 → 联赛 → 战队 → 选手
- **7 大赛区**：
  - LPL (中国) - 54 联赛, 17 战队, 222 选手
  - LEC (欧洲) - 34 联赛, 11 战队, 97 选手
  - LCK (韩国) - 33 联赛, 10 战队, 128 选手
  - LCS (北美) - 10 联赛, 8 战队, 47 选手
  - LTA North/South/Cross-Conference (美洲)
- **数据统计**：
  - 总选手数：18,765
  - 总战队数：2,160
  - 总联赛数：173
- **交互式浏览**：点击赛区查看联赛，点击联赛查看战队，点击战队查看选手阵容

### 3. 数据来源
- **GRID Esports API** - 官方电竞数据平台
- 数据覆盖：2024 年至今
- 自动同步更新

## 技术栈

- **框架**: Next.js 16 (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS
- **动画**: Framer Motion
- **数据**: GRID Static Data API
- **部署**: PM2 + Nginx

## 项目结构

```
AI-Drafting-Assistant/
├── app/
│   ├── api/
│   │   └── lol/
│   │       ├── data/          # 原有战队阵容 API
│   │       ├── hierarchy/     # 新增层级数据 API
│   │       └── recommend/     # AI 推荐 API
│   ├── components/            # React 组件
│   ├── data/                  # 数据浏览页面
│   ├── lib/                   # 工具库
│   │   ├── grid-api.ts       # GRID API 客户端
│   │   ├── grid-types.ts     # 类型定义
│   │   └── lol-db.ts         # 本地数据库
│   └── page.tsx              # BP 工具主页
├── scripts/
│   └── grid-data-fetcher/    # 数据获取脚本
│       ├── fetch_lol_data.py # 获取 LOL 数据
│       ├── build_hierarchy.py # 构建层级结构
│       └── data/             # 数据文件
└── public/                   # 静态资源
```

## 数据脚本

### 获取 LOL 数据
```bash
cd scripts/grid-data-fetcher
python3 fetch_lol_data.py
```

获取的数据：
- `lol_players.json` - 所有 LOL 选手
- `lol_teams.json` - 所有 LOL 战队
- `lol_tournaments.json` - 所有 LOL 联赛
- `lol_player_relationships.json` - 选手-战队-联赛关系

### 构建层级数据
```bash
python3 build_hierarchy.py
```

生成的数据：
- `lol_hierarchy.json` - 赛区→联赛→战队→选手层级结构
- `lol_all_teams.json` - 所有战队及选手列表
- `lol_hierarchy_summary.json` - 数据摘要

## API 接口

### 层级数据 API (`/api/lol/hierarchy`)

#### 获取摘要
```
GET /api/lol/hierarchy?type=summary
```

#### 获取赛区列表
```
GET /api/lol/hierarchy?type=regions
```

#### 获取赛区的联赛
```
GET /api/lol/hierarchy?type=region&region=LPL
```

#### 获取联赛的战队
```
GET /api/lol/hierarchy?type=tournament&tournament=758054
```

#### 获取战队的选手
```
GET /api/lol/hierarchy?type=team&team=3586
```

#### 获取所有有选手的战队
```
GET /api/lol/hierarchy?type=all-teams
```

## 本地开发

### 安装依赖
```bash
npm install
```

### 配置环境变量
创建 `.env.local` 文件：
```env
GRID_API_URL=https://api-op.grid.gg/central-data/graphql
GRID_API_KEY=your_api_key_here
```

### 运行开发服务器
```bash
npm run dev
```

访问 http://localhost:3000

### 构建生产版本
```bash
npm run build
npm start
```

## 部署

使用 PM2 管理进程：
```bash
pm2 start npm --name "lol-drafting" -- start -- -p 3003
pm2 save
```

## 数据更新

数据来自 GRID Esports API，覆盖 2024 年至今的 LOL 电竞数据。

更新数据：
```bash
cd scripts/grid-data-fetcher
python3 fetch_lol_data.py
python3 build_hierarchy.py
```

## 访问地址

- **生产环境**: https://lol.dreamofdragon.org
- **数据浏览**: https://lol.dreamofdragon.org/data

## 许可证

MIT License

## 更新日志

查看 [CHANGELOG.md](./CHANGELOG.md) 了解详细更新历史。
