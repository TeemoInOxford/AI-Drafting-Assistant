'use client';

import { ChampionClass } from '../lib/types';
import { Classes } from '../lib/classes';

interface DropDownClassFilterProps {
  selectedClass: ChampionClass | null;
  onSelect: (championClass: ChampionClass | null) => void;
}

export default function DropDownClassFilter({
  selectedClass,
  onSelect,
}: DropDownClassFilterProps) {
  return (
    <div className="flex items-center gap-2">
      {/* All button - matches Position filter style */}
      <button
        onClick={() => onSelect(null)}
        className={`flex items-center justify-center gap-2 px-5 py-1.5 rounded border transition-all duration-300 whitespace-nowrap ${
          selectedClass === null
            ? 'bg-purple-500/20 border-purple-500/50 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.2)]'
            : 'border-white/10 text-slate-400 hover:text-white hover:border-white/20'
        }`}
        title="All Classes"
      >
        <span className="text-[11px] font-bold uppercase whitespace-nowrap">ALL</span>
      </button>

      {/* Class buttons - grow to fill space */}
      {Classes.filter(c => c !== '').map((classType) => (
        <button
          key={classType}
          onClick={() => onSelect(classType)}
          className={`flex-grow flex items-center justify-center gap-2 px-2 py-1.5 rounded border transition-all duration-300 whitespace-nowrap ${
            selectedClass === classType
              ? 'bg-purple-500/20 border-purple-500/50 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.2)]'
              : 'border-white/10 text-slate-400 hover:text-white hover:border-white/20'
          }`}
          title={classType}
        >
          <span className="text-[11px] font-bold uppercase whitespace-nowrap">{classType}</span>
        </button>
      ))}
    </div>
  );
}
