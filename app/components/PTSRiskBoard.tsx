'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { PTSResult, Champion, Position, BPState, BPStep } from '../lib/types';
import { generateDetailedRecommendation } from '../lib/stage-aware-recommendation';
import { generateDetailedRecommendationZh } from '../lib/stage-aware-recommendation-zh';

interface PTSRiskBoardProps {
  ptsResults: PTSResult[];
  currentTurn: string;
  ourSide: 'blue' | 'red';
  nextOpponentActions: string;
  onChampionClick?: (championId: string) => void;
  isUserTurn?: boolean;
  blueTeamName?: string;
  redTeamName?: string;
  bluePicks?: (Champion | null)[];
  redPicks?: (Champion | null)[];
  champions?: Champion[];
  bpState?: BPState;
  currentStep?: BPStep | null;
}

export default function PTSRiskBoard({
  ptsResults,
  currentTurn,
  ourSide,
  nextOpponentActions,
  onChampionClick,
  isUserTurn = false,
  blueTeamName,
  redTeamName,
  bluePicks = [],
  redPicks = [],
  champions = [],
  bpState,
  currentStep,
}: PTSRiskBoardProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (ptsResults.length === 0 || !bpState || !currentStep) {
    return null;
  }

  // Get top 3 recommendations
  const top3 = ptsResults.slice(0, 3);

  // Get our picks and enemy picks based on our side
  const ourPicks = ourSide === 'blue' ? bluePicks : redPicks;
  const enemyPicks = ourSide === 'blue' ? redPicks : bluePicks;

  // 职业中文映射
  const classNamesZh: Record<string, string> = {
    'Tank': '坦克',
    'Fighter': '战士',
    'Assassin': '刺客',
    'Mage': '法师',
    'Marksman': '射手',
    'Support': '辅助',
    'Controller': '控制',
  };

  // 风险等级中文映射
  const riskTierZh: Record<string, string> = {
    'critical': '紧急',
    'high': '高',
    'moderate': '中等',
    'low': '低',
  };

  const Divider = () => (
    <div className="border-t border-slate-700/30 my-2" />
  );

  return (
    <div className="relative rounded-lg border p-3 shadow-lg transition-all duration-300 bg-slate-900/40 backdrop-blur-md border-white/5">
      {/* Title Badge - Top Center */}
      <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-slate-800/80 border border-slate-600/30 rounded">
        <span className="text-[8px] font-bold text-slate-400 tracking-wider">AI 推荐</span>
      </div>

      {/* Current Turn Bar */}
      <div className="mb-3 pt-2">
        <div className="flex items-center justify-center gap-2">
          <span className="font-medium text-xs text-slate-400">
            {ourSide === 'blue'
              ? (blueTeamName || '蓝色方')
              : (redTeamName || '红色方')
            }
          </span>
          <span className="text-slate-500">•</span>
          <span className="text-slate-300 font-medium text-sm">{currentTurn}</span>
        </div>
      </div>

      {/* Top 3 Recommendations */}
      <div className="space-y-3">
        {top3.map((result, index) => {
          // Find the champion object
          const champion = champions.find(c => c.id === result.championId);
          if (!champion) return null;

          // Generate detailed recommendation (Chinese version)
          const detailedReason = result.detailedReason || generateDetailedRecommendationZh(
            champion,
            result,
            bpState,
            currentStep,
            ourPicks,
            enemyPicks
          );

          const isExpanded = expandedIndex === index;

          // Parse the detailed reason into sections
          const sections = detailedReason.split('\n\n').filter(s => s.trim());

          return (
            <motion.div
              key={result.championId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-slate-800/30 rounded-lg border border-slate-700/30 overflow-hidden"
            >
              {/* Champion Header - Always Visible */}
              <div
                onClick={() => setExpandedIndex(isExpanded ? null : index)}
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30">
                    <span className="text-cyan-400 font-bold text-sm">#{index + 1}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold text-sm">{result.championName}</span>
                      {result.isFlex && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          摇摆
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-slate-400">
                        {champion.tags.map(tag => classNamesZh[tag] || tag).join(' • ')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    {/* 根据阶段显示不同的等级 */}
                    {currentStep.action === 'ban' ? (
                      <>
                        <div className={`font-bold text-sm ${
                          result.threatLevel === '高' ? 'text-rose-400' :
                          result.threatLevel === '中' ? 'text-orange-400' :
                          'text-slate-400'
                        }`}>
                          威胁度：{result.threatLevel || '中'}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {result.threatLevel === '高' ? '建议优先Ban' :
                           result.threatLevel === '中' ? '可考虑Ban' :
                           '威胁较低'}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className={`font-bold text-sm ${
                          result.recommendLevel === '高' ? 'text-cyan-400' :
                          result.recommendLevel === '中' ? 'text-blue-400' :
                          'text-slate-400'
                        }`}>
                          推荐度：{result.recommendLevel || '中'}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {result.recommendLevel === '高' ? '强烈推荐' :
                           result.recommendLevel === '中' ? '可选择' :
                           '备选方案'}
                        </div>
                      </>
                    )}
                  </div>
                  <svg
                    className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Detailed Recommendation - Expandable */}
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="border-t border-slate-700/30"
                >
                  <div className="p-3 space-y-2 text-xs">
                    {/* 显示详细推荐理由 */}
                    <div className="bg-slate-900/50 rounded p-2.5 border border-slate-700/30">
                      <h4 className="font-bold text-[10px] uppercase tracking-wider mb-2 text-cyan-400">
                        {currentStep.action === 'ban' ? '📊 Ban理由分析' : '✨ 推荐理由分析'}
                      </h4>
                      <div className="space-y-1.5">
                        {detailedReason.split('；').map((reason, idx) => {
                          // 提取指标类型
                          const match = reason.match(/^([^：]+)：(.+)$/);
                          if (match) {
                            const [, indicator, content] = match;
                            // 根据指标类型设置颜色
                            let indicatorColor = 'text-slate-300';
                            if (indicator.includes('对手英雄池')) indicatorColor = 'text-rose-400';
                            else if (indicator.includes('版本强度')) indicatorColor = 'text-purple-400';
                            else if (indicator.includes('位置')) indicatorColor = 'text-orange-400';
                            else if (indicator.includes('阵容')) indicatorColor = 'text-green-400';
                            else if (indicator.includes('博弈')) indicatorColor = 'text-cyan-400';
                            else if (indicator.includes('针对')) indicatorColor = 'text-yellow-400';
                            else if (indicator.includes('协同')) indicatorColor = 'text-blue-400';
                            else if (indicator.includes('摇摆')) indicatorColor = 'text-pink-400';

                            return (
                              <div key={idx} className="flex items-start gap-2">
                                <span className="text-slate-500 mt-0.5">•</span>
                                <div className="flex-1">
                                  <span className={`font-semibold ${indicatorColor}`}>{indicator}</span>
                                  <span className="text-slate-300">：{content}</span>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div key={idx} className="flex items-start gap-2">
                              <span className="text-slate-500 mt-0.5">•</span>
                              <span className="text-slate-300">{reason}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 如果有原始的详细分析，也显示 */}
                    {sections.length > 0 && sections[0] !== detailedReason && (
                      <>
                        <Divider />
                        {sections.map((section, sectionIndex) => {
                          const lines = section.split('\n');
                          const title = lines[0].replace(/\*\*/g, '').replace('：', '').trim();
                          const content = lines.slice(1).join('\n').trim();

                          // Determine color based on section title
                          let titleColor = 'text-slate-300';
                          if (title.includes('阶段分析')) titleColor = 'text-blue-400';
                          else if (title.includes('职业协同')) titleColor = 'text-green-400';
                          else if (title.includes('职业康特')) titleColor = 'text-orange-400';
                          else if (title.includes('紧急程度')) titleColor = 'text-rose-400';
                          else if (title.includes('风险评估')) titleColor = 'text-yellow-400';

                          return (
                            <div key={sectionIndex}>
                              <h4 className={`font-bold text-[10px] uppercase tracking-wider mb-1.5 ${titleColor}`}>
                                {title}
                              </h4>
                              <p className="text-slate-300 text-[11px] leading-relaxed whitespace-pre-wrap">
                                {content}
                              </p>
                            </div>
                          );
                        })}
                      </>
                    )}

                    {/* Action Button */}
                    <div className="pt-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onChampionClick?.(result.championId);
                        }}
                        className="w-full py-2 px-3 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded text-cyan-400 font-medium text-xs transition-colors"
                      >
                        选择 {result.championName}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-3">
        <Divider />
        {isUserTurn ? (
          <div className="bg-indigo-500/10 rounded-lg p-2.5 border border-indigo-500/30">
            <div className="text-xs text-indigo-300 font-medium">
              轮到你了 — 点击展开详情
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">
              AI 提供阶段感知分析。最终决定权在你。
            </div>
          </div>
        ) : (
          <p className="text-[10px] text-slate-500 text-center">
            等待对手...
          </p>
        )}
      </div>
    </div>
  );
}
