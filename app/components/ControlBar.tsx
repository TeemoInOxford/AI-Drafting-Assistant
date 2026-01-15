'use client';

import { motion } from 'framer-motion';
import { Language } from '../lib/types';

interface ControlBarProps {
  onUndo: () => void;
  onReset: () => void;
  canUndo: boolean;
  isComplete: boolean;
  language: Language;
  searchTerm: string;
  onSearchChange: (value: string) => void;
}

export default function ControlBar({
  onUndo,
  onReset,
  canUndo,
  isComplete,
  language,
  searchTerm,
  onSearchChange,
}: ControlBarProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 mb-4">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {/* 撤销按钮 */}
        <motion.button
          whileHover={{ scale: canUndo ? 1.05 : 1 }}
          whileTap={{ scale: canUndo ? 0.95 : 1 }}
          onClick={onUndo}
          disabled={!canUndo}
          className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-medium text-sm sm:text-base transition-all duration-200 ${
            canUndo
              ? 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 border border-yellow-500/30'
              : 'bg-gray-500/10 text-gray-500 border border-gray-500/20 cursor-not-allowed'
          }`}
        >
          {language === 'zh' ? '↩ 撤销' : '↩ Undo'}
        </motion.button>

        {/* 重置按钮 */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onReset}
          className="px-3 sm:px-4 py-1.5 sm:py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded-lg font-medium text-sm sm:text-base transition-all duration-200"
        >
          {language === 'zh' ? '🔄 重置' : '🔄 Reset'}
        </motion.button>

        {/* 完成提示 */}
        {isComplete && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="px-3 sm:px-4 py-1.5 sm:py-2 bg-green-500/20 text-green-300 border border-green-500/30 rounded-lg font-medium text-sm sm:text-base"
          >
            {language === 'zh' ? '✓ BP完成' : '✓ Complete'}
          </motion.span>
        )}

        {/* 搜索框 */}
        <div className="w-full sm:flex-1 sm:min-w-[200px] sm:max-w-md order-first sm:order-last sm:ml-auto mb-2 sm:mb-0">
          <input
            type="text"
            placeholder={language === 'zh' ? '🔍 搜索英雄...' : '🔍 Search...'}
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full px-3 sm:px-4 py-1.5 sm:py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-400 transition-colors text-sm sm:text-base"
          />
        </div>
      </div>
    </div>
  );
}
