'use client';

import { motion } from 'framer-motion';
import { BPStep, Language } from '../lib/types';

interface PhaseIndicatorProps {
  phase: string;
  currentStep: BPStep | null;
  language: Language;
}

export default function PhaseIndicator({ phase, currentStep, language }: PhaseIndicatorProps) {
  const getActionText = () => {
    if (!currentStep) return '';
    const teamName = language === 'zh'
      ? (currentStep.team === 'blue' ? '蓝方' : '红方')
      : (currentStep.team === 'blue' ? 'Blue' : 'Red');
    const actionName = language === 'zh'
      ? (currentStep.action === 'ban' ? '禁用' : '选择')
      : (currentStep.action === 'ban' ? 'Ban' : 'Pick');
    return `${teamName} ${actionName}`;
  };

  const isBlue = currentStep?.team === 'blue';

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center mb-4"
    >
      <div className="inline-flex flex-col items-center gap-2 px-6 py-3 bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-700/50">
        <span className="text-xs uppercase tracking-widest text-slate-500 font-mono">
          {language === 'zh' ? '当前阶段' : 'Current Phase'}
        </span>
        <span className="text-lg font-bold text-white">{phase}</span>
        {currentStep && (
          <motion.span
            key={`${currentStep.team}-${currentStep.action}-${currentStep.index}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`text-sm font-semibold px-4 py-1.5 rounded-full uppercase tracking-wider ${
              isBlue
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
            }`}
          >
            {getActionText()}
          </motion.span>
        )}
      </div>
    </motion.div>
  );
}
