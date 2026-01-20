'use client';

import { motion } from 'framer-motion';
import { Team, ActionType, Champion, BanEntry } from '../lib/types';

interface TeamPanelProps {
  team: Team;
  bans: BanEntry[];
  picks: (Champion | null)[];
  isActive: boolean;
  currentAction: ActionType | null;
  currentIndex: number | null;
  players?: (string | null)[];
}

export default function TeamPanel({
  team,
  bans,
  picks,
  isActive,
  currentAction,
  currentIndex,
  players,
}: TeamPanelProps) {
  const teamName = team === 'blue' ? 'Blue Side' : 'Red Side';
  const isBlue = team === 'blue';

  const getBanLabel = (reason?: string) => {
    switch (reason) {
      case 'manual': return '✋';
      case 'fearless': return '🔒';
      case 'pts': return '📊';
      default: return '';
    }
  };

  const renderSlot = (
    champion: Champion | null,
    index: number,
    action: ActionType,
    isCurrentSlot: boolean,
    banReason?: string
  ) => {
    const isBan = action === 'ban';

    return (
      <motion.div
        key={`${action}-${index}`}
        className={`
          relative w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg overflow-hidden
          ${isBan
            ? 'border-2 border-rose-500/50'
            : isBlue
              ? 'border-2 border-cyan-500/50'
              : 'border-2 border-rose-500/50'}
          ${isCurrentSlot
            ? isBlue
              ? 'animate-pulse-border glow-cyan'
              : 'animate-pulse-border-red glow-rose'
            : ''}
          ${champion ? '' : 'bg-slate-800/50'}
          transition-all duration-300
        `}
        whileHover={{ scale: 1.05 }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: index * 0.05 }}
      >
        {champion ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={champion.image}
              alt={champion.name}
              className={`w-full h-full object-cover ${isBan ? 'grayscale opacity-50' : ''}`}
            />
            {isBan && (
              <>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-full h-0.5 bg-rose-500 rotate-45 absolute"></div>
                </div>
                {banReason && (
                  <div className="absolute top-0 right-0 bg-black/90 text-xs px-1 rounded-bl">
                    {getBanLabel(banReason)}
                  </div>
                )}
              </>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-black/80 text-[8px] text-center text-white truncate px-0.5">
              {champion.name}
            </div>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs font-mono">
            {index + 1}
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <motion.div
      className={`
        p-3 sm:p-4 rounded-xl backdrop-blur-sm
        ${isBlue
          ? 'bg-cyan-950/30 border border-cyan-500/30'
          : 'bg-rose-950/30 border border-rose-500/30'}
        ${isActive
          ? isBlue
            ? 'border-2 border-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.4)] ring-2 ring-cyan-400/50 animate-pulse-slow'
            : 'border-2 border-rose-400 shadow-[0_0_30px_rgba(244,63,94,0.4)] ring-2 ring-rose-400/50 animate-pulse-slow'
          : ''}
        transition-all duration-300
      `}
      initial={{ opacity: 0, x: isBlue ? -20 : 20 }}
      animate={{ opacity: 1, x: 0 }}
    >
      {/* 队伍名称 */}
      <h3 className={`text-base sm:text-lg font-bold mb-2 sm:mb-3 uppercase tracking-wider ${isBlue ? 'text-cyan-400' : 'text-rose-400'}`}>
        {teamName}
        {isActive && (
          <span className={`ml-2 text-xs sm:text-sm animate-pulse ${isBlue ? 'text-cyan-300' : 'text-rose-300'}`}>
            (Active)
          </span>
        )}
      </h3>

      {/* Ban area */}
      <div className="mb-3 sm:mb-4">
        <p className="text-[10px] sm:text-xs text-slate-500 mb-1.5 sm:mb-2 uppercase tracking-wider">
          Bans
        </p>
        <div className="flex gap-1.5 sm:gap-2 flex-wrap">
          {bans.map((banEntry, idx) =>
            renderSlot(
              banEntry.champion,
              idx,
              'ban',
              isActive && currentAction === 'ban' && currentIndex === idx,
              banEntry.reason
            )
          )}
        </div>
      </div>

      {/* Pick area */}
      <div>
        <p className="text-[10px] sm:text-xs text-slate-500 mb-1.5 sm:mb-2 uppercase tracking-wider">
          Picks
        </p>
        <div className="flex gap-1.5 sm:gap-2 flex-wrap">
          {picks.map((champ, idx) =>
            renderSlot(
              champ,
              idx,
              'pick',
              isActive && currentAction === 'pick' && currentIndex === idx
            )
          )}
        </div>
      </div>

      {/* Player Roster */}
      {players && players.some(p => p) && (
        <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-slate-700/50">
          <p className="text-[10px] sm:text-xs text-slate-500 mb-2 uppercase tracking-wider">
            Players
          </p>
          <div className="space-y-1.5">
            {['Top', 'Jungle', 'Mid', 'ADC', 'Support'].map((position, idx) => (
              <div key={position} className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 w-12 sm:w-14">{position}:</span>
                <span className={`${players[idx] ? 'text-slate-300' : 'text-slate-600'}`}>
                  {players[idx] || '-'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
