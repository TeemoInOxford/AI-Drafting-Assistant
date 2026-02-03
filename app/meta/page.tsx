'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';

interface ChampionData {
  name: string;
  presence: number;
  pickRate: number;
  banRate: number;
}

interface MetaData {
  champions: ChampionData[];
  targetPatch: string;
  totalGames: number;
  totalWeight: number;
  presenceMode: string;
  countLabel: string;
  league: string;
}

type PresenceMode = 'union' | 'action-share';
type League = 'global' | 'LCK' | 'LPL' | 'LEC' | 'LCS' | 'LTA_N' | 'LTA_S';

const LEAGUES: { value: League; label: string }[] = [
  { value: 'global', label: 'Global' },
  { value: 'LCK', label: 'LCK' },
  { value: 'LPL', label: 'LPL' },
  { value: 'LEC', label: 'LEC' },
  { value: 'LCS', label: 'LCS' },
  { value: 'LTA_N', label: 'LTA North' },
  { value: 'LTA_S', label: 'LTA South' },
];

export default function MetaPage() {
  const [data, setData] = useState<MetaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [presenceMode, setPresenceMode] = useState<PresenceMode>('union');
  const [league, setLeague] = useState<League>('global');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/meta?mode=${presenceMode}&league=${league}`);
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        }
      } catch (error) {
        console.error('Failed to fetch meta data:', error);
      }
      setLoading(false);
    };

    fetchData();
  }, [presenceMode, league]);

  const getPresenceColor = (presence: number) => {
    if (presence >= 80) return 'text-red-400';
    if (presence >= 60) return 'text-orange-400';
    if (presence >= 40) return 'text-yellow-400';
    if (presence >= 20) return 'text-green-400';
    return 'text-slate-400';
  };

  const getPresenceBarColor = (presence: number) => {
    if (presence >= 80) return 'bg-red-500';
    if (presence >= 60) return 'bg-orange-500';
    if (presence >= 40) return 'bg-yellow-500';
    if (presence >= 20) return 'bg-green-500';
    return 'bg-slate-500';
  };

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
                Meta <span className="text-cyan-400">Overview</span>
              </h1>
              <p className="text-slate-400 mt-2">
                Champion presence statistics across professional matches
              </p>
            </div>
            <Link
              href="/"
              className="text-sm font-medium text-slate-400 hover:text-white transition-colors flex items-center gap-2"
            >
              <span>←</span> Back to Home
            </Link>
          </div>

          {/* Data Notice */}
          <div className="bg-slate-800/30 rounded-lg p-3 mb-6 border border-slate-700/50">
            <p className="text-slate-400 text-xs">
              Statistics are aggregated from recent professional matches and normalized by league.
              Data reflects observed patterns in competitive play and is updated regularly.
            </p>
          </div>

          {/* Stats Summary */}
          {data && (
            <div className="flex flex-wrap gap-4 items-center text-sm">
              <span className="text-slate-400">
                Patch: <span className="text-cyan-400 font-semibold">{data.targetPatch}</span>
              </span>
              <span className="text-slate-400">
                {data.countLabel === 'actions' ? 'Actions' : 'Games'}: <span className="text-white font-semibold">{data.totalGames?.toLocaleString()}</span>
              </span>
              <span className="text-slate-400">
                Champions: <span className="text-white font-semibold">{data.champions.length}</span>
              </span>

              {/* League Filter */}
              <div className="flex items-center gap-2">
                <span className="text-slate-500 text-xs">League:</span>
                <select
                  value={league}
                  onChange={(e) => setLeague(e.target.value as League)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1 text-xs font-medium text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 cursor-pointer"
                >
                  {LEAGUES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Presence Mode Toggle */}
              <div className="ml-auto flex items-center gap-2">
                <span className="text-slate-500 text-xs">Presence:</span>
                <div className="flex rounded-lg overflow-hidden border border-slate-700">
                  <button
                    onClick={() => setPresenceMode('union')}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      presenceMode === 'union'
                        ? 'bg-cyan-500/20 text-cyan-400'
                        : 'bg-transparent text-slate-400 hover:text-white'
                    }`}
                  >
                    Union
                  </button>
                  <button
                    onClick={() => setPresenceMode('action-share')}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      presenceMode === 'action-share'
                        ? 'bg-cyan-500/20 text-cyan-400'
                        : 'bg-transparent text-slate-400 hover:text-white'
                    }`}
                  >
                    Action
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400 mx-auto mb-4"></div>
              <p className="text-slate-400">Loading meta data...</p>
            </div>
          </div>
        )}

        {/* Champion Table */}
        {!loading && data && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-card rounded-2xl overflow-hidden"
          >
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-slate-700/50 text-sm font-semibold text-slate-400">
              <div className="col-span-1 text-center">#</div>
              <div className="col-span-3">Champion</div>
              <div className="col-span-4 group relative cursor-help">
                Presence %
                <span className="absolute left-0 top-full mt-1 hidden group-hover:block bg-slate-800 text-xs text-slate-300 p-2 rounded shadow-lg w-48 z-10 border border-slate-700">
                  Percentage of games where the champion was picked or banned
                </span>
              </div>
              <div className="col-span-2 text-center group relative cursor-help">
                Pick Rate
                <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 hidden group-hover:block bg-slate-800 text-xs text-slate-300 p-2 rounded shadow-lg w-40 z-10 border border-slate-700">
                  Percentage of games where the champion was picked
                </span>
              </div>
              <div className="col-span-2 text-center group relative cursor-help">
                Ban Rate
                <span className="absolute right-0 top-full mt-1 hidden group-hover:block bg-slate-800 text-xs text-slate-300 p-2 rounded shadow-lg w-40 z-10 border border-slate-700">
                  Percentage of games where the champion was banned
                </span>
              </div>
            </div>

            {/* Table Body */}
            <div className="max-h-[65vh] overflow-y-auto">
              {data.champions.map((champion, index) => (
                <motion.div
                  key={champion.name}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.01 }}
                  className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors items-center"
                >
                  {/* Rank */}
                  <div className="col-span-1 text-center">
                    <span className={`font-mono text-sm ${index < 3 ? 'text-cyan-400 font-bold' : 'text-slate-500'}`}>
                      {index + 1}
                    </span>
                  </div>

                  {/* Champion Name with Icon */}
                  <div className="col-span-3 flex items-center gap-2">
                    <img
                      src={`https://ddragon.leagueoflegends.com/cdn/14.1.1/img/champion/${champion.name.replace(/[^a-zA-Z]/g, '')}.png`}
                      alt={champion.name}
                      className="w-7 h-7 rounded"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <span className="font-medium">{champion.name}</span>
                  </div>

                  {/* Presence Bar */}
                  <div className="col-span-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${getPresenceBarColor(champion.presence)} transition-all duration-500`}
                          style={{ width: `${Math.min(champion.presence, 100)}%` }}
                        />
                      </div>
                      <span className={`font-mono text-sm font-semibold w-16 text-right ${getPresenceColor(champion.presence)}`}>
                        {champion.presence.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Pick Rate */}
                  <div className="col-span-2 text-center">
                    <span className="text-green-400 font-mono text-sm">
                      {champion.pickRate.toFixed(1)}%
                    </span>
                  </div>

                  {/* Ban Rate */}
                  <div className="col-span-2 text-center">
                    <span className="text-red-400 font-mono text-sm">
                      {champion.banRate.toFixed(1)}%
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Empty State */}
        {!loading && data && data.champions.length === 0 && (
          <div className="text-center py-20 text-slate-500">
            No data available.
          </div>
        )}
      </div>
    </div>
  );
}
