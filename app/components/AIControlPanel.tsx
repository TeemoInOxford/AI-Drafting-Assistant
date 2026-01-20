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
  return (
    <div className="bg-gradient-to-br from-indigo-900/20 via-purple-900/20 to-slate-900/20 rounded-2xl p-4 sm:p-5 border border-indigo-500/20 mb-4 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h3 className="text-white font-bold text-xs sm:text-sm tracking-wider uppercase">Draft Intelligence</h3>
      </div>

      {/* User Side Selection */}
      <div className="bg-slate-900/50 rounded-xl p-3 border border-indigo-500/20 mb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400 uppercase tracking-wider">Your Team</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onUserSideChange('blue')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide transition-all duration-300 ${
              userSide === 'blue'
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-[0_0_12px_rgba(59,130,246,0.4)]'
                : 'bg-slate-800/50 text-gray-400 border border-slate-700 hover:bg-slate-700/70 hover:text-blue-300'
            }`}
          >
            Blue Side
          </button>
          <button
            onClick={() => onUserSideChange('red')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide transition-all duration-300 ${
              userSide === 'red'
                ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-[0_0_12px_rgba(239,68,68,0.4)]'
                : 'bg-slate-800/50 text-gray-400 border border-slate-700 hover:bg-slate-700/70 hover:text-red-300'
            }`}
          >
            Red Side
          </button>
        </div>
      </div>

      {/* Auto-execute Toggle */}
      <div className="bg-slate-900/50 rounded-xl p-3 border border-indigo-500/20 mb-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-white mb-0.5">Auto-execute Opponent Moves</div>
            <div className="text-[10px] text-gray-500">AI automatically plays opponent turns</div>
          </div>
          <div
            className={`w-11 h-6 rounded-full transition-all duration-300 cursor-pointer ${autoPlay ? 'bg-gradient-to-r from-indigo-500 to-purple-500 shadow-[0_0_8px_rgba(99,102,241,0.4)]' : 'bg-slate-700'}`}
            onClick={() => onAutoPlayChange(!autoPlay)}
          >
            <motion.div
              className="w-5 h-5 bg-white rounded-full mt-0.5 shadow-lg"
              animate={{ marginLeft: autoPlay ? '22px' : '2px' }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </div>
        </div>
      </div>

      {/* AI Recommendation Display */}
      {currentTeam !== userSide && (
        <div className="bg-slate-900/50 rounded-xl p-3 sm:p-4 border border-indigo-500/20 mb-3">
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
      )}

      {/* Coach Reminder */}
      {currentTeam === userSide && (
        <div className="bg-indigo-500/10 rounded-xl p-3 border border-indigo-500/30">
          <div className="text-xs text-indigo-300 font-medium">
            Your turn - Make your decision
          </div>
          <div className="text-[10px] text-gray-400 mt-1">
            AI provides analysis, but final decision is yours
          </div>
        </div>
      )}
    </div>
  );
}
