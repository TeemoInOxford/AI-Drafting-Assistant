'use client';

import { motion } from 'framer-motion';
import { ThreatLevel } from '../lib/threat-types';

interface ThreatBadgeProps {
  score: number;
  level: ThreatLevel;
  onClick?: () => void;
  compact?: boolean;
}

/**
 * ThreatBadge - 显示 ban 压力的小徽章
 *
 * 颜色:
 * - High (top 20%): 红色
 * - Moderate (top 40%): 橙色
 * - Low: 隐藏
 */
export default function ThreatBadge({ score, level, onClick, compact = false }: ThreatBadgeProps) {
  // Don't render for low threat
  if (level === 'low') {
    return null;
  }

  const colors = {
    high: {
      bg: 'bg-red-500/20',
      border: 'border-red-500/50',
      text: 'text-red-400',
      glow: 'shadow-red-500/20',
    },
    moderate: {
      bg: 'bg-orange-500/20',
      border: 'border-orange-500/50',
      text: 'text-orange-400',
      glow: 'shadow-orange-500/20',
    },
    low: {
      bg: 'bg-gray-500/20',
      border: 'border-gray-500/50',
      text: 'text-gray-400',
      glow: '',
    },
  };

  const style = colors[level];

  if (compact) {
    return (
      <motion.button
        onClick={onClick}
        className={`
          inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium
          ${style.bg} ${style.border} ${style.text} border
          hover:brightness-110 transition-all cursor-pointer
        `}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title={`Ban Pressure: ${score.toFixed(0)} (${level})`}
      >
        <svg
          className="w-2.5 h-2.5"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
        {score.toFixed(0)}
      </motion.button>
    );
  }

  return (
    <motion.button
      onClick={onClick}
      className={`
        inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium
        ${style.bg} ${style.border} ${style.text} border shadow-sm ${style.glow}
        hover:brightness-110 transition-all cursor-pointer
      `}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      title="Click for details"
    >
      <svg
        className="w-3 h-3"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          fillRule="evenodd"
          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
      <span>BAN PRESSURE</span>
      <span className="font-bold">{score.toFixed(0)}</span>
    </motion.button>
  );
}

/**
 * ThreatIndicator - 更简洁的威胁指示器，用于列表视图
 */
export function ThreatIndicator({ score, level }: { score: number; level: ThreatLevel }) {
  if (level === 'low') {
    return null;
  }

  const colors = {
    high: 'bg-red-500',
    moderate: 'bg-orange-500',
    low: 'bg-gray-500',
  };

  return (
    <div className="flex items-center gap-1" title={`Ban Pressure: ${score.toFixed(0)}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${colors[level]}`} />
      <span className={`text-[10px] font-medium ${level === 'high' ? 'text-red-400' : 'text-orange-400'}`}>
        {score.toFixed(0)}
      </span>
    </div>
  );
}
