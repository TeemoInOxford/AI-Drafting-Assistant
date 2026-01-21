'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { PTSResult, Champion, Position } from '../lib/types';

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
  champions?: Champion[];
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
  champions = [],
}: PTSRiskBoardProps) {
  const isBanPhase = currentTurn.toLowerCase().includes('ban');
  const topPick = ptsResults[0];

  const critical = ptsResults.filter(r => r.riskTier === 'critical').slice(0, 2);
  const high = ptsResults.filter(r => r.riskTier === 'high').slice(0, 2);
  const safe = ptsResults.filter(r => r.riskTier === 'moderate' || r.riskTier === 'low').slice(0, 2);

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
    const roleText = formatRoleDistribution(result.roleDistribution);

    return (
      <motion.div
        key={result.championId}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.08 }}
        onClick={() => onChampionClick?.(result.championId)}
        className="flex items-center justify-between py-1.5 px-2 hover:bg-slate-800/50 rounded cursor-pointer transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-white font-medium text-sm">{result.championName}</span>
          {result.isFlex && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
              FLEX
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-cyan-400 font-bold text-sm">PTS {Math.round(result.pts)}</span>
          <span className="text-slate-400 text-xs">
            {isBanPhase ? `Win Impact: −${(result.pts * 0.07).toFixed(1)}%` : `Win Rate: ${(52 + result.pts * 0.08).toFixed(1)}%`}
          </span>
        </div>
      </motion.div>
    );
  };

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
                Opponent has no picks revealed.<br />
                Early denial phase — remove high-leverage openers.
              </p>
            </div>

            {/* Critical */}
            {critical.length > 0 && (
              <div>
                <Divider />
                <h3 className="text-red-400 font-black text-xs uppercase tracking-wider mb-2">
                  CRITICAL — MUST BAN NOW
                </h3>
                <Divider />
                <div className="space-y-1">
                  {critical.map((r, i) => renderChampionRow(r, i))}
                </div>
              </div>
            )}

            {/* High Risk */}
            {high.length > 0 && (
              <div>
                <Divider />
                <h3 className="text-orange-400 font-bold text-xs uppercase tracking-wider mb-2">
                  HIGH RISK
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

            {/* Recommended Ban */}
            {topPick && (
              <div>
                <Divider />
                <h3 className="text-cyan-300 font-bold text-xs uppercase tracking-wider mb-2">
                  Recommended Ban
                </h3>
                <Divider />
                <div className="bg-slate-800/50 rounded p-3 space-y-2">
                  <div className="text-white font-bold text-base">{topPick.championName}</div>

                  <div>
                    <p className="text-slate-300 text-xs font-semibold mb-1">If banned:</p>
                    <ul className="text-slate-400 text-xs space-y-0.5 ml-3">
                      {topPick.isFlex ? (
                        <>
                          <li>• Removes multi-role threat</li>
                          <li>• Forces opponent into predictable picks</li>
                          <li>• Reduces draft ambiguity pressure</li>
                        </>
                      ) : (
                        <>
                          <li>• Removes safest blind pick</li>
                          <li>• Forces earlier role reveal</li>
                          <li>• Reduces opponent win chance ~{(topPick.pts * 0.07).toFixed(0)}%</li>
                        </>
                      )}
                    </ul>
                  </div>

                  <div>
                    <p className="text-slate-300 text-xs font-semibold mb-1">If ignored:</p>
                    <ul className="text-slate-400 text-xs space-y-0.5 ml-3">
                      {topPick.isFlex ? (
                        <>
                          <li>• Opponent retains role ambiguity</li>
                          <li>• Delays opponent role commitment</li>
                          <li>• Forces blind response under incomplete information</li>
                        </>
                      ) : (
                        <>
                          <li>• Likely first-picked</li>
                          <li>• Draft tempo shifts to opponent</li>
                        </>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Draft State */}
            <div>
              <h3 className="text-slate-300 font-bold text-xs uppercase tracking-wider mb-2">Draft State</h3>
              <Divider />
              <div className="space-y-2 text-xs">
                <div>
                  <p className="text-slate-400 font-semibold">Enemy Picks:</p>
                  <p className="text-slate-300">{formatDraftPicks(ourSide === 'blue' ? redPicks : bluePicks)}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-semibold">Our Picks:</p>
                  <p className="text-slate-300">{formatDraftPicks(ourSide === 'blue' ? bluePicks : redPicks)}</p>
                </div>
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
                  <div className="text-white font-bold text-base">{topPick.championName}</div>

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
    </div>
  );
}
