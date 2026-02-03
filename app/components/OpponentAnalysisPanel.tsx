/**
 * 对手分析面板 - 显示博弈论推断的对手类型和信念分布
 */

'use client';

import { motion } from 'framer-motion';
import { GameTheoryState, OpponentType } from '../lib/hybrid-game-theory';
import { useMemo } from 'react';

interface OpponentAnalysisPanelProps {
  gameState: GameTheoryState;
}

// 五边形雷达图组件
function PentagonRadarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const size = 320;
  const center = size / 2;
  const maxRadius = size / 2 - 35;

  // 计算五边形的顶点坐标
  const getPoint = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / 5 - Math.PI / 2; // 从顶部开始
    const radius = maxRadius * value;
    return {
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle),
    };
  };

  // 生成背景网格线（5层）
  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0];
  const gridPaths = gridLevels.map(level => {
    const points = Array.from({ length: 5 }, (_, i) => getPoint(i, level));
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
  });

  // 生成数据多边形路径
  const dataPoints = data.map((d, i) => getPoint(i, d.value));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  // 标签位置
  const labelPoints = data.map((d, i) => {
    const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    const labelRadius = maxRadius + 15;
    return {
      x: center + labelRadius * Math.cos(angle),
      y: center + labelRadius * Math.sin(angle),
      label: d.label,
      color: d.color,
    };
  });

  return (
    <div className="flex justify-center">
      <svg width={size} height={size} className="overflow-visible">
        {/* 背景网格 */}
        {gridPaths.map((path, i) => (
          <path
            key={i}
            d={path}
            fill="none"
            stroke="rgb(71, 85, 105)"
            strokeWidth="1"
            opacity={0.3}
          />
        ))}

        {/* 从中心到顶点的线 */}
        {Array.from({ length: 5 }).map((_, i) => {
          const point = getPoint(i, 1);
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={point.x}
              y2={point.y}
              stroke="rgb(71, 85, 105)"
              strokeWidth="1"
              opacity={0.3}
            />
          );
        })}

        {/* 数据区域 */}
        <motion.path
          d={dataPath}
          fill="rgba(34, 211, 238, 0.2)"
          stroke="rgb(34, 211, 238)"
          strokeWidth="2"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        />

        {/* 数据点 */}
        {dataPoints.map((point, i) => (
          <motion.circle
            key={i}
            cx={point.x}
            cy={point.y}
            r="4"
            fill={data[i].color}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
          />
        ))}

        {/* 标签 */}
        {labelPoints.map((point, i) => (
          <text
            key={i}
            x={point.x}
            y={point.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-xs font-medium"
            fill={point.color}
          >
            {point.label}
          </text>
        ))}
      </svg>
    </div>
  );
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
        <h3 className="text-base font-bold text-cyan-400">对手特征分析</h3>
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

          {/* Belief Distribution - 五边形雷达图展示 */}
          <div>
            <div className="text-xs font-medium text-slate-300 mb-3 text-center">特征维度分析</div>
            <PentagonRadarChart
              data={Object.entries(gameState.belief)
                .filter(([type]) => type !== 'unknown')
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([type, prob]) => {
                  const info = OPPONENT_TYPE_INFO[type as OpponentType];
                  // 颜色映射
                  const colorMap: Record<string, string> = {
                    'text-rose-400': 'rgb(251, 113, 133)',
                    'text-blue-400': 'rgb(96, 165, 250)',
                    'text-purple-400': 'rgb(192, 132, 252)',
                    'text-orange-400': 'rgb(251, 146, 60)',
                    'text-cyan-400': 'rgb(34, 211, 238)',
                    'text-slate-400': 'rgb(148, 163, 184)',
                  };
                  return {
                    label: info.name,
                    value: prob,
                    color: colorMap[info.color] || 'rgb(148, 163, 184)',
                  };
                })}
            />
            {/* 图例说明 */}
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              {Object.entries(gameState.belief)
                .filter(([type]) => type !== 'unknown')
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([type, prob]) => {
                  const info = OPPONENT_TYPE_INFO[type as OpponentType];
                  const percentage = prob * 100;
                  const isTop = type === gameState.predictedType;

                  return (
                    <div key={type} className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        {isTop && <span className="text-cyan-400 text-xs">★</span>}
                        <span className={`font-medium ${info.color}`}>{info.name}</span>
                      </div>
                      <span className={`font-bold ${isTop ? 'text-cyan-400' : 'text-slate-500'}`}>
                        {percentage.toFixed(1)}%
                      </span>
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
