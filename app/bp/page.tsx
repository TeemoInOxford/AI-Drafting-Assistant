'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Champion, BPState, Position, AIControlMode, AIRecommendation, AIAnalysis, BanReason, MatchRosterState } from '@/app/lib/types';
import {
  createInitialState,
  selectChampion,
  undoLastAction,
  getCurrentStep,
  getPhaseDescription,
  isBPComplete,
  toggleManualBan
} from '@/app/lib/bp-logic';
import { getLatestVersion, getChampions } from '@/app/lib/champion-api';
import ChampionGrid from '@/app/components/ChampionGrid';
import BPPanel from '@/app/components/BPPanel';
import PhaseIndicator from '@/app/components/PhaseIndicator';
import PositionFilter from '@/app/components/PositionFilter';
import { useModal } from '@/app/components/ModalProvider';
import AIControlPanel from '@/app/components/AIControlPanel';
import TeamRosterCompact from '@/app/components/TeamRosterCompact';
import { generateAIAnalysis } from '@/app/lib/ai-analysis';
import { calculatePTS, bpStateToDraftState } from '@/app/lib/pts-engine';
import PTSRiskBoard from '@/app/components/PTSRiskBoard';

export default function LOLBPPage() {
  const { showToast, confirm, alert: showAlert } = useModal();
  const [champions, setChampions] = useState<Champion[]>([]);
  const [bpState, setBpState] = useState<BPState>(createInitialState());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [version, setVersion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);

  // AI mode state
  const [aiMode, setAiMode] = useState<AIControlMode>('manual');
  const [userSide, setUserSide] = useState<'blue' | 'red'>('blue');
  const [aiThinking, setAiThinking] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState<AIRecommendation | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [autoPlay, setAutoPlay] = useState(true);
  const aiTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fearless Draft interaction mode
  const [fearlessModeEnabled, setFearlessModeEnabled] = useState(false);
  const [fearlessBannedChampions, setFearlessBannedChampions] = useState<Set<string>>(new Set());
  const [shakeChampionId, setShakeChampionId] = useState<string | null>(null);

  // Team Roster state
  const [rosterState, setRosterState] = useState<MatchRosterState>({
    enabled: false,
    blueTeam: {
      teamName: '',
      players: [null, null, null, null, null],
    },
    redTeam: {
      teamName: '',
      players: [null, null, null, null, null],
    },
  });

  // Load champion data
  useEffect(() => {
    async function loadChampions() {
      setLoading(true);
      setError(null);
      try {
        const ver = await getLatestVersion();
        setVersion(ver);
        const data = await getChampions(ver);
        // Sort by name
        setChampions(data.sort((a, b) => a.name.localeCompare(b.name)));
      } catch (err) {
        console.error('Failed to load champions:', err);
        setError('Failed to load champions, please refresh');
      }
      setLoading(false);
    }
    loadChampions();
  }, []);

  // Filter champions (search + position)
  const filteredChampions = useMemo(() => {
    let result = champions;

    // Position filter
    if (selectedPosition) {
      result = result.filter(c => c.positions.includes(selectedPosition));
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(term) ||
        c.id.toLowerCase().includes(term)
      );
    }

    return result;
  }, [champions, searchTerm, selectedPosition]);

  // Used champions
  const allUsedChampions = useMemo(() => {
    return bpState.usedChampions;
  }, [bpState.usedChampions]);

  // Get current step info
  const currentStep = getCurrentStep(bpState);
  const phaseDesc = getPhaseDescription(bpState.currentStep);

  // Get current team
  const currentTeam = currentStep?.team || 'blue';
  const canUndo = bpState.history.length > 0;

  // Check if it's AI's turn (opponent simulation)
  const isAITurn = useMemo(() => {
    if (aiMode === 'manual') return false;
    if (aiMode === 'assistant') {
      // AI simulates opponent - it's AI's turn when current team is NOT user's side
      return currentTeam !== userSide;
    }
    return false;
  }, [aiMode, currentTeam, userSide]);

  // Fallback random selection
  const getRandomChampion = useCallback(() => {
    const available = champions.filter(c => !allUsedChampions.has(c.id));
    if (available.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * available.length);
    return available[randomIndex];
  }, [champions, allUsedChampions]);

  // Calculate PTS for current draft state
  const ptsResults = useMemo(() => {
    if (!currentStep || loading || champions.length === 0 || isBPComplete(bpState)) {
      return [];
    }

    try {
      const draftState = bpStateToDraftState(bpState, currentStep);
      const availableChamps = champions.filter(c => !allUsedChampions.has(c.id));
      return calculatePTS(draftState, availableChamps);
    } catch (e) {
      console.error('PTS calculation failed:', e);
      return [];
    }
  }, [bpState, currentStep, champions, allUsedChampions, loading]);

  // Get draft context for PTS board
  const draftContext = useMemo(() => {
    if (!currentStep) {
      return {
        currentTurn: 'Draft Complete',
        ourSide: 'blue' as const,
        nextOpponentActions: 'None',
      };
    }

    const turnLabel = `${currentStep.action === 'ban' ? 'Ban' : 'Pick'} ${currentStep.index + 1}`;
    const opponentTeam = currentStep.team === 'blue' ? 'Red' : 'Blue';

    // Determine next opponent actions
    let nextActions = '';
    const nextStep = bpState.currentStep + 1;
    if (nextStep < 20) {
      if (nextStep < 6) {
        nextActions = `${opponentTeam} Ban`;
      } else if (nextStep < 12) {
        nextActions = `${opponentTeam} Pick`;
      } else if (nextStep < 16) {
        nextActions = `${opponentTeam} Ban`;
      } else {
        nextActions = `${opponentTeam} Pick`;
      }
    } else {
      nextActions = 'Draft Complete';
    }

    return {
      currentTurn: turnLabel,
      ourSide: currentStep.team,
      nextOpponentActions: nextActions,
    };
  }, [currentStep, bpState.currentStep]);

  // AI analysis generation (when BP state changes or AI mode is enabled)
  useEffect(() => {
    if (aiMode === 'manual' || loading || champions.length === 0 || isBPComplete(bpState)) {
      setAiAnalysis(null);
      return;
    }

    // Generate AI analysis
    if (currentStep) {
      const analysis = generateAIAnalysis(
        bpState,
        champions,
        currentStep.action,
        currentStep.team
      );
      setAiAnalysis(analysis);
    }
  }, [aiMode, bpState.currentStep, champions.length, loading]);

  // AI auto-operation logic with PTS integration
  useEffect(() => {
    if (aiTimeoutRef.current) {
      clearTimeout(aiTimeoutRef.current);
      aiTimeoutRef.current = null;
    }

    if (!isAITurn || isBPComplete(bpState) || loading || champions.length === 0) {
      setAiThinking(false);
      setAiRecommendation(null);
      return;
    }

    setAiThinking(true);
    setAiRecommendation(null);

    // Simulate thinking delay 0.8-2s
    const thinkingDelay = 800 + Math.random() * 1200;

    aiTimeoutRef.current = setTimeout(() => {
      const champion = getRandomChampion();

      if (champion && aiAnalysis && aiAnalysis.recommendations.length > 0) {
        // Use top recommendation from analysis
        const topRec = aiAnalysis.recommendations[0];
        const matchedChamp = champions.find(
          c => c.name === topRec.champion
        ) || champion;

        // Calculate PTS for the recommendation
        if (currentStep) {
          try {
            const draftState = bpStateToDraftState(bpState, currentStep);
            const availableChamps = champions.filter(c => !allUsedChampions.has(c.id));
            const ptsResults = calculatePTS(draftState, availableChamps);

            if (ptsResults.length > 0) {
              const topPTS = ptsResults[0];
              const ptsChamp = champions.find(c => c.id === topPTS.championId);

              if (ptsChamp) {
                setAiRecommendation({
                  ...topRec,
                  champion: topPTS.championName,
                  pts: topPTS.pts,
                  riskTier: topPTS.riskTier,
                  reason: topPTS.explanation,
                });
                setAiThinking(false);

                if (autoPlay) {
                  aiTimeoutRef.current = setTimeout(() => {
                    setBpState(prev => selectChampion(prev, ptsChamp));
                  }, 500);
                }
                return;
              }
            }
          } catch (e) {
            console.error('PTS calculation failed:', e);
          }
        }

        setAiRecommendation(topRec);
        setAiThinking(false);

        if (autoPlay) {
          aiTimeoutRef.current = setTimeout(() => {
            setBpState(prev => selectChampion(prev, matchedChamp));
          }, 500);
        }
      } else if (champion) {
        const recommendation: AIRecommendation = {
          champion: champion.name,
          score: Math.floor(Math.random() * 30) + 70,
          reason: 'AI random selection (placeholder)',
          winRate: Math.floor(Math.random() * 20) + 45
        };

        setAiRecommendation(recommendation);
        setAiThinking(false);

        if (autoPlay) {
          aiTimeoutRef.current = setTimeout(() => {
            setBpState(prev => selectChampion(prev, champion));
          }, 500);
        }
      } else {
        setAiThinking(false);
      }
    }, thinkingDelay);

    return () => {
      if (aiTimeoutRef.current) {
        clearTimeout(aiTimeoutRef.current);
      }
    };
  }, [isAITurn, bpState.currentStep, loading, champions.length, autoPlay, getRandomChampion, aiAnalysis, currentStep, allUsedChampions]);

  // Handle AI mode change
  const handleAIModeChange = (mode: AIControlMode) => {
    setAiMode(mode);
    setAiThinking(false);
    setAiRecommendation(null);
    // If AI is enabled, generate analysis immediately
    if (mode !== 'off' && currentStep && champions.length > 0) {
      const analysis = generateAIAnalysis(bpState, champions, currentStep.action, currentStep.team);
      setAiAnalysis(analysis);
    } else {
      setAiAnalysis(null);
    }
  };

  // Handle Fearless Mode toggle
  const handleFearlessModeToggle = async () => {
    if (fearlessModeEnabled) {
      // Turning OFF: validate
      const count = fearlessBannedChampions.size;
      if (count % 10 !== 0 || count > 40) {
        const confirmed = await confirm(
          `You have banned ${count} champions. Fearless Draft requires exactly 10 champions per game (max 40 total). Are you sure you want to turn off Fearless Mode?`,
          'Validation Warning'
        );
        if (!confirmed) return;
      }
      setFearlessModeEnabled(false);
    } else {
      // Turning ON
      setFearlessModeEnabled(true);
    }
  };

  // Handle champion selection
  const handleChampionSelect = (champion: Champion) => {
    // Fearless Mode ON: add to fearless pool
    if (fearlessModeEnabled) {
      setFearlessBannedChampions(prev => {
        const newSet = new Set(prev);
        if (newSet.has(champion.id)) {
          // Unbanning
          newSet.delete(champion.id);
        } else {
          // Banning
          if (newSet.size >= 40) {
            // Trigger shake animation
            setShakeChampionId(champion.id);
            setTimeout(() => setShakeChampionId(null), 500);
            return prev; // Don't add
          }
          newSet.add(champion.id);
        }
        return newSet;
      });
      return;
    }

    // Normal BP logic
    if (allUsedChampions.has(champion.id)) return;
    if (fearlessBannedChampions.has(champion.id)) return;
    if (isBPComplete(bpState)) return;
    setBpState(selectChampion(bpState, champion));
  };

  // Handle undo
  const handleUndo = () => {
    setBpState(undoLastAction(bpState));
  };

  // Handle reset
  const handleReset = () => {
    setBpState(createInitialState());
    setAiThinking(false);
    setAiRecommendation(null);
    setAiAnalysis(null);
  };

  // Load demo draft scenario
  const handleLoadDemo = () => {
    const demoState = createInitialState();
    const demoChampions = [
      'Yone', 'Sylas', 'Kalista',
      'Aatrox', 'KSante', 'Xayah',
      'Azir', 'Varus',
      'Jax', 'Graves', 'Nautilus',
    ];

    let state = demoState;
    demoChampions.forEach((champName) => {
      const champ = champions.find(c =>
        c.name.toLowerCase() === champName.toLowerCase() ||
        c.id.toLowerCase() === champName.toLowerCase()
      );
      if (champ) {
        state = selectChampion(state, champ);
      }
    });

    setBpState(state);
    setAiThinking(false);
    setAiRecommendation(null);
    setAiAnalysis(null);
    showToast({ message: 'Demo scenario loaded', type: 'success' });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden flex flex-col">
      {/* Background Gradients */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-cyan-900/20 rounded-full blur-[100px] -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-rose-900/20 rounded-full blur-[100px] translate-x-1/2 translate-y-1/2" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDIpIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-[0.03]" />
      </div>

      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 text-center pt-4 pb-3 px-4"
      >
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
          LOL Ban/Pick Simulator
        </h1>
        <p className="text-slate-400 mt-1.5 text-xs sm:text-sm">
          Tournament BP Rules
          {version && <span className="ml-2 text-slate-500">v{version}</span>}
        </p>
      </motion.div>

      {/* Header with Phase Indicator */}
      <header className="relative z-20 h-16 w-full flex items-center justify-between px-8 border-b border-white/5 bg-slate-950/80 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <TeamRosterCompact
            rosterState={rosterState}
            onRosterStateChange={setRosterState}
          />
        </div>

        {/* Phase Indicator - Center */}
        <div className="absolute left-1/2 -translate-x-1/2">
          <PhaseIndicator phase={phaseDesc} currentStep={currentStep} />
        </div>

        {/* Right: Undo/Reset/Demo + AI Toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-all duration-300 ${
              canUndo
                ? 'border-white/10 text-slate-400 hover:text-white hover:border-white/20'
                : 'border-white/5 text-slate-600 cursor-not-allowed'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
            <span className="text-xs font-bold uppercase">Undo</span>
          </button>

          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-3 py-1.5 rounded border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-all duration-300"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="text-xs font-bold uppercase">Reset</span>
          </button>

          <button
            onClick={handleLoadDemo}
            className="flex items-center gap-2 px-3 py-1.5 rounded border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-all duration-300"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs font-bold uppercase">Demo</span>
          </button>

          <button
            onClick={() => setAiMode(aiMode === 'manual' ? 'assistant' : 'manual')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded border transition-all duration-300 ${
              aiMode === 'assistant'
                ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.2)]'
                : 'border-white/10 text-slate-500 hover:text-slate-300'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span className="text-xs font-bold uppercase">AI: {aiMode === 'assistant' ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </header>

      {/* AI Control Panel - Above BP Panel */}
      {aiMode === 'assistant' && (
        <div className="relative z-10 max-w-4xl mx-auto px-4 mb-4">
          <AIControlPanel
            aiMode={aiMode}
            onModeChange={handleAIModeChange}
            isThinking={aiThinking}
            currentTeam={currentTeam}
            recommendation={aiRecommendation}
            autoPlay={autoPlay}
            onAutoPlayChange={setAutoPlay}
            userSide={userSide}
            onUserSideChange={setUserSide}
          />
        </div>
      )}

      {/* Main Content Area - BP Panel centered */}
      <div className="relative z-10">
        {/* PTS Risk Board - Overlay on left side */}
        {ptsResults.length > 0 && !isBPComplete(bpState) && (
          <div className="fixed left-4 top-1/2 -translate-y-1/2 w-80 z-50">
            <PTSRiskBoard
              ptsResults={ptsResults}
              currentTurn={draftContext.currentTurn}
              ourSide={draftContext.ourSide}
              nextOpponentActions={draftContext.nextOpponentActions}
              onChampionClick={(championId) => {
                const champion = champions.find(c => c.id === championId);
                if (champion && !allUsedChampions.has(championId)) {
                  handleChampionSelect(champion);
                }
              }}
            />
          </div>
        )}

        {/* BP Panel - Center */}
        <BPPanel
          bpState={bpState}
          currentStep={currentStep}
          blueTeamPlayers={rosterState.blueTeam.players}
          redTeamPlayers={rosterState.redTeam.players}
          fearlessBannedChampions={fearlessBannedChampions}
          champions={champions}
          blueTeamName={rosterState.blueTeam.teamName || 'Blue Team'}
          redTeamName={rosterState.redTeam.teamName || 'Red Team'}
          blueTeamLogo={rosterState.blueTeam.teamLogo}
          redTeamLogo={rosterState.redTeam.teamLogo}
        />
      </div>

      {/* Search and Position Filters */}
      <div className="relative z-10 w-full px-4">
        <div className="relative w-full p-6 border-b border-white/5 bg-slate-950/50">
          <div className="flex items-start justify-center gap-8">
            {/* Left section - matches blue team width */}
            <div className="flex flex-col items-start gap-4" style={{ width: '600px' }}>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search..."
                    className="w-40 px-3 py-1.5 bg-slate-800/50 border border-white/10 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                <PositionFilter
                  selectedPosition={selectedPosition}
                  onSelect={setSelectedPosition}
                />
              </div>
            </div>

            {/* Center section - matches center width */}
            <div style={{ minWidth: '200px' }} />

            {/* Right section - matches red team width */}
            <div className="flex flex-col items-end gap-4" style={{ width: '600px' }}>
              <button
                onClick={handleFearlessModeToggle}
                className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-all duration-300 ${
                  fearlessModeEnabled
                    ? 'bg-amber-500/10 border-amber-500/50 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                    : 'border-white/10 text-slate-500 hover:text-slate-300'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span className="text-xs font-bold uppercase">Fearless: {fearlessModeEnabled ? 'ON' : 'OFF'}</span>
                {fearlessModeEnabled && (
                  <span className="text-xs text-slate-400 font-mono ml-2">
                    (click to ban)
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Champion Grid */}
      <div className="relative z-10 w-full px-4">
        <div className="relative w-full p-6">
          <div className="flex justify-center gap-8">
            <div style={{ width: '600px' }} />
            <div style={{ minWidth: '200px' }} />
            <div style={{ width: '600px' }} />
          </div>
          {loading ? (
            <div className="flex flex-col justify-center items-center h-64 gap-4">
              <img src="https://cdn.dreamofdragon.org/images/spinner/spinner.svg" alt="Loading" width={60} height={60} />
              <p className="text-slate-400">
                Loading champions...
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col justify-center items-center h-64 gap-4">
              <p className="text-rose-400">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 rounded-lg transition-colors"
              >
                Refresh
              </button>
            </div>
          ) : (
            <ChampionGrid
              champions={filteredChampions}
              usedChampions={allUsedChampions}
              onSelect={handleChampionSelect}
              disabled={isBPComplete(bpState)}
              fearlessPool={fearlessBannedChampions}
              shakeChampionId={shakeChampionId}
            />
          )}
        </div>
      </div>

      {/* Champion Count */}
      {!loading && !error && (
        <div className="relative z-10 px-4">
          <div className="relative w-full p-6 text-center text-slate-500 text-sm">
            {`${champions.length} champions${(searchTerm || selectedPosition) ? `, showing ${filteredChampions.length}` : ''}`}
          </div>
        </div>
      )}
    </div>
  );
}
