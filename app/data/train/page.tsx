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
  error?: string;
}

export default function TrainPage() {
  const [results, setResults] = useState<TrainingResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/training_results.json')
      .then(res => res.json())
      .then(data => {
        setResults(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading training results...</div>
      </div>
    );
  }

  if (error || !results || results.status === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-red-400 text-xl">
          Error: {error || results?.error || 'Failed to load results'}
        </div>
      </div>
    );
  }

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
            Counter Model Training Results
          </h1>
          <p className="text-slate-300">
            Trained: {new Date(results.timestamp).toLocaleString()}
          </p>
        </motion.div>

        {/* Model Info Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 mb-6 border border-slate-700"
        >
          <h2 className="text-2xl font-semibold text-white mb-4">Model Information</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-slate-400 text-sm">Algorithm</p>
              <p className="text-white font-medium">{results.model_info.algorithm}</p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Objective</p>
              <p className="text-white font-medium">{results.model_info.objective}</p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Features</p>
              <p className="text-white font-medium">{results.model_info.n_features}</p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Best Iteration</p>
              <p className="text-white font-medium">{results.model_info.best_iteration}</p>
            </div>
          </div>
        </motion.div>

        {/* Metrics Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 mb-6 border border-slate-700"
        >
          <h2 className="text-2xl font-semibold text-white mb-4">Performance Metrics</h2>
          <div className="flex items-center justify-center">
            <div className="text-center">
              <p className="text-slate-400 text-sm mb-2">AUC Score</p>
              <div className="relative">
                <div className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500">
                  {results.metrics.auc_display}
                </div>
                {results.metrics.auc === 1.0 && (
                  <div className="mt-2 text-green-400 text-sm">Perfect Score!</div>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Dataset Info Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 mb-6 border border-slate-700"
        >
          <h2 className="text-2xl font-semibold text-white mb-4">Dataset Information</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-slate-400 text-sm">Total Samples</p>
              <p className="text-white font-medium text-2xl">{results.dataset_info.total_samples}</p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Counter Cases</p>
              <p className="text-white font-medium text-2xl">{results.dataset_info.counter_cases}</p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Non-Counter Cases</p>
              <p className="text-white font-medium text-2xl">{results.dataset_info.non_counter_cases}</p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Class Balance</p>
              <p className="text-white font-medium text-2xl">
                {(results.dataset_info.class_balance * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        </motion.div>

        {/* Feature Importance Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 border border-slate-700"
        >
          <h2 className="text-2xl font-semibold text-white mb-4">Feature Importance</h2>
          <div className="space-y-3">
            {results.feature_importance.map((item, index) => (
              <div key={index} className="flex items-center gap-4">
                <div className="w-48 text-slate-300 text-sm truncate">
                  {item.feature}
                </div>
                <div className="flex-1">
                  <div className="bg-slate-700 rounded-full h-6 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(item.importance / Math.max(...results.feature_importance.map(f => f.importance))) * 100}%` }}
                      transition={{ delay: 0.5 + index * 0.05, duration: 0.5 }}
                      className="bg-gradient-to-r from-blue-500 to-purple-500 h-full flex items-center justify-end pr-2"
                    >
                      {item.importance > 0 && (
                        <span className="text-white text-xs font-medium">
                          {item.importance}
                        </span>
                      )}
                    </motion.div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Back Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-8 text-center"
        >
          <a
            href="/"
            className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Back to Home
          </a>
        </motion.div>
      </div>
    </div>
  );
}
