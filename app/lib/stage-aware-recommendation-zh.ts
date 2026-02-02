/**
 * Stage-Aware Recommendation Generator (Chinese Version)
 * 生成详细的推荐理由（中文版本）
 */

import { Champion, BPState, BPStep, Position, ChampionClass, PTSResult } from './types';
import { TeamChampionPool, ChampionTeamAvailability } from './team-champion-pool.types';

interface TeamComposition {
  picks: (Champion | null)[];
  classDistribution: Record<ChampionClass, number>;
  remainingPositions: Position[];
  damageTypes: { physical: number; magical: number };
  frontline: number;
  backline: number;
  controlCount: number;
}

// 职业中文映射
const CLASS_NAMES_ZH: Record<ChampionClass, string> = {
  Tank: '坦克',
  Fighter: '战士',
  Assassin: '刺客',
  Mage: '法师',
  Marksman: '射手',
  Support: '辅助',
  Controller: '控制',
};

// 位置中文映射
const POSITION_NAMES_ZH: Record<Position, string> = {
  top: '上路',
  jungle: '打野',
  mid: '中路',
  bot: '下路',
  support: '辅助',
};

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
 * Generate stage context description (Chinese)
 */
function generateStageContext(bpState: BPState, currentStep: BPStep): string {
  const step = bpState.currentStep + 1; // 1-indexed for display

  let phase = '';
  if (step <= 6) {
    phase = 'Ban阶段1';
  } else if (step <= 12) {
    phase = '选人阶段1';
  } else if (step <= 16) {
    phase = 'Ban阶段2';
  } else {
    phase = '选人阶段2';
  }

  const isEarly = step <= 12;
  const teamName = currentStep.team === 'blue' ? '蓝色方' : '红色方';
  const sideAdvantage = currentStep.team === 'blue' ? '先手优势' : '后手康特优势';

  if (isEarly) {
    return `当前第${step}步（${phase}），我方是${teamName}，拥有${sideAdvantage}。此阶段职业灵活性比具体康特更重要。`;
  } else {
    return `当前第${step}步（${phase}），我方是${teamName}，处于后期${currentStep.action === 'ban' ? 'Ban' : '选人'}阶段。敌方阵容已经明朗，具体职业康特和阵容完整性至关重要。`;
  }
}

/**
 * Generate class synergy analysis for PICK (Chinese)
 */
function generateClassSynergyForPick(champion: Champion, ourComp: TeamComposition): string {
  const parts: string[] = [];
  const championClasses = champion.tags;
  const primaryClass = championClasses[0];
  const primaryClassZh = CLASS_NAMES_ZH[primaryClass];

  // Damage type analysis
  const isDamageDealer = ['Fighter', 'Assassin', 'Mage', 'Marksman'].includes(primaryClass);
  if (isDamageDealer) {
    const isPhysical = ['Fighter', 'Assassin', 'Marksman'].includes(primaryClass);
    const currentPhys = ourComp.damageTypes.physical;
    const currentMag = ourComp.damageTypes.magical;

    if (isPhysical && currentPhys > 70) {
      parts.push(`选择${primaryClassZh}会让我们AD过重（${currentPhys + 20}%物理伤害）。风险：敌方可以堆护甲。`);
    } else if (!isPhysical && currentMag > 70) {
      parts.push(`选择${primaryClassZh}会让我们AP过重（${currentMag + 20}%魔法伤害）。风险：敌方可以堆魔抗。`);
    } else {
      parts.push(`选择${primaryClassZh}提供${isPhysical ? 'AD' : 'AP'}伤害，平衡我们的伤害构成（${currentPhys}%物理，${currentMag}%魔法）。`);
    }
  }

  // Frontline/backline balance
  const isFrontline = ['Tank', 'Fighter'].includes(primaryClass);
  if (isFrontline) {
    if (ourComp.frontline === 0) {
      parts.push(`我们目前没有前排。选择${primaryClassZh}提供关键的前后排结构。`);
    } else if (ourComp.frontline >= 2) {
      parts.push(`我们已有${ourComp.frontline}个前排英雄。选择${primaryClassZh}可能让阵容过于笨重/缓慢。`);
    } else {
      parts.push(`选择${primaryClassZh}增强我们的前排存在（当前${ourComp.frontline}个）。`);
    }
  } else {
    if (ourComp.backline >= 3) {
      parts.push(`我们有${ourComp.backline}个后排英雄。选择${primaryClassZh}增加脆皮度 - 需要前排保护。`);
    }
  }

  // Control density
  const hasControl = ['Tank', 'Controller', 'Support'].includes(primaryClass);
  if (hasControl) {
    if (ourComp.controlCount === 0) {
      parts.push(`选择${primaryClassZh}提供我们第一个硬控，用于抓人和团战。`);
    } else {
      parts.push(`选择${primaryClassZh}增加控制密度（当前${ourComp.controlCount}个控制英雄）。`);
    }
  }

  return parts.join(' ');
}

/**
 * Generate ban reasoning (Chinese)
 * Ban阶段的推荐理由：为什么要禁用这个英雄
 */
function generateBanReasoning(champion: Champion, ourComp: TeamComposition, enemyComp: TeamComposition): string {
  const parts: string[] = [];
  const primaryClass = champion.tags[0];
  const primaryClassZh = CLASS_NAMES_ZH[primaryClass];

  // 分析该英雄对敌方的价值
  parts.push(`**Ban掉${champion.name}的理由：**`);

  // 检查是否是早期阶段（双方都还没选人或选人很少）
  const isEarlyStage = ourComp.picks.length === 0 && enemyComp.picks.length === 0;
  const hasEnoughPicks = ourComp.picks.length >= 2 || enemyComp.picks.length >= 2;

  if (isEarlyStage) {
    // 早期阶段：只分析英雄本身的特点，不分析阵容缺失

    // 1. 职业灵活性
    if (champion.tags.length >= 2) {
      parts.push(`• ${champion.name}职业灵活（${champion.tags.map(t => CLASS_NAMES_ZH[t]).join('/')}），可以适配多种阵容`);
    }

    // 2. 版本强势（可以基于其他指标，这里简化处理）
    parts.push(`• ${champion.name}是当前版本强势英雄，限制敌方选择空间`);

    // 3. 英雄特点
    if (primaryClass === 'Assassin') {
      parts.push(`• ${champion.name}（刺客）具有高爆发能力，威胁后排安全`);
    } else if (primaryClass === 'Tank') {
      parts.push(`• ${champion.name}（坦克）提供强大的开团和前排能力`);
    } else if (['Mage', 'Marksman'].includes(primaryClass)) {
      parts.push(`• ${champion.name}（${primaryClassZh}）提供持续输出能力`);
    }
  } else {
    // 中后期阶段：可以分析阵容缺失和针对性

    // 1. 该英雄对敌方阵容的价值（只在敌方有选人时分析）
    if (enemyComp.picks.length > 0) {
      const enemyNeedsFrontline = enemyComp.frontline === 0;
      const enemyNeedsControl = enemyComp.controlCount === 0;
      const enemyNeedsDamage = enemyComp.classDistribution.Mage + enemyComp.classDistribution.Marksman + enemyComp.classDistribution.Assassin === 0;

      if (['Tank', 'Fighter'].includes(primaryClass) && enemyNeedsFrontline) {
        parts.push(`• 敌方缺少前排，${champion.name}（${primaryClassZh}）是他们的关键补充`);
      }

      if (['Tank', 'Controller', 'Support'].includes(primaryClass) && enemyNeedsControl) {
        parts.push(`• 敌方缺少控制，${champion.name}可以完善他们的开团能力`);
      }

      if (['Mage', 'Marksman', 'Assassin'].includes(primaryClass) && enemyNeedsDamage) {
        parts.push(`• 敌方缺少输出核心，${champion.name}是他们的关键carry点`);
      }
    }

    // 2. 该英雄对我方阵容的威胁（只在我方有选人时分析）
    if (ourComp.picks.length > 0) {
      const ourHasBackline = ourComp.backline >= 2;
      const ourLacksFrontline = ourComp.frontline === 0;

      if (primaryClass === 'Assassin' && ourHasBackline) {
        parts.push(`• 我方有${ourComp.backline}个后排，${champion.name}（刺客）会严重威胁我方脆皮`);
      }

      if (primaryClass === 'Tank' && ourLacksFrontline) {
        parts.push(`• 我方缺少前排，敌方选${champion.name}（坦克）会让我们难以突破`);
      }

      if (['Mage', 'Marksman'].includes(primaryClass) && ourLacksFrontline) {
        parts.push(`• 我方缺少前排，敌方的${champion.name}（${primaryClassZh}）会自由输出`);
      }
    }

    // 3. 通用高优先级原因
    if (champion.tags.length >= 2) {
      parts.push(`• ${champion.name}职业灵活（${champion.tags.map(t => CLASS_NAMES_ZH[t]).join('/')}），可以适配多种阵容`);
    }

    // 如果没有特别理由，给出通用理由
    if (parts.length === 1) {
      parts.push(`• ${champion.name}是当前版本强势英雄，限制敌方选择空间`);
    }
  }

  return parts.join('\n');
}

/**
 * Predict enemy composition direction (Chinese)
 * 预测敌方阵容走向（新增）
 */
function predictEnemyComposition(enemyComp: TeamComposition, bpState: BPState): string {
  const parts: string[] = [];
  const { classDistribution, remainingPositions, frontline, backline } = enemyComp;

  // Analyze enemy's current pattern
  const totalPicks = enemyComp.picks.length;
  if (totalPicks === 0) {
    return '敌方尚未选人，无法预测阵容方向。';
  }

  // Determine primary composition direction (≈60-70% probability)
  let primaryDirection = '';
  let primaryReason = '';
  let secondaryDirection = '';
  let secondaryCondition = '';
  let uncertaintySource = '';

  // Pattern detection based on class distribution
  const hasTank = classDistribution.Tank > 0;
  const hasController = classDistribution.Controller > 0;
  const hasAssassin = classDistribution.Assassin > 0;
  const hasFighter = classDistribution.Fighter > 0;
  const hasMage = classDistribution.Mage > 0;
  const hasMarksman = classDistribution.Marksman > 0;

  // Heavy engage/teamfight composition
  if (frontline >= 2 || (hasTank && hasController)) {
    primaryDirection = '团战/开团型阵容';
    primaryReason = `敌方已有${frontline}个前排${hasController ? '和控制英雄' : ''}，倾向于强开团和5v5团战`;
    secondaryDirection = '分推/牵制型';
    secondaryCondition = '如果他们在剩余位置选择机动性英雄（如分推战士）';
    uncertaintySource = remainingPositions.length > 0 ? `${remainingPositions.map(p => POSITION_NAMES_ZH[p]).join('、')}位置` : '后续选择';
  }
  // Poke/siege composition
  else if (hasMage && hasMarksman && frontline === 0) {
    primaryDirection = '消耗/拉扯型阵容';
    primaryReason = '敌方选择了远程输出但缺少前排，倾向于远距离消耗和避战';
    secondaryDirection = '后期发育型';
    secondaryCondition = '如果他们补充保护型前排（如坦克辅助）';
    uncertaintySource = remainingPositions.includes('support') || remainingPositions.includes('top') ? '前排位置选择' : '阵容完整度';
  }
  // Assassin/pick composition
  else if (hasAssassin || (hasFighter && !hasTank)) {
    primaryDirection = '抓单/游走型阵容';
    primaryReason = `敌方有${classDistribution.Assassin + classDistribution.Fighter}个机动性英雄，倾向于分散抓单和小规模战斗`;
    secondaryDirection = '突进/强开型';
    secondaryCondition = '如果他们补充开团控制英雄';
    uncertaintySource = '中后期英雄选择的控制密度';
  }
  // Scaling/late game composition
  else if (hasMarksman && totalPicks >= 2 && frontline <= 1) {
    primaryDirection = '发育/后期型阵容';
    primaryReason = '敌方选择了需要发育的核心输出，倾向于避战和拖后期';
    secondaryDirection = '四保一体系';
    secondaryCondition = '如果他们在剩余位置全选保护型英雄';
    uncertaintySource = '辅助和前排的保护能力';
  }
  // Default: balanced/flexible
  else {
    primaryDirection = '均衡/灵活型阵容';
    primaryReason = '敌方职业分布较为均衡，可以适应多种战术';
    secondaryDirection = '待定';
    secondaryCondition = `取决于剩余${remainingPositions.length}个位置的选择`;
    uncertaintySource = '阵容方向尚未明确';
  }

  parts.push(`**最可能方向（≈60-70%）**: ${primaryDirection}`);
  parts.push(`  ${primaryReason}`);
  if (secondaryDirection !== '待定') {
    parts.push(`\n**次可能方向（≈30-40%）**: ${secondaryDirection}`);
    parts.push(`  触发条件: ${secondaryCondition}`);
  }
  parts.push(`\n**不确定性来源**: ${uncertaintySource}`);

  return parts.join('\n');
}

/**
 * Generate counter value for BAN (Chinese)
 * Ban阶段的反制价值：禁用该英雄如何影响敌方阵容
 */
function generateCounterValueForBan(
  champion: Champion,
  enemyComp: TeamComposition,
  enemyPrediction: string
): string {
  const parts: string[] = [];
  const primaryClass = champion.tags[0];
  const primaryClassZh = CLASS_NAMES_ZH[primaryClass];

  // Extract enemy direction from prediction
  const isTeamfight = enemyPrediction.includes('团战') || enemyPrediction.includes('开团');
  const isPoke = enemyPrediction.includes('消耗') || enemyPrediction.includes('拉扯');
  const isPick = enemyPrediction.includes('抓单') || enemyPrediction.includes('游走');
  const isScaling = enemyPrediction.includes('发育') || enemyPrediction.includes('后期');

  parts.push(`**Ban掉该英雄对敌方阵容的影响:**`);

  // Analyze how banning this champion disrupts enemy's predicted composition
  if (isTeamfight) {
    if (['Tank', 'Controller'].includes(primaryClass)) {
      parts.push(`✓ 削弱敌方团战/开团能力，迫使他们选择次优前排或控制`);
    } else if (['Mage', 'Marksman'].includes(primaryClass)) {
      parts.push(`✓ 减少敌方团战输出选择，降低其团战威胁`);
    } else {
      parts.push(`⚠ 对敌方团战阵容影响有限，他们仍有其他选择`);
    }
  } else if (isPoke) {
    if (['Mage', 'Marksman'].includes(primaryClass)) {
      parts.push(`✓ 限制敌方消耗核心选择，打破其拉扯战术`);
    } else if (['Tank', 'Fighter'].includes(primaryClass)) {
      parts.push(`⚠ 该英雄不是消耗阵容核心，ban掉影响较小`);
    } else {
      parts.push(`⚠ 对敌方消耗阵容影响中等`);
    }
  } else if (isPick) {
    if (['Assassin', 'Fighter'].includes(primaryClass)) {
      parts.push(`✓ 限制敌方抓单/游走能力，保护我方发育环境`);
    } else if (['Support', 'Tank'].includes(primaryClass)) {
      parts.push(`⚠ 该英雄不是抓单核心，但可能提供游走支援`);
    } else {
      parts.push(`⚠ 对敌方抓单阵容影响有限`);
    }
  } else if (isScaling) {
    if (['Marksman', 'Mage'].includes(primaryClass)) {
      parts.push(`✓ 限制敌方后期核心选择，迫使他们改变发育策略`);
    } else if (['Tank', 'Support'].includes(primaryClass)) {
      parts.push(`✓ 削弱敌方保护能力，增加其后期核心风险`);
    } else {
      parts.push(`⚠ 对敌方发育阵容影响中等`);
    }
  }

  // Analyze what enemy might do after this ban
  parts.push(`\n**敌方可能的应对:**`);
  if (enemyComp.remainingPositions.length >= 2) {
    parts.push(`敌方还有${enemyComp.remainingPositions.length}个位置，可以选择替代英雄`);
    parts.push(`建议后续继续针对性ban或抢夺同类型强势英雄`);
  } else if (enemyComp.remainingPositions.length === 1) {
    parts.push(`敌方仅剩1个位置，此ban直接影响其最后选择`);
  } else {
    parts.push(`敌方阵容已完整，此ban为下局做准备`);
  }

  return parts.join('\n');
}

/**
 * Generate counter value for PICK (Chinese)
 * Pick阶段的反制价值：选择该英雄如何对抗敌方阵容
 */
function generateCounterValueForPick(
  champion: Champion,
  enemyComp: TeamComposition,
  enemyPrediction: string
): string {
  const parts: string[] = [];
  const primaryClass = champion.tags[0];
  const primaryClassZh = CLASS_NAMES_ZH[primaryClass];

  // Extract enemy direction from prediction
  const isTeamfight = enemyPrediction.includes('团战') || enemyPrediction.includes('开团');
  const isPoke = enemyPrediction.includes('消耗') || enemyPrediction.includes('拉扯');
  const isPick = enemyPrediction.includes('抓单') || enemyPrediction.includes('游走');
  const isScaling = enemyPrediction.includes('发育') || enemyPrediction.includes('后期');

  // Analyze counter value against primary direction
  parts.push(`**针对主预测路径:**`);

  if (isTeamfight) {
    if (['Tank', 'Controller'].includes(primaryClass)) {
      parts.push(`✓ ${primaryClassZh}可以在团战中提供控制和前排，限制敌方开团效果`);
    } else if (['Assassin', 'Fighter'].includes(primaryClass)) {
      parts.push(`⚠ ${primaryClassZh}在5v5团战中可能被敌方前排限制，需要寻找绕后机会`);
    } else if (['Mage', 'Marksman'].includes(primaryClass)) {
      parts.push(`✓ ${primaryClassZh}可以提供团战AOE输出，但需要前排保护`);
    }
  } else if (isPoke) {
    if (['Tank', 'Fighter'].includes(primaryClass)) {
      parts.push(`✓ ${primaryClassZh}可以强开团，打破敌方消耗节奏`);
    } else if (['Assassin'].includes(primaryClass)) {
      parts.push(`✓ ${primaryClassZh}可以切入击杀敌方消耗核心`);
    } else {
      parts.push(`⚠ ${primaryClassZh}在消耗战中可能被动，需要主动寻找机会`);
    }
  } else if (isPick) {
    if (['Tank', 'Support'].includes(primaryClass)) {
      parts.push(`✓ ${primaryClassZh}可以提供视野和保护，降低被抓风险`);
    } else if (['Assassin', 'Fighter'].includes(primaryClass)) {
      parts.push(`⚠ ${primaryClassZh}在抓单战中可能遭遇敌方游走英雄的反蹲`);
    } else {
      parts.push(`⚠ ${primaryClassZh}容易成为敌方抓单目标，需要谨慎走位`);
    }
  } else if (isScaling) {
    if (['Assassin', 'Fighter'].includes(primaryClass)) {
      parts.push(`✓ ${primaryClassZh}可以在前中期施压，不给敌方发育空间`);
    } else if (['Marksman', 'Mage'].includes(primaryClass)) {
      parts.push(`⚠ ${primaryClassZh}与敌方争夺后期，需要确保我方前期不崩`);
    } else {
      parts.push(`✓ ${primaryClassZh}可以保护我方核心，稳定过渡到后期`);
    }
  }

  // Analyze risk if enemy goes secondary direction
  parts.push(`\n**如果敌方转向次预测路径:**`);
  if (enemyComp.remainingPositions.length >= 2) {
    parts.push(`敌方还有${enemyComp.remainingPositions.length}个位置未定，可能调整阵容方向`);
    parts.push(`我方需要在后续BP中根据敌方实际选择进行补救`);
  } else if (enemyComp.remainingPositions.length === 1) {
    parts.push(`敌方仅剩1个位置，阵容方向基本确定，风险可控`);
  } else {
    parts.push(`敌方阵容已完整，我方${primaryClassZh}的定位明确`);
  }

  return parts.join('\n');
}

/**
 * Generate urgency statement (Chinese)
 */
function generateUrgency(bpState: BPState, currentStep: BPStep, ptsScore: number): string {
  const step = bpState.currentStep + 1;
  const remainingPicks = Math.floor((20 - step) / 2);
  const isLateGame = step > 12;

  if (ptsScore >= 70) {
    return `紧急！立即行动！PTS分数${ptsScore.toFixed(1)}表明高选/禁威胁。如果我们拖延，敌方可以封锁此选项，迫使我们进入可预测的阵容。`;
  } else if (ptsScore >= 50) {
    return `高优先级（PTS: ${ptsScore.toFixed(1)}）。敌方还会行动${remainingPicks}次才轮到我们。拖延有失去此职业选项的风险。`;
  } else if (isLateGame) {
    return `后期选人 - 此${currentStep.action === 'ban' ? 'Ban' : '选择'}完善我们的阵容。剩余选择必须填补特定角色。`;
  } else {
    return `中等优先级（PTS: ${ptsScore.toFixed(1)}）。保持灵活性以便后续康特选择。`;
  }
}

/**
 * Generate team fit analysis (Chinese)
 * 队伍适配度分析：基于队伍英雄池评估
 */
function generateTeamFitSection(
  champion: Champion,
  teamPool: TeamChampionPool | null
): string {
  const parts: string[] = [];
  parts.push(`**7️⃣ 队伍适配度：**`);

  // 如果没有队伍数据，使用默认提示
  if (!teamPool) {
    parts.push(`ℹ️ 未选择战队，无法分析队伍英雄池`);
    parts.push(`💡 提示：在 BP 开始前选择战队可获得更精准的推荐`);
    return parts.join('\n');
  }

  const availability = teamPool.championAvailability.get(champion.id);

  if (!availability) {
    parts.push(`❌ 队伍中无人使用过此英雄，不建议选择`);
    parts.push(`\n📊 数据来源：${teamPool.teamName} 的职业比赛数据`);
    return parts.join('\n');
  }

  const { availablePlayers, teamProficiencyScore, bestPlayer, flexibilityScore } = availability;
  const bestPlayerData = availablePlayers[0];
  const bestPlayerName = bestPlayerData.playerName;
  const bestProficiency = bestPlayerData.proficiencyLevel;

  // 1. 最佳选手评估
  if (bestProficiency === 5) {
    parts.push(`✓ **${bestPlayerName}** 的招牌英雄（使用率 ${(bestPlayerData.frequency * 100).toFixed(1)}%）`);
  } else if (bestProficiency >= 3) {
    parts.push(`✓ **${bestPlayerName}** 熟练使用此英雄（使用率 ${(bestPlayerData.frequency * 100).toFixed(1)}%）`);
  } else {
    parts.push(`⚠️ **${bestPlayerName}** 较少使用此英雄（使用率 ${(bestPlayerData.frequency * 100).toFixed(1)}%）`);
  }

  // 2. 灵活性评估（关键！）
  if (availablePlayers.length >= 3) {
    const otherPlayers = availablePlayers.slice(1, 3).map(p => p.playerName).join('、');
    parts.push(`✓ **高灵活性**：${otherPlayers} 等 ${availablePlayers.length} 人可用，可灵活交换`);
  } else if (availablePlayers.length === 2) {
    const backupPlayer = availablePlayers[1].playerName;
    const backupProficiency = availablePlayers[1].proficiencyLevel;
    parts.push(`✓ **备选方案**：${backupPlayer} 也可使用（熟练度 ${backupProficiency}星）`);
  } else {
    parts.push(`⚠️ **唯一选择**：仅 ${bestPlayerName} 会用，缺少备选方案`);
  }

  // 3. 时效性
  const recentPlayers = availablePlayers.filter(p => p.isRecent);
  if (recentPlayers.length > 0) {
    parts.push(`✓ 最近使用：${recentPlayers.map(p => p.playerName).join('、')}`);
  }

  // 4. 队伍整体评分
  let scoreLabel = '';
  if (teamProficiencyScore >= 80) scoreLabel = '（非常擅长）';
  else if (teamProficiencyScore >= 60) scoreLabel = '（擅长）';
  else if (teamProficiencyScore >= 40) scoreLabel = '（熟练）';
  else if (teamProficiencyScore >= 20) scoreLabel = '（一般）';
  else scoreLabel = '（不太熟练）';

  parts.push(`\n📊 队伍熟练度评分：${teamProficiencyScore.toFixed(0)}/100 ${scoreLabel}`);

  // 5. 数据来源
  const totalGames = availablePlayers.reduce((sum, p) => sum + p.totalGames, 0);
  parts.push(`📈 数据来源：${teamPool.teamName} 共 ${totalGames} 场职业比赛`);

  return parts.join('\n');
}

/**
 * Generate ban reasoning for team (Chinese)
 * Ban阶段的推荐理由：针对敌方队伍
 */
function generateBanReasoningForTeam(
  champion: Champion,
  ourTeamPool: TeamChampionPool | null,
  enemyTeamPool: TeamChampionPool | null
): string {
  const parts: string[] = [];
  parts.push(`**3️⃣ Ban位理由：**`);

  // 如果没有敌方队伍数据，使用默认分析
  if (!enemyTeamPool) {
    parts.push(`ℹ️ 未选择敌方战队，使用通用 Ban 位分析`);
    // 这里可以调用原来的 generateBanReasoning 函数
    return parts.join('\n');
  }

  const enemyAvailability = enemyTeamPool.championAvailability.get(champion.id);

  if (!enemyAvailability) {
    parts.push(`⚠️ 敌方队伍无人使用过此英雄，ban掉价值较低`);
    parts.push(`\n💡 建议：优先 ban 敌方擅长的英雄`);
    return parts.join('\n');
  }

  const { availablePlayers, teamProficiencyScore, bestPlayer, flexibilityScore } = enemyAvailability;
  const bestPlayerData = availablePlayers[0];
  const bestPlayerName = bestPlayerData.playerName;

  // 1. 威胁评估
  if (teamProficiencyScore >= 80) {
    parts.push(`🔥 **高威胁**：敌方队伍对此英雄极为擅长（评分 ${teamProficiencyScore.toFixed(0)}/100）`);
  } else if (teamProficiencyScore >= 60) {
    parts.push(`⚠️ **中等威胁**：敌方队伍熟练使用此英雄（评分 ${teamProficiencyScore.toFixed(0)}/100）`);
  } else {
    parts.push(`ℹ️ **低威胁**：敌方队伍对此英雄不太熟练（评分 ${teamProficiencyScore.toFixed(0)}/100）`);
  }

  // 2. 核心选手分析
  if (bestPlayerData.proficiencyLevel === 5) {
    parts.push(`• **${bestPlayerName}** 的招牌英雄（使用率 ${(bestPlayerData.frequency * 100).toFixed(1)}%）`);
  } else {
    parts.push(`• **${bestPlayerName}** 最擅长此英雄（使用率 ${(bestPlayerData.frequency * 100).toFixed(1)}%）`);
  }

  // 3. 灵活性分析（重要！）
  if (availablePlayers.length >= 3) {
    parts.push(`• ⚠️ **高灵活性**：敌方 ${availablePlayers.length} 人可用，难以通过位置预测`);
  } else if (availablePlayers.length === 2) {
    const backup = availablePlayers[1].playerName;
    parts.push(`• 备选：${backup} 也可使用`);
  } else {
    parts.push(`• ✓ **唯一选择**：仅 ${bestPlayerName} 会用，ban掉可有效限制`);
  }

  // 4. Ban掉的价值
  if (teamProficiencyScore >= 70 && availablePlayers.length === 1) {
    parts.push(`\n✅ **强烈推荐Ban**：招牌英雄且无备选，ban掉价值极高`);
  } else if (teamProficiencyScore >= 70 && availablePlayers.length >= 3) {
    parts.push(`\n⚠️ **谨慎考虑**：虽然擅长但灵活性高，ban掉后可能有替代方案`);
  } else if (teamProficiencyScore < 50) {
    parts.push(`\n❌ **不建议Ban**：敌方不太擅长，ban位价值较低`);
  }

  parts.push(`\n📊 数据来源：${enemyTeamPool.teamName} 的职业比赛数据`);

  return parts.join('\n');
}

/**
 * Generate risk assessment (Chinese)
 */
function generateRisk(champion: Champion, ourComp: TeamComposition, enemyComp: TeamComposition): string {
  const parts: string[] = [];
  const primaryClass = champion.tags[0];
  const primaryClassZh = CLASS_NAMES_ZH[primaryClass];

  // 检查是否是早期阶段（我方还没选人或选人很少）
  const isEarlyStage = ourComp.picks.length === 0;
  const isMidStage = ourComp.picks.length >= 1 && ourComp.picks.length <= 2;

  if (isEarlyStage) {
    // 早期阶段：不分析阵容缺失，因为还没开始选人
    return `平衡的选择，风险可控。`;
  }

  // 中后期阶段：分析阵容缺失和风险

  // Check for composition gaps
  const missingClasses: string[] = [];
  if (ourComp.frontline === 0 && !['Tank', 'Fighter'].includes(primaryClass)) {
    missingClasses.push('前排');
  }
  if (ourComp.controlCount === 0 && !['Tank', 'Controller', 'Support'].includes(primaryClass)) {
    missingClasses.push('控制');
  }

  if (missingClasses.length > 0) {
    parts.push(`此选择会让我们缺少${missingClasses.join('和')}。必须在剩余选择中解决。`);
  }

  // Check for over-commitment
  if (ourComp.backline >= 3 && !['Tank', 'Fighter'].includes(primaryClass)) {
    parts.push(`风险：3个以上脆皮英雄让我们容易被突进/开团阵容针对。`);
  }

  // Enemy adaptation
  if (enemyComp.remainingPositions.length >= 2) {
    parts.push(`敌方还有${enemyComp.remainingPositions.length}个选择来康特我们的${primaryClassZh}。`);
  }

  return parts.length > 0 ? parts.join(' ') : `平衡的选择，风险可控。`;
}

/**
 * Generate detailed recommendation for a champion (Chinese)
 * 按照新的7步框架生成推荐理由，区分 Ban 和 Pick，支持队伍英雄池
 */
export function generateDetailedRecommendationZh(
  champion: Champion,
  ptsResult: PTSResult,
  bpState: BPState,
  currentStep: BPStep,
  ourPicks: (Champion | null)[],
  enemyPicks: (Champion | null)[],
  ourTeamPool?: TeamChampionPool | null,
  enemyTeamPool?: TeamChampionPool | null
): string {
  const ourComp = analyzeTeamComposition(ourPicks);
  const enemyComp = analyzeTeamComposition(enemyPicks);
  const isBan = currentStep.action === 'ban';

  // 1️⃣ 阶段背景重建
  const stageContext = generateStageContext(bpState, currentStep);

  // 2️⃣ 敌方阵容走向预测
  const enemyPrediction = predictEnemyComposition(enemyComp, bpState);

  // 3️⃣ 我方阵容适配与协同分析（仅 Pick 阶段）/ Ban 理由（Ban 阶段）
  let synergyOrBanReason: string;
  if (isBan) {
    // 如果有队伍数据，使用队伍级别的 Ban 分析
    if (enemyTeamPool) {
      synergyOrBanReason = generateBanReasoningForTeam(champion, ourTeamPool || null, enemyTeamPool);
    } else {
      synergyOrBanReason = generateBanReasoning(champion, ourComp, enemyComp);
    }
  } else {
    synergyOrBanReason = generateClassSynergyForPick(champion, ourComp);
  }

  // 4️⃣ 针对敌方预测的反制价值（区分 Ban/Pick）
  let counterValue: string;
  if (isBan) {
    counterValue = generateCounterValueForBan(champion, enemyComp, enemyPrediction);
  } else {
    counterValue = generateCounterValueForPick(champion, enemyComp, enemyPrediction);
  }

  // 5️⃣ 阶段紧迫性说明
  const urgency = generateUrgency(bpState, currentStep, ptsResult.pts);

  // 6️⃣ 风险与不确定性声明（仅 Pick 阶段）
  const risk = isBan ? null : generateRisk(champion, ourComp, enemyComp);

  // 7️⃣ 队伍适配度分析（新增）
  const teamFit = generateTeamFitSection(champion, ourTeamPool || null);

  // 按照新的输出格式组织（根据 Ban/Pick 调整标题）
  if (isBan) {
    return `**1️⃣ 阶段背景：**
${stageContext}

**2️⃣ 敌方阵容预测：**
${enemyPrediction}

**3️⃣ Ban位理由：**
${synergyOrBanReason}

**4️⃣ 反制价值：**
${counterValue}

**5️⃣ 紧迫性：**
${urgency}

${teamFit}`;
  } else {
    return `**1️⃣ 阶段背景：**
${stageContext}

**2️⃣ 敌方阵容预测：**
${enemyPrediction}

**3️⃣ 我方职业协同：**
${synergyOrBanReason}

**4️⃣ 反制价值：**
${counterValue}

**5️⃣ 紧迫性：**
${urgency}

**6️⃣ 风险评估：**
${risk}

${teamFit}`;
  }
}
