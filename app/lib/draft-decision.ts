/**
 * Draft Decision Layer
 *
 * Step 4: Draft-State Integration & Decision Tag Execution
 * Step 4.1: Consistency Fix - Percentile-based thresholds
 * Step 3 (Evidence Trace): Evidence attribution for each decision
 *
 * Maps threat signals to actionable decisions based on:
 * 1. Threat score → Decision Tag (percentile-based, entity-aware)
 * 2. Draft state → Availability status
 * 3. Decision Tag + Draft State → Action label
 * 4. Evidence attribution → Primary/Secondary evidence sources
 *
 * CONSISTENCY GUARANTEE (Step 4.1):
 * - Thresholds are derived from Step 3.6 diagnostics percentiles
 * - Team and Player have DIFFERENT thresholds (player has higher bar)
 * - If signal already contains decisionTag, use it directly
 * - Dev-only consistency assertion warns on mismatch
 */

import { ThreatSignal } from './threat-types';
import { BPState, BanEntry, Champion, BPStep } from './types';
import { BP_SEQUENCE } from './bp-logic';

// ============ Evidence Types (Step 3) ============

/**
 * Evidence source types for ban recommendations
 *
 * These describe WHERE the recommendation signal comes from,
 * NOT how strong it is. Used for explanation only, not ranking.
 */
export type EvidenceType =
  | 'TEAM_DENIAL'       // Historical ban pattern vs this team
  | 'PLAYER_SPECIALTY'  // Player champion pool concentration
  | 'ROLE_FLEX_PRESSURE' // Role ambiguity pressure in current draft
  | 'META_PTS';         // General meta value (PTS-driven, non-targeted)

/**
 * Human-readable labels for evidence types
 */
export const EVIDENCE_LABELS: Record<EvidenceType, string> = {
  TEAM_DENIAL: 'Team Denial',
  PLAYER_SPECIALTY: 'Player Specialty',
  ROLE_FLEX_PRESSURE: 'Role Flex',
  META_PTS: 'Meta Value',
};

/**
 * Short descriptions for evidence types (for tooltips)
 */
export const EVIDENCE_DESCRIPTIONS: Record<EvidenceType, string> = {
  TEAM_DENIAL: 'Historically banned above baseline vs this team',
  PLAYER_SPECIALTY: 'High concentration in player champion pool',
  ROLE_FLEX_PRESSURE: 'Role ambiguity creates draft pressure',
  META_PTS: 'General meta priority (PTS-driven)',
};

// ============ Types ============

/**
 * Entity type for threshold selection
 */
export type ThreatEntityType = 'team' | 'player';

/**
 * Decision tags based on threat score thresholds
 *
 * Thresholds derived from Step 3.6 diagnostics (POSITIVE-ONLY mode):
 *
 * TEAM thresholds (among score>0 entries):
 * - P90 = 54.2, P95 = 65.2, P99 = 83.7
 * - score >= 70: top 3.8% → Ban-Critical
 * - score >= 50: top 14.5% → Ban-or-Prepare
 * - score >= 30: top 18.9% → Prepare-Counter
 *
 * PLAYER thresholds (among score>0 entries):
 * - P90 = 59.3, P95 = 70.3, P99 = 88.9
 * - score >= 75: top ~4% → Ban-Critical (higher bar for player-only)
 * - score >= 55: top ~15% → Ban-or-Prepare
 * - score >= 35: top ~22% → Prepare-Counter
 */
export type DecisionTag =
  | 'Ban-Critical'
  | 'Ban-or-Prepare'
  | 'Prepare-Counter'
  | 'Monitor';

/**
 * Draft state status for a champion
 */
export type DraftStatus =
  | 'available'
  | 'already-banned'
  | 'already-picked-by-us'
  | 'already-picked-by-opponent'
  | 'no-longer-actionable';

/**
 * Action label derived from DecisionTag + DraftStatus
 */
export type ActionLabel =
  | 'BAN NOW'
  | 'BAN or PREPARE'
  | 'PREPARE COUNTER'
  | 'MONITOR'
  | 'ALREADY BANNED'
  | 'OPPONENT HAS'
  | 'WE HAVE'
  | 'BAN PHASE PASSED';

/**
 * Extended threat entry with decision context
 */
export interface ThreatDecision {
  signal: ThreatSignal;
  decisionTag: DecisionTag;
  draftStatus: DraftStatus;
  actionLabel: ActionLabel;
  isActionable: boolean;
  explanation: string;
  priority: number; // For sorting: lower = higher priority
  /** Primary evidence source driving this recommendation */
  primaryEvidence: EvidenceType;
  /** Secondary evidence sources (optional, for additional context) */
  secondaryEvidence?: EvidenceType[];
}

/**
 * Decision layer configuration
 * Thresholds are percentile-based from Step 3.6 diagnostics
 */
export interface DecisionConfig {
  /** Team thresholds (lower bar - team signals are aggregated) */
  team: {
    banCriticalThreshold: number;  // P95 ≈ 65, using 70 for top ~4%
    banOrPrepareThreshold: number; // P90 ≈ 54, using 50 for top ~15%
    prepareCounterThreshold: number; // using 30 for top ~19%
  };
  /** Player thresholds (higher bar - player signals need more evidence) */
  player: {
    banCriticalThreshold: number;  // P95 ≈ 70, using 75 for top ~4%
    banOrPrepareThreshold: number; // P90 ≈ 59, using 55 for top ~15%
    prepareCounterThreshold: number; // using 35 for top ~22%
  };
  /** Max Ban-Critical items to show (default: 3) */
  maxBanCritical: number;
  /** Max total actionable items to show (default: 5) */
  maxActionable: number;
}

/**
 * Default thresholds derived from Step 3.6 diagnostics
 * These are calibrated to percentiles of POSITIVE-ONLY score distributions
 */
export const DEFAULT_DECISION_CONFIG: DecisionConfig = {
  team: {
    banCriticalThreshold: 70,   // top ~3.8% of positive team signals
    banOrPrepareThreshold: 50,  // top ~14.5% of positive team signals
    prepareCounterThreshold: 30, // top ~18.9% of positive team signals
  },
  player: {
    banCriticalThreshold: 75,   // top ~4% of positive player signals (higher bar)
    banOrPrepareThreshold: 55,  // top ~15% of positive player signals
    prepareCounterThreshold: 35, // top ~22% of positive player signals
  },
  maxBanCritical: 3,
  maxActionable: 5,
};

// ============ Consistency Assertion (Dev-only) ============

let consistencyWarningShown = false;

/**
 * Dev-only consistency check: warn if derived tag differs from pre-computed tag
 */
function assertConsistency(
  signal: ThreatSignal,
  derivedTag: DecisionTag,
  preComputedTag?: DecisionTag
): void {
  if (process.env.NODE_ENV === 'production') return;
  if (!preComputedTag) return;
  if (derivedTag === preComputedTag) return;

  if (!consistencyWarningShown) {
    console.warn(
      `[draft-decision] Consistency warning: Signal for ${signal.championName} ` +
      `has pre-computed tag "${preComputedTag}" but derived tag is "${derivedTag}". ` +
      `Score: ${signal.score.toFixed(1)}. Using pre-computed tag.`
    );
    consistencyWarningShown = true;
  }
}

// ============ Decision Tag Logic ============

/**
 * Get decision tag based on threat score and entity type
 *
 * Priority order:
 * 1. If signal has pre-computed decisionTag, use it directly
 * 2. Otherwise, derive from score using entity-specific thresholds
 *
 * @param score - Threat score (0-100)
 * @param entityType - 'team' or 'player' (affects thresholds)
 * @param config - Decision configuration
 * @param preComputedTag - Optional pre-computed tag from backend
 */
export function getDecisionTag(
  score: number,
  entityType: ThreatEntityType = 'team',
  config: DecisionConfig = DEFAULT_DECISION_CONFIG,
  preComputedTag?: DecisionTag
): DecisionTag {
  // Priority 1: Use pre-computed tag if available
  if (preComputedTag) {
    return preComputedTag;
  }

  // Priority 2: Derive from score using entity-specific thresholds
  const thresholds = entityType === 'team' ? config.team : config.player;

  const derivedTag = deriveDecisionTag(score, thresholds);

  return derivedTag;
}

/**
 * Internal: derive decision tag from score and thresholds
 */
function deriveDecisionTag(
  score: number,
  thresholds: { banCriticalThreshold: number; banOrPrepareThreshold: number; prepareCounterThreshold: number }
): DecisionTag {
  if (score >= thresholds.banCriticalThreshold) return 'Ban-Critical';
  if (score >= thresholds.banOrPrepareThreshold) return 'Ban-or-Prepare';
  if (score >= thresholds.prepareCounterThreshold) return 'Prepare-Counter';
  return 'Monitor';
}

/**
 * Get decision tag with consistency assertion (for signals that may have pre-computed tags)
 */
export function getDecisionTagWithAssertion(
  signal: ThreatSignal & { decisionTag?: DecisionTag },
  entityType: ThreatEntityType = 'team',
  config: DecisionConfig = DEFAULT_DECISION_CONFIG
): DecisionTag {
  const thresholds = entityType === 'team' ? config.team : config.player;
  const derivedTag = deriveDecisionTag(signal.score, thresholds);

  // If signal has pre-computed tag, use it but assert consistency
  if (signal.decisionTag) {
    assertConsistency(signal, derivedTag, signal.decisionTag);
    return signal.decisionTag;
  }

  return derivedTag;
}

// ============ Draft State Logic ============

/**
 * Check if we are still in a ban phase
 */
export function isInBanPhase(currentStep: number): boolean {
  if (currentStep < 0 || currentStep >= BP_SEQUENCE.length) return false;
  const step = BP_SEQUENCE[currentStep];
  return step.action === 'ban';
}

/**
 * Check if there are remaining ban slots for a side
 */
export function hasRemainingBans(
  bpState: BPState,
  side: 'blue' | 'red',
  currentStep: number
): boolean {
  // Count total ban slots for this side
  const totalBanSlots = BP_SEQUENCE.filter(
    (s) => s.action === 'ban' && s.team === side
  ).length;

  // Count used ban slots (entries with non-null champion)
  const bans = side === 'blue' ? bpState.blueBans : bpState.redBans;
  const usedBans = bans.filter((entry) => entry.champion !== null).length;

  // Check if any future ban steps exist for this side
  const futureBanSteps = BP_SEQUENCE.slice(currentStep).filter(
    (s) => s.action === 'ban' && s.team === side
  );

  return futureBanSteps.length > 0 && usedBans < totalBanSlots;
}

/**
 * Get draft status for a champion
 */
export function getDraftStatus(
  championId: string,
  bpState: BPState,
  ourSide: 'blue' | 'red',
  currentStep: number
): DraftStatus {
  const opponentSide = ourSide === 'blue' ? 'red' : 'blue';

  // Check if already banned (BanEntry has champion property)
  const allBans = [...bpState.blueBans, ...bpState.redBans];
  if (allBans.some((entry) => entry.champion?.id === championId)) {
    return 'already-banned';
  }

  // Check if picked by us
  const ourPicks = ourSide === 'blue' ? bpState.bluePicks : bpState.redPicks;
  if (ourPicks.some((c) => c?.id === championId)) {
    return 'already-picked-by-us';
  }

  // Check if picked by opponent
  const opponentPicks = opponentSide === 'blue' ? bpState.bluePicks : bpState.redPicks;
  if (opponentPicks.some((c) => c?.id === championId)) {
    return 'already-picked-by-opponent';
  }

  // Check if ban phase has passed (no more ban opportunities for us)
  if (!hasRemainingBans(bpState, ourSide, currentStep)) {
    return 'no-longer-actionable';
  }

  return 'available';
}

// ============ Action Label Logic ============

/**
 * Map DecisionTag + DraftStatus to ActionLabel
 */
export function getActionLabel(
  decisionTag: DecisionTag,
  draftStatus: DraftStatus
): ActionLabel {
  // Non-available states override decision tag
  switch (draftStatus) {
    case 'already-banned':
      return 'ALREADY BANNED';
    case 'already-picked-by-opponent':
      return 'OPPONENT HAS';
    case 'already-picked-by-us':
      return 'WE HAVE';
    case 'no-longer-actionable':
      return 'BAN PHASE PASSED';
  }

  // Available - use decision tag
  switch (decisionTag) {
    case 'Ban-Critical':
      return 'BAN NOW';
    case 'Ban-or-Prepare':
      return 'BAN or PREPARE';
    case 'Prepare-Counter':
      return 'PREPARE COUNTER';
    case 'Monitor':
      return 'MONITOR';
  }
}

/**
 * Check if an action is actionable (can still do something about it)
 */
export function isActionable(draftStatus: DraftStatus): boolean {
  return draftStatus === 'available';
}

// ============ Explanation Generation ============

/**
 * Generate explanation text with draft state context
 */
export function generateExplanation(
  signal: ThreatSignal,
  decisionTag: DecisionTag,
  draftStatus: DraftStatus
): string {
  const baseExplanation = getBaseExplanation(signal, decisionTag);
  const stateContext = getStateContext(draftStatus, signal.championName);

  if (stateContext) {
    return `${baseExplanation} ${stateContext}`;
  }
  return baseExplanation;
}

function getBaseExplanation(signal: ThreatSignal, decisionTag: DecisionTag): string {
  const obsPercent = (signal.observed * 100).toFixed(1);
  const expPercent = (signal.expected * 100).toFixed(1);
  const banInfo = `${signal.banCount}/${signal.gamesPlayed} games`;

  // Avoid recommendation language - describe the signal factually
  switch (decisionTag) {
    case 'Ban-Critical':
      return `Opponents banned ${signal.championName} ${obsPercent}% vs ${expPercent}% baseline (${banInfo}). High historical denial frequency against this team.`;
    case 'Ban-or-Prepare':
      return `Elevated ban rate: ${obsPercent}% vs ${expPercent}% baseline (${banInfo}). Moderate historical denial frequency.`;
    case 'Prepare-Counter':
      return `Ban rate: ${obsPercent}% vs ${expPercent}% baseline (${banInfo}). Some historical denial activity.`;
    case 'Monitor':
      return `Ban rate ${obsPercent}% near baseline ${expPercent}% (${banInfo}). Low historical denial frequency.`;
  }
}

function getStateContext(draftStatus: DraftStatus, championName: string): string {
  switch (draftStatus) {
    case 'already-banned':
      return `[${championName} is already banned - threat neutralized]`;
    case 'already-picked-by-opponent':
      return `[${championName} picked by opponent - prepare counter now]`;
    case 'already-picked-by-us':
      return `[${championName} secured by us - threat addressed]`;
    case 'no-longer-actionable':
      return `[Ban phase passed - cannot ban ${championName}]`;
    case 'available':
      return '';
  }
}

// ============ Priority Calculation ============

/**
 * Calculate priority for sorting (lower = higher priority)
 */
export function calculatePriority(
  decisionTag: DecisionTag,
  draftStatus: DraftStatus,
  score: number
): number {
  // Base priority by decision tag
  let basePriority: number;
  switch (decisionTag) {
    case 'Ban-Critical':
      basePriority = 100;
      break;
    case 'Ban-or-Prepare':
      basePriority = 200;
      break;
    case 'Prepare-Counter':
      basePriority = 300;
      break;
    case 'Monitor':
      basePriority = 400;
      break;
  }

  // Penalty for non-actionable states
  let statusPenalty: number;
  switch (draftStatus) {
    case 'available':
      statusPenalty = 0;
      break;
    case 'already-banned':
      statusPenalty = 1000; // Show but deprioritize
      break;
    case 'already-picked-by-opponent':
      statusPenalty = 500; // Still relevant - need counter
      break;
    case 'already-picked-by-us':
      statusPenalty = 1500; // Lowest priority
      break;
    case 'no-longer-actionable':
      statusPenalty = 1200;
      break;
  }

  // Use score as tiebreaker (higher score = lower priority number)
  const scoreTiebreaker = 100 - score;

  return basePriority + statusPenalty + scoreTiebreaker;
}

// ============ Evidence Attribution (Step 3 + Step 4 + Step 4.1 Refinement) ============

/**
 * Evidence Strength Tier (Step 4)
 *
 * Used internally to gate whether evidence is strong enough to be Primary.
 * Prevents weak signals from being misinterpreted as main drivers.
 */
export type EvidenceStrength = 'STRONG' | 'MODERATE' | 'WEAK';

/**
 * Evidence Strength Thresholds (Step 4.2 - Data-Driven Calibration)
 *
 * These thresholds are derived from actual data distributions.
 * See: app/lib/evidence-thresholds.json for calibration metadata.
 * Run: npx tsx app/scripts/calibrate-evidence-thresholds.ts to recalibrate.
 *
 * TEAM_DENIAL thresholds (from Step 3.6 diagnostics):
 * - score >= 50: STRONG (top ~15% of positive signals)
 * - score >= 30: MODERATE (top ~19% of positive signals)
 * - score < 30: WEAK (below threshold for attribution)
 *
 * ROLE_FLEX_PRESSURE thresholds (Step 4.2 - P85 of H_norm distribution):
 * - H_norm >= 0.4435: STRONG (top 16% of champions by role entropy)
 * - H_norm < 0.4435: WEAK (single-role dominant or trivial flex)
 *
 * PLAYER_SPECIALTY thresholds (Step 4.2 - P85 of player pool distribution):
 * - pickCount >= 9 AND pickShare >= 11.1%: STRONG (top ~5% of entries)
 * - pickCount >= 6: MODERATE (top ~28% of entries)
 * - otherwise: WEAK
 */
export const EVIDENCE_STRENGTH_THRESHOLDS = {
  TEAM_DENIAL: {
    strong: 50,   // score >= 50 → STRONG
    moderate: 30, // score >= 30 → MODERATE
  },
  ROLE_FLEX_PRESSURE: {
    // Step 4.2: P85 of H_norm distribution = 0.4435
    entropyThreshold: 0.4435,
  },
  PLAYER_SPECIALTY: {
    // Step 4.2: P85 of pickCount = 9, P85 of pickShare = 0.1111
    strongPickCount: 9,
    strongPickShare: 0.1111,
    // P75 of pickCount = 6
    moderatePickCount: 6,
  },
} as const;

/**
 * Get evidence strength for TEAM_DENIAL based on score
 */
function getTeamDenialStrength(score: number): EvidenceStrength {
  if (score >= EVIDENCE_STRENGTH_THRESHOLDS.TEAM_DENIAL.strong) return 'STRONG';
  if (score >= EVIDENCE_STRENGTH_THRESHOLDS.TEAM_DENIAL.moderate) return 'MODERATE';
  return 'WEAK';
}

/**
 * Get evidence strength for ROLE_FLEX_PRESSURE based on entropy (Step 4.1)
 *
 * Role entropy measures draft ambiguity:
 * - High entropy (>= threshold): Multiple viable roles create real pressure
 * - Low entropy (< threshold): Single dominant role, trivial flex
 *
 * @param isFlex - Whether champion is marked as flex
 * @param roleEntropy - Entropy of role distribution (0-1 scale, higher = more ambiguous)
 */
function getRoleFlexStrength(isFlex: boolean, roleEntropy: number): EvidenceStrength {
  if (!isFlex) return 'WEAK';
  if (roleEntropy >= EVIDENCE_STRENGTH_THRESHOLDS.ROLE_FLEX_PRESSURE.entropyThreshold) {
    return 'STRONG';
  }
  return 'WEAK'; // No MODERATE tier for flex - it either creates pressure or doesn't
}

/**
 * Get evidence strength for PLAYER_SPECIALTY based on pick concentration (Step 4.1 + 4.3)
 *
 * This reflects concentration in player's champion pool, NOT effectiveness.
 * Uses neutral language: "high concentration" not "signature pick".
 *
 * Step 4.3 Low-Sample Gating:
 * - If playerGames < LOW_SAMPLE_PLAYER_THRESHOLD (10), cap strength at MODERATE
 * - This prevents over-attribution from small sample sizes
 *
 * @param pickCount - Number of times player picked this champion
 * @param pickShare - Share of player's total picks (0-1)
 * @param playerGames - Optional total games played by this player
 */
export function getPlayerSpecialtyStrength(
  pickCount: number,
  pickShare: number,
  playerGames?: number
): EvidenceStrength {
  const thresholds = EVIDENCE_STRENGTH_THRESHOLDS.PLAYER_SPECIALTY;

  // Step 4.3: Low-sample gating
  const isLowSample = playerGames !== undefined && playerGames < LOW_SAMPLE_PLAYER_THRESHOLD;

  if (pickCount >= thresholds.strongPickCount && pickShare >= thresholds.strongPickShare) {
    // Would be STRONG, but cap at MODERATE if low-sample
    return isLowSample ? 'MODERATE' : 'STRONG';
  }
  if (pickCount >= thresholds.moderatePickCount) {
    return 'MODERATE';
  }
  return 'WEAK';
}

/**
 * Player pool data for evidence attribution (Step 4.1 + 4.3)
 */
export interface PlayerPoolEvidence {
  pickCount: number;  // Number of times player picked this champion
  pickShare: number;  // Share of player's total picks (0-1)
  playerGames?: number; // Total games played by this player (for low-sample gating)
}

/**
 * Low-sample threshold for player evidence (Step 4.3)
 * Players with fewer than this many games are considered low-sample.
 * Their PLAYER_SPECIALTY strength is capped at MODERATE.
 */
export const LOW_SAMPLE_PLAYER_THRESHOLD = 10;

/**
 * Determine primary and secondary evidence sources for a threat signal
 *
 * Step 4.1 Logic (Evidence Strength Refinement):
 *
 * Primary Evidence Selection (refined order):
 * 1. If STRONG TEAM_DENIAL → Primary = TEAM_DENIAL
 * 2. Else if STRONG PLAYER_SPECIALTY → Primary = PLAYER_SPECIALTY
 * 3. Else if STRONG ROLE_FLEX_PRESSURE → Primary = ROLE_FLEX_PRESSURE
 * 4. Else if MODERATE TEAM_DENIAL → Primary = TEAM_DENIAL (allows self-explanation)
 * 5. Else → Primary = META_PTS
 *
 * Secondary Evidence:
 * - Any MODERATE evidence (when not Primary) → Secondary
 * - WEAK evidence → Not displayed
 *
 * NOTE: This does NOT change ranking. It only explains the source.
 *
 * @param signal - Threat signal (or null if no denial signal)
 * @param isFlex - Whether the champion is a flex pick
 * @param roleEntropy - Entropy of role distribution (0-1, higher = more ambiguous)
 * @param playerPoolData - Optional player pool concentration data
 */
export function determineEvidence(
  signal: ThreatSignal | null,
  isFlex: boolean = false,
  roleEntropy: number = 0,
  playerPoolData?: PlayerPoolEvidence
): { primary: EvidenceType; secondary: EvidenceType[] } {
  const secondary: EvidenceType[] = [];

  // Step 4.1: Evaluate evidence strength for each type
  const teamDenialStrength: EvidenceStrength =
    signal !== null && signal.score > 0
      ? getTeamDenialStrength(signal.score)
      : 'WEAK';

  // Step 4.1: Role flex requires meaningful entropy to be STRONG
  const roleFlexStrength = getRoleFlexStrength(isFlex, roleEntropy);

  // Step 4.1 + 4.3: Player specialty based on pick concentration (with low-sample gating)
  const playerSpecialtyStrength: EvidenceStrength = playerPoolData
    ? getPlayerSpecialtyStrength(playerPoolData.pickCount, playerPoolData.pickShare, playerPoolData.playerGames)
    : 'WEAK';

  // Step 4.1: Primary Evidence Selection (refined order)
  // STRONG evidence dominates, then MODERATE TEAM_DENIAL, then fallback
  let primary: EvidenceType;

  if (teamDenialStrength === 'STRONG') {
    // 1. STRONG TEAM_DENIAL
    primary = 'TEAM_DENIAL';
    // Add other MODERATE evidence as secondary
    if (playerSpecialtyStrength === 'MODERATE') secondary.push('PLAYER_SPECIALTY');
    // roleFlexStrength has no MODERATE tier
  } else if (playerSpecialtyStrength === 'STRONG') {
    // 2. STRONG PLAYER_SPECIALTY
    primary = 'PLAYER_SPECIALTY';
    // Add MODERATE evidence as secondary
    if (teamDenialStrength === 'MODERATE') secondary.push('TEAM_DENIAL');
  } else if (roleFlexStrength === 'STRONG') {
    // 3. STRONG ROLE_FLEX_PRESSURE
    primary = 'ROLE_FLEX_PRESSURE';
    // Add MODERATE evidence as secondary
    if (teamDenialStrength === 'MODERATE') secondary.push('TEAM_DENIAL');
    if (playerSpecialtyStrength === 'MODERATE') secondary.push('PLAYER_SPECIALTY');
  } else if (teamDenialStrength === 'MODERATE') {
    // 4. MODERATE TEAM_DENIAL (allowed to self-explain when no STRONG exists)
    primary = 'TEAM_DENIAL';
    // Add other MODERATE evidence as secondary
    if (playerSpecialtyStrength === 'MODERATE') secondary.push('PLAYER_SPECIALTY');
  } else {
    // 5. No strong/moderate denial evidence → fallback to META_PTS
    primary = 'META_PTS';
    // Add any MODERATE evidence as secondary
    if (playerSpecialtyStrength === 'MODERATE') secondary.push('PLAYER_SPECIALTY');
  }

  return { primary, secondary };
}

// ============ Main Decision Function ============

/**
 * Process threat signals into actionable decisions
 *
 * @param signals - Array of threat signals
 * @param bpState - Current BP state
 * @param ourSide - Our team side ('blue' or 'red')
 * @param currentStep - Current step in BP sequence
 * @param entityType - Entity type for threshold selection (default: 'team')
 * @param config - Decision configuration
 * @param flexChampionIds - Optional set of champion IDs that are flex picks
 */
export function processThreats(
  signals: ThreatSignal[],
  bpState: BPState,
  ourSide: 'blue' | 'red',
  currentStep: number,
  entityType: ThreatEntityType = 'team',
  config: DecisionConfig = DEFAULT_DECISION_CONFIG,
  flexChampionIds: Set<string> = new Set()
): ThreatDecision[] {
  const decisions: ThreatDecision[] = [];

  for (const signal of signals) {
    // Use entity-aware thresholds and check for pre-computed tag
    const signalWithTag = signal as ThreatSignal & { decisionTag?: DecisionTag };
    const decisionTag = getDecisionTagWithAssertion(signalWithTag, entityType, config);
    const draftStatus = getDraftStatus(signal.championId, bpState, ourSide, currentStep);
    const actionLabel = getActionLabel(decisionTag, draftStatus);
    const actionable = isActionable(draftStatus);
    const explanation = generateExplanation(signal, decisionTag, draftStatus);
    const priority = calculatePriority(decisionTag, draftStatus, signal.score);

    // Determine evidence attribution (Step 3)
    const isFlex = flexChampionIds.has(signal.championId);
    const { primary: primaryEvidence, secondary: secondaryEvidence } = determineEvidence(signal, isFlex);

    decisions.push({
      signal,
      decisionTag,
      draftStatus,
      actionLabel,
      isActionable: actionable,
      explanation,
      priority,
      primaryEvidence,
      secondaryEvidence: secondaryEvidence.length > 0 ? secondaryEvidence : undefined,
    });
  }

  // Sort by priority (lower = higher priority)
  decisions.sort((a, b) => a.priority - b.priority);

  return decisions;
}

/**
 * Filter and limit decisions for UI display
 */
export function filterForDisplay(
  decisions: ThreatDecision[],
  config: DecisionConfig = DEFAULT_DECISION_CONFIG
): ThreatDecision[] {
  const result: ThreatDecision[] = [];
  let banCriticalCount = 0;
  let actionableCount = 0;

  for (const decision of decisions) {
    // Skip Monitor tier unless we have room
    if (decision.decisionTag === 'Monitor' && !decision.isActionable) {
      continue;
    }

    // Limit Ban-Critical
    if (decision.decisionTag === 'Ban-Critical' && decision.isActionable) {
      if (banCriticalCount >= config.maxBanCritical) {
        continue;
      }
      banCriticalCount++;
    }

    // Limit total actionable
    if (decision.isActionable) {
      if (actionableCount >= config.maxActionable) {
        continue;
      }
      actionableCount++;
    }

    result.push(decision);

    // Stop if we've hit both limits
    if (
      banCriticalCount >= config.maxBanCritical &&
      actionableCount >= config.maxActionable
    ) {
      break;
    }
  }

  return result;
}

/**
 * Get color class for action label
 */
export function getActionLabelColor(actionLabel: ActionLabel): string {
  switch (actionLabel) {
    case 'BAN NOW':
      return 'text-red-400 bg-red-500/20 border-red-500/50';
    case 'BAN or PREPARE':
      return 'text-orange-400 bg-orange-500/20 border-orange-500/50';
    case 'PREPARE COUNTER':
      return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/50';
    case 'MONITOR':
      return 'text-gray-400 bg-gray-500/20 border-gray-500/50';
    case 'ALREADY BANNED':
      return 'text-gray-500 bg-gray-600/20 border-gray-600/50 opacity-60';
    case 'OPPONENT HAS':
      return 'text-purple-400 bg-purple-500/20 border-purple-500/50';
    case 'WE HAVE':
      return 'text-green-400 bg-green-500/20 border-green-500/50 opacity-60';
    case 'BAN PHASE PASSED':
      return 'text-gray-500 bg-gray-600/20 border-gray-600/50 opacity-60';
  }
}

/**
 * Get icon for action label
 */
export function getActionLabelIcon(actionLabel: ActionLabel): string {
  switch (actionLabel) {
    case 'BAN NOW':
      return '🚫';
    case 'BAN or PREPARE':
      return '⚠️';
    case 'PREPARE COUNTER':
      return '🛡️';
    case 'MONITOR':
      return '👁️';
    case 'ALREADY BANNED':
      return '✓';
    case 'OPPONENT HAS':
      return '⚔️';
    case 'WE HAVE':
      return '✓';
    case 'BAN PHASE PASSED':
      return '⏱️';
  }
}
