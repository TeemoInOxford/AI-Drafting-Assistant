'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Champion, BPState, Position, ChampionClass, AIControlMode, AIRecommendation, AIAnalysis, BanReason, MatchRosterState, ProPlayer } from '@/app/lib/types';
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
import DropDownClassFilter from '@/app/components/DropDownClassFilter';
import { useModal } from '@/app/components/ModalProvider';
import AIControlPanel from '@/app/components/AIControlPanel';
import { generateAIAnalysis } from '@/app/lib/ai-analysis';
import { calculatePTS, bpStateToDraftState } from '@/app/lib/pts-engine';
import PTSRiskBoard from '@/app/components/PTSRiskBoard';
import BanPhaseDraftingAssistant from '@/app/components/BanPhaseDraftingAssistant';
import PickPhaseDraftingAssistant from '@/app/components/PickPhaseDraftingAssistant';
import ThreatDebugPanel from '@/app/components/ThreatDebugPanel';
import { ThreatSignal, ThreatLevel } from '@/app/lib/threat-types';
import BPWizard, { WizardResult } from '@/app/components/BPWizard';
import NextBanPredictionBadge from '@/app/components/NextBanPredictionBadge';
import { type LeagueKey, LEAGUE_LABELS, isValidLeagueKey, migrateRegionToLeague } from '@/app/lib/league-types';

const BP_WIZARD_STORAGE_KEY = 'bp-wizard-state';
const BP_WIZARD_VERSION = 2; // bump this to invalidate old localStorage data

export default function LOLBPPage() {
  const { showToast, confirm, alert: showAlert } = useModal();
  const [champions, setChampions] = useState<Champion[]>([]);
  const [bpState, setBpState] = useState<BPState>(createInitialState());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [version, setVersion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [selectedClass, setSelectedClass] = useState<ChampionClass | null>(null);

  // Context Filter state (League adjustment)
  const [selectedLeague, setSelectedLeague] = useState<LeagueKey>('global');

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

  // Threat Debug Panel state (dev-only)
  const [threatDebugOpen, setThreatDebugOpen] = useState(false);

  // Threat data for ChampionGrid
  const [threatDataMap, setThreatDataMap] = useState<Map<string, { level: ThreatLevel; score: number }>>(new Map());
  const [allThreatScores, setAllThreatScores] = useState<number[]>([]);

  // AI Panel collapsed state (default: expanded)
  const [aiPanelCollapsed, setAiPanelCollapsed] = useState(false);

  // Region fallback count from PTSRiskBoard
  const [fallbackCount, setFallbackCount] = useState(0);

  // Reset fallbackCount when switching to global league
  useEffect(() => {
    if (selectedLeague === 'global') {
      setFallbackCount(0);
    }
  }, [selectedLeague]);

  // Debug: log selectedLeague changes
  useEffect(() => {
    console.log('[BP] selectedLeague changed:', selectedLeague);
  }, [selectedLeague]);

  // Wizard state
  const [showWizard, setShowWizard] = useState(false);
  const [wizardInitialValues, setWizardInitialValues] = useState<Partial<WizardResult> | undefined>(undefined);
  const [wizardChecked, setWizardChecked] = useState(false);

  // Check localStorage for wizard state on mount
  useEffect(() => {
    const stored = localStorage.getItem(BP_WIZARD_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Invalidate old format data (missing version or wrong version)
        if (!parsed._v || parsed._v < BP_WIZARD_VERSION) {
          localStorage.removeItem(BP_WIZARD_STORAGE_KEY);
          setShowWizard(true);
          setWizardChecked(true);
          return;
        }
        const result = parsed as WizardResult;
        setWizardInitialValues(result);
        applyWizardResult(result);
      } catch {
        localStorage.removeItem(BP_WIZARD_STORAGE_KEY);
        setShowWizard(true);
      }
    } else {
      setShowWizard(true);
    }
    setWizardChecked(true);
  }, []);

  // Convert RoleSlot array to ProPlayer array
  const roleSlotToProPlayers = useCallback((slots: { role: string; playerId: string; playerName: string }[], teamId: string): (ProPlayer | null)[] => {
    const roleIndexMap: Record<string, number> = {
      'top': 0,
      'jungle': 1,
      'mid': 2,
      'bot': 3,
      'support': 4,
    };
    const roster: (ProPlayer | null)[] = [null, null, null, null, null];
    for (const slot of slots) {
      const idx = roleIndexMap[slot.role];
      if (idx !== undefined && slot.playerId) {
        roster[idx] = {
          id: slot.playerId,
          name: slot.playerName,
          teamId: teamId,
        };
      }
    }
    return roster;
  }, []);

  // Apply wizard result to state
  const applyWizardResult = useCallback((result: WizardResult) => {
    // Set user side and AI mode
    setUserSide(result.side);
    setAiMode('assistant');

    // Set league (handle both new league field and legacy region field)
    if (result.league && isValidLeagueKey(result.league)) {
      setSelectedLeague(result.league);
    } else if (result.region) {
      // Migration from old region format using shared migrateRegionToLeague
      setSelectedLeague(migrateRegionToLeague(result.region));
    } else {
      setSelectedLeague('global');
    }

    // Determine which team is blue/red
    const isUserBlue = result.side === 'blue';
    const blueTeamId = isUserBlue ? result.ourTeamId : result.opponentTeamId;
    const blueTeamName = isUserBlue ? result.ourTeamName : result.opponentTeamName;
    const blueTeamLogo = isUserBlue ? result.ourTeamLogo : result.opponentTeamLogo;
    const redTeamId = isUserBlue ? result.opponentTeamId : result.ourTeamId;
    const redTeamName = isUserBlue ? result.opponentTeamName : result.ourTeamName;
    const redTeamLogo = isUserBlue ? result.opponentTeamLogo : result.ourTeamLogo;

    // Convert rosters from wizard format to ProPlayer format
    const ourRosterPlayers = result.ourRoster ? roleSlotToProPlayers(result.ourRoster, result.ourTeamId) : [null, null, null, null, null];
    const oppRosterPlayers = result.oppRoster ? roleSlotToProPlayers(result.oppRoster, result.opponentTeamId) : [null, null, null, null, null];

    const blueRoster = isUserBlue ? ourRosterPlayers : oppRosterPlayers;
    const redRoster = isUserBlue ? oppRosterPlayers : ourRosterPlayers;

    // Update roster state
    setRosterState({
      enabled: true,
      blueTeam: {
        teamId: blueTeamId,
        teamName: blueTeamName,
        teamLogo: blueTeamLogo || undefined,
        players: blueRoster,
      },
      redTeam: {
        teamId: redTeamId,
        teamName: redTeamName,
        teamLogo: redTeamLogo || undefined,
        players: redRoster,
      },
    });
  }, [roleSlotToProPlayers]);

  // Handle wizard completion
  const handleWizardComplete = useCallback((result: WizardResult) => {
    console.log('[BP] handleWizardComplete called with result:', {
      league: result.league,
      region: result.region,
      side: result.side,
    });

    // Handle localStorage based on rememberSettings
    if (result.rememberSettings) {
      localStorage.setItem(BP_WIZARD_STORAGE_KEY, JSON.stringify({ ...result, _v: BP_WIZARD_VERSION }));
    } else {
      // Clear any existing saved data if user unchecks remember
      localStorage.removeItem(BP_WIZARD_STORAGE_KEY);
    }

    // Apply the result
    applyWizardResult(result);

    // Close wizard
    setShowWizard(false);
  }, [applyWizardResult]);

  // Handle wizard cancel (only if there's existing state)
  const handleWizardCancel = useCallback(() => {
    const stored = localStorage.getItem(BP_WIZARD_STORAGE_KEY);
    if (stored) {
      // There's existing state, allow cancel
      setShowWizard(false);
    }
    // If no existing state, don't allow cancel (wizard is required)
  }, []);

  // Function to re-open wizard
  const openWizard = useCallback(() => {
    const stored = localStorage.getItem(BP_WIZARD_STORAGE_KEY);
    if (stored) {
      try {
        setWizardInitialValues(JSON.parse(stored));
      } catch {
        setWizardInitialValues(undefined);
      }
    }
    setShowWizard(true);
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

  // Filter champions (search + position + class)
  const filteredChampions = useMemo(() => {
    let result = champions;

    // Position filter
    if (selectedPosition) {
      result = result.filter(c => c.positions.includes(selectedPosition));
    }

    // Class filter
    if (selectedClass) {
      result = result.filter(c => c.class === selectedClass);
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
  }, [champions, searchTerm, selectedPosition, selectedClass]);

  // Used champions
  const allUsedChampions = useMemo(() => {
    return bpState.usedChampions;
  }, [bpState.usedChampions]);

  // Helper: normalize champion name from various data structures
  const normalizeChampionName = useCallback((x: unknown): string | null => {
    if (!x) return null;
    // String case
    if (typeof x === 'string') {
      const trimmed = x.trim();
      return trimmed.length > 0 ? trimmed.toLowerCase() : null;
    }
    // Object case (Champion, BanEntry, PickEntry, etc.)
    if (typeof x === 'object') {
      const obj = x as Record<string, unknown>;
      // Try direct name/id fields
      if (typeof obj.name === 'string' && obj.name.trim()) return obj.name.trim().toLowerCase();
      if (typeof obj.id === 'string' && obj.id.trim()) return obj.id.trim().toLowerCase();
      // Try nested champion object (BanEntry: { champion: { name } })
      if (obj.champion && typeof obj.champion === 'object') {
        const champ = obj.champion as Record<string, unknown>;
        if (typeof champ.name === 'string' && champ.name.trim()) return champ.name.trim().toLowerCase();
        if (typeof champ.id === 'string' && champ.id.trim()) return champ.id.trim().toLowerCase();
      }
    }
    return null;
  }, []);

  // Helper: extract champion ID from various data structures (BanEntry, PickEntry, Champion, null)
  const normalizeChampionId = useCallback((x: unknown): string | null => {
    if (!x) return null;
    // String case (already an ID)
    if (typeof x === 'string') {
      const trimmed = x.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    // Object case
    if (typeof x === 'object') {
      const obj = x as Record<string, unknown>;
      // Direct id field (Champion type)
      if (typeof obj.id === 'string' && obj.id.trim()) return obj.id.trim();
      // Nested champion object (BanEntry/PickEntry: { champion: { id } })
      if (obj.champion && typeof obj.champion === 'object') {
        const champ = obj.champion as Record<string, unknown>;
        if (typeof champ.id === 'string' && champ.id.trim()) return champ.id.trim();
      }
    }
    return null;
  }, []);

  // Unified disabled champions set (by lowercase name)
  // Includes: all bans + all picks + fearless pool
  const disabledChampionNames = useMemo(() => {
    const set = new Set<string>();

    // Add all bans (BanEntry[] - may have null champion)
    for (const entry of [...bpState.blueBans, ...bpState.redBans]) {
      const name = normalizeChampionName(entry);
      if (name) set.add(name);
    }

    // Add all picks (Champion | null)
    for (const entry of [...bpState.bluePicks, ...bpState.redPicks]) {
      const name = normalizeChampionName(entry);
      if (name) set.add(name);
    }

    // Add fearless pool (champion IDs - need to convert to names)
    // fearlessBannedChampions stores champion.id, we need to match by id or name
    for (const champId of fearlessBannedChampions) {
      // Champion IDs are typically PascalCase like "Aatrox", "LeeSin"
      // Normalize to lowercase
      set.add(champId.toLowerCase());
    }

    return set;
  }, [bpState.blueBans, bpState.redBans, bpState.bluePicks, bpState.redPicks, fearlessBannedChampions, normalizeChampionName]);

  // Also create a Set of disabled champion IDs for Grid compatibility
  // Fix 2: Derive from blueBans/redBans/bluePicks/redPicks instead of bpState.usedChampions
  const disabledChampionIds = useMemo(() => {
    const set = new Set<string>();

    // From all bans and picks - extract champion.id using normalizeChampionId
    const allEntries = [
      ...bpState.blueBans,
      ...bpState.redBans,
      ...bpState.bluePicks,
      ...bpState.redPicks,
    ];

    for (const entry of allEntries) {
      const id = normalizeChampionId(entry);
      if (id) set.add(id);
    }

    // From fearless pool (already stores IDs)
    for (const id of fearlessBannedChampions) {
      set.add(id);
    }

    return set;
  }, [bpState.blueBans, bpState.redBans, bpState.bluePicks, bpState.redPicks, fearlessBannedChampions, normalizeChampionId]);

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

  // Get our team info for ban blueprint
  const ourTeamInfo = useMemo(() => {
    const ourRoster = userSide === 'blue' ? rosterState.blueTeam : rosterState.redTeam;
    return {
      teamId: ourRoster.teamId || null,
      teamName: ourRoster.teamName,
    };
  }, [userSide, rosterState]);

  // Get opponent team info for threat signals
  const opponentTeamInfo = useMemo(() => {
    const opponentSide = userSide === 'blue' ? 'red' : 'blue';
    const opponentRoster = opponentSide === 'blue' ? rosterState.blueTeam : rosterState.redTeam;

    // Extract team ID from first player's teamId if available
    const firstPlayer = opponentRoster.players.find(p => p !== null);
    const teamId = opponentRoster.teamId || firstPlayer?.teamId || null;

    // Get player IDs and names
    const playerIds: string[] = [];
    const playerNames: Record<string, string> = {};

    opponentRoster.players.forEach(player => {
      if (player) {
        playerIds.push(player.id);
        playerNames[player.id] = player.name;
      }
    });

    return {
      teamId,
      teamName: opponentRoster.teamName,
      playerIds,
      playerNames,
    };
  }, [userSide, rosterState]);

  // Calculate draft ban context for BanBlueprintCard prediction
  const draftBanContext = useMemo(() => {
    if (!currentStep || currentStep.action !== 'ban') {
      return null;
    }

    // Ban phase 1: steps 0-5 (B1-B3 for each team)
    // Ban phase 2: steps 12-15 (B4-B5 for each team)
    const stepIdx = bpState.currentStep;

    // Determine ban slot (1, 2, or 3 for early bans)
    // Early bans: 0=blue B1, 1=red B1, 2=blue B2, 3=red B2, 4=blue B3, 5=red B3
    let banSlot: 1 | 2 | 3;
    if (stepIdx < 6) {
      // Early ban phase
      banSlot = (Math.floor(stepIdx / 2) + 1) as 1 | 2 | 3;
    } else {
      // Late bans (steps 12-15) - we only support early bans (1-3) for now
      return null;
    }

    const banningSide = currentStep.team;
    const banningRoster = banningSide === 'blue' ? rosterState.blueTeam : rosterState.redTeam;

    // Get opponent's last ban (the most recent ban by the other team)
    let opponentLastBan: string | null = null;
    if (stepIdx > 0) {
      // Look at the previous ban (opponent's)
      const oppBans = banningSide === 'blue' ? bpState.redBans : bpState.blueBans;
      if (oppBans.length > 0) {
        opponentLastBan = oppBans[oppBans.length - 1]?.name || null;
      }
    }

    // All already banned champions
    const alreadyBanned = [
      ...bpState.blueBans.map(c => c?.name).filter(Boolean),
      ...bpState.redBans.map(c => c?.name).filter(Boolean),
    ] as string[];

    return {
      isBanPhase: true,
      banningTeamId: banningRoster.teamId || null,
      banningTeamName: banningRoster.teamName,
      banningSide,
      banSlot,
      opponentLastBan,
      alreadyBanned,
    };
  }, [currentStep, bpState, rosterState]);

  // Fetch threat data for ChampionGrid when opponent team is selected
  // Prefer grid_v2 source, fallback to legacy
  useEffect(() => {
    if (!opponentTeamInfo.teamId) {
      setThreatDataMap(new Map());
      setAllThreatScores([]);
      return;
    }

    async function fetchThreatData() {
      try {
        // Try grid_v2 source first
        let data: any = null;
        const gridRes = await fetch(
          `/api/threat-signals?action=allTeam&source=grid_v2&team_id=${opponentTeamInfo.teamId}&_=${Date.now()}`
        );
        if (gridRes.ok) {
          const gridData = await gridRes.json();
          if (gridData.success && gridData.data && Object.keys(gridData.data).length > 0) {
            data = gridData;
          }
        }

        // Fallback to legacy
        if (!data) {
          const legacyRes = await fetch(
            `/api/threat-signals?action=allTeam&targetTeamId=${opponentTeamInfo.teamId}&league=${selectedLeague}`
          );
          if (legacyRes.ok) {
            data = await legacyRes.json();
          }
        }

        if (data?.success && data?.data) {
          const scores: number[] = [];
          Object.values(data.data).forEach((signal: unknown) => {
            scores.push((signal as ThreatSignal).score);
          });

          // Calculate threat levels based on non-zero scores
          const nonZeroScores = scores.filter(s => s > 0);
          nonZeroScores.sort((a, b) => b - a);

          const highThreshold = nonZeroScores.length > 0
            ? nonZeroScores[Math.floor(nonZeroScores.length * 0.2)] || 0
            : 0;
          const moderateThreshold = nonZeroScores.length > 0
            ? nonZeroScores[Math.floor(nonZeroScores.length * 0.4)] || 0
            : 0;

          const threatMap = new Map<string, { level: ThreatLevel; score: number }>();
          Object.entries(data.data).forEach(([championName, signal]) => {
            const score = (signal as ThreatSignal).score;
            let level: ThreatLevel = 'low';
            if (score > 0) {
              if (score >= highThreshold) level = 'high';
              else if (score >= moderateThreshold) level = 'moderate';
            }
            threatMap.set(championName, { level, score });
          });

          setThreatDataMap(threatMap);
          setAllThreatScores(scores);
        }
      } catch (error) {
        console.error('Failed to fetch threat data:', error);
        setThreatDataMap(new Map());
        setAllThreatScores([]);
      }
    }

    fetchThreatData();
  }, [opponentTeamInfo.teamId, selectedLeague]);

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

    // HARD BLOCK: Check unified disabled set (by ID)
    if (disabledChampionIds.has(champion.id)) {
      console.warn(`[BP] Blocked: ${champion.name} (${champion.id}) is already used or fearless banned`);
      return;
    }

    // Normal BP logic
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

  return (
    <div className="min-h-screen bg-slate-950 text-white relative flex flex-col">
      {/* BPWizard Modal */}
      {wizardChecked && (
        <BPWizard
          open={showWizard}
          onComplete={handleWizardComplete}
          onCancel={localStorage.getItem(BP_WIZARD_STORAGE_KEY) ? handleWizardCancel : undefined}
          initialValues={wizardInitialValues}
        />
      )}

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
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent leading-tight pb-1">
          Stage-Aware Draft Assistant
        </h1>
        <p className="text-slate-400 mt-2 text-xs sm:text-sm">
          Real-time risk and timing analysis for professional drafts
          {version && <span className="ml-2 text-slate-500">v{version}</span>}
        </p>
      </motion.div>

      {/* Header with Phase Indicator */}
      <header className="relative z-20 h-16 w-full flex items-center justify-between px-8 border-b border-white/5 bg-slate-950/80 backdrop-blur-md">
        {/* Left: Match Summary from Wizard */}
        <div className="flex items-center gap-3">
          {rosterState.enabled && (
            <div className="flex items-center gap-2 text-sm">
              <span className={`font-bold ${userSide === 'blue' ? 'text-cyan-400' : 'text-slate-400'}`}>
                {rosterState.blueTeam.teamName || 'Blue'}
              </span>
              <span className="text-slate-600">vs</span>
              <span className={`font-bold ${userSide === 'red' ? 'text-rose-400' : 'text-slate-400'}`}>
                {rosterState.redTeam.teamName || 'Red'}
              </span>
              {selectedLeague !== 'global' && (
                <>
                  <span className="text-slate-700">·</span>
                  <span className="text-emerald-400 text-xs font-bold uppercase">{LEAGUE_LABELS[selectedLeague]}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Phase Indicator - Center */}
        <div className="absolute left-1/2 -translate-x-1/2">
          <PhaseIndicator phase={phaseDesc} currentStep={currentStep} />
        </div>

        {/* Right: Undo/Reset/Setup */}
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
            onClick={openWizard}
            className="flex items-center gap-2 px-3 py-1.5 rounded border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all duration-300"
            title="Change teams or side"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-xs font-bold uppercase">Setup</span>
          </button>

          {/* Threat Debug Toggle (dev-only) */}
          {process.env.NODE_ENV === 'development' && (
            <button
              onClick={() => setThreatDebugOpen(!threatDebugOpen)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-bold uppercase transition-all duration-300 ${
                threatDebugOpen
                  ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                  : 'border-white/10 text-slate-600 hover:text-slate-400'
              }`}
              title="Toggle Threat Debug Panel"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              DEV
            </button>
          )}
        </div>
      </header>

      {/* League Fallback Banner */}
      {selectedLeague !== 'global' && (
        <div className="relative z-10 px-8 pt-2">
          <div
            className={`rounded-lg px-4 py-2 flex items-center gap-2 border ${
              fallbackCount > 0
                ? 'bg-amber-500/10 border-amber-500/30'
                : 'bg-slate-800/30 border-slate-700/50'
            }`}
          >
            <span className={`font-medium text-sm ${fallbackCount > 0 ? 'text-amber-300' : 'text-slate-300'}`}>
              League: {LEAGUE_LABELS[selectedLeague]}
            </span>
            {fallbackCount > 0 ? (
              <span className="text-amber-400 text-sm">
                &middot; &#9888; {fallbackCount} champion{fallbackCount > 1 ? 's' : ''} using Global fallback (low sample)
              </span>
            ) : (
              <span className="text-slate-500 text-sm">
                &middot; League-specific data in use
              </span>
            )}
          </div>
        </div>
      )}

      {/* PTS Risk Board - Position based on user's team selection */}
      {aiMode === 'assistant' && (bpState.currentStep <= 5 || ptsResults.length > 0) && !isBPComplete(bpState) && (
        <div className={`fixed top-1/2 -translate-y-1/2 z-[200] transition-all duration-300 ${
          userSide === 'blue' ? 'left-4' : 'right-4'
        } ${aiPanelCollapsed ? 'w-12' : 'w-80'}`}>
          {aiPanelCollapsed ? (
            // Collapsed state - minimal bar
            <button
              onClick={() => setAiPanelCollapsed(false)}
              className={`w-full h-48 rounded-lg border flex flex-col items-center justify-center gap-2 transition-all ${
                userSide === 'blue'
                  ? 'bg-slate-900/95 border-cyan-500/30 hover:border-cyan-500/50'
                  : 'bg-slate-900/95 border-rose-500/30 hover:border-rose-500/50'
              }`}
            >
              <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-[10px] text-slate-500 font-bold uppercase writing-mode-vertical" style={{ writingMode: 'vertical-rl' }}>
                AI Assistant
              </span>
            </button>
          ) : (
            // Expanded state - full panel
            <div className="relative">
              {/* Collapse button */}
              <button
                onClick={() => setAiPanelCollapsed(true)}
                className={`absolute -top-2 z-10 p-1 rounded-full border bg-slate-900 transition-all ${
                  userSide === 'blue'
                    ? 'border-cyan-500/30 hover:border-cyan-500/50 right-2'
                    : 'border-rose-500/30 hover:border-rose-500/50 left-2'
                }`}
                title="Collapse AI panel"
              >
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              {/* Ban Phase: Use BanPhaseDraftingAssistant (steps 0-5) */}
              {bpState.currentStep <= 5 ? (
                <BanPhaseDraftingAssistant
                  key={`ban-assistant-${opponentTeamInfo.teamId}-${selectedLeague}`}
                  ourSide={userSide}
                  currentStepIndex={bpState.currentStep}
                  blueBans={bpState.blueBans}
                  redBans={bpState.redBans}
                  blueTeamName={rosterState.blueTeam.teamName}
                  redTeamName={rosterState.redTeam.teamName}
                  champions={champions}
                  opponentTeamId={opponentTeamInfo.teamId}
                  opponentTeamName={opponentTeamInfo.teamName}
                  selectedLeague={selectedLeague}
                  isUserTurn={currentTeam === userSide}
                  onChampionClick={(championId) => {
                    const champion = champions.find(c => c.id === championId);
                    if (champion && !disabledChampionIds.has(championId)) {
                      handleChampionSelect(champion);
                    }
                  }}
                  banContext={draftBanContext ? {
                    banSlot: draftBanContext.banSlot,
                    banningSide: draftBanContext.banningSide,
                    opponentLastBan: draftBanContext.opponentLastBan,
                    alreadyBanned: draftBanContext.alreadyBanned,
                  } : undefined}
                  additionalDisabled={Array.from(fearlessBannedChampions)}
                />
              ) : (
                /* Pick Phase: Use PickPhaseDraftingAssistant (steps 6+) */
                <PickPhaseDraftingAssistant
                  key={`pick-assistant-${ourTeamInfo.teamId}-${opponentTeamInfo.teamId}-${selectedLeague}`}
                  ourSide={userSide}
                  currentStepIndex={bpState.currentStep}
                  bluePicks={bpState.bluePicks}
                  redPicks={bpState.redPicks}
                  blueBans={bpState.blueBans}
                  redBans={bpState.redBans}
                  blueTeamName={rosterState.blueTeam.teamName}
                  redTeamName={rosterState.redTeam.teamName}
                  champions={champions}
                  ourTeamId={ourTeamInfo.teamId}
                  ourTeamName={ourTeamInfo.teamName}
                  opponentTeamId={opponentTeamInfo.teamId}
                  opponentTeamName={opponentTeamInfo.teamName}
                  selectedLeague={selectedLeague}
                  isUserTurn={currentTeam === userSide}
                  onChampionClick={(championId) => {
                    const champion = champions.find(c => c.id === championId);
                    if (champion && !disabledChampionIds.has(championId)) {
                      handleChampionSelect(champion);
                    }
                  }}
                  additionalDisabled={Array.from(fearlessBannedChampions)}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Threat Debug Panel (dev-only) */}
      <ThreatDebugPanel
        key={`threat-${opponentTeamInfo.teamId}-${selectedLeague}`}
        isOpen={threatDebugOpen}
        onClose={() => setThreatDebugOpen(false)}
        targetTeamId={opponentTeamInfo.teamId || undefined}
        targetTeamName={opponentTeamInfo.teamName}
        playerIds={opponentTeamInfo.playerIds}
        playerNames={opponentTeamInfo.playerNames}
        league={selectedLeague}
      />

      {/* Main Content Area - BP Panel centered */}
      <div className="relative z-10">
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

      {/* Search and Filters */}
      <div className="relative z-10 w-full px-4">
        <div className="relative w-full p-6 border-b border-white/5 bg-slate-950/50">
          <div className="flex items-start justify-center gap-8">
            {/* Left section - Position Filter */}
            <div className="flex flex-col gap-3" style={{ width: '600px' }}>
              {/* Position Filter Row */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase text-slate-500 w-16 flex-shrink-0 text-right">Position:</span>
                <PositionFilter
                  selectedPosition={selectedPosition}
                  onSelect={setSelectedPosition}
                />
              </div>
            </div>

            {/* Center section - matches center width */}
            <div style={{ minWidth: '200px' }} />

            {/* Right section - Search and Fearless */}
            <div className="flex items-center gap-4 justify-end" style={{ width: '600px' }}>
              {/* Search box */}
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

              {/* Fearless button */}
              <button
                onClick={handleFearlessModeToggle}
                title="Applies champion restrictions from previous games"
                className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-all duration-300 ${
                  fearlessModeEnabled
                    ? 'bg-amber-500/10 border-amber-500/50 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                    : 'border-white/10 text-slate-500 hover:text-slate-300'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span className="text-xs font-bold uppercase">
                  Fearless: {fearlessModeEnabled ? 'ON' : 'OFF'}
                </span>
                {fearlessModeEnabled && (
                  <>
                    <span className="text-xs font-mono ml-2">
                      {(() => {
                        const count = fearlessBannedChampions.size;
                        const target = count <= 10 ? 10 : count <= 20 ? 20 : count <= 30 ? 30 : 40;
                        return `${count}/${target}`;
                      })()}
                    </span>
                    <span className="text-xs text-slate-400 font-mono ml-2">
                      (click to ban)
                    </span>
                  </>
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
              threatData={threatDataMap}
              disabledIds={disabledChampionIds}
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
