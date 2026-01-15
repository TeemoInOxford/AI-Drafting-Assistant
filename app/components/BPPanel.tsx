'use client';

import { BPState, BPStep, Language } from '../lib/types';
import TeamPanel from './TeamPanel';

interface BPPanelProps {
  bpState: BPState;
  currentStep: BPStep | null;
  language: Language;
}

export default function BPPanel({ bpState, currentStep, language }: BPPanelProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 mb-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 蓝方 */}
        <TeamPanel
          team="blue"
          bans={bpState.blueBans}
          picks={bpState.bluePicks}
          isActive={currentStep?.team === 'blue'}
          currentAction={currentStep?.team === 'blue' ? currentStep.action : null}
          currentIndex={currentStep?.team === 'blue' ? currentStep.index : null}
          language={language}
        />

        {/* 红方 */}
        <TeamPanel
          team="red"
          bans={bpState.redBans}
          picks={bpState.redPicks}
          isActive={currentStep?.team === 'red'}
          currentAction={currentStep?.team === 'red' ? currentStep.action : null}
          currentIndex={currentStep?.team === 'red' ? currentStep.index : null}
          language={language}
        />
      </div>
    </div>
  );
}
