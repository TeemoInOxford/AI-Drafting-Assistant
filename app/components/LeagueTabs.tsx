'use client';

import { motion } from 'framer-motion';
import { League } from '../lib/grid-types';

interface LeagueTabsProps {
  leagues: League[];
  selectedLeagueId: string | null;
  onSelect: (leagueId: string) => void;
  language: 'zh' | 'en';
}

export default function LeagueTabs({
  leagues,
  selectedLeagueId,
  onSelect,
  language,
}: LeagueTabsProps) {
  return (
    <div className="w-full overflow-x-auto pb-2">
      <div className="flex gap-2 min-w-max px-4">
        {leagues.map((league) => {
          const isSelected = selectedLeagueId === league.id;
          return (
            <motion.button
              key={league.id}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSelect(league.id)}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                ${isSelected
                  ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg shadow-blue-500/30'
                  : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white border border-white/10'
                }
              `}
            >
              {league.name}
              <span className="ml-2 text-xs opacity-70">
                ({league.teams.length})
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
