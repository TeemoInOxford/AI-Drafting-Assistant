#!/usr/bin/env ts-node
/**
 * build_draft_timeline.ts
 *
 * 解析 data/grid_v2/series_*.json，抽取每个 game 的 draftActions 并标准化。
 *
 * 运行方式:
 *   npx ts-node scripts/build_draft_timeline.ts
 *   或
 *   node --loader ts-node/esm scripts/build_draft_timeline.ts
 *
 * 输出:
 *   data/grid_v2/draft_timeline.jsonl
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Constants
// ============================================================================

/**
 * 标准 BP 顺序 (共 20 步)
 */
const SLOT_ORDER = [
  'BLUE_BAN_1',
  'RED_BAN_1',
  'BLUE_BAN_2',
  'RED_BAN_2',
  'BLUE_BAN_3',
  'RED_BAN_3',
  'BLUE_PICK_1',
  'RED_PICK_1',
  'RED_PICK_2',
  'BLUE_PICK_2',
  'BLUE_PICK_3',
  'RED_PICK_3',
  'RED_BAN_4',
  'BLUE_BAN_4',
  'RED_BAN_5',
  'BLUE_BAN_5',
  'RED_PICK_4',
  'BLUE_PICK_4',
  'BLUE_PICK_5',
  'RED_PICK_5',
] as const;

const DATA_DIR = path.join(process.cwd(), 'data', 'grid_v2');
const OUTPUT_FILE = path.join(DATA_DIR, 'draft_timeline.jsonl');

// ============================================================================
// Types
// ============================================================================

interface DraftAction {
  id?: string;
  type?: string;
  sequenceNumber?: string | number;
  drafter?: {
    id?: string;
    type?: string;
  };
  draftable?: {
    id?: string;
    type?: string;
    name?: string;
  };
}

interface Team {
  id?: string;
  name?: string;
  side?: 'blue' | 'red' | string;
}

interface Game {
  id?: string;
  sequenceNumber?: number;
  draftActions?: DraftAction[];
  teams?: Team[];
  titleVersion?: {
    name?: string;
    _inferred?: boolean;
  };
  patch?: string;
}

interface Series {
  id?: string;
  tournament?: {
    name?: string;
  };
  games?: Game[];
  patch?: string;
  titleVersion?: {
    name?: string;
  };
}

interface TimelineAction {
  i: number;
  slot: string;
  side: 'blue' | 'red';
  type: 'ban' | 'pick';
  championId: string;
  championName: string;
  teamId: string;
}

interface TimelineEntry {
  seriesId: string;
  gameId: string;
  gameSequence: number;
  patch: string | null;
  tournament: string | null;
  blueTeamId: string;
  blueTeamName: string;
  redTeamId: string;
  redTeamName: string;
  actions: TimelineAction[];
}

interface Stats {
  seriesCount: number;
  gamesProcessed: number;
  gamesSkipped: number;
  actionsProcessed: number;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * 从 slot 名称解析 side
 */
function getSideFromSlot(slot: string): 'blue' | 'red' {
  return slot.startsWith('BLUE') ? 'blue' : 'red';
}

/**
 * 从 slot 名称解析 type
 */
function getTypeFromSlot(slot: string): 'ban' | 'pick' {
  return slot.includes('BAN') ? 'ban' : 'pick';
}

/**
 * 安全获取嵌套属性
 */
function safeGet<T>(obj: unknown, ...keys: string[]): T | undefined {
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current as T | undefined;
}

/**
 * 解析单个 game 的 draft timeline
 */
function parseGameDraft(
  series: Series,
  game: Game,
  stats: Stats
): TimelineEntry | null {
  const seriesId = series.id || 'unknown';
  const gameId = game.id || 'unknown';
  const gameSequence = game.sequenceNumber ?? 0;

  // 获取 teams
  const teams = game.teams || [];
  if (teams.length < 2) {
    stats.warnings.push(`[${seriesId}/${gameId}] Missing teams (found ${teams.length})`);
  }

  // 找出 blue/red team
  let blueTeam: Team | undefined;
  let redTeam: Team | undefined;

  for (const team of teams) {
    if (team.side === 'blue') {
      blueTeam = team;
    } else if (team.side === 'red') {
      redTeam = team;
    }
  }

  // 如果没有 side 字段，按顺序假设 (第一个=blue, 第二个=red) - 这是一个 fallback
  if (!blueTeam && !redTeam && teams.length >= 2) {
    stats.warnings.push(`[${seriesId}/${gameId}] Teams missing 'side' field, assuming order`);
    blueTeam = teams[0];
    redTeam = teams[1];
  }

  const blueTeamId = blueTeam?.id || '';
  const blueTeamName = blueTeam?.name || '';
  const redTeamId = redTeam?.id || '';
  const redTeamName = redTeam?.name || '';

  // 获取 draftActions
  const draftActions = game.draftActions || [];
  if (draftActions.length === 0) {
    stats.warnings.push(`[${seriesId}/${gameId}] No draftActions`);
    return null;
  }

  // 获取 patch
  const patch = game.titleVersion?.name || game.patch || series.titleVersion?.name || series.patch || null;

  // 获取 tournament
  const tournament = series.tournament?.name || null;

  // 处理 actions
  const actions: TimelineAction[] = [];

  for (let i = 0; i < draftActions.length; i++) {
    const action = draftActions[i];

    // 确定 slot
    let slot: string;
    if (i < SLOT_ORDER.length) {
      slot = SLOT_ORDER[i];
    } else {
      slot = `EXTRA_${i}`;
      stats.warnings.push(`[${seriesId}/${gameId}] Extra action at index ${i}, using ${slot}`);
    }

    // 确定 side 和 type
    const side = getSideFromSlot(slot);
    const type = getTypeFromSlot(slot);

    // 获取 champion 信息
    const championId = action.draftable?.id || '';
    const championName = action.draftable?.name || '';

    // 确定 teamId
    // 优先用 action 自带的 drafter.id，否则用 side 推断
    let teamId = action.drafter?.id;
    if (!teamId) {
      teamId = side === 'blue' ? blueTeamId : redTeamId;
    }

    // 验证 action type 与 slot 是否一致
    if (action.type && action.type !== type) {
      stats.warnings.push(
        `[${seriesId}/${gameId}] Action ${i}: type mismatch (slot=${slot}, action.type=${action.type})`
      );
    }

    actions.push({
      i,
      slot,
      side,
      type,
      championId,
      championName,
      teamId: teamId || '',
    });
  }

  // 检查 actions 数量
  if (draftActions.length < 20) {
    stats.warnings.push(
      `[${seriesId}/${gameId}] Incomplete draft: only ${draftActions.length} actions (expected 20)`
    );
  }

  stats.actionsProcessed += actions.length;

  return {
    seriesId,
    gameId,
    gameSequence,
    patch,
    tournament,
    blueTeamId,
    blueTeamName,
    redTeamId,
    redTeamName,
    actions,
  };
}

/**
 * 处理单个 series 文件
 */
function processSeriesFile(filePath: string, stats: Stats): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const series: Series = JSON.parse(content);

    const games = series.games || [];
    if (games.length === 0) {
      stats.warnings.push(`[${series.id || filePath}] No games found`);
      return entries;
    }

    for (const game of games) {
      const entry = parseGameDraft(series, game, stats);
      if (entry) {
        entries.push(entry);
        stats.gamesProcessed++;
      } else {
        stats.gamesSkipped++;
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    stats.errors.push(`[${filePath}] Parse error: ${errMsg}`);
  }

  return entries;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('Build Draft Timeline');
  console.log('='.repeat(60));
  console.log(`Input: ${DATA_DIR}/series_*.json`);
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log('');

  const stats: Stats = {
    seriesCount: 0,
    gamesProcessed: 0,
    gamesSkipped: 0,
    actionsProcessed: 0,
    errors: [],
    warnings: [],
  };

  // 找到所有 series_*.json 文件
  const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('series_') && f.endsWith('.json'));
  console.log(`Found ${files.length} series files`);
  console.log('');

  // 处理所有文件
  const allEntries: TimelineEntry[] = [];

  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    const entries = processSeriesFile(filePath, stats);
    allEntries.push(...entries);
    stats.seriesCount++;

    // 进度显示
    if (stats.seriesCount % 100 === 0) {
      process.stdout.write(`\rProcessed ${stats.seriesCount}/${files.length} series...`);
    }
  }
  console.log(`\rProcessed ${stats.seriesCount}/${files.length} series.`);
  console.log('');

  // 写入 JSONL 文件
  console.log(`Writing ${allEntries.length} game timelines to ${OUTPUT_FILE}...`);
  const outputLines = allEntries.map(entry => JSON.stringify(entry));
  fs.writeFileSync(OUTPUT_FILE, outputLines.join('\n') + '\n', 'utf-8');
  console.log('Done.');
  console.log('');

  // 输出统计
  console.log('='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Series processed:    ${stats.seriesCount}`);
  console.log(`Games processed:     ${stats.gamesProcessed}`);
  console.log(`Games skipped:       ${stats.gamesSkipped}`);
  console.log(`Actions processed:   ${stats.actionsProcessed}`);
  console.log(`Errors:              ${stats.errors.length}`);
  console.log(`Warnings:            ${stats.warnings.length}`);
  console.log('');

  // 输出 errors
  if (stats.errors.length > 0) {
    console.log('='.repeat(60));
    console.log('Errors');
    console.log('='.repeat(60));
    for (const err of stats.errors.slice(0, 20)) {
      console.log(`  - ${err}`);
    }
    if (stats.errors.length > 20) {
      console.log(`  ... and ${stats.errors.length - 20} more`);
    }
    console.log('');
  }

  // 输出 warnings (只显示前 20 条)
  if (stats.warnings.length > 0) {
    console.log('='.repeat(60));
    console.log('Warnings (first 20)');
    console.log('='.repeat(60));
    for (const warn of stats.warnings.slice(0, 20)) {
      console.log(`  - ${warn}`);
    }
    if (stats.warnings.length > 20) {
      console.log(`  ... and ${stats.warnings.length - 20} more`);
    }
    console.log('');
  }

  // 输出样例
  if (allEntries.length > 0) {
    console.log('='.repeat(60));
    console.log('Sample Output (first entry)');
    console.log('='.repeat(60));
    console.log(JSON.stringify(allEntries[0], null, 2));
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
