'use client';

import { motion } from 'framer-motion';
import { Champion, Language } from '../lib/types';

interface ChampionCardProps {
  champion: Champion;
  isUsed: boolean;
  onClick: () => void;
  disabled: boolean;
  index: number;
  language: Language;
}

export default function ChampionCard({
  champion,
  isUsed,
  onClick,
  disabled,
  index,
  language,
}: ChampionCardProps) {
  const displayName = language === 'zh' ? champion.zhName : champion.enName;

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
        ${isUsed ? 'opacity-30 grayscale' : ''}
      `}
    >
      {/* 头像 */}
      <div className={`
        relative w-12 h-12 md:w-14 md:h-14 rounded-lg overflow-hidden border-2 transition-all duration-200
        ${isUsed
          ? 'border-gray-600'
          : 'border-white/20 hover:border-blue-400 hover:shadow-lg hover:shadow-blue-500/30'}
      `}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={champion.image}
          alt={displayName}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {isUsed && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-red-400 text-lg">✕</span>
          </div>
        )}
      </div>

      {/* 名字 */}
      <span className={`
        mt-1 text-[10px] md:text-xs text-center truncate w-full px-0.5
        ${isUsed ? 'text-gray-500' : 'text-gray-300'}
      `}>
        {displayName}
      </span>
    </motion.div>
  );
}
