/**
 * v4-1 Main Engine Orchestrator
 *
 * Coordinates all four layers (L0-L3) to generate final recommendations.
 * This is the main entry point for the v4-1 architecture.
 */

import { Champion, BPState, BPStep, Team } from '../types';
import { bpStateToDraftState } from './core/draft-state';
import { loadL0Data } from './l0-data';
import { evaluateChampions } from './l1-evaluation';
import { generateRecommendations } from './l2-recommendation';
import { calculateStrategicAdjustments } from './l3-strategic';
import { L1Config, DEFAULT_L1_CONFIG } from './types/l1-types';
import { L2Config, DEFAULT_L2_CONFIG, RecommendationResult } from './types/l2-types';
import { L3Config, DEFAULT_L3_CONFIG } from './types/l3-types';

/**
 * v4-1 Engine configuration
 */
export interface V4Config {
  l1Config?: L1Config;
  l2Config?: L2Config;
  l3Config?: L3Config;
  enableL3?: boolean;        // Default: true
  cacheL0?: boolean;         // Default: true
}

/**
 * Default v4-1 configuration
 */
export const DEFAULT_V4_CONFIG: V4Config = {
  l1Config: DEFAULT_L1_CONFIG,
  l2Config: DEFAULT_L2_CONFIG,
  l3Config: DEFAULT_L3_CONFIG,
  enableL3: true,
  cacheL0: true,
};

/**
 * Main v4-1 engine: Generate recommendations
 *
 * This is the primary entry point for the v4-1 architecture.
 * It coordinates all four layers to produce final recommendations.
 */
export async function generateV4Recommendations(
  bpState: BPState,
  currentStep: BPStep,
  side: Team,
  availableChampions: Champion[],
  opponentPlayerIds?: string[],
  config: V4Config = DEFAULT_V4_CONFIG
): Promise<RecommendationResult> {
  console.log('v4-1 Engine: Starting recommendation generation...');
  const startTime = Date.now();

  // Step 1: Load L0 data (with caching)
  console.log('v4-1 Engine: Loading L0 data...');
  const l0StartTime = Date.now();
  const l0Data = await loadL0Data();
  const l0Time = Date.now() - l0StartTime;
  console.log(`v4-1 Engine: L0 data loaded in ${l0Time}ms`);

  // Step 2: Convert to DraftState
  const draftState = bpStateToDraftState(bpState, currentStep, side, availableChampions);
  console.log(`v4-1 Engine: Draft phase: ${draftState.phase}, turn: ${draftState.turn}`);

  // Step 3: Run L1 evaluation
  console.log('v4-1 Engine: Running L1 evaluation...');
  const l1StartTime = Date.now();
  const l1Result = await evaluateChampions(
    draftState,
    availableChampions,
    l0Data,
    opponentPlayerIds,
    config.l1Config || DEFAULT_L1_CONFIG
  );
  const l1Time = Date.now() - l1StartTime;
  console.log(`v4-1 Engine: L1 evaluation completed in ${l1Time}ms`);
  console.log(`v4-1 Engine: Evaluated ${l1Result.championEvaluations.length} champions`);

  // Step 4: Run L3 strategic analysis (if enabled)
  let l3Result = null;
  let l3Time = 0;

  if (config.enableL3 && config.l3Config?.enabled !== false) {
    console.log('v4-1 Engine: Running L3 strategic analysis...');
    const l3StartTime = Date.now();

    const l1EvalMap = new Map(
      l1Result.championEvaluations.map(e => [e.championId, e])
    );

    l3Result = await calculateStrategicAdjustments(
      draftState,
      availableChampions,
      l0Data,
      l1EvalMap,
      opponentPlayerIds,
      config.l3Config || DEFAULT_L3_CONFIG
    );

    l3Time = Date.now() - l3StartTime;
    console.log(`v4-1 Engine: L3 analysis completed in ${l3Time}ms`);
    console.log(`v4-1 Engine: L3 confidence: ${(l3Result.overallConfidence * 100).toFixed(1)}%`);
  } else {
    console.log('v4-1 Engine: L3 disabled, skipping strategic analysis');
  }

  // Step 5: Generate L2 recommendations
  console.log('v4-1 Engine: Generating L2 recommendations...');
  const l2StartTime = Date.now();

  // Check if AI Pick reason generation is enabled
  const useAI = process.env.AI_PICK_REASON_ENABLED === 'true';
  if (useAI) {
    console.log('v4-1 Engine: AI Pick reason generation enabled');
  }

  const l2Result = await generateRecommendations(
    l1Result.championEvaluations,
    availableChampions,
    l3Result?.adjustments || new Map(),
    config.l2Config || DEFAULT_L2_CONFIG,
    draftState,
    useAI
  );
  const l2Time = Date.now() - l2StartTime;
  console.log(`v4-1 Engine: L2 recommendations generated in ${l2Time}ms`);

  const totalTime = Date.now() - startTime;
  console.log(`v4-1 Engine: Total time: ${totalTime}ms`);
  console.log(`v4-1 Engine: Generated ${l2Result.recommendations.length} recommendations`);
  console.log(`v4-1 Engine: Tier distribution: ${l2Result.summary.mustPickCount} MustPick, ${l2Result.summary.strongCount} Strong, ${l2Result.summary.stableCount} Stable`);

  return l2Result;
}

/**
 * Quick recommendations (L1 + L2 only, no L3)
 *
 * Faster version that skips strategic analysis.
 * Use when speed is more important than strategic depth.
 */
export async function generateQuickRecommendations(
  bpState: BPState,
  currentStep: BPStep,
  side: Team,
  availableChampions: Champion[],
  config: V4Config = DEFAULT_V4_CONFIG
): Promise<RecommendationResult> {
  return generateV4Recommendations(
    bpState,
    currentStep,
    side,
    availableChampions,
    undefined,
    {
      ...config,
      enableL3: false,
    }
  );
}

/**
 * Get top N recommendations
 */
export function getTopN(
  result: RecommendationResult,
  n: number = 5
): RecommendationResult['recommendations'] {
  return result.recommendations.slice(0, n);
}

/**
 * Get must-pick recommendations
 */
export function getMustPicks(
  result: RecommendationResult
): RecommendationResult['recommendations'] {
  return result.recommendations.filter(r => r.tier === 'MustPick');
}

/**
 * Get safe recommendations (high confidence, low uncertainty)
 */
export function getSafeRecommendations(
  result: RecommendationResult,
  minConfidence: number = 0.7
): RecommendationResult['recommendations'] {
  return result.recommendations.filter(r => {
    const hasHighUncertainty = r.uncertainties.some(u => u.severity === 'high');
    return r.confidence >= minConfidence && !hasHighUncertainty;
  });
}

/**
 * Format recommendation for display
 */
export function formatRecommendation(
  rec: RecommendationResult['recommendations'][0],
  verbose: boolean = false
): string {
  const lines: string[] = [];

  // Header
  lines.push(`${rec.champion.name} [${rec.tier}]`);
  lines.push(`  Score: ${rec.finalScore.toFixed(3)} | Confidence: ${(rec.confidence * 100).toFixed(1)}%`);

  // Why pick
  if (rec.whyPick.length > 0) {
    lines.push(`  Why Pick:`);
    rec.whyPick.forEach(reason => {
      lines.push(`    ✓ ${reason.text}`);
    });
  }

  // Why not (if any)
  if (rec.whyNot.length > 0 && verbose) {
    lines.push(`  Why Not:`);
    rec.whyNot.forEach(reason => {
      lines.push(`    ✗ ${reason.text}`);
    });
  }

  // Uncertainties (if any)
  if (rec.uncertainties.length > 0) {
    lines.push(`  Uncertainties:`);
    rec.uncertainties.forEach(u => {
      lines.push(`    ⚠️  [${u.severity.toUpperCase()}] ${u.message}`);
    });
  }

  return lines.join('\n');
}

/**
 * Print summary statistics
 */
export function printSummary(result: RecommendationResult): void {
  console.log('\n' + '='.repeat(60));
  console.log('v4-1 Recommendation Summary');
  console.log('='.repeat(60));
  console.log(`Total Evaluated: ${result.summary.totalEvaluated}`);
  console.log(`Average Confidence: ${(result.summary.avgConfidence * 100).toFixed(1)}%`);
  console.log('\nTier Distribution:');
  console.log(`  MustPick: ${result.summary.mustPickCount}`);
  console.log(`  Strong: ${result.summary.strongCount}`);
  console.log(`  Stable: ${result.summary.stableCount}`);
  console.log(`  Situational: ${result.summary.situationalCount}`);
  console.log(`  Avoid: ${result.summary.avoidCount}`);
  console.log('\nTeam Analysis:');
  console.log(`  Current Strength: ${(result.teamAnalysis.currentStrength * 100).toFixed(1)}%`);
  console.log(`  Strategic Position: ${result.teamAnalysis.strategicPosition}`);
  if (result.teamAnalysis.compositionGaps.length > 0) {
    console.log(`  Composition Gaps: ${result.teamAnalysis.compositionGaps.join(', ')}`);
  }
  console.log('='.repeat(60) + '\n');
}
