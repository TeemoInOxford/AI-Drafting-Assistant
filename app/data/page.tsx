'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';

interface CountData {
  series: number;
  games: number;
  players: number;
  teams: number;
  tournaments: number;
  leagues: string[];
  regions: string[];
}

interface RegionData {
  code: string;
  name: string;
  leagues: LeagueData[];
}

interface LeagueData {
  name: string;
  tournaments: TournamentData[];
  rss?: Record<string, number>;
}

interface TournamentData {
  id: string;
  name: string;
  teams: TeamData[];
  seriesCount: number;
}

interface TeamData {
  id: string;
  name: string;
  players: PlayerData[];
  seriesCount: number;
}

interface PlayerData {
  id: string;
  name: string;
  seriesCount: number;
}

export default function DataPage() {
  const [count, setCount] = useState<CountData | null>(null);
  const [hierarchyData, setHierarchyData] = useState<RegionData[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedRegion, setSelectedRegion] = useState<RegionData | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<LeagueData | null>(null);
  const [selectedTournament, setSelectedTournament] = useState<TournamentData | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<TeamData | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/data/count').then(res => res.json()),
      fetch('/api/data/hierarchy').then(res => res.json()),
    ])
      .then(([countData, hierarchy]) => {
        if (countData.success) setCount(countData.data);
        if (hierarchy.success) setHierarchyData(hierarchy.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSelectRegion = (region: RegionData) => {
    setSelectedRegion(region);
    setSelectedLeague(null);
    setSelectedTournament(null);
    setSelectedTeam(null);
  };

  const handleSelectLeague = (league: LeagueData) => {
    setSelectedLeague(league);
    setSelectedTournament(null);
    setSelectedTeam(null);
  };

  const handleSelectTournament = (tournament: TournamentData) => {
    setSelectedTournament(tournament);
    setSelectedTeam(null);
  };

  const handleSelectTeam = (team: TeamData) => {
    setSelectedTeam(team);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white relative overflow-hidden selection:bg-cyan-500/30">
      {/* Background Grid */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:32px_32px]"></div>
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-6 py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                Data <span className="text-cyan-400">Source</span>
              </h1>
              <p className="text-slate-400 mt-2">
                Professional LOL esports data for AI drafting analysis
              </p>
            </div>
            <Link
              href="/"
              className="text-sm font-medium text-slate-400 hover:text-white transition-colors flex items-center gap-2"
            >
              <span>←</span> Back to Home
            </Link>
          </div>

          {/* Data Description */}
          <div className="bg-slate-800/30 rounded-lg p-4 mb-6 border border-slate-700/50">
            <p className="text-slate-400 text-sm">
              Browse the hierarchical structure of our professional esports database. Navigate through
              Regions → Leagues → Tournaments → Teams → Players to explore available match data.
              The <span className="text-orange-400 font-mono text-xs px-1 py-0.5 bg-orange-500/10 rounded">RSS</span> badge
              indicates the league's <span className="text-slate-300">Regional Strength Score</span> — a metric reflecting
              competitive strength used in weighting algorithms.
            </p>
          </div>

          {/* Stats Row */}
          {count && (
            <div className="flex flex-wrap gap-3">
              <StatBadge label="Series" value={count.series} color="cyan" />
              <StatBadge label="Games" value={count.games} color="blue" />
              <StatBadge label="Players" value={count.players} color="green" />
              <StatBadge label="Teams" value={count.teams} color="pink" />
              <StatBadge label="Tournaments" value={count.tournaments} color="yellow" />
              <StatBadge label="Regions" value={count.regions.length} color="purple" />
              <StatBadge label="Leagues" value={count.leagues.length} color="indigo" />
            </div>
          )}
        </motion.div>

        {/* Four Column Layout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {/* Column 1: Regions */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50">
              <h2 className="font-semibold text-cyan-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                Regions
              </h2>
            </div>
            <div className="p-2 max-h-[60vh] overflow-y-auto">
              {hierarchyData.map(region => {
                const totalSeries = region.leagues.reduce((sum, l) =>
                  sum + l.tournaments.reduce((s, t) => s + t.seriesCount, 0), 0);
                return (
                  <button
                    key={region.code}
                    onClick={() => handleSelectRegion(region)}
                    className={`w-full text-left p-3 rounded-xl mb-1 transition-all ${
                      selectedRegion?.code === region.code
                        ? 'bg-cyan-500/20 border border-cyan-500/50'
                        : 'hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{region.name}</span>
                      <span className="text-xs text-slate-500">{totalSeries} series</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {region.leagues.length} leagues
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Column 2: Leagues */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50">
              <h2 className="font-semibold text-blue-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                Leagues
              </h2>
            </div>
            <div className="p-2 max-h-[60vh] overflow-y-auto">
              {selectedRegion ? (
                selectedRegion.leagues.map(league => {
                  const totalSeries = league.tournaments.reduce((s, t) => s + t.seriesCount, 0);
                  // Get latest RSS value
                  const rssYears = league.rss ? Object.keys(league.rss).sort().reverse() : [];
                  const latestRss = rssYears.length > 0 ? league.rss![rssYears[0]] : null;
                  return (
                    <button
                      key={league.name}
                      onClick={() => handleSelectLeague(league)}
                      className={`w-full text-left p-3 rounded-xl mb-1 transition-all ${
                        selectedLeague?.name === league.name
                          ? 'bg-blue-500/20 border border-blue-500/50'
                          : 'hover:bg-slate-800/50 border border-transparent'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{league.name}</span>
                        <div className="flex items-center gap-2">
                          {latestRss && (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 font-mono cursor-help group relative"
                              title={`Regional Strength Score for ${rssYears[0]}`}
                            >
                              RSS {latestRss}
                              <span className="absolute right-0 top-full mt-1 hidden group-hover:block bg-slate-900 text-xs text-slate-300 p-2 rounded shadow-lg w-44 z-20 border border-slate-700 text-left font-sans">
                                Regional Strength Score ({rssYears[0]}) — used to weight team performance in cross-region comparisons.
                              </span>
                            </span>
                          )}
                          <span className="text-xs text-slate-500">{totalSeries} series</span>
                        </div>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {league.tournaments.length} tournaments
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="text-center py-12 text-slate-500 text-sm">
                  Select a region
                </div>
              )}
            </div>
          </div>

          {/* Column 3: Tournaments */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50">
              <h2 className="font-semibold text-yellow-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                Tournaments
              </h2>
            </div>
            <div className="p-2 max-h-[60vh] overflow-y-auto">
              {selectedLeague ? (
                selectedLeague.tournaments.map(tournament => (
                  <button
                    key={tournament.id}
                    onClick={() => handleSelectTournament(tournament)}
                    className={`w-full text-left p-3 rounded-xl mb-1 transition-all ${
                      selectedTournament?.id === tournament.id
                        ? 'bg-yellow-500/20 border border-yellow-500/50'
                        : 'hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    <div className="font-medium text-sm leading-tight">{tournament.name}</div>
                    <div className="flex gap-3 text-xs text-slate-500 mt-1">
                      <span>{tournament.teams.length} teams</span>
                      <span className="text-yellow-400">{tournament.seriesCount} series</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-center py-12 text-slate-500 text-sm">
                  Select a league
                </div>
              )}
            </div>
          </div>

          {/* Column 4: Teams & Players */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50">
              <h2 className="font-semibold text-pink-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-pink-400"></span>
                Teams & Players
              </h2>
            </div>
            <div className="p-2 max-h-[60vh] overflow-y-auto">
              {selectedTournament ? (
                <>
                  {selectedTournament.teams.map(team => (
                    <div key={team.id} className="mb-2">
                      <button
                        onClick={() => handleSelectTeam(selectedTeam?.id === team.id ? null as any : team)}
                        className={`w-full text-left p-3 rounded-xl transition-all ${
                          selectedTeam?.id === team.id
                            ? 'bg-pink-500/20 border border-pink-500/50'
                            : 'hover:bg-slate-800/50 border border-transparent'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-pink-300">{team.name}</span>
                          <span className="text-xs text-slate-500">{team.seriesCount} series</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {team.players.length} players
                        </div>
                      </button>

                      {/* Players (expanded) */}
                      {selectedTeam?.id === team.id && (
                        <div className="ml-3 mt-1 pl-3 border-l border-slate-700">
                          {team.players.map(player => (
                            <div
                              key={player.id}
                              className="py-2 px-3 text-sm flex justify-between items-center hover:bg-slate-800/30 rounded-lg"
                            >
                              <span className="text-green-300 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                                {player.name}
                              </span>
                              <span className="text-xs text-slate-500">{player.seriesCount} series</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              ) : (
                <div className="text-center py-12 text-slate-500 text-sm">
                  Select a tournament
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Breadcrumb */}
        {(selectedRegion || selectedLeague || selectedTournament) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 flex items-center gap-2 text-sm text-slate-400"
          >
            <span className="text-slate-600">Path:</span>
            {selectedRegion && (
              <span className="text-cyan-400">{selectedRegion.name}</span>
            )}
            {selectedLeague && (
              <>
                <span className="text-slate-600">→</span>
                <span className="text-blue-400">{selectedLeague.name}</span>
              </>
            )}
            {selectedTournament && (
              <>
                <span className="text-slate-600">→</span>
                <span className="text-yellow-400 max-w-[200px] truncate">{selectedTournament.name}</span>
              </>
            )}
            {selectedTeam && (
              <>
                <span className="text-slate-600">→</span>
                <span className="text-pink-400">{selectedTeam.name}</span>
              </>
            )}
            <button
              onClick={() => {
                setSelectedRegion(null);
                setSelectedLeague(null);
                setSelectedTournament(null);
                setSelectedTeam(null);
              }}
              className="ml-2 text-slate-500 hover:text-white transition-colors"
            >
              [Clear]
            </button>
          </motion.div>
        )}

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-slate-800 text-center text-slate-500 text-sm">
          <p>Data sourced from Grid.gg API • Updated regularly for professional LOL esports matches</p>
        </div>
      </div>
    </div>
  );
}

function StatBadge({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    green: 'bg-green-500/10 text-green-400 border-green-500/30',
    pink: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
    yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
  };

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm ${colorMap[color]}`}>
      <span className="font-bold">{value.toLocaleString()}</span>
      <span className="text-slate-400">{label}</span>
    </div>
  );
}
