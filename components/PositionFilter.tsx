'use client';

import { motion } from 'framer-motion';
import { Position, Language } from '../lib/types';
import { POSITIONS } from '../lib/positions';

interface PositionFilterProps {
  selectedPosition: Position | null;
  onSelect: (position: Position | null) => void;
  language: Language;
}

export default function PositionFilter({
  selectedPosition,
  onSelect,
  language,
}: PositionFilterProps) {
  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2 mb-4 px-2">
      {/* 全部按钮 */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => onSelect(null)}
        className={`
          px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all
          ${selectedPosition === null
            ? 'bg-blue-500 text-white'
            : 'bg-white/10 text-gray-300 hover:bg-white/20'}
        `}
      >
        {language === 'zh' ? '全部' : 'All'}
      </motion.button>

      {/* 位置按钮 */}
      {POSITIONS.map((pos) => (
        <motion.button
          key={pos.id}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onSelect(pos.id)}
          className={`
            relative flex flex-col items-center gap-0.5 p-1 sm:p-1.5 rounded-lg transition-all
            ${selectedPosition === pos.id
              ? 'bg-blue-500/30 ring-2 ring-blue-400'
              : 'bg-white/10 hover:bg-white/20'}
          `}
          title={language === 'zh' ? pos.zhName : pos.enName}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pos.icon}
            alt={language === 'zh' ? pos.zhName : pos.enName}
            className={`w-5 h-5 sm:w-6 sm:h-6 ${selectedPosition === pos.id ? '' : 'opacity-70'}`}
          />
          <span className={`text-[8px] sm:text-[10px] ${selectedPosition === pos.id ? 'text-blue-300' : 'text-gray-400'}`}>
            {language === 'zh' ? pos.zhName : pos.enName}
          </span>
        </motion.button>
      ))}
    </div>
  );
}
