'use client';

import { motion } from 'framer-motion';

interface ControlBarProps {
  onUndo: () => void;
  onReset: () => void;
  canUndo: boolean;
  isComplete: boolean;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onLoadDemo?: () => void;
}

export default function ControlBar({
  onUndo,
  onReset,
  canUndo,
  isComplete,
  searchTerm,
  onSearchChange,
  onLoadDemo,
}: ControlBarProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 mb-4">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <motion.button
          whileHover={{ scale: canUndo ? 1.05 : 1 }}
          whileTap={{ scale: canUndo ? 0.95 : 1 }}
          onClick={onUndo}
          disabled={!canUndo}
          className={`px-4 sm:px-6 py-2 sm:py-2.5 rounded-sm font-medium text-xs sm:text-sm tracking-wide uppercase transition-all duration-200 ${
            canUndo
              ? 'bg-transparent border border-slate-700 text-slate-300 hover:border-cyan-500/50 hover:text-cyan-400 hover:bg-slate-800/50'
              : 'bg-slate-800/50 text-slate-600 border border-slate-700/50 cursor-not-allowed'
          }`}
        >
          Undo
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onReset}
          className="px-4 sm:px-6 py-2 sm:py-2.5 bg-rose-950/30 border border-rose-900 text-rose-500 hover:bg-rose-900/50 hover:text-rose-400 hover:border-rose-700 rounded-sm font-medium text-xs sm:text-sm tracking-wide uppercase transition-all duration-200"
        >
          Reset
        </motion.button>

        {onLoadDemo && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onLoadDemo}
            className="px-4 sm:px-6 py-2 sm:py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_10px_rgba(8,145,178,0.2)] hover:shadow-[0_0_15px_rgba(8,145,178,0.4)] border border-cyan-500 rounded-sm font-medium text-xs sm:text-sm tracking-wide uppercase transition-all duration-200"
          >
            Load Demo
          </motion.button>
        )}

        {isComplete && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="px-4 sm:px-6 py-2 sm:py-2.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-sm font-medium text-xs sm:text-sm tracking-wide uppercase"
          >
            Complete
          </motion.span>
        )}

        <div className="w-full sm:flex-1 sm:min-w-[200px] sm:max-w-md order-first sm:order-last sm:ml-auto mb-2 sm:mb-0">
          <div className="relative group">
            <input
              type="text"
              placeholder="Search champions..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full px-3 sm:px-4 py-1.5 sm:py-2 bg-slate-900/80 border border-slate-700 rounded-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-all text-sm sm:text-base"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
