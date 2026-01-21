'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { AIControlMode, AIRecommendation } from '../lib/types';

interface AIControlPanelProps {
  aiMode: AIControlMode;
  onModeChange: (mode: AIControlMode) => void;
  isThinking: boolean;
  currentTeam: 'blue' | 'red';
  recommendation: AIRecommendation | null;
  autoPlay: boolean;
  onAutoPlayChange: (autoPlay: boolean) => void;
  userSide: 'blue' | 'red';
  onUserSideChange: (side: 'blue' | 'red') => void;
}

export default function AIControlPanel({
  aiMode,
  onModeChange,
  isThinking,
  currentTeam,
  recommendation,
  autoPlay,
  onAutoPlayChange,
  userSide,
  onUserSideChange,
}: AIControlPanelProps) {
  // Only show when it's opponent's turn and there's something to display
  if (currentTeam === userSide) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-indigo-900/20 via-purple-900/20 to-slate-900/20 rounded-2xl p-4 sm:p-5 border border-indigo-500/20 mb-4 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h3 className="text-white font-bold text-xs sm:text-sm tracking-wider uppercase">Opponent Simulation</h3>
      </div>

      {/* AI Recommendation Display */}
      <div className="bg-slate-900/50 rounded-xl p-3 sm:p-4 border border-indigo-500/20">
        {isThinking ? (
          <div className="flex items-center gap-3 text-indigo-300">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full"
            />
            <span className="text-sm">Simulating opponent decision...</span>
          </div>
        ) : recommendation ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-indigo-300 text-xs font-medium uppercase tracking-wider">Opponent Likely Move:</span>
              <span className="text-[10px] text-gray-500">Confidence: {recommendation.score}%</span>
            </div>
            <div className="text-white font-bold text-base">{recommendation.champion}</div>
            <div className="text-xs text-gray-400">{recommendation.reason}</div>
            {recommendation.pts !== undefined && (
              <div className="flex items-center gap-2 text-xs pt-2 border-t border-slate-700/50">
                <span className="text-cyan-400 font-semibold">PTS: {recommendation.pts.toFixed(1)}</span>
                {recommendation.riskTier && (
                  <span className={`px-2 py-1 rounded-full font-medium text-[10px] ${
                    recommendation.riskTier === 'critical' ? 'bg-red-500/20 text-red-300' :
                    recommendation.riskTier === 'high' ? 'bg-orange-500/20 text-orange-300' :
                    recommendation.riskTier === 'moderate' ? 'bg-yellow-500/20 text-yellow-300' :
                    'bg-green-500/20 text-green-300'
                  }`}>
                    {recommendation.riskTier.toUpperCase()}
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-gray-400 text-sm">Waiting for opponent turn...</div>
        )}
      </div>
    </div>
  );
}
