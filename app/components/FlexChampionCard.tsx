'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface RoleCounts {
  top: number;
  jungle: number;
  mid: number;
  bot: number;
  support: number;
}

interface RoleProbabilities {
  top: number;
  jungle: number;
  mid: number;
  bot: number;
  support: number;
}

interface FlexChampion {
  champion_name: string;
  champion_id: string;
  flexibilityScore: number;
  role_probabilities: RoleProbabilities;
  raw_counts_by_role: RoleCounts;
  effective_sample_size: number;
}

interface FlexChampionCardProps {
  champion: FlexChampion;
  rank?: number;
  showFallbackWarning?: boolean;
}

type Role = 'top' | 'jungle' | 'mid' | 'bot' | 'support';

const ALL_ROLES: Role[] = ['top', 'jungle', 'mid', 'bot', 'support'];

const ROLE_COLORS: Record<Role, string> = {
  top: '#3B82F6',
  jungle: '#22C55E',
  mid: '#F59E0B',
  bot: '#EF4444',
  support: '#A855F7',
};

const ROLE_DISPLAY: Record<Role, string> = {
  top: 'Top',
  jungle: 'Jng',
  mid: 'Mid',
  bot: 'Bot',
  support: 'Sup',
};

/**
 * Compute display primary role = argmax(posteriorProb) among observed roles.
 * Consistent with RoleFlexibilityBar.computeDisplayPrimaryRole
 */
function computeDisplayPrimaryRole(
  probs: RoleProbabilities,
  rawCounts: RoleCounts | undefined
): Role {
  // Get observed roles (rawCounts > 0)
  const observedRoles = rawCounts
    ? ALL_ROLES.filter(r => (rawCounts[r] ?? 0) > 0)
    : [];

  // Find argmax(posteriorProb) among observed roles
  if (observedRoles.length > 0) {
    let maxProb = -1;
    let maxRole: Role = observedRoles[0];
    for (const role of observedRoles) {
      const prob = probs[role] ?? 0;
      if (prob > maxProb) {
        maxProb = prob;
        maxRole = role;
      }
    }
    return maxRole;
  }

  // Fallback: argmax of full distribution
  let maxProb = -1;
  let maxRole: Role = 'mid';
  for (const role of ALL_ROLES) {
    const prob = probs[role] ?? 0;
    if (prob > maxProb) {
      maxProb = prob;
      maxRole = role;
    }
  }
  return maxRole;
}

/**
 * Compute observed-normalized distribution.
 * Only roles with raw_counts > 0, renormalized to 100%.
 */
function computeObservedDistribution(
  probs: RoleProbabilities,
  rawCounts: RoleCounts | undefined
): { role: Role; normProb: number; isPrimary: boolean }[] {
  // Observed = raw_counts > 0
  const observedRoles = rawCounts
    ? ALL_ROLES.filter(r => (rawCounts[r] ?? 0) > 0)
    : ALL_ROLES.filter(r => (probs[r] ?? 0) > 0);

  const mass = observedRoles.reduce((sum, r) => sum + (probs[r] ?? 0), 0);
  const displayPrimary = computeDisplayPrimaryRole(probs, rawCounts);

  return observedRoles
    .map(role => ({
      role,
      normProb: mass > 0 ? (probs[role] ?? 0) / mass : 0,
      isPrimary: role === displayPrimary,
    }))
    .sort((a, b) => b.normProb - a.normProb);
}

export default function FlexChampionCard({ champion, rank, showFallbackWarning }: FlexChampionCardProps) {
  const [expanded, setExpanded] = useState(false);

  const observed = computeObservedDistribution(
    champion.role_probabilities,
    champion.raw_counts_by_role
  );
  const displayPrimary = computeDisplayPrimaryRole(
    champion.role_probabilities,
    champion.raw_counts_by_role
  );

  // Count observed roles for FLEX badge
  const observedCount = observed.length;

  return (
    <motion.div
      layout
      className="bg-slate-800/50 border border-slate-700/50 rounded-lg overflow-hidden hover:border-slate-600/50 transition-colors"
    >
      {/* Main Card Content */}
      <div
        className="p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-4">
          {/* Left: Champion Info */}
          <div className="flex items-center gap-3 min-w-0">
            {rank && (
              <span className="text-lg font-bold text-slate-500 w-6 text-right flex-shrink-0">
                {rank}
              </span>
            )}
            {/* Champion Icon */}
            <img
              src={`https://ddragon.leagueoflegends.com/cdn/14.1.1/img/champion/${champion.champion_id}.png`}
              alt={champion.champion_name}
              className="w-10 h-10 rounded flex-shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://ddragon.leagueoflegends.com/cdn/14.1.1/img/champion/${champion.champion_name.replace(/[^a-zA-Z]/g, '')}.png`;
              }}
            />
            <div className="min-w-0">
              <h3 className="font-semibold text-white truncate">
                {champion.champion_name}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className="text-xs px-1.5 py-0.5 rounded font-bold"
                  style={{
                    backgroundColor: `${ROLE_COLORS[displayPrimary]}20`,
                    color: ROLE_COLORS[displayPrimary],
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: `${ROLE_COLORS[displayPrimary]}40`,
                  }}
                >
                  {ROLE_DISPLAY[displayPrimary]}
                </span>
                {observedCount > 1 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    FLEX {observedCount}
                  </span>
                )}
                {showFallbackWarning && (
                  <span
                    className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    title="Low sample size — falling back to Global"
                  >
                    GLOBAL
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Stats */}
          <div className="flex-shrink-0 text-right group relative">
            <div className="text-lg font-bold text-amber-400">
              {champion.flexibilityScore.toFixed(3)}
            </div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wide cursor-help">
              Flex Score
            </div>
            {/* Tooltip */}
            <div className="absolute right-0 top-full mt-1 hidden group-hover:block bg-slate-900 text-xs text-slate-300 p-2 rounded shadow-lg w-48 z-10 border border-slate-700 text-left">
              Entropy-based measure of role flexibility. Higher scores indicate more role diversity in professional play.
            </div>
          </div>
        </div>

        {/* Role Distribution Bar — observed-normalized */}
        <div className="mt-3">
          <div className="relative h-3 rounded-full overflow-hidden bg-slate-700/50">
            <div className="flex h-full w-full">
              {observed.map((seg) => {
                const pct = seg.normProb * 100;
                return (
                  <div
                    key={seg.role}
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: ROLE_COLORS[seg.role],
                      boxShadow: seg.isPrimary ? 'inset 0 0 0 1.5px rgba(255,255,255,0.5)' : undefined,
                    }}
                    title={`${ROLE_DISPLAY[seg.role]}: ${pct.toFixed(1)}%${seg.isPrimary ? ' (Primary)' : ''}`}
                  />
                );
              })}
            </div>
          </div>

          {/* Role Labels — observed only */}
          <div className="flex justify-between mt-1.5 gap-1">
            {observed.map(seg => {
              const pct = seg.normProb * 100;
              return (
                <div
                  key={seg.role}
                  className="flex items-center gap-1"
                  style={{ flex: seg.normProb }}
                >
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      seg.isPrimary ? 'ring-1 ring-white/60' : ''
                    }`}
                    style={{ backgroundColor: ROLE_COLORS[seg.role] }}
                  />
                  <span className={`text-[10px] truncate ${
                    seg.isPrimary ? 'text-slate-200 font-bold' : 'text-slate-400'
                  }`}>
                    {ROLE_DISPLAY[seg.role]}
                  </span>
                  <span className={`text-[10px] ${
                    seg.isPrimary ? 'text-slate-300' : 'text-slate-500'
                  }`}>
                    {pct >= 1 ? Math.round(pct) + '%' : '<1%'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Metadata Row */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/50">
          <div className="flex items-center gap-4 text-[11px] text-slate-500">
            <span>
              ESS: <span className="text-slate-400">{champion.effective_sample_size.toFixed(1)}</span>
            </span>
          </div>
          <button
            className="text-[10px] text-slate-500 hover:text-slate-400 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? 'Collapse' : 'Details'}
          </button>
        </div>
      </div>

      {/* Expanded Details — observed roles only */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-2 border-t border-slate-700/50 bg-slate-900/30">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                Observed Role Distribution
              </h4>
              <div className="flex flex-wrap gap-3">
                {observed.map(seg => {
                  const pct = seg.normProb * 100;
                  const rawCount = champion.raw_counts_by_role?.[seg.role] ?? 0;
                  return (
                    <div key={seg.role} className="text-center">
                      <div
                        className={`text-sm font-bold ${seg.isPrimary ? 'underline underline-offset-2' : ''}`}
                        style={{ color: ROLE_COLORS[seg.role] }}
                      >
                        {pct.toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {ROLE_DISPLAY[seg.role]}
                      </div>
                      <div className="text-[9px] text-slate-600">
                        ({rawCount} games)
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 text-[10px] text-slate-500">
                <span className="text-slate-400">UUID:</span> {champion.champion_id}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
