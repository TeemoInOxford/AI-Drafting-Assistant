'use client';

import { BPState, BPStep } from '../lib/types';
import TeamPanel from './TeamPanel';

interface BPPanelProps {
  bpState: BPState;
  currentStep: BPStep | null;
}

export default function BPPanel({ bpState, currentStep }: BPPanelProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 mb-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TeamPanel
          team="blue"
          bans={bpState.blueBans}
          picks={bpState.bluePicks}
          isActive={currentStep?.team === 'blue'}
          currentAction={currentStep?.team === 'blue' ? currentStep.action : null}
          currentIndex={currentStep?.team === 'blue' ? currentStep.index : null}
        />

        <TeamPanel
          team="red"
          bans={bpState.redBans}
          picks={bpState.redPicks}
          isActive={currentStep?.team === 'red'}
          currentAction={currentStep?.team === 'red' ? currentStep.action : null}
          currentIndex={currentStep?.team === 'red' ? currentStep.index : null}
        />
      </div>
    </div>
  );
}
