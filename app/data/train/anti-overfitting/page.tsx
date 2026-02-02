'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface ModelMetrics {
  train_auc: number;
  val_auc: number;
  gap: number;
  val_acc: number;
}

interface ComparisonData {
  original: ModelMetrics;
  regularized: ModelMetrics;
  ensemble: ModelMetrics;
  best_model: string;
}

export default function AntiOverfittingPage() {
  const [data, setData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/anti_overfitting_results.json')
      .then(res => res.json())
      .then(result => {
        setData(result);
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
        <div className="text-white text-xl">Loading results...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-red-400 text-xl">Failed to load results</div>
      </div>
    );
  }

  const getGapColor = (gap: number) => {
    if (gap < 0.02) return 'text-green-400';
    if (gap < 0.03) return 'text-yellow-400';
    return 'text-orange-400';
  };

  const getGapStatus = (gap: number) => {
    if (gap < 0.02) return '✅ Excellent';
    if (gap < 0.03) return '⚠️ Acceptable';
    return '🚨 Needs Improvement';
  };

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
            Anti-Overfitting Analysis
          </h1>
          <p className="text-slate-300">
            Comparing different approaches to reduce overfitting
          </p>
        </motion.div>

        {/* Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 mb-6 border border-slate-700"
        >
          <h2 className="text-2xl font-semibold text-white mb-4">Key Findings</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-700/30 rounded-lg p-4">
              <p className="text-slate-400 text-sm mb-2">Best Approach</p>
              <p className="text-2xl font-bold text-blue-400">{data.best_model}</p>
            </div>
            <div className="bg-slate-700/30 rounded-lg p-4">
              <p className="text-slate-400 text-sm mb-2">Lowest Gap</p>
              <p className={`text-2xl font-bold ${getGapColor(data.original.gap)}`}>
                {data.original.gap.toFixed(4)}
              </p>
            </div>
            <div className="bg-slate-700/30 rounded-lg p-4">
              <p className="text-slate-400 text-sm mb-2">Features Reduced</p>
              <p className="text-2xl font-bold text-purple-400">30 → 20</p>
            </div>
          </div>
        </motion.div>

        {/* Model Comparison Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 mb-6 border border-slate-700"
        >
          <h2 className="text-2xl font-semibold text-white mb-4">Model Comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-600">
                  <th className="pb-3 text-slate-300">Model</th>
                  <th className="pb-3 text-slate-300">Train AUC</th>
                  <th className="pb-3 text-slate-300">Val AUC</th>
                  <th className="pb-3 text-slate-300">Gap</th>
                  <th className="pb-3 text-slate-300">Val Acc</th>
                  <th className="pb-3 text-slate-300">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-700">
                  <td className="py-3 text-white font-medium">Original</td>
                  <td className="py-3 text-slate-300">{data.original.train_auc.toFixed(4)}</td>
                  <td className="py-3 text-slate-300">{data.original.val_auc.toFixed(4)}</td>
                  <td className={`py-3 font-bold ${getGapColor(data.original.gap)}`}>
                    {data.original.gap.toFixed(4)}
                  </td>
                  <td className="py-3 text-slate-300">{(data.original.val_acc * 100).toFixed(1)}%</td>
                  <td className="py-3 text-sm">{getGapStatus(data.original.gap)}</td>
                </tr>
                <tr className="border-b border-slate-700">
                  <td className="py-3 text-white font-medium">Regularized</td>
                  <td className="py-3 text-slate-300">{data.regularized.train_auc.toFixed(4)}</td>
                  <td className="py-3 text-slate-300">{data.regularized.val_auc.toFixed(4)}</td>
                  <td className={`py-3 font-bold ${getGapColor(data.regularized.gap)}`}>
                    {data.regularized.gap.toFixed(4)}
                  </td>
                  <td className="py-3 text-slate-300">{(data.regularized.val_acc * 100).toFixed(1)}%</td>
                  <td className="py-3 text-sm">{getGapStatus(data.regularized.gap)}</td>
                </tr>
                <tr>
                  <td className="py-3 text-white font-medium">Ensemble</td>
                  <td className="py-3 text-slate-300">{data.ensemble.train_auc.toFixed(4)}</td>
                  <td className="py-3 text-slate-300">{data.ensemble.val_auc.toFixed(4)}</td>
                  <td className={`py-3 font-bold ${getGapColor(data.ensemble.gap)}`}>
                    {data.ensemble.gap.toFixed(4)}
                  </td>
                  <td className="py-3 text-slate-300">{(data.ensemble.val_acc * 100).toFixed(1)}%</td>
                  <td className="py-3 text-sm">{getGapStatus(data.ensemble.gap)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Techniques Applied */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 mb-6 border border-slate-700"
        >
          <h2 className="text-2xl font-semibold text-white mb-4">Anti-Overfitting Techniques</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-700/30 rounded-lg p-4">
              <h3 className="text-green-400 font-medium mb-2">✅ Feature Selection</h3>
              <p className="text-slate-300 text-sm mb-2">Reduced from 30 to 20 features</p>
              <ul className="text-slate-400 text-xs space-y-1">
                <li>• Kept only top 20 most important features</li>
                <li>• Removed redundant features</li>
                <li>• Reduced model complexity</li>
              </ul>
            </div>

            <div className="bg-slate-700/30 rounded-lg p-4">
              <h3 className="text-blue-400 font-medium mb-2">✅ Stronger Regularization</h3>
              <p className="text-slate-300 text-sm mb-2">Increased L1/L2 penalties</p>
              <ul className="text-slate-400 text-xs space-y-1">
                <li>• reg_alpha: 0.69 → 1.5</li>
                <li>• reg_lambda: 0.26 → 1.0</li>
                <li>• min_child_samples: 49 → 50</li>
              </ul>
            </div>

            <div className="bg-slate-700/30 rounded-lg p-4">
              <h3 className="text-purple-400 font-medium mb-2">✅ Model Simplification</h3>
              <p className="text-slate-300 text-sm mb-2">Reduced model capacity</p>
              <ul className="text-slate-400 text-xs space-y-1">
                <li>• num_leaves: 21 → 15</li>
                <li>• max_depth: kept at 3</li>
                <li>• Slower learning rate: 0.083 → 0.05</li>
              </ul>
            </div>

            <div className="bg-slate-700/30 rounded-lg p-4">
              <h3 className="text-yellow-400 font-medium mb-2">✅ Ensemble Method</h3>
              <p className="text-slate-300 text-sm mb-2">Bagging with 5 models</p>
              <ul className="text-slate-400 text-xs space-y-1">
                <li>• Different random seeds</li>
                <li>• Average predictions</li>
                <li>• Reduces variance</li>
              </ul>
            </div>
          </div>
        </motion.div>

        {/* Analysis */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 mb-6 border border-slate-700"
        >
          <h2 className="text-2xl font-semibold text-white mb-4">Analysis & Insights</h2>
          <div className="space-y-4 text-slate-300">
            <div>
              <h3 className="text-white font-medium mb-2">🎯 Key Finding</h3>
              <p className="text-sm">
                The <strong className="text-blue-400">original optimized model</strong> actually performs best with the lowest overfitting gap (0.0277).
                This suggests that the hyperparameter tuning already found a good balance between model complexity and generalization.
              </p>
            </div>

            <div>
              <h3 className="text-white font-medium mb-2">📊 Why Regularization Didn't Help Much</h3>
              <p className="text-sm">
                Adding stronger regularization slightly increased the gap (0.0288), indicating that the model was already well-regularized.
                The validation AUC dropped slightly (0.9619 → 0.9572), suggesting we may have over-regularized.
              </p>
            </div>

            <div>
              <h3 className="text-white font-medium mb-2">🔍 Root Cause</h3>
              <p className="text-sm">
                The mild overfitting is primarily due to <strong className="text-yellow-400">limited data</strong> (750 samples) rather than model complexity.
                The best solution is to collect more training data rather than further constraining the model.
              </p>
            </div>

            <div>
              <h3 className="text-white font-medium mb-2">✅ Recommendation</h3>
              <p className="text-sm">
                <strong className="text-green-400">Use the original optimized model</strong> (AUC: 0.9619, Gap: 0.0277).
                It provides the best validation performance with acceptable overfitting levels.
                Focus on collecting more data (target: 1500+ samples) for further improvement.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Navigation */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex gap-4 justify-center"
        >
          <a
            href="/data/train/optimized"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            View Optimization Results
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
