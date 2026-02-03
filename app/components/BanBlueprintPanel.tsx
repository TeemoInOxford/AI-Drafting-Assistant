'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================================
// Types
// ============================================================================

interface ChampionBanStat {
  champion_id: string;
  champion_name: string;
  count: number;
  rate: number;
}

interface SlotBans {
  slot: 1 | 2 | 3;
  total_bans: number;
  top_bans: ChampionBanStat[];
}

interface ResponseBanEntry {
  opponent_banned: string;
  responses: Array<{ champion: string; count: number; rate: number }>;
}

interface SideBanBlueprint {
  total_games: number;
  ban_slots: SlotBans[];
  overall_top_bans: ChampionBanStat[];
  response_bans: ResponseBanEntry[];
}

interface TeamBanBlueprint {
  team_id: string;
  team_name: string;
  blue_side: SideBanBlueprint;
  red_side: SideBanBlueprint;
}

interface BanBlueprintPanelProps {
  teamId: string | null;
  teamName: string;
  side: 'blue' | 'red';
  isEnemy?: boolean;
}

// ============================================================================
// Helper Components
// ============================================================================

function HelpTooltip({ content }: { content: string }) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        className="w-4 h-4 rounded-full border border-slate-500 text-slate-500 hover:border-slate-300 hover:text-slate-300 text-[10px] flex items-center justify-center transition-colors"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => setShowTooltip(!showTooltip)}
      >
        ?
      </button>
      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-800 border border-slate-600 rounded-lg shadow-xl text-xs text-slate-300 whitespace-pre-wrap"
          >
            {content}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-600" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-slate-700/50 rounded ${className || ''}`} />
  );
}

function BanSlotColumn({
  slot,
  bans,
  totalGames,
}: {
  slot: 1 | 2 | 3;
  bans: ChampionBanStat[];
  totalGames: number;
}) {
  const top5 = bans.slice(0, 5);

  return (
    <div className="flex-1 min-w-0">
      <div className="text-center mb-2">
        <span className="text-[10px] font-bold uppercase text-slate-400">
          Ban {slot}
        </span>
      </div>
      <div className="space-y-1">
        {top5.map((ban, idx) => (
          <div
            key={ban.champion_id}
            className="flex items-center gap-2 px-2 py-1 rounded bg-slate-800/50 hover:bg-slate-700/50 transition-colors"
          >
            <span className="text-[10px] text-slate-500 w-3">{idx + 1}.</span>
            <span className="text-xs text-slate-200 truncate flex-1" title={ban.champion_name}>
              {ban.champion_name}
            </span>
            <span className="text-xs font-mono text-cyan-400">
              {(ban.rate * 100).toFixed(0)}%
            </span>
            <span className="text-[10px] text-slate-500">
              ({ban.count})
            </span>
          </div>
        ))}
        {top5.length === 0 && (
          <div className="text-center text-slate-500 text-xs py-2">No data</div>
        )}
      </div>
    </div>
  );
}

function ResponseBansSection({
  responses,
  collapsed,
  onToggle,
}: {
  responses: ResponseBanEntry[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  const top10 = responses.slice(0, 10);

  return (
    <div className="mt-3 border-t border-slate-700/50 pt-3">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full text-left hover:bg-slate-700/30 rounded px-2 py-1 transition-colors"
      >
        <svg
          className={`w-3 h-3 text-slate-400 transition-transform ${collapsed ? '' : 'rotate-90'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-[10px] font-bold uppercase text-slate-400">
          Response Bans
        </span>
        <HelpTooltip content="When opponent bans champion A, what does this team ban next? Shows the distribution of follow-up bans." />
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
              {top10.map((entry, idx) => (
                <div key={entry.opponent_banned} className="px-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500">{idx + 1}.</span>
                    <span className="text-xs text-rose-400 font-medium">
                      {entry.opponent_banned}
                    </span>
                    <span className="text-[10px] text-slate-500">→</span>
                    <span className="text-xs text-slate-300 truncate">
                      {entry.responses.slice(0, 3).map((r, i) => (
                        <span key={r.champion}>
                          {i > 0 && ', '}
                          <span className="text-cyan-400">{r.champion}</span>
                          <span className="text-slate-500 text-[10px] ml-0.5">
                            ({(r.rate * 100).toFixed(0)}%)
                          </span>
                        </span>
                      ))}
                    </span>
                  </div>
                </div>
              ))}
              {top10.length === 0 && (
                <div className="text-center text-slate-500 text-xs py-2">No response data</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function BanBlueprintPanel({
  teamId,
  teamName,
  side,
  isEnemy = false,
}: BanBlueprintPanelProps) {
  const [blueprint, setBlueprint] = useState<TeamBanBlueprint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSide, setSelectedSide] = useState<'blue' | 'red'>(side);
  const [responsesCollapsed, setResponsesCollapsed] = useState(true);
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  // Fetch blueprint data
  useEffect(() => {
    if (!teamId) {
      setBlueprint(null);
      return;
    }

    async function fetchBlueprint() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/team-ban-blueprint?team_id=${teamId}`);
        const data = await response.json();

        if (data.success && data.team) {
          setBlueprint(data.team);
        } else {
          setError(data.error || 'Team not found');
          setBlueprint(null);
        }
      } catch (err) {
        setError('Failed to fetch blueprint data');
        setBlueprint(null);
      } finally {
        setLoading(false);
      }
    }

    fetchBlueprint();
  }, [teamId]);

  // Reset selected side when side prop changes
  useEffect(() => {
    setSelectedSide(side);
  }, [side]);

  const currentSideData = blueprint
    ? selectedSide === 'blue'
      ? blueprint.blue_side
      : blueprint.red_side
    : null;

  const borderColor = isEnemy ? 'border-rose-500/30' : 'border-cyan-500/30';
  const headerBg = isEnemy ? 'bg-rose-500/10' : 'bg-cyan-500/10';
  const headerText = isEnemy ? 'text-rose-400' : 'text-cyan-400';

  // No team selected
  if (!teamId) {
    return (
      <div className={`rounded-lg border ${borderColor} bg-slate-900/80 backdrop-blur-sm overflow-hidden`}>
        <div className={`px-3 py-2 ${headerBg} border-b ${borderColor}`}>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold uppercase ${headerText}`}>
              {isEnemy ? 'Enemy' : 'Our'} Ban Blueprint
            </span>
            <HelpTooltip content="Historical early ban patterns (slots 1-3) for this team. Data source: grid_v2/team_ban_blueprints.json" />
          </div>
        </div>
        <div className="p-4 text-center text-slate-500 text-sm">
          No team selected
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border ${borderColor} bg-slate-900/80 backdrop-blur-sm overflow-hidden`}>
      {/* Header */}
      <div className={`px-3 py-2 ${headerBg} border-b ${borderColor}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPanelCollapsed(!panelCollapsed)}
              className="text-slate-400 hover:text-slate-200 transition-colors"
            >
              <svg
                className={`w-4 h-4 transition-transform ${panelCollapsed ? '' : 'rotate-90'}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <span className={`text-xs font-bold uppercase ${headerText}`}>
              {isEnemy ? 'Enemy' : 'Our'} Ban Blueprint
            </span>
            <HelpTooltip
              content={`Historical early ban patterns (slots 1-3).

• Data: grid_v2/team_ban_blueprints.json
• Rate = count / total_games(side)
• Response Bans: When opponent bans A, what does this team ban next?`}
            />
          </div>

          {/* Side Tabs */}
          {!panelCollapsed && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSelectedSide('blue')}
                className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded transition-colors ${
                  selectedSide === 'blue'
                    ? 'bg-cyan-500/30 text-cyan-300'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Blue
              </button>
              <button
                onClick={() => setSelectedSide('red')}
                className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded transition-colors ${
                  selectedSide === 'red'
                    ? 'bg-rose-500/30 text-rose-300'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Red
              </button>
            </div>
          )}
        </div>

        {/* Team name and sample size */}
        {!panelCollapsed && (
          <div className="mt-1 flex items-center justify-between">
            <span className="text-xs text-slate-300 font-medium truncate max-w-[60%]" title={teamName}>
              {teamName || `Team ${teamId}`}
            </span>
            {currentSideData && (
              <span className="text-[10px] text-slate-500">
                {currentSideData.total_games} games
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <AnimatePresence>
        {!panelCollapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-3">
              {loading ? (
                // Loading skeleton
                <div className="space-y-3">
                  <div className="flex gap-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex-1 space-y-1">
                        <Skeleton className="h-4 w-12 mx-auto" />
                        {[1, 2, 3, 4, 5].map(j => (
                          <Skeleton key={j} className="h-6" />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ) : error ? (
                // Error state
                <div className="text-center text-rose-400 text-sm py-4">
                  {error}
                </div>
              ) : currentSideData ? (
                // Data display
                <>
                  {/* Three columns for Ban 1, 2, 3 */}
                  <div className="flex gap-2">
                    {currentSideData.ban_slots.map(slot => (
                      <BanSlotColumn
                        key={slot.slot}
                        slot={slot.slot}
                        bans={slot.top_bans}
                        totalGames={currentSideData.total_games}
                      />
                    ))}
                  </div>

                  {/* Response Bans (collapsible) */}
                  <ResponseBansSection
                    responses={currentSideData.response_bans}
                    collapsed={responsesCollapsed}
                    onToggle={() => setResponsesCollapsed(!responsesCollapsed)}
                  />
                </>
              ) : (
                // Empty state
                <div className="text-center text-slate-500 text-sm py-4">
                  No blueprint data available
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
