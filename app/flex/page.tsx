'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import FlexChampionCard from '@/app/components/FlexChampionCard';
import ContextFilter from '@/app/components/ContextFilter';
import { type LeagueKey, LEAGUE_LABELS } from '@/app/lib/league-types';

interface RoleCounts {
  top: number;
  jungle: number;
  mid: number;
  bot: number;
  support: number;
}

interface RoleProbabilities {
  top: number;
  jungle: number;
  mid: number;
  bot: number;
  support: number;
}

interface FlexChampion {
  champion_name: string;
  champion_id: string;
  flexibilityScore: number;
  role_probabilities: RoleProbabilities;
  raw_counts_by_role: RoleCounts;
  effective_sample_size: number;
  usedGlobalFallback?: boolean;
}

interface FlexResponse {
  count: number;
  league: string;
  leagueTotalGames?: number;
  champions: FlexChampion[];
}

interface MetadataResponse {
  generated_at_utc: string;
  target_patch: string;
  total_champions: number;
  total_effective_weight: number;
  parameters: {
    beta: number;
    gamma: number;
    kappa: number;
    team_weight_sensitivity: number;
    delta_patch_cap: number;
  };
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function FlexPage() {
  // League state
  const [selectedLeague, setSelectedLeague] = useState<LeagueKey>('global');

  // Filter state
  const [minScore, setMinScore] = useState(0.35);
  const [minEss, setMinEss] = useState(5);
  const [maxRoles, setMaxRoles] = useState(3);
  const [limit, setLimit] = useState(50);
  const [sortBy, setSortBy] = useState<'flexibilityScore' | 'effective_sample_size' | 'name'>('flexibilityScore');

  // Data state
  const [champions, setChampions] = useState<FlexChampion[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [fallbackCount, setFallbackCount] = useState(0);
  const [leagueInfo, setLeagueInfo] = useState<{ league: string; totalGames?: number } | null>(null);
  const [metadata, setMetadata] = useState<MetadataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce filter values
  const debouncedMinScore = useDebounce(minScore, 300);
  const debouncedMinEss = useDebounce(minEss, 300);
  const debouncedMaxRoles = useDebounce(maxRoles, 300);

  // Fetch metadata once
  useEffect(() => {
    async function fetchMetadata() {
      try {
        const res = await fetch('/api/roles/metadata');
        if (res.ok) {
          const data = await res.json();
          setMetadata(data);
        }
      } catch (err) {
        console.error('Failed to fetch metadata:', err);
      }
    }
    fetchMetadata();
  }, []);

  // Fetch flex champions
  const fetchChampions = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFallbackCount(0);

    try {
      const params = new URLSearchParams({
        minScore: debouncedMinScore.toString(),
        minEss: debouncedMinEss.toString(),
        maxRoles: debouncedMaxRoles.toString(),
        limit: limit.toString(),
        league: selectedLeague,
      });

      const res = await fetch(`/api/roles/flex?${params}`);
      if (!res.ok) {
        throw new Error('Failed to fetch flex champions');
      }

      const data: FlexResponse = await res.json();
      setChampions(data.champions);
      setTotalCount(data.count);
      setLeagueInfo({
        league: data.league,
        totalGames: data.leagueTotalGames,
      });
      // Calculate fallback count from response
      const fc = data.champions.filter(c => c.usedGlobalFallback).length;
      setFallbackCount(fc);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setChampions([]);
      setFallbackCount(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedMinScore, debouncedMinEss, debouncedMaxRoles, limit, selectedLeague]);

  useEffect(() => {
    fetchChampions();
  }, [fetchChampions]);

  // Sort champions locally
  const sortedChampions = useMemo(() => {
    const sorted = [...champions];
    switch (sortBy) {
      case 'flexibilityScore':
        sorted.sort((a, b) => b.flexibilityScore - a.flexibilityScore);
        break;
      case 'effective_sample_size':
        sorted.sort((a, b) => b.effective_sample_size - a.effective_sample_size);
        break;
      case 'name':
        sorted.sort((a, b) => a.champion_name.localeCompare(b.champion_name));
        break;
    }
    return sorted;
  }, [champions, sortBy]);

  // Format date
  const formatDate = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="bg-slate-800/50 border-b border-slate-700/50">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Flex Pick Dashboard</h1>
              <p className="text-slate-400 mt-1 text-sm">
                Multi-role champions in professional play · Weighted posterior distribution
              </p>
            </div>
            {/* League Filter */}
            <ContextFilter
              selectedLeague={selectedLeague}
              onLeagueChange={setSelectedLeague}
            />
          </div>
          {/* Data Notice */}
          <div className="mt-4 bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
            <p className="text-slate-400 text-xs">
              Probabilities are inferred from historical role posteriors in professional matches.
              Higher Flex Score indicates greater role diversity observed in competitive play.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* League Fallback Banner */}
        {selectedLeague !== 'global' && (
          <div
            className={`rounded-lg p-3 mb-4 flex items-center gap-3 border ${
              fallbackCount > 0
                ? 'bg-amber-500/10 border-amber-500/30'
                : 'bg-slate-800/30 border-slate-700/50'
            }`}
          >
            <div className="text-sm">
              <span className={`font-medium ${fallbackCount > 0 ? 'text-amber-300' : 'text-slate-300'}`}>
                League: {LEAGUE_LABELS[selectedLeague] || selectedLeague}
              </span>
              {leagueInfo?.totalGames && (
                <span className="text-slate-400 ml-2">
                  ({leagueInfo.totalGames.toLocaleString()} games)
                </span>
              )}
              {fallbackCount > 0 ? (
                <span className="text-amber-400 ml-3">
                  · ⚠ {fallbackCount} champion{fallbackCount > 1 ? 's' : ''} using Global fallback (low sample)
                </span>
              ) : (
                <span className="text-slate-500 ml-3">
                  · League-specific data in use
                </span>
              )}
            </div>
          </div>
        )}

        {/* Metadata Bar */}
        {metadata && (
          <div className="bg-slate-800/30 rounded-lg p-3 mb-6 flex flex-wrap items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-6 text-slate-400">
              <span>
                Updated: <span className="text-slate-300">{formatDate(metadata.generated_at_utc)}</span>
              </span>
              <span>
                Target Patch: <span className="text-slate-300">{metadata.target_patch}</span>
              </span>
              <span>
                Champions: <span className="text-slate-300">{metadata.total_champions}</span>
              </span>
            </div>
            <div className="text-[11px] text-slate-500">
              β={metadata.parameters.beta} γ={metadata.parameters.gamma} κ={metadata.parameters.kappa}
            </div>
          </div>
        )}

        {/* Filter Panel */}
        <div className="bg-slate-800/50 rounded-lg p-4 mb-6 border border-slate-700/50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-300">Filters</h2>
            <span className="text-xs text-slate-500">
              Matching: {loading ? '...' : totalCount}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Min Score */}
            <div>
              <label className="block text-[11px] text-slate-500 uppercase tracking-wide mb-1">
                Min Flex Score
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={minScore}
                  onChange={(e) => setMinScore(parseFloat(e.target.value))}
                  className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-sm text-slate-300 w-12 text-right">{minScore.toFixed(2)}</span>
              </div>
            </div>

            {/* Min ESS */}
            <div>
              <label className="block text-[11px] text-slate-500 uppercase tracking-wide mb-1">
                Min ESS
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="1"
                  value={minEss}
                  onChange={(e) => setMinEss(parseInt(e.target.value))}
                  className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-sm text-slate-300 w-12 text-right">{minEss}</span>
              </div>
            </div>

            {/* Max Roles */}
            <div>
              <label className="block text-[11px] text-slate-500 uppercase tracking-wide mb-1">
                Max Observed Roles
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={maxRoles}
                  onChange={(e) => setMaxRoles(parseInt(e.target.value))}
                  className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-sm text-slate-300 w-12 text-right">{maxRoles}</span>
              </div>
            </div>

            {/* Limit */}
            <div>
              <label className="block text-[11px] text-slate-500 uppercase tracking-wide mb-1">
                Display Limit
              </label>
              <select
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-300"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            {/* Sort */}
            <div>
              <label className="block text-[11px] text-slate-500 uppercase tracking-wide mb-1">
                Sort By
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-300"
              >
                <option value="flexibilityScore">Flex Score ↓</option>
                <option value="effective_sample_size">ESS ↓</option>
                <option value="name">Name A-Z</option>
              </select>
            </div>
          </div>

          {/* Explanation */}
          <div className="mt-4 p-3 bg-slate-900/50 rounded text-[11px] text-slate-500">
            <strong className="text-slate-400">Flex criteria:</strong>{' '}
            flexibilityScore ≥ {minScore.toFixed(2)}, ESS ≥ {minEss}, observed roles ≤ {maxRoles}
          </div>
        </div>

        {/* Champion List */}
        {error ? (
          <div className="text-center py-12 text-red-400">
            {error}
          </div>
        ) : loading ? (
          <div className="text-center py-12 text-slate-500">
            <div className="animate-spin w-8 h-8 border-2 border-slate-600 border-t-slate-300 rounded-full mx-auto mb-4"></div>
            Loading...
          </div>
        ) : sortedChampions.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            No champions match the current filters
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {sortedChampions.map((champion, idx) => (
              <FlexChampionCard
                key={champion.champion_id}
                champion={champion}
                rank={sortBy === 'flexibilityScore' ? idx + 1 : undefined}
                showFallbackWarning={champion.usedGlobalFallback}
              />
            ))}
          </motion.div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-slate-600">
          <p>Data source: GRID Esports API · Professional match data</p>
          <p className="mt-1">
            Flex pick determination based on weighted posterior distribution (β-patch decay, γ-maturity, team weight)
          </p>
        </div>
      </footer>
    </div>
  );
}
