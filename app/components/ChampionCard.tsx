'use client';

import { motion } from 'framer-motion';
import { Champion, Language, HistorySelectMode } from '../lib/types';

interface ChampionCardProps {
  champion: Champion;
  isUsed: boolean;
  isFearlessBanned?: boolean;
  onClick: () => void;
  disabled: boolean;
  index: number;
  language: Language;
  historySelectMode?: HistorySelectMode;
}

export default function ChampionCard({
  champion,
  isUsed,
  isFearlessBanned = false,
  onClick,
  disabled,
  index,
  language,
  historySelectMode = 'off',
}: ChampionCardProps) {
  const displayName = champion.name;
  const isInHistoryMode = historySelectMode !== 'off';

  // 确定边框颜色
  const getBorderClass = () => {
    if (isUsed) return 'border-slate-700';
    if (isFearlessBanned) return 'border-rose-700';
    if (isInHistoryMode) {
      return historySelectMode === 'blue'
        ? 'border-cyan-400 hover:border-cyan-300 hover:shadow-lg hover:shadow-cyan-500/30'
        : 'border-rose-400 hover:border-rose-300 hover:shadow-lg hover:shadow-rose-500/30';
    }
    return 'border-slate-700 hover:border-cyan-400 hover:shadow-lg hover:shadow-cyan-500/20';
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: Math.min(index * 0.01, 0.5) }}
      whileHover={!disabled ? { scale: 1.1, zIndex: 10 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
      onClick={!disabled ? onClick : undefined}
      className={`
        relative flex flex-col items-center cursor-pointer transition-all duration-200
        ${disabled ? 'cursor-not-allowed' : 'hover:z-10'}
        ${isUsed || isFearlessBanned ? 'opacity-30 grayscale' : ''}
      `}
    >
      {/* 头像 */}
      <div className={`
        relative w-11 h-11 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg overflow-hidden border-2 transition-all duration-200 bg-slate-900
        ${getBorderClass()}
      `}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={champion.image}
          alt={displayName}
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

      {/* 名字 */}
      <span className={`
        mt-1 text-[10px] md:text-xs text-center truncate w-full px-0.5
        ${isUsed || isFearlessBanned ? 'text-slate-600' : 'text-slate-400'}
      `}>
        {displayName}
      </span>
    </motion.div>
  );
}
