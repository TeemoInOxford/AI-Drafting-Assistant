/**
 * Pick Threat Score (PTS) Engine - Phase 1
 *
 * A rule-based, explainable system for quantifying draft urgency.
 * PTS = PickLikelihood × LossSeverity × 100
 *
 * Design: Heuristic weights are used as placeholders.
 * Structure is stable for later replacement with learned parameters.
 */

import {
  Champion,
  Position,
  Team,
  DraftState,
  PTSResult,
  PTSConfig,
  PickLikelihoodSignals,
  LossSeverityBreakdown,
  LossSeverityCategory,
  BPState,
  BPStep
} from './types';

// Default heuristic configuration
// TODO: Replace these with learned weights from historical draft data
export const DEFAULT_PTS_CONFIG: PTSConfig = {
  // PickLikelihood weights (sum to 1.0)
  roleVacancyWeight: 0.40,      // Strongest signal: do they need this role?
  championPoolWeight: 0.30,     // Player history matters
  metaPresenceWeight: 0.20,     // Meta relevance
  synergyBanWeight: 0.10,       // Ban patterns hint at intent

  // LossSeverity weights (sum to 1.0)
  roleCollapseWeight: 0.50,     // Losing role flexibility is critical
  compositionLockWeight: 0.30,  // Getting locked into predictable comp
  strategicDenialWeight: 0.20,  // Opponent denying our strategy

  // Risk tier thresholds
  criticalThreshold: 70,        // PTS >= 70: Must act now
  highThreshold: 50,            // PTS >= 50: High risk to delay
  moderateThreshold: 30,        // PTS >= 30: Moderate risk
};

/**
 * Convert BPState to DraftState for PTS calculation
 */
export function bpStateToDraftState(
  bpState: BPState,
  currentStep: BPStep,
  side: Team
): DraftState {
  // Calculate remaining roles for each team
  const blueRemainingRoles = getRemainingRoles(bpState.bluePicks);
  const redRemainingRoles = getRemainingRoles(bpState.redPicks);

  return {
    side,
    currentStep,
    bluePicks: bpState.bluePicks,
    redPicks: bpState.redPicks,
    blueBans: bpState.blueBans,
    redBans: bpState.redBans,
    blueRemainingRoles,
    redRemainingRoles,
  };
}

/**
 * Get remaining roles that need to be filled
 */
function getRemainingRoles(picks: (Champion | null)[]): Position[] {
  const allRoles: Position[] = ['top', 'jungle', 'mid', 'bot', 'support'];
  const filledRoles = new Set<Position>();

  picks.forEach((pick, index) => {
    if (pick) {
      // Assume picks are in order: top, jungle, mid, bot, support
      filledRoles.add(allRoles[index]);
    }
  });

  return allRoles.filter(role => !filledRoles.has(role));
}

/**
 * Calculate Pick Threat Score for all available champions
 */
export function calculatePTS(
  draftState: DraftState,
  availableChampions: Champion[],
  config: PTSConfig = DEFAULT_PTS_CONFIG
): PTSResult[] {
  const results: PTSResult[] = [];

  for (const champion of availableChampions) {
    const pickLikelihood = calculatePickLikelihood(draftState, champion, config);
    const lossSeverity = calculateLossSeverity(draftState, champion, config);

    const pts = pickLikelihood.total * lossSeverity.total * 100;
    const riskTier = determineRiskTier(pts, config);
    const explanation = generateExplanation(champion, pickLikelihood, lossSeverity, riskTier);

    results.push({
      championId: champion.id,
      championName: champion.name,
      pts,
      pickLikelihood: pickLikelihood.total,
      lossSeverity: lossSeverity.total,
      riskTier,
      explanation,
      signals: pickLikelihood.signals,
      severityBreakdown: lossSeverity,
    });
  }

  // Sort by PTS descending
  return results.sort((a, b) => b.pts - a.pts);
}

/**
 * Calculate PickLikelihood: How likely is opponent to pick this champion?
 * Returns value between 0-1
 */
function calculatePickLikelihood(
  draftState: DraftState,
  champion: Champion,
  config: PTSConfig
): { total: number; signals: PickLikelihoodSignals } {
  const opponent = draftState.side === 'blue' ? 'red' : 'blue';
  const opponentRoles = opponent === 'blue'
    ? draftState.blueRemainingRoles
    : draftState.redRemainingRoles;

  // Signal 1: Opponent Role Vacancy
  // Does opponent need a role this champion can fill?
  const roleVacancy = calculateRoleVacancy(champion, opponentRoles);

  // Signal 2: Player Champion Pool Frequency
  // TODO: Replace with actual player data when available
  // For now, use meta presence as proxy
  const championPoolFreq = calculateChampionPoolFrequency(champion);

  // Signal 3: Global Meta Presence
  // How popular is this champion in current meta?
  const metaPresence = calculateMetaPresence(champion);

  // Signal 4: Synergy Ban Signal
  // Did opponent ban champions that synergize with this one?
  const synergyBan = calculateSynergyBanSignal(draftState, champion, opponent);

  const signals: PickLikelihoodSignals = {
    opponentRoleVacancy: roleVacancy,
    playerChampionPoolFreq: championPoolFreq,
    globalMetaPresence: metaPresence,
    synergyBanSignal: synergyBan,
  };

  // Weighted combination
  const total =
    roleVacancy * config.roleVacancyWeight +
    championPoolFreq * config.championPoolWeight +
    metaPresence * config.metaPresenceWeight +
    synergyBan * config.synergyBanWeight;

  return { total: Math.min(1, Math.max(0, total)), signals };
}

/**
 * Calculate role vacancy signal
 */
function calculateRoleVacancy(champion: Champion, remainingRoles: Position[]): number {
  if (remainingRoles.length === 0) return 0;

  // Check if champion can fill any remaining role
  const canFillRole = champion.positions.some(pos => remainingRoles.includes(pos));

  if (!canFillRole) return 0;

  // Higher urgency if fewer roles remain
  // 5 roles remaining: 0.2, 1 role remaining: 1.0
  const urgencyMultiplier = 1.0 - (remainingRoles.length - 1) * 0.2;

  return Math.min(1, urgencyMultiplier);
}

/**
 * Calculate champion pool frequency
 * TODO: Replace with actual player historical data
 */
function calculateChampionPoolFrequency(champion: Champion): number {
  // Placeholder: Use meta presence as proxy
  // In production, this would query player's historical pick rate for this champion
  return calculateMetaPresence(champion) * 0.8; // Slightly lower than meta
}

/**
 * Calculate global meta presence
 * Heuristic based on champion flexibility and common picks
 */
function calculateMetaPresence(champion: Champion): number {
  // Heuristic: Champions that can play multiple roles are more meta
  const flexibilityScore = Math.min(champion.positions.length / 3, 1.0);

  // TODO: Replace with actual pick/ban rate from professional matches
  // For now, use a baseline of 0.5 modified by flexibility
  return 0.5 + (flexibilityScore * 0.3);
}

/**
 * Calculate synergy ban signal
 * Did opponent ban champions that typically pair with this one?
 */
function calculateSynergyBanSignal(
  draftState: DraftState,
  champion: Champion,
  opponent: Team
): number {
  const opponentBans = opponent === 'blue' ? draftState.blueBans : draftState.redBans;

  // TODO: Replace with actual synergy data
  // For now, simple heuristic: if opponent banned 2+ champions, they're targeting something
  const banCount = opponentBans.filter(ban => ban !== null).length;

  if (banCount >= 3) return 0.6;
  if (banCount >= 2) return 0.4;
  return 0.2;
}

/**
 * Calculate LossSeverity: How bad is it if we don't get this champion?
 * Returns value between 0-1 with category breakdown
 */
function calculateLossSeverity(
  draftState: DraftState,
  champion: Champion,
  config: PTSConfig
): LossSeverityBreakdown {
  const ourSide = draftState.side;
  const ourRoles = ourSide === 'blue'
    ? draftState.blueRemainingRoles
    : draftState.redRemainingRoles;
  const ourPicks = ourSide === 'blue'
    ? draftState.bluePicks
    : draftState.redPicks;

  // Category 1: Role Collapse
  // Losing this champion forces us into suboptimal role fill
  const roleCollapse = calculateRoleCollapse(champion, ourRoles);

  // Category 2: Composition Lock
  // Losing this champion locks us into predictable composition
  const compositionLock = calculateCompositionLock(champion, ourPicks, ourRoles);

  // Category 3: Strategic Denial
  // Opponent picking this denies our win condition
  const strategicDenial = calculateStrategicDenial(champion, ourPicks);

  // Determine primary category
  const categories = [
    { name: 'role_collapse' as LossSeverityCategory, value: roleCollapse },
    { name: 'composition_lock' as LossSeverityCategory, value: compositionLock },
    { name: 'strategic_denial' as LossSeverityCategory, value: strategicDenial },
  ];
  const primaryCategory = categories.reduce((max, cat) =>
    cat.value > max.value ? cat : max
  ).name;

  // Weighted combination
  const total =
    roleCollapse * config.roleCollapseWeight +
    compositionLock * config.compositionLockWeight +
    strategicDenial * config.strategicDenialWeight;

  return {
    roleCollapse,
    compositionLock,
    strategicDenial,
    total: Math.min(1, Math.max(0, total)),
    primaryCategory,
  };
}

/**
 * Calculate role collapse severity
 * High if this is one of few champions that can fill a critical role
 */
function calculateRoleCollapse(champion: Champion, ourRoles: Position[]): number {
  if (ourRoles.length === 0) return 0;

  // Check if champion can fill any of our remaining roles
  const canFillRoles = champion.positions.filter(pos => ourRoles.includes(pos));

  if (canFillRoles.length === 0) return 0;

  // Critical if we have few roles left and this champion is flexible
  const roleUrgency = 1.0 - (ourRoles.length - 1) * 0.2;
  const flexibilityValue = Math.min(canFillRoles.length / 2, 1.0);

  return Math.min(1, roleUrgency * flexibilityValue);
}

/**
 * Calculate composition lock severity
 * High if losing this champion forces us into predictable strategy
 */
function calculateCompositionLock(
  champion: Champion,
  ourPicks: (Champion | null)[],
  ourRoles: Position[]
): number {
  const pickedCount = ourPicks.filter(p => p !== null).length;

  // Early picks have more flexibility, later picks get locked
  // 0 picks: 0.2, 4 picks: 1.0
  const lockProgression = 0.2 + (pickedCount * 0.2);

  // Flexible champions reduce lock-in risk
  const flexibilityPenalty = 1.0 - (champion.positions.length * 0.15);

  return Math.min(1, lockProgression * Math.max(0.3, flexibilityPenalty));
}

/**
 * Calculate strategic denial severity
 * High if this champion is key to our intended strategy
 */
function calculateStrategicDenial(
  champion: Champion,
  ourPicks: (Champion | null)[]
): number {
  // TODO: Replace with actual composition synergy data
  // For now, heuristic based on champion flexibility

  const pickedCount = ourPicks.filter(p => p !== null).length;

  // If we have picks already, losing a synergistic champion hurts more
  if (pickedCount === 0) return 0.3;

  // Flexible champions are more likely to synergize
  const synergyPotential = Math.min(champion.positions.length / 3, 1.0);

  return Math.min(1, 0.4 + (synergyPotential * 0.4));
}

/**
 * Determine risk tier based on PTS score
 */
function determineRiskTier(
  pts: number,
  config: PTSConfig
): 'critical' | 'high' | 'moderate' | 'low' {
  if (pts >= config.criticalThreshold) return 'critical';
  if (pts >= config.highThreshold) return 'high';
  if (pts >= config.moderateThreshold) return 'moderate';
  return 'low';
}

/**
 * Generate natural language explanation
 */
function generateExplanation(
  champion: Champion,
  pickLikelihood: { total: number; signals: PickLikelihoodSignals },
  lossSeverity: LossSeverityBreakdown,
  riskTier: string
): string {
  const parts: string[] = [];

  // Risk tier statement
  if (riskTier === 'critical') {
    parts.push('CRITICAL:');
  } else if (riskTier === 'high') {
    parts.push('HIGH RISK:');
  }

  // Primary threat reason
  if (pickLikelihood.signals.opponentRoleVacancy > 0.6) {
    parts.push('Opponent needs this role.');
  } else if (pickLikelihood.signals.globalMetaPresence > 0.7) {
    parts.push('High meta priority.');
  }

  // Primary loss reason
  if (lossSeverity.primaryCategory === 'role_collapse') {
    parts.push('Losing this collapses our role flexibility.');
  } else if (lossSeverity.primaryCategory === 'composition_lock') {
    parts.push('Losing this locks us into predictable comp.');
  } else if (lossSeverity.primaryCategory === 'strategic_denial') {
    parts.push('Key to our strategy.');
  }

  // Urgency statement
  if (riskTier === 'critical' || riskTier === 'high') {
    parts.push('Act now or lose window.');
  }

  return parts.join(' ');
}

/**
 * Get top N champions by PTS
 */
export function getTopPTSChampions(
  draftState: DraftState,
  availableChampions: Champion[],
  topN: number = 5,
  config: PTSConfig = DEFAULT_PTS_CONFIG
): PTSResult[] {
  const allResults = calculatePTS(draftState, availableChampions, config);
  return allResults.slice(0, topN);
}
