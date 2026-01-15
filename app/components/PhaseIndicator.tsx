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

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center mb-4"
    >
      <div className="inline-flex flex-col items-center gap-2 px-6 py-3 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
        <span className="text-lg font-bold text-white">{phase}</span>
        {currentStep && (
          <motion.span
            key={`${currentStep.team}-${currentStep.action}-${currentStep.index}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`text-sm font-medium px-3 py-1 rounded-full ${
              currentStep.team === 'blue'
                ? 'bg-blue-500/30 text-blue-300'
                : 'bg-red-500/30 text-red-300'
            }`}
          >
            {getActionText()}
          </motion.span>
        )}
      </div>
    </motion.div>
  );
}
