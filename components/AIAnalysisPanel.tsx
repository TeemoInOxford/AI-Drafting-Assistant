'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Language, AIAnalysis, Team, ActionType } from '../lib/types';

interface AIAnalysisPanelProps {
  language: Language;
  analysis: AIAnalysis | null;
  isThinking: boolean;
  currentTeam: Team;
  currentAction: ActionType;
  isAIEnabled: boolean;
}

export default function AIAnalysisPanel({
  language,
  analysis,
  isThinking,
  currentTeam,
  currentAction,
  isAIEnabled,
}: AIAnalysisPanelProps) {
  if (!isAIEnabled) return null;

  const actionText = {
    ban: { zh: 'Ban', en: 'Ban' },
    pick: { zh: 'Pick', en: 'Pick' },
  };

  const teamText = {
    blue: { zh: '蓝方', en: 'Blue' },
    red: { zh: '红方', en: 'Red' },
  };

  return (
    <div className="bg-gradient-to-br from-slate-900/80 to-slate-800/80 rounded-xl border border-slate-600/30 overflow-hidden">
      {/* 标题栏 */}
      <div className="bg-gradient-to-r from-purple-600/30 to-blue-600/30 px-4 py-3 border-b border-slate-600/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🧠</span>
            <h3 className="text-white font-bold">
              {language === 'zh' ? 'AI 分析助手' : 'AI Draft Assistant'}
            </h3>
          </div>
          {analysis && (
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">
                {language === 'zh' ? '当前预测胜率' : 'Predicted Win Rate'}:
              </span>
              <span className={`text-lg font-bold ${
                analysis.currentWinRate >= 55 ? 'text-green-400' :
                analysis.currentWinRate >= 45 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {analysis.currentWinRate}%
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="p-4">
        {/* 思考状态 */}
        <AnimatePresence>
          {isThinking && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center gap-3 py-8"
            >
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-3 h-3 bg-purple-400 rounded-full"
                    animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.2 }}
                  />
                ))}
              </div>
              <span className="text-purple-300">
                {language === 'zh' ? 'AI 正在分析最佳选择...' : 'AI analyzing optimal choices...'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 分析结果 */}
        {!isThinking && analysis && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* 当前回合信息 */}
            <div className="text-center text-sm text-gray-400 mb-4">
              {language === 'zh'
                ? `推荐 ${teamText[currentTeam].zh} ${actionText[currentAction].zh}`
                : `Recommended ${teamText[currentTeam].en} ${actionText[currentAction].en}`}
            </div>

            {/* 推荐列表 */}
            <div className="space-y-2">
              {analysis.recommendations.map((rec, index) => (
                <motion.div
                  key={rec.champion}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`
                    flex items-center gap-3 p-3 rounded-lg
                    ${index === 0
                      ? 'bg-gradient-to-r from-green-900/40 to-emerald-900/40 border border-green-500/30'
                      : 'bg-white/5 border border-white/10'}
                  `}
                >
                  {/* 排名 */}
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                    ${index === 0 ? 'bg-green-500 text-white' :
                      index === 1 ? 'bg-gray-500 text-white' :
                      index === 2 ? 'bg-amber-700 text-white' :
                      'bg-gray-700 text-gray-300'}
                  `}>
                    {index + 1}
                  </div>

                  {/* 英雄名称和理由 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${index === 0 ? 'text-green-300' : 'text-white'}`}>
                        {rec.champion}
                      </span>
                      {index === 0 && (
                        <span className="text-xs bg-green-500/30 text-green-300 px-2 py-0.5 rounded">
                          {language === 'zh' ? '最佳' : 'BEST'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1 truncate">
                      {rec.reason}
                    </p>
                  </div>

                  {/* 胜率 */}
                  <div className="text-right">
                    <div className={`text-lg font-bold ${
                      rec.winRate && rec.winRate >= 55 ? 'text-green-400' :
                      rec.winRate && rec.winRate >= 50 ? 'text-yellow-400' : 'text-orange-400'
                    }`}>
                      {rec.winRate}%
                    </div>
                    <div className="text-xs text-gray-500">
                      {language === 'zh' ? '预测胜率' : 'Win Rate'}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* 警告信息 */}
            {analysis.warnings.length > 0 && (
              <div className="space-y-2 mt-4">
                <h4 className="text-sm font-bold text-yellow-400 flex items-center gap-2">
                  <span>⚠️</span>
                  {language === 'zh' ? '警告' : 'Warnings'}
                </h4>
                {analysis.warnings.map((warning, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 + index * 0.1 }}
                    className={`
                      text-sm p-2 rounded-lg
                      ${warning.type === 'danger' ? 'bg-red-900/30 text-red-300 border border-red-500/30' :
                        warning.type === 'warning' ? 'bg-yellow-900/30 text-yellow-300 border border-yellow-500/30' :
                        'bg-blue-900/30 text-blue-300 border border-blue-500/30'}
                    `}
                  >
                    {warning.message}
                  </motion.div>
                ))}
              </div>
            )}

            {/* 洞察信息 */}
            {analysis.insights.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <h4 className="text-sm font-bold text-blue-400 flex items-center gap-2 mb-2">
                  <span>💡</span>
                  {language === 'zh' ? '洞察' : 'Insights'}
                </h4>
                <ul className="text-xs text-gray-400 space-y-1">
                  {analysis.insights.map((insight, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-blue-400">•</span>
                      {insight}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}

        {/* 未启用AI时的提示 */}
        {!isThinking && !analysis && (
          <div className="text-center py-8 text-gray-500">
            <p>{language === 'zh' ? '选择AI模式开始分析' : 'Select AI mode to start analysis'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
