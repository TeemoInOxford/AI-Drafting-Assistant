'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Champion, BanEntry } from '../lib/types';
import {
  PickCandidate,
  generatePickCandidates,
  getPickCandidateTier,
  getPickTierDisplay,
  PICK_REASON_LABELS,
  PickReasonType,
} from '../lib/pick-candidate-engine';
import { type LeagueKey } from '../lib/league-types';
import OpponentTendenciesDrawer from './OpponentTendenciesDrawer';

// ============================================================================
// Types
// ============================================================================

interface PickPhaseDraftingAssistantProps {
  ourSide: 'blue' | 'red';
  currentStepIndex: number;
  bluePicks: (Champion | null)[];
  redPicks: (Champion | null)[];
  blueBans: BanEntry[];
  redBans: BanEntry[];
  blueTeamName?: string;
  redTeamName?: string;
  champions: Champion[];
  ourTeamId: string | null;
  ourTeamName?: string;
  opponentTeamId: string | null;
  opponentTeamName?: string;
  selectedLeague: LeagueKey;
  onChampionClick?: (championId: string) => void;
  isUserTurn: boolean;
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

function PickReasonBadge({ reason }: { reason: { type: PickReasonType; shortLabel: string; value: number } }) {
  const display = PICK_REASON_LABELS[reason.type];
  return (
    <span
      className={`text-[8px] px-1.5 py-0.5 rounded border ${display.color}`}
      title={`${display.label}: ${(reason.value * 100).toFixed(0)}%`}
    >
      {display.icon} {reason.shortLabel}
    </span>
  );
}

function PickPTSBar({ components }: {
  components: {
    share_meta: number;
    share_comfort: number;
    share_predict: number;
    share_deny: number;
    share_flex: number;
    share_synergy: number;
    share_counter: number;
  }
}) {
  return (
    <div className="flex h-1 rounded-full overflow-hidden bg-slate-700/50">
      {components.share_meta > 0 && (
        <div
          className="bg-slate-400"
          style={{ width: `${components.share_meta * 100}%` }}
          title={`Meta: ${(components.share_meta * 100).toFixed(0)}%`}
        />
      )}
      {components.share_comfort > 0 && (
        <div
          className="bg-green-400"
          style={{ width: `${components.share_comfort * 100}%` }}
          title={`Comfort: ${(components.share_comfort * 100).toFixed(0)}%`}
        />
      )}
      {components.share_predict > 0 && (
        <div
          className="bg-cyan-400"
          style={{ width: `${components.share_predict * 100}%` }}
          title={`Predict: ${(components.share_predict * 100).toFixed(0)}%`}
        />
      )}
      {components.share_deny > 0 && (
        <div
          className="bg-red-400"
          style={{ width: `${components.share_deny * 100}%` }}
          title={`Deny: ${(components.share_deny * 100).toFixed(0)}%`}
        />
      )}
      {components.share_flex > 0 && (
        <div
          className="bg-amber-400"
          style={{ width: `${components.share_flex * 100}%` }}
          title={`Flex: ${(components.share_flex * 100).toFixed(0)}%`}
        />
      )}
      {components.share_synergy > 0 && (
        <div
          className="bg-purple-400"
          style={{ width: `${components.share_synergy * 100}%` }}
          title={`Synergy: ${(components.share_synergy * 100).toFixed(0)}%`}
        />
      )}
      {components.share_counter > 0 && (
        <div
          className="bg-orange-400"
          style={{ width: `${components.share_counter * 100}%` }}
          title={`Counter: ${(components.share_counter * 100).toFixed(0)}%`}
        />
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function PickPhaseDraftingAssistant({
  ourSide,
  currentStepIndex,
  bluePicks,
  redPicks,
  blueBans,
  redBans,
  blueTeamName,
  redTeamName,
  champions,
  ourTeamId,
  ourTeamName,
  opponentTeamId,
  opponentTeamName,
  selectedLeague,
  onChampionClick,
  isUserTurn,
  additionalDisabled = [],
}: PickPhaseDraftingAssistantProps) {
  const [candidates, setCandidates] = useState<PickCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [predictions, setPredictions] = useState<PredictionResult[]>([]);
  const [predictionExpanded, setPredictionExpanded] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<PickCandidate | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [showTendencies, setShowTendencies] = useState(false);

  // Calculate already used champions (null-safe with filter(Boolean) first)
  const alreadyPicked = useMemo(() => [
    ...bluePicks.filter(Boolean).filter(p => p?.name).map(p => p!.name),
    ...redPicks.filter(Boolean).filter(p => p?.name).map(p => p!.name),
  ], [bluePicks, redPicks]);

  const alreadyBanned = useMemo(() => [
    ...blueBans.filter(Boolean).filter(b => b?.champion?.name).map(b => b.champion!.name),
    ...redBans.filter(Boolean).filter(b => b?.champion?.name).map(b => b.champion!.name),
  ], [blueBans, redBans]);

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

  // Determine current pick info
  const currentPickInfo = useMemo(() => {
    // Steps 6-19 are picks (after 6 bans)
    // Sequence: 6=BlueP1, 7-8=RedP1P2, 9-10=BlueP2P3, 11=RedP3, 12-13=Bans, 14-15=RedP4P5, 16-17=BlueP4P5
    // Simplified: count picks per side
    const ourPicks = ourSide === 'blue' ? bluePicks : redPicks;
    const pickedCount = ourPicks.filter(Boolean).length;
    const pickSlot = `P${pickedCount + 1}`;

    return {
      pickSlot,
      side: ourSide,
      pickNumber: pickedCount + 1,
    };
  }, [currentStepIndex, ourSide, bluePicks, redPicks]);

  const currentTurn = useMemo(() => {
    const side = currentStepIndex % 2 === 0 ? 'Blue' : 'Red';
    return `${side} Pick`;
  }, [currentStepIndex]);

  // Calculate our team's and enemy team's already-picked champions (null-safe with filter(Boolean) first)
  const ourPickedChamps = useMemo(() => {
    const picks = ourSide === 'blue' ? bluePicks : redPicks;
    return picks.filter(Boolean).filter(p => p?.name).map(p => p!.name);
  }, [ourSide, bluePicks, redPicks]);

  const enemyPickedChamps = useMemo(() => {
    const picks = ourSide === 'blue' ? redPicks : bluePicks;
    return picks.filter(Boolean).filter(p => p?.name).map(p => p!.name);
  }, [ourSide, bluePicks, redPicks]);

  // Fetch data and generate candidates
  useEffect(() => {
    if (!ourTeamId) {
      setCandidates([]);
      setLoading(false);
      return;
    }

    async function fetchAndGenerate() {
      setLoading(true);

      try {
        // Parallel fetch all data
        const [metaRes, predictRes, comfortRes, denyRes] = await Promise.all([
          // Meta data
          fetch(`/api/meta?league=${selectedLeague}&_=${Date.now()}`, { cache: 'no-store' }),
          // Pick predictions for our team
          ourTeamId ? fetch(`/api/pick-prediction?team_id=${ourTeamId}&side=${ourSide}&pick_slot=${currentPickInfo.pickSlot}&already_picked=${alreadyPicked.join(',')}&topK=5&_=${Date.now()}`, { cache: 'no-store' }) : Promise.resolve(null),
          // Player comfort from our team's player pool
          ourTeamId ? fetch(`/api/threat-signals?action=playerTeam&source=grid_v2&team_id=${ourTeamId}&_=${Date.now()}`, { cache: 'no-store' }) : Promise.resolve(null),
          // Deny data from opponent's player threats
          opponentTeamId ? fetch(`/api/threat-signals?action=playerTeam&source=grid_v2&team_id=${opponentTeamId}&_=${Date.now()}`, { cache: 'no-store' }) : Promise.resolve(null),
        ]);

        // Parse responses
        let metaData: Array<{ name: string; presence: number; pickRate: number }> = [];
        let predictData: Array<{ champion: string; probability: number; base_rate?: number; response_boost?: number }> = [];
        let comfortData: Record<string, { playerName: string; gamesWeighted: number; winRate: number; playersCount: number }> = {};
        let denyData: Record<string, { playerName: string; gamesWeighted: number }> = {};

        if (metaRes.ok) {
          const data = await metaRes.json();
          if (data.success && data.data?.champions && Array.isArray(data.data.champions)) {
            metaData = data.data.champions
              .filter((c: any) => c && typeof c.name === 'string' && c.name.trim())
              .map((c: any) => ({
                name: c.name,
                presence: typeof c.presence === 'number' ? c.presence / 100 : 0,
                pickRate: typeof c.pickRate === 'number' ? c.pickRate / 100 : 0,
              }));
          }
        }

        if (predictRes && predictRes.ok) {
          const data = await predictRes.json();
          if (data.success && data.predictions && Array.isArray(data.predictions)) {
            // Filter out invalid predictions
            const validPredictions = data.predictions.filter(
              (p: any) => p && typeof p.champion === 'string' && p.champion.trim() && typeof p.probability === 'number'
            );
            predictData = validPredictions;
            setPredictions(validPredictions.slice(0, 5));
          }
        }

        if (comfortRes && comfortRes.ok) {
          const data = await comfortRes.json();
          if (data.success && data.data) {
            // Convert player threat data to comfort format
            Object.entries(data.data).forEach(([champName, signal]: [string, any]) => {
              const topPlayer = signal.evidence?.top_players?.[0];
              if (topPlayer) {
                comfortData[champName] = {
                  playerName: topPlayer.player_name,
                  gamesWeighted: topPlayer.games_weighted,
                  winRate: topPlayer.win_rate_weighted || 0.5,
                  playersCount: signal.players_count || 1,
                };
              }
            });
          }
        }

        if (denyRes && denyRes.ok) {
          const data = await denyRes.json();
          if (data.success && data.data) {
            Object.entries(data.data).forEach(([champName, signal]: [string, any]) => {
              const topPlayer = signal.evidence?.top_players?.[0];
              if (topPlayer) {
                denyData[champName] = {
                  playerName: topPlayer.player_name,
                  gamesWeighted: topPlayer.games_weighted,
                };
              }
            });
          }
        }

        // Fetch synergy and counter data based on current draft state
        let synergyData: Record<string, { partner: string; lift: number; winRate: number; sampleSize: number }> = {};
        let counterData: Record<string, { target: string; role: string; winRate: number; sampleSize: number }> = {};

        // Collect all candidate champion names for batch synergy/counter lookup
        const candidateNames = new Set<string>();
        for (const m of metaData.slice(0, 10)) candidateNames.add(m.name);
        for (const key of Object.keys(comfortData).slice(0, 10)) candidateNames.add(key);
        for (const p of predictData.slice(0, 5)) candidateNames.add(p.champion);
        for (const key of Object.keys(denyData).slice(0, 5)) candidateNames.add(key);

        // Fetch synergy data for each candidate with our allies
        if (ourPickedChamps.length > 0) {
          const synergyPromises = Array.from(candidateNames).map(async (champName) => {
            // Skip already picked/banned or invalid names
            if (!champName || alreadyPicked.includes(champName) || alreadyBanned.includes(champName)) return;
            try {
              const alliesStr = ourPickedChamps.join(',');
              const res = await fetch(
                `/api/synergy?champion=${encodeURIComponent(champName)}&allies=${encodeURIComponent(alliesStr)}&side=${ourSide === 'blue' ? 'BLUE' : 'RED'}&_=${Date.now()}`,
                { cache: 'no-store' }
              );
              if (res.ok) {
                const data = await res.json();
                // Strict validation: success must be true, ally_synergies must be array
                if (data.success === true && Array.isArray(data.ally_synergies)) {
                  // Find best synergy partner among our allies
                  let bestLift = -Infinity;
                  let bestPartner = '';
                  let bestWR = 0;
                  let bestSample = 0;
                  for (const allyResult of data.ally_synergies) {
                    // Validate each synergy result
                    if (allyResult?.synergy &&
                        typeof allyResult.synergy.lift === 'number' &&
                        typeof allyResult.ally === 'string' &&
                        allyResult.synergy.lift > bestLift) {
                      bestLift = allyResult.synergy.lift;
                      bestPartner = allyResult.ally;
                      bestWR = typeof allyResult.synergy.win_rate_weighted === 'number' ? allyResult.synergy.win_rate_weighted : 0;
                      bestSample = typeof allyResult.synergy.sample_size === 'number' ? allyResult.synergy.sample_size : 0;
                    }
                  }
                  if (bestLift > 0 && bestPartner) {
                    synergyData[champName] = {
                      partner: bestPartner.charAt(0).toUpperCase() + bestPartner.slice(1),
                      lift: bestLift,
                      winRate: bestWR,
                      sampleSize: bestSample,
                    };
                  }
                }
              }
            } catch {
              // Ignore individual synergy fetch errors
            }
          });
          await Promise.all(synergyPromises);
        }

        // Fetch counter data for each candidate against enemy picks
        if (enemyPickedChamps.length > 0) {
          const counterPromises = Array.from(candidateNames).map(async (champName) => {
            // Skip already picked/banned or invalid names
            if (!champName || alreadyPicked.includes(champName) || alreadyBanned.includes(champName)) return;
            try {
              // Check against each enemy pick
              for (const enemyChamp of enemyPickedChamps) {
                if (!enemyChamp) continue;
                const res = await fetch(
                  `/api/counter?target=${encodeURIComponent(enemyChamp)}&champion=${encodeURIComponent(champName)}&_=${Date.now()}`,
                  { cache: 'no-store' }
                );
                if (res.ok) {
                  const data = await res.json();
                  // Strict validation: success must be true, found must be true, data must exist with required fields
                  if (data.success === true &&
                      data.found === true &&
                      data.data &&
                      data.data.is_effective === true &&
                      typeof data.data.win_rate_weighted === 'number') {
                    // Only add if it's a positive counter (win rate > 50%)
                    const existing = counterData[champName];
                    if (!existing || data.data.win_rate_weighted > existing.winRate) {
                      counterData[champName] = {
                        target: enemyChamp,
                        role: typeof data.role === 'string' ? data.role : 'UNKNOWN',
                        winRate: data.data.win_rate_weighted,
                        sampleSize: typeof data.data.sample_size === 'number' ? data.data.sample_size : 0,
                      };
                    }
                  }
                }
              }
            } catch {
              // Ignore individual counter fetch errors
            }
          });
          await Promise.all(counterPromises);
        }

        // Generate candidates
        const result = generatePickCandidates({
          ourTeamId,
          opponentTeamId,
          alreadyPicked,
          alreadyBanned,
          league: selectedLeague,
          metaData,
          comfortData,
          predictData,
          denyData,
          synergyData,
          counterData,
          ourAlreadyPicked: ourPickedChamps,
          enemyAlreadyPicked: enemyPickedChamps,
          // Fix 1: Use ID-based parameters
          additionalDisabledIds: additionalDisabled, // Already IDs from page.tsx
          championIdMap,
        });

        // Map champion images (championId already set by engine)
        const candidatesWithImages = result.candidates
          .filter(c => c && typeof c.championName === 'string' && c.championName.trim() && c.championId)
          .map(c => {
            const champ = champions.find(ch => ch.id === c.championId);
            return {
              ...c,
              championImage: champ?.image,
            };
          });

        setCandidates(candidatesWithImages);
      } catch (error) {
        console.error('[PickPhaseDraftingAssistant] Failed to fetch data:', error);
        setCandidates([]);
      } finally {
        setLoading(false);
      }
    }

    fetchAndGenerate();
  }, [ourTeamId, opponentTeamId, selectedLeague, alreadyPicked, alreadyBanned, currentPickInfo, champions, ourSide, ourPickedChamps, enemyPickedChamps, additionalDisabled, championIdMap]);

  // Safe candidates filter - ensure all have valid championName and championId for rendering
  const safeCandidates = useMemo(() =>
    candidates.filter(c => c && typeof c.championName === 'string' && c.championName.trim() && c.championId),
  [candidates]);

  const allPtsScores = useMemo(() => safeCandidates.map(c => c.pts_score), [safeCandidates]);

  const handleCandidateClick = (candidate: PickCandidate) => {
    setSelectedCandidate(candidate);
    setEvidenceOpen(true);
  };

  const Divider = () => <div className="border-t border-slate-700/50 my-3" />;

  const topCandidate = safeCandidates[0];

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
            <span className="text-white font-bold text-base">{currentPickInfo.pickSlot}</span>
          </div>

          {/* Prediction Badge - Top2 + hover Top5 */}
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
                      ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                      : 'bg-slate-700/50 text-slate-400 border border-slate-600/30'
                  }`}
                >
                  {p.champion} {(p.probability * 100).toFixed(0)}%
                </span>
              ))}
              {predictions.length > 2 && (
                <span className="text-[9px] text-slate-500 cursor-help">+{predictions.length - 2}</span>
              )}

              {predictionExpanded && predictions.length > 2 && (
                <div className="absolute top-full right-0 mt-1 z-50 bg-slate-800 border border-slate-600 rounded-lg p-2 shadow-xl min-w-[160px]">
                  <p className="text-[9px] text-slate-500 mb-1">All predictions:</p>
                  {predictions.slice(0, 5).map((p, i) => (
                    <div key={p.champion} className="flex items-center justify-between text-[10px] py-0.5">
                      <span className={i === 0 ? 'text-green-300' : 'text-slate-300'}>{p.champion}</span>
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
            <div className="animate-spin w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full mx-auto mb-2" />
            <p className="text-slate-500 text-xs">Loading candidates...</p>
          </div>
        ) : safeCandidates.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-slate-500 text-sm">No team selected</p>
            <p className="text-slate-600 text-xs mt-1">Select your team in the wizard</p>
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

            {/* Top Recommendation */}
            {topCandidate && (
              <div>
                <h3 className="text-green-400 font-black text-xs uppercase tracking-wider mb-2">
                  TOP PICK
                </h3>
                <Divider />
                <div className="bg-slate-800/50 rounded p-3 border border-green-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-bold text-sm">{topCandidate.championName}</span>
                      {(() => {
                        const tier = getPickCandidateTier(topCandidate.pts_score, allPtsScores);
                        const display = getPickTierDisplay(tier);
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
                      className="px-3 py-1 text-[10px] font-bold uppercase bg-green-500/20 hover:bg-green-500/30 text-green-300 border border-green-500/30 rounded transition-colors"
                    >
                      Pick
                    </button>
                  </div>

                  <div className="mb-2">
                    <PickPTSBar components={topCandidate.pts_components} />
                  </div>

                  <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                    <span className="text-[9px] text-slate-500">Why:</span>
                    {topCandidate.reasons.slice(0, 3).map((r, i) => (
                      <PickReasonBadge key={i} reason={r} />
                    ))}
                  </div>

                  <div className="text-[10px] text-slate-400 space-y-0.5">
                    <ul className="ml-2 space-y-0.5">
                      {topCandidate.reasons.slice(0, 3).map((r, i) => (
                        <li key={i}>• {r.label}</li>
                      ))}
                    </ul>
                  </div>

                  <button
                    onClick={() => handleCandidateClick(topCandidate)}
                    className="mt-2 text-[9px] text-slate-500 hover:text-slate-400 underline"
                  >
                    View details →
                  </button>
                </div>
              </div>
            )}

            {/* Other Candidates */}
            {safeCandidates.length > 1 && (
              <div>
                <Divider />
                <h3 className="text-slate-400 font-bold text-xs uppercase tracking-wider mb-2">
                  OTHER OPTIONS
                </h3>
                <Divider />
                <div className="space-y-1.5">
                  {safeCandidates.slice(1, 6).map((candidate, i) => {
                    const tier = getPickCandidateTier(candidate.pts_score, allPtsScores);
                    const display = getPickTierDisplay(tier);

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
                          {candidate.reasons[0] && (
                            <PickReasonBadge reason={candidate.reasons[0]} />
                          )}
                          <span className="text-[9px] text-slate-600">
                            PTS {(candidate.pts_score * 100).toFixed(0)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleCandidateClick(candidate)}
                            className="px-1.5 py-0.5 text-[8px] text-slate-500 hover:text-slate-400"
                            title="View details"
                          >
                            👁
                          </button>
                          <button
                            onClick={() => candidate.championId && onChampionClick?.(candidate.championId)}
                            className="px-2 py-0.5 text-[9px] font-medium uppercase bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 border border-slate-600/50 rounded transition-colors"
                          >
                            Pick
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {safeCandidates.length > 6 && (
              <details className="text-xs">
                <summary className="text-slate-500 cursor-pointer hover:text-slate-400">
                  +{safeCandidates.length - 6} more options
                </summary>
                <div className="mt-2 space-y-1">
                  {safeCandidates.slice(6, 12).map((candidate) => (
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
          <div className="bg-green-500/10 rounded-lg p-2.5 border border-green-500/30">
            <div className="text-xs text-green-300 font-medium">
              Your turn — Select your champion
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">
              AI suggests based on team comfort, meta, and strategy.
            </div>
          </div>
        ) : (
          <p className="text-[10px] text-slate-500 text-center">
            Waiting for opponent...
          </p>
        )}
      </div>

      {/* Evidence Modal */}
      <AnimatePresence>
        {evidenceOpen && selectedCandidate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setEvidenceOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="bg-gray-800 px-4 py-3 flex items-center justify-between border-b border-gray-700">
                <div className="flex items-center gap-3">
                  {selectedCandidate.championImage && (
                    <img
                      src={selectedCandidate.championImage}
                      alt={selectedCandidate.championName}
                      className="w-10 h-10 rounded-lg border border-gray-600"
                    />
                  )}
                  <div>
                    <h3 className="text-white font-semibold">{selectedCandidate.championName}</h3>
                    <p className="text-xs text-gray-400">Pick Evidence</p>
                  </div>
                </div>
                <button
                  onClick={() => setEvidenceOpen(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                {selectedCandidate.reasons.map((reason, idx) => {
                  const display = PICK_REASON_LABELS[reason.type];
                  return (
                    <div key={idx} className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{display.icon}</span>
                          <span className={`text-sm font-medium px-2 py-0.5 rounded border ${display.color}`}>
                            {display.label}
                          </span>
                        </div>
                        <span className="text-lg font-bold text-slate-300">
                          {(reason.value * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-sm text-slate-300">{reason.label}</p>
                      {reason.details && (
                        <div className="pt-2 border-t border-gray-700/50 text-xs text-slate-400 space-y-0.5">
                          {reason.details.presence !== undefined && (
                            <p>• Presence: {(reason.details.presence * 100).toFixed(1)}%</p>
                          )}
                          {reason.details.pickRate !== undefined && (
                            <p>• Pick Rate: {(reason.details.pickRate * 100).toFixed(1)}%</p>
                          )}
                          {reason.details.playerName && (
                            <p>• Player: {reason.details.playerName}</p>
                          )}
                          {reason.details.gamesWeighted !== undefined && (
                            <p>• Games (weighted): {reason.details.gamesWeighted.toFixed(1)}</p>
                          )}
                          {reason.details.winRate !== undefined && (
                            <p>• Win Rate: {(reason.details.winRate * 100).toFixed(0)}%</p>
                          )}
                          {reason.details.probability !== undefined && (
                            <p>• Probability: {(reason.details.probability * 100).toFixed(0)}%</p>
                          )}
                          {reason.details.opponentPlayerName && (
                            <p>• Deny from: {reason.details.opponentPlayerName}</p>
                          )}
                          {reason.details.roles && reason.details.roles.length > 0 && (
                            <p>• Roles: {reason.details.roles.join(', ')}</p>
                          )}
                          {reason.details.synergyPartner && (
                            <p>• Synergy with: {reason.details.synergyPartner}</p>
                          )}
                          {reason.details.synergyLift !== undefined && (
                            <p>• Synergy lift: +{(reason.details.synergyLift * 100).toFixed(1)}%</p>
                          )}
                          {reason.details.synergyWinRate !== undefined && (
                            <p>• Pair win rate: {(reason.details.synergyWinRate * 100).toFixed(1)}%</p>
                          )}
                          {reason.details.synergySampleSize !== undefined && (
                            <p>• Sample size: {reason.details.synergySampleSize} games</p>
                          )}
                          {reason.details.counterTarget && (
                            <p>• Counters: {reason.details.counterTarget}</p>
                          )}
                          {reason.details.counterRole && (
                            <p>• Role: {reason.details.counterRole}</p>
                          )}
                          {reason.details.counterWinRate !== undefined && (
                            <p>• Counter win rate: {(reason.details.counterWinRate * 100).toFixed(1)}%</p>
                          )}
                          {reason.details.counterSampleSize !== undefined && (
                            <p>• Sample size: {reason.details.counterSampleSize} games</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Modal Footer */}
              <div className="bg-gray-800/50 px-4 py-2 border-t border-gray-700">
                <p className="text-[10px] text-gray-500 text-center">
                  Evidence based on team history and meta analysis.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Opponent Tendencies Drawer */}
      <OpponentTendenciesDrawer
        isOpen={showTendencies}
        onClose={() => setShowTendencies(false)}
        ourTeamId={ourTeamId}
        ourTeamName={ourTeamName || (ourSide === 'blue' ? blueTeamName : redTeamName) || ''}
        enemyTeamId={opponentTeamId}
        enemyTeamName={opponentTeamName || (ourSide === 'blue' ? redTeamName : blueTeamName) || ''}
        userSide={ourSide}
        currentPhase="pick"
      />
    </div>
  );
}
