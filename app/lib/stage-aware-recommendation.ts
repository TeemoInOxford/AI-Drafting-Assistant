/**
 * Stage-Aware Recommendation Generator
 * Generates detailed recommendation reasons following the format in stage-aware-class-composition-prompt.md
 */

import { Champion, BPState, BPStep, Position, ChampionClass, PTSResult } from './types';

interface TeamComposition {
  picks: (Champion | null)[];
  classDistribution: Record<ChampionClass, number>;
  remainingPositions: Position[];
  damageTypes: { physical: number; magical: number };
  frontline: number;
  backline: number;
  controlCount: number;
}

/**
 * Analyze team composition
 */
function analyzeTeamComposition(picks: (Champion | null)[]): TeamComposition {
  const validPicks = picks.filter((p): p is Champion => p !== null);

  // Initialize class distribution
  const classDistribution: Record<ChampionClass, number> = {
    Tank: 0,
    Fighter: 0,
    Assassin: 0,
    Mage: 0,
    Marksman: 0,
    Support: 0,
    Controller: 0,
  };

  // Count classes
  validPicks.forEach(champ => {
    champ.tags.forEach(tag => {
      classDistribution[tag]++;
    });
  });

  // Calculate damage types (simplified heuristic)
  const physical = classDistribution.Fighter + classDistribution.Assassin + classDistribution.Marksman;
  const magical = classDistribution.Mage + classDistribution.Controller;
  const total = physical + magical || 1;

  // Calculate frontline/backline
  const frontline = classDistribution.Tank + classDistribution.Fighter;
  const backline = classDistribution.Mage + classDistribution.Marksman + classDistribution.Support;

  // Calculate control count (simplified)
  const controlCount = classDistribution.Tank + classDistribution.Controller + classDistribution.Support;

  // Get remaining positions
  const allPositions: Position[] = ['top', 'jungle', 'mid', 'bot', 'support'];
  const filledPositions = validPicks.flatMap(p => p.positions.slice(0, 1));
  const remainingPositions = allPositions.filter(pos => !filledPositions.includes(pos));

  return {
    picks: validPicks,
    classDistribution,
    remainingPositions,
    damageTypes: {
      physical: Math.round((physical / total) * 100),
      magical: Math.round((magical / total) * 100),
    },
    frontline,
    backline,
    controlCount,
  };
}

/**
 * Generate stage context description
 */
function generateStageContext(bpState: BPState, currentStep: BPStep): string {
  const step = bpState.currentStep + 1; // 1-indexed for display
  const totalSteps = 20;
  const remainingPicks = Math.floor((totalSteps - step) / 2);

  let phase = '';
  if (step <= 6) {
    phase = 'Ban Phase 1';
  } else if (step <= 12) {
    phase = 'Pick Phase 1';
  } else if (step <= 16) {
    phase = 'Ban Phase 2';
  } else {
    phase = 'Pick Phase 2';
  }

  const isEarly = step <= 12;
  const teamName = currentStep.team === 'blue' ? 'Blue' : 'Red';
  const sideAdvantage = currentStep.team === 'blue' ? 'first pick advantage' : 'counter pick advantage';

  if (isEarly) {
    return `At step ${step} (${phase}), we are ${teamName} side with ${sideAdvantage}. This is a ${currentStep.action === 'ban' ? 'ban' : 'flex pick'} moment. Enemy will act ${remainingPicks} more times before we pick again. Class flexibility matters more than specific counters at this stage.`;
  } else {
    return `At step ${step} (${phase}), we are ${teamName} side in late draft. This is our ${remainingPicks <= 1 ? 'final' : 'critical'} ${currentStep.action} phase. Enemy composition is now visible. Specific class counters and composition completion are paramount.`;
  }
}

/**
 * Generate class synergy analysis
 */
function generateClassSynergy(champion: Champion, ourComp: TeamComposition): string {
  const parts: string[] = [];
  const championClasses = champion.tags;
  const primaryClass = championClasses[0];

  // Damage type analysis
  const isDamageDealer = ['Fighter', 'Assassin', 'Mage', 'Marksman'].includes(primaryClass);
  if (isDamageDealer) {
    const isPhysical = ['Fighter', 'Assassin', 'Marksman'].includes(primaryClass);
    const currentPhys = ourComp.damageTypes.physical;
    const currentMag = ourComp.damageTypes.magical;

    if (isPhysical && currentPhys > 70) {
      parts.push(`Adding ${primaryClass} keeps us AD-heavy (${currentPhys + 20}% physical). Risk: enemy can stack armor.`);
    } else if (!isPhysical && currentMag > 70) {
      parts.push(`Adding ${primaryClass} keeps us AP-heavy (${currentMag + 20}% magical). Risk: enemy can stack MR.`);
    } else {
      parts.push(`Adding ${primaryClass} provides ${isPhysical ? 'AD' : 'AP'} damage, balancing our damage profile (${currentPhys}% phys, ${currentMag}% mag).`);
    }
  }

  // Frontline/backline balance
  const isFrontline = ['Tank', 'Fighter'].includes(primaryClass);
  if (isFrontline) {
    if (ourComp.frontline === 0) {
      parts.push(`We currently have NO frontline. Adding ${primaryClass} provides crucial front-to-back structure.`);
    } else if (ourComp.frontline >= 2) {
      parts.push(`We already have ${ourComp.frontline} frontline champions. Adding ${primaryClass} may make us too tanky/slow.`);
    } else {
      parts.push(`Adding ${primaryClass} improves our frontline presence (currently ${ourComp.frontline}).`);
    }
  } else {
    if (ourComp.backline >= 3) {
      parts.push(`We have ${ourComp.backline} backline champions. Adding ${primaryClass} increases squishiness - need frontline protection.`);
    }
  }

  // Control density
  const hasControl = ['Tank', 'Controller', 'Support'].includes(primaryClass);
  if (hasControl) {
    if (ourComp.controlCount === 0) {
      parts.push(`Adding ${primaryClass} provides our first hard CC for picks and teamfights.`);
    } else {
      parts.push(`Adding ${primaryClass} increases control density (currently ${ourComp.controlCount} CC champions).`);
    }
  }

  return parts.join(' ');
}

/**
 * Generate class counter analysis
 */
function generateClassCounter(champion: Champion, enemyComp: TeamComposition): string {
  const parts: string[] = [];
  const championClasses = champion.tags;
  const primaryClass = championClasses[0];

  // Analyze enemy class distribution
  const enemyTanks = enemyComp.classDistribution.Tank;
  const enemyAssassins = enemyComp.classDistribution.Assassin;
  const enemyMages = enemyComp.classDistribution.Mage;
  const enemyMarksmen = enemyComp.classDistribution.Marksman;

  // Class advantage matrix
  if (primaryClass === 'Tank') {
    if (enemyAssassins > 0) {
      parts.push(`Enemy has ${enemyAssassins} Assassin(s) - Tanks can absorb burst and peel.`);
    }
    if (enemyMarksmen > 0) {
      parts.push(`Enemy has ${enemyMarksmen} Marksman(s) - Tanks can dive and disrupt.`);
    }
  } else if (primaryClass === 'Assassin') {
    if (enemyMages > 0 || enemyMarksmen > 0) {
      parts.push(`Enemy has ${enemyMages + enemyMarksmen} squishy targets - Assassin can eliminate backline.`);
    }
    if (enemyTanks > 1) {
      parts.push(`Concern: Enemy has ${enemyTanks} Tanks - Assassin struggles vs heavy frontline.`);
    }
  } else if (primaryClass === 'Mage') {
    if (enemyTanks > 0) {
      parts.push(`Enemy has ${enemyTanks} Tank(s) - Mage provides sustained magic damage vs tanks.`);
    }
    if (enemyAssassins > 0) {
      parts.push(`Risk: Enemy has ${enemyAssassins} Assassin(s) - Mage needs peel and positioning.`);
    }
  } else if (primaryClass === 'Marksman') {
    if (enemyTanks > 0) {
      parts.push(`Enemy has ${enemyTanks} Tank(s) - Marksman provides sustained DPS to shred frontline.`);
    }
    if (enemyAssassins > 0) {
      parts.push(`Critical risk: Enemy has ${enemyAssassins} Assassin(s) - Marksman is primary target, needs protection.`);
    }
  }

  // Remaining positions threat
  if (enemyComp.remainingPositions.length > 0) {
    parts.push(`Enemy still needs: ${enemyComp.remainingPositions.join(', ')}. They may pick counters to our ${primaryClass}.`);
  }

  return parts.join(' ');
}

/**
 * Generate urgency statement
 */
function generateUrgency(bpState: BPState, currentStep: BPStep, ptsScore: number): string {
  const step = bpState.currentStep + 1;
  const remainingPicks = Math.floor((20 - step) / 2);
  const isLateGame = step > 12;

  if (ptsScore >= 70) {
    return `CRITICAL: Act now! PTS score ${ptsScore.toFixed(1)} indicates high pick/ban threat. If we delay, enemy can deny this option and force us into predictable composition.`;
  } else if (ptsScore >= 50) {
    return `High priority (PTS: ${ptsScore.toFixed(1)}). Enemy acts ${remainingPicks} more times before us. Delaying risks losing this class option.`;
  } else if (isLateGame) {
    return `Late draft - this ${currentStep.action} completes our composition. Remaining picks must fill specific roles.`;
  } else {
    return `Moderate priority (PTS: ${ptsScore.toFixed(1)}). Maintain flexibility for later counter picks.`;
  }
}

/**
 * Generate risk assessment
 */
function generateRisk(champion: Champion, ourComp: TeamComposition, enemyComp: TeamComposition): string {
  const parts: string[] = [];
  const primaryClass = champion.tags[0];

  // Check for composition gaps
  const missingClasses: string[] = [];
  if (ourComp.frontline === 0 && !['Tank', 'Fighter'].includes(primaryClass)) {
    missingClasses.push('frontline');
  }
  if (ourComp.controlCount === 0 && !['Tank', 'Controller', 'Support'].includes(primaryClass)) {
    missingClasses.push('CC');
  }

  if (missingClasses.length > 0) {
    parts.push(`This choice leaves us without ${missingClasses.join(' and ')}. Must address in remaining picks.`);
  }

  // Check for over-commitment
  if (ourComp.backline >= 3 && !['Tank', 'Fighter'].includes(primaryClass)) {
    parts.push(`Risk: 3+ squishy champions makes us vulnerable to dive/engage comps.`);
  }

  // Enemy adaptation
  if (enemyComp.remainingPositions.length >= 2) {
    parts.push(`Enemy has ${enemyComp.remainingPositions.length} picks remaining to counter our ${primaryClass}.`);
  }

  return parts.length > 0 ? parts.join(' ') : `Balanced choice with manageable risks.`;
}

/**
 * Generate detailed recommendation for a champion
 */
export function generateDetailedRecommendation(
  champion: Champion,
  ptsResult: PTSResult,
  bpState: BPState,
  currentStep: BPStep,
  ourPicks: (Champion | null)[],
  enemyPicks: (Champion | null)[]
): string {
  const ourComp = analyzeTeamComposition(ourPicks);
  const enemyComp = analyzeTeamComposition(enemyPicks);

  const stageContext = generateStageContext(bpState, currentStep);
  const classSynergy = generateClassSynergy(champion, ourComp);
  const classCounter = generateClassCounter(champion, enemyComp);
  const urgency = generateUrgency(bpState, currentStep, ptsResult.pts);
  const risk = generateRisk(champion, ourComp, enemyComp);

  // Format output
  return `**Stage Context:**
${stageContext}

**Class Synergy (Our Team):**
${classSynergy}

**Class Counter (Enemy Team):**
${classCounter}

**Urgency:**
${urgency}

**Risk:**
${risk}`;
}
