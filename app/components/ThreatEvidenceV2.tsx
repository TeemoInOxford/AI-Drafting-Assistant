'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  Evidence,
  EvidenceType,
  EVIDENCE_TYPE_LABELS,
  EVIDENCE_TYPE_ICONS,
  EVIDENCE_TYPE_COLORS,
  formatEvidenceDetails,
} from '../lib/grid-v2-evidence-engine';

interface ThreatEvidenceV2Props {
  isOpen: boolean;
  onClose: () => void;
  championName: string;
  championImage?: string;
  teamName?: string;
  evidences: Evidence[];
  source: 'grid_v2' | 'lol_fallback';
}

/**
 * ThreatEvidenceV2 - Grid V2 Evidence Detail Panel
 *
 * Displays unified evidence from grid_v2 data:
 * - TEAM_DENIAL: Historical ban patterns
 * - PLAYER_SPECIALTY: Player pool threats
 * - META_PTS: Meta presence
 * - ROLE_FLEX_PRESSURE: Flex threats
 */
export default function ThreatEvidenceV2({
  isOpen,
  onClose,
  championName,
  championImage,
  teamName,
  evidences,
  source,
}: ThreatEvidenceV2Props) {
  if (!isOpen) return null;

  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

  const renderEvidenceCard = (evidence: Evidence, index: number) => {
    const detailLines = formatEvidenceDetails(evidence);
    const colorClass = EVIDENCE_TYPE_COLORS[evidence.type];
    const icon = EVIDENCE_TYPE_ICONS[evidence.type];
    const label = EVIDENCE_TYPE_LABELS[evidence.type];

    return (
      <motion.div
        key={evidence.type}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1 }}
        className="bg-gray-800/50 rounded-lg p-3 space-y-2"
      >
        {/* Evidence Type Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-lg`}>{icon}</span>
            <span className={`text-sm font-medium px-2 py-0.5 rounded border ${colorClass}`}>
              {label}
            </span>
          </div>
          <span className={`text-lg font-bold ${
            evidence.score >= 0.7 ? 'text-red-400' :
            evidence.score >= 0.4 ? 'text-orange-400' : 'text-slate-300'
          }`}>
            {(evidence.score * 100).toFixed(0)}
          </span>
        </div>

        {/* Summary */}
        <p className="text-sm text-slate-300">{evidence.summary}</p>

        {/* Components (if available) */}
        {evidence.components && Object.keys(evidence.components).length > 0 && (
          <div className="pt-2 border-t border-gray-700/50">
            <p className="text-[10px] text-slate-500 mb-1">Score Components:</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(evidence.components).map(([key, value]) => (
                <span key={key} className="text-[10px] px-1.5 py-0.5 bg-slate-700/50 rounded text-slate-400">
                  {key}: {formatPercent(value)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Detail Lines */}
        {detailLines.length > 0 && (
          <div className="pt-2 border-t border-gray-700/50">
            <ul className="space-y-0.5">
              {detailLines.map((line, i) => (
                <li key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                  {line.startsWith('  ') ? (
                    <span className="ml-3">{line.trim()}</span>
                  ) : line.startsWith('⚠️') ? (
                    <span className="text-yellow-400">{line}</span>
                  ) : (
                    <>
                      <span className="text-slate-500 mt-0.5">•</span>
                      {line}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Score Bar */}
        <div className="pt-2">
          <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                evidence.score >= 0.7 ? 'bg-red-500' :
                evidence.score >= 0.4 ? 'bg-orange-500' : 'bg-slate-500'
              }`}
              style={{ width: `${Math.min(100, evidence.score * 100)}%` }}
            />
          </div>
        </div>
      </motion.div>
    );
  };

  // Separate evidences by type for organized display
  const teamDenialEvidence = evidences.find(e => e.type === 'TEAM_DENIAL');
  const playerSpecEvidence = evidences.find(e => e.type === 'PLAYER_SPECIALTY');
  const otherEvidences = evidences.filter(e =>
    e.type !== 'TEAM_DENIAL' && e.type !== 'PLAYER_SPECIALTY'
  );

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
          className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col"
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
                <div className="flex items-center gap-2">
                  <p className="text-xs text-gray-400">Evidence Attribution</p>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                    source === 'grid_v2'
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                  }`}>
                    {source === 'grid_v2' ? 'grid_v2' : 'fallback'}
                  </span>
                </div>
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

          {/* Content - Scrollable */}
          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            {/* Team Denial Section */}
            {teamDenialEvidence && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <h4 className="text-sm font-medium text-white">
                    Team Denial {teamName && <span className="text-gray-400">vs {teamName}</span>}
                  </h4>
                </div>
                {renderEvidenceCard(teamDenialEvidence, 0)}
              </div>
            )}

            {/* Player Specialty Section */}
            {playerSpecEvidence && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-500" />
                  <h4 className="text-sm font-medium text-white">
                    Player Pool
                    <span className="text-gray-500 font-normal text-xs ml-1">
                      ({playerSpecEvidence.details.players_count} players)
                    </span>
                  </h4>
                </div>
                {renderEvidenceCard(playerSpecEvidence, 1)}
              </div>
            )}

            {/* Other Evidence Types */}
            {otherEvidences.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-slate-500" />
                  <h4 className="text-sm font-medium text-white">Other Evidence</h4>
                </div>
                {otherEvidences.map((e, i) => renderEvidenceCard(e, i + 2))}
              </div>
            )}

            {/* No data message */}
            {evidences.length === 0 && (
              <div className="text-center py-6 text-gray-400">
                <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm">No evidence data available for this champion</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-800/50 px-4 py-2 border-t border-gray-700">
            <p className="text-[10px] text-gray-500 text-center">
              Evidence based on historical patterns. Higher scores indicate stronger signals.
              This is informational data, not a recommendation.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
