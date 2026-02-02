'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface TrainingResults {
  status: string;
  timestamp: string;
  model_info: {
    algorithm: string;
    objective: string;
    n_features: number;
    best_iteration: number;
  };
  metrics: {
    auc: number;
    auc_display: string;
  };
  feature_importance: Array<{
    feature: string;
    importance: number;
  }>;
  dataset_info: {
    total_samples: number;
    counter_cases: number;
    non_counter_cases: number;
    class_balance: number;
  };
}

export default function CounterPage() {
  const [results, setResults] = useState<TrainingResults | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/training_results.json')
      .then(res => res.json())
      .then(data => {
        setResults(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold text-white mb-2">
            Counter Prediction System
          </h1>
          <p className="text-slate-300">
            基于机器学习的英雄克制关系预测系统
          </p>
        </motion.div>

        {/* Design Philosophy */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 mb-6 border border-slate-700"
        >
          <h2 className="text-2xl font-semibold text-white mb-4">🎯 建模思路</h2>
          <div className="space-y-4">
            <div className="bg-slate-700/30 rounded-lg p-4">
              <h3 className="text-lg font-medium text-blue-400 mb-2">问题定义</h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                在LOL的BP阶段，给定当前双方已选英雄，如何量化各个英雄对我方的Counter威胁度？
                这是一个<strong className="text-yellow-400">Counter威胁度量化系统</strong>：输入我方已选英雄和对方已选英雄，输出Top-K个对我方威胁最大的英雄及其威胁度分数。
              </p>
            </div>

            <div className="bg-slate-700/30 rounded-lg p-4">
              <h3 className="text-lg font-medium text-green-400 mb-2">数据来源</h3>
              <p className="text-slate-300 text-sm leading-relaxed mb-2">
                从<strong className="text-blue-400">GRID API</strong>获取职业比赛数据，包含：
              </p>
              <ul className="text-slate-300 text-sm space-y-1 ml-4">
                <li>• 比赛结果（胜/负）</li>
                <li>• 英雄选择和BP顺序</li>
                <li>• 详细统计数据（KDA、伤害、经济、视野等）</li>
                <li>• 当前数据集：<strong className="text-yellow-400">4系列赛，750样本，69个英雄</strong></li>
              </ul>
            </div>

            <div className="bg-slate-700/30 rounded-lg p-4">
              <h3 className="text-lg font-medium text-purple-400 mb-2">特征工程</h3>
              <p className="text-slate-300 text-sm mb-2">
                设计了<strong className="text-yellow-400">30个特征</strong>，分为3大类：
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                <div className="bg-slate-800/50 rounded p-3">
                  <p className="text-blue-400 font-medium text-sm mb-1">阵容特征 (13个)</p>
                  <p className="text-xs text-slate-400">坦克数、刺客数、控制能力、物魔比例等</p>
                </div>
                <div className="bg-slate-800/50 rounded p-3">
                  <p className="text-green-400 font-medium text-sm mb-1">英雄特征 (12个)</p>
                  <p className="text-xs text-slate-400">DPM、KDA、角色标签、特性标签等</p>
                </div>
                <div className="bg-slate-800/50 rounded p-3">
                  <p className="text-purple-400 font-medium text-sm mb-1">对位特征 (5个)</p>
                  <p className="text-xs text-slate-400">对位胜率、BP阶段、历史交锋等</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-700/30 rounded-lg p-4">
              <h3 className="text-lg font-medium text-yellow-400 mb-2">模型选择</h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                使用<strong className="text-blue-400">LightGBM</strong>梯度提升树模型，原因：
              </p>
              <ul className="text-slate-300 text-sm space-y-1 ml-4 mt-2">
                <li>• 处理表格数据效果好</li>
                <li>• 自动处理特征交互</li>
                <li>• 训练速度快，内存占用小</li>
                <li>• 内置正则化，防止过拟合</li>
              </ul>
            </div>
          </div>
        </motion.div>

        {/* Implementation Method */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 mb-6 border border-slate-700"
        >
          <h2 className="text-2xl font-semibold text-white mb-4">⚙️ 实现方法</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 rounded-lg p-4 border border-blue-700/30">
                <div className="text-3xl mb-2">📥</div>
                <h3 className="text-white font-medium mb-1 text-sm">1. 数据准备</h3>
                <p className="text-xs text-slate-400">
                  从GRID API获取比赛数据，提取英雄统计信息
                </p>
              </div>
              <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 rounded-lg p-4 border border-green-700/30">
                <div className="text-3xl mb-2">🔧</div>
                <h3 className="text-white font-medium mb-1 text-sm">2. 特征提取</h3>
                <p className="text-xs text-slate-400">
                  计算阵容、英雄、对位三类特征，共30维向量
                </p>
              </div>
              <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 rounded-lg p-4 border border-purple-700/30">
                <div className="text-3xl mb-2">🎓</div>
                <h3 className="text-white font-medium mb-1 text-sm">3. 模型训练</h3>
                <p className="text-xs text-slate-400">
                  使用Optuna超参数调优，训练LightGBM模型
                </p>
              </div>
              <div className="bg-gradient-to-br from-yellow-900/30 to-yellow-800/20 rounded-lg p-4 border border-yellow-700/30">
                <div className="text-3xl mb-2">🚀</div>
                <h3 className="text-white font-medium mb-1 text-sm">4. 模型部署</h3>
                <p className="text-xs text-slate-400">
                  保存模型为.pkl文件，提供预测API接口
                </p>
              </div>
            </div>

            <div className="bg-slate-700/30 rounded-lg p-4">
              <h3 className="text-lg font-medium text-blue-400 mb-2">技术栈</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="text-center">
                  <p className="text-slate-400 text-xs mb-1">数据获取</p>
                  <p className="text-white text-sm font-medium">GRID API</p>
                </div>
                <div className="text-center">
                  <p className="text-slate-400 text-xs mb-1">数据处理</p>
                  <p className="text-white text-sm font-medium">Pandas</p>
                </div>
                <div className="text-center">
                  <p className="text-slate-400 text-xs mb-1">模型训练</p>
                  <p className="text-white text-sm font-medium">LightGBM</p>
                </div>
                <div className="text-center">
                  <p className="text-slate-400 text-xs mb-1">超参数调优</p>
                  <p className="text-white text-sm font-medium">Optuna</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Model Performance */}
        {!loading && results && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 mb-6 border border-slate-700"
          >
            <h2 className="text-2xl font-semibold text-white mb-4">📊 模型性能</h2>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 rounded-lg p-4 border border-green-700/30 text-center">
                <p className="text-slate-400 text-sm mb-1">AUC分数</p>
                <p className="text-4xl font-bold text-green-400">{results.metrics.auc_display}</p>
                <p className="text-xs text-slate-500 mt-1">优秀 (0.96+)</p>
              </div>
              <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 rounded-lg p-4 border border-blue-700/30 text-center">
                <p className="text-slate-400 text-sm mb-1">准确率</p>
                <p className="text-4xl font-bold text-blue-400">87%</p>
                <p className="text-xs text-slate-500 mt-1">验证集</p>
              </div>
              <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 rounded-lg p-4 border border-purple-700/30 text-center">
                <p className="text-slate-400 text-sm mb-1">训练样本</p>
                <p className="text-4xl font-bold text-purple-400">{results.dataset_info.total_samples}</p>
                <p className="text-xs text-slate-500 mt-1">4系列赛</p>
              </div>
              <div className="bg-gradient-to-br from-yellow-900/30 to-yellow-800/20 rounded-lg p-4 border border-yellow-700/30 text-center">
                <p className="text-slate-400 text-sm mb-1">过拟合程度</p>
                <p className="text-4xl font-bold text-yellow-400">2.8%</p>
                <p className="text-xs text-slate-500 mt-1">轻度 (可接受)</p>
              </div>
            </div>

            {/* Performance Details */}
            <div className="bg-slate-700/30 rounded-lg p-4">
              <h3 className="text-lg font-medium text-white mb-3">性能指标说明</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-blue-400 font-medium mb-1">✅ AUC = 0.9619</p>
                  <p className="text-slate-300 text-xs">
                    模型区分能力优秀，能准确识别克制关系
                  </p>
                </div>
                <div>
                  <p className="text-green-400 font-medium mb-1">✅ 准确率 = 87%</p>
                  <p className="text-slate-300 text-xs">
                    在验证集上，87%的预测是正确的
                  </p>
                </div>
                <div>
                  <p className="text-yellow-400 font-medium mb-1">⚠️ 过拟合 = 2.8%</p>
                  <p className="text-slate-300 text-xs">
                    训练集和验证集AUC差距2.8%，轻度过拟合
                  </p>
                </div>
                <div>
                  <p className="text-purple-400 font-medium mb-1">📈 改进空间</p>
                  <p className="text-slate-300 text-xs">
                    收集更多数据（目标1500+样本）可进一步提升
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Example Input/Output */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 mb-6 border border-slate-700"
        >
          <h2 className="text-2xl font-semibold text-white mb-4">💡 示例输入输出</h2>
          <p className="text-slate-400 text-sm mb-4">
            输入双方已选英雄，输出Top-3对我方威胁度最高的英雄及其Counter指数
          </p>

          <div className="space-y-4">
            {/* Example 1 */}
            <div className="bg-slate-700/30 rounded-lg p-4">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <h3 className="text-green-400 font-medium mb-2">📥 输入示例 1</h3>
                  <div className="bg-slate-800/50 rounded p-3 text-sm">
                    <p className="text-slate-300 mb-2"><strong className="text-blue-400">我方已选：</strong></p>
                    <p className="text-slate-400 text-xs mb-3">
                      Kai'Sa, Alistar, Orianna
                    </p>
                    <p className="text-slate-300 mb-2"><strong className="text-red-400">对方已选：</strong></p>
                    <p className="text-slate-400 text-xs">
                      Wukong, K'Sante
                    </p>
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-yellow-400 font-medium mb-2">📤 Ban推荐</h3>
                  <div className="bg-slate-800/50 rounded p-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-red-400 font-bold">1</span>
                        </div>
                        <div className="flex-1">
                          <p className="text-white font-medium text-sm">Lulu</p>
                          <div className="bg-slate-700 rounded-full h-2 overflow-hidden mt-1">
                            <div className="bg-gradient-to-r from-red-500 to-orange-500 h-full" style={{width: '94%'}}></div>
                          </div>
                        </div>
                        <span className="text-red-400 font-bold text-sm">0.941</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-orange-400 font-bold">2</span>
                        </div>
                        <div className="flex-1">
                          <p className="text-white font-medium text-sm">Sejuani</p>
                          <div className="bg-slate-700 rounded-full h-2 overflow-hidden mt-1">
                            <div className="bg-gradient-to-r from-orange-500 to-yellow-500 h-full" style={{width: '94%'}}></div>
                          </div>
                        </div>
                        <span className="text-orange-400 font-bold text-sm">0.936</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-yellow-400 font-bold">3</span>
                        </div>
                        <div className="flex-1">
                          <p className="text-white font-medium text-sm">Taliyah</p>
                          <div className="bg-slate-700 rounded-full h-2 overflow-hidden mt-1">
                            <div className="bg-gradient-to-r from-yellow-500 to-green-500 h-full" style={{width: '92%'}}></div>
                          </div>
                        </div>
                        <span className="text-yellow-400 font-bold text-sm">0.924</span>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-600">
                      <p className="text-xs text-slate-400">
                        我方缺少前排保护，对方可选择高威胁英雄针对ADC核心
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Example 2 */}
            <div className="bg-slate-700/30 rounded-lg p-4">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <h3 className="text-green-400 font-medium mb-2">📥 输入示例 2</h3>
                  <div className="bg-slate-800/50 rounded p-3 text-sm">
                    <p className="text-slate-300 mb-2"><strong className="text-blue-400">我方已选：</strong></p>
                    <p className="text-slate-400 text-xs mb-3">
                      Ezreal, Nautilus, Azir, Jarvan IV
                    </p>
                    <p className="text-slate-300 mb-2"><strong className="text-red-400">对方已选：</strong></p>
                    <p className="text-slate-400 text-xs">
                      Aatrox, Lee Sin, Akali
                    </p>
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-yellow-400 font-medium mb-2">📤 威胁度排序</h3>
                  <div className="bg-slate-800/50 rounded p-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-yellow-400 font-bold">1</span>
                        </div>
                        <div className="flex-1">
                          <p className="text-white font-medium text-sm">Lulu</p>
                          <div className="bg-slate-700 rounded-full h-2 overflow-hidden mt-1">
                            <div className="bg-gradient-to-r from-yellow-500 to-green-500 h-full" style={{width: '66%'}}></div>
                          </div>
                        </div>
                        <span className="text-yellow-400 font-bold text-sm">0.663</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-yellow-400 font-bold">2</span>
                        </div>
                        <div className="flex-1">
                          <p className="text-white font-medium text-sm">Sejuani</p>
                          <div className="bg-slate-700 rounded-full h-2 overflow-hidden mt-1">
                            <div className="bg-gradient-to-r from-yellow-500 to-green-500 h-full" style={{width: '63%'}}></div>
                          </div>
                        </div>
                        <span className="text-yellow-400 font-bold text-sm">0.632</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-green-400 font-bold">3</span>
                        </div>
                        <div className="flex-1">
                          <p className="text-white font-medium text-sm">Xayah</p>
                          <div className="bg-slate-700 rounded-full h-2 overflow-hidden mt-1">
                            <div className="bg-gradient-to-r from-green-500 to-blue-500 h-full" style={{width: '62%'}}></div>
                          </div>
                        </div>
                        <span className="text-green-400 font-bold text-sm">0.624</span>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-600">
                      <p className="text-xs text-slate-400">
                        我方有前排和控制，整体威胁度降低，但仍需注意补充保护
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Score Interpretation */}
            <div className="bg-slate-700/30 rounded-lg p-4">
              <h3 className="text-lg font-medium text-white mb-3">威胁度分数解读</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="bg-red-900/20 border border-red-700/30 rounded p-3">
                  <p className="text-red-400 font-medium mb-1">0.8 - 1.0 极高威胁</p>
                  <p className="text-slate-400 text-xs">
                    强烈建议Ban掉，对我方阵容克制明显
                  </p>
                </div>
                <div className="bg-yellow-900/20 border border-yellow-700/30 rounded p-3">
                  <p className="text-yellow-400 font-medium mb-1">0.6 - 0.8 中等威胁</p>
                  <p className="text-slate-400 text-xs">
                    有一定威胁，可考虑Ban或调整选人
                  </p>
                </div>
                <div className="bg-green-900/20 border border-green-700/30 rounded p-3">
                  <p className="text-green-400 font-medium mb-1">0.0 - 0.6 较低威胁</p>
                  <p className="text-slate-400 text-xs">
                    威胁度较低，可以放出不Ban
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Top Features */}
        {!loading && results && results.feature_importance && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 mb-6 border border-slate-700"
          >
            <h2 className="text-2xl font-semibold text-white mb-4">🔑 关键特征</h2>
            <p className="text-slate-400 text-sm mb-4">
              模型最看重的前10个特征（重要性排序）
            </p>
            <div className="space-y-2">
              {results.feature_importance.slice(0, 10).map((item, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-blue-400 text-xs font-bold">{index + 1}</span>
                  </div>
                  <div className="w-48 text-slate-300 text-sm truncate">
                    {item.feature}
                  </div>
                  <div className="flex-1">
                    <div className="bg-slate-700 rounded-full h-4 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-purple-500 h-full flex items-center justify-end pr-2"
                        style={{width: `${(item.importance / results.feature_importance[0].importance) * 100}%`}}
                      >
                        {item.importance > 50 && (
                          <span className="text-white text-xs font-medium">
                            {item.importance}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Back Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center"
        >
          <a
            href="/"
            className="inline-block px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
          >
            返回首页
          </a>
        </motion.div>
      </div>
    </div>
  );
}
