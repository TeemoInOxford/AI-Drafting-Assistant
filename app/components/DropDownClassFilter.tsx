'use client';

import { motion } from 'framer-motion';
import { ChampionClass, Language } from '../lib/types';
import {Classes} from '../lib/classes';

interface DropDownClassFilterProps {
  selectedClass: ChampionClass | null;
  onSelect: (championClass: ChampionClass | null) => void;
  language: Language;
}

export default function DropDownClassFilter({
  selectedClass,
  onSelect,
  language,
}: DropDownClassFilterProps) {
  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2 mb-4 px-2">
      {/* 全部按钮 */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => onSelect(null)}
        className={`
          px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all
          ${selectedClass === null
            ? 'bg-blue-500 text-white'
            : 'bg-white/10 text-gray-300 hover:bg-white/20'}
        `}
      >
        {language === 'zh' ? '全部' : 'All'}
      </motion.button>

      {/* 位置按钮 */}
      {Classes.map((pos) => (
        <motion.button
          key={pos}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onSelect(pos)}
          className={`
            relative flex flex-col items-center gap-0.5 p-1 sm:p-1.5 rounded-lg transition-all
            ${selectedClass === pos
              ? 'bg-blue-500/30 ring-2 ring-blue-400'
              : 'bg-white/10 hover:bg-white/20'}
          `}
          title={language === 'zh' ? pos : pos}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          
          <span className={`text-[12px] sm:text-[10px] ${selectedClass === pos ? 'text-blue-300' : 'text-gray-400'}`}>
            {language === 'zh' ? pos : pos}
          </span>
        </motion.button>
      ))}
    </div>
  );
}
