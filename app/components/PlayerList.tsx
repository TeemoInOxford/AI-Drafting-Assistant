'use client';

import { motion } from 'framer-motion';
import { Player } from '../lib/grid-types';

interface PlayerListProps {
  players: Player[];
  language: 'zh' | 'en';
}

// Role order for sorting
const ROLE_ORDER: Record<string, number> = {
  'Top': 1,
  'Jungle': 2,
  'Mid': 3,
  'Bot': 4,
  'ADC': 4,
  'Support': 5,
  'Coach': 6,
};

function getRoleOrder(roles: string[]): number {
  for (const role of roles) {
    const order = ROLE_ORDER[role];
    if (order !== undefined) return order;
  }
  return 99;
}

function getRoleColor(roles: string[]): string {
  const role = roles[0]?.toLowerCase() || '';
  if (role.includes('top')) return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
  if (role.includes('jungle')) return 'bg-green-500/20 text-green-300 border-green-500/30';
  if (role.includes('mid')) return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
  if (role.includes('bot') || role.includes('adc')) return 'bg-red-500/20 text-red-300 border-red-500/30';
  if (role.includes('support')) return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
  if (role.includes('coach')) return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
  return 'bg-white/10 text-gray-300 border-white/20';
}

export default function PlayerList({ players, language }: PlayerListProps) {
  // Sort players by role
  const sortedPlayers = [...players].sort((a, b) => {
    return getRoleOrder(a.roles) - getRoleOrder(b.roles);
  });

  if (players.length === 0) {
    return (
      <div className="py-4 text-center text-gray-500 text-sm">
        {language === 'zh' ? '暂无选手数据' : 'No player data available'}
      </div>
    );
  }

  return (
    <div className="pt-4">
      <div className="flex flex-wrap gap-2">
        {sortedPlayers.map((player, index) => (
          <motion.div
            key={player.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
            className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg border border-white/10"
          >
            {/* Player Name */}
            <span className="font-medium text-white">{player.nickname}</span>

            {/* Role Badge */}
            {player.roles.length > 0 && (
              <span
                className={`
                  text-xs px-2 py-0.5 rounded-full border
                  ${getRoleColor(player.roles)}
                `}
              >
                {player.roles[0]}
              </span>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
