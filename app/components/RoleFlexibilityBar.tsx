'use client';

import { motion } from 'framer-motion';
import { RoleFlexibilityDistribution, getRoleColor } from '../lib/role-flexibility';
import { Position } from '../lib/types';

interface RoleFlexibilityBarProps {
  flexibility: RoleFlexibilityDistribution;
  showInterpretation?: boolean;
  compact?: boolean;
  className?: string;
}

const ROLE_DISPLAY: Record<Position, string> = {
  top: 'Top',
  jungle: 'Jng',
  mid: 'Mid',
  bot: 'Bot',
  support: 'Sup',
};

const ALL_ROLES: Position[] = ['top', 'jungle', 'mid', 'bot', 'support'];

/**
 * Compute display primary role = argmax(posteriorProb) among observed roles.
 *
 * Algorithm:
 * 1. observedRoles = roles where rawCountsByRole[role] > 0
 * 2. Among observedRoles, find role with highest posterior probability
 * 3. Fallback A: if no observed roles, use argmax of full distribution
 * 4. Fallback B: if distribution is empty/invalid, use flexibility.primaryRole
 *
 * Note: We compare raw posterior (not normalized) since normalization doesn't change argmax.
 */
export function computeDisplayPrimaryRole(flexibility: RoleFlexibilityDistribution): Position {
  const rawCounts = flexibility.rawCountsByRole;
  const probByRole = new Map(flexibility.distribution.map(d => [d.role, d.probability ?? 0]));

  // Step 1: Get observed roles (rawCounts > 0)
  const observedRoles = rawCounts
    ? ALL_ROLES.filter(r => (rawCounts[r] ?? 0) > 0)
    : [];

  // Step 2: Find argmax(posteriorProb) among observed roles
  if (observedRoles.length > 0) {
    let maxProb = -1;
    let maxRole: Position = observedRoles[0];
    for (const role of observedRoles) {
      const prob = probByRole.get(role) ?? 0;
      if (prob > maxProb) {
        maxProb = prob;
        maxRole = role;
      }
    }
    return maxRole;
  }

  // Fallback A: No observed roles - use argmax of full distribution
  if (flexibility.distribution.length > 0) {
    let maxProb = -1;
    let maxRole: Position = flexibility.primaryRole;
    for (const d of flexibility.distribution) {
      const prob = d.probability ?? 0;
      if (prob > maxProb) {
        maxProb = prob;
        maxRole = d.role;
      }
    }
    return maxRole;
  }

  // Fallback B: Empty distribution - use flexibility.primaryRole
  return flexibility.primaryRole;
}

/**
 * Compute observed-normalized distribution.
 * Only roles with raw_counts > 0 are included, renormalized to 100%.
 */
function computeObservedDistribution(flexibility: RoleFlexibilityDistribution): {
  role: Position;
  normProb: number;
  isViable: boolean;
  isPrimary: boolean;
}[] {
  const rawCounts = flexibility.rawCountsByRole;
  const probByRole = new Map(flexibility.distribution.map(d => [d.role, d]));
  const viableByRole = new Map(flexibility.distribution.map(d => [d.role, d.isViable]));

  // Observed = raw_counts > 0
  const observedRoles = ALL_ROLES.filter(r => (rawCounts?.[r] ?? 0) > 0);

  // Fallback: if no observed roles, use all roles with prob > 0
  const roles = observedRoles.length > 0
    ? observedRoles
    : flexibility.distribution.filter(d => d.probability > 0).map(d => d.role);

  const mass = roles.reduce((sum, r) => sum + (probByRole.get(r)?.probability ?? 0), 0);

  // Use display primary (argmax posterior among observed roles)
  const displayPrimary = computeDisplayPrimaryRole(flexibility);

  return roles
    .map(role => ({
      role,
      normProb: mass > 0 ? (probByRole.get(role)?.probability ?? 0) / mass : 0,
      isViable: viableByRole.get(role) ?? true,
      isPrimary: role === displayPrimary,
    }))
    .sort((a, b) => b.normProb - a.normProb);
}

export default function RoleFlexibilityBar({
  flexibility,
  showInterpretation = false,
  compact = false,
  className = '',
}: RoleFlexibilityBarProps) {
  const observed = computeObservedDistribution(flexibility);

  if (observed.length === 0) return null;

  return (
    <div className={className}>
      {/* Title */}
      {!compact && (
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Role Flexibility
          </h4>
          {flexibility.isFlexPick && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
              FLEX
            </span>
          )}
        </div>
      )}

      {/* Stacked Bar — observed-normalized */}
      <div className="relative h-4 rounded-full overflow-hidden bg-slate-800/50 border border-slate-700/50">
        <div className="flex h-full w-full">
          {observed.map((seg, index) => {
            const pct = seg.normProb * 100;
            return (
              <motion.div
                key={seg.role}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className={`h-full relative flex items-center justify-center ${
                  !seg.isViable ? 'opacity-40' : ''
                }`}
                style={{
                  backgroundColor: getRoleColor(seg.role),
                  // Primary role: brighter via box-shadow inset glow
                  boxShadow: seg.isPrimary ? `inset 0 0 0 1.5px rgba(255,255,255,0.5)` : undefined,
                }}
                title={`${ROLE_DISPLAY[seg.role]}: ${pct.toFixed(1)}%${
                  seg.isPrimary ? ' (Primary)' : ''
                }${!seg.isViable ? ' (filled)' : ''}`}
              >
                {/* Only show text for segments >= 8% */}
                {pct >= 8 && (
                  <span className={`text-[9px] font-bold text-white drop-shadow-sm ${
                    seg.isPrimary ? 'underline decoration-1 underline-offset-2' : ''
                  }`}>
                    {Math.round(pct)}%
                  </span>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Role Labels — only observed, primary first or sorted by prob */}
      <div className="flex justify-between mt-1.5 gap-1">
        {observed.map(seg => {
          const pct = seg.normProb * 100;
          return (
            <div
              key={seg.role}
              className={`flex items-center gap-1 ${
                !seg.isViable ? 'opacity-40' : ''
              }`}
              style={{ flex: seg.normProb }}
            >
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  seg.isPrimary ? 'ring-1 ring-white/60' : ''
                }`}
                style={{ backgroundColor: getRoleColor(seg.role) }}
              />
              <span className={`text-[10px] truncate ${
                seg.isPrimary ? 'text-slate-200 font-bold' : 'text-slate-400 font-medium'
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

      {/* Interpretation */}
      {showInterpretation && (
        <div className="mt-3 p-2 bg-slate-800/30 rounded border border-slate-700/30">
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Observed roles only (raw game counts &gt; 0), renormalized to 100%.
            Prior-only roles are hidden.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline version for list items
 */
export function RoleFlexibilityInline({
  flexibility,
  className = '',
}: {
  flexibility: RoleFlexibilityDistribution;
  className?: string;
}) {
  const observed = computeObservedDistribution(flexibility).slice(0, 3);

  if (observed.length <= 1) {
    const seg = observed[0] || { role: flexibility.primaryRole, normProb: 1 };
    return (
      <span className={`text-[10px] text-slate-400 ${className}`}>
        {ROLE_DISPLAY[seg.role]}
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {observed.map((seg, index) => (
        <span
          key={seg.role}
          className={`text-[10px] ${
            !seg.isViable ? 'opacity-40 line-through' : ''
          }`}
          style={{ color: getRoleColor(seg.role) }}
        >
          {ROLE_DISPLAY[seg.role]}
          <span className="text-slate-500 ml-0.5">
            {Math.round(seg.normProb * 100)}%
          </span>
          {index < observed.length - 1 && (
            <span className="text-slate-600 mx-0.5">/</span>
          )}
        </span>
      ))}
    </div>
  );
}

/**
 * Mini bar for tight spaces
 */
export function RoleFlexibilityMini({
  flexibility,
  width = 60,
  className = '',
}: {
  flexibility: RoleFlexibilityDistribution;
  width?: number;
  className?: string;
}) {
  const observed = computeObservedDistribution(flexibility);

  return (
    <div
      className={`relative h-1.5 rounded-full overflow-hidden bg-slate-800/50 ${className}`}
      style={{ width }}
      title={observed.map(r => `${ROLE_DISPLAY[r.role]}: ${Math.round(r.normProb * 100)}%`).join(', ')}
    >
      <div className="flex h-full">
        {observed.map(seg => (
          <div
            key={seg.role}
            className={`h-full ${!seg.isViable ? 'opacity-40' : ''}`}
            style={{
              width: `${seg.normProb * 100}%`,
              backgroundColor: getRoleColor(seg.role),
            }}
          />
        ))}
      </div>
    </div>
  );
}
