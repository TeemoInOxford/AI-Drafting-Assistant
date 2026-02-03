'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Champion, BanEntry } from '../lib/types';
import {
  BanCandidate,
  generateBanCandidates,
  getCandidateTier,
  getTierDisplay,
  REASON_LABELS,
  ReasonType,
} from '../lib/ban-candidate-engine';
import { Evidence } from '../lib/grid-v2-evidence-engine';
import ThreatEvidenceV2 from './ThreatEvidenceV2';
import { type LeagueKey } from '../lib/league-types';

// ============================================================================
// Types
// ============================================================================

interface BanPhaseDraftingAssistantProps {
  // Draft state
  ourSide: 'blue' | 'red';
  currentStepIndex: number;
  blueBans: BanEntry[];
  redBans: BanEntry[];
  bluePicks?: (Champion | null)[];
  redPicks?: (Champion | null)[];
  blueTeamName?: string;
  redTeamName?: string;
  champions: Champion[];

  // Team info
  opponentTeamId: string | null;
  opponentTeamName?: string;

  // League context
  selectedLeague: LeagueKey;

  // Actions
  onChampionClick?: (championId: string) => void;
  isUserTurn: boolean;

  // Ban context for prediction
  banContext?: {
    banSlot: 1 | 2 | 3;
    banningSide: 'blue' | 'red';
    opponentLastBan: string | null;
    alreadyBanned: string[];
  };

  // Additional disabled champions (e.g., fearless pool)
  additionalDisabled?: string[];
}

interface PredictionResult {
  champion: string;
  probability: number;
}

// ============================================================================
// Sub-components
// ============================================================================

function ReasonBadge({ reason }: { reason: { type: ReasonType; shortLabel: string; value: number } }) {
  const display = REASON_LABELS[reason.type];
  return (
    <span
      className={`text-[8px] px-1.5 py-0.5 rounded border ${display.color}`}
      title={`${display.label}: ${(reason.value * 100).toFixed(0)}%`}
    >
      {display.icon} {reason.shortLabel}
    </span>
  );
}

function PTSBar({ components }: { components: { share_meta: number; share_threat: number; share_predict: number; share_flex: number } }) {
  return (
    <div className="flex h-1 rounded-full overflow-hidden bg-slate-700/50">
      {components.share_meta > 0 && (
        <div
          className="bg-slate-400"
          style={{ width: `${components.share_meta * 100}%` }}
          title={`Meta: ${(components.share_meta * 100).toFixed(0)}%`}
        />
      )}
      {components.share_threat > 0 && (
        <div
          className="bg-blue-400"
          style={{ width: `${components.share_threat * 100}%` }}
          title={`Threat: ${(components.share_threat * 100).toFixed(0)}%`}
        />
      )}
      {components.share_predict > 0 && (
        <div
          className="bg-cyan-400"
          style={{ width: `${components.share_predict * 100}%` }}
          title={`Predict: ${(components.share_predict * 100).toFixed(0)}%`}
        />
      )}
      {components.share_flex > 0 && (
        <div
          className="bg-amber-400"
          style={{ width: `${components.share_flex * 100}%` }}
          title={`Flex: ${(components.share_flex * 100).toFixed(0)}%`}
        />
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function BanPhaseDraftingAssistant({
  ourSide,
  currentStepIndex,
  blueBans,
  redBans,
  bluePicks = [],
  redPicks = [],
  blueTeamName,
  redTeamName,
  champions,
  opponentTeamId,
  opponentTeamName,
  selectedLeague,
  onChampionClick,
  isUserTurn,
  banContext,
  additionalDisabled = [],
}: BanPhaseDraftingAssistantProps) {
  // State
  const [candidates, setCandidates] = useState<BanCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [predictions, setPredictions] = useState<PredictionResult[]>([]);
  const [showTendencies, setShowTendencies] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<BanCandidate | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [predictionExpanded, setPredictionExpanded] = useState(false);

  // Calculate already banned champions (null-safe with filter(Boolean) first)
  const alreadyBanned = useMemo(() => {
    return [
      ...blueBans.filter(Boolean).filter(b => b?.champion?.name).map(b => b.champion!.name),
      ...redBans.filter(Boolean).filter(b => b?.champion?.name).map(b => b.champion!.name),
    ];
  }, [blueBans, redBans]);

  // Calculate already picked champions (for Ban Phase 2)
  const alreadyPicked = useMemo(() => {
    return [
      ...bluePicks.filter(Boolean).filter(p => p?.name).map(p => p!.name),
      ...redPicks.filter(Boolean).filter(p => p?.name).map(p => p!.name),
    ];
  }, [bluePicks, redPicks]);

  // Combined unavailable champions (banned + picked)
  const unavailableChampions = useMemo(() => {
    return [...alreadyBanned, ...alreadyPicked];
  }, [alreadyBanned, alreadyPicked]);

  // Fix 1: Build championIdMap from champions array (lowercase name -> id)
  const championIdMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const champ of champions) {
      if (champ.name && champ.id) {
        map.set(champ.name.toLowerCase(), champ.id);
      }
    }
    return map;
  }, [champions]);

  // Current turn info
  const currentTurn = useMemo(() => {
    // Ban Phase 1: steps 0-5 (B1-B3 for each side)
    // Ban Phase 2: steps 12-15 (B4-B5 for each side)
    if (currentStepIndex <= 5) {
      const banNum = Math.floor(currentStepIndex / 2) + 1;
      const side = currentStepIndex % 2 === 0 ? 'Blue' : 'Red';
      return `${side} Ban ${banNum}`;
    } else if (currentStepIndex >= 12 && currentStepIndex <= 15) {
      // Ban Phase 2: steps 12=RedB4, 13=BlueB4, 14=RedB5, 15=BlueB5
      const phase2Step = currentStepIndex - 12;
      const banNum = Math.floor(phase2Step / 2) + 4;
      const side = phase2Step % 2 === 0 ? 'Red' : 'Blue';
      return `${side} Ban ${banNum}`;
    }
    return 'Ban Phase';
  }, [currentStepIndex]);

  // Gate: only fetch during ban phase (steps 0-5 and 12-15)
  const isBanPhase = currentStepIndex <= 5 || (currentStepIndex >= 12 && currentStepIndex <= 15);

  // Fetch all data and generate candidates
  useEffect(() => {
    // Never fetch during pick phase
    if (!isBanPhase) {
      setCandidates([]);
      setLoading(false);
      return;
    }

    if (!opponentTeamId) {
      setCandidates([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const signal = controller.signal;

    async function fetchAndGenerate() {
      setLoading(true);

      try {
        // Parallel fetch all data sources
        const [metaRes, teamDenialRes, playerSpecRes, predictionRes] = await Promise.all([
          // 1. Meta data
          fetch(`/api/meta?league=${selectedLeague}&_=${Date.now()}`, { cache: 'no-store', signal }),
          // 2. Team denial threats
          fetch(`/api/threat-signals?action=allTeam&source=grid_v2&team_id=${opponentTeamId}&_=${Date.now()}`, { cache: 'no-store', signal }),
          // 3. Player specialty threats
          fetch(`/api/threat-signals?action=playerTeam&source=grid_v2&team_id=${opponentTeamId}&_=${Date.now()}`, { cache: 'no-store', signal }),
          // 4. Ban predictions
          banContext
            ? fetch(`/api/ban-prediction?team_id=${banContext.banningSide === ourSide ? opponentTeamId : opponentTeamId}&side=${banContext.banningSide}&ban_slot=${banContext.banSlot}&opponent_last_ban=${banContext.opponentLastBan || ''}&already_banned=${banContext.alreadyBanned.join(',')}&_=${Date.now()}`, { cache: 'no-store', signal })
            : Promise.resolve(null),
        ]);

        // Parse responses
        let metaData: Array<{ name: string; presence: number; banRate: number }> = [];
        let teamDenialData: Record<string, any> = {};
        let playerSpecData: Record<string, any> = {};
        let predictionData: Array<{ champion: string; probability: number }> = [];

        if (metaRes.ok) {
          const data = await metaRes.json();
          if (data.success && data.data?.champions) {
            metaData = data.data.champions.map((c: any) => ({
              name: c.name,
              presence: c.presence / 100,
              banRate: c.banRate / 100,
            }));
          }
        }

        if (teamDenialRes.ok) {
          const data = await teamDenialRes.json();
          if (data.success && data.data) {
            teamDenialData = data.data;
          }
        }

        if (playerSpecRes.ok) {
          const data = await playerSpecRes.json();
          if (data.success && data.data) {
            playerSpecData = data.data;
          }
        }

        if (predictionRes && predictionRes.ok) {
          const data = await predictionRes.json();
          if (data.success && data.predictions) {
            predictionData = data.predictions.map((p: any) => ({
              champion: p.champion,
              probability: p.probability,
            }));
            setPredictions(data.predictions.slice(0, 5)); // Store up to 5 for expanded view
          }
        }

        // Generate candidates
        const result = generateBanCandidates({
          opponentTeamId,
          alreadyBanned: unavailableChampions, // Include both banned and picked champions
          league: selectedLeague,
          metaData,
          teamDenialData,
          playerSpecData,
          predictionData,
          // Fix 1: Use ID-based parameters
          additionalDisabledIds: additionalDisabled, // Already IDs from page.tsx
          championIdMap,
        });

        // Map champion IDs and images (championId already set by engine)
        const candidatesWithImages = result.candidates.map(c => {
          const champ = champions.find(ch => ch.id === c.championId);
          return {
            ...c,
            championImage: champ?.image,
          };
        });

        setCandidates(candidatesWithImages);
      } catch (error) {
        // Ignore abort errors
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        console.error('[BanPhaseDraftingAssistant] Failed to fetch data:', error);
        setCandidates([]);
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchAndGenerate();

    // Cleanup: abort fetch on unmount or dependency change
    return () => {
      controller.abort();
    };
  }, [opponentTeamId, selectedLeague, unavailableChampions, banContext, champions, ourSide, isBanPhase, additionalDisabled, championIdMap]);

  // Calculate all PTS scores for tier classification
  const allPtsScores = useMemo(() => candidates.map(c => c.pts_score), [candidates]);

  // Handle candidate click for evidence modal
  const handleCandidateClick = (candidate: BanCandidate) => {
    setSelectedCandidate(candidate);
    setEvidenceOpen(true);
  };

  // Build evidence array for modal
  const buildEvidences = (candidate: BanCandidate): Evidence[] => {
    const evidences: Evidence[] = [];

    if (candidate.teamDenialData) {
      evidences.push({
        type: 'TEAM_DENIAL',
        score: candidate.teamDenialData.score || 0,
        components: candidate.teamDenialData.components,
        summary: `Frequently banned against this team`,
        details: {
          top_opponent_teams: candidate.teamDenialData.evidence?.top_opponent_teams,
          raw_opponent_ban: candidate.teamDenialData.evidence?.raw_scores?.opponent_ban_weighted,
          raw_meta_ban: candidate.teamDenialData.evidence?.raw_scores?.meta_ban_rate,
        },
        source: 'grid_v2',
      });
    }

    if (candidate.playerSpecData) {
      const topPlayer = candidate.playerSpecData.evidence?.top_players?.[0];
      evidences.push({
        type: 'PLAYER_SPECIALTY',
        score: candidate.playerSpecData.score || 0,
        components: candidate.playerSpecData.components,
        summary: topPlayer ? `${topPlayer.player_name} specialty` : 'Team pool threat',
        details: {
          top_players: candidate.playerSpecData.evidence?.top_players,
          players_count: candidate.playerSpecData.players_count,
          total_games_weighted: candidate.playerSpecData.evidence?.raw_scores?.team_pool,
        },
        source: 'grid_v2',
      });
    }

    return evidences;
  };

  // Divider component
  const Divider = () => <div className="border-t border-slate-700/50 my-3" />;

  // Primary recommendation (top candidate)
  const topCandidate = candidates[0];

  return (
    <div className={`relative rounded-lg border-2 p-4 shadow-xl transition-all duration-300 ${
      isUserTurn
        ? ourSide === 'blue'
          ? 'bg-slate-900/95 backdrop-blur-sm border-cyan-500/50'
          : 'bg-slate-900/95 backdrop-blur-sm border-rose-500/50'
        : 'bg-slate-900/50 backdrop-blur-sm border-slate-600/50 opacity-60 pointer-events-none'
    }`}>
      {/* Title Badge */}
      <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-slate-800 border border-slate-600/50">
        <span className="text-[9px] font-bold text-slate-400 tracking-wider">DRAFTING ASSISTANT</span>
      </div>

      {/* Header with Current Turn + Prediction */}
      <div className={`-mx-4 -mt-4 mb-4 px-4 py-3 pt-6 border-b ${
        ourSide === 'blue'
          ? 'bg-cyan-500/10 border-cyan-500/30'
          : 'bg-rose-500/10 border-rose-500/30'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`font-bold text-base ${
              ourSide === 'blue' ? 'text-cyan-300' : 'text-rose-300'
            }`}>
              {ourSide === 'blue' ? (blueTeamName || 'BLUE') : (redTeamName || 'RED')}
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-white font-bold text-base">{currentTurn}</span>
          </div>

          {/* Embedded Prediction Badge - Top2 + hover for Top5 */}
          {predictions.length > 0 && (
            <div
              className="relative flex items-center gap-1.5"
              onMouseEnter={() => setPredictionExpanded(true)}
              onMouseLeave={() => setPredictionExpanded(false)}
            >
              <span className="text-[9px] text-slate-500">Predicted:</span>
              {predictions.slice(0, 2).map((p, i) => (
                <span
                  key={p.champion}
                  className={`text-[9px] px-1.5 py-0.5 rounded ${
                    i === 0
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'bg-slate-700/50 text-slate-400 border border-slate-600/30'
                  }`}
                >
                  {p.champion} {(p.probability * 100).toFixed(0)}%
                </span>
              ))}
              {predictions.length > 2 && (
                <span className="text-[9px] text-slate-500 cursor-help">+{predictions.length - 2}</span>
              )}

              {/* Expanded prediction popover */}
              {predictionExpanded && predictions.length > 2 && (
                <div className="absolute top-full right-0 mt-1 z-50 bg-slate-800 border border-slate-600 rounded-lg p-2 shadow-xl min-w-[160px]">
                  <p className="text-[9px] text-slate-500 mb-1">All predictions:</p>
                  {predictions.slice(0, 5).map((p, i) => (
                    <div
                      key={p.champion}
                      className="flex items-center justify-between text-[10px] py-0.5"
                    >
                      <span className={i === 0 ? 'text-cyan-300' : 'text-slate-300'}>{p.champion}</span>
                      <span className="text-slate-500">{(p.probability * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="space-y-3 text-sm">
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full mx-auto mb-2" />
            <p className="text-slate-500 text-xs">Loading candidates...</p>
          </div>
        ) : candidates.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-slate-500 text-sm">No opponent team selected</p>
            <p className="text-slate-600 text-xs mt-1">Select a team in the wizard to see ban candidates</p>
          </div>
        ) : (
          <>
            {/* Opp Tendencies Button */}
            <div className="flex justify-end">
              <button
                onClick={() => setShowTendencies(true)}
                className="text-[9px] px-2 py-1 rounded bg-slate-800/50 text-slate-400 hover:text-slate-300 hover:bg-slate-700/50 border border-slate-700/50 transition-colors"
              >
                📋 Opp Tendencies
              </button>
            </div>

            {/* Primary Recommendation */}
            {topCandidate && (
              <div>
                <h3 className="text-cyan-400 font-black text-xs uppercase tracking-wider mb-2">
                  TOP BAN TARGET
                </h3>
                <Divider />
                <div className="bg-slate-800/50 rounded p-3 border border-cyan-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-bold text-sm">{topCandidate.championName}</span>
                      {(() => {
                        const tier = getCandidateTier(topCandidate.pts_score, allPtsScores);
                        const display = getTierDisplay(tier);
                        return (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${display.color}`}>
                            {display.label}
                          </span>
                        );
                      })()}
                      <span className="text-[9px] text-slate-500">
                        PTS {(topCandidate.pts_score * 100).toFixed(0)}
                      </span>
                    </div>
                    <button
                      onClick={() => topCandidate.championId && onChampionClick?.(topCandidate.championId)}
                      className="px-3 py-1 text-[10px] font-bold uppercase bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 rounded transition-colors"
                    >
                      Ban
                    </button>
                  </div>

                  {/* PTS Bar */}
                  <div className="mb-2">
                    <PTSBar components={topCandidate.pts_components} />
                  </div>

                  {/* Reasons */}
                  <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                    <span className="text-[9px] text-slate-500">Why:</span>
                    {topCandidate.reasons.slice(0, 3).map((r, i) => (
                      <ReasonBadge key={i} reason={r} />
                    ))}
                  </div>

                  {/* Detailed reasons */}
                  <div className="text-[10px] text-slate-400 space-y-0.5">
                    <ul className="ml-2 space-y-0.5">
                      {topCandidate.reasons.slice(0, 3).map((r, i) => (
                        <li key={i}>• {r.label}</li>
                      ))}
                    </ul>
                  </div>

                  {/* View Evidence button */}
                  <button
                    onClick={() => handleCandidateClick(topCandidate)}
                    className="mt-2 text-[9px] text-slate-500 hover:text-slate-400 underline"
                  >
                    View evidence details →
                  </button>
                </div>
              </div>
            )}

            {/* Other Candidates */}
            {candidates.length > 1 && (
              <div>
                <Divider />
                <h3 className="text-slate-400 font-bold text-xs uppercase tracking-wider mb-2">
                  OTHER CANDIDATES
                </h3>
                <Divider />
                <div className="space-y-1.5">
                  {candidates.slice(1, 6).map((candidate, i) => {
                    const tier = getCandidateTier(candidate.pts_score, allPtsScores);
                    const display = getTierDisplay(tier);

                    return (
                      <motion.div
                        key={candidate.championName}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex items-center justify-between py-2 px-3 bg-slate-800/30 rounded border border-slate-700/30 hover:bg-slate-800/50 transition-all"
                      >
                        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                          <span className="text-white font-medium text-sm truncate">{candidate.championName}</span>
                          <span className={`text-[8px] px-1 py-0.5 rounded border ${display.color}`}>
                            {display.label}
                          </span>
                          {/* Top reason badge */}
                          {candidate.reasons[0] && (
                            <ReasonBadge reason={candidate.reasons[0]} />
                          )}
                          <span className="text-[9px] text-slate-600">
                            PTS {(candidate.pts_score * 100).toFixed(0)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleCandidateClick(candidate)}
                            className="px-1.5 py-0.5 text-[8px] text-slate-500 hover:text-slate-400"
                            title="View evidence"
                          >
                            👁
                          </button>
                          <button
                            onClick={() => candidate.championId && onChampionClick?.(candidate.championId)}
                            className="px-2 py-0.5 text-[9px] font-medium uppercase bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 border border-slate-600/50 rounded transition-colors"
                          >
                            Ban
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Expandable list for more candidates */}
            {candidates.length > 6 && (
              <details className="text-xs">
                <summary className="text-slate-500 cursor-pointer hover:text-slate-400">
                  +{candidates.length - 6} more candidates
                </summary>
                <div className="mt-2 space-y-1">
                  {candidates.slice(6, 12).map((candidate) => (
                    <div
                      key={candidate.championName}
                      className="flex items-center justify-between py-1 px-2 text-slate-500"
                    >
                      <span>{candidate.championName}</span>
                      <span className="text-[9px]">PTS {(candidate.pts_score * 100).toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}

        {/* Footer */}
        <Divider />
        {isUserTurn ? (
          <div className="bg-indigo-500/10 rounded-lg p-2.5 border border-indigo-500/30">
            <div className="text-xs text-indigo-300 font-medium">
              Your turn — Make your decision
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">
              AI highlights threats. Final call is yours.
            </div>
          </div>
        ) : (
          <p className="text-[10px] text-slate-500 text-center">
            Waiting for opponent...
          </p>
        )}
      </div>

      {/* Opp Tendencies Drawer */}
      <AnimatePresence>
        {showTendencies && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowTendencies(false)}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute right-0 top-0 h-full w-full max-w-md bg-slate-900 border-l border-slate-700 shadow-xl overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-white">Opponent Tendencies</h2>
                    {banContext && (
                      <p className="text-[10px] text-slate-500">
                        Currently at B{banContext.banSlot} phase
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setShowTendencies(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="text-sm text-slate-400 mb-4">
                  <p className="font-medium text-slate-300 mb-2">Team: {opponentTeamName || 'Unknown'}</p>
                  <p className="text-xs">
                    Historical ban patterns and player pool data for strategic planning.
                  </p>
                </div>

                {/* Ban Slot Context Indicator */}
                {banContext && (
                  <div className="mb-4 p-2 bg-slate-800/50 rounded border border-slate-700/50">
                    <div className="flex items-center gap-4 text-xs">
                      {[1, 2, 3].map(slot => (
                        <div
                          key={slot}
                          className={`px-2 py-1 rounded ${
                            banContext.banSlot === slot
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                              : 'text-slate-500'
                          }`}
                        >
                          B{slot} {banContext.banSlot === slot && '← Current'}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Team Denial Summary */}
                <div className="mb-4">
                  <h3 className="text-xs font-bold text-blue-400 mb-2">TEAM DENIAL PATTERNS</h3>
                  <div className="space-y-1">
                    {candidates
                      .filter(c => c.teamDenialData && c.teamDenialData.score > 0)
                      .slice(0, 5)
                      .map(c => (
                        <div key={c.championName} className="flex items-center justify-between text-xs py-1 px-2 bg-slate-800/50 rounded">
                          <span className="text-slate-300">{c.championName}</span>
                          <span className="text-blue-400">{((c.teamDenialData.components?.OPPONENT_BAN || 0) * 100).toFixed(0)}% denial</span>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Player Pool Summary */}
                <div className="mb-4">
                  <h3 className="text-xs font-bold text-purple-400 mb-2">PLAYER POOL THREATS</h3>
                  <div className="space-y-1">
                    {candidates
                      .filter(c => c.playerSpecData && c.playerSpecData.score > 0)
                      .slice(0, 5)
                      .map(c => {
                        const topPlayer = c.playerSpecData?.evidence?.top_players?.[0];
                        return (
                          <div key={c.championName} className="flex items-center justify-between text-xs py-1 px-2 bg-slate-800/50 rounded">
                            <span className="text-slate-300">{c.championName}</span>
                            <span className="text-purple-400">{topPlayer?.player_name || 'Team pool'}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Prediction Summary */}
                {predictions.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-cyan-400 mb-2">PREDICTED BANS</h3>
                    <div className="space-y-1">
                      {predictions.map(p => (
                        <div key={p.champion} className="flex items-center justify-between text-xs py-1 px-2 bg-slate-800/50 rounded">
                          <span className="text-slate-300">{p.champion}</span>
                          <span className="text-cyan-400">{(p.probability * 100).toFixed(0)}% likely</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Evidence Modal */}
      {selectedCandidate && (
        <ThreatEvidenceV2
          isOpen={evidenceOpen}
          onClose={() => {
            setEvidenceOpen(false);
            setSelectedCandidate(null);
          }}
          championName={selectedCandidate.championName}
          championImage={selectedCandidate.championImage}
          teamName={opponentTeamName}
          evidences={buildEvidences(selectedCandidate)}
          source="grid_v2"
        />
      )}
    </div>
  );
}
