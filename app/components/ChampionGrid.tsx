'use client';

import { motion } from 'framer-motion';
import { Champion, HistorySelectMode } from '../lib/types';
import { ThreatLevel } from '../lib/threat-types';
import ChampionCard from './ChampionCard';

interface ChampionGridProps {
  champions: Champion[];
  usedChampions: Set<string>;
  onSelect: (champion: Champion) => void;
  disabled: boolean;
  fearlessPool?: Set<string>;
  historySelectMode?: HistorySelectMode;
  shakeChampionId?: string | null;
  threatData?: Map<string, { level: ThreatLevel; score: number }>;
  /** Unified disabled IDs set (includes used + fearless) */
  disabledIds?: Set<string>;
}

export default function ChampionGrid({
  champions,
  usedChampions,
  onSelect,
  disabled,
  fearlessPool,
  historySelectMode = 'off',
  shakeChampionId,
  threatData,
  disabledIds,
}: ChampionGridProps) {
  return (
    <div className="w-full pb-8 flex justify-center px-4">
      <motion.div
        className="flex flex-wrap justify-center gap-7 sm:gap-9"
        style={{ maxWidth: '1464px' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {champions.map((champion, index) => {
          const isUsed = usedChampions.has(champion.id);
          const isFearlessBanned = fearlessPool?.has(champion.id) || false;

          // Use unified disabledIds if provided, otherwise fall back to old logic
          const isDisabled = historySelectMode !== 'off'
            ? isFearlessBanned
            : disabledIds
              ? disabledIds.has(champion.id) || disabled
              : disabled || isUsed || isFearlessBanned;

          const shouldShake = shakeChampionId === champion.id;
          const threat = threatData?.get(champion.name);

          return (
            <ChampionCard
              key={champion.id}
              champion={champion}
              isUsed={isUsed}
              isFearlessBanned={isFearlessBanned && !isUsed}
              onClick={() => onSelect(champion)}
              disabled={isDisabled}
              index={index}
              historySelectMode={historySelectMode}
              shouldShake={shouldShake}
              threatLevel={threat?.level}
              threatScore={threat?.score}
            />
          );
        })}
      </motion.div>
    </div>
  );
}
