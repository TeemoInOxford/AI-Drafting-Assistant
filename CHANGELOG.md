# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-02-04

### Major Release: Complete Drafting Assistant Overhaul

#### Added

- **Pick Phase Drafting Assistant**
  - Multi-dimensional PTS scoring: Meta, Comfort, Predict, Deny, Flex, Synergy, Counter
  - Real-time synergy analysis with already-picked allies
  - Counter analysis against enemy picks
  - Percentile-based candidate ranking
  - Evidence modal with detailed reasoning for each recommendation

- **Ban Phase Drafting Assistant**
  - Threat-based ban recommendations
  - Player pool analysis for opponent teams
  - Deny strategy suggestions
  - Critical/High Risk/Safe to Delay categorization

- **BP Wizard**
  - Step-by-step draft setup flow
  - Team selection with search functionality
  - Side selection (Blue/Red)
  - League configuration
  - Fearless draft mode toggle

- **New APIs**
  - `/api/synergy` - Champion synergy analysis
  - `/api/counter` - Counter matchup data
  - `/api/ban-prediction` - Ban predictions
  - `/api/pick-prediction` - Pick predictions
  - `/api/threat-signals` - Threat signal analysis
  - `/api/player-pool` - Player comfort picks
  - `/api/meta` - Meta statistics

- **GRID v2 Integration**
  - SQLite database for efficient data queries
  - Threat engine with evidence-based reasoning
  - Player pool analysis with weighted statistics

#### Changed

- **Complete UI Redesign**
  - Separate Ban Phase and Pick Phase assistant panels
  - Dynamic border colors based on current team
  - Staggered animations for champion rows
  - Improved visual hierarchy

- **Data Structure**
  - Migrated from JSON to SQLite for large datasets
  - Improved champion ID mapping
  - Better type safety throughout

#### Fixed

- Fixed `unavailableSet` undefined error in pick-candidate-engine
- Fixed pick filtering not working (wrong data type access)
- Fixed champion name/ID mapping issues

---

## [2.3.0] - 2026-01-22

### Features

#### Added
- **Flex Champion Support**
  - Added flex champion detection and role distribution display
  - Implemented probabilistic role display (e.g., "Sejuani → Jungle (65%) | Top (35%)")
  - Added purple "FLEX" badge indicator for multi-role champions
  - Extended PTSResult type with `isFlex` and `roleDistribution` fields

- **Dynamic Draft State Section**
  - Implemented real-time draft state display with actual BP data
  - Shows enemy picks, our picks, and open roles dynamically
  - Displays flex champions with role ambiguity information

- **Flex-Aware Recommendation Reasoning**
  - Ban phase flex reasoning: "Removes multi-role threat", "Reduces draft ambiguity pressure"
  - Pick phase flex reasoning: "Effective regardless of flex resolution", "Maintains role ambiguity advantage"

#### Changed
- **Drafting Assistant UI Redesign**
  - Completely redesigned PTSRiskBoard with separate Ban/Pick phase layouts
  - Ban phase: Threat Overview, Critical/High Risk/Safe to Delay sections, Recommended Ban
  - Pick phase: Draft State, Best Picks/Conditional Picks/Safe to Delay sections, Primary Recommendation
  - Added staggered slide-in animations for champion rows

- **AI Control Simplification**
  - Removed AI auto-execution functionality
  - Simplified team selection to "Your Team: Blue/Red" buttons

- **Branding Updates**
  - Updated homepage: "Launch BP Simulator" → "Launch Draft Assistant"
  - Updated BP page title: "LOL Ban/Pick Simulator" → "Stage-Aware Draft Assistant"

---

## [2.2.1] - 2026-01-21

### UI/UX Improvements

#### Changed
- **Champion Grid Layout Optimization**
  - Changed from CSS Grid to Flexbox layout for better spacing control
  - Increased champion spacing for reduced visual clutter
  - Constrained grid to 1464px max-width for alignment with BP panel

- **Position Filter Button Improvements**
  - Increased button padding for better text display
  - Fixed text overflow issues for all position labels

---

## [2.2.0] - 2026-01-21

### UI/UX Improvements

#### Changed
- **BP Panel Layout Reorganization**
  - Moved Phase Indicator to center of top control bar
  - Relocated search and position filters to between BP panel and champion grid

- **Pick Display Enhancements**
  - Increased pick loading image size from 160px to 224px
  - Added champion names at bottom of pick images

- **Team Logo Integration**
  - Added team logo display in BP panel center section
  - Implemented team logo caching from series.json data

- **Team Roster Management**
  - Added TeamRosterCompact component for streamlined roster selection
  - Popular teams now displayed immediately in dropdown

---

## [2.1.0] - 2026-01-21

### Major Design Overhaul

#### Changed
- **Homepage Redesign**
  - Updated main title from "LOL Ban/Pick Tool" to "Draft Is About Timing. Not Strength."
  - Replaced animated floating orb background with clean static grid pattern

- **Color Scheme Migration**
  - Migrated from blue/red theme to cyan/slate/rose palette
  - Improved contrast and readability across all components

#### Removed
- Animated `.bg-ambient` background effects
- Floating orb animations from globals.css

---

## [2.0.0] - 2026-01-17

### Major Update: Esports Data Explorer

#### Added

- **Esports Data Explorer Page (`/data`)**
  - Four-column hierarchical display: Region → League → Team → Player
  - Support for 7 major regions: LPL, LEC, LCK, LCS, LTA North/South/Cross-Conference
  - Interactive data browsing with click-through navigation

- **Hierarchical Data API (`/api/lol/hierarchy`)**
  - `type=summary` - Get data summary and region list
  - `type=regions` - Get all regions
  - `type=region` - Get leagues for specified region
  - `type=tournament` - Get teams for specified league
  - `type=team` - Get players for specified team

- **Data Fetching Scripts**
  - `fetch_lol_data.py` - Fetch LOL data from GRID API
  - `build_hierarchy.py` - Build hierarchical data structure

#### Data Statistics

- **18,765** LOL players
- **2,160** teams
- **173** leagues
- **7** major regions

---

## [1.0.0] - 2025-01-15

### Initial Release

#### Features

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

#### Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Framer Motion
- GRID Esports API

---

## Data Source Information

### GRID Esports API Coverage

| Year | Matches | Notes |
|------|---------|-------|
| 2020-2023 | 0 | No data available |
| 2024 | 776 | Complete data |
| 2025 | 856 | Complete data |
| 2026 | Ongoing | Live data |

**Earliest Data**: 2024-01-13 (LEC Winter 2024)

---

## Version Numbering

- **Major version**: Significant feature updates or architectural changes
- **Minor version**: New feature additions
- **Patch version**: Bug fixes and minor improvements

## License

MIT License - see [LICENSE](./LICENSE) for details
