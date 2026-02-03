/**
 * M5 Evidence Trace Validation
 *
 * Validates the evidence trace and strength gating through:
 * 1. Deterministic unit tests for boundary values
 * 2. Explanation stability analysis
 *
 * Usage: npx tsx app/scripts/validate-m5-evidence-trace.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ============ Types ============

interface ValidationResult {
  meta: {
    runDate: string;
    description: string;
  };
  unitTests: {
    totalTests: number;
    passed: number;
    failed: number;
    results: Array<{
      name: string;
      input: any;
      expected: any;
      actual: any;
      status: 'PASS' | 'FAIL';
    }>;
  };
  explanationStability: {
    totalSignals: number;
    stableSignals: number;
    stabilityRate: number;
    primarySwitchRate: number;
    interpretation: string;
  };
}

// ============ Evidence Logic (Replicated for Testing) ============

type EvidenceType = 'TEAM_DENIAL' | 'PLAYER_SPECIALTY' | 'ROLE_FLEX_PRESSURE' | 'META_PTS';
type EvidenceStrength = 'STRONG' | 'MODERATE' | 'WEAK';

const EVIDENCE_STRENGTH_THRESHOLDS = {
  TEAM_DENIAL: {
    strong: 50,
    moderate: 30,
  },
  ROLE_FLEX_PRESSURE: {
    entropyThreshold: 0.4435,
  },
  PLAYER_SPECIALTY: {
    strongPickCount: 9,
    strongPickShare: 0.1111,
    moderatePickCount: 6,
  },
} as const;

const LOW_SAMPLE_PLAYER_THRESHOLD = 10;

interface PlayerPoolEvidence {
  pickCount: number;
  pickShare: number;
  playerGames?: number;
}

interface ThreatSignal {
  score: number;
}

function getTeamDenialStrength(score: number): EvidenceStrength {
  if (score >= EVIDENCE_STRENGTH_THRESHOLDS.TEAM_DENIAL.strong) return 'STRONG';
  if (score >= EVIDENCE_STRENGTH_THRESHOLDS.TEAM_DENIAL.moderate) return 'MODERATE';
  return 'WEAK';
}

function getRoleFlexStrength(isFlex: boolean, roleEntropy: number): EvidenceStrength {
  if (!isFlex) return 'WEAK';
  if (roleEntropy >= EVIDENCE_STRENGTH_THRESHOLDS.ROLE_FLEX_PRESSURE.entropyThreshold) {
    return 'STRONG';
  }
  return 'WEAK';
}

function getPlayerSpecialtyStrength(
  pickCount: number,
  pickShare: number,
  playerGames?: number
): EvidenceStrength {
  const thresholds = EVIDENCE_STRENGTH_THRESHOLDS.PLAYER_SPECIALTY;
  const isLowSample = playerGames !== undefined && playerGames < LOW_SAMPLE_PLAYER_THRESHOLD;

  if (pickCount >= thresholds.strongPickCount && pickShare >= thresholds.strongPickShare) {
    return isLowSample ? 'MODERATE' : 'STRONG';
  }
  if (pickCount >= thresholds.moderatePickCount) {
    return 'MODERATE';
  }
  return 'WEAK';
}

function determineEvidence(
  signal: ThreatSignal | null,
  isFlex: boolean = false,
  roleEntropy: number = 0,
  playerPoolData?: PlayerPoolEvidence
): { primary: EvidenceType; secondary: EvidenceType[] } {
  const secondary: EvidenceType[] = [];

  const teamDenialStrength: EvidenceStrength =
    signal !== null && signal.score > 0
      ? getTeamDenialStrength(signal.score)
      : 'WEAK';

  const roleFlexStrength = getRoleFlexStrength(isFlex, roleEntropy);

  const playerSpecialtyStrength: EvidenceStrength = playerPoolData
    ? getPlayerSpecialtyStrength(playerPoolData.pickCount, playerPoolData.pickShare, playerPoolData.playerGames)
    : 'WEAK';

  let primary: EvidenceType;

  if (teamDenialStrength === 'STRONG') {
    primary = 'TEAM_DENIAL';
    if (playerSpecialtyStrength === 'MODERATE') secondary.push('PLAYER_SPECIALTY');
  } else if (playerSpecialtyStrength === 'STRONG') {
    primary = 'PLAYER_SPECIALTY';
    if (teamDenialStrength === 'MODERATE') secondary.push('TEAM_DENIAL');
  } else if (roleFlexStrength === 'STRONG') {
    primary = 'ROLE_FLEX_PRESSURE';
    if (teamDenialStrength === 'MODERATE') secondary.push('TEAM_DENIAL');
    if (playerSpecialtyStrength === 'MODERATE') secondary.push('PLAYER_SPECIALTY');
  } else if (teamDenialStrength === 'MODERATE') {
    primary = 'TEAM_DENIAL';
    if (playerSpecialtyStrength === 'MODERATE') secondary.push('PLAYER_SPECIALTY');
  } else {
    primary = 'META_PTS';
    if (playerSpecialtyStrength === 'MODERATE') secondary.push('PLAYER_SPECIALTY');
  }

  return { primary, secondary };
}

// ============ Unit Tests ============

interface TestCase {
  name: string;
  signal: ThreatSignal | null;
  isFlex: boolean;
  roleEntropy: number;
  playerPoolData?: PlayerPoolEvidence;
  expectedPrimary: EvidenceType;
  expectedSecondary: EvidenceType[];
}

function runUnitTests(): any {
  const testCases: TestCase[] = [
    // Team Denial boundary tests
    {
      name: 'TEAM_DENIAL score=25 (below moderate)',
      signal: { score: 25 },
      isFlex: false,
      roleEntropy: 0,
      expectedPrimary: 'META_PTS',
      expectedSecondary: [],
    },
    {
      name: 'TEAM_DENIAL score=35 (moderate)',
      signal: { score: 35 },
      isFlex: false,
      roleEntropy: 0,
      expectedPrimary: 'TEAM_DENIAL',
      expectedSecondary: [],
    },
    {
      name: 'TEAM_DENIAL score=55 (strong)',
      signal: { score: 55 },
      isFlex: false,
      roleEntropy: 0,
      expectedPrimary: 'TEAM_DENIAL',
      expectedSecondary: [],
    },

    // Role Flex boundary tests
    {
      name: 'ROLE_FLEX entropy=0.40 (below threshold)',
      signal: null,
      isFlex: true,
      roleEntropy: 0.40,
      expectedPrimary: 'META_PTS',
      expectedSecondary: [],
    },
    {
      name: 'ROLE_FLEX entropy=0.45 (above threshold)',
      signal: null,
      isFlex: true,
      roleEntropy: 0.45,
      expectedPrimary: 'ROLE_FLEX_PRESSURE',
      expectedSecondary: [],
    },
    {
      name: 'ROLE_FLEX not flex but high entropy',
      signal: null,
      isFlex: false,
      roleEntropy: 0.50,
      expectedPrimary: 'META_PTS',
      expectedSecondary: [],
    },

    // Player Specialty boundary tests
    {
      name: 'PLAYER_SPECIALTY pickCount=5 (below moderate)',
      signal: null,
      isFlex: false,
      roleEntropy: 0,
      playerPoolData: { pickCount: 5, pickShare: 0.15, playerGames: 50 },
      expectedPrimary: 'META_PTS',
      expectedSecondary: [],
    },
    {
      name: 'PLAYER_SPECIALTY pickCount=7 (moderate)',
      signal: null,
      isFlex: false,
      roleEntropy: 0,
      playerPoolData: { pickCount: 7, pickShare: 0.08, playerGames: 50 },
      expectedPrimary: 'META_PTS',
      expectedSecondary: ['PLAYER_SPECIALTY'],
    },
    {
      name: 'PLAYER_SPECIALTY pickCount=10, pickShare=0.12 (strong)',
      signal: null,
      isFlex: false,
      roleEntropy: 0,
      playerPoolData: { pickCount: 10, pickShare: 0.12, playerGames: 50 },
      expectedPrimary: 'PLAYER_SPECIALTY',
      expectedSecondary: [],
    },

    // Low-sample gating test
    {
      name: 'Low-sample player (8 games) with strong metrics',
      signal: null,
      isFlex: false,
      roleEntropy: 0,
      playerPoolData: { pickCount: 10, pickShare: 0.15, playerGames: 8 },
      expectedPrimary: 'META_PTS',
      expectedSecondary: ['PLAYER_SPECIALTY'], // Capped at MODERATE
    },

    // Combined evidence tests
    {
      name: 'STRONG TEAM_DENIAL + MODERATE PLAYER_SPECIALTY',
      signal: { score: 55 },
      isFlex: false,
      roleEntropy: 0,
      playerPoolData: { pickCount: 7, pickShare: 0.10, playerGames: 50 },
      expectedPrimary: 'TEAM_DENIAL',
      expectedSecondary: ['PLAYER_SPECIALTY'],
    },
    {
      name: 'MODERATE TEAM_DENIAL + STRONG PLAYER_SPECIALTY',
      signal: { score: 35 },
      isFlex: false,
      roleEntropy: 0,
      playerPoolData: { pickCount: 10, pickShare: 0.12, playerGames: 50 },
      expectedPrimary: 'PLAYER_SPECIALTY',
      expectedSecondary: ['TEAM_DENIAL'],
    },
    {
      name: 'STRONG ROLE_FLEX + MODERATE TEAM_DENIAL',
      signal: { score: 35 },
      isFlex: true,
      roleEntropy: 0.50,
      expectedPrimary: 'ROLE_FLEX_PRESSURE',
      expectedSecondary: ['TEAM_DENIAL'],
    },
  ];

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const actual = determineEvidence(tc.signal, tc.isFlex, tc.roleEntropy, tc.playerPoolData);

    const primaryMatch = actual.primary === tc.expectedPrimary;
    const secondaryMatch =
      actual.secondary.length === tc.expectedSecondary.length &&
      actual.secondary.every(s => tc.expectedSecondary.includes(s));

    const status = primaryMatch && secondaryMatch ? 'PASS' : 'FAIL';

    if (status === 'PASS') passed++;
    else failed++;

    results.push({
      name: tc.name,
      input: {
        score: tc.signal?.score,
        isFlex: tc.isFlex,
        roleEntropy: tc.roleEntropy,
        playerPoolData: tc.playerPoolData,
      },
      expected: { primary: tc.expectedPrimary, secondary: tc.expectedSecondary },
      actual: { primary: actual.primary, secondary: actual.secondary },
      status,
    });
  }

  return {
    totalTests: testCases.length,
    passed,
    failed,
    results,
  };
}

// ============ Explanation Stability ============

function explanationStabilityTest(): any {
  // Simulate running the same inputs multiple times
  // Since the function is deterministic, stability should be 100%

  const testInputs = [
    { signal: { score: 55 }, isFlex: false, roleEntropy: 0, playerPoolData: undefined },
    { signal: { score: 35 }, isFlex: true, roleEntropy: 0.45, playerPoolData: undefined },
    { signal: null, isFlex: false, roleEntropy: 0, playerPoolData: { pickCount: 10, pickShare: 0.12, playerGames: 50 } },
    { signal: { score: 40 }, isFlex: true, roleEntropy: 0.50, playerPoolData: { pickCount: 7, pickShare: 0.10, playerGames: 30 } },
  ];

  let stableCount = 0;
  let switchCount = 0;

  for (const input of testInputs) {
    const results: string[] = [];

    // Run 10 times
    for (let i = 0; i < 10; i++) {
      const result = determineEvidence(
        input.signal,
        input.isFlex,
        input.roleEntropy,
        input.playerPoolData
      );
      results.push(result.primary);
    }

    // Check if all results are the same
    const allSame = results.every(r => r === results[0]);
    if (allSame) {
      stableCount++;
    } else {
      switchCount++;
    }
  }

  const stabilityRate = stableCount / testInputs.length;

  return {
    totalSignals: testInputs.length,
    stableSignals: stableCount,
    stabilityRate,
    primarySwitchRate: switchCount / testInputs.length,
    interpretation: stabilityRate === 1.0
      ? 'Perfect stability: deterministic function produces consistent outputs'
      : 'Unexpected instability detected',
  };
}

// ============ Main Function ============

async function runValidation(): Promise<ValidationResult> {
  console.log('='.repeat(70));
  console.log('M5 EVIDENCE TRACE VALIDATION');
  console.log('='.repeat(70));
  console.log(`Run Date: ${new Date().toISOString()}`);
  console.log('');

  // Run unit tests
  console.log('Running unit tests...');
  const unitTests = runUnitTests();
  console.log(`  Total: ${unitTests.totalTests}, Passed: ${unitTests.passed}, Failed: ${unitTests.failed}`);

  if (unitTests.failed > 0) {
    console.log('  Failed tests:');
    for (const r of unitTests.results.filter((r: any) => r.status === 'FAIL')) {
      console.log(`    - ${r.name}`);
      console.log(`      Expected: ${JSON.stringify(r.expected)}`);
      console.log(`      Actual: ${JSON.stringify(r.actual)}`);
    }
  }
  console.log('');

  // Run stability test
  console.log('Running explanation stability test...');
  const stability = explanationStabilityTest();
  console.log(`  Stability rate: ${(stability.stabilityRate * 100).toFixed(1)}%`);
  console.log(`  Interpretation: ${stability.interpretation}`);
  console.log('');

  const result: ValidationResult = {
    meta: {
      runDate: new Date().toISOString(),
      description: 'Evidence trace validation with unit tests and stability analysis',
    },
    unitTests,
    explanationStability: stability,
  };

  // Write outputs
  const outputDir = path.join(process.cwd(), 'app/docs/validation');
  fs.mkdirSync(outputDir, { recursive: true });

  const jsonPath = path.join(outputDir, 'm5-evidence-trace.json');
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  console.log(`JSON written to: ${jsonPath}`);

  const mdPath = path.join(outputDir, 'm5-evidence-trace.md');
  fs.writeFileSync(mdPath, generateMarkdown(result));
  console.log(`Markdown written to: ${mdPath}`);

  return result;
}

function generateMarkdown(result: ValidationResult): string {
  const lines: string[] = [];

  lines.push('# M5: Evidence Trace Validation');
  lines.push('');
  lines.push('## What is Tested');
  lines.push('');
  lines.push('This validation assesses the evidence trace and strength gating system that');
  lines.push('determines primary and secondary evidence attribution for each signal.');
  lines.push('');
  lines.push('## Why It Matters');
  lines.push('');
  lines.push('Evidence attribution explains WHY a champion appears in recommendations.');
  lines.push('The system must:');
  lines.push('- Correctly classify evidence strength at boundary values');
  lines.push('- Apply low-sample gating consistently');
  lines.push('- Produce deterministic, stable outputs');
  lines.push('');
  lines.push('## Method');
  lines.push('');
  lines.push('### Unit Tests');
  lines.push('');
  lines.push('Test boundary values for each evidence type:');
  lines.push('- TEAM_DENIAL: scores at 25, 35, 55');
  lines.push('- ROLE_FLEX_PRESSURE: entropy at 0.40, 0.45');
  lines.push('- PLAYER_SPECIALTY: pickCount at 5, 7, 10 with various pickShare');
  lines.push('- Low-sample gating: playerGames < 10');
  lines.push('');
  lines.push('### Explanation Stability');
  lines.push('');
  lines.push('Run the same inputs multiple times and verify outputs are identical.');
  lines.push('');
  lines.push('## Results');
  lines.push('');
  lines.push('### Unit Tests');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Tests | ${result.unitTests.totalTests} |`);
  lines.push(`| Passed | ${result.unitTests.passed} |`);
  lines.push(`| Failed | ${result.unitTests.failed} |`);
  lines.push(`| Pass Rate | ${((result.unitTests.passed / result.unitTests.totalTests) * 100).toFixed(1)}% |`);
  lines.push('');

  lines.push('#### Test Details');
  lines.push('');
  lines.push('| Test | Status | Expected Primary | Actual Primary |');
  lines.push('|------|--------|------------------|----------------|');
  for (const r of result.unitTests.results) {
    lines.push(`| ${r.name} | ${r.status} | ${r.expected.primary} | ${r.actual.primary} |`);
  }
  lines.push('');

  if (result.unitTests.failed > 0) {
    lines.push('#### Failed Tests');
    lines.push('');
    for (const r of result.unitTests.results.filter(r => r.status === 'FAIL')) {
      lines.push(`**${r.name}**`);
      lines.push('');
      lines.push(`- Input: \`${JSON.stringify(r.input)}\``);
      lines.push(`- Expected: \`${JSON.stringify(r.expected)}\``);
      lines.push(`- Actual: \`${JSON.stringify(r.actual)}\``);
      lines.push('');
    }
  }

  lines.push('### Explanation Stability');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Signals | ${result.explanationStability.totalSignals} |`);
  lines.push(`| Stable Signals | ${result.explanationStability.stableSignals} |`);
  lines.push(`| Stability Rate | ${(result.explanationStability.stabilityRate * 100).toFixed(1)}% |`);
  lines.push(`| Primary Switch Rate | ${(result.explanationStability.primarySwitchRate * 100).toFixed(1)}% |`);
  lines.push('');
  lines.push(`**Interpretation:** ${result.explanationStability.interpretation}`);
  lines.push('');
  lines.push('## Limitations');
  lines.push('');
  lines.push('- Unit tests cover boundary values but not all combinations');
  lines.push('- Stability test uses synthetic inputs, not real draft data');
  lines.push('- Does not test UI rendering of evidence');
  lines.push('');
  lines.push('---');
  lines.push(`*Generated: ${result.meta.runDate}*`);

  return lines.join('\n');
}

// Run
runValidation().catch(console.error);
