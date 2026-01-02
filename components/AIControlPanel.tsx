'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Language, AIControlMode, AIRecommendation } from '../lib/types';

interface AIControlPanelProps {
  language: Language;
  aiMode: AIControlMode;
  onModeChange: (mode: AIControlMode) => void;
  isThinking: boolean;
  currentTeam: 'blue' | 'red';
  recommendation: AIRecommendation | null;
  autoPlay: boolean;
  onAutoPlayChange: (autoPlay: boolean) => void;
}

export default function AIControlPanel({
  language,
  aiMode,
  onModeChange,
  isThinking,
  currentTeam,
  recommendation,
  autoPlay,
  onAutoPlayChange,
}: AIControlPanelProps) {
  const modes: { id: AIControlMode; label: { zh: string; en: string }; desc: { zh: string; en: string } }[] = [
    {
      id: 'off',
      label: { zh: '手动模式', en: 'Manual' },
      desc: { zh: '双方都由玩家控制', en: 'Both sides controlled by player' }
    },
    {
      id: 'blue',
      label: { zh: 'AI 蓝方', en: 'AI Blue' },
      desc: { zh: 'AI控制蓝方，你控制红方', en: 'AI controls Blue, you control Red' }
    },
    {
      id: 'red',
      label: { zh: 'AI 红方', en: 'AI Red' },
      desc: { zh: 'AI控制红方，你控制蓝方', en: 'AI controls Red, you control Blue' }
    },
    {
      id: 'both',
      label: { zh: 'AI 对战', en: 'AI vs AI' },
      desc: { zh: 'AI控制双方自动对战', en: 'AI controls both sides' }
    },
  ];

  const isAITurn =
    (aiMode === 'blue' && currentTeam === 'blue') ||
    (aiMode === 'red' && currentTeam === 'red') ||
    aiMode === 'both';

  return (
    <div className="bg-gradient-to-br from-purple-900/30 to-blue-900/30 rounded-xl p-3 sm:p-4 border border-purple-500/30 mb-4">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <h3 className="text-white font-bold text-sm sm:text-base">
            {language === 'zh' ? 'AI 模式' : 'AI Mode'}
          </h3>
        </div>

        {/* Auto Play 开关 */}
        {aiMode !== 'off' && (
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs sm:text-sm text-gray-400">
              {language === 'zh' ? '自动执行' : 'Auto Play'}
            </span>
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

      {/* 模式选择按钮 */}
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
                ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/30'
                : 'bg-white/10 text-gray-300 hover:bg-white/20'}
            `}
          >
            {mode.label[language]}
          </motion.button>
        ))}
      </div>

      {/* 当前模式描述 */}
      <p className="text-xs text-gray-400 text-center mb-3">
        {modes.find(m => m.id === aiMode)?.desc[language]}
      </p>

      {/* AI 思考状态 */}
      <AnimatePresence>
        {isThinking && isAITurn && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-black/30 rounded-lg p-3 mb-2"
          >
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                <motion.div
                  className="w-2 h-2 bg-purple-400 rounded-full"
                  animate={{ scale: [1, 1.5, 1] }}
                  transition={{ repeat: Infinity, duration: 0.6, delay: 0 }}
                />
                <motion.div
                  className="w-2 h-2 bg-purple-400 rounded-full"
                  animate={{ scale: [1, 1.5, 1] }}
                  transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }}
                />
                <motion.div
                  className="w-2 h-2 bg-purple-400 rounded-full"
                  animate={{ scale: [1, 1.5, 1] }}
                  transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }}
                />
              </div>
              <span className="text-purple-300 text-sm">
                {language === 'zh' ? 'AI 正在分析...' : 'AI is analyzing...'}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI 推荐结果 */}
      <AnimatePresence>
        {recommendation && isAITurn && !isThinking && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-gradient-to-r from-green-900/40 to-emerald-900/40 rounded-lg p-3 border border-green-500/30"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-green-400 font-bold">
                    {recommendation.champion}
                  </span>
                  {recommendation.winRate && (
                    <span className="text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded">
                      {recommendation.winRate}% {language === 'zh' ? '胜率' : 'WR'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {recommendation.reason}
                </p>
              </div>
              <div className="text-2xl">✓</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 当前回合指示 */}
      {aiMode !== 'off' && (
        <div className="mt-3 flex items-center justify-center gap-2 text-sm">
          <span className={`w-3 h-3 rounded-full ${currentTeam === 'blue' ? 'bg-blue-500' : 'bg-red-500'}`} />
          <span className="text-gray-300">
            {language === 'zh'
              ? `当前: ${currentTeam === 'blue' ? '蓝方' : '红方'} ${isAITurn ? '(AI)' : '(玩家)'}`
              : `Current: ${currentTeam === 'blue' ? 'Blue' : 'Red'} ${isAITurn ? '(AI)' : '(Player)'}`
            }
          </span>
        </div>
      )}
    </div>
  );
}
