'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { type LeagueKey, ALL_LEAGUES, LEAGUE_LABELS, isValidLeagueKey, migrateRegionToLeague } from '@/app/lib/league-types';

// Types
interface Team {
  id: string;
  name: string;
  logo?: string | null;
}

type Role = 'top' | 'jungle' | 'mid' | 'bot' | 'support';

export interface RoleSlot {
  role: Role;
  playerId: string;
  playerName: string;
}

export interface PlayerOption {
  playerId: string;
  playerName: string;
  games?: number;
  lastPlayed?: string;
}

export interface WizardResult {
  ourTeamId: string;
  ourTeamName: string;
  ourTeamLogo?: string | null;
  opponentTeamId: string;
  opponentTeamName: string;
  opponentTeamLogo?: string | null;
  side: 'blue' | 'red';
  league: LeagueKey;
  // Legacy field for migration (read-only)
  region?: string | null;
  ourRoster: RoleSlot[];
  oppRoster: RoleSlot[];
  rememberSettings: boolean;
}

interface BPWizardProps {
  open: boolean;
  onComplete: (result: WizardResult) => void;
  onCancel?: () => void;
  initialValues?: Partial<WizardResult>;
}

const ROLES: Role[] = ['top', 'jungle', 'mid', 'bot', 'support'];

const ROLE_LABELS: Record<Role, string> = {
  top: 'TOP',
  jungle: 'JGL',
  mid: 'MID',
  bot: 'BOT',
  support: 'SUP',
};

export default function BPWizard({ open, onComplete, onCancel, initialValues }: BPWizardProps) {
  const [phase, setPhase] = useState<'select' | 'roster'>('select');
  const [ourTeam, setOurTeam] = useState<Team | null>(null);
  const [opponentTeam, setOpponentTeam] = useState<Team | null>(null);
  const [side, setSide] = useState<'blue' | 'red' | null>(null);
  const [league, setLeague] = useState<LeagueKey>('global');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Team[]>([]);
  const [popularTeams, setPopularTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [activeSearch, setActiveSearch] = useState<'our' | 'opponent' | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [ourRoster, setOurRoster] = useState<RoleSlot[]>([]);
  const [oppRoster, setOppRoster] = useState<RoleSlot[]>([]);
  const [ourCandidates, setOurCandidates] = useState<PlayerOption[]>([]);
  const [oppCandidates, setOppCandidates] = useState<PlayerOption[]>([]);
  const [loadingRosters, setLoadingRosters] = useState(false);
  const [rememberSettings, setRememberSettings] = useState(false);

  useEffect(() => {
    if (initialValues) {
      if (initialValues.ourTeamId && initialValues.ourTeamName) {
        setOurTeam({ id: initialValues.ourTeamId, name: initialValues.ourTeamName, logo: initialValues.ourTeamLogo });
      }
      if (initialValues.opponentTeamId && initialValues.opponentTeamName) {
        setOpponentTeam({ id: initialValues.opponentTeamId, name: initialValues.opponentTeamName, logo: initialValues.opponentTeamLogo });
      }
      if (initialValues.side) setSide(initialValues.side);
      // Handle both new league field and legacy region field
      if (initialValues.league && isValidLeagueKey(initialValues.league)) {
        setLeague(initialValues.league);
      } else if (initialValues.region) {
        // Migration from old region format
        setLeague(migrateRegionToLeague(initialValues.region));
      }
      if (initialValues.ourRoster?.length) setOurRoster(initialValues.ourRoster);
      if (initialValues.oppRoster?.length) setOppRoster(initialValues.oppRoster);
      if (initialValues.rememberSettings !== undefined) setRememberSettings(initialValues.rememberSettings);
      if (initialValues.ourTeamId && initialValues.opponentTeamId && initialValues.side) setPhase('roster');
    }
  }, [initialValues]);

  useEffect(() => {
    if (!open) return;
    async function loadPopular() {
      try {
        const res = await fetch('/api/lol/hierarchy?type=all-teams');
        if (res.ok) {
          const data = await res.json();
          const teams: Team[] = (data.teams || data || [])
            .slice(0, 30)
            .map((t: { id: string; name: string; logo?: string; logoUrl?: string }) => ({
              id: t.id,
              name: t.name,
              logo: t.logo || t.logoUrl || null,
            }));
          setPopularTeams(teams);
        }
      } catch { /* ignore */ }
    }
    loadPopular();
  }, [open]);

  const searchTeams = useCallback(async (query: string) => {
    if (query.length < 1) {
      setSearchResults([]);
      return;
    }
    setLoadingTeams(true);
    try {
      const res = await fetch(`/api/lol/hierarchy?type=search&q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        const teams: Team[] = (data.teams || []).map((t: { id: string; name: string; logo?: string; logoUrl?: string }) => ({
          id: t.id,
          name: t.name,
          logo: t.logo || t.logoUrl || null,
        }));
        setSearchResults(teams);
      }
    } catch { /* ignore */ }
    finally { setLoadingTeams(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) searchTeams(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, searchTeams]);

  const fetchRostersAndCandidates = useCallback(async () => {
    if (!ourTeam || !opponentTeam || !side) return;
    setLoadingRosters(true);
    try {
      const leagueParam = league !== 'global' ? `?league=${league}` : '';
      const [ourRosterRes, oppRosterRes, ourPlayersRes, oppPlayersRes] = await Promise.all([
        fetch(`/api/teams/${ourTeam.id}/latest-roster${leagueParam}`),
        fetch(`/api/teams/${opponentTeam.id}/latest-roster${leagueParam}`),
        fetch(`/api/teams/${ourTeam.id}/players`),
        fetch(`/api/teams/${opponentTeam.id}/players`),
      ]);

      if (ourRosterRes.ok) {
        const data = await ourRosterRes.json();
        if (data.players) {
          const roster: RoleSlot[] = ROLES.map(role => {
            const player = data.players.find((p: { role: string }) => p.role === role);
            return { role, playerId: player?.playerId || '', playerName: player?.playerName || '' };
          });
          setOurRoster(roster);
        }
      }
      if (oppRosterRes.ok) {
        const data = await oppRosterRes.json();
        if (data.players) {
          const roster: RoleSlot[] = ROLES.map(role => {
            const player = data.players.find((p: { role: string }) => p.role === role);
            return { role, playerId: player?.playerId || '', playerName: player?.playerName || '' };
          });
          setOppRoster(roster);
        }
      }
      if (ourPlayersRes.ok) {
        const data = await ourPlayersRes.json();
        if (data.players) setOurCandidates(data.players);
      }
      if (oppPlayersRes.ok) {
        const data = await oppPlayersRes.json();
        if (data.players) setOppCandidates(data.players);
      }
      setPhase('roster');
    } catch (err) { console.error('Failed to fetch rosters:', err); }
    finally { setLoadingRosters(false); }
  }, [ourTeam, opponentTeam, side, league]);

  const selectTeam = (team: Team, which: 'our' | 'opponent') => {
    if (which === 'our') setOurTeam(team);
    else setOpponentTeam(team);
    setSearchQuery('');
    setSearchResults([]);
    setActiveSearch(null);
  };

  const teamsToShow = searchQuery.length > 0 ? searchResults : popularTeams;
  const canProceed = ourTeam && opponentTeam && side;

  const handleContinue = () => {
    if (!canProceed) return;
    fetchRostersAndCandidates();
  };

  const handleEdit = () => setPhase('select');

  const handleComplete = () => {
    if (!ourTeam || !opponentTeam || !side) return;
    console.log('[BPWizard] handleComplete - league:', league);
    onComplete({
      ourTeamId: ourTeam.id,
      ourTeamName: ourTeam.name,
      ourTeamLogo: ourTeam.logo,
      opponentTeamId: opponentTeam.id,
      opponentTeamName: opponentTeam.name,
      opponentTeamLogo: opponentTeam.logo,
      side,
      league,           // Always pass current league (including 'global')
      region: null,     // Explicitly null to prevent legacy override
      ourRoster,
      oppRoster,
      rememberSettings,
    });
  };

  const updateRoster = (which: 'our' | 'opp', role: Role, playerId: string) => {
    const candidates = which === 'our' ? ourCandidates : oppCandidates;
    const player = candidates.find(p => p.playerId === playerId);
    if (!player) return;
    const setter = which === 'our' ? setOurRoster : setOppRoster;
    setter(prev => prev.map(slot =>
      slot.role === role ? { ...slot, playerId: player.playerId, playerName: player.playerName } : slot
    ));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Dark backdrop with subtle gradient */}
      <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-sm">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-950/20 via-transparent to-rose-950/20" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="relative w-full max-w-2xl mx-4"
      >
        {/* Subtle glow behind */}
        <div className="absolute -inset-px bg-gradient-to-r from-cyan-500/20 via-transparent to-rose-500/20 rounded-lg blur-sm" />

        {/* Main container */}
        <div className="relative bg-slate-900 border border-slate-700/80 rounded-lg overflow-hidden shadow-2xl">
          {/* Top accent bar */}
          <div className="h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-rose-500" />

          {/* Corner accents - outside the rounded corners */}
          <div className="absolute top-0 left-0 w-8 h-8 border-l-2 border-t-2 border-cyan-400 rounded-tl-lg" />
          <div className="absolute top-0 right-0 w-8 h-8 border-r-2 border-t-2 border-rose-400 rounded-tr-lg" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-l-2 border-b-2 border-cyan-400 rounded-bl-lg" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-r-2 border-b-2 border-rose-400 rounded-br-lg" />

          {/* Header */}
          <div className="relative px-6 pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full" />
              <h2 className="text-lg font-bold uppercase tracking-wider text-white">
                Draft Setup
              </h2>
              <div className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
            </div>

            {phase === 'roster' && ourTeam && opponentTeam && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-between mt-3 px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded"
              >
                <div className="flex items-center gap-3">
                  {ourTeam.logo && (
                    <img src={ourTeam.logo} alt={ourTeam.name} className="w-6 h-6 object-contain" />
                  )}
                  <span className="font-semibold text-cyan-400 text-sm">{ourTeam.name}</span>
                  <span className="text-sm font-bold text-slate-600">vs</span>
                  <span className="font-semibold text-rose-400 text-sm">{opponentTeam.name}</span>
                  {opponentTeam.logo && (
                    <img src={opponentTeam.logo} alt={opponentTeam.name} className="w-6 h-6 object-contain" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase rounded ${
                    side === 'blue' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-rose-500/20 text-rose-400'
                  }`}>
                    {side}
                  </span>
                  {league !== 'global' && (
                    <span className="px-2 py-0.5 text-[10px] font-semibold uppercase bg-slate-700 text-slate-300 rounded">
                      {LEAGUE_LABELS[league]}
                    </span>
                  )}
                  <button onClick={handleEdit} className="text-xs text-slate-500 hover:text-white transition-colors">
                    Edit
                  </button>
                </div>
              </motion.div>
            )}
          </div>

          {/* Body */}
          <div className="px-6 py-4 min-h-[320px]">
            <AnimatePresence mode="wait">
              {phase === 'select' && (
                <motion.div
                  key="select"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-4"
                >
                  {/* Team Selectors */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Our Team */}
                    <div>
                      <label className="text-[10px] text-cyan-400 uppercase tracking-widest font-bold mb-2 block">
                        Your Team
                      </label>
                      {ourTeam && activeSearch !== 'our' ? (
                        <button
                          onClick={() => setActiveSearch('our')}
                          className="w-full flex items-center gap-3 px-4 py-3 bg-slate-800/80 border border-cyan-500/30 hover:border-cyan-500/60 rounded transition-all group"
                        >
                          {ourTeam.logo && <img src={ourTeam.logo} alt="" className="w-7 h-7 object-contain" />}
                          <span className="font-bold text-white flex-1 text-left">{ourTeam.name}</span>
                          <span className="text-[10px] text-slate-500 group-hover:text-cyan-400 uppercase">Change</span>
                        </button>
                      ) : (
                        <div className="space-y-1">
                          <div className="relative">
                            <input
                              ref={activeSearch === 'our' ? searchInputRef : undefined}
                              type="text"
                              value={activeSearch === 'our' ? searchQuery : ''}
                              onChange={(e) => { setActiveSearch('our'); setSearchQuery(e.target.value); }}
                              onFocus={() => setActiveSearch('our')}
                              placeholder="Search teams..."
                              className="w-full px-4 py-2.5 bg-slate-800/80 border border-cyan-500/30 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                            />
                            <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-500/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                          </div>
                          {activeSearch === 'our' && (
                            <div className="max-h-[140px] overflow-y-auto bg-slate-800/95 border border-slate-700 rounded backdrop-blur-sm">
                              {loadingTeams && <div className="text-xs text-cyan-400 py-3 text-center">Searching...</div>}
                              {teamsToShow.map(team => (
                                <button
                                  key={team.id}
                                  onClick={() => selectTeam(team, 'our')}
                                  disabled={opponentTeam?.id === team.id}
                                  className={`w-full flex items-center gap-2 text-left px-3 py-2 text-sm transition-colors ${
                                    opponentTeam?.id === team.id
                                      ? 'text-slate-600 cursor-not-allowed'
                                      : 'text-slate-300 hover:bg-cyan-500/10 hover:text-white'
                                  }`}
                                >
                                  {team.logo && <img src={team.logo} alt="" className="w-5 h-5 object-contain" />}
                                  {team.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Opponent Team */}
                    <div>
                      <label className="text-[10px] text-rose-400 uppercase tracking-widest font-bold mb-2 block">
                        Opponent
                      </label>
                      {opponentTeam && activeSearch !== 'opponent' ? (
                        <button
                          onClick={() => setActiveSearch('opponent')}
                          className="w-full flex items-center gap-3 px-4 py-3 bg-slate-800/80 border border-rose-500/30 hover:border-rose-500/60 rounded transition-all group"
                        >
                          {opponentTeam.logo && <img src={opponentTeam.logo} alt="" className="w-7 h-7 object-contain" />}
                          <span className="font-bold text-white flex-1 text-left">{opponentTeam.name}</span>
                          <span className="text-[10px] text-slate-500 group-hover:text-rose-400 uppercase">Change</span>
                        </button>
                      ) : (
                        <div className="space-y-1">
                          <div className="relative">
                            <input
                              ref={activeSearch === 'opponent' ? searchInputRef : undefined}
                              type="text"
                              value={activeSearch === 'opponent' ? searchQuery : ''}
                              onChange={(e) => { setActiveSearch('opponent'); setSearchQuery(e.target.value); }}
                              onFocus={() => setActiveSearch('opponent')}
                              placeholder="Search teams..."
                              className="w-full px-4 py-2.5 bg-slate-800/80 border border-rose-500/30 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition-colors"
                            />
                            <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-500/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                          </div>
                          {activeSearch === 'opponent' && (
                            <div className="max-h-[140px] overflow-y-auto bg-slate-800/95 border border-slate-700 rounded backdrop-blur-sm">
                              {loadingTeams && <div className="text-xs text-rose-400 py-3 text-center">Searching...</div>}
                              {teamsToShow.map(team => (
                                <button
                                  key={team.id}
                                  onClick={() => selectTeam(team, 'opponent')}
                                  disabled={ourTeam?.id === team.id}
                                  className={`w-full flex items-center gap-2 text-left px-3 py-2 text-sm transition-colors ${
                                    ourTeam?.id === team.id
                                      ? 'text-slate-600 cursor-not-allowed'
                                      : 'text-slate-300 hover:bg-rose-500/10 hover:text-white'
                                  }`}
                                >
                                  {team.logo && <img src={team.logo} alt="" className="w-5 h-5 object-contain" />}
                                  {team.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Side Selection */}
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mb-2 block">
                      Select Side
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setSide('blue')}
                        className={`relative px-4 py-3 rounded border text-center transition-all overflow-hidden ${
                          side === 'blue'
                            ? 'bg-cyan-500/10 border-cyan-500/60 text-cyan-400'
                            : 'bg-slate-800/80 border-slate-600 text-slate-400 hover:border-cyan-500/40 hover:text-slate-300'
                        }`}
                      >
                        <div className="font-bold uppercase tracking-wide">Blue Side</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">First Pick</div>
                        {side === 'blue' && (
                          <motion.div
                            layoutId="side-indicator"
                            className="absolute bottom-0 inset-x-0 h-0.5 bg-cyan-500"
                          />
                        )}
                      </button>
                      <button
                        onClick={() => setSide('red')}
                        className={`relative px-4 py-3 rounded border text-center transition-all overflow-hidden ${
                          side === 'red'
                            ? 'bg-rose-500/10 border-rose-500/60 text-rose-400'
                            : 'bg-slate-800/80 border-slate-600 text-slate-400 hover:border-rose-500/40 hover:text-slate-300'
                        }`}
                      >
                        <div className="font-bold uppercase tracking-wide">Red Side</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Counter Pick</div>
                        {side === 'red' && (
                          <motion.div
                            layoutId="side-indicator"
                            className="absolute bottom-0 inset-x-0 h-0.5 bg-rose-500"
                          />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* League */}
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mb-2 block">
                      League Meta
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {ALL_LEAGUES.map(l => (
                        <button
                          key={l}
                          onClick={() => setLeague(l)}
                          className={`px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wide transition-all ${
                            league === l
                              ? 'bg-slate-700 text-white border border-slate-500 shadow-sm'
                              : 'bg-slate-800/80 border border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          {LEAGUE_LABELS[l]}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {phase === 'roster' && (
                <motion.div
                  key="roster"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {loadingRosters ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <div className="w-8 h-8 border-2 border-slate-600 border-t-cyan-500 rounded-full animate-spin" />
                      <p className="text-sm text-slate-400">Loading rosters...</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <RosterEditor
                        title={ourTeam?.name || 'Your Team'}
                        logo={ourTeam?.logo}
                        roster={ourRoster}
                        candidates={ourCandidates}
                        onUpdate={(role, playerId) => updateRoster('our', role, playerId)}
                        color="cyan"
                      />
                      <RosterEditor
                        title={opponentTeam?.name || 'Opponent'}
                        logo={opponentTeam?.logo}
                        roster={oppRoster}
                        candidates={oppCandidates}
                        onUpdate={(role, playerId) => updateRoster('opp', role, playerId)}
                        color="rose"
                      />
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="relative px-6 py-4 border-t border-slate-700/50 flex items-center justify-between bg-slate-900/90">
            <div className="flex items-center gap-4">
              {onCancel && (
                <button
                  onClick={onCancel}
                  className="px-4 py-2 text-sm text-slate-500 hover:text-white transition-colors uppercase tracking-wide"
                >
                  Cancel
                </button>
              )}
              {phase === 'roster' && (
                <label className="flex items-center gap-2 cursor-pointer select-none group">
                  <div className={`w-4 h-4 border rounded flex items-center justify-center transition-all ${
                    rememberSettings ? 'bg-cyan-500 border-cyan-500' : 'border-slate-600 group-hover:border-cyan-500/50'
                  }`}>
                    {rememberSettings && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={rememberSettings}
                    onChange={(e) => setRememberSettings(e.target.checked)}
                    className="sr-only"
                  />
                  <span className="text-xs text-slate-500 group-hover:text-slate-400 uppercase tracking-wide">Remember</span>
                </label>
              )}
            </div>
            {phase === 'select' ? (
              <button
                onClick={handleContinue}
                disabled={!canProceed || loadingRosters}
                className={`px-6 py-2.5 rounded font-bold text-sm uppercase tracking-wide transition-all ${
                  canProceed && !loadingRosters
                    ? 'bg-gradient-to-r from-cyan-600 to-cyan-500 text-white hover:from-cyan-500 hover:to-cyan-400 shadow-lg shadow-cyan-500/20'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                {loadingRosters ? 'Loading...' : 'Continue'}
              </button>
            ) : (
              <button
                onClick={handleComplete}
                className="px-6 py-2.5 rounded font-bold text-sm uppercase tracking-wide bg-gradient-to-r from-emerald-600 to-emerald-500 text-white hover:from-emerald-500 hover:to-emerald-400 shadow-lg shadow-emerald-500/20 transition-all"
              >
                Start Draft
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// Roster Editor Component
interface RosterEditorProps {
  title: string;
  logo?: string | null;
  roster: RoleSlot[];
  candidates: PlayerOption[];
  onUpdate: (role: Role, playerId: string) => void;
  color: 'cyan' | 'rose';
}

function RosterEditor({ title, logo, roster, candidates, onUpdate, color }: RosterEditorProps) {
  const colors = {
    cyan: {
      border: 'border-cyan-500/30',
      header: 'text-cyan-400',
      headerBg: 'bg-gradient-to-r from-cyan-500/10 to-transparent',
      select: 'focus:border-cyan-500',
      roleBg: 'bg-cyan-500/15',
      roleText: 'text-cyan-400',
      accent: 'border-l-cyan-500',
    },
    rose: {
      border: 'border-rose-500/30',
      header: 'text-rose-400',
      headerBg: 'bg-gradient-to-r from-rose-500/10 to-transparent',
      select: 'focus:border-rose-500',
      roleBg: 'bg-rose-500/15',
      roleText: 'text-rose-400',
      accent: 'border-l-rose-500',
    },
  };
  const c = colors[color];
  const selectedIds = new Set(roster.map(r => r.playerId).filter(Boolean));

  return (
    <div className={`border ${c.border} rounded overflow-hidden`}>
      <div className={`flex items-center gap-3 px-4 py-2.5 ${c.headerBg} border-l-2 ${c.accent}`}>
        {logo && <img src={logo} alt="" className="w-6 h-6 object-contain" />}
        <h3 className={`text-sm font-bold uppercase tracking-wide ${c.header}`}>{title}</h3>
      </div>
      <div className="p-3 space-y-2 bg-slate-900/50">
        {ROLES.map(role => {
          const slot = roster.find(r => r.role === role);
          return (
            <div key={role} className="flex items-center gap-2">
              <span className={`w-10 text-[10px] font-bold uppercase tracking-wide ${c.roleText} ${c.roleBg} px-2 py-1 rounded text-center`}>
                {ROLE_LABELS[role]}
              </span>
              <select
                value={slot?.playerId || ''}
                onChange={(e) => onUpdate(role, e.target.value)}
                className={`flex-1 px-3 py-1.5 bg-slate-800/80 border border-slate-700 rounded text-sm text-white ${c.select} focus:outline-none transition-colors cursor-pointer`}
              >
                <option value="">-- Select --</option>
                {candidates.map(player => {
                  const isSelected = selectedIds.has(player.playerId) && slot?.playerId !== player.playerId;
                  return (
                    <option key={player.playerId} value={player.playerId} disabled={isSelected}>
                      {player.playerName}
                      {player.games ? ` (${player.games}G)` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
