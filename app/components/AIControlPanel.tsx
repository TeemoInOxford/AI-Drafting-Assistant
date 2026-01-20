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
}

export default function AIControlPanel({
  aiMode,
  onModeChange,
  isThinking,
  currentTeam,
  recommendation,
  autoPlay,
  onAutoPlayChange,
}: AIControlPanelProps) {
  const modes: { id: AIControlMode; label: string; desc: string }[] = [
    {
      id: 'off',
      label: 'Manual',
      desc: 'Both sides controlled by player'
    },
    {
      id: 'blue',
      label: 'AI Blue',
      desc: 'AI controls Blue, you control Red'
    },
    {
      id: 'red',
      label: 'AI Red',
      desc: 'AI controls Red, you control Blue'
    },
    {
      id: 'both',
      label: 'AI vs AI',
      desc: 'AI controls both sides'
    },
  ];

  const isAITurn =
    (aiMode === 'blue' && currentTeam === 'blue') ||
    (aiMode === 'red' && currentTeam === 'red') ||
    aiMode === 'both';

  return (
    <div className="bg-gradient-to-br from-purple-900/30 to-blue-900/30 rounded-xl p-3 sm:p-4 border border-purple-500/30 mb-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <h3 className="text-white font-bold text-sm sm:text-base">AI Mode</h3>
        </div>

        {aiMode !== 'off' && (
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs sm:text-sm text-gray-400">Auto Play</span>
            <div
              className={`w-10 h-5 rounded-full transition-colors ${autoPlay ? 'bg-green-500' : 'bg-gray-600'}`}
              onClick={() => onAutoPlayChange(!autoPlay)}
            >
              <motion.div
                className="w-4 h-4 bg-white rounded-full mt-0.5"
                animate={{ marginLeft: autoPlay ? '22px' : '2px' }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            </div>
          </label>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        {modes.map((mode) => (
          <motion.button
            key={mode.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onModeChange(mode.id)}
            className={`
              px-2 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all
              ${aiMode === mode.id
                ? 'bg-purple-600 text-white border-2 border-purple-400'
                : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'}
            `}
          >
            <div className="font-bold">{mode.label}</div>
            <div className="text-[10px] opacity-70 mt-0.5">{mode.desc}</div>
          </motion.button>
        ))}
      </div>

      <AnimatePresence>
        {isAITurn && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-black/30 rounded-lg p-3 border border-purple-500/20">
              {isThinking ? (
                <div className="flex items-center gap-2 text-purple-300">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    ⚙️
                  </motion.div>
                  <span className="text-sm">AI is thinking...</span>
                </div>
              ) : recommendation ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-purple-300 text-sm font-medium">Recommendation:</span>
                    <span className="text-xs text-gray-400">Score: {recommendation.score}</span>
                  </div>
                  <div className="text-white font-bold">{recommendation.champion}</div>
                  <div className="text-xs text-gray-400">{recommendation.reason}</div>
                  {recommendation.pts !== undefined && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-cyan-400">PTS: {recommendation.pts.toFixed(1)}</span>
                      {recommendation.riskTier && (
                        <span className={`px-2 py-0.5 rounded ${
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
                <div className="text-gray-400 text-sm">Waiting for AI...</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
