'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Champion, BPState, Position, AIControlMode, AIRecommendation, AIAnalysis, SeriesState, HistorySelectMode, MatchRosterState } from '@/app/lib/types';
import {
  createInitialState,
  selectChampion,
  undoLastAction,
  getCurrentStep,
  getPhaseDescription,
  isBPComplete
} from '@/app/lib/bp-logic';
import { getLatestVersion, getChampions } from '@/app/lib/champion-api';
import ChampionGrid from '@/app/components/ChampionGrid';
import BPPanel from '@/app/components/BPPanel';
import PhaseIndicator from '@/app/components/PhaseIndicator';
import ControlBar from '@/app/components/ControlBar';
import PositionFilter from '@/app/components/PositionFilter';
import { useModal } from '@/app/components/ModalProvider';
import AIControlPanel from '@/app/components/AIControlPanel';
import AIAnalysisPanel from '@/app/components/AIAnalysisPanel';
import SeriesSetup from '@/app/components/SeriesSetup';
import TeamRosterSetup from '@/app/components/TeamRosterSetup';
import { generateAIAnalysis } from '@/app/lib/ai-analysis';
import { calculatePTS, bpStateToDraftState } from '@/app/lib/pts-engine';

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
  const [aiMode, setAiMode] = useState<AIControlMode>('off');
  const [aiThinking, setAiThinking] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState<AIRecommendation | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [autoPlay, setAutoPlay] = useState(true);
  const aiTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fearless Draft state
  const [fearlessMode, setFearlessMode] = useState(false);
  const [seriesState, setSeriesState] = useState<SeriesState>({
    format: 'bo3',
    currentGame: 1,
    gameRecords: [],
    fearlessPool: new Set(),
  });
  const [historySelectMode, setHistorySelectMode] = useState<HistorySelectMode>('off');

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

  // Merge current game usedChampions with fearless pool
  const allUsedChampions = useMemo(() => {
    const combined = new Set(bpState.usedChampions);
    if (fearlessMode) {
      seriesState.fearlessPool.forEach(id => combined.add(id));
    }
    return combined;
  }, [bpState.usedChampions, fearlessMode, seriesState.fearlessPool]);

  // Get current step info
  const currentStep = getCurrentStep(bpState);
  const phaseDesc = getPhaseDescription(bpState.currentStep);

  // Get current team
  const currentTeam = currentStep?.team || 'blue';

  // Check if it's AI's turn
  const isAITurn = useMemo(() => {
    if (aiMode === 'off') return false;
    if (aiMode === 'both') return true;
    if (aiMode === 'blue' && currentTeam === 'blue') return true;
    if (aiMode === 'red' && currentTeam === 'red') return true;
    return false;
  }, [aiMode, currentTeam]);

  // Fallback random selection
  const getRandomChampion = useCallback(() => {
    const available = champions.filter(c => !allUsedChampions.has(c.id));
    if (available.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * available.length);
    return available[randomIndex];
  }, [champions, allUsedChampions]);

  // AI analysis generation (when BP state changes or AI mode is enabled)
  useEffect(() => {
    if (aiMode === 'off' || loading || champions.length === 0 || isBPComplete(bpState)) {
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

  // Handle champion selection
  const handleChampionSelect = (champion: Champion) => {
    // If in history select mode, add to history
    if (historySelectMode !== 'off') {
      handleAddToHistory(champion);
      return;
    }

    // Normal BP mode
    if (allUsedChampions.has(champion.id)) return;
    if (isBPComplete(bpState)) return;
    setBpState(selectChampion(bpState, champion));
  };

  // Handle undo
  const handleUndo = () => {
    setBpState(undoLastAction(bpState));
  };

  // Handle reset (also reset AI state)
  const handleReset = () => {
    setBpState(createInitialState());
    setAiThinking(false);
    setAiRecommendation(null);
    setAiAnalysis(null);
  };

  // Fearless Draft: Save progress to localStorage
  const handleSaveSeries = () => {
    const data = {
      format: seriesState.format,
      currentGame: seriesState.currentGame,
      gameRecords: seriesState.gameRecords,
      fearlessPool: Array.from(seriesState.fearlessPool),
    };
    localStorage.setItem('lol-fearless-series', JSON.stringify(data));
    showToast({ message: 'Progress saved!', type: 'success' });
  };

  // Fearless Draft: Load progress from localStorage
  const handleLoadSeries = () => {
    const saved = localStorage.getItem('lol-fearless-series');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setSeriesState({
          format: data.format,
          currentGame: data.currentGame,
          gameRecords: data.gameRecords,
          fearlessPool: new Set(data.fearlessPool),
        });
        setFearlessMode(true);
        showToast({ message: 'Progress loaded!', type: 'success' });
      } catch {
        showToast({ message: 'Load failed, invalid data', type: 'error' });
      }
    } else {
      showToast({ message: 'No saved progress', type: 'warning' });
    }
  };

  // Fearless Draft: Reset series
  const handleResetSeries = async () => {
    const confirmed = await confirm(
      'Reset the entire series?',
      'Reset Series'
    );
    if (confirmed) {
      setSeriesState({
        format: seriesState.format,
        currentGame: 1,
        gameRecords: [],
        fearlessPool: new Set(),
      });
      setBpState(createInitialState());
      setHistorySelectMode('off');
      showToast({ message: 'Series reset', type: 'success' });
    }
  };

  // Fearless Draft: Add champion to history
  const handleAddToHistory = (champion: Champion) => {
    if (historySelectMode === 'off') return;

    const targetGame = seriesState.currentGame - 1; // Add to previous game
    if (targetGame < 1) return;

    // Check if already in pool
    if (seriesState.fearlessPool.has(champion.id)) return;

    const existingRecord = seriesState.gameRecords.find(r => r.gameNumber === targetGame);
    const newRecords = [...seriesState.gameRecords];

    if (existingRecord) {
      const recordIndex = newRecords.findIndex(r => r.gameNumber === targetGame);
      if (historySelectMode === 'blue') {
        if (existingRecord.bluePicks.length >= 5) return; // Max 5 per team
        newRecords[recordIndex] = {
          ...existingRecord,
          bluePicks: [...existingRecord.bluePicks, champion.id],
        };
      } else {
        if (existingRecord.redPicks.length >= 5) return;
        newRecords[recordIndex] = {
          ...existingRecord,
          redPicks: [...existingRecord.redPicks, champion.id],
        };
      }
    } else {
      // Create new record
      newRecords.push({
        gameNumber: targetGame,
        bluePicks: historySelectMode === 'blue' ? [champion.id] : [],
        redPicks: historySelectMode === 'red' ? [champion.id] : [],
      });
      // Sort by game number
      newRecords.sort((a, b) => a.gameNumber - b.gameNumber);
    }

    // Update fearless pool
    const newPool = new Set<string>();
    newRecords.forEach(r => {
      r.bluePicks.forEach(id => newPool.add(id));
      r.redPicks.forEach(id => newPool.add(id));
    });

    setSeriesState({
      ...seriesState,
      gameRecords: newRecords,
      fearlessPool: newPool,
    });
  };

  return (
    <div className="min-h-screen text-white relative">
      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 text-center pt-4 sm:pt-6 pb-3 sm:pb-4 px-4"
      >
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
          LOL Ban/Pick Tool
        </h1>
        <p className="text-slate-400 mt-1.5 sm:mt-2 text-xs sm:text-sm">
          Tournament BP Rules
          {version && <span className="ml-2 text-slate-500">v{version}</span>}
        </p>
      </motion.div>

      {/* Fearless Draft Setup */}
      <div className="relative z-10 max-w-2xl mx-auto px-4">
        <SeriesSetup
          seriesState={seriesState}
          onSeriesStateChange={setSeriesState}
          fearlessMode={fearlessMode}
          onFearlessModeChange={setFearlessMode}
          historySelectMode={historySelectMode}
          onHistorySelectModeChange={setHistorySelectMode}
          onSave={handleSaveSeries}
          onLoad={handleLoadSeries}
          onReset={handleResetSeries}
          champions={champions}
        />
      </div>

      {/* Team Roster Setup */}
      <div className="relative z-10 max-w-2xl mx-auto px-4">
        <TeamRosterSetup
          rosterState={rosterState}
          onRosterStateChange={setRosterState}
        />
      </div>

      {/* AI Control Panel */}
      <div className="relative z-10 max-w-2xl mx-auto px-4">
        <AIControlPanel
          aiMode={aiMode}
          onModeChange={handleAIModeChange}
          isThinking={aiThinking}
          currentTeam={currentTeam}
          recommendation={aiRecommendation}
          autoPlay={autoPlay}
          onAutoPlayChange={setAutoPlay}
        />
      </div>

      {/* Phase Indicator */}
      <div className="relative z-10">
        <PhaseIndicator
          phase={phaseDesc}
          currentStep={currentStep}
        />
      </div>

      {/* BP Panel */}
      <div className="relative z-10">
        <BPPanel
          bpState={bpState}
          currentStep={currentStep}
        />
      </div>

      {/* AI Analysis Panel */}
      {aiMode !== 'off' && (
        <div className="relative z-10 max-w-4xl mx-auto px-4 my-4">
          <AIAnalysisPanel
            analysis={aiAnalysis}
            isThinking={aiThinking}
            currentTeam={currentTeam}
            currentAction={currentStep?.action || 'ban'}
            isAIEnabled={true}
          />
        </div>
      )}

      {/* Control Bar */}
      <div className="relative z-10">
        <ControlBar
          onUndo={handleUndo}
          onReset={handleReset}
          canUndo={bpState.history.length > 0}
          isComplete={isBPComplete(bpState)}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />
      </div>

      {/* Position Filter */}
      <div className="relative z-10">
        <PositionFilter
          selectedPosition={selectedPosition}
          onSelect={setSelectedPosition}
        />
      </div>

      {/* Champion Grid */}
      <div className="relative z-10">
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
            disabled={isBPComplete(bpState) && historySelectMode === 'off'}
            fearlessPool={fearlessMode ? seriesState.fearlessPool : undefined}
            historySelectMode={historySelectMode}
          />
        )}
      </div>

      {/* Champion Count */}
      {!loading && !error && (
        <div className="relative z-10 text-center pb-8 text-slate-500 text-sm">
          {`${champions.length} champions${(searchTerm || selectedPosition) ? `, showing ${filteredChampions.length}` : ''}`}
        </div>
      )}
    </div>
  );
}
