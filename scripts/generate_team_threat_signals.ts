/**
 * Generate Team-level Threat Signals (TEAM_DENIAL)
 *
 * This script generates team_threat_signals.json which provides:
 * - Historical ban patterns AGAINST each team (what opponents ban when facing them)
 * - Weighted by beta (patch decay) and gamma (maturity)
 * - Combined with META ban rate and SELF ban preference
 *
 * Output: data/grid_v2/team_threat_signals.json
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

interface DraftAction {
  type: 'ban' | 'pick';
  sequenceNumber: string;
  drafter: {
    id: string;
    type: string;
  };
  draftable: {
    id: string;
    name: string;
    type: string;
  };
}

interface GameTeam {
  id: string;
  name: string;
  side: 'blue' | 'red';
}

interface Game {
  id: string;
  sequenceNumber: number;
  titleVersion?: {
    name: string;
  };
  teams: GameTeam[];
  draftActions: DraftAction[];
}

interface Series {
  id: string;
  startedAt: string;
  tournament?: {
    name?: string;
  };
  games: Game[];
}

interface BetaParams {
  beta_global_weighted: number;
  gamma: number;
}

interface MetaBanRateEntry {
  hero: string;
  value: number;
  support_weight: number;
}

interface MetaBanRateFile {
  target_patch: string;
  target_patch_index: number;
  beta_used: number;
  gamma_used: number;
  heroes: MetaBanRateEntry[];
}

interface TeamBanBlueprint {
  team_id: string;
  team_name: string;
  blue_side: {
    total_games: number;
    ban_slots: Array<{
      slot: number;
      total_bans: number;
      top_bans: Array<{
        champion_id: string;
        champion_name: string;
        count: number;
        rate: number;
      }>;
    }>;
  };
  red_side: {
    total_games: number;
    ban_slots: Array<{
      slot: number;
      total_bans: number;
      top_bans: Array<{
        champion_id: string;
        champion_name: string;
        count: number;
        rate: number;
      }>;
    }>;
  };
}

interface TeamBanBlueprintsFile {
  teams: Record<string, TeamBanBlueprint>;
}

interface OpponentBanEvent {
  champion_name: string;
  opponent_team_id: string;
  opponent_team_name: string;
  patch_index: number;
  game_date: string;
  ban_slot: 1 | 2 | 3;
}

interface ThreatEntry {
  team_id: string;
  team_name: string;
  champion_name: string;
  score: number;
  components: {
    OPPONENT_BAN: number;
    META: number;
    SELF: number;
  };
  sample_size: number;
  evidence: {
    top_opponent_teams: Array<{ team_name: string; count: number }>;
    raw_scores: {
      opponent_ban_weighted: number;
      meta_ban_rate: number;
      self_ban_rate: number;
    };
  };
}

interface ThreatSignalsOutput {
  generated_at: string;
  beta: number;
  gamma: number;
  target_patch_index: number;
  total_teams: number;
  total_entries: number;
  entries: ThreatEntry[];
}

// ============================================================================
// Constants
// ============================================================================

const DATA_DIR = path.join(process.cwd(), 'data', 'grid_v2');
const OUTPUT_FILE = path.join(DATA_DIR, 'team_threat_signals.json');

// ============================================================================
// Utility Functions
// ============================================================================

function parsePatchIndex(patchStr: string | undefined): number | null {
  if (!patchStr) return null;
  const match = patchStr.match(/^(\d+)\.(\d+)/);
  if (!match) return null;
  return parseInt(match[1]) * 100 + parseInt(match[2]);
}

function getCurrentPatchIndex(): number {
  // Read from meta file or use a reasonable default
  const metaPath = path.join(DATA_DIR, 'today_ban_rate_global.json');
  if (fs.existsSync(metaPath)) {
    const meta: MetaBanRateFile = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    return meta.target_patch_index;
  }
  return 1503; // Default to 15.03
}

function betaWeight(patchIndex: number, targetPatchIndex: number, beta: number): number {
  const delta = Math.max(0, targetPatchIndex - patchIndex);
  // Cap at 10 patches to avoid extremely small weights
  const cappedDelta = Math.min(delta, 10);
  return Math.pow(beta, cappedDelta);
}

// Maturity weight based on gamma (days since patch release)
// Since we don't have patch_release_date, we set maturity = 1 for now
function maturityWeight(_gameDate: string, _gamma: number): number {
  // TODO: Implement when patch_release_date is available
  return 1;
}

// ============================================================================
// Data Loading (with streaming for large files)
// ============================================================================

function loadBetaParams(): BetaParams {
  const filePath = path.join(DATA_DIR, 'beta_params.json');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return {
    beta_global_weighted: data.beta_global_weighted || 0.5,
    gamma: data.gamma || 2,
  };
}

function loadMetaBanRates(): Map<string, number> {
  const filePath = path.join(DATA_DIR, 'today_ban_rate_global.json');
  const data: MetaBanRateFile = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const map = new Map<string, number>();
  for (const entry of data.heroes) {
    map.set(entry.hero, entry.value);
  }
  return map;
}

function loadTeamBanBlueprints(): TeamBanBlueprintsFile {
  const filePath = path.join(DATA_DIR, 'team_ban_blueprints.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function getSeriesFiles(): string[] {
  const files = fs.readdirSync(DATA_DIR);
  return files
    .filter(f => f.startsWith('series_') && f.endsWith('.json'))
    .map(f => path.join(DATA_DIR, f));
}

// ============================================================================
// Main Processing Logic
// ============================================================================

function processSeriesFile(
  filePath: string,
  targetPatchIndex: number,
  beta: number,
  gamma: number,
  // Map: team_id -> champion_name -> weighted count + events
  teamOpponentBans: Map<string, Map<string, { weightedCount: number; events: OpponentBanEvent[] }>>,
  // Map: team_id -> team_name
  teamNames: Map<string, string>,
  // Map: team_id -> total weighted games faced
  teamTotalWeightedGames: Map<string, number>
): void {
  const content = fs.readFileSync(filePath, 'utf-8');
  const series: Series = JSON.parse(content);

  for (const game of series.games) {
    const patchIndex = parsePatchIndex(game.titleVersion?.name);
    if (!patchIndex) continue;

    // Calculate weight for this game
    const bWeight = betaWeight(patchIndex, targetPatchIndex, beta);
    const mWeight = maturityWeight(series.startedAt, gamma);
    const gameWeight = bWeight * mWeight;

    if (gameWeight < 0.001) continue; // Skip very old games

    // Get teams
    const teams = game.teams;
    if (teams.length !== 2) continue;

    const team0 = teams[0];
    const team1 = teams[1];

    // Store team names
    teamNames.set(team0.id, team0.name);
    teamNames.set(team1.id, team1.name);

    // Process ban actions (only early bans: seq 1-6)
    for (const action of game.draftActions) {
      if (action.type !== 'ban') continue;
      const seq = parseInt(action.sequenceNumber);
      if (seq < 1 || seq > 6) continue;

      const banSlot = Math.ceil(seq / 2) as 1 | 2 | 3;
      const banningTeamId = action.drafter.id;
      const championName = action.draftable.name;

      // Determine opponent team (the team being banned AGAINST)
      const opponentTeamId = banningTeamId === team0.id ? team1.id : team0.id;
      const opponentTeamName = banningTeamId === team0.id ? team1.name : team0.name;
      const banningTeamName = banningTeamId === team0.id ? team0.name : team1.name;

      // Record this as an opponent ban against opponentTeamId
      if (!teamOpponentBans.has(opponentTeamId)) {
        teamOpponentBans.set(opponentTeamId, new Map());
      }
      const champMap = teamOpponentBans.get(opponentTeamId)!;

      if (!champMap.has(championName)) {
        champMap.set(championName, { weightedCount: 0, events: [] });
      }
      const champData = champMap.get(championName)!;
      champData.weightedCount += gameWeight;
      champData.events.push({
        champion_name: championName,
        opponent_team_id: banningTeamId,
        opponent_team_name: banningTeamName,
        patch_index: patchIndex,
        game_date: series.startedAt,
        ban_slot: banSlot,
      });
    }

    // Track total weighted games for each team
    teamTotalWeightedGames.set(
      team0.id,
      (teamTotalWeightedGames.get(team0.id) || 0) + gameWeight
    );
    teamTotalWeightedGames.set(
      team1.id,
      (teamTotalWeightedGames.get(team1.id) || 0) + gameWeight
    );
  }
}

function calculateSelfBanRate(
  teamId: string,
  championName: string,
  blueprints: TeamBanBlueprintsFile
): number {
  const blueprint = blueprints.teams[teamId];
  if (!blueprint) return 0;

  let totalRate = 0;
  let count = 0;

  // Check both sides
  for (const side of [blueprint.blue_side, blueprint.red_side]) {
    for (const slot of side.ban_slots) {
      const ban = slot.top_bans.find(b => b.champion_name === championName);
      if (ban) {
        totalRate += ban.rate;
        count++;
      }
    }
  }

  return count > 0 ? totalRate / count : 0;
}

function generateThreatSignals(): void {
  console.log('Loading configuration...');
  const params = loadBetaParams();
  const beta = params.beta_global_weighted;
  const gamma = params.gamma;
  const targetPatchIndex = getCurrentPatchIndex();

  console.log(`Beta: ${beta}, Gamma: ${gamma}, Target Patch: ${targetPatchIndex}`);

  console.log('Loading meta ban rates...');
  const metaBanRates = loadMetaBanRates();

  console.log('Loading team ban blueprints...');
  const blueprints = loadTeamBanBlueprints();

  console.log('Scanning series files...');
  const seriesFiles = getSeriesFiles();
  console.log(`Found ${seriesFiles.length} series files`);

  // Data structures for aggregation
  const teamOpponentBans = new Map<string, Map<string, { weightedCount: number; events: OpponentBanEvent[] }>>();
  const teamNames = new Map<string, string>();
  const teamTotalWeightedGames = new Map<string, number>();

  // Process all series files
  console.log('Processing series files...');
  let processed = 0;
  for (const file of seriesFiles) {
    processSeriesFile(
      file,
      targetPatchIndex,
      beta,
      gamma,
      teamOpponentBans,
      teamNames,
      teamTotalWeightedGames
    );
    processed++;
    if (processed % 200 === 0) {
      console.log(`  Processed ${processed}/${seriesFiles.length} files...`);
    }
  }

  console.log('Generating threat entries...');
  const entries: ThreatEntry[] = [];

  // For each team, generate threat entries for all champions banned against them
  for (const [teamId, champMap] of teamOpponentBans) {
    const teamName = teamNames.get(teamId) || teamId;
    const totalWeightedGames = teamTotalWeightedGames.get(teamId) || 1;

    for (const [championName, champData] of champMap) {
      // Calculate raw scores
      const opponentBanWeighted = champData.weightedCount / totalWeightedGames;
      const metaBanRate = metaBanRates.get(championName) || 0;
      const selfBanRate = calculateSelfBanRate(teamId, championName, blueprints);

      // Raw sum for normalization
      const rawSum = opponentBanWeighted + metaBanRate + selfBanRate;
      if (rawSum < 0.001) continue; // Skip champions with no signal

      // Normalize components to sum = 1
      const components = {
        OPPONENT_BAN: opponentBanWeighted / rawSum,
        META: metaBanRate / rawSum,
        SELF: selfBanRate / rawSum,
      };

      // Score is the raw sum (represents total "threat intensity")
      const score = rawSum;

      // Calculate top opponent teams who banned this champion
      const opponentCounts = new Map<string, { name: string; count: number }>();
      for (const event of champData.events) {
        const existing = opponentCounts.get(event.opponent_team_id);
        if (existing) {
          existing.count++;
        } else {
          opponentCounts.set(event.opponent_team_id, {
            name: event.opponent_team_name,
            count: 1,
          });
        }
      }
      const topOpponentTeams = Array.from(opponentCounts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map(t => ({ team_name: t.name, count: t.count }));

      entries.push({
        team_id: teamId,
        team_name: teamName,
        champion_name: championName,
        score,
        components,
        sample_size: champData.events.length,
        evidence: {
          top_opponent_teams: topOpponentTeams,
          raw_scores: {
            opponent_ban_weighted: opponentBanWeighted,
            meta_ban_rate: metaBanRate,
            self_ban_rate: selfBanRate,
          },
        },
      });
    }
  }

  // Sort entries by score descending
  entries.sort((a, b) => b.score - a.score);

  // Build output
  const output: ThreatSignalsOutput = {
    generated_at: new Date().toISOString(),
    beta,
    gamma,
    target_patch_index: targetPatchIndex,
    total_teams: teamOpponentBans.size,
    total_entries: entries.length,
    entries,
  };

  // Write output
  console.log(`Writing ${entries.length} entries to ${OUTPUT_FILE}...`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log('Done!');
  console.log(`  Total teams: ${output.total_teams}`);
  console.log(`  Total entries: ${output.total_entries}`);
}

// ============================================================================
// Entry Point
// ============================================================================

generateThreatSignals();
