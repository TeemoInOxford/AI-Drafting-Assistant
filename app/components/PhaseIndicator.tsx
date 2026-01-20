'use client';

import { motion } from 'framer-motion';
import { BPStep } from '../lib/types';

interface PhaseIndicatorProps {
  phase: string;
  currentStep: BPStep | null;
}

export default function PhaseIndicator({ phase, currentStep }: PhaseIndicatorProps) {
  const getActionText = () => {
    if (!currentStep) return '';
    const teamName = currentStep.team === 'blue' ? 'Blue' : 'Red';
    const actionName = currentStep.action === 'ban' ? 'Ban' : 'Pick';
    return `${teamName} ${actionName}`;
  };

  const isBlue = currentStep?.team === 'blue';

  return (
    <div className="flex items-center justify-center gap-6">
      <div className="hidden md:flex h-[1px] w-20 bg-gradient-to-r from-transparent to-cyan-500/50" />
      <div className="flex flex-col items-center">
        <span className="text-[10px] text-indigo-400 font-bold tracking-widest uppercase mb-1">
          {phase}
        </span>
        {currentStep && (
          <motion.div
            key={`${currentStep.team}-${currentStep.action}-${currentStep.index}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`px-6 py-1 rounded-full shadow-lg ${
              isBlue
                ? 'bg-cyan-950/50 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                : 'bg-rose-950/50 border border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.3)]'
            }`}
          >
            <span className={`text-sm font-bold uppercase tracking-wide ${isBlue ? 'text-cyan-300' : 'text-rose-300'}`}>
              {getActionText()}
            </span>
          </motion.div>
        )}
      </div>
      <div className="hidden md:flex h-[1px] w-20 bg-gradient-to-l from-transparent to-rose-500/50" />
    </div>
  );
}
