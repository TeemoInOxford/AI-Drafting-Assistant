'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Language, ProPlayer, TeamRoster, MatchRosterState, Position } from '../lib/types';

interface TeamRosterSetupProps {
  language: Language;
  rosterState: MatchRosterState;
  onRosterStateChange: (state: MatchRosterState) => void;
}

const POSITIONS: Position[] = ['top', 'jungle', 'mid', 'bot', 'support'];

const positionLabels: Record<Position, { zh: string; en: string }> = {
  top: { zh: '上单', en: 'Top' },
  jungle: { zh: '打野', en: 'Jungle' },
  mid: { zh: '中单', en: 'Mid' },
  bot: { zh: 'ADC', en: 'ADC' },
  support: { zh: '辅助', en: 'Support' },
};

interface SearchResult {
  players: ProPlayer[];
  teams: { id: string; name: string }[];
}

export default function TeamRosterSetup({
  language,
  rosterState,
  onRosterStateChange,
}: TeamRosterSetupProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult>({ players: [], teams: [] });
  const [isSearching, setIsSearching] = useState(false);
  const [activeSlot, setActiveSlot] = useState<{ team: 'blue' | 'red'; position: number } | null>(null);
  const [showTeamSelect, setShowTeamSelect] = useState<'blue' | 'red' | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Search players/teams from API
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchTerm || searchTerm.length < 2) {
      setSearchResults({ players: [], teams: [] });
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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveSlot(null);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = () => {
    onRosterStateChange({
      ...rosterState,
      enabled: !rosterState.enabled,
    });
  };

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

  const handleSelectTeam = async (teamId: string, teamName: string, side: 'blue' | 'red') => {
    try {
      const res = await fetch(`/api/lol/hierarchy?type=team&team=${teamId}`);
      const data = await res.json();
      if (data.success && data.players) {
        const teamKey = side === 'blue' ? 'blueTeam' : 'redTeam';
        // Take first 5 players (or fill with null)
        const players: (ProPlayer | null)[] = [];
        for (let i = 0; i < 5; i++) {
          if (data.players[i]) {
            players.push({
              id: data.players[i].id,
              name: data.players[i].nickname,
              teamId: teamId,
              teamName: teamName,
              seriesCount: data.players[i].seriesCount,
            });
          } else {
            players.push(null);
          }
        }

        onRosterStateChange({
          ...rosterState,
          [teamKey]: {
            teamName: teamName,
            players: players,
          },
        });
      }
    } catch (e) {
      console.error('Failed to load team:', e);
    }
    setShowTeamSelect(null);
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

  const handleTeamNameChange = (team: 'blue' | 'red', name: string) => {
    const teamKey = team === 'blue' ? 'blueTeam' : 'redTeam';
    onRosterStateChange({
      ...rosterState,
      [teamKey]: {
        ...rosterState[teamKey],
        teamName: name,
      },
    });
  };

  const renderPlayerSlot = (team: 'blue' | 'red', position: number) => {
    const teamKey = team === 'blue' ? 'blueTeam' : 'redTeam';
    const player = rosterState[teamKey].players[position];
    const isActive = activeSlot?.team === team && activeSlot?.position === position;
    const posLabel = positionLabels[POSITIONS[position]][language];
    const borderColor = team === 'blue' ? 'border-blue-500/50' : 'border-red-500/50';
    const bgColor = team === 'blue' ? 'bg-blue-500/10' : 'bg-red-500/10';
    const hoverBg = team === 'blue' ? 'hover:bg-blue-500/20' : 'hover:bg-red-500/20';

    return (
      <div key={`${team}-${position}`} className="relative">
        <div
          onClick={() => setActiveSlot(isActive ? null : { team, position })}
          className={`
            flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all
            ${borderColor} ${bgColor} ${hoverBg}
            ${isActive ? 'ring-2 ring-white/50' : ''}
          `}
        >
          <span className="text-[10px] text-gray-400 w-12 shrink-0">{posLabel}</span>
          {player ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-sm text-white truncate">{player.name}</span>
              {player.teamName && (
                <span className="text-[10px] text-gray-500 truncate hidden sm:inline">
                  ({player.teamName})
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleClearSlot(team, position);
                }}
                className="ml-auto text-gray-500 hover:text-red-400 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <span className="text-xs text-gray-500">
              {language === 'zh' ? '点击选择选手' : 'Click to select'}
            </span>
          )}
        </div>

        {/* Search dropdown */}
        <AnimatePresence>
          {isActive && (
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-900 border border-white/20 rounded-lg shadow-xl overflow-hidden"
            >
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={language === 'zh' ? '搜索选手名...' : 'Search player name...'}
                className="w-full px-3 py-2 bg-transparent border-b border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none"
                autoFocus
              />
              <div className="max-h-48 overflow-y-auto">
                {isSearching ? (
                  <div className="p-3 text-center text-gray-500 text-sm">
                    {language === 'zh' ? '搜索中...' : 'Searching...'}
                  </div>
                ) : searchResults.players.length > 0 ? (
                  searchResults.players.slice(0, 10).map((p) => (
                    <div
                      key={p.id}
                      onClick={() => handleSelectPlayer(p)}
                      className="px-3 py-2 hover:bg-white/10 cursor-pointer transition-colors"
                    >
                      <div className="text-sm text-white">{p.name}</div>
                      {p.teamName && (
                        <div className="text-[10px] text-gray-500">{p.teamName}</div>
                      )}
                    </div>
                  ))
                ) : searchTerm.length >= 2 ? (
                  <div className="p-3 text-center text-gray-500 text-sm">
                    {language === 'zh' ? '未找到选手' : 'No players found'}
                  </div>
                ) : (
                  <div className="p-3 text-center text-gray-500 text-sm">
                    {language === 'zh' ? '输入至少2个字符' : 'Type at least 2 characters'}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const renderTeamSection = (team: 'blue' | 'red') => {
    const teamKey = team === 'blue' ? 'blueTeam' : 'redTeam';
    const teamColor = team === 'blue' ? 'text-blue-400' : 'text-red-400';
    const borderColor = team === 'blue' ? 'border-blue-500/30' : 'border-red-500/30';

    return (
      <div className={`flex-1 border ${borderColor} rounded-lg p-3`}>
        <div className="flex items-center gap-2 mb-3">
          <span className={`w-3 h-3 rounded-full ${team === 'blue' ? 'bg-blue-500' : 'bg-red-500'}`}></span>
          <input
            type="text"
            value={rosterState[teamKey].teamName}
            onChange={(e) => handleTeamNameChange(team, e.target.value)}
            placeholder={language === 'zh' ? (team === 'blue' ? '蓝方队名' : '红方队名') : (team === 'blue' ? 'Blue Team' : 'Red Team')}
            className={`bg-transparent text-sm font-medium ${teamColor} placeholder-gray-600 focus:outline-none flex-1`}
          />
          <button
            onClick={() => setShowTeamSelect(showTeamSelect === team ? null : team)}
            className="text-[10px] px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-gray-300 transition-colors"
          >
            {language === 'zh' ? '选战队' : 'Select Team'}
          </button>
        </div>

        {/* Team select dropdown */}
        <AnimatePresence>
          {showTeamSelect === team && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-3"
            >
              <TeamSearchDropdown
                language={language}
                onSelect={(teamId, teamName) => handleSelectTeam(teamId, teamName, team)}
                onClose={() => setShowTeamSelect(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-2">
          {POSITIONS.map((_, idx) => renderPlayerSlot(team, idx))}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-gradient-to-br from-emerald-900/30 to-teal-900/30 rounded-xl p-3 sm:p-4 border border-emerald-500/30 mb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">👥</span>
          <h3 className="text-white font-bold text-sm sm:text-base">
            {language === 'zh' ? '选手配置' : 'Team Roster'}
          </h3>
        </div>

        {/* Toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs sm:text-sm text-gray-400">
            {rosterState.enabled
              ? (language === 'zh' ? '已启用' : 'Enabled')
              : (language === 'zh' ? '已关闭' : 'Disabled')}
          </span>
          <div
            className={`w-10 h-5 rounded-full transition-colors ${rosterState.enabled ? 'bg-emerald-500' : 'bg-gray-600'}`}
            onClick={handleToggle}
          >
            <motion.div
              className="w-4 h-4 bg-white rounded-full mt-0.5"
              animate={{ marginLeft: rosterState.enabled ? '22px' : '2px' }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </div>
        </label>
      </div>

      <AnimatePresence>
        {rosterState.enabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <p className="text-xs text-gray-400 mb-3">
              {language === 'zh'
                ? '配置双方战队的首发阵容，用于后续英雄池权重计算'
                : 'Configure starting rosters for champion pool weighting'}
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              {renderTeamSection('blue')}
              {renderTeamSection('red')}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Team search dropdown component
function TeamSearchDropdown({
  language,
  onSelect,
  onClose,
}: {
  language: Language;
  onSelect: (teamId: string, teamName: string) => void;
  onClose: () => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [teams, setTeams] = useState<{ id: string; name: string; seriesCount?: number }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchTerm || searchTerm.length < 2) {
      setTeams([]);
      return;
    }

    setIsLoading(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/lol/hierarchy?type=search&q=${encodeURIComponent(searchTerm)}`);
        const data = await res.json();
        if (data.success) {
          setTeams(data.teams || []);
        }
      } catch (e) {
        console.error('Team search failed:', e);
      }
      setIsLoading(false);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  return (
    <div className="bg-gray-900/90 border border-white/20 rounded-lg overflow-hidden">
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder={language === 'zh' ? '搜索战队名...' : 'Search team name...'}
        className="w-full px-3 py-2 bg-transparent border-b border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none"
        autoFocus
      />
      <div className="max-h-40 overflow-y-auto">
        {isLoading ? (
          <div className="p-3 text-center text-gray-500 text-sm">
            {language === 'zh' ? '搜索中...' : 'Searching...'}
          </div>
        ) : teams.length > 0 ? (
          teams.slice(0, 8).map((t) => (
            <div
              key={t.id}
              onClick={() => {
                onSelect(t.id, t.name);
                onClose();
              }}
              className="px-3 py-2 hover:bg-white/10 cursor-pointer transition-colors"
            >
              <div className="text-sm text-white">{t.name}</div>
              {t.seriesCount && (
                <div className="text-[10px] text-gray-500">
                  {t.seriesCount} {language === 'zh' ? '场比赛' : 'matches'}
                </div>
              )}
            </div>
          ))
        ) : searchTerm.length >= 2 ? (
          <div className="p-3 text-center text-gray-500 text-sm">
            {language === 'zh' ? '未找到战队' : 'No teams found'}
          </div>
        ) : (
          <div className="p-3 text-center text-gray-500 text-sm">
            {language === 'zh' ? '输入至少2个字符' : 'Type at least 2 characters'}
          </div>
        )}
      </div>
    </div>
  );
}
