'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

// Types for Career view (no weighting)
interface ChampionStats {
  champion: string;
  games: number;
  wins: number;
  win_rate: number;
  avg_kda: number;
  last_played_at: string | null;
  last_played_patch: string | null;
  last_played_patch_index: number | null;
  patch_distance_to_target: number | null;
  days_since_last_played: number | null;
}

interface PlayerData {
  player_id: string;
  player_name: string;
  team_id: string;
  team_name: string;
  home_league?: string;
  total_games: number;
  unique_champions: number;
  champions: ChampionStats[];
}

interface GlobalPoolData {
  target_patch: string;
  target_patch_index: number;
  latest_game_date: string;
  generated_at_utc: string;
  metadata: {
    total_players: number;
    total_player_games: number;
    filter_options: {
      league: string[];
    };
  };
  players: PlayerData[];
}

interface ByLeagueData {
  target_patch: string;
  latest_game_date: string;
  leagues: {
    [key: string]: {
      total_players: number;
      total_player_games: number;
      players: PlayerData[];
    };
  };
}

interface ByTeamData {
  target_patch: string;
  latest_game_date: string;
  teams: {
    [key: string]: {
      team_name: string;
      home_league: string;
      total_players: number;
      total_player_games: number;
      players: PlayerData[];
    };
  };
}

type SortField = 'games' | 'win_rate' | 'avg_kda' | 'last_played_patch';
type SortDirection = 'asc' | 'desc';

const LEAGUES = [
  { value: '', label: 'Global' },
  { value: 'LCK', label: 'LCK' },
  { value: 'LPL', label: 'LPL' },
  { value: 'LEC', label: 'LEC' },
  { value: 'LTA_N', label: 'LTA North' },
  { value: 'LTA_S', label: 'LTA South' },
];

// Helper to check if a champion is stale (2+ patches old)
function isStaleChampion(patchDistance: number | null): boolean {
  if (patchDistance === null) return true;
  return patchDistance >= 2;
}

// Get win rate color
function getWinRateColor(winRate: number): string {
  if (winRate >= 0.6) return 'text-green-400';
  if (winRate <= 0.4) return 'text-red-400';
  return 'text-slate-300';
}

// Get win rate background for bar
function getWinRateBarColor(winRate: number): string {
  if (winRate >= 0.6) return 'bg-green-500';
  if (winRate <= 0.4) return 'bg-red-500';
  return 'bg-slate-500';
}

export default function PlayerPoolPage() {
  // Data states
  const [globalData, setGlobalData] = useState<GlobalPoolData | null>(null);
  const [byLeagueData, setByLeagueData] = useState<ByLeagueData | null>(null);
  const [byTeamData, setByTeamData] = useState<ByTeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [selectedLeague, setSelectedLeague] = useState<string>('');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [playerSearch, setPlayerSearch] = useState<string>('');
  const [championFilter, setChampionFilter] = useState<string>('');

  // Sort states - default to games DESC for career view
  const [sortField, setSortField] = useState<SortField>('games');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Load data (career view)
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [globalRes, leagueRes, teamRes] = await Promise.all([
          fetch('/api/player-pool?type=global&view=career'),
          fetch('/api/player-pool?type=by-league&view=career'),
          fetch('/api/player-pool?type=by-team&view=career'),
        ]);

        if (!globalRes.ok || !leagueRes.ok || !teamRes.ok) {
          throw new Error('Failed to load player pool data');
        }

        const [globalJson, leagueJson, teamJson] = await Promise.all([
          globalRes.json(),
          leagueRes.json(),
          teamRes.json(),
        ]);

        if (!globalJson.success || !leagueJson.success || !teamJson.success) {
          throw new Error('API returned error');
        }

        setGlobalData(globalJson.data);
        setByLeagueData(leagueJson.data);
        setByTeamData(teamJson.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
      setLoading(false);
    };

    loadData();
  }, []);

  // Get available teams based on selected league
  const availableTeams = useMemo(() => {
    if (!byTeamData) return [];

    const teams = Object.entries(byTeamData.teams)
      .filter(([_, team]) => !selectedLeague || team.home_league === selectedLeague)
      .map(([id, team]) => ({
        id,
        name: team.team_name,
        league: team.home_league,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return teams;
  }, [byTeamData, selectedLeague]);

  // Get available players based on filters
  const availablePlayers = useMemo(() => {
    if (!globalData) return [];

    let players = globalData.players;

    // Filter by league
    if (selectedLeague) {
      players = players.filter(p => p.home_league === selectedLeague);
    }

    // Filter by team
    if (selectedTeamId) {
      players = players.filter(p => p.team_id === selectedTeamId);
    }

    // Filter by search
    if (playerSearch) {
      const search = playerSearch.toLowerCase();
      players = players.filter(p =>
        p.player_name.toLowerCase().includes(search) ||
        p.team_name.toLowerCase().includes(search)
      );
    }

    return players.sort((a, b) => b.total_games - a.total_games);
  }, [globalData, selectedLeague, selectedTeamId, playerSearch]);

  // Get selected player data
  const selectedPlayer = useMemo(() => {
    if (!selectedPlayerId || !globalData) return null;
    return globalData.players.find(p => p.player_id === selectedPlayerId) || null;
  }, [globalData, selectedPlayerId]);

  // Get sorted and filtered champions
  const sortedChampions = useMemo(() => {
    if (!selectedPlayer) return [];

    let champions = [...selectedPlayer.champions];

    // Filter by champion name
    if (championFilter) {
      const filter = championFilter.toLowerCase();
      champions = champions.filter(c => c.champion.toLowerCase().includes(filter));
    }

    // Sort
    champions.sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (sortField) {
        case 'games':
          aVal = a.games;
          bVal = b.games;
          break;
        case 'win_rate':
          aVal = a.win_rate;
          bVal = b.win_rate;
          break;
        case 'avg_kda':
          aVal = a.avg_kda;
          bVal = b.avg_kda;
          break;
        case 'last_played_patch':
          aVal = a.last_played_patch_index || 0;
          bVal = b.last_played_patch_index || 0;
          break;
      }

      if (sortDirection === 'desc') {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
      return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    });

    return champions;
  }, [selectedPlayer, championFilter, sortField, sortDirection]);

  // Get max last_played_at for player
  const playerLastPlayed = useMemo(() => {
    if (!selectedPlayer) return null;
    const dates = selectedPlayer.champions
      .map(c => c.last_played_at)
      .filter(Boolean) as string[];
    if (dates.length === 0) return null;
    return dates.sort().reverse()[0];
  }, [selectedPlayer]);

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Reset filters when league changes
  useEffect(() => {
    setSelectedTeamId('');
    setSelectedPlayerId('');
  }, [selectedLeague]);

  // Reset player when team changes
  useEffect(() => {
    setSelectedPlayerId('');
  }, [selectedTeamId]);

  const targetPatch = globalData?.target_patch || '';
  const latestGameDate = globalData?.latest_game_date || '';

  return (
    <div className="min-h-screen text-white relative overflow-hidden selection:bg-cyan-500/30">
      {/* Background Grid */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:32px_32px]"></div>
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                Player <span className="text-cyan-400">Champion Pool</span>
              </h1>
              <p className="text-slate-400 mt-2">
                Career statistics for player champion proficiency
              </p>
            </div>
            <Link
              href="/"
              className="text-sm font-medium text-slate-400 hover:text-white transition-colors flex items-center gap-2"
            >
              <span>←</span> Back to Home
            </Link>
          </div>

          {/* Data Notice & Legend */}
          <div className="bg-slate-800/30 rounded-lg p-4 mb-6 border border-slate-700/50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <h3 className="text-slate-300 font-semibold mb-2">Understanding the Data</h3>
                <ul className="space-y-1.5 text-slate-400">
                  <li className="flex items-start gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 flex-shrink-0 mt-0.5">Stale</span>
                    <span>Champion not played by this player in the last 2+ patches — may not reflect current proficiency.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-slate-500 flex-shrink-0 mt-0.5">Patch #</span>
                    <span>Number of patches since the champion was last played (e.g., "3+ patches" means outdated).</span>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-slate-300 font-semibold mb-2">Color Coding</h3>
                <ul className="space-y-1.5 text-slate-400">
                  <li><span className="text-green-400 font-medium">Green</span> Win Rate ≥60% or KDA ≥3.0 — strong performance</li>
                  <li><span className="text-red-400 font-medium">Red</span> Win Rate ≤40% or KDA &lt;2.0 — below average</li>
                  <li><span className="text-amber-400 font-medium">Amber</span> Stale data — champion not recently played</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Stats Summary */}
          {globalData && (
            <div className="flex flex-wrap gap-4 items-center text-sm mb-6">
              <span className="text-slate-400">
                Target Patch: <span className="text-cyan-400 font-semibold">{globalData.target_patch}</span>
              </span>
              <span className="text-slate-400">
                Data through: <span className="text-white font-semibold">{globalData.latest_game_date}</span>
              </span>
              <span className="text-slate-400">
                Players: <span className="text-white font-semibold">{globalData.metadata.total_players}</span>
              </span>
              <span className="text-slate-400">
                Games: <span className="text-white font-semibold">{globalData.metadata.total_player_games.toLocaleString()}</span>
              </span>
            </div>
          )}

          {/* Filters */}
          <div className="glass-card rounded-xl p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* League Filter */}
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">League</label>
                <select
                  value={selectedLeague}
                  onChange={(e) => setSelectedLeague(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 cursor-pointer"
                >
                  {LEAGUES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Team Filter */}
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Team</label>
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 cursor-pointer"
                >
                  <option value="">All Teams</option>
                  {availableTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Player Search */}
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Player</label>
                <div className="relative">
                  <input
                    type="text"
                    value={playerSearch}
                    onChange={(e) => setPlayerSearch(e.target.value)}
                    placeholder="Search player..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                  {playerSearch && (
                    <button
                      onClick={() => setPlayerSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {/* Champion Filter */}
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Champion Filter</label>
                <input
                  type="text"
                  value={championFilter}
                  onChange={(e) => setChampionFilter(e.target.value)}
                  placeholder="Filter champions..."
                  disabled={!selectedPlayer}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50"
                />
              </div>
            </div>

            {/* Player Dropdown */}
            {availablePlayers.length > 0 && !selectedPlayer && (
              <div className="mt-4">
                <label className="block text-xs text-slate-500 mb-1.5">Select a Player</label>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-48 overflow-y-auto">
                  {availablePlayers.slice(0, 30).map((player) => (
                    <button
                      key={player.player_id}
                      onClick={() => setSelectedPlayerId(player.player_id)}
                      className="text-left px-3 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 hover:border-cyan-500/50 transition-colors"
                    >
                      <div className="text-sm font-medium text-white truncate">{player.player_name}</div>
                      <div className="text-xs text-slate-500 truncate">{player.team_name}</div>
                    </button>
                  ))}
                </div>
                {availablePlayers.length > 30 && (
                  <p className="text-xs text-slate-500 mt-2">
                    Showing 30 of {availablePlayers.length} players. Use search to filter.
                  </p>
                )}
              </div>
            )}
          </div>
        </motion.div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400 mx-auto mb-4"></div>
              <p className="text-slate-400">Loading player pool data...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="text-center py-20 text-red-400">
            <p>Error: {error}</p>
          </div>
        )}

        {/* No Player Selected */}
        {!loading && !error && !selectedPlayer && (
          <div className="text-center py-20 text-slate-500">
            <div className="text-6xl mb-4">👤</div>
            <p className="text-lg">Select a player to view their champion pool</p>
            <p className="text-sm mt-2">Use the filters above to find players</p>
          </div>
        )}

        {/* Player Content */}
        <AnimatePresence mode="wait">
          {selectedPlayer && (
            <motion.div
              key={selectedPlayer.player_id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {/* Player Summary Card */}
              <div className="glass-card rounded-xl p-6 mb-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-2xl font-bold">
                      {selectedPlayer.player_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white">{selectedPlayer.player_name}</h2>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-slate-400">{selectedPlayer.team_name}</span>
                        <span className="px-2 py-0.5 rounded-full bg-slate-700 text-xs font-medium text-cyan-400">
                          {selectedPlayer.home_league}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedPlayerId('')}
                    className="text-slate-500 hover:text-white transition-colors text-xl"
                  >
                    ×
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
                  <div className="bg-slate-800/50 rounded-lg p-4">
                    <div className="text-xs text-slate-500 mb-1">Total Games</div>
                    <div className="text-xl font-bold text-white">{selectedPlayer.total_games}</div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-4">
                    <div className="text-xs text-slate-500 mb-1">Unique Champions</div>
                    <div className="text-xl font-bold text-white">{selectedPlayer.unique_champions}</div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-4">
                    <div className="text-xs text-slate-500 mb-1">Last Played</div>
                    <div className="text-xl font-bold text-white">
                      {playerLastPlayed || 'N/A'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Disclaimer */}
              <div className="mb-4 px-3 py-2 bg-slate-900/50 rounded-lg border border-slate-700/30">
                <p className="text-xs text-slate-500 italic">
                  Statistics reflect historical professional play and are not predictive of future performance.
                </p>
              </div>

              {/* Champion Pool Table */}
              <div className="glass-card rounded-xl overflow-hidden">
                {/* Table Header */}
                <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-slate-700/50 text-xs font-semibold text-slate-400 bg-slate-800/30">
                  <div className="col-span-1 text-center">#</div>
                  <div className="col-span-3">Champion</div>
                  <div
                    className="col-span-2 text-center cursor-pointer hover:text-white transition-colors flex items-center justify-center gap-1"
                    onClick={() => handleSort('games')}
                  >
                    Games
                    {sortField === 'games' && (
                      <span>{sortDirection === 'desc' ? '↓' : '↑'}</span>
                    )}
                  </div>
                  <div
                    className="col-span-2 text-center cursor-pointer hover:text-white transition-colors flex items-center justify-center gap-1"
                    onClick={() => handleSort('win_rate')}
                  >
                    Win Rate
                    {sortField === 'win_rate' && (
                      <span>{sortDirection === 'desc' ? '↓' : '↑'}</span>
                    )}
                  </div>
                  <div
                    className="col-span-2 text-center cursor-pointer hover:text-white transition-colors flex items-center justify-center gap-1"
                    onClick={() => handleSort('avg_kda')}
                  >
                    KDA
                    {sortField === 'avg_kda' && (
                      <span>{sortDirection === 'desc' ? '↓' : '↑'}</span>
                    )}
                  </div>
                  <div
                    className="col-span-2 text-center cursor-pointer hover:text-white transition-colors flex items-center justify-center gap-1"
                    onClick={() => handleSort('last_played_patch')}
                  >
                    Last Patch
                    {sortField === 'last_played_patch' && (
                      <span>{sortDirection === 'desc' ? '↓' : '↑'}</span>
                    )}
                  </div>
                </div>

                {/* Table Body */}
                <div className="max-h-[55vh] overflow-y-auto">
                  {sortedChampions.map((champ, index) => {
                    const isStale = isStaleChampion(champ.patch_distance_to_target);

                    return (
                      <motion.div
                        key={champ.champion}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.02 }}
                        className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors items-center"
                      >
                        {/* Rank */}
                        <div className="col-span-1 text-center">
                          <span className={`font-mono text-sm ${index < 3 ? 'text-cyan-400 font-bold' : 'text-slate-500'}`}>
                            {index + 1}
                          </span>
                        </div>

                        {/* Champion + Stale Badge */}
                        <div className="col-span-3 flex items-center gap-2">
                          <span className="font-medium text-white">{champ.champion}</span>
                          {isStale && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30"
                              title={`Last played on patch ${champ.last_played_patch || 'N/A'} (${champ.patch_distance_to_target ?? '?'} patches ago, ${champ.days_since_last_played ?? '?'} days)`}
                            >
                              {champ.patch_distance_to_target}+ patches
                            </span>
                          )}
                        </div>

                        {/* Games */}
                        <div className="col-span-2 text-center">
                          <span className="font-mono text-sm font-bold text-white">
                            {champ.games}
                          </span>
                        </div>

                        {/* Win Rate */}
                        <div className="col-span-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${getWinRateBarColor(champ.win_rate)} transition-all`}
                                style={{ width: `${Math.min(champ.win_rate * 100, 100)}%` }}
                              />
                            </div>
                            <span className={`font-mono text-sm font-bold w-14 text-right ${getWinRateColor(champ.win_rate)}`}>
                              {(champ.win_rate * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>

                        {/* KDA */}
                        <div className="col-span-2 text-center">
                          <span className={`font-mono text-sm ${champ.avg_kda >= 3 ? 'text-green-400' : champ.avg_kda < 2 ? 'text-red-400' : 'text-slate-300'}`}>
                            {champ.avg_kda.toFixed(2)}
                          </span>
                        </div>

                        {/* Last Patch */}
                        <div className="col-span-2 text-center">
                          <span className={`font-mono text-xs ${isStale ? 'text-amber-400' : 'text-slate-400'}`}>
                            {champ.last_played_patch || 'N/A'}
                          </span>
                          {champ.days_since_last_played !== null && champ.days_since_last_played > 0 && (
                            <span className="text-slate-600 text-xs ml-1">
                              ({champ.days_since_last_played}d)
                            </span>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Table Footer */}
                <div className="px-4 py-3 border-t border-slate-700/50 bg-slate-800/30">
                  <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30">2+ patches</span>
                      = Not played in recent patches
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="text-green-400">Green</span> / <span className="text-red-400">Red</span> = WR ≥60% / ≤40%
                    </span>
                    <span className="flex items-center gap-1">
                      KDA: <span className="text-green-400">≥3.0</span> / <span className="text-red-400">&lt;2.0</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Info Note */}
              <div className="mt-4 p-4 bg-slate-800/30 rounded-lg text-xs text-slate-500">
                <p><strong className="text-slate-400">Career Pool:</strong> Raw historical statistics across all tracked patches. Use the "Last Patch" column and badge to identify champions that may be outdated in the current meta.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
