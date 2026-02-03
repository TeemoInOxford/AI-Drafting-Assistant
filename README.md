# LOL AI Drafting Assistant

**A Stage-Aware Draft Strategist**

> "Draft Is About Timing. Not Strength."

A decision-support system for professional League of Legends drafting. Built for coaches who understand that drafts are won in the margins—and lost in the moments you didn't see coming.

## What This Is

A stage-aware drafting assistant that makes timing, trade-offs, and draft consequences explicit. It surfaces what you're gaining, what you're giving up, and what windows are closing.

## What This Is Not

Not an auto-draft bot. Not a winrate optimizer. Not a replacement for strategic judgment. The final call always belongs to the coaching staff. This tool ensures that call is fully informed.

## Core Features

### 1. Stage-Aware Draft Assistant (`/bp`)
- Interactive draft sandbox with real-time analysis
- **BP Wizard**: Step-by-step draft setup with team selection, side selection, and league configuration
- **Ban Phase Assistant**: Threat-based ban recommendations with PTS scoring
- **Pick Phase Assistant**: Context-aware pick suggestions with synergy/counter analysis
- **Flex Champion Support**: Displays role distributions for multi-role champions
- Support for all major leagues (LPL, LCK, LEC, LCS, etc.)
- Fearless draft mode support
- Series state management

### 2. Pick Threat Score (PTS) System
Traditional tools ask: "What happens if we pick this?"
**PTS asks: "What happens if we don't act now?"**

PTS quantifies the cost of inaction. It measures what you lose by waiting—factoring in draft stage, side assignment, opponent trajectory, and denial risk.

**Features**:
- Multi-dimensional scoring: Meta, Comfort, Predict, Deny, Flex, Synergy, Counter
- Percentile-based ranking within candidate pool
- Real-time recalculation as draft progresses

### 3. Ban Phase Drafting Assistant
- **Threat Overview**: Critical/High Risk/Safe to Delay sections
- **Player Pool Analysis**: Team-specific comfort picks and signature champions
- **Deny Strategy**: Opponent threat signals for strategic denial
- **Evidence-Based Reasoning**: Full transparency on why each ban is recommended

### 4. Pick Phase Drafting Assistant
- **Candidate Generation**: Meta picks, comfort picks, predictions, deny picks
- **Synergy Analysis**: Real-time synergy calculation with already-picked allies
- **Counter Analysis**: Win rate data against enemy picks
- **PTS Scoring**: Weighted aggregation across all dimensions

### 5. Esports Data Explorer (`/data`)
- **Hierarchical Data Display**: Region → League → Team → Player
- **7 Major Regions**: LPL, LEC, LCK, LCS, LTA North/South/Cross-Conference
- **Data Statistics**: 18,765+ players, 2,160+ teams, 173+ leagues
- **Interactive Browsing**: Click through regions, leagues, teams, and player rosters

### 6. Meta Analysis (`/meta`)
- Global champion presence and pick rates
- League-specific meta filtering
- Patch-aware statistics

### 7. Player Pool Analysis (`/player-pool`)
- Team-specific player comfort picks
- Weighted game statistics
- Role-based filtering

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Animations**: Framer Motion
- **Database**: SQLite (better-sqlite3) for GRID v2 data
- **Data Source**: GRID Esports API
- **Deployment**: PM2 + Nginx

## Project Structure

```
AI-Drafting-Assistant/
├── app/
│   ├── api/                    # API routes
│   │   ├── ban-prediction/     # Ban prediction API
│   │   ├── counter/            # Counter matchup API
│   │   ├── meta/               # Meta statistics API
│   │   ├── pick-prediction/    # Pick prediction API
│   │   ├── player-pool/        # Player pool API
│   │   ├── synergy/            # Synergy analysis API
│   │   ├── threat-signals/     # Threat signals API
│   │   └── lol/                # Core LOL data APIs
│   ├── components/             # React components
│   │   ├── BanPhaseDraftingAssistant.tsx
│   │   ├── PickPhaseDraftingAssistant.tsx
│   │   ├── BPWizard.tsx
│   │   ├── BPPanel.tsx
│   │   └── ...
│   ├── lib/                    # Utility libraries
│   │   ├── ban-candidate-engine.ts
│   │   ├── pick-candidate-engine.ts
│   │   ├── grid-v2-threat-engine.ts
│   │   └── ...
│   ├── bp/                     # BP simulator page
│   ├── data/                   # Data explorer page
│   ├── meta/                   # Meta analysis page
│   └── player-pool/            # Player pool page
├── data/
│   ├── lol/                    # LOL JSON data files
│   └── grid_v2/                # GRID v2 SQLite database
├── scripts/                    # Data processing scripts
└── docs/                       # Documentation
```

## Local Development

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

## Deployment

Using PM2 for process management:
```bash
pm2 start npm --name "lol-drafting" -- start -- -p 3003
pm2 save
```

## API Endpoints

### Core APIs
- `/api/meta` - Meta statistics by league
- `/api/player-pool` - Player comfort picks
- `/api/threat-signals` - Threat analysis
- `/api/ban-prediction` - Ban predictions
- `/api/pick-prediction` - Pick predictions
- `/api/synergy` - Synergy analysis
- `/api/counter` - Counter matchup data

### Data APIs
- `/api/lol/hierarchy` - Hierarchical data (Region/League/Team/Player)
- `/api/lol/series` - Series state management
- `/api/lol/data` - Team roster data

## Live Site

- **Production**: https://lol.dreamofdragon.org
- **Draft Assistant**: https://lol.dreamofdragon.org/bp
- **Data Explorer**: https://lol.dreamofdragon.org/data
- **Meta Analysis**: https://lol.dreamofdragon.org/meta

## License

MIT License

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for detailed update history.

## Contributing

Issues and Pull Requests are welcome!

---

**Decision support for professional League of Legends coaching staff.**

*"Drafts aren't won by picking the strongest champions. They're lost by missing the moment a door closed."*
