'use client';

import { motion } from 'framer-motion';
import { Champion, HistorySelectMode } from '../lib/types';

interface ChampionCardProps {
  champion: Champion;
  isUsed: boolean;
  isFearlessBanned?: boolean;
  onClick: () => void;
  disabled: boolean;
  index: number;
  historySelectMode?: HistorySelectMode;
  shouldShake?: boolean;
}

export default function ChampionCard({
  champion,
  isUsed,
  isFearlessBanned = false,
  onClick,
  disabled,
  index,
  historySelectMode = 'off',
  shouldShake = false,
}: ChampionCardProps) {
  const isInHistoryMode = historySelectMode !== 'off';

  const getBorderClass = () => {
    if (isUsed) return 'border-slate-700';
    if (isFearlessBanned) return 'border-rose-700';
    if (isInHistoryMode) {
      return historySelectMode === 'blue'
        ? 'border-cyan-400 hover:border-cyan-300 hover:shadow-[0_8px_24px_rgba(34,211,238,0.3)]'
        : 'border-rose-400 hover:border-rose-300 hover:shadow-[0_8px_24px_rgba(244,63,94,0.3)]';
    }
    return 'border-slate-700 hover:border-cyan-400 hover:shadow-[0_8px_24px_rgba(34,211,238,0.3)]';
  };

  return (
    <motion.div
      key={champion.id}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{
        opacity: 1,
        scale: 1,
        x: shouldShake ? [0, -10, 10, -10, 10, 0] : 0
      }}
      transition={{
        delay: Math.min(index * 0.01, 0.5),
        x: { duration: 0.5 }
      }}
      whileHover={!disabled ? { scale: 1.05, y: -4, zIndex: 30 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
      onClick={!disabled ? onClick : undefined}
      className={`
        relative flex flex-col items-center cursor-pointer transition-all duration-200
        ${disabled ? 'cursor-not-allowed' : ''}
        ${isUsed || isFearlessBanned ? 'opacity-30 grayscale pointer-events-none' : ''}
      `}
    >
      <div className={`
        relative w-11 h-11 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg overflow-hidden border-2 transition-all duration-200 bg-slate-900
        ${getBorderClass()}
      `}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={champion.image}
          alt={champion.name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {isUsed && (
          <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center">
            <span className="text-rose-400 text-lg">✕</span>
          </div>
        )}
        {isFearlessBanned && !isUsed && (
          <div className="absolute inset-0 bg-rose-950/70 flex items-center justify-center">
            <span className="text-rose-300 text-sm">🚫</span>
          </div>
        )}
      </div>

      <span className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5 sm:mt-1 text-center leading-tight max-w-[44px] sm:max-w-[48px] md:max-w-[56px] truncate">
        {champion.name}
      </span>
    </motion.div>
  );
}
