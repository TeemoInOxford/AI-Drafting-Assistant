'use client';

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
    <div className="flex items-center gap-2">
      <button
        onClick={() => onSelect(null)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-all duration-300 ${
          selectedPosition === null
            ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
            : 'border-white/10 text-slate-400 hover:text-white hover:border-white/20'
        }`}
      >
        <span className="text-xs font-bold uppercase tracking-wider">ALL</span>
      </button>

      {POSITIONS.map((pos) => (
        <button
          key={pos.id}
          onClick={() => onSelect(pos.id)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-all duration-300 ${
            selectedPosition === pos.id
              ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
              : 'border-white/10 text-slate-400 hover:text-white hover:border-white/20'
          }`}
          title={pos.name}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pos.icon}
            alt={pos.name}
            className="w-4 h-4"
          />
          <span className="text-xs font-bold uppercase tracking-wider">{pos.name}</span>
        </button>
      ))}
    </div>
  );
}
