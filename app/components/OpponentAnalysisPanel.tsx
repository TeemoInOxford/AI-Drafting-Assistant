/**
 * 对手分析面板 - 显示博弈论推断的对手类型和信念分布
 */

'use client';

import { motion } from 'framer-motion';
import { GameTheoryState, OpponentType } from '../lib/hybrid-game-theory';

interface OpponentAnalysisPanelProps {
  gameState: GameTheoryState;
}

// 对手类型中文名称和描述
const OPPONENT_TYPE_INFO: Record<OpponentType, { name: string; desc: string; color: string }> = {
  aggressive: {
    name: '激进型',
    desc: '偏好高伤害carry英雄',
    color: 'text-rose-400',
  },
  defensive: {
    name: '防守型',
    desc: '偏好坦克和辅助',
    color: 'text-blue-400',
  },
  meta_follower: {
    name: 'Meta型',
    desc: '严格按版本强度选择',
    color: 'text-purple-400',
  },
  counter_focused: {
    name: '针对型',
    desc: '喜欢counter对手',
    color: 'text-orange-400',
  },
  flex_master: {
    name: '摇摆型',
    desc: '偏好多位置英雄',
    color: 'text-cyan-400',
  },
  unknown: {
    name: '未知',
    desc: '观察中...',
    color: 'text-slate-400',
  },
};

export default function OpponentAnalysisPanel({
  gameState,
}: OpponentAnalysisPanelProps) {
  const typeInfo = OPPONENT_TYPE_INFO[gameState.predictedType];
  const showAnalysis = gameState.confidence > 0.3;

  return (
    <div className="bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-lg p-4 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-cyan-400">博弈论分析</h3>
        <div className="px-2 py-1 rounded text-xs font-medium bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
          已启用
        </div>
      </div>

      {!showAnalysis && (
        <p className="text-xs text-slate-500 text-center py-2">
          观察对手行为中...（已观察 {gameState.observedActions.length} 次）
        </p>
      )}

      {showAnalysis && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Predicted Type - 更突出的展示 */}
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-800/40 rounded-lg p-3 border border-cyan-500/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400">对手类型识别</span>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
                <span className="text-xs font-bold text-cyan-400">
                  {(gameState.confidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-lg font-bold ${typeInfo.color}`}>
                {typeInfo.name}
              </span>
              <span className="text-sm text-slate-400">{typeInfo.desc}</span>
            </div>
          </div>

          {/* 五维特征说明 */}
          <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
            <div className="text-xs font-medium text-slate-300 mb-2">五维特征分析</div>
            <div className="grid grid-cols-1 gap-2 text-xs">
              <div className="flex items-start gap-2">
                <span className="text-cyan-400 font-medium min-w-[60px]">PTS威胁</span>
                <span className="text-slate-400">基础威胁评分，数据驱动</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-purple-400 font-medium min-w-[60px]">风格匹配</span>
                <span className="text-slate-400">针对对手类型的克制度</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-orange-400 font-medium min-w-[60px]">位置紧迫</span>
                <span className="text-slate-400">剩余位置的填补需求</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-rose-400 font-medium min-w-[60px]">风险规避</span>
                <span className="text-slate-400">阵容平衡与稳定性</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-400 font-medium min-w-[60px]">Meta强度</span>
                <span className="text-slate-400">版本热度与全局出现率</span>
              </div>
            </div>
          </div>

          {/* Belief Distribution - 优化展示 */}
          <div>
            <div className="text-xs font-medium text-slate-300 mb-3">类型概率分布</div>
            <div className="space-y-2">
              {Object.entries(gameState.belief)
                .filter(([type]) => type !== 'unknown')
                .sort(([, a], [, b]) => b - a)
                .map(([type, prob]) => {
                  const info = OPPONENT_TYPE_INFO[type as OpponentType];
                  const percentage = prob * 100;
                  const isTop = type === gameState.predictedType;

                  return (
                    <div key={type} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          {isTop && <span className="text-cyan-400">★</span>}
                          <span className={`font-medium ${info.color}`}>{info.name}</span>
                        </div>
                        <span className={`font-bold ${isTop ? 'text-cyan-400' : 'text-slate-500'}`}>
                          {percentage.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 0.5, ease: "easeOut" }}
                          className={`h-full ${
                            isTop
                              ? 'bg-gradient-to-r from-cyan-500 via-blue-500 to-cyan-500'
                              : 'bg-slate-600'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Observations - 更详细的统计 */}
          <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-700/30">
            <span className="text-slate-500">已观察行为</span>
            <span className="font-bold text-cyan-400">{gameState.observedActions.length} 次</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}
