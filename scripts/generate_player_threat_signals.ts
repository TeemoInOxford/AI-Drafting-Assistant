/**
 * Generate Player-level Threat Signals (PLAYER_SPECIALTY)
 *
 * This script generates player_threat_signals.json which provides:
 * - Player champion pool data aggregated by team
 * - Weighted by existing beta/gamma from player_pool_by_team.json
 * - Combines TEAM_POOL + TOP_PLAYER + RECENCY signals
 *
 * Output: data/grid_v2/player_threat_signals.json
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

interface ChampionEntry {
  champion: string;
  games: number;
  games_weighted: number;
  wins: number;
  wins_weighted: number;
  win_rate: number;
  win_rate_weighted: number;
  avg_kda: number;
  last_played_at: string;
  last_played_patch: string;
  last_played_patch_index: number;
  patch_distance_to_target: number;
}

interface PlayerEntry {
  player_id: string;
  player_name: string;
  total_games: number;
  total_games_weighted: number;
  unique_champions: number;
  champions: ChampionEntry[];
}

interface TeamEntry {
  team_name: string;
  home_league: string;
  total_players: number;
  total_player_games: number;
  players: PlayerEntry[];
}

interface PlayerPoolData {
  target_patch: string;
  target_patch_index: number;
  generated_at_utc: string;
  parameters: {
    beta: number;
    gamma: number;
    w_min: number;
    w_max: number;
  };
  teams: Record<string, TeamEntry>;
}

interface TopPlayerEvidence {
  player_id: string;
  player_name: string;
  games_weighted: number;
  win_rate_weighted: number;
  last_played_patch: string;
}

interface PlayerThreatEntry {
  team_id: string;
  team_name: string;
  champion_name: string;
  score: number;
  components: {
    TEAM_POOL: number;
    TOP_PLAYER: number;
    RECENCY: number;
  };
  sample_size: number;
  players_count: number;
  evidence: {
    top_players: TopPlayerEvidence[];
    raw_scores: {
      team_pool: number;
      top_player: number;
      recency: number;
    };
  };
}

interface PlayerThreatOutput {
  generated_at: string;
  beta: number;
  gamma: number;
  target_patch_index: number;
  source_file: string;
  total_teams: number;
  total_entries: number;
  entries: PlayerThreatEntry[];
}

// ============================================================================
// Constants
// ============================================================================

const DATA_DIR = path.join(process.cwd(), 'data', 'grid_v2');
const INPUT_FILE = path.join(DATA_DIR, 'player_pool_by_team.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'player_threat_signals.json');

// ============================================================================
// Main Processing
// ============================================================================

function generatePlayerThreatSignals(): void {
  console.log('Loading player pool data...');

  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`Input file not found: ${INPUT_FILE}`);
  }

  const rawData = fs.readFileSync(INPUT_FILE, 'utf-8');
  const poolData: PlayerPoolData = JSON.parse(rawData);

  console.log(`Target patch: ${poolData.target_patch}`);
  console.log(`Beta: ${poolData.parameters.beta}, Gamma: ${poolData.parameters.gamma}`);
  console.log(`Total teams: ${Object.keys(poolData.teams).length}`);

  const entries: PlayerThreatEntry[] = [];

  // Process each team
  for (const [teamId, team] of Object.entries(poolData.teams)) {
    // Aggregate champions across all players in this team
    const championData = new Map<string, {
      teamPoolWeighted: number;
      topPlayerWeighted: number;
      topPlayerId: string;
      topPlayerName: string;
      minPatchDistance: number;
      players: Array<{
        playerId: string;
        playerName: string;
        gamesWeighted: number;
        winRateWeighted: number;
        lastPlayedPatch: string;
        patchDistance: number;
      }>;
    }>();

    // Collect data from all players
    for (const player of team.players) {
      for (const champ of player.champions) {
        if (!championData.has(champ.champion)) {
          championData.set(champ.champion, {
            teamPoolWeighted: 0,
            topPlayerWeighted: 0,
            topPlayerId: '',
            topPlayerName: '',
            minPatchDistance: Infinity,
            players: [],
          });
        }

        const data = championData.get(champ.champion)!;

        // Sum team pool
        data.teamPoolWeighted += champ.games_weighted;

        // Track top player
        if (champ.games_weighted > data.topPlayerWeighted) {
          data.topPlayerWeighted = champ.games_weighted;
          data.topPlayerId = player.player_id;
          data.topPlayerName = player.player_name;
        }

        // Track minimum patch distance (most recent play)
        if (champ.patch_distance_to_target < data.minPatchDistance) {
          data.minPatchDistance = champ.patch_distance_to_target;
        }

        // Store player evidence
        data.players.push({
          playerId: player.player_id,
          playerName: player.player_name,
          gamesWeighted: champ.games_weighted,
          winRateWeighted: champ.win_rate_weighted,
          lastPlayedPatch: champ.last_played_patch,
          patchDistance: champ.patch_distance_to_target,
        });
      }
    }

    // Generate entries for each champion
    for (const [championName, data] of championData) {
      // Calculate raw scores
      const rawTeamPool = data.teamPoolWeighted;
      const rawTopPlayer = data.topPlayerWeighted;
      // Recency: 1 / (1 + delta_patch), 0 if no data
      const rawRecency = data.minPatchDistance === Infinity
        ? 0
        : 1 / (1 + data.minPatchDistance);

      const scoreRaw = rawTeamPool + rawTopPlayer + rawRecency;

      // Skip if no meaningful data
      if (scoreRaw < 0.001) continue;

      // Normalize components
      const components = {
        TEAM_POOL: rawTeamPool / scoreRaw,
        TOP_PLAYER: rawTopPlayer / scoreRaw,
        RECENCY: rawRecency / scoreRaw,
      };

      // Sort players by contribution and take top 3
      const sortedPlayers = data.players
        .sort((a, b) => b.gamesWeighted - a.gamesWeighted)
        .slice(0, 3)
        .map(p => ({
          player_id: p.playerId,
          player_name: p.playerName,
          games_weighted: p.gamesWeighted,
          win_rate_weighted: p.winRateWeighted,
          last_played_patch: p.lastPlayedPatch,
        }));

      entries.push({
        team_id: teamId,
        team_name: team.team_name,
        champion_name: championName,
        score: scoreRaw,
        components,
        sample_size: Math.round(data.teamPoolWeighted),
        players_count: data.players.length,
        evidence: {
          top_players: sortedPlayers,
          raw_scores: {
            team_pool: rawTeamPool,
            top_player: rawTopPlayer,
            recency: rawRecency,
          },
        },
      });
    }
  }

  // Sort by score descending
  entries.sort((a, b) => b.score - a.score);

  // Build output
  const output: PlayerThreatOutput = {
    generated_at: new Date().toISOString(),
    beta: poolData.parameters.beta,
    gamma: poolData.parameters.gamma,
    target_patch_index: poolData.target_patch_index,
    source_file: 'player_pool_by_team.json',
    total_teams: Object.keys(poolData.teams).length,
    total_entries: entries.length,
    entries,
  };

  console.log(`Writing ${entries.length} entries to ${OUTPUT_FILE}...`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log('Done!');
  console.log(`  Total teams: ${output.total_teams}`);
  console.log(`  Total entries: ${output.total_entries}`);

  // Show sample
  console.log('\nSample entries (top 3 by score):');
  entries.slice(0, 3).forEach((e, i) => {
    console.log(`  ${i + 1}. ${e.team_name} / ${e.champion_name}`);
    console.log(`     score=${e.score.toFixed(3)}, players=${e.players_count}`);
    console.log(`     components: TEAM_POOL=${(e.components.TEAM_POOL * 100).toFixed(1)}%, TOP_PLAYER=${(e.components.TOP_PLAYER * 100).toFixed(1)}%, RECENCY=${(e.components.RECENCY * 100).toFixed(1)}%`);
  });
}

// ============================================================================
// Entry Point
// ============================================================================

generatePlayerThreatSignals();
