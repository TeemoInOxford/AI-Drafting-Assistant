/**
 * ban-prediction.ts
 *
 * Turn-by-Turn Ban Prediction (概率分布)
 * 基于 team_ban_blueprints.json 的历史数据
 *
 * 算法：
 * 1. 候选集合 = blueprint top bans + response_bans (if opponent_last_ban)
 * 2. base_score = blueprint_rate
 * 3. 条件修正: score = base_score * (1 + response_rate)
 * 4. 归一化为概率分布 (sum=1)
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface BanPredictionInput {
  team_id: string;
  side: 'blue' | 'red';
  ban_slot: 1 | 2 | 3;
  opponent_last_ban?: string;
  already_banned?: string[]; // Champions already banned in this draft
}

export interface BanPredictionResult {
  champion: string;
  probability: number;
  base_rate: number;
  response_boost: number | null;
  low_confidence: boolean;
}

export interface BanPredictionOutput {
  team_id: string;
  team_name: string;
  side: 'blue' | 'red';
  ban_slot: 1 | 2 | 3;
  opponent_last_ban: string | null;
  sample_size: number;
  low_confidence: boolean;
  predictions: BanPredictionResult[];
}

interface ChampionBanStat {
  champion_id: string;
  champion_name: string;
  count: number;
  rate: number;
}

interface ResponseBanEntry {
  opponent_banned: string;
  responses: Array<{ champion: string; count: number; rate: number }>;
}

interface SideBanBlueprint {
  total_games: number;
  ban_slots: Array<{
    slot: number;
    total_bans: number;
    top_bans: ChampionBanStat[];
  }>;
  response_bans: ResponseBanEntry[];
}

interface TeamBanBlueprint {
  team_id: string;
  team_name: string;
  blue_side: SideBanBlueprint;
  red_side: SideBanBlueprint;
}

interface BlueprintData {
  teams: Record<string, TeamBanBlueprint>;
}

// ============================================================================
// Data Loading (with cache)
// ============================================================================

let cachedBlueprint: BlueprintData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function loadBlueprintData(): BlueprintData | null {
  const now = Date.now();
  if (cachedBlueprint && now - cacheTimestamp < CACHE_TTL) {
    return cachedBlueprint;
  }

  const filePath = path.join(process.cwd(), 'data', 'grid_v2', 'team_ban_blueprints.json');
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    cachedBlueprint = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    cacheTimestamp = now;
    return cachedBlueprint;
  } catch (error) {
    console.error('Failed to load team_ban_blueprints.json:', error);
    return null;
  }
}

// ============================================================================
// Core Prediction Logic
// ============================================================================

const LOW_CONFIDENCE_THRESHOLD = 10;

export function getNextBanPrediction(input: BanPredictionInput): BanPredictionOutput | null {
  const data = loadBlueprintData();
  if (!data) return null;

  const teamBlueprint = data.teams[input.team_id];
  if (!teamBlueprint) return null;

  const sideData = input.side === 'blue' ? teamBlueprint.blue_side : teamBlueprint.red_side;
  const slotData = sideData.ban_slots.find(s => s.slot === input.ban_slot);
  if (!slotData) return null;

  const alreadyBanned = new Set(input.already_banned || []);
  const totalGames = sideData.total_games;
  const lowConfidence = totalGames < LOW_CONFIDENCE_THRESHOLD;

  // Build candidate scores map
  const candidateScores = new Map<string, { base_rate: number; response_boost: number | null }>();

  // 1. Add all top bans from this slot (excluding already banned)
  for (const ban of slotData.top_bans) {
    if (alreadyBanned.has(ban.champion_name)) continue;
    candidateScores.set(ban.champion_name, {
      base_rate: ban.rate,
      response_boost: null,
    });
  }

  // 2. If opponent_last_ban exists, find response bans and add/boost
  if (input.opponent_last_ban) {
    const responseEntry = sideData.response_bans.find(
      r => r.opponent_banned === input.opponent_last_ban
    );

    if (responseEntry) {
      for (const response of responseEntry.responses) {
        if (alreadyBanned.has(response.champion)) continue;

        const existing = candidateScores.get(response.champion);
        if (existing) {
          // Boost existing candidate
          existing.response_boost = response.rate;
        } else {
          // Add new candidate from response bans
          // Use a small base rate for response-only candidates
          candidateScores.set(response.champion, {
            base_rate: 0.01, // Minimal base rate
            response_boost: response.rate,
          });
        }
      }
    }
  }

  // 3. Calculate scores with conditional modification
  const scored: Array<{
    champion: string;
    score: number;
    base_rate: number;
    response_boost: number | null;
  }> = [];

  for (const [champion, data] of candidateScores) {
    let score = data.base_rate;
    if (data.response_boost !== null) {
      score = data.base_rate * (1 + data.response_boost);
    }
    scored.push({
      champion,
      score,
      base_rate: data.base_rate,
      response_boost: data.response_boost,
    });
  }

  // 4. Normalize to probability distribution
  const totalScore = scored.reduce((sum, s) => sum + s.score, 0);

  const predictions: BanPredictionResult[] = scored
    .map(s => ({
      champion: s.champion,
      probability: totalScore > 0 ? s.score / totalScore : 0,
      base_rate: s.base_rate,
      response_boost: s.response_boost,
      low_confidence: lowConfidence,
    }))
    .sort((a, b) => b.probability - a.probability);

  return {
    team_id: input.team_id,
    team_name: teamBlueprint.team_name,
    side: input.side,
    ban_slot: input.ban_slot,
    opponent_last_ban: input.opponent_last_ban || null,
    sample_size: totalGames,
    low_confidence: lowConfidence,
    predictions,
  };
}
