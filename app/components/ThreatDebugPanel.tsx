'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThreatSignal } from '../lib/threat-types';
import { type LeagueKey, LEAGUE_LABELS } from '../lib/league-types';

interface ThreatDebugPanelProps {
  isOpen: boolean;
  onClose: () => void;
  targetTeamId?: string;
  targetTeamName?: string;
  playerIds?: string[];
  playerNames?: Record<string, string>;
  league: LeagueKey;
}

/**
 * ThreatDebugPanel - 开发者调试面板
 *
 * 显示:
 * - Top 10 threats for team/player
 * - Context switcher (Global/league)
 */
export default function ThreatDebugPanel({
  isOpen,
  onClose,
  targetTeamId,
  targetTeamName,
  playerIds = [],
  playerNames = {},
  league,
}: ThreatDebugPanelProps) {
  const [activeTab, setActiveTab] = useState<'team' | 'players'>('team');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [contextMode, setContextMode] = useState<'specific' | 'global'>('specific');
  const [teamThreats, setTeamThreats] = useState<ThreatSignal[]>([]);
  const [playerThreats, setPlayerThreats] = useState<ThreatSignal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-switch to global context when league is 'global'
  useEffect(() => {
    if (league === 'global') {
      setContextMode('global');
    }
  }, [league]);

  // Fetch team threats
  useEffect(() => {
    if (!isOpen || !targetTeamId || activeTab !== 'team') return;

    const fetchTeamThreats = async () => {
      setLoading(true);
      setError(null);

      try {
        // Use 'global' when contextMode is global OR league is global
        const queryLeague = (contextMode === 'global' || league === 'global') ? 'global' : league;

        const response = await fetch('/api/threat-signals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            queryType: 'topTeam',
            targetTeamId,
            league: queryLeague,
            topK: 10,
          }),
        });

        const data = await response.json();
        if (data.success) {
          setTeamThreats(data.data.threats || []);
        } else {
          setError(data.error || 'Failed to fetch team threats');
        }
      } catch (err) {
        setError('Network error');
      } finally {
        setLoading(false);
      }
    };

    fetchTeamThreats();
  }, [isOpen, targetTeamId, activeTab, contextMode, league]);

  // Fetch player threats
  useEffect(() => {
    if (!isOpen || !selectedPlayerId || activeTab !== 'players') return;

    const fetchPlayerThreats = async () => {
      setLoading(true);
      setError(null);

      try {
        // Use 'global' when contextMode is global OR league is global
        const queryLeague = (contextMode === 'global' || league === 'global') ? 'global' : league;

        const response = await fetch('/api/threat-signals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            queryType: 'topPlayer',
            playerId: selectedPlayerId,
            league: queryLeague,
            topK: 10,
          }),
        });

        const data = await response.json();
        if (data.success) {
          setPlayerThreats(data.data.threats || []);
        } else {
          setError(data.error || 'Failed to fetch player threats');
        }
      } catch (err) {
        setError('Network error');
      } finally {
        setLoading(false);
      }
    };

    fetchPlayerThreats();
  }, [isOpen, selectedPlayerId, activeTab, contextMode, league]);

  // Set first player as selected when switching to players tab
  useEffect(() => {
    if (activeTab === 'players' && playerIds.length > 0 && !selectedPlayerId) {
      setSelectedPlayerId(playerIds[0]);
    }
  }, [activeTab, playerIds, selectedPlayerId]);

  if (!isOpen) return null;

  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

  // Get display label for league
  const leagueLabel = LEAGUE_LABELS[league];

  const renderThreatRow = (threat: ThreatSignal, index: number) => (
    <motion.div
      key={threat.championName}
      className="flex items-center gap-3 p-2 bg-gray-800/50 rounded-lg"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <span className="text-gray-500 text-xs w-4">{index + 1}</span>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <span className="text-white text-sm font-medium">{threat.championName}</span>
          <span className={`text-sm font-bold ${
            threat.score >= 70 ? 'text-red-400' :
            threat.score >= 40 ? 'text-orange-400' : 'text-gray-400'
          }`}>
            {threat.score.toFixed(0)}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
          <span>Obs: {formatPercent(threat.observed)}</span>
          <span>Exp: {formatPercent(threat.expected)}</span>
          <span>R: {threat.ratio.toFixed(2)}x</span>
          <span>Conf: {formatPercent(threat.confidence)}</span>
        </div>
      </div>
    </motion.div>
  );

  return (
    <AnimatePresence>
      <motion.div
        className="fixed right-4 top-20 z-40 w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-xl overflow-hidden"
        initial={{ opacity: 0, x: 100 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 100 }}
      >
        {/* Header */}
        <div className="bg-gray-800 px-3 py-2 flex items-center justify-between border-b border-gray-700">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
            <h3 className="text-sm font-medium text-white">Threat Debug Panel</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Context Switcher */}
        <div className="px-3 py-2 border-b border-gray-700 flex items-center gap-2">
          <span className="text-xs text-gray-400">Context:</span>
          <div className="flex gap-1">
            <button
              onClick={() => setContextMode('specific')}
              className={`px-2 py-0.5 text-xs rounded ${
                contextMode === 'specific'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              {leagueLabel}
            </button>
            <button
              onClick={() => setContextMode('global')}
              className={`px-2 py-0.5 text-xs rounded ${
                contextMode === 'global'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              Global
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('team')}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === 'team'
                ? 'text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Team ({targetTeamName || targetTeamId || 'N/A'})
          </button>
          <button
            onClick={() => setActiveTab('players')}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === 'players'
                ? 'text-white border-b-2 border-purple-500'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Players
          </button>
        </div>

        {/* Player Selector (for players tab) */}
        {activeTab === 'players' && playerIds.length > 0 && (
          <div className="px-3 py-2 border-b border-gray-700">
            <select
              value={selectedPlayerId || ''}
              onChange={(e) => setSelectedPlayerId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white"
            >
              {playerIds.map((id) => (
                <option key={id} value={id}>
                  {playerNames[id] || id}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Content */}
        <div className="p-3 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-400 text-sm">{error}</div>
          ) : activeTab === 'team' ? (
            teamThreats.length > 0 ? (
              <div className="space-y-2">
                {teamThreats.map((threat, i) => renderThreatRow(threat, i))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400 text-sm">
                No threat data for this team
              </div>
            )
          ) : (
            playerThreats.length > 0 ? (
              <div className="space-y-2">
                {playerThreats.map((threat, i) => renderThreatRow(threat, i))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400 text-sm">
                {selectedPlayerId ? 'No threat data for this player' : 'Select a player'}
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-800/50 px-3 py-1.5 border-t border-gray-700">
          <p className="text-[9px] text-gray-500 text-center">
            DEV ONLY - Historical ban pressure analysis
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
