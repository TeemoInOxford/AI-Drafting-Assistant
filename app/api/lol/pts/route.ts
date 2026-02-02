/**
 * API endpoint for server-side PTS calculation with Game Theory enhancement
 * This ensures we can use real draft data for calculations
 */

import { NextRequest, NextResponse } from 'next/server';
import { calculatePTS, bpStateToDraftState } from '@/app/lib/pts-engine';
import {
  enhancePTSWithHybridModel,
  filterCandidatePool,
  GameTheoryState
} from '@/app/lib/hybrid-game-theory';
import { enrichPTSResult } from '@/app/lib/recommendation-reason';
import { BPState, BPStep, Champion, Position, OpponentModel } from '@/app/lib/types';

export const dynamic = 'force-dynamic';

/**
 * 获取对手已选的英雄
 */
function getObservedPicks(bpState: BPState, ourTeam: 'blue' | 'red'): Champion[] {
  const opponentPicks = ourTeam === 'blue'
    ? bpState.redPicks
    : bpState.bluePicks;

  return opponentPicks.filter(p => p !== null) as Champion[];
}

interface PTSRequest {
  bpState: BPState;
  currentStep: BPStep;
  availableChampions: Champion[];
  gameTheoryState?: GameTheoryState; // 可选的博弈状态
  enableGameTheory?: boolean;         // 是否启用博弈论增强
}

export async function POST(request: NextRequest) {
  try {
    const body: PTSRequest = await request.json();
    let { bpState, currentStep, availableChampions, gameTheoryState, enableGameTheory = false } = body;

    // 确保usedChampions是Set类型（JSON传输会将Set转为数组或对象）
    if (!bpState.usedChampions || typeof bpState.usedChampions !== 'object' || !('has' in bpState.usedChampions)) {
      console.log(`[PTS API] Converting usedChampions from ${typeof bpState.usedChampions} (${Array.isArray(bpState.usedChampions) ? 'array' : 'object'}) to Set`);

      // 如果是数组
      if (Array.isArray(bpState.usedChampions)) {
        bpState.usedChampions = new Set(bpState.usedChampions);
      }
      // 如果是对象（可能是空对象{}）
      else if (typeof bpState.usedChampions === 'object') {
        bpState.usedChampions = new Set(Object.keys(bpState.usedChampions));
      }
      // 其他情况，创建空Set
      else {
        bpState.usedChampions = new Set<string>();
      }

      console.log(`[PTS API] Converted usedChampions to Set with ${bpState.usedChampions.size} items`);
    }

    console.log(`[PTS API] ========== NEW REQUEST ==========`);
    console.log(`[PTS API] Step: ${bpState.currentStep}, Team: ${currentStep.team}, Action: ${currentStep.action}`);
    console.log(`[PTS API] Blue Picks: ${bpState.bluePicks.filter(p => p).map(p => p?.name).join(', ') || 'none'}`);
    console.log(`[PTS API] Red Picks: ${bpState.redPicks.filter(p => p).map(p => p?.name).join(', ') || 'none'}`);
    console.log(`[PTS API] Blue Bans: ${bpState.blueBans.filter(b => b.champion).map(b => b.champion?.name).join(', ') || 'none'}`);
    console.log(`[PTS API] Red Bans: ${bpState.redBans.filter(b => b.champion).map(b => b.champion?.name).join(', ') || 'none'}`);
    console.log(`[PTS API] Available champions: ${availableChampions.length}`);
    console.log(`[PTS API] Game Theory enabled: ${enableGameTheory}`);

    if (!currentStep || !availableChampions || availableChampions.length === 0) {
      return NextResponse.json({
        success: true,
        results: [],
      });
    }

    // Convert BP state to draft state
    const draftState = bpStateToDraftState(bpState, currentStep, currentStep.team);

    // 构建OpponentModel（如果有Game Theory信息）
    console.log(`[PTS API] gameTheoryState:`, gameTheoryState ? `${gameTheoryState.predictedType} (${(gameTheoryState.confidence * 100).toFixed(0)}%)` : 'undefined');

    const opponentModel: OpponentModel | undefined = gameTheoryState && gameTheoryState.confidence > 0.3 ? {
      predictedType: gameTheoryState.predictedType,
      confidence: gameTheoryState.confidence,
      observedPicks: getObservedPicks(bpState, currentStep.team),
    } : undefined;

    if (opponentModel) {
      console.log(`[PTS API] OpponentModel created: ${opponentModel.predictedType} (${(opponentModel.confidence * 100).toFixed(0)}%), ${opponentModel.observedPicks.length} picks`);
    } else {
      console.log(`[PTS API] OpponentModel not created (confidence too low or no gameTheoryState)`);
    }

    // Calculate PTS scores with opponent model
    // 关闭归一化，使用原始 PTS 分数以保留绝对意义
    let results = calculatePTS(draftState, availableChampions, undefined, false, opponentModel);

    // 注意：对手信息已经融合到PTS计算中
    // Game Theory enhancement is now integrated into PTS calculation
    // Skipping the legacy enhancePTSWithHybridModel for now

    // Apply Game Theory enhancement if enabled (DISABLED - now integrated into PTS)
    if (false && enableGameTheory && gameTheoryState) {
      try {
        console.log(`[PTS API] Applying Game Theory enhancement...`);
        console.log(`[PTS API] Opponent type: ${gameTheoryState?.predictedType}, Confidence: ${((gameTheoryState?.confidence ?? 0) * 100).toFixed(0)}%`);

        // Filter candidate pool (key optimization)
        const candidates = filterCandidatePool(availableChampions, bpState, currentStep, currentStep.team);
        console.log(`[PTS API] Candidate pool: ${availableChampions.length} -> ${candidates.length} (${((1 - candidates.length / availableChampions.length) * 100).toFixed(0)}% reduction)`);

        // Enhance PTS with hybrid model
        results = enhancePTSWithHybridModel(
          results,
          availableChampions,
          gameTheoryState!,
          bpState,
          currentStep,
          currentStep.team
        );
      } catch (gtError) {
        console.error('[PTS API] Game Theory enhancement failed:', gtError);
        console.error('[PTS API] Stack:', (gtError as Error)?.stack ?? 'No stack trace');
        // Continue with base PTS results if game theory fails
      }
    }

    console.log(`[PTS API] Calculated ${results.length} champions`);

    // Enrich results with threat/recommend levels and detailed reasons
    const isBanPhase = currentStep.action === 'ban';
    const ourPicks = currentStep.team === 'blue'
      ? bpState.bluePicks.filter(p => p).map(p => p!.id)
      : bpState.redPicks.filter(p => p).map(p => p!.id);
    const opponentPicks = currentStep.team === 'blue'
      ? bpState.redPicks.filter(p => p).map(p => p!.id)
      : bpState.bluePicks.filter(p => p).map(p => p!.id);

    // Calculate remaining roles
    const allRoles: Position[] = ['top', 'jungle', 'mid', 'bot', 'support'];
    const ourPicksChampions = currentStep.team === 'blue' ? bpState.bluePicks : bpState.redPicks;
    const filledRoles = new Set<Position>();
    ourPicksChampions.forEach(pick => {
      if (pick && pick.positions.length === 1) {
        filledRoles.add(pick.positions[0]);
      }
    });
    const remainingRoles = allRoles.filter(role => !filledRoles.has(role));

    results = results.map(result =>
      enrichPTSResult(
        result,
        isBanPhase,
        ourPicks,
        opponentPicks,
        remainingRoles,
        gameTheoryState
      )
    );

    if (results.length > 0) {
      console.log(`[PTS API] Top 10 recommendations:`);
      results.slice(0, 10).forEach((r, i) => {
        const level = isBanPhase ? r.threatLevel : r.recommendLevel;
        console.log(`  ${i + 1}. ${r.championName.padEnd(15)} ${isBanPhase ? '威胁度' : '推荐度'}: ${level} | PTS: ${r.pts.toFixed(1).padStart(5)}`);
      });
    }
    console.log(`[PTS API] ====================================`);

    return NextResponse.json({
      success: true,
      results,
      metadata: {
        step: bpState.currentStep,
        team: currentStep.team,
        action: currentStep.action,
        championCount: results.length,
        gameTheoryEnabled: enableGameTheory,
        opponentType: gameTheoryState?.predictedType,
        confidence: gameTheoryState?.confidence,
      },
    });
  } catch (error) {
    console.error('[PTS API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to calculate PTS',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
