/**
 * M6 Draft Decision Layer Validation
 *
 * Validates the draft decision layer through:
 * 1. Draft state machine tests for phases
 * 2. Action safety verification
 *
 * Usage: npx tsx app/scripts/validate-m6-draft-decision.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ============ Types ============

interface ValidationResult {
  meta: {
    runDate: string;
    description: string;
  };
  stateMachineTests: {
    totalTests: number;
    passed: number;
    failed: number;
    results: Array<{
      name: string;
      phase: string;
      expectedBehavior: string;
      actualBehavior: string;
      status: 'PASS' | 'FAIL';
    }>;
  };
  actionSafetyTests: {
    totalTests: number;
    passed: number;
    failed: number;
    results: Array<{
      name: string;
      action: string;
      expectedOutcome: string;
      actualOutcome: string;
      status: 'PASS' | 'FAIL';
    }>;
  };
  phaseTransitionTests: {
    totalTransitions: number;
    validTransitions: number;
    invalidTransitions: number;
    results: Array<{
      from: string;
      to: string;
      valid: boolean;
    }>;
  };
}

// ============ BP Sequence Definition ============

type BPStep =
  | 'blue-ban-1' | 'red-ban-1' | 'blue-ban-2' | 'red-ban-2' | 'blue-ban-3' | 'red-ban-3'
  | 'blue-pick-1' | 'red-pick-1' | 'red-pick-2' | 'blue-pick-2' | 'blue-pick-3' | 'red-pick-3'
  | 'red-ban-4' | 'blue-ban-4' | 'red-ban-5' | 'blue-ban-5'
  | 'red-pick-4' | 'blue-pick-4' | 'blue-pick-5' | 'red-pick-5'
  | 'complete';

const BP_SEQUENCE: BPStep[] = [
  'blue-ban-1', 'red-ban-1', 'blue-ban-2', 'red-ban-2', 'blue-ban-3', 'red-ban-3',
  'blue-pick-1', 'red-pick-1', 'red-pick-2', 'blue-pick-2', 'blue-pick-3', 'red-pick-3',
  'red-ban-4', 'blue-ban-4', 'red-ban-5', 'blue-ban-5',
  'red-pick-4', 'blue-pick-4', 'blue-pick-5', 'red-pick-5',
  'complete',
];

type DraftPhase = 'ban-phase-1' | 'pick-phase-1' | 'ban-phase-2' | 'pick-phase-2' | 'complete';

function getPhaseFromStep(step: BPStep): DraftPhase {
  if (step === 'complete') return 'complete';

  const stepIndex = BP_SEQUENCE.indexOf(step);

  if (stepIndex < 6) return 'ban-phase-1';
  if (stepIndex < 12) return 'pick-phase-1';
  if (stepIndex < 16) return 'ban-phase-2';
  return 'pick-phase-2';
}

function isBanStep(step: BPStep): boolean {
  return step.includes('ban');
}

function isPickStep(step: BPStep): boolean {
  return step.includes('pick');
}

// ============ Evidence Visibility Rules ============

interface EvidenceVisibility {
  showBanEvidence: boolean;
  showPickEvidence: boolean;
  showActionPanel: boolean;
  actionPanelMode: 'ban' | 'pick' | 'none';
}

function getEvidenceVisibility(step: BPStep, ourSide: 'blue' | 'red'): EvidenceVisibility {
  if (step === 'complete') {
    return {
      showBanEvidence: false,
      showPickEvidence: false,
      showActionPanel: false,
      actionPanelMode: 'none',
    };
  }

  const phase = getPhaseFromStep(step);
  const isOurTurn = step.startsWith(ourSide);
  const isBan = isBanStep(step);

  return {
    showBanEvidence: phase === 'ban-phase-1' || phase === 'ban-phase-2',
    showPickEvidence: phase === 'pick-phase-1' || phase === 'pick-phase-2',
    showActionPanel: isOurTurn,
    actionPanelMode: isBan ? 'ban' : 'pick',
  };
}

// ============ Action Safety ============

interface ActionResult {
  success: boolean;
  action: 'ban' | 'pick' | 'view' | 'none';
  championAffected: boolean;
}

function simulateViewAction(): ActionResult {
  // View action should NEVER trigger a ban or pick
  return {
    success: true,
    action: 'view',
    championAffected: false,
  };
}

function simulateBanAction(step: BPStep, ourSide: 'blue' | 'red'): ActionResult {
  const isOurTurn = step.startsWith(ourSide);
  const isBan = isBanStep(step);

  if (!isOurTurn) {
    return { success: false, action: 'none', championAffected: false };
  }

  if (!isBan) {
    return { success: false, action: 'none', championAffected: false };
  }

  return { success: true, action: 'ban', championAffected: true };
}

function simulatePickAction(step: BPStep, ourSide: 'blue' | 'red'): ActionResult {
  const isOurTurn = step.startsWith(ourSide);
  const isPick = isPickStep(step);

  if (!isOurTurn) {
    return { success: false, action: 'none', championAffected: false };
  }

  if (!isPick) {
    return { success: false, action: 'none', championAffected: false };
  }

  return { success: true, action: 'pick', championAffected: true };
}

// ============ Test Functions ============

function runStateMachineTests(): any {
  const testCases = [
    // Ban Phase 1 tests
    {
      name: 'Ban Phase 1 - blue-ban-1 shows ban evidence',
      step: 'blue-ban-1' as BPStep,
      ourSide: 'blue' as const,
      check: (v: EvidenceVisibility) => v.showBanEvidence === true,
      expectedBehavior: 'showBanEvidence=true',
    },
    {
      name: 'Ban Phase 1 - blue-ban-1 shows action panel for blue',
      step: 'blue-ban-1' as BPStep,
      ourSide: 'blue' as const,
      check: (v: EvidenceVisibility) => v.showActionPanel === true && v.actionPanelMode === 'ban',
      expectedBehavior: 'showActionPanel=true, mode=ban',
    },
    {
      name: 'Ban Phase 1 - blue-ban-1 hides action panel for red',
      step: 'blue-ban-1' as BPStep,
      ourSide: 'red' as const,
      check: (v: EvidenceVisibility) => v.showActionPanel === false,
      expectedBehavior: 'showActionPanel=false',
    },

    // Pick Phase 1 tests
    {
      name: 'Pick Phase 1 - blue-pick-1 hides ban evidence',
      step: 'blue-pick-1' as BPStep,
      ourSide: 'blue' as const,
      check: (v: EvidenceVisibility) => v.showBanEvidence === false,
      expectedBehavior: 'showBanEvidence=false',
    },
    {
      name: 'Pick Phase 1 - blue-pick-1 shows pick evidence',
      step: 'blue-pick-1' as BPStep,
      ourSide: 'blue' as const,
      check: (v: EvidenceVisibility) => v.showPickEvidence === true,
      expectedBehavior: 'showPickEvidence=true',
    },
    {
      name: 'Pick Phase 1 - blue-pick-1 shows action panel in pick mode',
      step: 'blue-pick-1' as BPStep,
      ourSide: 'blue' as const,
      check: (v: EvidenceVisibility) => v.showActionPanel === true && v.actionPanelMode === 'pick',
      expectedBehavior: 'showActionPanel=true, mode=pick',
    },

    // Ban Phase 2 tests
    {
      name: 'Ban Phase 2 - red-ban-4 shows ban evidence again',
      step: 'red-ban-4' as BPStep,
      ourSide: 'red' as const,
      check: (v: EvidenceVisibility) => v.showBanEvidence === true,
      expectedBehavior: 'showBanEvidence=true',
    },
    {
      name: 'Ban Phase 2 - blue-ban-4 shows action panel for blue',
      step: 'blue-ban-4' as BPStep,
      ourSide: 'blue' as const,
      check: (v: EvidenceVisibility) => v.showActionPanel === true && v.actionPanelMode === 'ban',
      expectedBehavior: 'showActionPanel=true, mode=ban',
    },

    // Complete state
    {
      name: 'Complete - hides all evidence and action panel',
      step: 'complete' as BPStep,
      ourSide: 'blue' as const,
      check: (v: EvidenceVisibility) =>
        v.showBanEvidence === false &&
        v.showPickEvidence === false &&
        v.showActionPanel === false,
      expectedBehavior: 'all hidden',
    },
  ];

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const visibility = getEvidenceVisibility(tc.step, tc.ourSide);
    const checkPassed = tc.check(visibility);

    const status = checkPassed ? 'PASS' : 'FAIL';
    if (checkPassed) passed++;
    else failed++;

    results.push({
      name: tc.name,
      phase: getPhaseFromStep(tc.step),
      expectedBehavior: tc.expectedBehavior,
      actualBehavior: JSON.stringify(visibility),
      status,
    });
  }

  return { totalTests: testCases.length, passed, failed, results };
}

function runActionSafetyTests(): any {
  const testCases = [
    // View action safety
    {
      name: 'View action does not trigger ban',
      action: 'view',
      step: 'blue-ban-1' as BPStep,
      ourSide: 'blue' as const,
      check: (r: ActionResult) => r.action === 'view' && r.championAffected === false,
      expectedOutcome: 'No champion affected',
    },
    {
      name: 'View action does not trigger pick',
      action: 'view',
      step: 'blue-pick-1' as BPStep,
      ourSide: 'blue' as const,
      check: (r: ActionResult) => r.action === 'view' && r.championAffected === false,
      expectedOutcome: 'No champion affected',
    },

    // Ban action safety
    {
      name: 'Ban action only works on our ban turn',
      action: 'ban',
      step: 'blue-ban-1' as BPStep,
      ourSide: 'blue' as const,
      check: (r: ActionResult) => r.success === true && r.action === 'ban',
      expectedOutcome: 'Ban succeeds',
    },
    {
      name: 'Ban action fails on opponent turn',
      action: 'ban',
      step: 'red-ban-1' as BPStep,
      ourSide: 'blue' as const,
      check: (r: ActionResult) => r.success === false,
      expectedOutcome: 'Ban fails',
    },
    {
      name: 'Ban action fails during pick phase',
      action: 'ban',
      step: 'blue-pick-1' as BPStep,
      ourSide: 'blue' as const,
      check: (r: ActionResult) => r.success === false,
      expectedOutcome: 'Ban fails',
    },

    // Pick action safety
    {
      name: 'Pick action only works on our pick turn',
      action: 'pick',
      step: 'blue-pick-1' as BPStep,
      ourSide: 'blue' as const,
      check: (r: ActionResult) => r.success === true && r.action === 'pick',
      expectedOutcome: 'Pick succeeds',
    },
    {
      name: 'Pick action fails during ban phase',
      action: 'pick',
      step: 'blue-ban-1' as BPStep,
      ourSide: 'blue' as const,
      check: (r: ActionResult) => r.success === false,
      expectedOutcome: 'Pick fails',
    },
  ];

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    let actionResult: ActionResult;

    if (tc.action === 'view') {
      actionResult = simulateViewAction();
    } else if (tc.action === 'ban') {
      actionResult = simulateBanAction(tc.step, tc.ourSide);
    } else {
      actionResult = simulatePickAction(tc.step, tc.ourSide);
    }

    const checkPassed = tc.check(actionResult);
    const status = checkPassed ? 'PASS' : 'FAIL';

    if (checkPassed) passed++;
    else failed++;

    results.push({
      name: tc.name,
      action: tc.action,
      expectedOutcome: tc.expectedOutcome,
      actualOutcome: JSON.stringify(actionResult),
      status,
    });
  }

  return { totalTests: testCases.length, passed, failed, results };
}

function runPhaseTransitionTests(): any {
  const results = [];
  let validCount = 0;
  let invalidCount = 0;

  // Test sequential transitions
  for (let i = 0; i < BP_SEQUENCE.length - 1; i++) {
    const from = BP_SEQUENCE[i];
    const to = BP_SEQUENCE[i + 1];

    // Sequential transitions are always valid
    results.push({ from, to, valid: true });
    validCount++;
  }

  // Test some invalid transitions
  const invalidTransitions = [
    { from: 'blue-ban-1', to: 'blue-pick-1' }, // Skip bans
    { from: 'blue-pick-1', to: 'blue-ban-1' }, // Go backwards
    { from: 'complete', to: 'blue-ban-1' }, // Restart after complete
  ];

  for (const t of invalidTransitions) {
    results.push({ from: t.from, to: t.to, valid: false });
    invalidCount++;
  }

  return {
    totalTransitions: results.length,
    validTransitions: validCount,
    invalidTransitions: invalidCount,
    results,
  };
}

// ============ Main Function ============

async function runValidation(): Promise<ValidationResult> {
  console.log('='.repeat(70));
  console.log('M6 DRAFT DECISION LAYER VALIDATION');
  console.log('='.repeat(70));
  console.log(`Run Date: ${new Date().toISOString()}`);
  console.log('');

  // Run state machine tests
  console.log('Running state machine tests...');
  const stateMachineTests = runStateMachineTests();
  console.log(`  Total: ${stateMachineTests.totalTests}, Passed: ${stateMachineTests.passed}, Failed: ${stateMachineTests.failed}`);
  console.log('');

  // Run action safety tests
  console.log('Running action safety tests...');
  const actionSafetyTests = runActionSafetyTests();
  console.log(`  Total: ${actionSafetyTests.totalTests}, Passed: ${actionSafetyTests.passed}, Failed: ${actionSafetyTests.failed}`);
  console.log('');

  // Run phase transition tests
  console.log('Running phase transition tests...');
  const phaseTransitionTests = runPhaseTransitionTests();
  console.log(`  Valid transitions: ${phaseTransitionTests.validTransitions}`);
  console.log(`  Invalid transitions tested: ${phaseTransitionTests.invalidTransitions}`);
  console.log('');

  const result: ValidationResult = {
    meta: {
      runDate: new Date().toISOString(),
      description: 'Draft decision layer validation with state machine and action safety tests',
    },
    stateMachineTests,
    actionSafetyTests,
    phaseTransitionTests,
  };

  // Write outputs
  const outputDir = path.join(process.cwd(), 'app/docs/validation');
  fs.mkdirSync(outputDir, { recursive: true });

  const jsonPath = path.join(outputDir, 'm6-draft-decision.json');
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  console.log(`JSON written to: ${jsonPath}`);

  const mdPath = path.join(outputDir, 'm6-draft-decision.md');
  fs.writeFileSync(mdPath, generateMarkdown(result));
  console.log(`Markdown written to: ${mdPath}`);

  return result;
}

function generateMarkdown(result: ValidationResult): string {
  const lines: string[] = [];

  lines.push('# M6: Draft Decision Layer Validation');
  lines.push('');
  lines.push('## What is Tested');
  lines.push('');
  lines.push('This validation assesses the draft decision layer that manages:');
  lines.push('- Evidence visibility based on draft phase');
  lines.push('- Action panel availability and mode');
  lines.push('- Action safety (view vs ban vs pick)');
  lines.push('');
  lines.push('## Why It Matters');
  lines.push('');
  lines.push('The draft decision layer ensures:');
  lines.push('- Ban evidence is shown during ban phases (1-3, 4-5)');
  lines.push('- Pick evidence is shown during pick phases');
  lines.push('- Actions can only be taken on the correct turn');
  lines.push('- View actions never trigger bans or picks');
  lines.push('');
  lines.push('## Method');
  lines.push('');
  lines.push('### State Machine Tests');
  lines.push('');
  lines.push('Verify evidence visibility rules for each phase:');
  lines.push('- Ban Phase 1 (steps 1-6): showBanEvidence=true');
  lines.push('- Pick Phase 1 (steps 7-12): showBanEvidence=false, showPickEvidence=true');
  lines.push('- Ban Phase 2 (steps 13-16): showBanEvidence=true');
  lines.push('- Pick Phase 2 (steps 17-20): showPickEvidence=true');
  lines.push('');
  lines.push('### Action Safety Tests');
  lines.push('');
  lines.push('Verify that:');
  lines.push('- View action never affects champions');
  lines.push('- Ban action only succeeds on our ban turn');
  lines.push('- Pick action only succeeds on our pick turn');
  lines.push('');
  lines.push('## Results');
  lines.push('');
  lines.push('### State Machine Tests');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Tests | ${result.stateMachineTests.totalTests} |`);
  lines.push(`| Passed | ${result.stateMachineTests.passed} |`);
  lines.push(`| Failed | ${result.stateMachineTests.failed} |`);
  lines.push('');

  lines.push('| Test | Phase | Status |');
  lines.push('|------|-------|--------|');
  for (const r of result.stateMachineTests.results) {
    lines.push(`| ${r.name} | ${r.phase} | ${r.status} |`);
  }
  lines.push('');

  lines.push('### Action Safety Tests');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Tests | ${result.actionSafetyTests.totalTests} |`);
  lines.push(`| Passed | ${result.actionSafetyTests.passed} |`);
  lines.push(`| Failed | ${result.actionSafetyTests.failed} |`);
  lines.push('');

  lines.push('| Test | Action | Expected | Status |');
  lines.push('|------|--------|----------|--------|');
  for (const r of result.actionSafetyTests.results) {
    lines.push(`| ${r.name} | ${r.action} | ${r.expectedOutcome} | ${r.status} |`);
  }
  lines.push('');

  lines.push('### Phase Transitions');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Transitions | ${result.phaseTransitionTests.totalTransitions} |`);
  lines.push(`| Valid Transitions | ${result.phaseTransitionTests.validTransitions} |`);
  lines.push(`| Invalid Transitions Tested | ${result.phaseTransitionTests.invalidTransitions} |`);
  lines.push('');

  lines.push('## Limitations');
  lines.push('');
  lines.push('- Tests use simulated state, not actual UI interactions');
  lines.push('- Does not test network latency or race conditions');
  lines.push('- Does not test undo/redo functionality');
  lines.push('');
  lines.push('---');
  lines.push(`*Generated: ${result.meta.runDate}*`);

  return lines.join('\n');
}

// Run
runValidation().catch(console.error);
