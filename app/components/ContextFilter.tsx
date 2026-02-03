'use client';

import { type LeagueKey, ALL_LEAGUES, LEAGUE_LABELS } from '@/app/lib/league-types';

interface ContextFilterProps {
  selectedLeague: LeagueKey;
  onLeagueChange: (league: LeagueKey) => void;
}

export default function ContextFilter({
  selectedLeague,
  onLeagueChange,
}: ContextFilterProps) {
  return (
    <div className="flex items-center">
      {/* League Dropdown */}
      <div className="relative">
        <select
          value={selectedLeague}
          onChange={(e) => onLeagueChange(e.target.value as LeagueKey)}
          className={`px-2 py-1.5 rounded border text-xs font-bold uppercase transition-all duration-300 appearance-none pr-6 ${
            selectedLeague !== 'global'
              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
              : 'bg-slate-800/50 border-white/10 text-slate-400 hover:text-slate-300'
          }`}
        >
          {ALL_LEAGUES.map(league => (
            <option key={league} value={league} className="bg-slate-800 text-slate-300">
              {LEAGUE_LABELS[league]}
            </option>
          ))}
        </select>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg className="w-3 h-3 text-current" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>
  );
}
