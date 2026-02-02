'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Champion, BPState, Position, AIControlMode, AIRecommendation, AIAnalysis, BanReason, MatchRosterState, PTSResult } from '@/app/lib/types';
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
import PTSRiskBoard from '@/app/components/PTSRiskBoard';
import OpponentAnalysisPanel from '@/app/components/OpponentAnalysisPanel';
import BanScoringPanel from '@/app/components/BanScoringPanel';
import { initGameTheoryState, updateBelief, GameTheoryState } from '@/app/lib/hybrid-game-theory';
import { BanScoreResult } from '@/app/lib/advanced-ban-scoring.types';
import { getChampionStatsMap } from '@/app/lib/champion-stats-helper';

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

  // Game Theory state - 默认启用
  const [gameTheoryState, setGameTheoryState] = useState<GameTheoryState>(initGameTheoryState());
  const enableGameTheory = true; // 始终启用博弈论分析

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

  // AI Panel collapse state
  const [aiPanelCollapsed, setAiPanelCollapsed] = useState(false);

  // Initialize draft data analyzer on mount
  useEffect(() => {
    async function initDraftData() {
      try {
        console.log('[BP Page] Initializing draft data analyzer...');
        const response = await fetch('/api/lol/draft-data');
        const result = await response.json();
        if (result.success) {
          console.log('[BP Page] Draft data initialized:', result.stats);
        } else {
          console.warn('[BP Page] Draft data initialization failed:', result.error);
        }
      } catch (err) {
        console.warn('[BP Page] Could not initialize draft data:', err);
      }
    }
    initDraftData();
  }, []);

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

  // PTS results state
  const [ptsResults, setPtsResults] = useState<PTSResult[]>([]);
  const [ptsLoading, setPtsLoading] = useState(false);

  // Ban Scoring results state
  const [banScoringResults, setBanScoringResults] = useState<BanScoreResult[]>([]);
  const [banScoringLoading, setBanScoringLoading] = useState(false);

  // Calculate PTS for current draft state using server-side API
  // This ensures we use real draft data for calculations
  useEffect(() => {
    async function calculatePTSServerSide() {
      console.log(`[PTS Client] useEffect triggered:`, {
        currentStep: currentStep?.team,
        loading,
        championsLength: champions.length,
        isComplete: isBPComplete(bpState),
        usedChampions: allUsedChampions.size,
      });

      if (!currentStep || loading || champions.length === 0 || isBPComplete(bpState)) {
        console.log(`[PTS Client] Skipping PTS calculation - conditions not met`);
        setPtsResults([]);
        return;
      }

      setPtsLoading(true);
      try {
        const availableChamps = champions.filter(c => !allUsedChampions.has(c.id));

        console.log(`[PTS Client] Requesting calculation for step ${bpState.currentStep}, team ${currentStep.team}, ${availableChamps.length} available champions`);
        console.log(`[PTS Client] Total champions: ${champions.length}, Used: ${allUsedChampions.size}, Available: ${availableChamps.length}`);
        console.log(`[PTS Client] Game Theory enabled: ${enableGameTheory}, Opponent: ${gameTheoryState.predictedType}, Confidence: ${(gameTheoryState.confidence * 100).toFixed(0)}%`);

        const requestBody = {
          bpState,
          currentStep,
          availableChampions: availableChamps,
          gameTheoryState: enableGameTheory ? gameTheoryState : undefined,
          enableGameTheory,
        };

        console.log(`[PTS Client] Request body size: ${JSON.stringify(requestBody).length} bytes`);

        const response = await fetch('/api/lol/pts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        console.log(`[PTS Client] Response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[PTS Client] HTTP Error ${response.status}:`, errorText);
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.success && data.results) {
          setPtsResults(data.results);
          console.log(`[PTS Client] Received ${data.results.length} results`);
          if (data.metadata) {
            console.log(`[PTS Client] Metadata:`, {
              gameTheoryEnabled: data.metadata.gameTheoryEnabled,
              opponentType: data.metadata.opponentType,
              confidence: data.metadata.confidence,
            });
          }
          if (data.results.length > 0) {
            console.log(`[PTS Client] Top 3:`, data.results.slice(0, 3).map((r: PTSResult) => ({
              name: r.championName,
              pts: r.pts.toFixed(1),
              reason: r.explanation
            })));
          }
        } else {
          console.error('[PTS Client] Failed to get PTS results:', data.error);
          setPtsResults([]);
        }
      } catch (error) {
        console.error('[PTS Client] Error calculating PTS:', error);
        if (error instanceof Error) {
          console.error('[PTS Client] Error details:', {
            message: error.message,
            stack: error.stack,
          });
        }
        setPtsResults([]);
      } finally {
        setPtsLoading(false);
      }
    }

    calculatePTSServerSide();
  }, [bpState.currentStep, bpState.bluePicks, bpState.redPicks, bpState.blueBans, bpState.redBans, currentStep, champions, allUsedChampions, loading, bpState]);

  // Calculate Ban Scoring for ban phases
  useEffect(() => {
    async function calculateBanScoring() {
      console.log('[Ban Scoring] useEffect triggered:', {
        currentStep: currentStep?.action,
        loading,
        championsLength: champions.length,
        isComplete: isBPComplete(bpState),
        rosterEnabled: rosterState.enabled,
      });

      // Only calculate during ban phases
      if (!currentStep || loading || champions.length === 0 || isBPComplete(bpState)) {
        console.log('[Ban Scoring] Skipping - basic conditions not met');
        setBanScoringResults([]);
        return;
      }

      // Check if current action is a ban
      if (currentStep.action !== 'ban') {
        console.log('[Ban Scoring] Skipping - not a ban phase');
        setBanScoringResults([]);
        return;
      }

      // Check if enemy team is selected
      const hasEnemyTeam = rosterState.enabled;

      if (!hasEnemyTeam) {
        console.log('[Ban Scoring] Team Roster not enabled, skipping calculation');
        setBanScoringResults([]);
        return;
      }

      console.log('[Ban Scoring] Starting calculation with Team Roster enabled');

      setBanScoringLoading(true);
      try {
        // 确定敌方队伍
        const enemyTeam = userSide === 'blue' ? rosterState.redTeam : rosterState.blueTeam;
        const enemyPlayers = enemyTeam.players.filter(p => p !== null);

        console.log('[Ban Scoring] Enemy team:', {
          teamName: enemyTeam.teamName,
          playerCount: enemyPlayers.length,
          players: enemyPlayers.map(p => ({ id: p?.id, name: p?.name })),
        });

        // 获取敌方选手的英雄池数据
        let enemyTeamPool = null;
        if (enemyPlayers.length > 0) {
          try {
            const playerIds = enemyPlayers.map(p => p!.id).join(',');
            const poolsResponse = await fetch(`/api/lol/player-pools?playerIds=${playerIds}`);
            const poolsData = await poolsResponse.json();

            if (poolsData.success && poolsData.playerPools) {
              console.log('[Ban Scoring] Fetched player pools:', {
                totalPlayers: poolsData.totalPlayers,
                playerIds: Object.keys(poolsData.playerPools),
              });

              // 构建队伍英雄池
              const { buildTeamChampionPool } = await import('@/app/lib/team-champion-pool');
              const playerPoolsMap = new Map(Object.entries(poolsData.playerPools)) as Map<string, any>;

              const playersInTeam = enemyPlayers.map((p, index) => ({
                playerId: p!.id,
                playerName: p!.name,
                position: ['top', 'jungle', 'mid', 'bot', 'support'][index] as 'top' | 'jungle' | 'mid' | 'bot' | 'support',
                orderIndex: index,
              }));

              enemyTeamPool = await buildTeamChampionPool(
                enemyTeam.teamName || 'Enemy Team',
                enemyTeam.teamName || 'Enemy Team',
                playersInTeam,
                champions,
                playerPoolsMap
              );

              console.log('[Ban Scoring] Built enemy team pool:', {
                teamName: enemyTeamPool.teamName,
                totalChampions: enemyTeamPool.championAvailability.size,
                highProficiency: enemyTeamPool.highProficiencyChampions.length,
                flexibleChampions: enemyTeamPool.flexibleChampions.length,
              });

              // 转换 Map 为对象以便序列化
              const championAvailabilityObject: Record<string, any> = {};
              enemyTeamPool.championAvailability.forEach((value, key) => {
                championAvailabilityObject[key] = value;
              });

              enemyTeamPool = {
                ...enemyTeamPool,
                championAvailability: championAvailabilityObject,
              } as any;
            } else {
              console.warn('[Ban Scoring] Failed to fetch player pools:', poolsData.error);
            }
          } catch (error) {
            console.error('[Ban Scoring] Error fetching player pools:', error);
          }
        }

        // 获取英雄统计数据
        const championIds = champions.map(c => c.id);
        const statsMap = getChampionStatsMap(championIds);

        // 转换 Map 为普通对象以便序列化
        const statsObject: Record<string, { winRate: number; banRate: number; pickRate: number }> = {};
        statsMap.forEach((value, key) => {
          statsObject[key] = value;
        });

        const requestBody = {
          allChampions: champions,
          bpState,
          enemyTeamPool,
          championStatsMap: statsObject,
          topN: 3, // 只请求 Top 3
          useAI: true, // 使用 Ollama qwen2.5:3b 模型生成推荐理由
        };

        const response = await fetch('/api/lol/ban-scoring', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        console.log('[Ban Scoring Client] Response data:', {
          success: data.success,
          recommendationsCount: data.recommendations?.length || 0,
          firstRecommendation: data.recommendations?.[0],
        });

        if (data.success && data.recommendations) {
          setBanScoringResults(data.recommendations);
          console.log(`[Ban Scoring Client] Set ${data.recommendations.length} recommendations`);
          if (data.recommendations.length > 0) {
            console.log('[Ban Scoring Client] Top 3:', data.recommendations.slice(0, 3).map((r: any) => ({
              name: r.championName,
              score: r.finalScore.toFixed(1),
              priority: r.priority,
            })));
          }
        } else {
          console.error('[Ban Scoring Client] Failed to get recommendations:', data.error);
          setBanScoringResults([]);
        }
      } catch (error) {
        console.error('[Ban Scoring] Error calculating ban scores:', error);
        setBanScoringResults([]);
      } finally {
        setBanScoringLoading(false);
      }
    }

    calculateBanScoring();
  }, [bpState.currentStep, currentStep, champions, allUsedChampions, loading, bpState, rosterState, userSide]);

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

  // AI analysis generation (always generate when BP state changes)
  useEffect(() => {
    if (loading || champions.length === 0 || isBPComplete(bpState)) {
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
  }, [bpState.currentStep, champions.length, loading]);

  // Handle AI mode change
  const handleAIModeChange = (mode: AIControlMode) => {
    setAiMode(mode);
    setAiThinking(false);
    setAiRecommendation(null);
    // If AI is enabled, generate analysis immediately
    if (mode === 'assistant' && currentStep && champions.length > 0) {
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

    const currentStep = getCurrentStep(bpState);
    if (!currentStep) return;

    // Update BP state
    const newBpState = selectChampion(bpState, champion);
    setBpState(newBpState);

    // Update Game Theory state if opponent made the move
    if (enableGameTheory && currentStep.team !== userSide) {
      console.log(`[Game Theory] Observing opponent action: ${champion.name} (${currentStep.action})`);

      const ourPicks = userSide === 'blue' ? bpState.bluePicks : bpState.redPicks;
      const ourLastPick = ourPicks.filter(p => p !== null).slice(-1)[0] || undefined;

      const opponentRoles = userSide === 'blue'
        ? getRemainingRoles(bpState.redPicks)
        : getRemainingRoles(bpState.bluePicks);

      const newGameState = updateBelief(
        gameTheoryState,
        {
          champion,
          step: bpState.currentStep,
          action: currentStep.action,
          context: {
            ourLastPick,
            availableRoles: opponentRoles,
          },
        },
        bpState
      );

      setGameTheoryState(newGameState);
      console.log(`[Game Theory] Updated belief:`, {
        predictedType: newGameState.predictedType,
        confidence: (newGameState.confidence * 100).toFixed(0) + '%',
        belief: Object.entries(newGameState.belief)
          .map(([type, prob]) => `${type}: ${(prob * 100).toFixed(0)}%`)
          .join(', '),
      });
    }
  };

  // Helper function to get remaining roles
  function getRemainingRoles(picks: (Champion | null)[]): Position[] {
    const allRoles: Position[] = ['top', 'jungle', 'mid', 'bot', 'support'];
    const filledRoles = new Set<Position>();

    picks.forEach(pick => {
      if (pick && pick.positions.length === 1) {
        filledRoles.add(pick.positions[0]);
      }
    });

    return allRoles.filter(role => !filledRoles.has(role));
  }

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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white relative overflow-hidden">
      {/* Background Gradients - Softer */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-cyan-900/10 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-rose-900/10 rounded-full blur-[120px] translate-x-1/2 translate-y-1/2" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDIpIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-[0.02]" />
      </div>

      {/* Grid Layout: Sidebar + Main Content */}
      <div className="grid grid-cols-[auto_1fr] min-h-screen relative z-10">
        {/* Left Sidebar - AI Hints Panel */}
        <aside
          className={`
            transition-all duration-300 ease-in-out
            ${aiPanelCollapsed ? 'w-12' : 'w-[280px]'}
            bg-slate-900/40 backdrop-blur-md
            border-r border-white/5
            shadow-lg
            relative
          `}
          style={{ zIndex: 10 }}
        >
          {/* Collapse Toggle Button */}
          <button
            onClick={() => setAiPanelCollapsed(!aiPanelCollapsed)}
            className="absolute top-4 right-2 z-20 w-6 h-6 flex items-center justify-center rounded bg-slate-800/50 hover:bg-slate-700/50 border border-white/10 transition-colors"
            title={aiPanelCollapsed ? 'Expand AI Hints' : 'Collapse AI Hints'}
            translate="no"
          >
            <svg className={`w-3 h-3 transition-transform ${aiPanelCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* AI Panel Content */}
          {!aiPanelCollapsed && !isBPComplete(bpState) && (
            <div className="h-full overflow-y-auto p-4 space-y-4">
              {/* Opponent Analysis Panel */}
              <OpponentAnalysisPanel
                gameState={gameTheoryState}
              />

              {/* Ban Scoring Panel - Show during ban phases and only if Team Roster is enabled */}
              {currentStep?.action === 'ban' && champions.length > 0 && rosterState.enabled && (
                <BanScoringPanel
                  recommendations={banScoringResults}
                  onSelectChampion={(championId) => {
                    const champion = champions.find(c => c.id === championId);
                    if (champion && !allUsedChampions.has(championId)) {
                      handleChampionSelect(champion);
                    }
                  }}
                  allChampions={champions}
                  isLoading={banScoringLoading}
                />
              )}

              {/* PTS Risk Board - Show during pick phases */}
              {currentStep?.action === 'pick' && ptsResults.length > 0 && (
                <PTSRiskBoard
                  ptsResults={ptsResults}
                  currentTurn={draftContext.currentTurn}
                  ourSide={currentTeam}
                  nextOpponentActions={draftContext.nextOpponentActions}
                  isUserTurn={currentTeam === userSide}
                  blueTeamName={rosterState.blueTeam.teamName}
                  redTeamName={rosterState.redTeam.teamName}
                  bluePicks={bpState.bluePicks}
                  redPicks={bpState.redPicks}
                  champions={champions}
                  bpState={bpState}
                  currentStep={currentStep}
                  onChampionClick={(championId) => {
                    const champion = champions.find(c => c.id === championId);
                    if (champion && !allUsedChampions.has(championId)) {
                      handleChampionSelect(champion);
                    }
                  }}
                />
              )}
            </div>
          )}

          {/* Collapsed State Icon */}
          {aiPanelCollapsed && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          )}
        </aside>

        {/* Main Content Area */}
        <main className="flex flex-col">
      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative text-center pt-4 pb-3 px-4"
      >
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent leading-tight pb-1" translate="no">
          Stage-Aware Draft Assistant
        </h1>
        <p className="text-slate-400 mt-2 text-xs sm:text-sm" translate="no">
          Real-time risk and timing analysis for professional drafts
          {version && <span className="ml-2 text-slate-500">v{version}</span>}
        </p>
      </motion.div>

      {/* Header with Phase Indicator */}
      <header className="relative h-16 w-full flex items-center justify-between px-8 border-b border-white/5 bg-slate-950/80 backdrop-blur-md" style={{ zIndex: 40 }}>
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
            <span className="text-xs font-bold uppercase">Reset Draft</span>
          </button>

          <button
            onClick={handleLoadDemo}
            className="flex items-center gap-2 px-3 py-1.5 rounded border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-all duration-300"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs font-bold uppercase">Load Demo Scenario</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Your Team:</span>
            <button
              onClick={() => {
                setUserSide('blue');
                setAiMode('assistant');
              }}
              className={`px-3 py-1.5 rounded border text-xs font-bold uppercase transition-all duration-300 ${
                aiMode === 'assistant' && userSide === 'blue'
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.2)]'
                  : 'border-white/10 text-slate-500 hover:text-slate-300'
              }`}
            >
              {rosterState.blueTeam.teamName || 'Blue'}
            </button>
            <button
              onClick={() => {
                setUserSide('red');
                setAiMode('assistant');
              }}
              className={`px-3 py-1.5 rounded border text-xs font-bold uppercase transition-all duration-300 ${
                aiMode === 'assistant' && userSide === 'red'
                  ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.2)]'
                  : 'border-white/10 text-slate-500 hover:text-slate-300'
              }`}
            >
              {rosterState.redTeam.teamName || 'Red'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area - BP Panel centered */}
      <div className="relative mt-8 w-full" style={{ zIndex: 20 }}>
        <div className="w-full px-4 sm:px-6 lg:px-8">
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
      </div>

      {/* Search and Position Filters */}
      <div className="relative mt-6 w-full">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center gap-4 p-4 bg-slate-900/30 rounded-lg">
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search champions..."
                className="w-48 px-3 py-1.5 bg-slate-800/50 border border-white/10 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
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
      </div>

      {/* Champion Grid */}
      <div className="relative mt-6 w-full">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          {loading ? (
            <div className="flex flex-col justify-center items-center h-64 gap-4">
              <div className="w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
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
        <div className="relative mt-4 mb-12">
          <div className="w-full px-4 sm:px-6 lg:px-8 text-center text-slate-500 text-sm">
            {`${champions.length} champions${(searchTerm || selectedPosition) ? `, showing ${filteredChampions.length}` : ''}`}
          </div>
        </div>
      )}
        </main>
        {/* End Main Content */}
      </div>
      {/* End Grid Layout */}
    </div>
  );
}
