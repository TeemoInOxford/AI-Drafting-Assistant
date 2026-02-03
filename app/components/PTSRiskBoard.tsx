'use client';

import { motion } from 'framer-motion';
import { useMemo, useState, useEffect } from 'react';
import { PTSResult, Champion, Position, BPState, BanEntry } from '../lib/types';
import { updateFlexibilityForDraftState, RoleFlexibilityDistribution, getRoleColor } from '../lib/role-flexibility';
import RoleFlexibilityBar, { computeDisplayPrimaryRole } from './RoleFlexibilityBar';
import HistoricalRoleOutcomes from './HistoricalRoleOutcomes';
import ThreatBadge, { ThreatIndicator } from './ThreatBadge';
import ThreatEvidenceV2 from './ThreatEvidenceV2';
import { ThreatSignal, ThreatLevel } from '../lib/threat-types';
import { Evidence } from '../lib/grid-v2-evidence-engine';
import {
  ThreatDecision,
  processThreats,
  filterForDisplay,
  getActionLabelColor,
  getActionLabelIcon,
  DEFAULT_DECISION_CONFIG,
  EvidenceType,
  EVIDENCE_LABELS,
  EVIDENCE_DESCRIPTIONS,
  determineEvidence,
} from '../lib/draft-decision';
import { calculateNormalizedRoleEntropy } from '../lib/entropy-utils';
import { type LeagueKey } from '../lib/league-types';

/**
 * Determines if the HISTORICAL DENIAL SIGNALS section should be visible.
 *
 * Visibility rules:
 * - Ban Phase 1 (steps 0-5): VISIBLE
 * - Pick Phase 1 (steps 6-11): HIDDEN
 * - Ban Phase 2 (steps 12-15): VISIBLE
 * - Pick Phase 2 (steps 16-19): HIDDEN
 * - After BP complete (step >= 20): HIDDEN
 *
 * @param currentStepIndex - Current step in BP_SEQUENCE (0-indexed)
 * @returns true if section should render, false otherwise
 */
function shouldShowHistoricalDenialSignals(currentStepIndex: number): boolean {
  // Ban Phase 1: steps 0-5
  if (currentStepIndex >= 0 && currentStepIndex <= 5) {
    return true;
  }

  // Ban Phase 2: steps 12-15
  if (currentStepIndex >= 12 && currentStepIndex <= 15) {
    return true;
  }

  // All other phases (picks, complete): hide entirely
  return false;
}

/**
 * Get neutral tier label based on threat score
 * Used for HISTORICAL DENIAL SIGNALS section (evidence-only, no action verbs)
 */
type ThreatTier = 'High' | 'Moderate' | 'Low';

function getThreatTier(score: number): ThreatTier {
  if (score >= 70) return 'High';
  if (score >= 40) return 'Moderate';
  return 'Low';
}

function getThreatTierColor(tier: ThreatTier): string {
  switch (tier) {
    case 'High':
      return 'text-red-400 bg-red-500/20 border-red-500/50';
    case 'Moderate':
      return 'text-orange-400 bg-orange-500/20 border-orange-500/50';
    case 'Low':
      return 'text-gray-400 bg-gray-500/20 border-gray-500/50';
  }
}

/**
 * Get color class for evidence type badge
 */
function getEvidenceColor(evidence: EvidenceType): string {
  switch (evidence) {
    case 'TEAM_DENIAL':
      return 'text-blue-300 bg-blue-500/20 border-blue-500/40';
    case 'PLAYER_SPECIALTY':
      return 'text-purple-300 bg-purple-500/20 border-purple-500/40';
    case 'ROLE_FLEX_PRESSURE':
      return 'text-amber-300 bg-amber-500/20 border-amber-500/40';
    case 'META_PTS':
      return 'text-slate-300 bg-slate-500/20 border-slate-500/40';
  }
}

/**
 * Get icon for evidence type
 */
function getEvidenceIcon(evidence: EvidenceType): string {
  switch (evidence) {
    case 'TEAM_DENIAL':
      return '🎯';
    case 'PLAYER_SPECIALTY':
      return '👤';
    case 'ROLE_FLEX_PRESSURE':
      return '🔄';
    case 'META_PTS':
      return '📊';
  }
}

interface PTSRiskBoardProps {
  ptsResults: PTSResult[];
  currentTurn: string;
  ourSide: 'blue' | 'red';
  nextOpponentActions: string;
  onChampionClick?: (championId: string) => void;
  isUserTurn?: boolean;
  blueTeamName?: string;
  redTeamName?: string;
  bluePicks?: (Champion | null)[];
  redPicks?: (Champion | null)[];
  blueBans?: BanEntry[];
  redBans?: BanEntry[];
  currentStepIndex?: number;
  champions?: Champion[];
  selectedLeague: LeagueKey;
  opponentTeamId?: string | null;
  opponentPlayerIds?: string[];
  opponentPlayerNames?: Record<string, string>;
  usedChampions?: Set<string>;
  onFallbackCountChange?: (count: number) => void;
}

export default function PTSRiskBoard({
  ptsResults,
  currentTurn,
  ourSide,
  nextOpponentActions,
  onChampionClick,
  isUserTurn = false,
  blueTeamName,
  redTeamName,
  bluePicks = [],
  redPicks = [],
  blueBans = [],
  redBans = [],
  currentStepIndex = 0,
  champions = [],
  selectedLeague = 'global',
  opponentTeamId = null,
  opponentPlayerIds = [],
  opponentPlayerNames = {},
  usedChampions = new Set(),
  onFallbackCountChange,
}: PTSRiskBoardProps) {
  const isBanPhase = currentTurn.toLowerCase().includes('ban');
  const topPick = ptsResults[0];

  const critical = ptsResults.filter(r => r.riskTier === 'critical').slice(0, 2);
  const high = ptsResults.filter(r => r.riskTier === 'high').slice(0, 2);
  const safe = ptsResults.filter(r => r.riskTier === 'moderate' || r.riskTier === 'low').slice(0, 2);

  // Calculate filled roles based on picks
  const filledRoles = useMemo(() => {
    const ourPicks = ourSide === 'blue' ? bluePicks : redPicks;
    const validPicks = ourPicks.filter((p): p is Champion => p !== null);
    // Assume first position is primary for each pick
    return validPicks.flatMap(p => p.positions.slice(0, 1)) as Position[];
  }, [ourSide, bluePicks, redPicks]);

  // Get enemy picks (always based on ourSide, not current turn)
  const enemyPicks = useMemo(() => {
    const picks = ourSide === 'blue' ? redPicks : bluePicks;
    return picks.filter((p): p is Champion => p !== null);
  }, [ourSide, bluePicks, redPicks]);

  // Calculate enemy filled roles (for graying out impossible positions)
  const enemyFilledRoles = useMemo(() => {
    return enemyPicks.flatMap(p => p.positions.slice(0, 1)) as Position[];
  }, [enemyPicks]);

  // Calculate role flexibility ONLY for enemy picks via API
  const [roleFlexibilityMap, setRoleFlexibilityMap] = useState<Map<string, RoleFlexibilityDistribution>>(new Map());
  const [flexibilityLoading, setFlexibilityLoading] = useState(false);

  // Historical role outcomes for enemy picks
  interface RoleOutcome {
    role_name: Position;
    probability: number;
    win_rate: number;
    sample_size: number;
    display_flag: boolean;
  }
  interface ChampionOutcome {
    championId: string;
    championName: string;
    roles: RoleOutcome[];
  }
  const [historicalOutcomesMap, setHistoricalOutcomesMap] = useState<Map<string, RoleOutcome[]>>(new Map());

  // Threat signals state
  const [threatSignalsMap, setThreatSignalsMap] = useState<Map<string, ThreatSignal>>(new Map());
  const [allThreatScores, setAllThreatScores] = useState<number[]>([]);
  const [threatEvidenceOpen, setThreatEvidenceOpen] = useState(false);

  // Player threat signals state (grid_v2 PLAYER_SPECIALTY)
  const [playerThreatMap, setPlayerThreatMap] = useState<Map<string, {
    score: number;
    players_count: number;
    total_games_weighted: number;
    top_player_games: number;
    top_player_share: number;
  }>>(new Map());
  const [selectedThreatChampion, setSelectedThreatChampion] = useState<{
    championId: string;
    championName: string;
    championImage?: string;
    evidences: Evidence[];
    source: 'grid_v2' | 'lol_fallback';
  } | null>(null);

  // Build a minimal BPState for draft-decision module
  const bpStateForDecision: BPState = useMemo(() => {
    // Extract champions from BanEntry arrays
    const blueBanChampions = blueBans
      .map(entry => entry.champion)
      .filter((c): c is Champion => c !== null);
    const redBanChampions = redBans
      .map(entry => entry.champion)
      .filter((c): c is Champion => c !== null);

    return {
      blueBans: blueBans,
      redBans: redBans,
      bluePicks: bluePicks.filter((c): c is Champion => c !== null),
      redPicks: redPicks.filter((c): c is Champion => c !== null),
      currentStep: currentStepIndex,
      usedChampions,
      history: [],
    };
  }, [blueBans, redBans, bluePicks, redPicks, currentStepIndex, usedChampions]);

  // Fetch threat signals when opponent team is selected
  // Prefer grid_v2 source (new), fallback to lol source (legacy)
  useEffect(() => {
    if (!opponentTeamId) {
      setThreatSignalsMap(new Map());
      setAllThreatScores([]);
      return;
    }

    async function fetchThreatSignals() {
      try {
        // Try grid_v2 source first (team-level only, lightweight)
        const gridUrl = `/api/threat-signals?action=allTeam&source=grid_v2&team_id=${opponentTeamId}&_=${Date.now()}`;
        const gridResponse = await fetch(gridUrl, { cache: 'no-store' });

        if (gridResponse.ok) {
          const gridData = await gridResponse.json();
          if (gridData.success && gridData.data && Object.keys(gridData.data).length > 0) {
            const threatMap = new Map<string, ThreatSignal>();
            const scores: number[] = [];

            Object.entries(gridData.data).forEach(([championName, signal]: [string, any]) => {
              // Map grid_v2 fields to ThreatSignal shape (score is compatible)
              const mapped: ThreatSignal = {
                championId: championName,
                championName,
                observed: signal.score || 0,
                obsLower: signal.score || 0,
                expected: 0,
                ratio: 1,
                rawObs: 0,
                rawLower: 0,
                confidence: Math.min(1, (signal.sample_size || 0) / 20),
                score: signal.score || 0,
                gamesPlayed: signal.sample_size || 0,
                banCount: signal.sample_size || 0,
                context: 'grid_v2',
                credibleLevel: 0.8,
                priorStrengthM: 10,
                a0: 0,
                b0: 0,
              };
              threatMap.set(championName, mapped);
              scores.push(mapped.score);
            });

            setThreatSignalsMap(threatMap);
            setAllThreatScores(scores);
            return; // Successfully used grid_v2
          }
        }

        // Fallback to legacy source
        const legacyUrl = `/api/threat-signals?action=allTeam&targetTeamId=${opponentTeamId}&league=${selectedLeague}&_=${Date.now()}`;
        const response = await fetch(legacyUrl, { cache: 'no-store' });

        if (!response.ok) {
          throw new Error('Failed to fetch threat signals');
        }

        const data = await response.json();
        if (data.success && data.data) {
          const threatMap = new Map<string, ThreatSignal>();
          const scores: number[] = [];

          Object.entries(data.data).forEach(([championName, signal]) => {
            threatMap.set(championName, signal as ThreatSignal);
            scores.push((signal as ThreatSignal).score);
          });

          setThreatSignalsMap(threatMap);
          setAllThreatScores(scores);
        }
      } catch (error) {
        console.error('Failed to fetch threat signals:', error);
        setThreatSignalsMap(new Map());
        setAllThreatScores([]);
      }
    }

    fetchThreatSignals();
  }, [opponentTeamId, selectedLeague]);

  // Fetch player threat signals (PLAYER_SPECIALTY) from grid_v2
  useEffect(() => {
    if (!opponentTeamId) {
      setPlayerThreatMap(new Map());
      return;
    }

    async function fetchPlayerThreats() {
      try {
        const res = await fetch(
          `/api/threat-signals?action=playerTeam&source=grid_v2&team_id=${opponentTeamId}&_=${Date.now()}`,
          { cache: 'no-store' }
        );
        if (!res.ok) return;

        const data = await res.json();
        if (data.success && data.data) {
          const map = new Map<string, {
            score: number;
            players_count: number;
            total_games_weighted: number;
            top_player_games: number;
            top_player_share: number;
          }>();

          Object.entries(data.data).forEach(([championName, signal]: [string, any]) => {
            const topPlayer = signal.evidence?.top_players?.[0];
            const teamPool = signal.evidence?.raw_scores?.team_pool || 0;
            map.set(championName, {
              score: signal.score || 0,
              players_count: signal.players_count || 0,
              total_games_weighted: teamPool,
              top_player_games: topPlayer?.games_weighted || 0,
              top_player_share: teamPool > 0 && topPlayer
                ? topPlayer.games_weighted / teamPool
                : 0,
            });
          });

          setPlayerThreatMap(map);
        }
      } catch (error) {
        console.error('Failed to fetch player threat signals:', error);
      }
    }

    fetchPlayerThreats();
  }, [opponentTeamId]);

  // Helper to get threat level based on percentile
  // Only consider champions with non-zero scores for percentile calculation
  const getThreatLevel = (score: number): ThreatLevel => {
    // If score is 0 or negative, it's always low
    if (score <= 0) return 'low';

    // Filter to only non-zero scores for percentile calculation
    const nonZeroScores = allThreatScores.filter(s => s > 0);
    if (nonZeroScores.length === 0) return 'low';

    const sorted = [...nonZeroScores].sort((a, b) => b - a);
    const highThreshold = sorted[Math.floor(sorted.length * 0.2)] || 0;
    const moderateThreshold = sorted[Math.floor(sorted.length * 0.4)] || 0;

    if (score >= highThreshold) return 'high';
    if (score >= moderateThreshold) return 'moderate';
    return 'low';
  };

  // Handle threat badge click - fetch grid_v2 evidence
  const handleThreatClick = async (championId: string, championName: string) => {
    if (!opponentTeamId) return;

    try {
      const evidences: Evidence[] = [];
      let source: 'grid_v2' | 'lol_fallback' = 'grid_v2';

      // Fetch team denial evidence from grid_v2
      const teamRes = await fetch(
        `/api/threat-signals?action=team&source=grid_v2&team_id=${opponentTeamId}&champion=${championName}&_=${Date.now()}`,
        { cache: 'no-store' }
      );

      if (teamRes.ok) {
        const teamData = await teamRes.json();
        if (teamData.success && teamData.data) {
          const signal = teamData.data;
          // Build TEAM_DENIAL evidence
          evidences.push({
            type: 'TEAM_DENIAL',
            score: signal.score || 0,
            components: signal.components,
            summary: `Frequently banned against this team (${((signal.components?.OPPONENT_BAN || 0) * 100).toFixed(0)}% opponent-driven)`,
            details: {
              top_opponent_teams: signal.evidence?.top_opponent_teams,
              raw_opponent_ban: signal.evidence?.raw_scores?.opponent_ban_weighted,
              raw_meta_ban: signal.evidence?.raw_scores?.meta_ban_rate,
              raw_self_ban: signal.evidence?.raw_scores?.self_ban_rate,
            },
            source: 'grid_v2',
          });
        }
      }

      // Fetch player specialty evidence from grid_v2
      const playerRes = await fetch(
        `/api/threat-signals?action=playerTeam&source=grid_v2&team_id=${opponentTeamId}&_=${Date.now()}`,
        { cache: 'no-store' }
      );

      if (playerRes.ok) {
        const playerData = await playerRes.json();
        if (playerData.success && playerData.data && playerData.data[championName]) {
          const signal = playerData.data[championName];
          const topPlayer = signal.evidence?.top_players?.[0];

          evidences.push({
            type: 'PLAYER_SPECIALTY',
            score: signal.score || 0,
            components: signal.components,
            summary: topPlayer
              ? `${topPlayer.player_name} specialty (${topPlayer.games_weighted.toFixed(1)} weighted games)`
              : 'Team pool threat',
            details: {
              top_players: signal.evidence?.top_players,
              players_count: signal.players_count,
              total_games_weighted: signal.evidence?.raw_scores?.team_pool,
            },
            source: 'grid_v2',
          });
        }
      }

      // Sort by score descending
      evidences.sort((a, b) => b.score - a.score);

      const champion = champions.find(c => c.id === championId || c.name === championName);
      setSelectedThreatChampion({
        championId,
        championName,
        championImage: champion?.image,
        evidences,
        source,
      });
      setThreatEvidenceOpen(true);
    } catch (error) {
      console.error('Failed to fetch threat evidence:', error);
    }
  };

  useEffect(() => {
    if (enemyPicks.length === 0) {
      setRoleFlexibilityMap(new Map());
      setHistoricalOutcomesMap(new Map());
      onFallbackCountChange?.(0);
      return;
    }

    async function fetchRoleFlexibility() {
      setFlexibilityLoading(true);
      onFallbackCountChange?.(0);
      try {
        // Fetch role flexibility
        const flexResponse = await fetch('/api/role-flexibility', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            champions: enemyPicks,
            league: selectedLeague,
          }),
          cache: 'no-store',
        });

        if (!flexResponse.ok) {
          throw new Error('Failed to fetch role flexibility');
        }

        const flexData = await flexResponse.json();
        const flexMap = new Map<string, RoleFlexibilityDistribution>();
        let fallbackCount = 0;

        flexData.results.forEach((result: {
          championId: string;
          found: boolean;
          flexibility: RoleFlexibilityDistribution | null;
          usedGlobalFallback?: boolean;
        }) => {
          // Count fallback champions
          if (result.usedGlobalFallback) {
            fallbackCount++;
          }
          // Only process champions found in weighted-role-posteriors data
          if (result.found && result.flexibility) {
            const updated = updateFlexibilityForDraftState(result.flexibility, enemyFilledRoles);
            flexMap.set(result.championId, updated);
          }
        });

        setRoleFlexibilityMap(flexMap);

        // Notify parent of fallback count
        if (onFallbackCountChange) {
          onFallbackCountChange(fallbackCount);
        }

        // Fetch historical role outcomes
        const histResponse = await fetch('/api/historical-role-outcomes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            champions: enemyPicks.map(c => c.name),
          }),
          cache: 'no-store',
        });

        if (histResponse.ok) {
          const histData = await histResponse.json();
          const histMap = new Map<string, RoleOutcome[]>();

          histData.results.forEach((result: ChampionOutcome) => {
            histMap.set(result.championName, result.roles);
          });

          setHistoricalOutcomesMap(histMap);
        }
      } catch (error) {
        console.error('Failed to fetch role flexibility:', error);
        setRoleFlexibilityMap(new Map());
        onFallbackCountChange?.(0);
      } finally {
        setFlexibilityLoading(false);
      }
    }

    fetchRoleFlexibility();
  }, [enemyPicks, enemyFilledRoles, selectedLeague, onFallbackCountChange]);

  if (ptsResults.length === 0) {
    return null;
  }

  // Helper to format role distribution
  const formatRoleDistribution = (roleDistribution?: { role: Position; probability: number }[]) => {
    if (!roleDistribution || roleDistribution.length <= 1) return null;

    return roleDistribution
      .sort((a, b) => b.probability - a.probability)
      .map(({ role, probability }) => `${role.charAt(0).toUpperCase() + role.slice(1)} (${Math.round(probability * 100)}%)`)
      .join(' | ');
  };

  // Helper to get role distribution for a champion
  const getChampionRoleDistribution = (champion: Champion): { role: Position; probability: number }[] | undefined => {
    if (champion.positions.length <= 1) return undefined;

    // Simple heuristic: distribute probability based on position count
    const probability = 1 / champion.positions.length;
    return champion.positions.map(role => ({ role, probability }));
  };

  // Format draft picks with flex handling
  const formatDraftPicks = (picks: (Champion | null)[]) => {
    const validPicks = picks.filter((p): p is Champion => p !== null);
    if (validPicks.length === 0) return 'None';

    return validPicks.map(champ => {
      const roleDistribution = getChampionRoleDistribution(champ);
      const roleText = formatRoleDistribution(roleDistribution);

      if (roleText) {
        return `${champ.name} → ${roleText}`;
      }
      return `${champ.name} (${champ.positions[0]})`;
    }).join(', ');
  };

  // Get open roles
  const getOpenRoles = () => {
    const allRoles: Position[] = ['top', 'jungle', 'mid', 'bot', 'support'];
    const ourPicks = ourSide === 'blue' ? bluePicks : redPicks;
    const validPicks = ourPicks.filter((p): p is Champion => p !== null);

    // For simplicity, assume each pick takes one role
    // In reality, flex picks create ambiguity
    const takenRoles = validPicks.flatMap(p => p.positions.slice(0, 1));
    const openRoles = allRoles.filter(r => !takenRoles.includes(r));

    return openRoles.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(', ') || 'All filled';
  };

  const renderChampionRow = (result: PTSResult, index: number) => {
    // Get threat signal for this champion
    const threatSignal = threatSignalsMap.get(result.championName);
    const threatLevel = threatSignal ? getThreatLevel(threatSignal.score) : 'low';

    return (
      <motion.div
        key={result.championId}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.08 }}
        className="flex items-center justify-between py-1.5 px-2 hover:bg-slate-800/50 rounded"
      >
        <div className="flex items-center gap-2">
          <span className="text-white font-medium text-sm">{result.championName}</span>
          {result.isFlex && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
              FLEX
            </span>
          )}
          {/* Threat Badge */}
          {threatSignal && threatLevel !== 'low' && (
            <ThreatBadge
              score={threatSignal.score}
              level={threatLevel}
              onClick={() => handleThreatClick(result.championId, result.championName)}
              compact={true}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 font-bold text-sm">PTS {Math.round(result.pts)}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onChampionClick?.(result.championId);
            }}
            className="ml-1 px-2 py-0.5 text-[9px] font-bold uppercase bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 rounded transition-colors"
          >
            Select
          </button>
        </div>
      </motion.div>
    );
  };

  // Calculate top threat champions from opponent team using decision layer
  const threatDecisions = useMemo((): ThreatDecision[] => {
    if (threatSignalsMap.size === 0) return [];

    // Convert threat signals map to array
    const signals: ThreatSignal[] = [];
    threatSignalsMap.forEach((signal, championName) => {
      // Find the champion to get its ID
      const champ = champions.find(c => c.name === championName);
      if (champ) {
        // Ensure championId is set correctly
        signals.push({
          ...signal,
          championId: champ.id,
        });
      }
    });

    // Process threats through decision layer
    const decisions = processThreats(
      signals,
      bpStateForDecision,
      ourSide,
      currentStepIndex
    );

    // Filter for display (limit items)
    return filterForDisplay(decisions);
  }, [threatSignalsMap, champions, bpStateForDecision, ourSide, currentStepIndex]);

  // Legacy: Keep topThreatChampions for backward compatibility with existing UI
  const topThreatChampions = useMemo(() => {
    return threatDecisions
      .filter(d => d.isActionable && d.decisionTag !== 'Monitor')
      .map(d => ({
        name: d.signal.championName,
        score: d.signal.score,
        level: getThreatLevel(d.signal.score),
        decision: d,
      }));
  }, [threatDecisions, allThreatScores]);

  const Divider = () => (
    <div className="border-t border-slate-700/50 my-3" />
  );

  return (
    <div className={`relative rounded-lg border-2 p-4 shadow-xl transition-all duration-300 ${
      isUserTurn
        ? ourSide === 'blue'
          ? 'bg-slate-900/95 backdrop-blur-sm border-cyan-500/50'
          : 'bg-slate-900/95 backdrop-blur-sm border-rose-500/50'
        : 'bg-slate-900/50 backdrop-blur-sm border-slate-600/50 opacity-60 pointer-events-none'
    }`}>
      {/* Title Badge - Top Center */}
      <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-slate-800 border border-slate-600/50">
        <span className="text-[9px] font-bold text-slate-400 tracking-wider">DRAFTING ASSISTANT</span>
      </div>

      {/* Current Turn Bar */}
      <div className={`-mx-4 -mt-4 mb-4 px-4 py-3 pt-6 border-b ${
        ourSide === 'blue'
          ? 'bg-cyan-500/10 border-cyan-500/30'
          : 'bg-rose-500/10 border-rose-500/30'
      }`}>
        <div className="flex items-center justify-center gap-2">
          <span className={`font-bold text-base ${
            ourSide === 'blue' ? 'text-cyan-300' : 'text-rose-300'
          }`}>
            {ourSide === 'blue'
              ? (blueTeamName || 'BLUE SIDE')
              : (redTeamName || 'RED SIDE')
            }
          </span>
          <span className="text-slate-500">•</span>
          <span className="text-white font-bold text-base">{currentTurn}</span>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-3 text-sm">
        {isBanPhase ? (
          <>
            {/* Threat Overview */}
            <div>
              <h3 className="text-slate-300 font-bold text-xs uppercase tracking-wider mb-2">Threat Overview</h3>
              <Divider />
              <p className="text-slate-400 text-xs leading-relaxed">
                Early ban phase: opponents historically deny these champions against this team
                to reduce draft flexibility or force earlier role commitment.
              </p>
            </div>

            {/* ============================================================ */}
            {/* EVIDENCE LAYER: Historical Denial Signals (NO ban actions) */}
            {/* ============================================================ */}
            {threatDecisions.filter(d => d.isActionable).length > 0 && (
              <div>
                <Divider />
                <h3 className="text-blue-400 font-bold text-xs uppercase tracking-wider mb-2">
                  HISTORICAL DENIAL SIGNALS
                  <span className="text-slate-500 font-normal ml-1">(Evidence)</span>
                </h3>
                <p className="text-slate-500 text-[10px] mb-2 leading-relaxed">
                  Historical evidence only. This section does not recommend actions.
                  Champions here were banned above baseline vs this team in past matches.
                </p>
                <Divider />
                <div className="space-y-1">
                  {threatDecisions.filter(d => d.isActionable).map((decision, i) => {
                    const tier = getThreatTier(decision.signal.score);
                    const champ = champions.find(c => c.name === decision.signal.championName);
                    return (
                      <motion.div
                        key={decision.signal.championName}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.08 }}
                        className="flex items-center justify-between py-1.5 px-2 rounded transition-all hover:bg-slate-800/50"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-white">
                            {decision.signal.championName}
                          </span>
                          {/* Neutral Tier Badge (no action verbs) */}
                          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${getThreatTierColor(tier)}`}>
                            {tier}
                          </span>
                          <span className="text-[9px] text-slate-500">
                            ({Math.round(decision.signal.score)})
                          </span>
                          {/* Attribution tag */}
                          <span className="text-[8px] text-slate-600">
                            Team
                          </span>
                        </div>
                        {/* View button opens evidence modal ONLY - does NOT trigger ban */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (champ) {
                              handleThreatClick(champ.id, decision.signal.championName);
                            }
                          }}
                          title="View historical denial evidence"
                          className="ml-1 px-2 py-0.5 text-[9px] font-medium uppercase rounded transition-colors
                            bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 border border-slate-600/50"
                        >
                          View
                        </button>
                      </motion.div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-600 mt-1 italic">
                  Evidence feed only. See BAN CANDIDATES below for actionable decisions.
                </p>
              </div>
            )}

            {/* ============================================================ */}
            {/* ACTION PANEL: Ban Candidates (ONLY place to trigger ban) */}
            {/* ============================================================ */}
            {ptsResults.length > 0 && (() => {
              // Compute evidence for each candidate (Step 4.2)
              const getEvidenceForCandidate = (result: PTSResult) => {
                const denialSignal = threatSignalsMap.get(result.championName) || null;

                // Calculate role entropy using shared utility (Step 4.2)
                const roleEntropy = result.roleDistribution
                  ? calculateNormalizedRoleEntropy(result.roleDistribution)
                  : 0;

                // Build playerPoolData from grid_v2 player threat signals
                const playerData = playerThreatMap.get(result.championName);
                const playerPoolData = playerData
                  ? {
                      pickCount: Math.round(playerData.top_player_games),
                      pickShare: playerData.top_player_share,
                      playerGames: Math.round(playerData.total_games_weighted),
                    }
                  : undefined;

                return determineEvidence(denialSignal, result.isFlex || false, roleEntropy, playerPoolData);
              };

              return (
                <div>
                  <Divider />
                  <h3 className="text-cyan-400 font-black text-xs uppercase tracking-wider mb-2">
                    BAN CANDIDATES
                    <span className="text-slate-500 font-normal ml-1">(Action Panel)</span>
                  </h3>
                  <p className="text-slate-500 text-[10px] mb-2 leading-relaxed">
                    Unified ban recommendations. Each candidate shows its primary evidence driver.
                  </p>
                  <Divider />
                  <div className="space-y-2">
                    {/* Primary Recommendation */}
                    {topPick && (() => {
                      const { primary, secondary } = getEvidenceForCandidate(topPick);
                      return (
                        <div className="bg-slate-800/50 rounded p-3 border border-cyan-500/30">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-white font-bold text-sm">{topPick.championName}</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold">
                                TOP PICK
                              </span>
                              {topPick.isFlex && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                  FLEX
                                </span>
                              )}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onChampionClick?.(topPick.championId);
                              }}
                              className="px-3 py-1 text-[10px] font-bold uppercase bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 rounded transition-colors"
                            >
                              Ban
                            </button>
                          </div>
                          {/* Evidence Trace */}
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[9px] text-slate-500">Driven by:</span>
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded border ${getEvidenceColor(primary)}`}
                              title={EVIDENCE_DESCRIPTIONS[primary]}
                            >
                              {getEvidenceIcon(primary)} {EVIDENCE_LABELS[primary]}
                            </span>
                            {secondary && secondary.length > 0 && (
                              <>
                                <span className="text-[9px] text-slate-600">+</span>
                                {secondary.map((ev) => (
                                  <span
                                    key={ev}
                                    className={`text-[8px] px-1 py-0.5 rounded border opacity-70 ${getEvidenceColor(ev)}`}
                                    title={EVIDENCE_DESCRIPTIONS[ev]}
                                  >
                                    {getEvidenceIcon(ev)}
                                  </span>
                                ))}
                              </>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 space-y-0.5">
                            <p className="font-medium text-slate-300 mb-1">Why ban:</p>
                            <ul className="ml-2 space-y-0.5">
                              {/* Primary evidence explanation */}
                              <li>• {EVIDENCE_DESCRIPTIONS[primary]}</li>
                              {/* Secondary evidence */}
                              {secondary && secondary.map((ev) => (
                                <li key={ev}>• {EVIDENCE_DESCRIPTIONS[ev]}</li>
                              ))}
                              {/* PTS score */}
                              <li>• Priority score: {Math.round(topPick.pts)}</li>
                            </ul>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Other Candidates (collapsed list) */}
                    {ptsResults.slice(1, 4).map((result, i) => {
                      const { primary, secondary } = getEvidenceForCandidate(result);
                      return (
                        <motion.div
                          key={result.championId}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: (i + 1) * 0.08 }}
                          className="flex items-center justify-between py-2 px-3 bg-slate-800/30 rounded border border-slate-700/30 hover:bg-slate-800/50 transition-all"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white font-medium text-sm">{result.championName}</span>
                            {/* Evidence Tag */}
                            <span
                              className={`text-[8px] px-1 py-0.5 rounded border ${getEvidenceColor(primary)}`}
                              title={EVIDENCE_DESCRIPTIONS[primary]}
                            >
                              {getEvidenceIcon(primary)} {EVIDENCE_LABELS[primary]}
                            </span>
                            <span className="text-[9px] text-slate-500">PTS {Math.round(result.pts)}</span>
                            {result.isFlex && (
                              <span className="text-[8px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                FLEX
                              </span>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onChampionClick?.(result.championId);
                            }}
                            className="px-2 py-0.5 text-[9px] font-medium uppercase bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 border border-slate-600/50 rounded transition-colors"
                          >
                            Ban
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-600 mt-2 italic">
                    This is the only action panel. Evidence tags show primary driver for each recommendation.
                  </p>
                </div>
              );
            })()}
          </>
        ) : (
          <>
            {/* Draft State */}
            <div>
              <h3 className="text-slate-300 font-bold text-xs uppercase tracking-wider mb-2">Draft State</h3>
              <Divider />
              <div className="space-y-3 text-xs">
                {/* Enemy Picks with Role Flexibility */}
                <div>
                  <p className="text-slate-400 font-semibold mb-2">Enemy Picks:</p>
                  {enemyPicks.length === 0 ? (
                    <p className="text-slate-500 italic">None</p>
                  ) : (
                    <div className="space-y-2">
                      {enemyPicks.map((champion) => {
                        const flexibility = roleFlexibilityMap.get(champion.id);
                        const historicalRoles = historicalOutcomesMap.get(champion.name);
                        return (
                          <div key={champion.id} className="bg-slate-800/30 rounded p-2 border border-slate-700/30">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-white font-medium">{champion.name}</span>
                                {flexibility && (() => {
                                  const displayPrimary = computeDisplayPrimaryRole(flexibility);
                                  return (
                                    <span
                                      className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                                      style={{
                                        backgroundColor: `${getRoleColor(displayPrimary)}20`,
                                        color: getRoleColor(displayPrimary),
                                        borderWidth: 1,
                                        borderColor: `${getRoleColor(displayPrimary)}40`,
                                      }}
                                    >
                                      {({ top: 'Top', jungle: 'Jng', mid: 'Mid', bot: 'Bot', support: 'Sup' } as Record<string, string>)[displayPrimary]}
                                    </span>
                                  );
                                })()}
                              </div>
                              {flexibility?.isFlexPick && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                  FLEX
                                </span>
                              )}
                            </div>
                            {flexibility ? (
                              <>
                                <RoleFlexibilityBar
                                  flexibility={flexibility}
                                  showInterpretation={false}
                                  compact={true}
                                />
                                {/* Flex stats row */}
                                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-500">
                                  <span>Score: <span className="text-slate-400">{flexibility.flexibilityScore.toFixed(3)}</span></span>
                                  <span>ESS: <span className="text-slate-400">{flexibility.effectiveSampleSize.toFixed(1)}</span></span>
                                </div>
                              </>
                            ) : (
                              <div className="text-[10px] text-slate-600 py-1">
                                {flexibilityLoading ? 'Loading...' : 'No flex data'}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Our Picks */}
                <div>
                  <p className="text-slate-400 font-semibold">Our Picks:</p>
                  <p className="text-slate-300">{formatDraftPicks(ourSide === 'blue' ? bluePicks : redPicks)}</p>
                </div>

                {/* Open Roles */}
                <div>
                  <p className="text-slate-400 font-semibold">Open Roles:</p>
                  <p className="text-slate-300">{getOpenRoles()}</p>
                </div>
              </div>
            </div>

            {/* Best Picks Now */}
            {critical.length > 0 && (
              <div>
                <Divider />
                <h3 className="text-cyan-400 font-black text-xs uppercase tracking-wider mb-2">
                  BEST PICKS NOW
                </h3>
                <Divider />
                <div className="space-y-1">
                  {critical.map((r, i) => renderChampionRow(r, i))}
                </div>
              </div>
            )}

            {/* Conditional Picks */}
            {high.length > 0 && (
              <div>
                <Divider />
                <h3 className="text-yellow-400 font-bold text-xs uppercase tracking-wider mb-2">
                  CONDITIONAL PICKS
                </h3>
                <Divider />
                <div className="space-y-1">
                  {high.map((r, i) => renderChampionRow(r, critical.length + i))}
                </div>
              </div>
            )}

            {/* Safe to Delay */}
            {safe.length > 0 && (
              <div>
                <Divider />
                <h3 className="text-slate-400 font-bold text-xs uppercase tracking-wider mb-2">
                  SAFE TO DELAY
                </h3>
                <Divider />
                <div className="space-y-1">
                  {safe.map((r, i) => renderChampionRow(r, critical.length + high.length + i))}
                </div>
              </div>
            )}

            {/* Primary Recommendation */}
            {topPick && (
              <div>
                <Divider />
                <h3 className="text-cyan-300 font-bold text-xs uppercase tracking-wider mb-2">
                  Primary Recommendation
                </h3>
                <Divider />
                <div className="bg-slate-800/50 rounded p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-white font-bold text-base">{topPick.championName}</div>
                    {topPick.isFlex && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        FLEX
                      </span>
                    )}
                  </div>

                  <div>
                    <p className="text-slate-300 text-xs font-semibold mb-1">Why:</p>
                    <ul className="text-slate-400 text-xs space-y-0.5 ml-3">
                      {topPick.isFlex ? (
                        <>
                          <li>• Effective regardless of flex resolution</li>
                          <li>• Maintains role ambiguity advantage</li>
                          <li>• Preserves draft flexibility</li>
                        </>
                      ) : (
                        <>
                          <li>• Solves frontline deficit</li>
                          <li>• Stabilizes mid-late game</li>
                          <li>• Preserves jungle flexibility</li>
                        </>
                      )}
                    </ul>
                  </div>

                  <div>
                    <p className="text-slate-300 text-xs font-semibold mb-1">If skipped:</p>
                    <ul className="text-slate-400 text-xs space-y-0.5 ml-3">
                      {topPick.isFlex ? (
                        <>
                          <li>• Loses multi-role coverage option</li>
                          <li>• Forced into predictable role assignments</li>
                          <li>• Opponent gains draft read advantage</li>
                        </>
                      ) : (
                        <>
                          <li>• Team lacks reliable engage</li>
                          <li>• Jungle forced into utility role</li>
                          <li>• Late-game teamfight risk increases</li>
                        </>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Role Flexibility Interpretation */}
        <div className="mt-3 p-2 bg-slate-800/20 rounded border border-slate-700/20">
          <p className="text-[9px] text-slate-500 leading-relaxed">
            <span className="text-slate-400 font-medium">Role Flexibility:</span> Distributions reflect historical role assignments in professional play. They do not predict final lane assignment.
          </p>
        </div>

        {/* Footer */}
        <div>
          <Divider />
          {isUserTurn ? (
            <div className="bg-indigo-500/10 rounded-lg p-2.5 border border-indigo-500/30">
              <div className="text-xs text-indigo-300 font-medium">
                Your turn — Make your decision
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                {isBanPhase ? 'AI highlights threats. Final call is yours.' : 'AI advises. Coach decides.'}
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-slate-500 text-center">
              Waiting for opponent...
            </p>
          )}
        </div>
      </div>

      {/* Threat Evidence Modal (Grid V2) */}
      {selectedThreatChampion && (
        <ThreatEvidenceV2
          isOpen={threatEvidenceOpen}
          onClose={() => {
            setThreatEvidenceOpen(false);
            setSelectedThreatChampion(null);
          }}
          championName={selectedThreatChampion.championName}
          championImage={selectedThreatChampion.championImage}
          teamName={ourSide === 'blue' ? redTeamName : blueTeamName}
          evidences={selectedThreatChampion.evidences}
          source={selectedThreatChampion.source}
        />
      )}
    </div>
  );
}
