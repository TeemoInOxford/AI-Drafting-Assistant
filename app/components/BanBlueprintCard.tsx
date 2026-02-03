'use client';

import { useState, useEffect, useRef } from 'react';
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

interface BanBlueprintCardProps {
  ourTeamId: string | null;
  ourTeamName: string;
  enemyTeamId: string | null;
  enemyTeamName: string;
  userSide: 'blue' | 'red';
}

// ============================================================================
// Sub Components
// ============================================================================

function BanSlotMini({
  slot,
  bans,
  expanded,
}: {
  slot: 1 | 2 | 3;
  bans: ChampionBanStat[];
  expanded: boolean;
}) {
  const displayCount = expanded ? 5 : 3;
  const topBans = bans.slice(0, displayCount);

  return (
    <div className="flex-1 min-w-0">
      <div className="text-center mb-1">
        <span className="text-[9px] font-bold uppercase text-slate-500">
          B{slot}
        </span>
      </div>
      <div className="space-y-0.5">
        {topBans.map((ban, idx) => (
          <div
            key={ban.champion_id}
            className="flex items-center gap-1 px-1 py-0.5 rounded bg-slate-800/30 text-[10px]"
          >
            <span className="text-slate-500 w-2">{idx + 1}</span>
            <span className="text-slate-300 truncate flex-1" title={ban.champion_name}>
              {ban.champion_name}
            </span>
            <span className="text-cyan-400 font-mono">
              {(ban.rate * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResponseBansMini({
  responses,
  expanded,
}: {
  responses: ResponseBanEntry[];
  expanded: boolean;
}) {
  const displayCount = expanded ? 10 : 5;
  const responseCount = expanded ? 3 : 2;
  const topResponses = responses.slice(0, displayCount);

  if (topResponses.length === 0) {
    return <div className="text-[10px] text-slate-500 text-center py-1">No data</div>;
  }

  return (
    <div className="space-y-1 max-h-32 overflow-y-auto">
      {topResponses.map((entry) => (
        <div key={entry.opponent_banned} className="flex items-center gap-1 text-[10px]">
          <span className="text-rose-400 truncate w-16" title={entry.opponent_banned}>
            {entry.opponent_banned}
          </span>
          <span className="text-slate-600">→</span>
          <span className="text-slate-400 truncate flex-1">
            {entry.responses.slice(0, responseCount).map((r, i) => (
              <span key={r.champion}>
                {i > 0 && ', '}
                <span className="text-cyan-400">{r.champion}</span>
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

function PatchTrendsPopover({
  trends,
  onClose,
}: {
  trends: PatchTrend[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const formatPatch = (idx: number) => `${Math.floor(idx / 100)}.${idx % 100}`;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="absolute z-50 top-full right-0 mt-1 w-64 p-3 bg-slate-800 border border-slate-600 rounded-lg shadow-xl"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase text-slate-400">
          Recent Patch Trends
        </span>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {trends.slice(0, 5).map((trend) => (
          <div key={trend.patch_index}>
            <div className="text-[9px] text-slate-500 mb-0.5">
              Patch {formatPatch(trend.patch_index)}
            </div>
            <div className="flex flex-wrap gap-1">
              {trend.top_bans.slice(0, 5).map((ban) => (
                <span
                  key={ban.champion_id}
                  className="px-1.5 py-0.5 bg-slate-700/50 rounded text-[9px] text-slate-300"
                >
                  {ban.champion_name}
                </span>
              ))}
            </div>
          </div>
        ))}
        {trends.length === 0 && (
          <div className="text-[10px] text-slate-500 text-center">No trend data</div>
        )}
      </div>
    </motion.div>
  );
}

function TeamBlueprintSection({
  blueprint,
  teamName,
  side,
  isEnemy,
}: {
  blueprint: TeamBanBlueprint | null;
  teamName: string;
  side: 'blue' | 'red';
  isEnemy: boolean;
}) {
  const [selectedSide, setSelectedSide] = useState<'blue' | 'red'>(side);
  const [expanded, setExpanded] = useState(false);
  const [showResponses, setShowResponses] = useState(false);
  const [showTrends, setShowTrends] = useState(false);

  const sideData = blueprint
    ? selectedSide === 'blue'
      ? blueprint.blue_side
      : blueprint.red_side
    : null;

  const borderColor = isEnemy ? 'border-rose-500/20' : 'border-cyan-500/20';
  const headerBg = isEnemy ? 'bg-rose-500/5' : 'bg-cyan-500/5';
  const labelColor = isEnemy ? 'text-rose-400' : 'text-cyan-400';

  if (!blueprint) {
    return (
      <div className={`rounded border ${borderColor} bg-slate-900/50 p-2`}>
        <div className="text-[10px] text-slate-500 text-center">
          {teamName ? `No data for ${teamName}` : 'Select team'}
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded border ${borderColor} bg-slate-900/50 overflow-hidden`}>
      {/* Header */}
      <div className={`px-2 py-1.5 ${headerBg} flex items-center justify-between`}>
        <div className="flex items-center gap-1">
          <span className={`text-[10px] font-bold uppercase ${labelColor}`}>
            {isEnemy ? 'Enemy' : 'Our'}
          </span>
          <span className="text-[10px] text-slate-400 truncate max-w-[80px]" title={teamName}>
            {teamName}
          </span>
          <InfoIconPortal
            tooltip="Historical ban patterns"
            detail={`Data source: team_ban_blueprints.json\n\nShows early ban patterns (slots 1-3) aggregated from historical matches.\n\nRate = ban_count / total_games(side)`}
          />
        </div>
        <div className="flex items-center gap-1">
          {/* Side toggle */}
          <button
            onClick={() => setSelectedSide('blue')}
            className={`px-1.5 py-0.5 text-[9px] font-bold rounded transition-colors ${
              selectedSide === 'blue'
                ? 'bg-cyan-500/20 text-cyan-400'
                : 'text-slate-500 hover:text-slate-400'
            }`}
          >
            B
          </button>
          <button
            onClick={() => setSelectedSide('red')}
            className={`px-1.5 py-0.5 text-[9px] font-bold rounded transition-colors ${
              selectedSide === 'red'
                ? 'bg-rose-500/20 text-rose-400'
                : 'text-slate-500 hover:text-slate-400'
            }`}
          >
            R
          </button>
          {/* Sample size */}
          {sideData && (
            <span className="text-[9px] text-slate-500 ml-1">
              n={sideData.total_games}
              <InfoIconPortal tooltip="Total games on this side" />
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      {sideData && (
        <div className="p-2">
          {/* Ban Slots */}
          <div className="flex gap-1 mb-2">
            {sideData.ban_slots.map((slot) => (
              <BanSlotMini
                key={slot.slot}
                slot={slot.slot}
                bans={slot.top_bans}
                expanded={expanded}
              />
            ))}
          </div>

          {/* Show more / less */}
          <div className="flex items-center justify-between mb-1">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[9px] text-slate-500 hover:text-slate-400 transition-colors"
            >
              {expanded ? '▲ Show less' : '▼ Show more'}
            </button>

            {/* Trends button */}
            <div className="relative">
              <button
                onClick={() => setShowTrends(!showTrends)}
                className="px-1.5 py-0.5 text-[9px] text-slate-500 hover:text-slate-400 border border-slate-700 rounded transition-colors"
              >
                Trends
                <InfoIconPortal tooltip="Recent patch ban trends" />
              </button>
              <AnimatePresence>
                {showTrends && (
                  <PatchTrendsPopover
                    trends={sideData.patch_trends}
                    onClose={() => setShowTrends(false)}
                  />
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Response Bans (collapsible) */}
          <div className="border-t border-slate-700/50 pt-1">
            <button
              onClick={() => setShowResponses(!showResponses)}
              className="flex items-center gap-1 w-full text-left"
            >
              <svg
                className={`w-2.5 h-2.5 text-slate-500 transition-transform ${showResponses ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-[9px] font-bold uppercase text-slate-500">
                Response Bans
              </span>
              <InfoIconPortal
                tooltip="What we ban after opponent's ban"
                detail="When opponent bans champion A, this shows what champion B we typically ban next.\n\nUseful for predicting counter-ban patterns."
              />
            </button>
            <AnimatePresence>
              {showResponses && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-1 overflow-hidden"
                >
                  <ResponseBansMini
                    responses={sideData.response_bans}
                    expanded={expanded}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function BanBlueprintCard({
  ourTeamId,
  ourTeamName,
  enemyTeamId,
  enemyTeamName,
  userSide,
}: BanBlueprintCardProps) {
  const [ourBlueprint, setOurBlueprint] = useState<TeamBanBlueprint | null>(null);
  const [enemyBlueprint, setEnemyBlueprint] = useState<TeamBanBlueprint | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Fetch blueprints
  useEffect(() => {
    async function fetchBlueprints() {
      if (!ourTeamId && !enemyTeamId) {
        setOurBlueprint(null);
        setEnemyBlueprint(null);
        return;
      }

      setLoading(true);
      try {
        // Fetch both teams in one request if possible
        if (ourTeamId && enemyTeamId) {
          const res = await fetch(`/api/team-ban-blueprint?teamA=${ourTeamId}&teamB=${enemyTeamId}`);
          const data = await res.json();
          if (data.success) {
            setOurBlueprint(data.teamA);
            setEnemyBlueprint(data.teamB);
          }
        } else {
          // Fetch individually
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
  }, [ourTeamId, enemyTeamId]);

  const enemySide = userSide === 'blue' ? 'red' : 'blue';

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-900/30 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-3 py-2 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-3 h-3 text-slate-400 transition-transform ${collapsed ? '' : 'rotate-90'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-bold uppercase text-slate-300">
            Ban Blueprint
          </span>
          <InfoIconPortal
            tooltip="Historical team ban patterns"
            detail={`Shows early ban habits (slots 1-3) for both teams.\n\nData source: grid_v2/team_ban_blueprints.json\n\n• B1/B2/B3: First three bans\n• Rate: ban_count / total_games\n• Response Bans: Counter-ban patterns\n• Trends: Recent patch changes`}
          />
        </div>
        {loading && (
          <div className="w-3 h-3 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
        )}
      </button>

      {/* Content */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-2 grid grid-cols-2 gap-2">
              {/* Our Team */}
              <TeamBlueprintSection
                blueprint={ourBlueprint}
                teamName={ourTeamName}
                side={userSide}
                isEnemy={false}
              />
              {/* Enemy Team */}
              <TeamBlueprintSection
                blueprint={enemyBlueprint}
                teamName={enemyTeamName}
                side={enemySide}
                isEnemy={true}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
