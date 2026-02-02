'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface ComparisonData {
  baseline: {
    auc: number;
    accuracy: number;
    n_features: number;
  };
  optimized: {
    auc: number;
    accuracy: number;
    n_features: number;
  };
  improvement: {
    auc_improvement_pct: number;
    accuracy_improvement_pct: number;
  };
  timestamp: string;
}

export default function OptimizationPage() {
  const [data, setData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/training_comparison.json')
      .then(res => res.json())
      .then(result => {
        setData(result.comparison);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading optimization results...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-red-400 text-xl">Failed to load optimization results</div>
      </div>
    );
  }

  const aucImprovement = data.improvement.auc_improvement_pct;
  const isAucImproved = aucImprovement > 0;

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
            Model Optimization Results
          </h1>
          <p className="text-slate-300">
            Baseline vs Optimized Model Comparison
          </p>
        </motion.div>

        {/* Optimization Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 mb-6 border border-slate-700"
        >
          <h2 className="text-2xl font-semibold text-white mb-4">Optimization Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <p className="text-slate-400 text-sm mb-2">Features Added</p>
              <p className="text-4xl font-bold text-blue-400">
                +{data.optimized.n_features - 14}
              </p>
              <p className="text-slate-500 text-xs mt-1">
                14 → {data.optimized.n_features} features
              </p>
            </div>
            <div className="text-center">
              <p className="text-slate-400 text-sm mb-2">Hyperparameter Tuning</p>
              <p className="text-4xl font-bold text-purple-400">30</p>
              <p className="text-slate-500 text-xs mt-1">Optuna trials</p>
            </div>
            <div className="text-center">
              <p className="text-slate-400 text-sm mb-2">AUC Improvement</p>
              <p className={`text-4xl font-bold ${isAucImproved ? 'text-green-400' : 'text-yellow-400'}`}>
                {aucImprovement > 0 ? '+' : ''}{aucImprovement.toFixed(2)}%
              </p>
              <p className="text-slate-500 text-xs mt-1">
                {isAucImproved ? 'Improved!' : 'Stable'}
              </p>
            </div>
          </div>
        </motion.div>

        {/* AUC Comparison */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 mb-6 border border-slate-700"
        >
          <h2 className="text-2xl font-semibold text-white mb-6">AUC Score Comparison</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Baseline */}
            <div className="bg-slate-700/30 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-300">Baseline Model</h3>
                <span className="px-3 py-1 bg-slate-600 rounded-full text-xs text-slate-300">
                  14 features
                </span>
              </div>
              <div className="text-center">
                <div className="text-5xl font-bold text-blue-400 mb-2">
                  {data.baseline.auc.toFixed(4)}
                </div>
                <div className="text-sm text-slate-400">
                  Accuracy: {(data.baseline.accuracy * 100).toFixed(1)}%
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Default params</span>
                  <span className="text-slate-300">✓</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Basic features</span>
                  <span className="text-slate-300">✓</span>
                </div>
              </div>
            </div>

            {/* Optimized */}
            <div className="bg-gradient-to-br from-green-900/20 to-blue-900/20 rounded-lg p-6 border-2 border-green-500/30">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-green-300">Optimized Model</h3>
                <span className="px-3 py-1 bg-green-600 rounded-full text-xs text-white">
                  {data.optimized.n_features} features
                </span>
              </div>
              <div className="text-center">
                <div className="text-5xl font-bold text-green-400 mb-2">
                  {data.optimized.auc.toFixed(4)}
                </div>
                <div className="text-sm text-slate-400">
                  Accuracy: {(data.optimized.accuracy * 100).toFixed(1)}%
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Tuned params</span>
                  <span className="text-green-300">✓</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Enhanced features</span>
                  <span className="text-green-300">✓</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Hero roles & tags</span>
                  <span className="text-green-300">✓</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Matchup features</span>
                  <span className="text-green-300">✓</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Optimization Details */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 mb-6 border border-slate-700"
        >
          <h2 className="text-2xl font-semibold text-white mb-4">Optimization Techniques Applied</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-blue-400">1</span>
              </div>
              <div>
                <h3 className="text-white font-medium mb-1">Enhanced Feature Engineering</h3>
                <p className="text-slate-400 text-sm">
                  Added 16 new features including hero roles, tags, composition analysis, and matchup win rates
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-purple-400">2</span>
              </div>
              <div>
                <h3 className="text-white font-medium mb-1">Hyperparameter Tuning</h3>
                <p className="text-slate-400 text-sm">
                  Used Optuna TPE sampler with 30 trials to find optimal model parameters
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-green-400">3</span>
              </div>
              <div>
                <h3 className="text-white font-medium mb-1">Hero Database Integration</h3>
                <p className="text-slate-400 text-sm">
                  Integrated hero role classification (tank, fighter, assassin, mage, ADC, support) and tags
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-yellow-400">4</span>
              </div>
              <div>
                <h3 className="text-white font-medium mb-1">Matchup Matrix</h3>
                <p className="text-slate-400 text-sm">
                  Built hero vs hero matchup win rate matrix from historical game data
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* New Features List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 border border-slate-700"
        >
          <h2 className="text-2xl font-semibold text-white mb-4">New Features Added</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <h3 className="text-green-400 font-medium mb-2">Composition Features</h3>
              <ul className="text-slate-300 text-sm space-y-1">
                <li>• Tank count</li>
                <li>• Assassin count</li>
                <li>• Mage count</li>
                <li>• Engage count</li>
                <li>• CC count</li>
                <li>• Mobility count</li>
                <li>• Physical/Magic damage ratio</li>
              </ul>
            </div>
            <div>
              <h3 className="text-blue-400 font-medium mb-2">Hero Role Features</h3>
              <ul className="text-slate-300 text-sm space-y-1">
                <li>• Is assassin</li>
                <li>• Is tank</li>
                <li>• Is mage</li>
                <li>• Has engage</li>
                <li>• Has mobility</li>
                <li>• Has burst</li>
              </ul>
            </div>
            <div>
              <h3 className="text-purple-400 font-medium mb-2">Matchup Features</h3>
              <ul className="text-slate-300 text-sm space-y-1">
                <li>• Average matchup win rate</li>
                <li>• Worst matchup win rate</li>
                <li>• Best matchup win rate</li>
              </ul>
            </div>
          </div>
        </motion.div>

        {/* Navigation */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 flex gap-4 justify-center"
        >
          <a
            href="/data/train"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            View Original Training
          </a>
          <a
            href="/"
            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            Back to Home
          </a>
        </motion.div>
      </div>
    </div>
  );
}
