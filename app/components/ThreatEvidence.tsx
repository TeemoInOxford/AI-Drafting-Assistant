'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ThreatSignal, ThreatLevel } from '../lib/threat-types';

interface ThreatEvidenceProps {
  isOpen: boolean;
  onClose: () => void;
  championName: string;
  championImage?: string;
  teamThreat: ThreatSignal | null;
  teamName?: string;
  playerThreats: Array<{
    playerId: string;
    playerName: string;
    signal: ThreatSignal;
  }>;
}

/**
 * ThreatEvidence - 威胁证据详情面板
 *
 * 显示:
 * - 队伍级别: obs vs exp, ratio, confidence, notes
 * - 选手级别: top 1-2 players with highest scores
 */
export default function ThreatEvidence({
  isOpen,
  onClose,
  championName,
  championImage,
  teamThreat,
  teamName,
  playerThreats,
}: ThreatEvidenceProps) {
  if (!isOpen) return null;

  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;
  const formatRatio = (value: number) => value.toFixed(2);

  const generateNotes = (signal: ThreatSignal): string[] => {
    const notes: string[] = [];

    // Sample size context
    notes.push(`Sample: ${signal.banCount} bans in ${signal.gamesPlayed} games faced`);

    if (signal.ratio > 2) {
      notes.push(`Ban rate ${(signal.ratio).toFixed(1)}x above baseline`);
    } else if (signal.ratio > 1.5) {
      notes.push(`Ban rate ${(signal.ratio).toFixed(1)}x above baseline`);
    } else if (signal.ratio > 1) {
      notes.push(`Ban rate slightly above baseline`);
    }

    if (signal.confidence < 0.5) {
      notes.push('Low sample size — interpret with caution');
    }

    // Avoid recommendation language - just describe the signal
    if (signal.score >= 70) {
      notes.push('High historical denial frequency');
    } else if (signal.score >= 40) {
      notes.push('Moderate historical denial frequency');
    } else {
      notes.push('Low historical denial frequency');
    }

    return notes;
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gray-800 px-4 py-3 flex items-center justify-between border-b border-gray-700">
            <div className="flex items-center gap-3">
              {championImage && (
                <img
                  src={championImage}
                  alt={championName}
                  className="w-10 h-10 rounded-lg border border-gray-600"
                />
              )}
              <div>
                <h3 className="text-white font-semibold">{championName}</h3>
                <p className="text-xs text-gray-400">Historical Denial Signal (Team-Level)</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Team Threat Section */}
            {teamThreat && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <h4 className="text-sm font-medium text-white">
                    Team Level {teamName && <span className="text-gray-400">({teamName})</span>}
                  </h4>
                </div>

                <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                  {/* Sample info */}
                  <div className="text-xs text-gray-400 mb-2">
                    <span className="text-white font-medium">{teamThreat.banCount}/{teamThreat.gamesPlayed}</span>
                    <span className="ml-1">bans in games faced</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-400">Observed (x/n):</span>
                      <span className="text-white ml-2 font-medium">{formatPercent(teamThreat.observed)}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Conservative (80% CI):</span>
                      <span className="text-cyan-400 ml-2 font-medium">{formatPercent(teamThreat.obsLower)}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Expected (Baseline):</span>
                      <span className="text-white ml-2 font-medium">{formatPercent(teamThreat.expected)}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Confidence:</span>
                      <span className={`ml-2 font-medium ${teamThreat.confidence < 0.5 ? 'text-yellow-400' : 'text-white'}`}>
                        {formatPercent(teamThreat.confidence)}
                      </span>
                    </div>
                  </div>

                  {/* Beta prior info (collapsible detail) */}
                  <div className="text-[10px] text-gray-500 pt-1 border-t border-gray-700/50">
                    Prior: Beta({teamThreat.a0.toFixed(2)}, {teamThreat.b0.toFixed(2)}) | m={teamThreat.priorStrengthM}
                  </div>

                  <div className="pt-2 border-t border-gray-700">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 text-xs">Threat Score:</span>
                      <span className={`text-lg font-bold ${
                        teamThreat.score >= 70 ? 'text-red-400' :
                        teamThreat.score >= 40 ? 'text-orange-400' : 'text-gray-400'
                      }`}>
                        {teamThreat.score.toFixed(0)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          teamThreat.score >= 70 ? 'bg-red-500' :
                          teamThreat.score >= 40 ? 'bg-orange-500' : 'bg-gray-500'
                        }`}
                        style={{ width: `${Math.min(100, teamThreat.score)}%` }}
                      />
                    </div>
                  </div>

                  {/* Notes */}
                  {generateNotes(teamThreat).length > 0 && (
                    <div className="pt-2 border-t border-gray-700">
                      <ul className="space-y-1">
                        {generateNotes(teamThreat).map((note, i) => (
                          <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                            <span className="text-gray-500 mt-0.5">•</span>
                            {note}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Player Threats Section */}
            {playerThreats.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-500" />
                  <h4 className="text-sm font-medium text-white">
                    Player Level
                    <span className="text-gray-500 font-normal text-xs ml-1">(players who play this champion)</span>
                  </h4>
                </div>

                <div className="space-y-2">
                  {playerThreats.map(({ playerId, playerName, signal }) => (
                    <div key={playerId} className="bg-gray-800/50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-white">{playerName}</span>
                        <span className={`text-sm font-bold ${
                          signal.score >= 70 ? 'text-red-400' :
                          signal.score >= 40 ? 'text-orange-400' : 'text-gray-400'
                        }`}>
                          {signal.score.toFixed(0)}
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-500 mb-1">
                        {signal.banCount}/{signal.gamesPlayed} bans
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs text-gray-400">
                        <div>
                          <span>Obs: </span>
                          <span className="text-white">{formatPercent(signal.observed)}</span>
                        </div>
                        <div>
                          <span>Lower: </span>
                          <span className="text-cyan-400">{formatPercent(signal.obsLower)}</span>
                        </div>
                        <div>
                          <span>Exp: </span>
                          <span className="text-white">{formatPercent(signal.expected)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No data message */}
            {!teamThreat && playerThreats.length === 0 && (
              <div className="text-center py-6 text-gray-400">
                <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm">No threat data available for this champion</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-800/50 px-4 py-2 border-t border-gray-700">
            <p className="text-[10px] text-gray-500 text-center">
              Based on historical ban patterns against this team. Higher scores indicate more frequent denial.
              This is informational data, not a recommendation.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
