# LOL Ban/Pick Tool (AI Drafting Assistant)

A League of Legends Ban/Pick simulation tool following official tournament rules.

## Features

- **Tournament BP Rules**: Full 20-step Ban/Pick sequence following official competitive rules
- **Bilingual Support**: Chinese and English interface
- **Position Filter**: Filter champions by lane (Top, Jungle, Mid, Bot, Support)
- **Search**: Search champions by name (Chinese/English)
- **Undo/Reset**: Undo last action or reset entire draft
- **Real-time Data**: Champion data from Riot's DDragon API

## BP Sequence (20 Steps)

### Ban Phase 1 (Steps 0-5)
Blue Ban → Red Ban → Blue Ban → Red Ban → Blue Ban → Red Ban

### Pick Phase 1 (Steps 6-11)
Blue Pick → Red Pick → Red Pick → Blue Pick → Blue Pick → Red Pick

### Ban Phase 2 (Steps 12-15)
Red Ban → Blue Ban → Red Ban → Blue Ban

### Pick Phase 2 (Steps 16-19)
Red Pick → Blue Pick → Blue Pick → Red Pick

## Tech Stack

- Next.js 16 + React 19
- TypeScript
- Tailwind CSS 4
- Framer Motion
- DDragon API (Champion data)
- CommunityDragon (Position icons)

## Project Structure

```
├── page.tsx              # Main page component
├── layout.tsx            # Layout with metadata
├── components/
│   ├── BPPanel.tsx       # Ban/Pick panel
│   ├── ChampionCard.tsx  # Champion card component
│   ├── ChampionGrid.tsx  # Champion grid display
│   ├── ControlBar.tsx    # Control buttons and search
│   ├── LanguageToggle.tsx# Language switcher
│   ├── PhaseIndicator.tsx# Current phase display
│   ├── PositionFilter.tsx# Lane position filter
│   └── TeamPanel.tsx     # Team panel (bans/picks)
└── lib/
    ├── types.ts          # TypeScript type definitions
    ├── bp-logic.ts       # BP sequence and state logic
    ├── champion-api.ts   # DDragon API wrapper
    └── positions.ts      # Champion position data
```

## Setup

This is a Next.js App Router page. To use it in your project:

1. Copy the entire folder to your Next.js project's `app/` directory
2. Add DDragon image domain to `next.config.ts`:

```typescript
images: {
  remotePatterns: [
    {
      protocol: 'https',
      hostname: 'ddragon.leagueoflegends.com',
      pathname: '/cdn/**',
    },
    {
      protocol: 'https',
      hostname: 'raw.communitydragon.org',
      pathname: '/**',
    },
  ],
},
```

3. Install dependencies if not already installed:
```bash
npm install framer-motion
```

4. Access at `/lol` route

## Live Demo

https://lol.dreamofdragon.org

## License

MIT

## Credits

- Champion data: [Riot Games DDragon](https://developer.riotgames.com/docs/lol#data-dragon)
- Position icons: [CommunityDragon](https://communitydragon.org/)
