#!/usr/bin/env ts-node
/**
 * Generate Team Pick Blueprints
 *
 * Extracts PICK actions from series_*.json to create team_pick_blueprints.json
 *
 * Output schema:
 * {
 *   generated_at: string,
 *   total_teams: number,
 *   teams: {
 *     [team_id]: {
 *       team_name: string,
 *       total_games: number,
 *       blue_side: {
 *         games: number,
 *         pick_slots: {
 *           P1: { top_picks: [...], total: number },
 *           P2: { top_picks: [...], total: number },
 *           ...
 *         },
 *         overall_top_picks: [...]
 *       },
 *       red_side: { ... },
 *       pick_response_map: { [opponent_pick]: { [our_pick]: count } }
 *     }
 *   }
 * }
 *
 * Usage: npx ts-node scripts/generate_team_pick_blueprints.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

interface DraftAction {
  id: string;
  type: 'ban' | 'pick';
  sequenceNumber: string;
  drafter: { id: string; type: string };
  draftable: { id: string; type: string; name: string };
}

interface GameTeam {
  id: string;
  name?: string;
  side?: 'blue' | 'red';
}

interface Game {
  id: string;
  teams: GameTeam[];
  draftActions?: DraftAction[];
  startedAt?: string;
}

interface Series {
  id: string;
  teams: Array<{ id: string; name: string }>;
  games: Game[];
  startTimeScheduled?: string;
}

interface PickEntry {
  champion: string;
  count: number;
}

interface PickSlotData {
  top_picks: Array<{ champion: string; count: number; rate: number }>;
  total: number;
}

interface SideData {
  games: number;
  pick_slots: {
    P1?: PickSlotData;
    P2?: PickSlotData;
    P3?: PickSlotData;
    P4?: PickSlotData;
    P5?: PickSlotData;
  };
  overall_top_picks: Array<{ champion: string; count: number; rate: number }>;
}

interface TeamPickBlueprint {
  team_name: string;
  total_games: number;
  blue_side: SideData;
  red_side: SideData;
  pick_response_map: Record<string, Record<string, number>>;
}

// ============================================================================
// Pick Slot Mapping
// ============================================================================

// Standard draft order (sequenceNumber -> pick slot)
// Bans: 1-6 (B1-B3 each side)
// Picks: 7-20
// Blue: P1(7), P2-P3(10,11), P4-P5(16,17)
// Red: P1-P2(8,9), P3(12), P4-P5(14,15), wait... let me recalculate

// Standard fearless draft order:
// 1-6: Bans (B1-B3 alternating)
// 7: Blue P1
// 8-9: Red P1, P2
// 10-11: Blue P2, P3
// 12-13: Red P3 + Ban phase 2 starts? Actually varies by format

// Let's use a simpler approach: track pick order per side
function getPickSlotForTeam(
  sequenceNumber: number,
  teamId: string,
  blueTeamId: string,
  allPickActions: DraftAction[]
): string | null {
  // Filter to picks only by this team, in order
  const teamPicks = allPickActions
    .filter(a => a.type === 'pick' && a.drafter.id === teamId)
    .sort((a, b) => parseInt(a.sequenceNumber) - parseInt(b.sequenceNumber));

  const pickIndex = teamPicks.findIndex(a => parseInt(a.sequenceNumber) === sequenceNumber);
  if (pickIndex === -1) return null;

  // P1, P2, P3, P4, P5
  return `P${pickIndex + 1}`;
}

// ============================================================================
// Main Processing
// ============================================================================

async function main() {
  const dataDir = path.join(process.cwd(), 'data', 'grid_v2');
  const seriesFiles = fs.readdirSync(dataDir).filter(f => f.startsWith('series_') && f.endsWith('.json'));

  console.log(`Found ${seriesFiles.length} series files`);

  // Aggregation maps
  const teamBlueprints = new Map<string, {
    team_name: string;
    total_games: number;
    blue_games: number;
    red_games: number;
    blue_picks: Map<string, Map<string, number>>; // slot -> champion -> count
    red_picks: Map<string, Map<string, number>>;
    blue_overall: Map<string, number>;
    red_overall: Map<string, number>;
    pick_responses: Map<string, Map<string, number>>; // opponent_pick -> our_pick -> count
  }>();

  let processedGames = 0;

  for (const file of seriesFiles) {
    try {
      const filePath = path.join(dataDir, file);
      const series: Series = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      // Build team name map
      const teamNames = new Map<string, string>();
      for (const t of series.teams || []) {
        teamNames.set(t.id, t.name);
      }

      for (const game of series.games || []) {
        if (!game.draftActions || game.draftActions.length === 0) continue;

        // Determine blue/red sides
        let blueTeamId: string | null = null;
        let redTeamId: string | null = null;

        for (const t of game.teams || []) {
          if (t.side === 'blue') blueTeamId = t.id;
          if (t.side === 'red') redTeamId = t.id;
        }

        if (!blueTeamId || !redTeamId) continue;

        // Filter to pick actions only
        const pickActions = game.draftActions
          .filter(a => a.type === 'pick')
          .sort((a, b) => parseInt(a.sequenceNumber) - parseInt(b.sequenceNumber));

        if (pickActions.length < 10) continue; // Incomplete draft

        processedGames++;

        // Process each team
        for (const teamId of [blueTeamId, redTeamId]) {
          const isBlue = teamId === blueTeamId;
          const teamName = teamNames.get(teamId) || teamId;

          // Initialize team data if needed
          if (!teamBlueprints.has(teamId)) {
            teamBlueprints.set(teamId, {
              team_name: teamName,
              total_games: 0,
              blue_games: 0,
              red_games: 0,
              blue_picks: new Map(),
              red_picks: new Map(),
              blue_overall: new Map(),
              red_overall: new Map(),
              pick_responses: new Map(),
            });
          }

          const blueprint = teamBlueprints.get(teamId)!;
          blueprint.total_games++;

          if (isBlue) {
            blueprint.blue_games++;
          } else {
            blueprint.red_games++;
          }

          // Track picks by slot
          const teamPicks = pickActions.filter(a => a.drafter.id === teamId);
          const opponentPicks = pickActions.filter(a => a.drafter.id !== teamId);

          teamPicks.forEach((pick, idx) => {
            const slot = `P${idx + 1}`;
            const champion = pick.draftable.name;

            // Add to slot map
            const sidePickMap = isBlue ? blueprint.blue_picks : blueprint.red_picks;
            if (!sidePickMap.has(slot)) {
              sidePickMap.set(slot, new Map());
            }
            const slotMap = sidePickMap.get(slot)!;
            slotMap.set(champion, (slotMap.get(champion) || 0) + 1);

            // Add to overall
            const overallMap = isBlue ? blueprint.blue_overall : blueprint.red_overall;
            overallMap.set(champion, (overallMap.get(champion) || 0) + 1);

            // Track pick responses (what we pick after opponent picks something)
            // Look at opponent's most recent pick before this pick
            const thisSeq = parseInt(pick.sequenceNumber);
            const prevOppPick = opponentPicks
              .filter(op => parseInt(op.sequenceNumber) < thisSeq)
              .sort((a, b) => parseInt(b.sequenceNumber) - parseInt(a.sequenceNumber))[0];

            if (prevOppPick) {
              const oppChamp = prevOppPick.draftable.name;
              if (!blueprint.pick_responses.has(oppChamp)) {
                blueprint.pick_responses.set(oppChamp, new Map());
              }
              const respMap = blueprint.pick_responses.get(oppChamp)!;
              respMap.set(champion, (respMap.get(champion) || 0) + 1);
            }
          });
        }
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }

  console.log(`Processed ${processedGames} games from ${teamBlueprints.size} teams`);

  // Convert to output format
  const output: {
    generated_at: string;
    total_teams: number;
    total_games: number;
    teams: Record<string, TeamPickBlueprint>;
  } = {
    generated_at: new Date().toISOString(),
    total_teams: teamBlueprints.size,
    total_games: processedGames,
    teams: {},
  };

  for (const [teamId, data] of teamBlueprints) {
    const convertSide = (
      pickMap: Map<string, Map<string, number>>,
      overallMap: Map<string, number>,
      games: number
    ): SideData => {
      const pick_slots: SideData['pick_slots'] = {};

      for (const [slot, champMap] of pickMap) {
        const entries = Array.from(champMap.entries())
          .map(([champion, count]) => ({
            champion,
            count,
            rate: games > 0 ? count / games : 0,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        const total = Array.from(champMap.values()).reduce((sum, c) => sum + c, 0);

        (pick_slots as any)[slot] = {
          top_picks: entries,
          total,
        };
      }

      const overall = Array.from(overallMap.entries())
        .map(([champion, count]) => ({
          champion,
          count,
          rate: games > 0 ? count / (games * 5) : 0, // 5 picks per game
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

      return {
        games,
        pick_slots,
        overall_top_picks: overall,
      };
    };

    // Convert pick responses
    const pick_response_map: Record<string, Record<string, number>> = {};
    for (const [oppChamp, respMap] of data.pick_responses) {
      pick_response_map[oppChamp] = {};
      for (const [ourChamp, count] of respMap) {
        pick_response_map[oppChamp][ourChamp] = count;
      }
    }

    output.teams[teamId] = {
      team_name: data.team_name,
      total_games: data.total_games,
      blue_side: convertSide(data.blue_picks, data.blue_overall, data.blue_games),
      red_side: convertSide(data.red_picks, data.red_overall, data.red_games),
      pick_response_map,
    };
  }

  // Write output
  const outputPath = path.join(dataDir, 'team_pick_blueprints.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\nOutput written to ${outputPath}`);
  console.log(`Total teams: ${output.total_teams}`);
  console.log(`Total games: ${output.total_games}`);

  // Print sample
  const sampleTeamId = Array.from(teamBlueprints.keys())[0];
  if (sampleTeamId && output.teams[sampleTeamId]) {
    console.log(`\nSample team (${sampleTeamId}):`);
    const sample = output.teams[sampleTeamId];
    console.log(`  Name: ${sample.team_name}`);
    console.log(`  Games: ${sample.total_games} (Blue: ${sample.blue_side.games}, Red: ${sample.red_side.games})`);
    if (sample.blue_side.pick_slots.P1) {
      console.log(`  Blue P1 top picks: ${sample.blue_side.pick_slots.P1.top_picks.slice(0, 3).map(p => `${p.champion}(${p.count})`).join(', ')}`);
    }
  }
}

main().catch(console.error);
