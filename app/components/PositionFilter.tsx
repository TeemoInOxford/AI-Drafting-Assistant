'use client';

import { motion } from 'framer-motion';
import { Position } from '../lib/types';
import { POSITIONS } from '../lib/positions';

interface PositionFilterProps {
  selectedPosition: Position | null;
  onSelect: (position: Position | null) => void;
}

export default function PositionFilter({
  selectedPosition,
  onSelect,
}: PositionFilterProps) {
  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2 mb-4 px-2">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => onSelect(null)}
        className={`
          px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all
          ${selectedPosition === null
            ? 'bg-slate-100 text-slate-900'
            : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}
        `}
      >
        ALL
      </motion.button>

      {POSITIONS.map((pos) => (
        <motion.button
          key={pos.id}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onSelect(pos.id)}
          className={`
            relative flex flex-col items-center gap-0.5 p-1 sm:p-1.5 rounded-lg transition-all
            ${selectedPosition === pos.id
              ? 'bg-cyan-500/20 ring-2 ring-cyan-400'
              : 'bg-slate-800 hover:bg-slate-700'}
          `}
          title={pos.name}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pos.icon}
            alt={pos.name}
            className={`w-5 h-5 sm:w-6 sm:h-6 ${selectedPosition === pos.id ? '' : 'opacity-70'}`}
          />
          <span className={`text-[8px] sm:text-[10px] font-medium ${selectedPosition === pos.id ? 'text-cyan-300' : 'text-slate-500'}`}>
            {pos.name}
          </span>
        </motion.button>
      ))}
    </div>
  );
}
