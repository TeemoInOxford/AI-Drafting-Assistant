/**
 * Build Champion Roles Canon
 *
 * 基于 role_shift_diagnosis.json 生成英雄位置清单
 *
 * 核心逻辑：
 * - 遍历 diagnosis events 全量，使用已计算好的 estimatedRole
 * - 可信样本条件: estimatedRole != null && assignmentConfidence >= 0.8 && classification != "player_role_swap"
 * - player_role_swap 事件只记录，不计入统计（去重后输出排除计数）
 * - 不重新扫描 series 文件，不推断 patch，不使用 byPatch
 *
 * 输出：
 * 1) champion_roles_canon.json - 全英雄位置清单（覆盖所有出现过的英雄）
 * 2) champion_roles_delta_from_prior.json - 仅有 shift 的英雄（与 CHAMPION_POSITIONS 的 diff）
 * 3) player_role_swap_cases.json - 选手换位事件
 * 4) champion_roles_report.md - 报告
 */

import * as fs from 'fs';
import * as path from 'path';
import { CHAMPION_POSITIONS } from '../lib/positions';
import { Position } from '../lib/types';

// ============ CONSTANTS ============

/** 英雄 role 收录阈值 */
const ROLE_SHARE_THRESHOLD = 0.15;

/** 可信样本的置信度阈值 */
const CONFIDENCE_THRESHOLD = 0.8;

/** 所有位置 */
const ALL_ROLES: Position[] = ['top', 'jungle', 'mid', 'bot', 'support'];

// ============ TYPES ============

interface DiagnosisEvent {
  playerId: string;
  playerName: string;
  championName: string;
  date: string;
  dateStr: string;
  estimatedRole: Position | null;
  priorPrimaryRole: Position;
  teamId: string;
  matchId: string;
  seriesId: string;
  assignmentConfidence: number;
  prevRoleMode: Position | null;
  nextRoleMode: Position | null;
  roleStabilityPrev: number;
  roleStabilityNext: number;
  classification: 'hero_role_shift' | 'player_role_swap' | 'ambiguous';
  classificationReason: string;
  heroShiftConfirmed?: boolean;
  heroShiftWeakEvidence?: boolean;
}

interface DiagnosisData {
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
    parameters: Record<string, number>;
    dataQuality: Record<string, number>;
  };
  events: DiagnosisEvent[];
}

interface PlayerRoleSwapCase {
  playerId: string;
  playerName: string;
  teamId: string;
  date: string;
  inferredRoleBefore: Position | null;
  inferredRoleAfter: Position | null;
  evidenceSummary: string;
  matchId: string;
  seriesId: string;
  championName: string;
}

interface ChampionRoleStats {
  roles: Position[];
  shares: Record<Position, number>;
  total: number;
}

interface CanonMeta {
  generatedAt: string;
  totalSamplesUsed: number;
  uniqueMatchesUsed: number;
  uniqueChampions: number;
  rules: {
    roleShareThreshold: number;
    confidenceThreshold: number;
    excludedSwapMatches: number;
    excludedSwapSamples: number;
  };
  source: string;
}

interface ChampionRolesCanon {
  meta: CanonMeta;
  champions: Record<string, ChampionRoleStats>;
}

interface DeltaEntry {
  oldRoles: Position[];
  newRoles: Position[];
  addedRoles: Position[];
  removedRoles: Position[];
  shares: Record<Position, number>;
  total: number;
}

interface DeltaOutput {
  meta: { generatedAt: string; championsChanged: number };
  champions: Record<string, DeltaEntry>;
}

// ============ HELPER FUNCTIONS ============

function normalizeChampionName(name: string): string {
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
    'MonkeyKing': 'Wukong',
  };

  if (nameMap[name]) {
    return nameMap[name];
  }
  return name.replace(/[\s'\.]/g, '');
}

function computeRoleStats(counts: Map<Position, number>): ChampionRoleStats {
  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);

  const shares: Record<Position, number> = {
    top: 0, jungle: 0, mid: 0, bot: 0, support: 0,
  };
  for (const role of ALL_ROLES) {
    shares[role] = total > 0 ? (counts.get(role) || 0) / total : 0;
  }

  const roles: Position[] = [];
  for (const role of ALL_ROLES) {
    if (shares[role] >= ROLE_SHARE_THRESHOLD) {
      roles.push(role);
    }
  }

  // 如果没有任何 role >= 阈值，取最大的那个
  if (roles.length === 0 && total > 0) {
    let maxRole: Position = 'mid';
    let maxShare = 0;
    for (const role of ALL_ROLES) {
      if (shares[role] > maxShare) {
        maxShare = shares[role];
        maxRole = role;
      }
    }
    roles.push(maxRole);
  }

  return { roles, shares, total };
}

// ============ MAIN ============

async function main() {
  console.log('=== BUILD CHAMPION ROLES CANON ===\n');

  const dataDir = path.join(process.cwd(), 'data/grid_v2');
  const diagnosisPath = path.join(dataDir, 'role_shift_diagnosis.json');
  const outputCanonPath = path.join(dataDir, 'champion_roles_canon.json');
  const outputDeltaPath = path.join(dataDir, 'champion_roles_delta_from_prior.json');
  const outputSwapPath = path.join(dataDir, 'player_role_swap_cases.json');
  const outputReportPath = path.join(dataDir, 'champion_roles_report.md');

  // ============ 1. 加载诊断数据 ============
  console.log('Step 1: Loading diagnosis data...');

  if (!fs.existsSync(diagnosisPath)) {
    console.error('Error: role_shift_diagnosis.json not found. Run diagnose-role-shift-vs-player-swap.ts first.');
    process.exit(1);
  }

  const diagnosisData: DiagnosisData = JSON.parse(fs.readFileSync(diagnosisPath, 'utf-8'));
  console.log(`  Loaded ${diagnosisData.events.length} diagnosis events`);

  // ============ 2. 分离 player_role_swap 事件（去重） ============
  console.log('\nStep 2: Separating player_role_swap events (deduplicated)...');

  const swapSampleKeys = new Set<string>();  // 唯一 (matchId, playerId)
  const swapMatchIds = new Set<string>();     // 唯一 matchId
  const playerSwapCases: PlayerRoleSwapCase[] = [];

  for (const event of diagnosisData.events) {
    if (event.classification !== 'player_role_swap') continue;

    const sampleKey = `${event.matchId}_${event.playerId}`;
    if (swapSampleKeys.has(sampleKey)) continue;
    swapSampleKeys.add(sampleKey);
    swapMatchIds.add(event.matchId);

    playerSwapCases.push({
      playerId: event.playerId,
      playerName: event.playerName,
      teamId: event.teamId,
      date: event.dateStr,
      inferredRoleBefore: event.prevRoleMode,
      inferredRoleAfter: event.nextRoleMode,
      evidenceSummary: event.classificationReason,
      matchId: event.matchId,
      seriesId: event.seriesId,
      championName: event.championName,
    });
  }

  console.log(`  Unique swap samples (matchId,playerId): ${swapSampleKeys.size}`);
  console.log(`  Unique swap matches: ${swapMatchIds.size}`);

  // ============ 3. 统计英雄位置分布（全英雄） ============
  console.log('\nStep 3: Counting champion role distribution (all champions, excl. player_role_swap)...');

  // 英雄 -> 位置 -> 计数
  const championRoleCounts = new Map<string, Map<Position, number>>();
  // 用于去重
  const seenCanonSamples = new Set<string>();
  const uniqueCanonMatches = new Set<string>();

  let acceptedSamples = 0;
  let rejectedNoRole = 0;
  let rejectedLowConf = 0;
  let rejectedSwap = 0;

  for (const event of diagnosisData.events) {
    // 条件 A：estimatedRole 必须非空
    if (!event.estimatedRole) {
      rejectedNoRole++;
      continue;
    }

    // 条件 B：assignmentConfidence >= 阈值
    if (event.assignmentConfidence < CONFIDENCE_THRESHOLD) {
      rejectedLowConf++;
      continue;
    }

    // 条件 C：排除 player_role_swap
    if (event.classification === 'player_role_swap') {
      rejectedSwap++;
      continue;
    }

    // 去重（同一场比赛同一选手只计一次）
    const sampleKey = `${event.matchId}_${event.playerId}`;
    if (seenCanonSamples.has(sampleKey)) continue;
    seenCanonSamples.add(sampleKey);
    uniqueCanonMatches.add(event.matchId);

    const normalizedName = normalizeChampionName(event.championName);
    const role = event.estimatedRole;

    if (!championRoleCounts.has(normalizedName)) {
      championRoleCounts.set(normalizedName, new Map());
    }
    const counts = championRoleCounts.get(normalizedName)!;
    counts.set(role, (counts.get(role) || 0) + 1);

    acceptedSamples++;
  }

  console.log(`  Accepted samples: ${acceptedSamples}`);
  console.log(`  Rejected (no role): ${rejectedNoRole}`);
  console.log(`  Rejected (low confidence): ${rejectedLowConf}`);
  console.log(`  Rejected (player_role_swap): ${rejectedSwap}`);
  console.log(`  Unique champions: ${championRoleCounts.size}`);
  console.log(`  Unique matches: ${uniqueCanonMatches.size}`);

  // ============ 4. 生成 champion_roles_canon.json（全英雄） ============
  console.log('\nStep 4: Generating champion_roles_canon.json...');

  const champions: Record<string, ChampionRoleStats> = {};

  for (const [championName, counts] of championRoleCounts) {
    champions[championName] = computeRoleStats(counts);
  }

  const canon: ChampionRolesCanon = {
    meta: {
      generatedAt: new Date().toISOString(),
      totalSamplesUsed: acceptedSamples,
      uniqueMatchesUsed: uniqueCanonMatches.size,
      uniqueChampions: championRoleCounts.size,
      rules: {
        roleShareThreshold: ROLE_SHARE_THRESHOLD,
        confidenceThreshold: CONFIDENCE_THRESHOLD,
        excludedSwapMatches: swapMatchIds.size,
        excludedSwapSamples: swapSampleKeys.size,
      },
      source: 'role_shift_diagnosis.json (all events where estimatedRole!=null && confidence>=0.8 && !player_role_swap)',
    },
    champions,
  };

  fs.writeFileSync(outputCanonPath, JSON.stringify(canon, null, 2));
  console.log(`  Written: ${outputCanonPath}`);

  // ============ 5. 生成 champion_roles_delta_from_prior.json ============
  console.log('\nStep 5: Generating champion_roles_delta_from_prior.json...');

  const deltaChampions: Record<string, DeltaEntry> = {};

  for (const [championName, stats] of Object.entries(champions)) {
    const oldRoles = CHAMPION_POSITIONS[championName] || [];
    const newRoles = stats.roles;

    const addedRoles = newRoles.filter(r => !oldRoles.includes(r));
    const removedRoles = oldRoles.filter(r => !newRoles.includes(r));

    // 只保留有差异的英雄
    if (addedRoles.length > 0 || removedRoles.length > 0) {
      deltaChampions[championName] = {
        oldRoles,
        newRoles,
        addedRoles,
        removedRoles,
        shares: stats.shares,
        total: stats.total,
      };
    }
  }

  const deltaOutput: DeltaOutput = {
    meta: {
      generatedAt: new Date().toISOString(),
      championsChanged: Object.keys(deltaChampions).length,
    },
    champions: deltaChampions,
  };

  fs.writeFileSync(outputDeltaPath, JSON.stringify(deltaOutput, null, 2));
  console.log(`  Written: ${outputDeltaPath}`);
  console.log(`  Champions with delta: ${Object.keys(deltaChampions).length}`);

  // ============ 6. 生成 player_role_swap_cases.json ============
  console.log('\nStep 6: Generating player_role_swap_cases.json...');

  fs.writeFileSync(outputSwapPath, JSON.stringify(playerSwapCases, null, 2));
  console.log(`  Written: ${outputSwapPath}`);
  console.log(`  Deduplicated swap cases: ${playerSwapCases.length}`);

  // ============ 7. 生成报告 ============
  console.log('\nStep 7: Generating champion_roles_report.md...');

  const report = generateReport(canon, deltaChampions, playerSwapCases, diagnosisData);
  fs.writeFileSync(outputReportPath, report);
  console.log(`  Written: ${outputReportPath}`);

  // 打印摘要
  console.log('\n=== SUMMARY ===');
  console.log(`Total champions in canon: ${Object.keys(champions).length}`);
  console.log(`Champions with delta from prior: ${Object.keys(deltaChampions).length}`);
  console.log(`Samples used: ${acceptedSamples}`);
  console.log(`Excluded swap matches: ${swapMatchIds.size}, samples: ${swapSampleKeys.size}`);
}

function generateReport(
  canon: ChampionRolesCanon,
  deltaChampions: Record<string, DeltaEntry>,
  swapCases: PlayerRoleSwapCase[],
  diagnosisData: DiagnosisData
): string {
  const { champions, meta } = canon;

  // 排序 delta 英雄（按 addedRoles 数量 + share 变化）
  interface DiffRow {
    champion: string;
    entry: DeltaEntry;
    changeScore: number;
  }

  const diffRows: DiffRow[] = Object.entries(deltaChampions).map(([champ, entry]) => ({
    champion: champ,
    entry,
    changeScore: entry.addedRoles.length * 2 + entry.removedRoles.length + (entry.total > 100 ? 1 : 0),
  }));
  diffRows.sort((a, b) => {
    if (b.changeScore !== a.changeScore) return b.changeScore - a.changeScore;
    return b.entry.total - a.entry.total;
  });

  let rolesAdded = 0;
  let rolesRemoved = 0;
  for (const { entry } of diffRows) {
    rolesAdded += entry.addedRoles.length;
    rolesRemoved += entry.removedRoles.length;
  }

  // ---- 报告正文 ----
  let report = `# Champion Roles Canon Report

**生成时间**: ${new Date().toISOString()}
**数据源**: \`role_shift_diagnosis.json\`

---

## 1. 总结

| 指标 | 数值 |
|------|------|
| 来源诊断事件总数 | ${diagnosisData.events.length.toLocaleString()} |
| 可信样本数（用于 canon 统计） | ${meta.totalSamplesUsed.toLocaleString()} |
| 涉及的比赛数 | ${meta.uniqueMatchesUsed.toLocaleString()} |
| canon 中英雄总数 | ${meta.uniqueChampions} |
| **有位置变化的英雄** | ${Object.keys(deltaChampions).length} |
| **新增 roles 总数** | ${rolesAdded} |
| **删除 roles 总数** | ${rolesRemoved} |
| 排除的 swap matches | ${meta.rules.excludedSwapMatches} |
| 排除的 swap samples | ${meta.rules.excludedSwapSamples} |

---

## 2. 为什么排除 Player Swap 样本

### 问题

当选手从一个位置换到另一个位置（例如从打野转为辅助），该选手使用某英雄打的比赛会被错误地计入该英雄的"非主位置"统计，从而**污染英雄位置清单**。

### 排除机制

通过 \`role_shift_diagnosis.json\` 识别出 \`player_role_swap\` 事件后：

- **Player swap 样本被完全排除，不污染英雄位置清单**
- 去重后共排除 **${meta.rules.excludedSwapSamples}** 个唯一样本（来自 **${meta.rules.excludedSwapMatches}** 场唯一比赛）
- 排除条件：\`classification == "player_role_swap"\`，按 \`(matchId, playerId)\` 去重

### 收录规则

| 规则 | 值 |
|------|------|
| 可信样本条件 | estimatedRole != null AND assignmentConfidence >= ${(CONFIDENCE_THRESHOLD * 100).toFixed(0)}% AND classification != "player_role_swap" |
| Role share 阈值 | ${(ROLE_SHARE_THRESHOLD * 100).toFixed(0)}% |
| Shares 归一化 | 求和 = 1 |

---

## 3. 旧静态 Prior vs 新 Canon 差异（Top 50）

| # | 英雄 | 旧 Roles | 新 Roles | 新增 | 删除 | Shares | 样本数 |
|---|------|----------|----------|------|------|--------|--------|
`;

  for (let i = 0; i < Math.min(50, diffRows.length); i++) {
    const { champion, entry } = diffRows[i];
    const oldStr = entry.oldRoles.length > 0 ? entry.oldRoles.join(', ') : '-';
    const newStr = entry.newRoles.join(', ');
    const addStr = entry.addedRoles.length > 0 ? `+${entry.addedRoles.join(', ')}` : '-';
    const rmStr = entry.removedRoles.length > 0 ? `-${entry.removedRoles.join(', ')}` : '-';
    const sharesStr = entry.newRoles.map(r => `${r}:${((entry.shares[r] || 0) * 100).toFixed(1)}%`).join(', ');

    report += `| ${i + 1} | ${champion} | ${oldStr} | ${newStr} | ${addStr} | ${rmStr} | ${sharesStr} | ${entry.total} |\n`;
  }

  report += `
---

## 4. Top 50 变化最大的英雄（详细）

`;

  for (let i = 0; i < Math.min(50, diffRows.length); i++) {
    const { champion, entry } = diffRows[i];
    const sharesStr = entry.newRoles.map(r => `${r}:${((entry.shares[r] || 0) * 100).toFixed(1)}%`).join(', ');

    report += `### ${i + 1}. ${champion}\n\n`;
    report += `- **旧 Prior**: [${entry.oldRoles.join(', ') || 'none'}]\n`;
    report += `- **新 Canon**: [${entry.newRoles.join(', ')}]\n`;
    if (entry.addedRoles.length > 0) {
      report += `- **新增位置**: ${entry.addedRoles.join(', ')}\n`;
    }
    if (entry.removedRoles.length > 0) {
      report += `- **删除位置**: ${entry.removedRoles.join(', ')}\n`;
    }
    report += `- **Shares**: ${sharesStr}\n`;
    report += `- **样本数**: ${entry.total}\n\n`;
  }

  report += `---

## 5. Player Role Swap 事件摘要

共 **${swapCases.length}** 个去重事件被排除（${meta.rules.excludedSwapSamples} 唯一样本，${meta.rules.excludedSwapMatches} 唯一比赛）。

### Top 20 涉及的选手

`;

  const playerSwapCounts = new Map<string, number>();
  for (const c of swapCases) {
    playerSwapCounts.set(c.playerName, (playerSwapCounts.get(c.playerName) || 0) + 1);
  }
  const topSwapPlayers = Array.from(playerSwapCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  report += `| 选手 | 事件数 |\n|------|--------|\n`;
  for (const [player, count] of topSwapPlayers) {
    report += `| ${player} | ${count} |\n`;
  }

  report += `

### 示例事件

`;

  for (const c of swapCases.slice(0, 5)) {
    report += `- **${c.playerName}**: ${c.inferredRoleBefore} → ${c.inferredRoleAfter}, 英雄: ${c.championName}, 日期: ${c.date}\n`;
  }

  report += `
---

## 6. 输出文件

| 文件 | 路径 |
|------|------|
| 英雄位置清单（全英雄） | \`data/grid_v2/champion_roles_canon.json\` |
| 有变化的英雄 (delta) | \`data/grid_v2/champion_roles_delta_from_prior.json\` |
| Player Swap 事件 | \`data/grid_v2/player_role_swap_cases.json\` |
| 本报告 | \`data/grid_v2/champion_roles_report.md\` |

---

## 7. 运行命令

\`\`\`bash
npm run build:champion-roles-canon
\`\`\`

或

\`\`\`bash
npx tsx app/scripts/build-champion-roles-canon.ts
\`\`\`
`;

  return report;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
