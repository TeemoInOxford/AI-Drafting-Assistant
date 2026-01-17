'use client';

import { motion } from 'framer-motion';

interface DataSearchFilterProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  language: 'zh' | 'en';
}

export default function DataSearchFilter({
  searchTerm,
  onSearchChange,
  language,
}: DataSearchFilterProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative w-full max-w-md"
    >
      {/* Search Icon */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      </div>

      {/* Input */}
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={language === 'zh' ? '搜索战队或选手...' : 'Search teams or players...'}
        className="
          w-full pl-10 pr-10 py-2.5
          bg-white/5 border border-white/10 rounded-lg
          text-white placeholder-gray-500
          focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30
          transition-all duration-200
        "
      />

      {/* Clear Button */}
      {searchTerm && (
        <button
          onClick={() => onSearchChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      )}
    </motion.div>
  );
}
