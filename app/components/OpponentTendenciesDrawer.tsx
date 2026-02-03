'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import InfoIconPortal from './InfoIconPortal';

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

interface PatchTrend {
  patch_index: number;
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
  patch_trends: PatchTrend[];
  response_bans: ResponseBanEntry[];
}

interface TeamBanBlueprint {
  team_id: string;
  team_name: string;
  blue_side: SideBanBlueprint;
  red_side: SideBanBlueprint;
}

interface OpponentTendenciesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  ourTeamId: string | null;
  ourTeamName: string;
  enemyTeamId: string | null;
  enemyTeamName: string;
  userSide: 'blue' | 'red';
  currentPhase?: 'ban' | 'pick';
  currentSlot?: 1 | 2 | 3;
}

// ============================================================================
// Sub Components (No Portal - regular DOM)
// ============================================================================

function BanSlotDisplay({
  slot,
  bans,
  isCurrentSlot,
}: {
  slot: 1 | 2 | 3;
  bans: ChampionBanStat[];
  isCurrentSlot: boolean;
}) {
  return (
    <div className={`flex-1 min-w-0 p-2 rounded ${isCurrentSlot ? 'bg-cyan-500/10 border border-cyan-500/30' : ''}`}>
      <div className="text-center mb-2">
        <span className={`text-xs font-bold uppercase ${isCurrentSlot ? 'text-cyan-400' : 'text-slate-500'}`}>
          B{slot} {isCurrentSlot && '← Now'}
        </span>
      </div>
      <div className="space-y-1">
        {bans.slice(0, 5).map((ban, idx) => (
          <div
            key={ban.champion_id}
            className="flex items-center gap-1.5 px-1.5 py-1 rounded bg-slate-800/50 text-xs"
          >
            <span className="text-slate-500 w-3">{idx + 1}</span>
            <span className="text-slate-300 truncate flex-1" title={ban.champion_name}>
              {ban.champion_name}
            </span>
            <span className="text-cyan-400 font-mono text-[10px]">
              {(ban.rate * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResponseBansSection({ responses }: { responses: ResponseBanEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  const displayCount = expanded ? 10 : 5;
  const topResponses = responses.slice(0, displayCount);

  if (topResponses.length === 0) {
    return <div className="text-xs text-slate-500 text-center py-2">No response ban data</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold uppercase text-slate-400">Response Bans</h4>
        <InfoIconPortal
          tooltip="Counter-ban patterns"
          detail="When opponent bans champion A, what do we typically ban in response?"
        />
      </div>
      <div className="space-y-1.5 max-h-40 overflow-y-auto">
        {topResponses.map((entry) => (
          <div key={entry.opponent_banned} className="flex items-center gap-2 text-xs">
            <span className="text-rose-400 truncate w-20" title={entry.opponent_banned}>
              {entry.opponent_banned}
            </span>
            <span className="text-slate-600">→</span>
            <span className="text-slate-300 truncate flex-1">
              {entry.responses.slice(0, 3).map((r, i) => (
                <span key={r.champion}>
                  {i > 0 && ', '}
                  <span className="text-cyan-400">{r.champion}</span>
                  <span className="text-slate-500 text-[10px]"> ({(r.rate * 100).toFixed(0)}%)</span>
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
      {responses.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-[10px] text-slate-500 hover:text-slate-400"
        >
          {expanded ? '▲ Show less' : `▼ Show ${responses.length - 5} more`}
        </button>
      )}
    </div>
  );
}

function PatchTrendsSection({ trends }: { trends: PatchTrend[] }) {
  const [expanded, setExpanded] = useState(false);

  const formatPatch = (idx: number) => `${Math.floor(idx / 100)}.${idx % 100}`;

  if (trends.length === 0) {
    return <div className="text-xs text-slate-500 text-center py-2">No trend data</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold uppercase text-slate-400">Patch Trends</h4>
        <InfoIconPortal tooltip="Recent patch changes in ban preferences" />
      </div>
      <div className="space-y-2">
        {trends.slice(0, expanded ? 5 : 2).map((trend) => (
          <div key={trend.patch_index}>
            <div className="text-[10px] text-slate-500 mb-1">
              Patch {formatPatch(trend.patch_index)}
            </div>
            <div className="flex flex-wrap gap-1">
              {trend.top_bans.slice(0, 5).map((ban) => (
                <span
                  key={ban.champion_id}
                  className="px-1.5 py-0.5 bg-slate-700/50 rounded text-[10px] text-slate-300"
                >
                  {ban.champion_name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      {trends.length > 2 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-[10px] text-slate-500 hover:text-slate-400"
        >
          {expanded ? '▲ Show less' : `▼ Show more patches`}
        </button>
      )}
    </div>
  );
}

function TeamBlueprintPanel({
  blueprint,
  teamName,
  isEnemy,
  currentSlot,
}: {
  blueprint: TeamBanBlueprint | null;
  teamName: string;
  isEnemy: boolean;
  currentSlot?: 1 | 2 | 3;
}) {
  const [selectedSide, setSelectedSide] = useState<'blue' | 'red'>('blue');

  const sideData = blueprint
    ? selectedSide === 'blue'
      ? blueprint.blue_side
      : blueprint.red_side
    : null;

  const borderColor = isEnemy ? 'border-rose-500/30' : 'border-cyan-500/30';
  const headerBg = isEnemy ? 'bg-rose-500/10' : 'bg-cyan-500/10';
  const labelColor = isEnemy ? 'text-rose-400' : 'text-cyan-400';

  if (!blueprint) {
    return (
      <div className={`rounded-lg border ${borderColor} bg-slate-900/50 p-4`}>
        <div className="text-sm text-slate-500 text-center">
          {teamName ? `No data for ${teamName}` : 'No team selected'}
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border ${borderColor} bg-slate-900/50 overflow-hidden`}>
      {/* Header */}
      <div className={`px-3 py-2 ${headerBg} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold uppercase ${labelColor}`}>
            {isEnemy ? 'Enemy' : 'Our Team'}
          </span>
          <span className="text-xs text-slate-400 truncate max-w-[120px]" title={teamName}>
            {teamName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Side toggle */}
          <div className="flex gap-1">
            <button
              onClick={() => setSelectedSide('blue')}
              className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${
                selectedSide === 'blue'
                  ? 'bg-cyan-500/20 text-cyan-400'
                  : 'text-slate-500 hover:text-slate-400'
              }`}
            >
              Blue
            </button>
            <button
              onClick={() => setSelectedSide('red')}
              className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${
                selectedSide === 'red'
                  ? 'bg-rose-500/20 text-rose-400'
                  : 'text-slate-500 hover:text-slate-400'
              }`}
            >
              Red
            </button>
          </div>
          {/* Sample size */}
          {sideData && (
            <span className="text-[10px] text-slate-500">
              n={sideData.total_games}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      {sideData && (
        <div className="p-3 space-y-4">
          {/* Ban Slots */}
          <div className="flex gap-2">
            {sideData.ban_slots.map((slot) => (
              <BanSlotDisplay
                key={slot.slot}
                slot={slot.slot}
                bans={slot.top_bans}
                isCurrentSlot={currentSlot === slot.slot}
              />
            ))}
          </div>

          {/* Response Bans */}
          <ResponseBansSection responses={sideData.response_bans} />

          {/* Patch Trends */}
          <PatchTrendsSection trends={sideData.patch_trends} />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function OpponentTendenciesDrawer({
  isOpen,
  onClose,
  ourTeamId,
  ourTeamName,
  enemyTeamId,
  enemyTeamName,
  userSide,
  currentPhase = 'pick',
  currentSlot,
}: OpponentTendenciesDrawerProps) {
  const [ourBlueprint, setOurBlueprint] = useState<TeamBanBlueprint | null>(null);
  const [enemyBlueprint, setEnemyBlueprint] = useState<TeamBanBlueprint | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch blueprints when drawer opens
  useEffect(() => {
    if (!isOpen) return;

    async function fetchBlueprints() {
      if (!ourTeamId && !enemyTeamId) {
        setOurBlueprint(null);
        setEnemyBlueprint(null);
        return;
      }

      setLoading(true);
      try {
        if (ourTeamId && enemyTeamId) {
          const res = await fetch(`/api/team-ban-blueprint?teamA=${ourTeamId}&teamB=${enemyTeamId}`);
          const data = await res.json();
          if (data.success) {
            setOurBlueprint(data.teamA);
            setEnemyBlueprint(data.teamB);
          }
        } else {
          if (ourTeamId) {
            const res = await fetch(`/api/team-ban-blueprint?team_id=${ourTeamId}`);
            const data = await res.json();
            setOurBlueprint(data.success ? data.team : null);
          }
          if (enemyTeamId) {
            const res = await fetch(`/api/team-ban-blueprint?team_id=${enemyTeamId}`);
            const data = await res.json();
            setEnemyBlueprint(data.success ? data.team : null);
          }
        }
      } catch (err) {
        console.error('Failed to fetch blueprints:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchBlueprints();
  }, [isOpen, ourTeamId, enemyTeamId]);

  // No Portal - render as regular DOM children
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="absolute right-0 top-0 h-full w-full max-w-lg bg-slate-900 border-l border-slate-700 shadow-xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 p-4 z-10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">Team Ban Tendencies</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {currentPhase === 'ban' && currentSlot
                      ? `Currently at B${currentSlot} phase`
                      : 'Historical ban patterns for strategic planning'}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full" />
                </div>
              ) : (
                <>
                  {/* Enemy Team Blueprint (show first - more important) */}
                  <TeamBlueprintPanel
                    blueprint={enemyBlueprint}
                    teamName={enemyTeamName}
                    isEnemy={true}
                    currentSlot={currentSlot}
                  />

                  {/* Our Team Blueprint */}
                  <TeamBlueprintPanel
                    blueprint={ourBlueprint}
                    teamName={ourTeamName}
                    isEnemy={false}
                    currentSlot={currentSlot}
                  />

                  {/* Help text */}
                  <div className="text-[10px] text-slate-500 text-center pt-4 border-t border-slate-800">
                    <p>Data source: grid_v2/team_ban_blueprints.json</p>
                    <p className="mt-1">Rate = ban_count / total_games on that side</p>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
