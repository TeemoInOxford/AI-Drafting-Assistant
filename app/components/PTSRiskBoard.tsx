'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { PTSResult } from '../lib/types';

interface PTSRiskBoardProps {
  ptsResults: PTSResult[];
  currentTurn: string;
  ourSide: 'blue' | 'red';
  nextOpponentActions: string;
  onChampionClick?: (championId: string) => void;
}

export default function PTSRiskBoard({
  ptsResults,
  currentTurn,
  ourSide,
  nextOpponentActions,
  onChampionClick,
}: PTSRiskBoardProps) {
  const [hoveredChampion, setHoveredChampion] = useState<string | null>(null);

  const topFive = ptsResults.slice(0, 5);

  const critical = topFive.filter(r => r.riskTier === 'critical');
  const high = topFive.filter(r => r.riskTier === 'high');
  const safe = topFive.filter(r => r.riskTier === 'moderate' || r.riskTier === 'low');

  const getRiskColor = (tier: string) => {
    switch (tier) {
      case 'critical': return 'from-red-600 to-red-700';
      case 'high': return 'from-orange-600 to-orange-700';
      default: return 'from-slate-600 to-slate-700';
    }
  };

  const getRiskBorder = (tier: string) => {
    switch (tier) {
      case 'critical': return 'border-red-400';
      case 'high': return 'border-orange-400';
      default: return 'border-slate-400';
    }
  };

  const renderChampion = (result: PTSResult) => {
    const isHovered = hoveredChampion === result.championId;

    return (
      <motion.div
        key={result.championId}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="relative"
        onMouseEnter={() => setHoveredChampion(result.championId)}
        onMouseLeave={() => setHoveredChampion(null)}
        onClick={() => onChampionClick?.(result.championId)}
      >
        <div
          className={`
            p-3 rounded-lg border-2 cursor-pointer transition-all
            bg-gradient-to-r ${getRiskColor(result.riskTier)}
            ${getRiskBorder(result.riskTier)}
            ${isHovered ? 'scale-105 shadow-xl' : 'shadow-md'}
            ${result.riskTier === 'critical' ? 'animate-pulse-slow' : ''}
          `}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-bold text-white text-lg">{result.championName}</span>
            <span className="text-2xl font-black text-white">{Math.round(result.pts)}</span>
          </div>
          <p className="text-xs text-white/90 leading-tight">{result.explanation}</p>
        </div>

        <AnimatePresence>
          {isHovered && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute z-50 left-0 right-0 top-full mt-2 p-3 bg-slate-900 border-2 border-yellow-400 rounded-lg shadow-2xl"
            >
              <p className="text-xs font-bold text-yellow-400 mb-1">IF WE SKIP THIS PICK:</p>
              <p className="text-xs text-white leading-relaxed">
                {getSkipConsequence(result)}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  const getSkipConsequence = (result: PTSResult) => {
    const { severityBreakdown } = result;

    if (severityBreakdown.roleCollapse > 0.3) {
      return `Opponent likely secures ${result.championName}, forcing us into suboptimal role coverage. Our draft flexibility drops significantly.`;
    }

    if (severityBreakdown.compositionLock > 0.3) {
      return `Losing ${result.championName} locks us into a predictable composition. Opponent gains draft read advantage.`;
    }

    if (severityBreakdown.strategicDenial > 0.2) {
      return `${result.championName} is a key win condition enabler. Skipping allows opponent to deny our strategic options.`;
    }

    return `Delaying this pick reduces our draft priority pool. Next available options are lower tier.`;
  };

  if (topFive.length === 0) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl border-2 border-purple-500/50 p-4 shadow-2xl">
      {/* Draft Context */}
      <div className="mb-4 pb-3 border-b border-slate-700">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-sm font-bold ${
              ourSide === 'blue' ? 'bg-blue-600 text-white' : 'bg-red-600 text-white'
            }`}>
              {ourSide.toUpperCase()} SIDE
            </span>
            <span className="text-white font-bold text-lg">{currentTurn}</span>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Next opponent actions: <span className="text-orange-400 font-semibold">{nextOpponentActions}</span>
        </p>
      </div>

      {/* Risk Tiers */}
      <div className="space-y-3">
        {critical.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              <h3 className="text-red-400 font-black text-sm uppercase tracking-wider">
                CRITICAL — Must Act Now
              </h3>
            </div>
            <div className="space-y-2">
              {critical.map(renderChampion)}
            </div>
          </div>
        )}

        {high.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
              <h3 className="text-orange-400 font-bold text-sm uppercase tracking-wider">
                HIGH RISK
              </h3>
            </div>
            <div className="space-y-2">
              {high.map(renderChampion)}
            </div>
          </div>
        )}

        {safe.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 bg-slate-500 rounded-full"></div>
              <h3 className="text-slate-400 font-bold text-sm uppercase tracking-wider">
                SAFE TO DELAY
              </h3>
            </div>
            <div className="space-y-2">
              {safe.map(renderChampion)}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-700">
        <p className="text-[10px] text-slate-500 text-center">
          Hover over champions to see skip consequences
        </p>
      </div>
    </div>
  );
}
