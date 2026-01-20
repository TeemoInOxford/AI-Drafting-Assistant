# LOL AI Drafting Assistant

**A Stage-Aware Draft Strategist**

> "Draft Is About Timing. Not Strength."

A decision-support system for professional League of Legends drafting. Built for coaches who understand that drafts are won in the margins—and lost in the moments you didn't see coming.

## 🎯 What This Is

A stage-aware drafting assistant that makes timing, trade-offs, and draft consequences explicit. It surfaces what you're gaining, what you're giving up, and what windows are closing.

## 🚫 What This Is Not

Not an auto-draft bot. Not a winrate optimizer. Not a replacement for strategic judgment. The final call always belongs to the coaching staff. This tool ensures that call is fully informed.

## ✨ Core Features

### 1. BP Simulator (`/bp`)
- Interactive draft sandbox with real-time analysis
- Stage-aware champion recommendations
- Pick Threat Score (PTS) system
- Support for all major regions (LPL, LCK, LEC, LCS, etc.)
- Fearless draft mode support
- Series state management
- Team roster configuration

### 2. Pick Threat Score (PTS)
Traditional tools ask: "What happens if we pick this?"
**PTS asks: "What happens if we don't act now?"**

PTS quantifies the cost of inaction. It measures what you lose by waiting—factoring in draft stage, side assignment, opponent trajectory, and denial risk. PTS reveals the difference between a safe delay and a critical window.

### 3. Esports Data Explorer (`/data`)
- **Hierarchical Data Display**: Region → League → Team → Player
- **7 Major Regions**:
  - LPL (China) - 54 leagues, 17 teams, 222 players
  - LEC (Europe) - 34 leagues, 11 teams, 97 players
  - LCK (Korea) - 33 leagues, 10 teams, 128 players
  - LCS (North America) - 10 leagues, 8 teams, 47 players
  - LTA North/South/Cross-Conference (Americas)
- **Data Statistics**:
  - Total Players: 18,765
  - Total Teams: 2,160
  - Total Leagues: 173
- **Interactive Browsing**: Click through regions, leagues, teams, and player rosters

### 4. System Architecture (`/ERD`)
Technical documentation for analysts and developers. Full transparency on data structure and methodology.

## 🛠 Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Animations**: Framer Motion
- **Data Source**: GRID Esports API
- **Deployment**: PM2 + Nginx

## 📁 Project Structure

```
AI-Drafting-Assistant/
├── app/
│   ├── api/
│   │   └── lol/
│   │       ├── data/          # Team roster API
│   │       ├── hierarchy/     # Hierarchical data API
│   │       ├── recommend/     # AI recommendation API
│   │       └── series/        # Series state API
│   ├── components/            # React components
│   ├── bp/                    # BP simulator page
│   ├── data/                  # Data explorer page
│   ├── ERD/                   # System architecture page
│   ├── lib/                   # Utility libraries
│   │   ├── grid-api.ts       # GRID API client
│   │   ├── grid-types.ts     # Type definitions
│   │   ├── bp-logic.ts       # BP logic engine
│   │   └── lol-db.ts         # Local database
│   └── page.tsx              # Homepage
├── data/
│   └── lol/                  # LOL data files
│       ├── hierarchy.json    # Hierarchical structure
│       ├── index.json        # Team rosters
│       └── series.json       # Series data
├── scripts/
│   └── grid-data-fetcher/    # Data fetching scripts
│       ├── fetch_lol_data.py
│       ├── build_hierarchy.py
│       └── data/
└── docs/                     # Documentation
```

## 🔧 Data Scripts

### Fetch LOL Data
```bash
cd scripts/grid-data-fetcher
python3 fetch_lol_data.py
```

Fetched data:
- `lol_players.json` - All LOL players
- `lol_teams.json` - All LOL teams
- `lol_tournaments.json` - All LOL leagues
- `lol_player_relationships.json` - Player-team-league relationships

### Build Hierarchical Data
```bash
python3 build_hierarchy.py
```

Generated data:
- `lol_hierarchy.json` - Region→League→Team→Player hierarchy
- `lol_all_teams.json` - All teams with player rosters
- `lol_hierarchy_summary.json` - Data summary

## 🌐 API Endpoints

### Hierarchy API (`/api/lol/hierarchy`)

#### Get Summary
```
GET /api/lol/hierarchy?type=summary
```

#### Get Regions
```
GET /api/lol/hierarchy?type=regions
```

#### Get Region's Leagues
```
GET /api/lol/hierarchy?type=region&region=LPL
```

#### Get League's Teams
```
GET /api/lol/hierarchy?type=tournament&tournament=758054
```

#### Get Team's Players
```
GET /api/lol/hierarchy?type=team&team=3586
```

#### Get All Teams with Players
```
GET /api/lol/hierarchy?type=all-teams
```

## 💻 Local Development

### Install Dependencies
```bash
npm install
```

### Configure Environment Variables
Create `.env.local` file:
```env
GRID_API_URL=https://api-op.grid.gg/central-data/graphql
GRID_API_KEY=your_api_key_here
```

### Run Development Server
```bash
npm run dev
```

Visit http://localhost:3000

### Build Production Version
```bash
npm run build
npm start
```

## 🚀 Deployment

Using PM2 for process management:
```bash
pm2 start npm --name "lol-drafting" -- start -- -p 3003
pm2 save
```

## 📊 Data Updates

Data is sourced from GRID Esports API, covering LOL esports data from 2024 to present.

Update data:
```bash
cd scripts/grid-data-fetcher
python3 fetch_lol_data.py
python3 build_hierarchy.py
```

## 🌍 Live Site

- **Production**: https://lol.dreamofdragon.org
- **BP Simulator**: https://lol.dreamofdragon.org/bp
- **Data Explorer**: https://lol.dreamofdragon.org/data
- **Architecture**: https://lol.dreamofdragon.org/ERD

## 📄 License

MIT License

## 📝 Changelog

See [CHANGELOG.md](./CHANGELOG.md) for detailed update history.

## 🤝 Contributing

Issues and Pull Requests are welcome!

---

**Decision support for professional League of Legends coaching staff.**

*"Drafts aren't won by picking the strongest champions. They're lost by missing the moment a door closed."*
