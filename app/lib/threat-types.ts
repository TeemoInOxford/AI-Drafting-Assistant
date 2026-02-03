/**
 * Threat Signal Layer Type Definitions
 *
 * 威胁信号层类型定义
 * 用于分析 ban 模式以识别"基于否定的相关性" - 当对手持续 ban 某个英雄时，表明威胁
 */

import { type LeagueKey } from './league-types';

// ============ Ban Event Types ============

/**
 * 单个 ban 事件记录
 */
export interface BanEvent {
  gameId: string;
  seriesId: string;
  patch: string;
  region: string;
  tournament: string;
  banTeamId: string;
  targetTeamId: string;
  banSide: 'blue' | 'red';
  banSlot: number;           // 1-10 (5 early + 5 late per game)
  phaseGroup: 'early' | 'late';
  championId: string;
  championName: string;
  playersOnTargetTeam: PlayerInfo[];
  playersOnBanTeam: PlayerInfo[];
}

export interface PlayerInfo {
  id: string;
  name: string;
}

// ============ Ban Baseline Types ============

/**
 * 单个英雄的 ban 率统计
 */
export interface BanRateStats {
  banRate: number;           // 被 ban 的比赛数 / 总比赛数
  games: number;             // 总比赛数
}

/**
 * Ban 基线数据结构
 * Context key format: "<patch|GLOBAL>::<region|GLOBAL>"
 */
export interface BanBaselines {
  global: Record<string, Record<string, BanRateStats>>;  // context -> champion -> stats
  early: Record<string, Record<string, BanRateStats>>;   // 仅早期 ban 阶段
}

// ============ Threat Signal Types ============

/**
 * 单个威胁信号
 */
export interface ThreatSignal {
  championId: string;
  championName: string;
  // Observed data
  observed: number;          // 观察到的 ban 率 (针对该队伍/选手) = x/n
  obsLower: number;          // 保守下界 (80% 可信区间下界)
  expected: number;          // 预期 ban 率 (基线)
  // Computed values
  ratio: number;             // R = (obs + s) / (exp + s) - descriptive
  rawObs: number;            // ln((obs+s)/(exp+s)) - raw lift from observed
  rawLower: number;          // ln((obsLower+s)/(exp+s)) - raw lift from lower bound (used for score)
  confidence: number;        // clamp(0, 1, gamesPlayed / N0)
  score: number;             // 100 * confidence * sigmoid(k * max(0, rawLower))
  // Sample info
  gamesPlayed: number;       // n = 该队伍/选手参与的比赛数
  banCount: number;          // x = 被 ban 的次数
  context: string;           // 上下文 key
  // Beta prior parameters (for transparency)
  credibleLevel: number;     // 可信水平 (0.80)
  priorStrengthM: number;    // 先验强度 m
  a0: number;                // 先验 alpha = exp * m
  b0: number;                // 先验 beta = (1-exp) * m
}

/**
 * 威胁信号元数据
 */
export interface ThreatSignalsMeta {
  teamN0: number;            // 队伍 N0 (中位数比赛数)
  playerN0: number;          // 选手 N0 (中位数比赛数)
  generatedAt: string;       // ISO 时间戳
  smoothingFactor: number;   // s 值 (默认 0.005)
  // Log-sigmoid scoring parameters (v1)
  scoringVersion: string;    // e.g., "log-sigmoid-v1"
  k: number;                 // sigmoid steepness: k = ln(9) / raw_p90
  raw_p90: number;           // 90th percentile of raw (positive-only)
  // Beta-Binomial conservatism parameters
  credibleLevel: number;     // 可信水平 (0.80)
  priorStrengthM: number;    // 先验强度 m = clamp(5, 20, round(N0/10))
}

/**
 * 完整的威胁信号数据结构
 */
export interface ThreatSignalsData {
  meta: ThreatSignalsMeta;
  team: Record<string, Record<string, Record<string, ThreatSignal>>>;    // context -> teamId -> champion -> signal
  player: Record<string, Record<string, Record<string, ThreatSignal>>>;  // context -> playerId -> champion -> signal
}

// ============ Query Types ============

/**
 * 队伍威胁查询参数
 */
export interface TeamThreatQuery {
  targetTeamId: string;
  championId: string;
  patch?: string;
  region?: string;
}

/**
 * 选手威胁查询参数
 */
export interface PlayerThreatQuery {
  playerId: string;
  championId: string;
  patch?: string;
  region?: string;
}

/**
 * Top 威胁查询参数
 */
export interface TopThreatsQuery {
  patch?: string;
  region?: string;
  topK?: number;
}

export interface TopTeamThreatsQuery extends TopThreatsQuery {
  targetTeamId: string;
}

export interface TopPlayerThreatsQuery extends TopThreatsQuery {
  playerId: string;
}

/**
 * 威胁查询结果
 */
export interface ThreatQueryResult {
  signal: ThreatSignal | null;
  context: string;           // 实际使用的上下文 (可能是 fallback)
  isFallback: boolean;       // 是否使用了 fallback
}

/**
 * Top 威胁查询结果
 */
export interface TopThreatsResult {
  threats: ThreatSignal[];
  context: string;
  isFallback: boolean;
}

// ============ UI Types ============

/**
 * 威胁等级
 */
export type ThreatLevel = 'high' | 'moderate' | 'low';

/**
 * 威胁徽章属性
 */
export interface ThreatBadgeProps {
  score: number;
  level: ThreatLevel;
  onClick?: () => void;
}

/**
 * 威胁证据 - 队伍级别
 */
export interface TeamThreatEvidence {
  teamId: string;
  teamName: string;
  championId: string;
  championName: string;
  observed: number;
  expected: number;
  ratio: number;
  confidence: number;
  score: number;
  gamesPlayed: number;
  banCount: number;
  notes: string[];
}

/**
 * 威胁证据 - 选手级别
 */
export interface PlayerThreatEvidence {
  playerId: string;
  playerName: string;
  championId: string;
  championName: string;
  observed: number;
  expected: number;
  ratio: number;
  confidence: number;
  score: number;
  gamesPlayed: number;
  banCount: number;
}

/**
 * 完整威胁证据
 */
export interface ThreatEvidence {
  team: TeamThreatEvidence | null;
  topPlayers: PlayerThreatEvidence[];
}

// ============ API Types ============

/**
 * API 请求体
 */
export interface ThreatSignalsRequest {
  targetTeamId?: string;
  playerId?: string;
  championId?: string;
  patch?: string;
  league?: LeagueKey;  // Preferred: use league key (e.g., 'lck', 'lpl')
  region?: string;     // Deprecated: kept for backwards compatibility
  topK?: number;
  queryType: 'team' | 'player' | 'topTeam' | 'topPlayer';
}

/**
 * API 响应体
 */
export interface ThreatSignalsResponse {
  success: boolean;
  data?: ThreatQueryResult | TopThreatsResult;
  error?: string;
}

// ============ Constants ============

/**
 * 默认配置
 */
export const THREAT_CONFIG = {
  smoothingFactor: 0.005,    // s 值
  highThreshold: 0.8,        // top 20% = High
  moderateThreshold: 0.6,    // top 40% = Moderate
  defaultTopK: 10,
} as const;

/**
 * 上下文 key 生成
 */
export function makeContextKey(patch?: string, region?: string): string {
  const p = patch || 'GLOBAL';
  const r = region || 'GLOBAL';
  return `${p}::${r}`;
}

/**
 * 全局上下文 key
 */
export const GLOBAL_CONTEXT = 'GLOBAL::GLOBAL';
