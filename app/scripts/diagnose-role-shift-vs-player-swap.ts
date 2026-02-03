/**
 * Diagnose Role Shift vs Player Swap
 *
 * 区分两类变化：
 * A. Hero Role Shift（英雄换路）：英雄的"先验/映射"过时，同一选手在异常局前后仍在同一位置
 * B. Player Role Swap（选手换位置）：选手从某时点开始，大多数出场都落在另一条路
 *
 * 核心方法：
 * 1. 构建玩家时间序列
 * 2. 局内"粗位置"估计（英雄先验 + 贪心分配）
 * 3. 定义"异常事件"（estimatedRole 与先验主位置不一致）
 * 4. 时间邻域判别（前后窗口的 role 分布）
 * 5. 英雄层面"共识验证"（cross-player 检查）
 * 6. 输出 JSON 和报告
 *
 * 数据源：data/grid_v2/series_*.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { CHAMPION_POSITIONS } from '../lib/positions';
import { Position } from '../lib/types';

// ============ CONSTANTS (集中定义，便于调整) ============

/** 时间邻域窗口大小（前后各取多少场） */
const WINDOW_SIZE = 5;

/** role 稳定性阈值 */
const ROLE_STABILITY_THRESHOLD = 0.6;

/** Hero Shift 共识验证：英雄在窗口内主导位置占比阈值 */
const HERO_SHIFT_CONSENSUS_THRESHOLD = 0.35;

/** Hero Shift 共识验证：日期窗口大小（天） */
const HERO_SHIFT_DATE_WINDOW_DAYS = 30;

/** 所有位置列表 */
const ALL_ROLES: Position[] = ['top', 'jungle', 'mid', 'bot', 'support'];

// ============ TYPES ============

interface RawGamePlayer {
  id: string;
  name: string;
  character?: {
    id: string;
    name: string;
  };
}

interface RawGameTeam {
  id: string;
  name: string;
  side?: 'blue' | 'red';
  won?: boolean;
  players?: RawGamePlayer[];
}

interface RawGame {
  id: string;
  sequenceNumber: number;
  started?: boolean;
  finished?: boolean;
  teams?: RawGameTeam[];
}

interface RawSeries {
  id: string;
  startedAt?: string;
  teams?: Array<{
    id: string;
    name: string;
    players?: Array<{ id: string; name: string }>;
  }>;
  games?: RawGame[];
}

/** 单场比赛中的玩家记录 */
interface PlayerGameRecord {
  date: Date;
  dateStr: string;
  matchId: string;
  seriesId: string;
  teamId: string;
  championName: string;
  opponentTeamId: string;
  estimatedRole: Position | null;
  assignmentConfidence: number; // 0-1, 1=无冲突
}

/** 异常事件 */
interface AnomalyEvent {
  playerId: string;
  playerName: string;
  championName: string;
  date: Date;
  dateStr: string;
  estimatedRole: Position | null;
  priorPrimaryRole: Position;
  teamId: string;
  matchId: string;
  seriesId: string;
  assignmentConfidence: number;
  // 时间邻域判别结果
  prevRoleMode: Position | null;
  nextRoleMode: Position | null;
  roleStabilityPrev: number;
  roleStabilityNext: number;
  classification: 'hero_role_shift' | 'player_role_swap' | 'ambiguous';
  classificationReason: string;
  // Hero Shift 验证
  heroShiftConfirmed?: boolean;
  heroShiftWeakEvidence?: boolean;
  heroWindowStats?: {
    windowStart: string;
    windowEnd: string;
    totalGames: number;
    roleDistribution: Record<Position, number>;
    dominantRole: Position;
    dominantRoleShare: number;
  };
}

/** 英雄窗口统计 */
interface HeroWindowStats {
  championName: string;
  windowStart: string;
  windowEnd: string;
  totalGames: number;
  roleDistribution: Record<Position, number>;
  dominantRole: Position;
  dominantRoleShare: number;
  priorPrimaryRole: Position;
  shifted: boolean;
}

/** 输出 JSON 结构 */
interface DiagnosisOutput {
  meta: {
    generatedAt: string;
    totalMatches: number;
    totalPlayers: number;
    totalAnomalyEvents: number;
    classificationCounts: {
      hero_role_shift: number;
      player_role_swap: number;
      ambiguous: number;
    };
    heroShiftConfirmedCount: number;
    heroShiftWeakEvidenceCount: number;
    parameters: {
      windowSize: number;
      roleStabilityThreshold: number;
      heroShiftConsensusThreshold: number;
      heroShiftDateWindowDays: number;
    };
    dataQuality: {
      gamesWithMissingDate: number;
      gamesWithMissingPlayers: number;
      gamesWithRoleAssignmentConflicts: number;
      playersWithUnknownChampion: number;
    };
  };
  events: AnomalyEvent[];
  hero_window_stats: HeroWindowStats[];
}

// ============ HELPER FUNCTIONS ============

/**
 * 获取英雄的先验主位置（第一个位置）
 */
function getPriorPrimaryRole(championName: string): Position | null {
  // 标准化英雄名
  const normalized = normalizeChampionName(championName);
  const positions = CHAMPION_POSITIONS[normalized];
  if (!positions || positions.length === 0) {
    return null;
  }
  return positions[0];
}

/**
 * 获取英雄的所有先验位置
 */
function getPriorPositions(championName: string): Position[] {
  const normalized = normalizeChampionName(championName);
  return CHAMPION_POSITIONS[normalized] || [];
}

/**
 * 标准化英雄名（处理空格、特殊字符等）
 */
function normalizeChampionName(name: string): string {
  // 常见的名称映射
  const nameMap: Record<string, string> = {
    "Kai'Sa": 'Kaisa',
    "Kha'Zix": 'Khazix',
    "Rek'Sai": 'RekSai',
    "Bel'Veth": 'Belveth',
    "Vel'Koz": 'Velkoz',
    "Cho'Gath": 'Chogath',
    "Kog'Maw": 'KogMaw',
    'Dr. Mundo': 'DrMundo',
    'Jarvan IV': 'JarvanIV',
    'Lee Sin': 'LeeSin',
    'Master Yi': 'MasterYi',
    'Miss Fortune': 'MissFortune',
    'Tahm Kench': 'TahmKench',
    'Twisted Fate': 'TwistedFate',
    'Xin Zhao': 'XinZhao',
    'Aurelion Sol': 'AurelionSol',
    "K'Sante": 'KSante',
    'Nunu & Willump': 'Nunu',
    'Renata Glasc': 'Renata',
    'Wukong': 'Wukong',
    'MonkeyKing': 'Wukong',
  };

  if (nameMap[name]) {
    return nameMap[name];
  }

  // 移除空格和特殊字符
  return name.replace(/[\s'\.]/g, '');
}

/**
 * 贪心分配：给一队 5 名玩家分配位置
 * 返回分配结果和置信度（冲突次数）
 */
function assignRolesToTeam(
  players: Array<{ playerId: string; championName: string }>
): { assignments: Map<string, Position>; confidence: number; conflicts: number } {
  const assignments = new Map<string, Position>();
  const usedRoles = new Set<Position>();
  let conflicts = 0;

  // 按英雄先验位置的"专一性"排序（位置越少越优先分配）
  const sorted = [...players].sort((a, b) => {
    const posA = getPriorPositions(a.championName);
    const posB = getPriorPositions(b.championName);
    return posA.length - posB.length;
  });

  for (const player of sorted) {
    const priorPositions = getPriorPositions(player.championName);
    let assigned = false;

    // 尝试按优先级分配
    for (const pos of priorPositions) {
      if (!usedRoles.has(pos)) {
        assignments.set(player.playerId, pos);
        usedRoles.add(pos);
        assigned = true;
        break;
      }
    }

    // 如果所有先验位置都被占用，分配剩余位置
    if (!assigned) {
      conflicts++;
      for (const role of ALL_ROLES) {
        if (!usedRoles.has(role)) {
          assignments.set(player.playerId, role);
          usedRoles.add(role);
          break;
        }
      }
    }
  }

  // 置信度：无冲突为 1，每个冲突减少 0.2
  const confidence = Math.max(0, 1 - conflicts * 0.2);

  return { assignments, confidence, conflicts };
}

/**
 * 计算众数
 */
function getMode<T>(arr: T[]): { mode: T | null; share: number } {
  if (arr.length === 0) {
    return { mode: null, share: 0 };
  }

  const counts = new Map<T, number>();
  for (const item of arr) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }

  let maxCount = 0;
  let mode: T | null = null;
  for (const [item, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      mode = item;
    }
  }

  return { mode, share: maxCount / arr.length };
}

/**
 * 日期加减天数
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// ============ MAIN LOGIC ============

async function main() {
  console.log('=== DIAGNOSE ROLE SHIFT VS PLAYER SWAP ===\n');

  const dataDir = path.join(process.cwd(), 'data/grid_v2');
  const outputJsonPath = path.join(dataDir, 'role_shift_diagnosis.json');
  const outputReportPath = path.join(process.cwd(), 'app/docs/migration/step-x-role-shift-vs-player-swap.md');

  // ============ STEP 1: 加载数据并构建玩家时间序列 ============
  console.log('Step 1: Loading data and building player time series...');

  const seriesFiles = fs.readdirSync(dataDir).filter(f => f.startsWith('series_') && f.endsWith('.json'));
  console.log(`  Found ${seriesFiles.length} series files`);

  // 玩家 -> 比赛记录列表
  const playerTimeSeries = new Map<string, PlayerGameRecord[]>();
  // 玩家 ID -> 名称
  const playerNames = new Map<string, string>();
  // 所有英雄-位置记录（用于 Hero Shift 验证）
  const allChampionRoleRecords: Array<{
    date: Date;
    championName: string;
    role: Position;
    playerId: string;
  }> = [];

  let totalMatches = 0;
  let gamesWithMissingDate = 0;
  let gamesWithMissingPlayers = 0;
  let gamesWithRoleAssignmentConflicts = 0;
  let playersWithUnknownChampion = 0;

  for (const file of seriesFiles) {
    const seriesPath = path.join(dataDir, file);
    let series: RawSeries;
    try {
      series = JSON.parse(fs.readFileSync(seriesPath, 'utf-8'));
    } catch (e) {
      console.warn(`  Warning: Failed to parse ${file}`);
      continue;
    }

    const seriesDate = series.startedAt ? new Date(series.startedAt) : null;
    if (!seriesDate) {
      gamesWithMissingDate++;
    }

    if (!series.games) continue;

    for (const game of series.games) {
      if (!game.finished) continue;
      if (!game.teams || game.teams.length !== 2) {
        gamesWithMissingPlayers++;
        continue;
      }

      totalMatches++;
      const matchDate = seriesDate || new Date(0);
      const matchDateStr = matchDate.toISOString().split('T')[0];

      // 处理两队
      for (let teamIdx = 0; teamIdx < 2; teamIdx++) {
        const team = game.teams[teamIdx];
        const opponentTeam = game.teams[1 - teamIdx];

        if (!team.players || team.players.length !== 5) {
          gamesWithMissingPlayers++;
          continue;
        }

        // 收集队伍中所有玩家的英雄
        const teamPlayers: Array<{ playerId: string; championName: string }> = [];
        for (const player of team.players) {
          if (!player.character?.name) {
            playersWithUnknownChampion++;
            continue;
          }
          teamPlayers.push({
            playerId: player.id,
            championName: player.character.name,
          });
          playerNames.set(player.id, player.name);
        }

        if (teamPlayers.length !== 5) {
          continue;
        }

        // 分配位置
        const { assignments, confidence, conflicts } = assignRolesToTeam(teamPlayers);
        if (conflicts > 0) {
          gamesWithRoleAssignmentConflicts++;
        }

        // 记录每个玩家的比赛
        for (const { playerId, championName } of teamPlayers) {
          const estimatedRole = assignments.get(playerId) || null;

          const record: PlayerGameRecord = {
            date: matchDate,
            dateStr: matchDateStr,
            matchId: game.id,
            seriesId: series.id,
            teamId: team.id,
            championName,
            opponentTeamId: opponentTeam.id,
            estimatedRole,
            assignmentConfidence: confidence,
          };

          if (!playerTimeSeries.has(playerId)) {
            playerTimeSeries.set(playerId, []);
          }
          playerTimeSeries.get(playerId)!.push(record);

          // 记录英雄-位置
          if (estimatedRole) {
            allChampionRoleRecords.push({
              date: matchDate,
              championName,
              role: estimatedRole,
              playerId,
            });
          }
        }
      }
    }
  }

  // 按时间排序每个玩家的记录
  for (const [, records] of playerTimeSeries) {
    records.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  console.log(`  Total matches: ${totalMatches}`);
  console.log(`  Total players: ${playerTimeSeries.size}`);
  console.log(`  Total champion-role records: ${allChampionRoleRecords.length}`);

  // ============ STEP 3: 定义异常事件 ============
  console.log('\nStep 3: Identifying anomaly events...');

  const anomalyEvents: AnomalyEvent[] = [];

  for (const [playerId, records] of playerTimeSeries) {
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const priorPrimaryRole = getPriorPrimaryRole(record.championName);

      if (!priorPrimaryRole || !record.estimatedRole) {
        continue;
      }

      // 检查是否与先验主位置不一致
      if (record.estimatedRole !== priorPrimaryRole) {
        // 检查是否在先验位置列表中
        const priorPositions = getPriorPositions(record.championName);
        const isInPriorList = priorPositions.includes(record.estimatedRole);

        // 即使在先验列表中但不是主位置，也记录为异常（但后续分类会更宽松）
        anomalyEvents.push({
          playerId,
          playerName: playerNames.get(playerId) || 'Unknown',
          championName: record.championName,
          date: record.date,
          dateStr: record.dateStr,
          estimatedRole: record.estimatedRole,
          priorPrimaryRole,
          teamId: record.teamId,
          matchId: record.matchId,
          seriesId: record.seriesId,
          assignmentConfidence: record.assignmentConfidence,
          prevRoleMode: null,
          nextRoleMode: null,
          roleStabilityPrev: 0,
          roleStabilityNext: 0,
          classification: 'ambiguous',
          classificationReason: '',
        });
      }
    }
  }

  console.log(`  Found ${anomalyEvents.length} anomaly events`);

  // ============ STEP 4: 时间邻域判别 ============
  console.log('\nStep 4: Time-window classification...');

  for (const event of anomalyEvents) {
    const records = playerTimeSeries.get(event.playerId);
    if (!records) continue;

    // 找到当前事件在序列中的位置
    const eventIndex = records.findIndex(r => r.matchId === event.matchId);
    if (eventIndex === -1) continue;

    // 取前后窗口
    const prevRecords = records.slice(Math.max(0, eventIndex - WINDOW_SIZE), eventIndex);
    const nextRecords = records.slice(eventIndex + 1, eventIndex + 1 + WINDOW_SIZE);

    // 计算前后窗口的 role 分布
    const prevRoles = prevRecords
      .map(r => r.estimatedRole)
      .filter((r): r is Position => r !== null);
    const nextRoles = nextRecords
      .map(r => r.estimatedRole)
      .filter((r): r is Position => r !== null);

    const { mode: prevMode, share: prevShare } = getMode(prevRoles);
    const { mode: nextMode, share: nextShare } = getMode(nextRoles);

    event.prevRoleMode = prevMode;
    event.nextRoleMode = nextMode;
    event.roleStabilityPrev = prevShare;
    event.roleStabilityNext = nextShare;

    // 判别规则
    if (
      prevMode === nextMode &&
      prevShare >= ROLE_STABILITY_THRESHOLD &&
      nextShare >= ROLE_STABILITY_THRESHOLD
    ) {
      event.classification = 'hero_role_shift';
      event.classificationReason = `Player stable at ${prevMode} (prev: ${(prevShare * 100).toFixed(0)}%, next: ${(nextShare * 100).toFixed(0)}%), but champion played at ${event.estimatedRole}`;
    } else if (
      prevMode !== nextMode &&
      prevMode !== null &&
      nextMode !== null &&
      prevShare >= ROLE_STABILITY_THRESHOLD &&
      nextShare >= ROLE_STABILITY_THRESHOLD
    ) {
      event.classification = 'player_role_swap';
      event.classificationReason = `Player shifted from ${prevMode} (${(prevShare * 100).toFixed(0)}%) to ${nextMode} (${(nextShare * 100).toFixed(0)}%)`;
    } else {
      event.classification = 'ambiguous';
      const reasons: string[] = [];
      if (prevRoles.length < 3) reasons.push(`insufficient prev samples (${prevRoles.length})`);
      if (nextRoles.length < 3) reasons.push(`insufficient next samples (${nextRoles.length})`);
      if (prevShare < ROLE_STABILITY_THRESHOLD) reasons.push(`low prev stability (${(prevShare * 100).toFixed(0)}%)`);
      if (nextShare < ROLE_STABILITY_THRESHOLD) reasons.push(`low next stability (${(nextShare * 100).toFixed(0)}%)`);
      event.classificationReason = reasons.join('; ') || 'unknown';
    }
  }

  // ============ STEP 5: 英雄层面共识验证 ============
  console.log('\nStep 5: Hero-level consensus validation...');

  const heroShiftEvents = anomalyEvents.filter(e => e.classification === 'hero_role_shift');
  const heroWindowStatsMap = new Map<string, HeroWindowStats>();

  for (const event of heroShiftEvents) {
    const windowStart = addDays(event.date, -HERO_SHIFT_DATE_WINDOW_DAYS);
    const windowEnd = addDays(event.date, HERO_SHIFT_DATE_WINDOW_DAYS);

    // 收集该窗口内该英雄的所有位置记录
    const championRecords = allChampionRoleRecords.filter(
      r =>
        normalizeChampionName(r.championName) === normalizeChampionName(event.championName) &&
        r.date >= windowStart &&
        r.date <= windowEnd
    );

    // 计算位置分布
    const roleDistribution: Record<Position, number> = {
      top: 0,
      jungle: 0,
      mid: 0,
      bot: 0,
      support: 0,
    };
    for (const r of championRecords) {
      roleDistribution[r.role]++;
    }

    const totalGames = championRecords.length;
    let dominantRole: Position = 'mid';
    let maxCount = 0;
    for (const role of ALL_ROLES) {
      if (roleDistribution[role] > maxCount) {
        maxCount = roleDistribution[role];
        dominantRole = role;
      }
    }
    const dominantRoleShare = totalGames > 0 ? maxCount / totalGames : 0;

    const priorPrimaryRole = event.priorPrimaryRole;

    // 判断是否确认 Hero Shift
    const shifted = dominantRole !== priorPrimaryRole && dominantRoleShare >= HERO_SHIFT_CONSENSUS_THRESHOLD;

    event.heroShiftConfirmed = shifted;
    event.heroShiftWeakEvidence = !shifted;
    event.heroWindowStats = {
      windowStart: windowStart.toISOString().split('T')[0],
      windowEnd: windowEnd.toISOString().split('T')[0],
      totalGames,
      roleDistribution,
      dominantRole,
      dominantRoleShare,
    };

    // 存储英雄窗口统计（去重）
    const key = `${normalizeChampionName(event.championName)}_${event.heroWindowStats.windowStart}_${event.heroWindowStats.windowEnd}`;
    if (!heroWindowStatsMap.has(key)) {
      heroWindowStatsMap.set(key, {
        championName: event.championName,
        windowStart: event.heroWindowStats.windowStart,
        windowEnd: event.heroWindowStats.windowEnd,
        totalGames,
        roleDistribution,
        dominantRole,
        dominantRoleShare,
        priorPrimaryRole,
        shifted,
      });
    }
  }

  // ============ STEP 6: 统计和输出 ============
  console.log('\nStep 6: Generating output...');

  const classificationCounts = {
    hero_role_shift: anomalyEvents.filter(e => e.classification === 'hero_role_shift').length,
    player_role_swap: anomalyEvents.filter(e => e.classification === 'player_role_swap').length,
    ambiguous: anomalyEvents.filter(e => e.classification === 'ambiguous').length,
  };

  const heroShiftConfirmedCount = anomalyEvents.filter(
    e => e.classification === 'hero_role_shift' && e.heroShiftConfirmed
  ).length;
  const heroShiftWeakEvidenceCount = anomalyEvents.filter(
    e => e.classification === 'hero_role_shift' && e.heroShiftWeakEvidence
  ).length;

  const output: DiagnosisOutput = {
    meta: {
      generatedAt: new Date().toISOString(),
      totalMatches,
      totalPlayers: playerTimeSeries.size,
      totalAnomalyEvents: anomalyEvents.length,
      classificationCounts,
      heroShiftConfirmedCount,
      heroShiftWeakEvidenceCount,
      parameters: {
        windowSize: WINDOW_SIZE,
        roleStabilityThreshold: ROLE_STABILITY_THRESHOLD,
        heroShiftConsensusThreshold: HERO_SHIFT_CONSENSUS_THRESHOLD,
        heroShiftDateWindowDays: HERO_SHIFT_DATE_WINDOW_DAYS,
      },
      dataQuality: {
        gamesWithMissingDate,
        gamesWithMissingPlayers,
        gamesWithRoleAssignmentConflicts,
        playersWithUnknownChampion,
      },
    },
    events: anomalyEvents.map(e => ({
      ...e,
      date: e.date as unknown as Date, // JSON 序列化会自动转换
    })),
    hero_window_stats: Array.from(heroWindowStatsMap.values()),
  };

  // 写入 JSON
  fs.writeFileSync(outputJsonPath, JSON.stringify(output, null, 2));
  console.log(`  Written: ${outputJsonPath}`);

  // ============ 生成报告 ============
  const report = generateReport(output, anomalyEvents, playerNames, playerTimeSeries);
  fs.writeFileSync(outputReportPath, report);
  console.log(`  Written: ${outputReportPath}`);

  // 打印摘要
  console.log('\n=== SUMMARY ===');
  console.log(`Total matches: ${totalMatches}`);
  console.log(`Total players: ${playerTimeSeries.size}`);
  console.log(`Anomaly events: ${anomalyEvents.length}`);
  console.log(`  - Hero Role Shift: ${classificationCounts.hero_role_shift} (confirmed: ${heroShiftConfirmedCount}, weak: ${heroShiftWeakEvidenceCount})`);
  console.log(`  - Player Role Swap: ${classificationCounts.player_role_swap}`);
  console.log(`  - Ambiguous: ${classificationCounts.ambiguous}`);
}

function generateReport(
  output: DiagnosisOutput,
  events: AnomalyEvent[],
  playerNames: Map<string, string>,
  playerTimeSeries: Map<string, PlayerGameRecord[]>
): string {
  const { meta } = output;

  // 找 Top 英雄（Hero Shift）
  const heroShiftChampions = new Map<string, number>();
  for (const e of events.filter(e => e.classification === 'hero_role_shift')) {
    heroShiftChampions.set(e.championName, (heroShiftChampions.get(e.championName) || 0) + 1);
  }
  const topHeroShiftChampions = Array.from(heroShiftChampions.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // 找 Top 选手（Player Swap）
  const playerSwapPlayers = new Map<string, number>();
  for (const e of events.filter(e => e.classification === 'player_role_swap')) {
    playerSwapPlayers.set(e.playerId, (playerSwapPlayers.get(e.playerId) || 0) + 1);
  }
  const topPlayerSwapPlayers = Array.from(playerSwapPlayers.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // 找案例
  const skarnerCase = events.find(
    e => normalizeChampionName(e.championName) === 'Skarner' && e.classification === 'hero_role_shift'
  );
  const malrangCase = events.find(
    e => e.playerName.toLowerCase().includes('malrang') && e.classification === 'player_role_swap'
  );
  const neekoCase = events.find(
    e => normalizeChampionName(e.championName) === 'Neeko' && e.classification !== 'ambiguous'
  );

  let report = `# Step X - Role Shift vs Player Swap 诊断报告

**生成时间**: ${new Date().toISOString()}
**数据源**: \`data/grid_v2/series_*.json\`
**脚本**: \`app/scripts/diagnose-role-shift-vs-player-swap.ts\`

---

## 1. 背景与目的

在 grid_v2 数据中，我们发现"某选手用某英雄被推断成错误位置"的现象。这可能来自两种原因：

**A. Hero Role Shift（英雄换路）**
- 同一名选手在异常局前后，整体仍在同一位置
- 但该英雄在该时期被职业比赛普遍用于不同位置
- 例如：Skarner 在某段时间大量走上单，而非打野

**B. Player Role Swap（选手换位置）**
- 该选手从某时点开始，其大多数出场都落在另一条路
- 例如：Malrang 后面长期打辅助

**本诊断的目的是区分这两类变化，为数据修复决策提供依据。**

---

## 2. 方法论

### 2.1 局内位置估计

由于数据中没有显式的位置字段，我们使用以下方法估计每局每名玩家的位置：

1. **英雄-位置先验表**：使用 \`app/lib/positions.ts\` 中的 \`CHAMPION_POSITIONS\`
2. **贪心分配算法**：
   - 按英雄先验位置的"专一性"排序（位置越少越优先分配）
   - 依次为每名玩家分配其先验位置列表中第一个未被占用的位置
   - 如果所有先验位置都被占用，分配剩余位置（记录冲突）
3. **置信度**：无冲突为 1，每个冲突减少 0.2

### 2.2 异常事件定义

当玩家在某局的 \`estimatedRole\` 与该英雄的先验主位置（第一个位置）不一致时，记为一个异常事件。

### 2.3 时间邻域判别

| 参数 | 值 |
|------|------|
| windowSize | ${WINDOW_SIZE} 场（前后各取） |
| roleStabilityThreshold | ${(ROLE_STABILITY_THRESHOLD * 100).toFixed(0)}% |

**判别规则**：

| 条件 | 分类 |
|------|------|
| prevRoleMode == nextRoleMode 且稳定性 >= ${(ROLE_STABILITY_THRESHOLD * 100).toFixed(0)}% | Hero Role Shift |
| prevRoleMode != nextRoleMode 且稳定性 >= ${(ROLE_STABILITY_THRESHOLD * 100).toFixed(0)}% | Player Role Swap |
| 其他 | Ambiguous |

### 2.4 英雄层面共识验证

对判为 Hero Role Shift 的事件，在该事件日期前后 ±${HERO_SHIFT_DATE_WINDOW_DAYS} 天内收集所有比赛中该英雄的位置分布：

- 若主导位置与先验主位置不同，且占比 >= ${(HERO_SHIFT_CONSENSUS_THRESHOLD * 100).toFixed(0)}% → **heroShiftConfirmed = true**
- 否则 → **heroShiftWeakEvidence = true**

### 2.5 局限性

1. 位置估计依赖英雄先验，可能引入循环偏差
2. 部分比赛缺少时间字段，使用 series 级别时间
3. 贪心分配在有冲突时可能不是最优解
4. 窗口大小和阈值是经验值，可能需要根据数据调整

---

## 3. 数据质量

| 指标 | 数值 |
|------|------|
| 总比赛数 | ${meta.totalMatches.toLocaleString()} |
| 总选手数 | ${meta.totalPlayers.toLocaleString()} |
| 缺少日期的比赛 | ${meta.dataQuality.gamesWithMissingDate} |
| 缺少玩家的比赛 | ${meta.dataQuality.gamesWithMissingPlayers} |
| 位置分配有冲突的比赛 | ${meta.dataQuality.gamesWithRoleAssignmentConflicts} |
| 未知英雄的玩家 | ${meta.dataQuality.playersWithUnknownChampion} |

---

## 4. 结果摘要

### 4.1 异常事件分类

| 分类 | 数量 | 占比 |
|------|------|------|
| **Hero Role Shift** | ${meta.classificationCounts.hero_role_shift} | ${((meta.classificationCounts.hero_role_shift / meta.totalAnomalyEvents) * 100).toFixed(1)}% |
| **Player Role Swap** | ${meta.classificationCounts.player_role_swap} | ${((meta.classificationCounts.player_role_swap / meta.totalAnomalyEvents) * 100).toFixed(1)}% |
| **Ambiguous** | ${meta.classificationCounts.ambiguous} | ${((meta.classificationCounts.ambiguous / meta.totalAnomalyEvents) * 100).toFixed(1)}% |
| **总计** | ${meta.totalAnomalyEvents} | 100% |

### 4.2 Hero Role Shift 验证

| 状态 | 数量 |
|------|------|
| Confirmed（共识验证通过） | ${meta.heroShiftConfirmedCount} |
| Weak Evidence（共识验证未通过） | ${meta.heroShiftWeakEvidenceCount} |

### 4.3 Top 10 Hero Role Shift 英雄

| 英雄 | 异常事件数 |
|------|------|
${topHeroShiftChampions.map(([name, count]) => `| ${name} | ${count} |`).join('\n')}

### 4.4 Top 10 Player Role Swap 选手

| 选手 | 异常事件数 |
|------|------|
${topPlayerSwapPlayers.map(([id, count]) => `| ${playerNames.get(id) || id} | ${count} |`).join('\n')}

---

## 5. 案例分析

`;

  // Skarner 案例
  if (skarnerCase) {
    report += `### 5.1 Skarner - Hero Role Shift 案例

**事件详情**：
- 选手: ${skarnerCase.playerName}
- 日期: ${skarnerCase.dateStr}
- 估计位置: ${skarnerCase.estimatedRole}
- 先验主位置: ${skarnerCase.priorPrimaryRole}
- 分类: ${skarnerCase.classification}
- 原因: ${skarnerCase.classificationReason}

**时间邻域**：
- 前窗口众数: ${skarnerCase.prevRoleMode} (稳定性: ${(skarnerCase.roleStabilityPrev * 100).toFixed(0)}%)
- 后窗口众数: ${skarnerCase.nextRoleMode} (稳定性: ${(skarnerCase.roleStabilityNext * 100).toFixed(0)}%)

`;
    if (skarnerCase.heroWindowStats) {
      report += `**英雄窗口统计**：
- 窗口: ${skarnerCase.heroWindowStats.windowStart} ~ ${skarnerCase.heroWindowStats.windowEnd}
- 总场次: ${skarnerCase.heroWindowStats.totalGames}
- 位置分布: ${JSON.stringify(skarnerCase.heroWindowStats.roleDistribution)}
- 主导位置: ${skarnerCase.heroWindowStats.dominantRole} (${(skarnerCase.heroWindowStats.dominantRoleShare * 100).toFixed(1)}%)
- 共识验证: ${skarnerCase.heroShiftConfirmed ? '✅ 通过' : '⚠️ 弱证据'}

`;
    }
  } else {
    report += `### 5.1 Skarner 案例

未在数据中找到 Skarner 的 Hero Role Shift 事件。

`;
  }

  // Malrang/Neeko 案例
  if (malrangCase) {
    report += `### 5.2 Malrang - Player Role Swap 案例

**事件详情**：
- 选手: ${malrangCase.playerName}
- 英雄: ${malrangCase.championName}
- 日期: ${malrangCase.dateStr}
- 估计位置: ${malrangCase.estimatedRole}
- 先验主位置: ${malrangCase.priorPrimaryRole}
- 分类: ${malrangCase.classification}
- 原因: ${malrangCase.classificationReason}

**时间邻域**：
- 前窗口众数: ${malrangCase.prevRoleMode} (稳定性: ${(malrangCase.roleStabilityPrev * 100).toFixed(0)}%)
- 后窗口众数: ${malrangCase.nextRoleMode} (稳定性: ${(malrangCase.roleStabilityNext * 100).toFixed(0)}%)

`;
  } else if (neekoCase) {
    report += `### 5.2 Neeko 案例

**事件详情**：
- 选手: ${neekoCase.playerName}
- 日期: ${neekoCase.dateStr}
- 估计位置: ${neekoCase.estimatedRole}
- 先验主位置: ${neekoCase.priorPrimaryRole}
- 分类: ${neekoCase.classification}
- 原因: ${neekoCase.classificationReason}

**时间邻域**：
- 前窗口众数: ${neekoCase.prevRoleMode} (稳定性: ${(neekoCase.roleStabilityPrev * 100).toFixed(0)}%)
- 后窗口众数: ${neekoCase.nextRoleMode} (稳定性: ${(neekoCase.roleStabilityNext * 100).toFixed(0)}%)

`;
  } else {
    report += `### 5.2 Malrang/Neeko 案例

未在数据中找到 Malrang 的 Player Role Swap 事件或 Neeko 的相关事件。

`;
  }

  report += `---

## 6. 声明

**本报告是诊断与数据修复决策辅助工具，不做胜率预测。**

结果用于：
1. 识别需要更新英雄-位置映射的情况（Hero Role Shift）
2. 识别选手位置变更的情况（Player Role Swap）
3. 为后续数据清洗和模型训练提供依据

---

## 7. 输出文件

| 文件 | 路径 |
|------|------|
| 诊断 JSON | \`data/grid_v2/role_shift_diagnosis.json\` |
| 本报告 | \`app/docs/migration/step-x-role-shift-vs-player-swap.md\` |

---

## 8. 运行命令

\`\`\`bash
npx tsx app/scripts/diagnose-role-shift-vs-player-swap.ts
\`\`\`
`;

  return report;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
