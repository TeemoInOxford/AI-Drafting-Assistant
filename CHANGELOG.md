# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.0] - 2026-01-21

### 🎨 UI/UX Improvements

#### Changed
- **BP Panel Layout Reorganization**
  - Moved Phase Indicator to center of top control bar
  - Relocated search and position filters to between BP panel and champion grid
  - Improved visual hierarchy and information flow

- **Pick Display Enhancements**
  - Increased pick loading image size from 160px to 224px (h-56)
  - Added champion names at bottom of pick images with semi-transparent background
  - Adjusted fade-away gradient to preserve name visibility (90% cutoff)
  - Improved pick width: 120px normal, 140px when active

- **Team Logo Integration**
  - Added team logo display in BP panel center section
  - Implemented team logo caching from series.json data
  - Team logos now center-aligned with pick images (80px spacer)
  - Fallback to circular placeholder when logo unavailable

- **Team Roster Management**
  - Added TeamRosterCompact component for streamlined roster selection
  - Popular teams now displayed immediately in dropdown (top 20 by series count)
  - Auto-fill all 5 roster positions when selecting a team
  - Team logos automatically loaded and displayed

#### Added
- **Hierarchy API Enhancements**
  - Team logo caching mechanism from series.json
  - Logo URLs included in team endpoint responses
  - Search endpoint for players and teams
  - All-teams endpoint with player rosters

#### Fixed
- Player auto-fill issue (API field mapping: nickname → name)
- Team logo null values (now loaded from series.json)
- Fade-away gradient blocking champion names
- Team element positioning and z-index conflicts

#### Technical
- Optimized component layout using flex flow with spacer divs
- Improved API response caching (1-minute cache duration)
- Enhanced type definitions for TeamRoster interface

---

## [2.1.0] - 2026-01-21

### 🎨 Major Design Overhaul

#### Changed
- **Homepage Redesign**
  - Updated main title from "LOL Ban/Pick Tool" to "Draft Is About Timing. Not Strength."
  - Replaced animated floating orb background with clean static grid pattern
  - Simplified hero section with professional esports aesthetic
  - Improved visual hierarchy with cleaner typography

- **Website Branding**
  - Changed website title to "LOL AI Drafting Assistant - A Stage-Aware Draft Strategist"
  - Updated metadata description to emphasize decision-support focus

- **Color Scheme Migration**
  - Migrated from blue/red theme to cyan/slate/rose palette
  - Blue team now uses cyan accent colors
  - Red team now uses rose accent colors
  - Improved contrast and readability across all components

- **Component Styling Updates**
  - Updated TeamPanel with new color scheme and glow effects
  - Enhanced ChampionCard with improved hover states
  - Refined ControlBar button styling
  - Improved PhaseIndicator with better visual feedback
  - Updated PositionFilter with cleaner button design

#### Removed
- Animated `.bg-ambient` background effects
- Floating orb animations from globals.css
- Noise texture overlay from homepage
- Excessive glow effects and decorative elements

#### Technical
- Optimized CSS by removing unused animation keyframes
- Improved component performance by simplifying background effects
- Enhanced accessibility with better color contrast ratios

---

## [2.0.0] - 2026-01-17

### 🎉 Major Update: Esports Data Explorer

#### ✨ Added

- **Esports Data Explorer Page (`/data`)**
  - Four-column hierarchical display: Region → League → Team → Player
  - Support for 7 major regions: LPL, LEC, LCK, LCS, LTA North/South/Cross-Conference
  - Interactive data browsing with click-through navigation
  - Breadcrumb navigation showing current browsing path
  - Bilingual support (Chinese/English)

- **Hierarchical Data API (`/api/lol/hierarchy`)**
  - `type=summary` - Get data summary and region list
  - `type=regions` - Get all regions
  - `type=region` - Get leagues for specified region
  - `type=tournament` - Get teams for specified league
  - `type=team` - Get players for specified team
  - `type=all-teams` - Get all teams with player rosters

- **Data Fetching Scripts**
  - `fetch_lol_data.py` - Fetch LOL data from GRID API
    - Rate limiting handling with automatic retry
    - Paginated fetching of all players, teams, and leagues
    - Automatic intermediate result saving to prevent data loss
  - `build_hierarchy.py` - Build hierarchical data structure
    - Automatic region extraction from league names
    - Complete relationship chain: Player→Team→League→Region
    - Generate data summary and statistics

#### 📊 Data Statistics

- **18,765** LOL players
- **2,160** teams
- **173** leagues
- **7** major regions
- Data coverage: January 2024 to present

#### 🔧 Technical Improvements

- Optimized memory usage for large dataset processing
- Implemented data caching mechanism for faster loading
- Added error handling and retry logic
- Improved API response structure to reduce data transfer

#### 📝 Documentation

- Comprehensive README.md
- Detailed API documentation
- Data script usage instructions

#### 🎨 UI/UX Improvements

- Responsive four-column layout adapting to various screen sizes
- Smooth loading animations and transitions
- Clear visual hierarchy with different colors for each data level
- Optimized scrolling experience

---

## [1.0.0] - 2025-01-15

### 🎉 Initial Release

#### ✨ Features

- **BP (Ban/Pick) Assistant Tool**
  - Real-time Ban/Pick simulation
  - AI-powered recommendations based on team historical data
  - Support for all major regions
  - Real-time team roster data

- **Pick Threat Score (PTS) System**
  - Quantifies the cost of inaction
  - Stage-aware champion evaluation
  - Factors in draft phase, side assignment, and opponent trajectory

- **Core Innovations**
  - Stage Awareness: Draft phase as a narrowing corridor
  - Multi-Path Analysis: Trade-off structures instead of optimal solutions
  - Coach-Centric Design: No auto-selections, full transparency

#### 🛠 Tech Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- Framer Motion
- GRID Esports API

#### 🌐 Deployment

- Production environment: https://lol.dreamofdragon.org
- PM2 process management
- Nginx reverse proxy

---

## Data Source Information

### GRID Esports API Coverage

Based on query confirmation, GRID Open Access API LOL data coverage:

| Year | Matches | Notes |
|------|---------|-------|
| 2020-2023 | 0 | No data available |
| 2024 | 776 | Complete data |
| 2025 | 856 | Complete data |

**Earliest Data**: 2024-01-13 (LEC Winter 2024)

For earlier historical data, you may need:
- GRID Full Access permissions
- Alternative data sources (Leaguepedia, Oracle's Elixir, etc.)

---

## Version Numbering

- **Major version**: Significant feature updates or architectural changes
- **Minor version**: New feature additions
- **Patch version**: Bug fixes and minor improvements

## Contributing

Issues and Pull Requests are welcome!

## License

MIT License - see [LICENSE](./LICENSE) for details
