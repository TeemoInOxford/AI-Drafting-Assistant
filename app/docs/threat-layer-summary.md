# Threat Signal Layer - Quick Reference

## Overview

The Threat Signal Layer analyzes ban patterns to identify "denial-based relevance" - when opponents consistently ban a champion against a team/player, it signals threat. This is separate from proficiency (pick-based).

## Key Concepts

### Threat Score Formula

```
obs = bans against team / games team played
exp = baseline banRate (meta average)
R = (obs + s) / (exp + s), where s = 0.005 (smoothing factor)
N0 = median games played (P50)
confidence = clamp(0, 1, gamesPlayed / N0)
score = clamp(0, 100, 100 * confidence * max(0, R - 1))
```

### Threat Levels

- **High** (top 20%): Red badge - opponents frequently deny this champion
- **Moderate** (top 40%): Orange badge - above-average denial signal
- **Low** (bottom 60%): No badge displayed

## Data Pipeline

### Build Commands

```bash
# Build all threat layer data
npm run build:threat-layer

# Or run individually:
npm run build:ban-events      # Extract ban events from states.json
npm run build:ban-baselines   # Compute meta ban rates
npm run build:threat          # Compute threat scores
```

### Output Files

| File | Description |
|------|-------------|
| `data/lol/ban-events.json` | Flat array of all ban events |
| `data/lol/ban-baselines.json` | Meta ban rates per context |
| `data/lol/threat-signals.json` | Team & player threat scores |

## API Endpoints

### POST `/api/threat-signals`

Query threat signals for specific champions.

**Request Body:**
```typescript
{
  queryType: 'team' | 'player' | 'topTeam' | 'topPlayer',
  targetTeamId?: string,
  playerId?: string,
  championId?: string,
  patch?: string,
  region?: string,
  topK?: number
}
```

### GET `/api/threat-signals`

Batch queries and metadata.

**Query Parameters:**
- `action`: `meta` | `batch` | `allTeam` | `combined`
- `targetTeamId`: Team ID
- `championIds`: Comma-separated champion names
- `playerIds`: Comma-separated player IDs
- `patch`: Patch version (e.g., "15.1")
- `region`: Region code (e.g., "LCK")

## UI Components

### ThreatBadge

Small badge showing ban pressure score.

```tsx
<ThreatBadge
  score={75}
  level="high"
  onClick={() => handleClick()}
  compact={true}
/>
```

### ThreatEvidence

Modal showing detailed threat evidence.

```tsx
<ThreatEvidence
  isOpen={true}
  onClose={() => setOpen(false)}
  championName="Azir"
  teamThreat={signal}
  playerThreats={playerSignals}
/>
```

### ThreatDebugPanel

Dev-only panel for debugging threat data.

```tsx
<ThreatDebugPanel
  isOpen={debugOpen}
  onClose={() => setDebugOpen(false)}
  targetTeamId="47558"
  patch="15.1"
  region="LCK"
/>
```

## Context Fallback

The system uses a fallback chain for context-specific queries:

1. Specific context: `{patch}::{region}` (e.g., "15.1::LCK")
2. Fallback: `GLOBAL::GLOBAL`

## Integration Points

### PTSRiskBoard

The threat badges are integrated into the PTSRiskBoard component:

1. Fetches all team threats when opponent team is selected
2. Displays ThreatBadge on champion rows (high/moderate only)
3. Opens ThreatEvidence modal on badge click

### bp/page.tsx

- Passes opponent team info to PTSRiskBoard
- Includes ThreatDebugPanel (dev-only toggle)

## Key Constraints

- **Bans ≠ Proficiency**: This layer only analyzes bans, not picks
- **Deterministic**: No randomness in calculations
- **Small Sample Safety**: Confidence gating via N0 (median games)
- **Fallback**: Always falls back to GLOBAL when context missing

## UI Copy

When displaying threat information, use:
> "Opponent Ban Pressure (historical denial signal)"

This clarifies that the signal is based on historical ban patterns, not predictions.
