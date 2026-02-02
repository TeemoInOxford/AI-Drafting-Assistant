/**
 * v4-1 L1 Synergy Evaluator
 *
 * Evaluates how well a champion synergizes with the team.
 * Uses L0 synergy matrix data with confidence scores.
 */

import { Champion, Team } from '../../types';
import { DraftState } from '../types/common-types';
import { L0DataCache } from '../types/l0-types';
import { ChampionSynergyOutput } from '../types/l1-types';
import { combineConfidences } from '../types/common-types';
import { getPicksForTeam } from '../core/draft-state';
import { getSynergyBetween } from '../l0-data/synergy-matrix';

/**
 * Evaluate champion synergy with team
 */
export function evaluateChampionSynergy(
  champion: Champion,
  team: Team,
  draftState: DraftState,
  l0Data: L0DataCache
): ChampionSynergyOutput {
  // Get team picks
  const teamPickIds = getPicksForTeam(draftState, team);

  if (teamPickIds.length === 0) {
    return {
      championId: champion.id,
      overallSynergy: 0.5,
      confidence: 0,
      synergyPartners: [],
      explanation: 'No team picks yet to evaluate synergy',
    };
  }

  // Calculate synergy with each team member
  const synergyPartners: ChampionSynergyOutput['synergyPartners'] = [];
  let totalSynergyScore = 0;
  const confidences: number[] = [];

  for (const teamChampId of teamPickIds) {
    const synergy = getSynergyBetween(champion.id, teamChampId, l0Data.synergyMatrix);

    if (synergy) {
      synergyPartners.push({
        partnerId: teamChampId,
        synergyScore: synergy.score,
        synergyType: synergy.type,
        confidence: synergy.confidence,
      });

      totalSynergyScore += synergy.score;
      confidences.push(synergy.confidence);
    } else {
      // No synergy data - use neutral score
      synergyPartners.push({
        partnerId: teamChampId,
        synergyScore: 0.5,
        synergyType: 'Meta',
        confidence: 0,
      });

      totalSynergyScore += 0.5;
      confidences.push(0);
    }
  }

  // Calculate overall synergy
  const overallSynergy = totalSynergyScore / teamPickIds.length;

  // Calculate overall confidence
  const confidence = confidences.length > 0
    ? combineConfidences(confidences)
    : 0;

  // Sort partners by synergy score
  synergyPartners.sort((a, b) => b.synergyScore - a.synergyScore);

  // Generate explanation
  const explanation = generateSynergyExplanation(
    champion,
    overallSynergy,
    synergyPartners
  );

  return {
    championId: champion.id,
    overallSynergy,
    confidence,
    synergyPartners,
    explanation,
  };
}

/**
 * Generate synergy explanation
 */
function generateSynergyExplanation(
  champion: Champion,
  overallSynergy: number,
  partners: ChampionSynergyOutput['synergyPartners']
): string {
  if (partners.length === 0) {
    return 'No team picks to synergize with';
  }

  const parts: string[] = [];

  // Overall assessment
  if (overallSynergy >= 0.7) {
    parts.push('Excellent synergy with team.');
  } else if (overallSynergy >= 0.6) {
    parts.push('Good synergy with team.');
  } else if (overallSynergy >= 0.5) {
    parts.push('Moderate synergy with team.');
  } else {
    parts.push('Limited synergy with team.');
  }

  // Highlight strong synergies
  const strongSynergies = partners.filter(p => p.synergyScore >= 0.7);
  if (strongSynergies.length > 0) {
    const hardSynergies = strongSynergies.filter(p => p.synergyType === 'Hard');
    if (hardSynergies.length > 0) {
      parts.push(`Strong synergy with ${hardSynergies.length} champion(s).`);
    }
  }

  // Warn about weak synergies
  const weakSynergies = partners.filter(p => p.synergyScore < 0.4);
  if (weakSynergies.length > 0) {
    parts.push(`Weak synergy with ${weakSynergies.length} champion(s).`);
  }

  return parts.join(' ');
}

/**
 * Evaluate synergy for all available champions
 */
export function evaluateSynergyForAll(
  availableChampions: Champion[],
  team: Team,
  draftState: DraftState,
  l0Data: L0DataCache
): ChampionSynergyOutput[] {
  const results: ChampionSynergyOutput[] = [];

  for (const champion of availableChampions) {
    const synergy = evaluateChampionSynergy(champion, team, draftState, l0Data);
    results.push(synergy);
  }

  // Sort by overall synergy descending
  return results.sort((a, b) => b.overallSynergy - a.overallSynergy);
}

/**
 * Get top synergy champions
 */
export function getTopSynergyChampions(
  availableChampions: Champion[],
  team: Team,
  draftState: DraftState,
  l0Data: L0DataCache,
  topN: number = 10,
  minConfidence: number = 0.3
): ChampionSynergyOutput[] {
  const allSynergies = evaluateSynergyForAll(
    availableChampions,
    team,
    draftState,
    l0Data
  );

  return allSynergies
    .filter(s => s.confidence >= minConfidence)
    .slice(0, topN);
}

/**
 * Calculate team synergy score
 * How well does the current team synergize together?
 */
export function calculateTeamSynergyScore(
  team: Team,
  draftState: DraftState,
  l0Data: L0DataCache
): { score: number; confidence: number } {
  const teamPickIds = getPicksForTeam(draftState, team);

  if (teamPickIds.length < 2) {
    return { score: 0.5, confidence: 0 };
  }

  let totalScore = 0;
  let pairCount = 0;
  const confidences: number[] = [];

  // Calculate synergy for all pairs
  for (let i = 0; i < teamPickIds.length; i++) {
    for (let j = i + 1; j < teamPickIds.length; j++) {
      const synergy = getSynergyBetween(
        teamPickIds[i],
        teamPickIds[j],
        l0Data.synergyMatrix
      );

      if (synergy) {
        totalScore += synergy.score;
        confidences.push(synergy.confidence);
      } else {
        totalScore += 0.5; // Neutral
        confidences.push(0);
      }

      pairCount++;
    }
  }

  if (pairCount === 0) {
    return { score: 0.5, confidence: 0 };
  }

  const score = totalScore / pairCount;
  const confidence = confidences.length > 0
    ? combineConfidences(confidences)
    : 0;

  return { score, confidence };
}
