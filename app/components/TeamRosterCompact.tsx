'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ProPlayer, MatchRosterState, Position } from '../lib/types';

interface TeamRosterCompactProps {
  rosterState: MatchRosterState;
  onRosterStateChange: (state: MatchRosterState) => void;
}

const POSITIONS: Position[] = ['top', 'jungle', 'mid', 'bot', 'support'];

const positionLabels: Record<Position, string> = {
  top: 'Top',
  jungle: 'Jungle',
  mid: 'Mid',
  bot: 'ADC',
  support: 'Support',
};

export default function TeamRosterCompact({
  rosterState,
  onRosterStateChange,
}: TeamRosterCompactProps) {
  const [showRoster, setShowRoster] = useState(false);
  const [activeSlot, setActiveSlot] = useState<{ team: 'blue' | 'red'; position: number } | null>(null);
  const [activeTeamSelect, setActiveTeamSelect] = useState<'blue' | 'red' | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<{ players: ProPlayer[]; teams: { id: string; name: string }[] }>({ players: [], teams: [] });
  const [isSearching, setIsSearching] = useState(false);
  const [popularTeams, setPopularTeams] = useState<{ id: string; name: string }[]>([]);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load popular teams when team select dropdown opens
  useEffect(() => {
    if (activeTeamSelect && popularTeams.length === 0) {
      fetch('/api/lol/hierarchy?type=all-teams')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.teams) {
            setPopularTeams(data.teams.slice(0, 20).map((t: any) => ({ id: t.id, name: t.name })));
          }
        })
        .catch(e => console.error('Failed to load teams:', e));
    }
  }, [activeTeamSelect, popularTeams.length]);

  // Search players from API
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchTerm || searchTerm.length < 2) {
      if (!searchTerm) {
        setSearchResults({ players: [], teams: [] });
      }
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/lol/hierarchy?type=search&q=${encodeURIComponent(searchTerm)}`);
        const data = await res.json();
        if (data.success) {
          setSearchResults({
            players: data.players || [],
            teams: data.teams || [],
          });
        }
      } catch (e) {
        console.error('Search failed:', e);
      }
      setIsSearching(false);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  const panelRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveSlot(null);
        setActiveTeamSelect(null);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close roster panels when clicking outside
  useEffect(() => {
    if (!showRoster) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      // Check if click is outside both panels and toggle button
      const panels = document.querySelectorAll('[data-roster-panel]');
      const toggleButton = document.querySelector('[data-roster-toggle]');

      let isOutside = true;
      panels.forEach(panel => {
        if (panel.contains(target)) {
          isOutside = false;
        }
      });

      if (toggleButton && toggleButton.contains(target)) {
        isOutside = false;
      }

      if (isOutside) {
        setShowRoster(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showRoster]);

  const handleSelectPlayer = (player: ProPlayer) => {
    if (!activeSlot) return;

    const teamKey = activeSlot.team === 'blue' ? 'blueTeam' : 'redTeam';
    const newPlayers = [...rosterState[teamKey].players];
    newPlayers[activeSlot.position] = player;

    onRosterStateChange({
      ...rosterState,
      [teamKey]: {
        ...rosterState[teamKey],
        players: newPlayers,
      },
    });

    setActiveSlot(null);
    setSearchTerm('');
  };

  const handleSelectTeam = async (teamId: string, teamName: string, targetTeam: 'blue' | 'red') => {
    try {
      // Fetch team players - use 'team' parameter instead of 'id'
      const playersRes = await fetch(`/api/lol/hierarchy?type=team&team=${teamId}`);
      const playersData = await playersRes.json();

      if (playersData.success && playersData.players && playersData.players.length > 0) {
        const teamKey = targetTeam === 'blue' ? 'blueTeam' : 'redTeam';
        // Map API response to ProPlayer format (nickname -> name)
        const players = playersData.players.slice(0, 5).map((p: any) => ({
          id: p.id,
          name: p.nickname,
          teamId: teamId,
          teamName: teamName,
          seriesCount: p.seriesCount
        }));
        const filledPlayers = [...players, ...Array(5 - players.length).fill(null)];

        onRosterStateChange({
          ...rosterState,
          [teamKey]: {
            teamName: teamName,
            teamLogo: playersData.team?.logoUrl || null,
            players: filledPlayers,
          },
        });

        setActiveTeamSelect(null);
        setSearchTerm('');
      }
    } catch (e) {
      console.error('Failed to load team:', e);
    }
  };

  const handleClearSlot = (team: 'blue' | 'red', position: number) => {
    const teamKey = team === 'blue' ? 'blueTeam' : 'redTeam';
    const newPlayers = [...rosterState[teamKey].players];
    newPlayers[position] = null;

    onRosterStateChange({
      ...rosterState,
      [teamKey]: {
        ...rosterState[teamKey],
        players: newPlayers,
      },
    });
  };

  const renderPlayerSlot = (team: 'blue' | 'red', position: number) => {
    const teamKey = team === 'blue' ? 'blueTeam' : 'redTeam';
    const player = rosterState[teamKey].players[position];
    const isActive = activeSlot?.team === team && activeSlot?.position === position;
    const posLabel = positionLabels[POSITIONS[position]];

    return (
      <div key={`${team}-${position}`} className="mb-3 group cursor-pointer relative">
        <div className="text-[10px] text-slate-500 mb-1 flex justify-between">
          <span className="uppercase tracking-wider">{posLabel}</span>
          {player && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleClearSlot(team, position);
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-rose-400 hover:text-rose-300 text-[10px]"
            >
              CLEAR
            </button>
          )}
        </div>
        <div
          onClick={() => setActiveSlot(isActive ? null : { team, position })}
          className={`p-2 bg-slate-800/50 border rounded flex items-center gap-3 transition-all duration-300 ${
            isActive
              ? team === 'blue'
                ? 'border-cyan-500/50 bg-cyan-500/10'
                : 'border-rose-500/50 bg-rose-500/10'
              : 'border-white/5 hover:border-white/20'
          }`}
        >
          <div className="w-8 h-8 rounded-full bg-slate-700 overflow-hidden flex-shrink-0">
            {player ? (
              <div className="w-full h-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-xs font-bold text-slate-400">
                {player?.name?.substring(0, 2).toUpperCase() || '??'}
              </div>
            ) : (
              <div className="w-full h-full bg-slate-800 opacity-30" />
            )}
          </div>
          <span className="text-sm font-medium text-slate-300 truncate">
            {player ? player.name : 'Select Player'}
          </span>
        </div>

        {/* Search dropdown */}
        <AnimatePresence>
          {isActive && (
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-900 border border-white/20 rounded-lg shadow-xl overflow-hidden"
            >
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search player..."
                className="w-full px-3 py-2 bg-transparent border-b border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none"
                autoFocus
              />
              <div className="max-h-48 overflow-y-auto">
                {isSearching ? (
                  <div className="p-3 text-center text-gray-500 text-sm">Searching...</div>
                ) : searchResults.players.length > 0 ? (
                  searchResults.players.slice(0, 10).map((p) => (
                    <div
                      key={p.id}
                      onClick={() => handleSelectPlayer(p)}
                      className="px-3 py-2 hover:bg-white/10 cursor-pointer transition-colors"
                    >
                      <div className="text-sm text-white">{p.name}</div>
                      {p.teamName && <div className="text-[10px] text-gray-500">{p.teamName}</div>}
                    </div>
                  ))
                ) : searchTerm.length >= 2 ? (
                  <div className="p-3 text-center text-gray-500 text-sm">No players found</div>
                ) : (
                  <div className="p-3 text-center text-gray-500 text-sm">Type at least 2 characters</div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        data-roster-toggle
        onClick={() => setShowRoster(!showRoster)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-all duration-300 ${
          showRoster
            ? 'bg-white/10 border-white/30 text-white shadow-lg'
            : 'border-white/10 text-slate-400 hover:text-white hover:border-white/20'
        }`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <span className="text-xs font-bold uppercase tracking-wider">Rosters</span>
      </button>

      {/* Blue Team Roster Panel (Left) */}
      <AnimatePresence>
        {showRoster && (
          <motion.aside
            data-roster-panel
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed left-0 top-16 bottom-0 z-40 w-64 bg-slate-900/95 backdrop-blur-xl border-r border-white/10 flex flex-col shadow-2xl"
          >
            <div className="p-4 border-b border-white/5">
              <div className="flex items-center justify-between mb-4 relative">
                <h3 className="text-cyan-400 text-xs font-bold uppercase tracking-widest">Blue Roster</h3>
                <button
                  onClick={() => {
                    setActiveTeamSelect(activeTeamSelect === 'blue' ? null : 'blue');
                    setSearchTerm('');
                  }}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 px-2 py-1 rounded transition-colors"
                >
                  SELECT TEAM
                </button>

                {/* Team Search Dropdown */}
                <AnimatePresence>
                  {activeTeamSelect === 'blue' && (
                    <motion.div
                      ref={dropdownRef}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute z-50 top-full right-0 mt-1 w-48 bg-slate-900 border border-white/20 rounded-lg shadow-xl overflow-hidden"
                    >
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search team..."
                        className="w-full px-3 py-2 bg-transparent border-b border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none"
                        autoFocus
                      />
                      <div className="max-h-48 overflow-y-auto">
                        {isSearching ? (
                          <div className="p-3 text-center text-gray-500 text-sm">Searching...</div>
                        ) : searchTerm.length >= 2 && searchResults.teams.length > 0 ? (
                          searchResults.teams.slice(0, 10).map((t) => (
                            <div
                              key={t.id}
                              onClick={() => handleSelectTeam(t.id, t.name, 'blue')}
                              className="px-3 py-2 hover:bg-white/10 cursor-pointer transition-colors"
                            >
                              <div className="text-sm text-white">{t.name}</div>
                            </div>
                          ))
                        ) : searchTerm.length >= 2 ? (
                          <div className="p-3 text-center text-gray-500 text-sm">No teams found</div>
                        ) : popularTeams.length > 0 ? (
                          popularTeams.map((t) => (
                            <div
                              key={t.id}
                              onClick={() => handleSelectTeam(t.id, t.name, 'blue')}
                              className="px-3 py-2 hover:bg-white/10 cursor-pointer transition-colors"
                            >
                              <div className="text-sm text-white">{t.name}</div>
                            </div>
                          ))
                        ) : (
                          <div className="p-3 text-center text-gray-500 text-sm">Loading teams...</div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {POSITIONS.map((_, idx) => renderPlayerSlot('blue', idx))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Red Team Roster Panel (Right) */}
      <AnimatePresence>
        {showRoster && (
          <motion.aside
            data-roster-panel
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed right-0 top-16 bottom-0 z-40 w-64 bg-slate-900/95 backdrop-blur-xl border-l border-white/10 flex flex-col shadow-2xl"
          >
            <div className="p-4 border-b border-white/5">
              <div className="flex items-center justify-between mb-4 flex-row-reverse relative">
                <h3 className="text-rose-400 text-xs font-bold uppercase tracking-widest">Red Roster</h3>
                <button
                  onClick={() => {
                    setActiveTeamSelect(activeTeamSelect === 'red' ? null : 'red');
                    setSearchTerm('');
                  }}
                  className="text-[10px] text-rose-400 hover:text-rose-300 border border-rose-500/30 px-2 py-1 rounded transition-colors"
                >
                  SELECT TEAM
                </button>

                {/* Team Search Dropdown */}
                <AnimatePresence>
                  {activeTeamSelect === 'red' && (
                    <motion.div
                      ref={dropdownRef}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute z-50 top-full left-0 mt-1 w-48 bg-slate-900 border border-white/20 rounded-lg shadow-xl overflow-hidden"
                    >
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search team..."
                        className="w-full px-3 py-2 bg-transparent border-b border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none"
                        autoFocus
                      />
                      <div className="max-h-48 overflow-y-auto">
                        {isSearching ? (
                          <div className="p-3 text-center text-gray-500 text-sm">Searching...</div>
                        ) : searchTerm.length >= 2 && searchResults.teams.length > 0 ? (
                          searchResults.teams.slice(0, 10).map((t) => (
                            <div
                              key={t.id}
                              onClick={() => handleSelectTeam(t.id, t.name, 'red')}
                              className="px-3 py-2 hover:bg-white/10 cursor-pointer transition-colors"
                            >
                              <div className="text-sm text-white">{t.name}</div>
                            </div>
                          ))
                        ) : searchTerm.length >= 2 ? (
                          <div className="p-3 text-center text-gray-500 text-sm">No teams found</div>
                        ) : popularTeams.length > 0 ? (
                          popularTeams.map((t) => (
                            <div
                              key={t.id}
                              onClick={() => handleSelectTeam(t.id, t.name, 'red')}
                              className="px-3 py-2 hover:bg-white/10 cursor-pointer transition-colors"
                            >
                              <div className="text-sm text-white">{t.name}</div>
                            </div>
                          ))
                        ) : (
                          <div className="p-3 text-center text-gray-500 text-sm">Loading teams...</div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {POSITIONS.map((_, idx) => (
                <div key={idx} className="mb-3 group cursor-pointer relative">
                  <div className="text-[10px] text-slate-500 mb-1 text-right flex justify-between flex-row-reverse">
                    <span className="uppercase tracking-wider">{positionLabels[POSITIONS[idx]]}</span>
                    {rosterState.redTeam.players[idx] && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClearSlot('red', idx);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-rose-400 hover:text-rose-300 text-[10px]"
                      >
                        CLEAR
                      </button>
                    )}
                  </div>
                  {renderPlayerSlot('red', idx)}
                </div>
              ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
