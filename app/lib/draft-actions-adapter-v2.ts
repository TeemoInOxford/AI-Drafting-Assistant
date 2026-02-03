/**
 * Draft Actions Adapter V2
 *
 * 新数据结构适配层 - Step 1A
 *
 * 从 grid_series_data/series_*.json 文件解析 draftActions 到 NormalizedDraftAction[] 格式
 *
 * 核心设计原则：
 * A. draftActions 是唯一 BP 事实源
 * B. player 归因必须是确定性反查（character.name 匹配）
 * C. ban 永远不允许归因到 player（ban 是 team 行为）
 * D. 所有不确定性必须显式为 null + 报告
 * E. 不允许静默修复、不允许隐式填充
 */

import * as fs from 'fs';
import * as path from 'path';

// ============ Types ============

/**
 * 标准化的 Draft Action（输出格式）
 */
export interface NormalizedDraftAction {
  actionType: 'ban' | 'pick';
  seq: number;                    // 1..20
  teamId: string;                 // drafter.id
  championId: string;             // draftable.id
  championName: string;           // draftable.name
  side: 'blue' | 'red' | null;    // 如果原数据没有 side → 推断
  playerId: string | null;        // 仅 pick 可非 null
  sourceMatchId: string;          // game.id
  sourceSeriesId: string;         // series.id
  sideSource: 'data' | 'inferred' | 'unknown';  // side 来源
}

/**
 * 原始 draftAction 结构（来自 series_*.json）
 */
export interface RawDraftAction {
  type: 'ban' | 'pick';
  sequenceNumber: string;
  drafter: {
    id: string;
    type: string;
  };
  draftable: {
    id: string;
    type: string;
    name: string;
  };
}

/**
 * 原始 game.teams[].players[] 结构
 */
export interface RawGamePlayer {
  id: string;
  name: string;
  character?: {
    id: string;
    name: string;
  };
  participationStatus?: string;
}

/**
 * 原始 game.teams[] 结构
 */
export interface RawGameTeam {
  id: string;
  name: string;
  side?: 'blue' | 'red';
  won?: boolean;
  players?: RawGamePlayer[];
}

/**
 * 原始 game 结构
 */
export interface RawGame {
  id: string;
  sequenceNumber: number;
  started?: boolean;
  finished?: boolean;
  draftActions?: RawDraftAction[];
  teams?: RawGameTeam[];
}

/**
 * 原始 series 结构
 */
export interface RawSeries {
  id: string;
  format?: string;
  started?: boolean;
  finished?: boolean;
  startedAt?: string;
  duration?: string;
  teams?: Array<{
    id: string;
    name: string;
    score?: number;
    won?: boolean;
    players?: Array<{
      id: string;
      name: string;
    }>;
  }>;
  games?: RawGame[];
}

/**
 * series_list.json 中的元数据
 */
export interface SeriesListEntry {
  id: string;
  startedAt?: string;
  format?: string;
  started?: boolean;
  finished?: boolean;
  teams?: Array<{
    id: string;
    name: string;
    score?: number;
    won?: boolean;
  }>;
  gamesCount?: number;
  tournament?: {
    id: string;
    name: string;
    nameShortened?: string;
    parent?: {
      id: string;
      name: string;
    };
  };
}

/**
 * 解析结果
 */
export interface ParseResult {
  actions: NormalizedDraftAction[];
  gameId: string;
  seriesId: string;
  validation: {
    totalActions: number;
    bans: number;
    picks: number;
    isValid: boolean;
    hasSequenceGaps: boolean;
    duplicateSequences: number[];
    picksWithPlayer: number;
    picksWithoutPlayer: number;
    unmatchedChampions: string[];
    sideInferredCount: number;
    sideFromDataCount: number;
    sideUnknownCount: number;
  };
  warnings: string[];
}

/**
 * 汇总统计
 */
export interface AggregatedStats {
  totalSeries: number;
  totalGames: number;
  validGames: number;
  invalidGames: number;
  totalActions: number;
  totalBans: number;
  totalPicks: number;
  picksWithPlayer: number;
  picksWithoutPlayer: number;
  pickAttributionRate: number;
  sideInferredCount: number;
  sideFromDataCount: number;
  sideUnknownCount: number;
  uniqueTeams: Set<string>;
  uniquePlayers: Set<string>;
  uniqueChampions: Set<string>;
  unmatchedChampions: Map<string, number>;
  invalidGameIds: string[];
  gamesWithIncompleteActions: string[];
  gamesWithMissingCharacterBinding: string[];
}

// ============ Constants ============

/**
 * 标准 draft 序列：
 * - 1-6: Early bans (Blue: 1,3,5 | Red: 2,4,6)
 * - 7-12: First picks (Blue: 7,9,10 | Red: 8,11,12)
 * - 13-16: Late bans (Blue: 13,15 | Red: 14,16)
 * - 17-20: Final picks (Blue: 17,20 | Red: 18,19)
 */
const BLUE_SEQUENCES = [1, 3, 5, 7, 9, 10, 13, 15, 17, 20];
const RED_SEQUENCES = [2, 4, 6, 8, 11, 12, 14, 16, 18, 19];

const BAN_SEQUENCES = [1, 2, 3, 4, 5, 6, 13, 14, 15, 16];
const PICK_SEQUENCES = [7, 8, 9, 10, 11, 12, 17, 18, 19, 20];

const EARLY_BAN_SEQUENCES = [1, 2, 3, 4, 5, 6];
const LATE_BAN_SEQUENCES = [13, 14, 15, 16];

// ============ Helper Functions ============

/**
 * 从序列号推断 side
 */
function inferSideFromSequence(seq: number): 'blue' | 'red' {
  return BLUE_SEQUENCES.includes(seq) ? 'blue' : 'red';
}

/**
 * 获取 ban 阶段
 */
export function getPhaseGroup(seq: number): 'early' | 'late' | 'pick' {
  if (EARLY_BAN_SEQUENCES.includes(seq)) return 'early';
  if (LATE_BAN_SEQUENCES.includes(seq)) return 'late';
  return 'pick';
}

/**
 * 获取 ban slot (1-10)
 */
export function getBanSlot(seq: number): number {
  if (seq >= 1 && seq <= 6) return seq;
  if (seq >= 13 && seq <= 16) return seq - 6;  // 13->7, 14->8, 15->9, 16->10
  return 0;
}

// ============ Core Parser ============

/**
 * 解析单个 game 的 draftActions
 *
 * 严格规则：
 * - ban 的 playerId 永远为 null
 * - pick 的 playerId 仅通过 character.name 匹配确定
 * - 无法匹配时 playerId = null，不进行推断
 */
export function parseGameDraftActions(game: RawGame, seriesId: string): ParseResult {
  const warnings: string[] = [];
  const actions: NormalizedDraftAction[] = [];

  const validation = {
    totalActions: 0,
    bans: 0,
    picks: 0,
    isValid: false,
    hasSequenceGaps: false,
    duplicateSequences: [] as number[],
    picksWithPlayer: 0,
    picksWithoutPlayer: 0,
    unmatchedChampions: [] as string[],
    sideInferredCount: 0,
    sideFromDataCount: 0,
    sideUnknownCount: 0,
  };

  if (!game.draftActions || game.draftActions.length === 0) {
    warnings.push('No draft actions found');
    return { actions, gameId: game.id, seriesId, validation, warnings };
  }

  // 构建 team side map
  const teamSideMap = new Map<string, 'blue' | 'red'>();
  const teamPlayersMap = new Map<string, RawGamePlayer[]>();

  if (game.teams) {
    for (const team of game.teams) {
      if (team.side) {
        teamSideMap.set(team.id, team.side);
      }
      if (team.players) {
        teamPlayersMap.set(team.id, team.players);
      }
    }
  }

  // 如果 teams 没有 side 信息，从 draft 顺序推断（seq 1 = blue）
  let sideInferredFromDraft = false;
  if (teamSideMap.size < 2 && game.teams && game.teams.length >= 2) {
    const firstBan = game.draftActions.find(a => a.type === 'ban' && a.sequenceNumber === '1');
    if (firstBan) {
      const blueTeamId = firstBan.drafter.id;
      teamSideMap.set(blueTeamId, 'blue');
      const redTeam = game.teams.find(t => t.id !== blueTeamId);
      if (redTeam) {
        teamSideMap.set(redTeam.id, 'red');
      }
      sideInferredFromDraft = true;
      warnings.push('Side inferred from draft order (seq 1 = blue)');
    }
  }

  // 构建 champion -> player 映射（用于 pick 归因）
  // Key: championName (lowercase), Value: { playerId, teamId }
  const championToPlayerMap = new Map<string, { playerId: string; teamId: string }>();

  for (const [teamId, players] of teamPlayersMap) {
    for (const player of players) {
      if (player.character?.name) {
        const champKey = player.character.name.toLowerCase();
        championToPlayerMap.set(champKey, { playerId: player.id, teamId });
      }
    }
  }

  // 跟踪已见序列号
  const seenSequences = new Set<number>();

  // 处理每个 draft action
  for (const action of game.draftActions) {
    const seq = parseInt(action.sequenceNumber, 10);
    if (isNaN(seq) || seq < 1 || seq > 20) {
      warnings.push(`Invalid sequence number: ${action.sequenceNumber}`);
      continue;
    }

    // 检查重复
    if (seenSequences.has(seq)) {
      validation.duplicateSequences.push(seq);
    }
    seenSequences.add(seq);

    // 确定 side
    let side: 'blue' | 'red' | null = null;
    let sideSource: 'data' | 'inferred' | 'unknown' = 'unknown';

    const teamSide = teamSideMap.get(action.drafter.id);
    if (teamSide) {
      side = teamSide;
      sideSource = sideInferredFromDraft ? 'inferred' : 'data';
    } else {
      // 无法从数据确定，使用序列号推断
      side = inferSideFromSequence(seq);
      sideSource = 'inferred';
    }

    // 统计 side 来源
    if (sideSource === 'data') {
      validation.sideFromDataCount++;
    } else if (sideSource === 'inferred') {
      validation.sideInferredCount++;
    } else {
      validation.sideUnknownCount++;
    }

    // 归因 player（仅限 pick）
    let playerId: string | null = null;

    if (action.type === 'pick') {
      const champKey = action.draftable.name.toLowerCase();
      const playerInfo = championToPlayerMap.get(champKey);

      if (playerInfo && playerInfo.teamId === action.drafter.id) {
        playerId = playerInfo.playerId;
        validation.picksWithPlayer++;
      } else {
        // 无法归因 - 设为 null，不进行推断
        validation.picksWithoutPlayer++;
        if (!validation.unmatchedChampions.includes(action.draftable.name)) {
          validation.unmatchedChampions.push(action.draftable.name);
        }
      }
    }
    // ban 的 playerId 永远为 null（已经是默认值）

    actions.push({
      actionType: action.type,
      seq,
      teamId: action.drafter.id,
      championId: action.draftable.id,
      championName: action.draftable.name,
      side,
      playerId,
      sourceMatchId: game.id,
      sourceSeriesId: seriesId,
      sideSource,
    });

    validation.totalActions++;
    if (action.type === 'ban') {
      validation.bans++;
    } else {
      validation.picks++;
    }
  }

  // 按序列号排序
  actions.sort((a, b) => a.seq - b.seq);

  // 验证序列完整性
  const expectedSequences = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  const missingSequences: number[] = [];
  for (const seq of expectedSequences) {
    if (!seenSequences.has(seq)) {
      missingSequences.push(seq);
    }
  }
  validation.hasSequenceGaps = missingSequences.length > 0;

  if (missingSequences.length > 0) {
    warnings.push(`Missing sequences: ${missingSequences.join(', ')}`);
  }

  // 最终验证
  validation.isValid = validation.totalActions === 20 &&
    validation.bans === 10 &&
    validation.picks === 10 &&
    !validation.hasSequenceGaps &&
    validation.duplicateSequences.length === 0;

  return { actions, gameId: game.id, seriesId, validation, warnings };
}

/**
 * 解析单个 series 文件
 */
export function parseSeriesFile(seriesPath: string): {
  seriesId: string;
  startedAt: string | null;
  results: ParseResult[];
  teams: Array<{ id: string; name: string; players: Array<{ id: string; name: string }> }>;
} {
  const content = fs.readFileSync(seriesPath, 'utf-8');
  const series: RawSeries = JSON.parse(content);

  const results: ParseResult[] = [];

  if (series.games) {
    for (const game of series.games) {
      if (game.finished) {
        const result = parseGameDraftActions(game, series.id);
        results.push(result);
      }
    }
  }

  return {
    seriesId: series.id,
    startedAt: series.startedAt || null,
    results,
    teams: (series.teams || []).map(t => ({
      id: t.id,
      name: t.name,
      players: t.players || [],
    })),
  };
}

/**
 * 从 grid_series_data 目录加载所有数据
 */
export function loadAllSeriesData(dataDir: string): {
  seriesList: SeriesListEntry[];
  allResults: Map<string, ParseResult[]>;  // seriesId -> results
  stats: AggregatedStats;
} {
  const seriesListPath = path.join(dataDir, 'series_list.json');
  const seriesList: SeriesListEntry[] = JSON.parse(fs.readFileSync(seriesListPath, 'utf-8'));

  const allResults = new Map<string, ParseResult[]>();
  const stats: AggregatedStats = {
    totalSeries: 0,
    totalGames: 0,
    validGames: 0,
    invalidGames: 0,
    totalActions: 0,
    totalBans: 0,
    totalPicks: 0,
    picksWithPlayer: 0,
    picksWithoutPlayer: 0,
    pickAttributionRate: 0,
    sideInferredCount: 0,
    sideFromDataCount: 0,
    sideUnknownCount: 0,
    uniqueTeams: new Set(),
    uniquePlayers: new Set(),
    uniqueChampions: new Set(),
    unmatchedChampions: new Map(),
    invalidGameIds: [],
    gamesWithIncompleteActions: [],
    gamesWithMissingCharacterBinding: [],
  };

  // 遍历所有 series 文件
  const seriesFiles = fs.readdirSync(dataDir).filter(f => f.startsWith('series_') && f.endsWith('.json'));

  for (const file of seriesFiles) {
    const seriesPath = path.join(dataDir, file);
    try {
      const { seriesId, results, teams } = parseSeriesFile(seriesPath);
      stats.totalSeries++;

      allResults.set(seriesId, results);

      // 收集 team 和 player 信息
      for (const team of teams) {
        stats.uniqueTeams.add(team.id);
        for (const player of team.players) {
          stats.uniquePlayers.add(player.id);
        }
      }

      for (const result of results) {
        stats.totalGames++;

        if (result.validation.isValid) {
          stats.validGames++;
        } else {
          stats.invalidGames++;
          stats.invalidGameIds.push(result.gameId);
        }

        if (result.validation.hasSequenceGaps) {
          stats.gamesWithIncompleteActions.push(result.gameId);
        }

        if (result.validation.picksWithoutPlayer > 0) {
          stats.gamesWithMissingCharacterBinding.push(result.gameId);
        }

        stats.totalActions += result.validation.totalActions;
        stats.totalBans += result.validation.bans;
        stats.totalPicks += result.validation.picks;
        stats.picksWithPlayer += result.validation.picksWithPlayer;
        stats.picksWithoutPlayer += result.validation.picksWithoutPlayer;
        stats.sideInferredCount += result.validation.sideInferredCount;
        stats.sideFromDataCount += result.validation.sideFromDataCount;
        stats.sideUnknownCount += result.validation.sideUnknownCount;

        for (const action of result.actions) {
          stats.uniqueChampions.add(action.championName);
          stats.uniqueTeams.add(action.teamId);
          if (action.playerId) {
            stats.uniquePlayers.add(action.playerId);
          }
        }

        for (const champ of result.validation.unmatchedChampions) {
          stats.unmatchedChampions.set(champ, (stats.unmatchedChampions.get(champ) || 0) + 1);
        }
      }
    } catch (error) {
      console.error(`Error parsing ${file}:`, error);
    }
  }

  // 计算归因率
  const totalPicks = stats.picksWithPlayer + stats.picksWithoutPlayer;
  stats.pickAttributionRate = totalPicks > 0 ? stats.picksWithPlayer / totalPicks : 0;

  return { seriesList, allResults, stats };
}

/**
 * 获取所有 NormalizedDraftAction（扁平化）
 */
export function getAllNormalizedActions(allResults: Map<string, ParseResult[]>): NormalizedDraftAction[] {
  const actions: NormalizedDraftAction[] = [];
  for (const results of allResults.values()) {
    for (const result of results) {
      actions.push(...result.actions);
    }
  }
  return actions;
}

/**
 * 获取所有 ban actions
 */
export function getAllBanActions(allResults: Map<string, ParseResult[]>): NormalizedDraftAction[] {
  return getAllNormalizedActions(allResults).filter(a => a.actionType === 'ban');
}

/**
 * 获取所有 pick actions
 */
export function getAllPickActions(allResults: Map<string, ParseResult[]>): NormalizedDraftAction[] {
  return getAllNormalizedActions(allResults).filter(a => a.actionType === 'pick');
}
