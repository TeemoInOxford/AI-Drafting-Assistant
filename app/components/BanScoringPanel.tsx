'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BanScoreResult } from '@/app/lib/advanced-ban-scoring.types';
import { Champion } from '@/app/lib/types';

interface BanScoringPanelProps {
  recommendations: BanScoreResult[];
  onSelectChampion?: (championId: string) => void;
  allChampions: Champion[];
  isLoading?: boolean;
}

export default function BanScoringPanel({
  recommendations,
  onSelectChampion,
  allChampions,
  isLoading = false,
}: BanScoringPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 调试日志
  console.log('[BanScoringPanel] Render:', {
    recommendationsCount: recommendations.length,
    isLoading,
    allChampionsCount: allChampions.length,
    firstRec: recommendations[0],
  });

  // 调试：直接显示原始数据
  if (recommendations.length > 0 && !recommendations[0].championName) {
    console.error('[BanScoringPanel] Invalid recommendation data:', recommendations[0]);
  }

  // 根据优先级分组
  const groupedRecommendations = {
    critical: recommendations.filter(r => r.priority === 'critical'),
    high: recommendations.filter(r => r.priority === 'high'),
    medium: recommendations.filter(r => r.priority === 'medium'),
    low: recommendations.filter(r => r.priority === 'low'),
  };

  // 获取英雄信息
  const getChampion = (championId: string) => {
    return allChampions.find(c => c.id === championId);
  };

  // 优先级颜色
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-500/20 border-red-500 text-red-400';
      case 'high':
        return 'bg-orange-500/20 border-orange-500 text-orange-400';
      case 'medium':
        return 'bg-yellow-500/20 border-yellow-500 text-yellow-400';
      case 'low':
        return 'bg-blue-500/20 border-blue-500 text-blue-400';
      default:
        return 'bg-gray-500/20 border-gray-500 text-gray-400';
    }
  };

  // 优先级标签
  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'critical':
        return '必Ban';
      case 'high':
        return '高优先级';
      case 'medium':
        return '中优先级';
      case 'low':
        return '低优先级';
      default:
        return '';
    }
  };

  // 渲染推荐卡片
  const renderRecommendationCard = (rec: BanScoreResult) => {
    const champion = getChampion(rec.championId);
    if (!champion) return null;

    return (
      <motion.div
        key={rec.championId}
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-2 border-blue-500/30 bg-slate-800/50 rounded-lg p-3"
      >
        <div className="flex items-start gap-3">
          {/* 英雄头像 */}
          <div className="relative w-16 h-16 flex-shrink-0">
            <img
              src={champion.image}
              alt={champion.name}
              className="w-full h-full rounded-lg object-cover"
            />
            <div className="absolute -top-1 -right-1 bg-blue-600 rounded-full px-2 py-0.5 text-xs font-bold">
              {Math.round(rec.finalScore)}
            </div>
          </div>

          {/* 英雄信息和理由 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-base text-white">{champion.name}</h3>
              {onSelectChampion && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectChampion(rec.championId);
                  }}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs font-medium transition-colors"
                >
                  Ban
                </button>
              )}
            </div>

            {/* 推荐理由 */}
            <div className="space-y-2">
              <div>
                <p className="text-sm font-semibold text-blue-400 mb-1">推荐理由:</p>
                <ul className="text-xs space-y-1">
                  {rec.detailedReason.map((reason, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-blue-400 mt-0.5">•</span>
                      <span className="text-gray-300">{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* 关键指标 */}
              <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-gray-700">
                <div>
                  <span className="text-gray-400">胜率: </span>
                  <span className="font-medium text-white">{rec.heroStrength.winRate.toFixed(1)}%</span>
                </div>
                <div>
                  <span className="text-gray-400">Ban率: </span>
                  <span className="font-medium text-white">{rec.heroStrength.banRate.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-gray-400">
        <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm">正在计算 Ban 推荐...</p>
        <p className="text-xs mt-1 text-gray-500">如果长时间未显示，请刷新页面</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Ban 推荐</h2>
        <span className="text-xs text-gray-400">Top 3</span>
      </div>

      {/* 推荐列表 - 只显示前3个 */}
      <div className="space-y-3">
        {recommendations.slice(0, 3).map((rec, index) => (
          <div key={rec.championId}>
            {/* 排名标签 */}
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs font-bold px-2 py-1 rounded ${
                index === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                index === 1 ? 'bg-gray-400/20 text-gray-300' :
                'bg-orange-600/20 text-orange-400'
              }`}>
                #{index + 1}
              </span>
              <span className="text-xs text-gray-500">评分: {Math.round(rec.finalScore)}</span>
            </div>
            {renderRecommendationCard(rec)}
          </div>
        ))}
      </div>
    </div>
  );
}

// 评分条组件
function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 w-20">{label}</span>
      <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
        />
      </div>
      <span className="text-xs font-medium w-8 text-right">{Math.round(score)}</span>
    </div>
  );
}
