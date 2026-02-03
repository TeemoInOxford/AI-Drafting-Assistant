/**
 * Build Champion Roles Prior V2
 *
 * 合并旧静态 CHAMPION_POSITIONS 与新 champion_roles_canon.json，
 * 生成最终可用的 Hero Role Prior。
 *
 * 合并规则：
 * - 旧 prior 里的 role 永远保留（不允许删除）
 * - 新 canon 中 share >= ADDITION_THRESHOLD 的 role 追加
 * - 输出覆盖所有英雄（旧表+新 canon 的并集）
 * - 同时输出 addedRolesEvidence 方便 audit
 */

import * as fs from 'fs';
import * as path from 'path';
import { CHAMPION_POSITIONS } from '../lib/positions';
import { Position } from '../lib/types';

// ============ CONSTANTS ============

/** 新 role 追加阈值：canon share >= 此值才追加 */
const ADDITION_THRESHOLD = 0.20;

/** 所有位置 */
const ALL_ROLES: Position[] = ['top', 'jungle', 'mid', 'bot', 'support'];

// ============ TYPES ============

interface CanonChampion {
  roles: Position[];
  shares: Record<Position, number>;
  total: number;
}

interface CanonData {
  meta: Record<string, unknown>;
  champions: Record<string, CanonChampion>;
}

interface RoleEvidence {
  share: number;
  samples: number;
}

interface PriorV2Entry {
  roles: Position[];
  baseRoles: Position[];
  addedRoles: Position[];
  evidence: Record<string, RoleEvidence>;
}

interface PriorV2Output {
  meta: {
    generatedAt: string;
    totalChampions: number;
    championsWithAddedRoles: number;
    totalRolesAdded: number;
    additionThreshold: number;
    sources: {
      base: string;
      canon: string;
    };
  };
  champions: Record<string, PriorV2Entry>;
}

// ============ MAIN ============

async function main() {
  console.log('=== BUILD CHAMPION ROLES PRIOR V2 ===\n');

  const dataDir = path.join(process.cwd(), 'data/grid_v2');
  const canonPath = path.join(dataDir, 'champion_roles_canon.json');
  const outputPath = path.join(dataDir, 'champion_roles_prior_v2.json');

  // 1. 加载 canon
  console.log('Step 1: Loading champion_roles_canon.json...');

  if (!fs.existsSync(canonPath)) {
    console.error('Error: champion_roles_canon.json not found. Run build-champion-roles-canon.ts first.');
    process.exit(1);
  }

  const canon: CanonData = JSON.parse(fs.readFileSync(canonPath, 'utf-8'));
  console.log(`  Canon champions: ${Object.keys(canon.champions).length}`);
  console.log(`  Static CHAMPION_POSITIONS: ${Object.keys(CHAMPION_POSITIONS).length}`);

  // 2. 合并
  console.log('\nStep 2: Merging...');

  const allChampionNames = new Set<string>([
    ...Object.keys(CHAMPION_POSITIONS),
    ...Object.keys(canon.champions),
  ]);

  const result: Record<string, PriorV2Entry> = {};
  let championsWithAdded = 0;
  let totalAdded = 0;

  for (const name of allChampionNames) {
    const baseRoles: Position[] = CHAMPION_POSITIONS[name] ? [...CHAMPION_POSITIONS[name]] : [];
    const canonData = canon.champions[name];

    const addedRoles: Position[] = [];
    const evidence: Record<string, RoleEvidence> = {};

    if (canonData) {
      for (const role of ALL_ROLES) {
        const share = canonData.shares[role] || 0;
        if (share >= ADDITION_THRESHOLD && !baseRoles.includes(role)) {
          addedRoles.push(role);
          evidence[role] = {
            share: Math.round(share * 10000) / 10000,
            samples: Math.round(share * canonData.total),
          };
        }
      }
    }

    // roles = baseRoles + addedRoles，按 ALL_ROLES 顺序排列
    const mergedSet = new Set<Position>([...baseRoles, ...addedRoles]);
    const roles = ALL_ROLES.filter(r => mergedSet.has(r));

    if (addedRoles.length > 0) {
      championsWithAdded++;
      totalAdded += addedRoles.length;
    }

    result[name] = { roles, baseRoles, addedRoles, evidence };
  }

  // 3. 输出
  console.log('\nStep 3: Writing output...');

  const output: PriorV2Output = {
    meta: {
      generatedAt: new Date().toISOString(),
      totalChampions: allChampionNames.size,
      championsWithAddedRoles: championsWithAdded,
      totalRolesAdded: totalAdded,
      additionThreshold: ADDITION_THRESHOLD,
      sources: {
        base: 'app/lib/positions.ts → CHAMPION_POSITIONS',
        canon: 'data/grid_v2/champion_roles_canon.json',
      },
    },
    champions: result,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`  Written: ${outputPath}`);

  // 4. 摘要
  console.log('\n=== SUMMARY ===');
  console.log(`Total champions: ${allChampionNames.size}`);
  console.log(`Champions with added roles: ${championsWithAdded}`);
  console.log(`Total roles added: ${totalAdded}`);

  // 输出每个有新增 role 的英雄
  console.log('\n--- Added roles detail ---');
  const entries = Object.entries(result)
    .filter(([, v]) => v.addedRoles.length > 0)
    .sort((a, b) => {
      // 按证据样本数最大值降序
      const maxA = Math.max(...Object.values(a[1].evidence).map(e => e.samples), 0);
      const maxB = Math.max(...Object.values(b[1].evidence).map(e => e.samples), 0);
      return maxB - maxA;
    });

  for (const [name, entry] of entries) {
    const evidenceStr = entry.addedRoles
      .map(r => `+${r}(${(entry.evidence[r].share * 100).toFixed(1)}%, n=${entry.evidence[r].samples})`)
      .join(' ');
    console.log(`  ${name}: [${entry.baseRoles.join(',')}] → [${entry.roles.join(',')}]  ${evidenceStr}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
