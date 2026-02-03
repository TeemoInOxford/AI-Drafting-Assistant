'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import InfoIconPortal from './InfoIconPortal';

interface BanPredictionData {
  champion: string;
  probability: number;
  base_rate: number;
  response_boost: number | null;
  low_confidence: boolean;
}

interface DraftBanContext {
  isBanPhase: boolean;
  banningTeamId: string | null;
  banningTeamName: string;
  banningSide: 'blue' | 'red';
  banSlot: 1 | 2 | 3;
  opponentLastBan: string | null;
  alreadyBanned: string[];
}

interface NextBanPredictionBadgeProps {
  context: DraftBanContext | null;
  userSide: 'blue' | 'red';
}

/**
 * Compact ban prediction badge to show near the current action
 * Shows top 3 predictions for the team currently banning
 */
export default function NextBanPredictionBadge({
  context,
  userSide,
}: NextBanPredictionBadgeProps) {
  const [predictions, setPredictions] = useState<BanPredictionData[]>([]);
  const [loading, setLoading] = useState(false);
  const [sampleSize, setSampleSize] = useState(0);
  const [lowConfidence, setLowConfidence] = useState(false);

  // Stable dependency
  const alreadyBannedKey = context?.alreadyBanned?.join(',') || '';
  const teamId = context?.banningTeamId;
  const side = context?.banningSide;
  const banSlot = context?.banSlot;
  const opponentLastBan = context?.opponentLastBan;

  useEffect(() => {
    if (!context?.isBanPhase || !teamId) {
      setPredictions([]);
      return;
    }

    async function fetchPrediction() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          team_id: teamId!,
          side: side!,
          ban_slot: banSlot!.toString(),
        });
        if (opponentLastBan) {
          params.set('opponent_last_ban', opponentLastBan);
        }
        if (alreadyBannedKey) {
          params.set('already_banned', alreadyBannedKey);
        }

        const res = await fetch(`/api/ban-prediction?${params.toString()}`);
        const data = await res.json();

        if (data.success && data.data) {
          setPredictions(data.data.predictions || []);
          setSampleSize(data.data.sample_size || 0);
          setLowConfidence(data.data.low_confidence || false);
        } else {
          setPredictions([]);
        }
      } catch (err) {
        console.error('Failed to fetch ban prediction:', err);
        setPredictions([]);
      } finally {
        setLoading(false);
      }
    }

    fetchPrediction();
  }, [teamId, side, banSlot, opponentLastBan, alreadyBannedKey, context?.isBanPhase]);

  // Don't render if not in ban phase
  if (!context?.isBanPhase || !teamId) {
    return null;
  }

  const isOurTeam = context.banningSide === userSide;
  const borderColor = isOurTeam ? 'border-cyan-500/40' : 'border-rose-500/40';
  const bgColor = isOurTeam ? 'bg-cyan-500/10' : 'bg-rose-500/10';
  const labelColor = isOurTeam ? 'text-cyan-400' : 'text-rose-400';
  const glowColor = isOurTeam ? 'shadow-cyan-500/20' : 'shadow-rose-500/20';

  const top3 = predictions.slice(0, 3);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={`rounded-lg border ${borderColor} ${bgColor} backdrop-blur-sm shadow-lg ${glowColor} overflow-visible`}
      >
        {/* Header */}
        <div className="px-3 py-1.5 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase text-amber-400">
              Prediction
            </span>
            <span className={`text-[10px] font-bold ${labelColor}`}>
              {context.banningTeamName}
            </span>
            <span className="text-[9px] text-slate-500">
              B{context.banSlot}
            </span>
            <InfoIconPortal
              tooltip="PREDICTION, NOT RECOMMENDATION"
              detail={`Historical ban probability distribution.\n\nAlgorithm:\n• Base rate from slot-specific patterns\n• Response boost when opponent just banned\n• Normalized to sum=1\n\nThis predicts what the team is LIKELY to ban.`}
            />
          </div>
          <div className="flex items-center gap-1">
            {lowConfidence && (
              <span className="text-[8px] text-amber-400 font-bold px-1 py-0.5 rounded bg-amber-500/10">
                LOW
              </span>
            )}
            <span className="text-[8px] text-slate-500 font-mono">
              n={sampleSize}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="px-3 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-1">
              <div className="w-3 h-3 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
            </div>
          ) : predictions.length === 0 ? (
            <div className="text-[10px] text-slate-500 text-center">
              No data
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {top3.map((pred, idx) => (
                <div
                  key={pred.champion}
                  className="flex items-center gap-1"
                >
                  <span className={`text-[11px] font-medium ${
                    idx === 0 ? 'text-amber-300' : 'text-slate-300'
                  }`}>
                    {pred.champion}
                  </span>
                  {pred.response_boost !== null && (
                    <span className="text-[7px] text-emerald-400">+R</span>
                  )}
                  <span className={`text-[10px] font-mono ${
                    idx === 0 ? 'text-amber-400 font-bold' : 'text-slate-500'
                  }`}>
                    {(pred.probability * 100).toFixed(0)}%
                  </span>
                  {idx < 2 && top3[idx + 1] && (
                    <span className="text-slate-600 mx-1">|</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
