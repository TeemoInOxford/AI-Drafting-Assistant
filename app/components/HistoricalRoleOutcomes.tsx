'use client';

import { Position } from '../lib/types';

interface RoleOutcome {
  role_name: Position;
  probability: number;
  win_rate: number;
  sample_size: number;
  display_flag: boolean;
}

interface HistoricalRoleOutcomesProps {
  championName: string;
  roles: RoleOutcome[];
  compact?: boolean;
}

const ROLE_LABELS: Record<Position, string> = {
  top: 'Top',
  jungle: 'Jgl',
  mid: 'Mid',
  bot: 'Bot',
  support: 'Sup'
};

export default function HistoricalRoleOutcomes({
  championName,
  roles,
  compact = false
}: HistoricalRoleOutcomesProps) {
  // Filter to only show flagged roles (low-frequency with notable win rate diff)
  const flaggedRoles = roles.filter(r => r.display_flag);

  // Find main role (not flagged, highest probability)
  const mainRole = roles.find(r => !r.display_flag);

  if (flaggedRoles.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <div className="mt-1.5 pt-1.5 border-t border-slate-700/30">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[9px] text-amber-400/80 font-medium">Alt:</span>
          {flaggedRoles.map((role) => {
            const winRateDiff = mainRole
              ? ((role.win_rate - mainRole.win_rate) * 100).toFixed(0)
              : null;
            const isPositive = winRateDiff && parseInt(winRateDiff) > 0;

            return (
              <span
                key={role.role_name}
                className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-amber-500/10 border border-amber-500/20"
                title={`${ROLE_LABELS[role.role_name]}: ${Math.round(role.win_rate * 100)}% WR (n=${role.sample_size})`}
              >
                <span className="text-amber-300">{ROLE_LABELS[role.role_name]}</span>
                <span className={isPositive ? 'text-emerald-400' : 'text-rose-400'}>
                  {isPositive ? '+' : ''}{winRateDiff}%
                </span>
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 pt-2 border-t border-slate-700/30">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[9px] text-amber-400 font-semibold uppercase tracking-wider">
          Historical Role Outcomes
        </span>
        <span className="text-[8px] text-slate-500">(Low-freq roles)</span>
      </div>

      <div className="space-y-1">
        {/* Main role for reference */}
        {mainRole && (
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span className="font-medium">{ROLE_LABELS[mainRole.role_name]} (main)</span>
            <span>{Math.round(mainRole.win_rate * 100)}% WR</span>
          </div>
        )}

        {/* Flagged roles */}
        {flaggedRoles.map((role) => {
          const winRateDiff = mainRole
            ? ((role.win_rate - mainRole.win_rate) * 100).toFixed(0)
            : null;
          const isPositive = winRateDiff && parseInt(winRateDiff) > 0;

          return (
            <div
              key={role.role_name}
              className="flex items-center justify-between text-[10px] bg-amber-500/5 rounded px-1.5 py-1 border border-amber-500/10"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-amber-300 font-medium">
                  {ROLE_LABELS[role.role_name]}
                </span>
                <span className="text-slate-500">
                  ({Math.round(role.probability * 100)}% freq)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-300">
                  {Math.round(role.win_rate * 100)}% WR
                </span>
                {winRateDiff && (
                  <span className={`font-medium ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isPositive ? '+' : ''}{winRateDiff}%
                  </span>
                )}
                <span className="text-slate-500 text-[9px]">
                  n={role.sample_size}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-1.5 text-[8px] text-slate-500 leading-relaxed">
        Low-frequency roles may reflect niche usage or team-specific strategies.
      </p>
    </div>
  );
}
