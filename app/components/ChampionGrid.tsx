'use client';

import { motion } from 'framer-motion';
import { Champion, HistorySelectMode } from '../lib/types';
import ChampionCard from './ChampionCard';

interface ChampionGridProps {
  champions: Champion[];
  usedChampions: Set<string>;
  onSelect: (champion: Champion) => void;
  disabled: boolean;
  fearlessPool?: Set<string>;
  historySelectMode?: HistorySelectMode;
  shakeChampionId?: string | null;
}

export default function ChampionGrid({
  champions,
  usedChampions,
  onSelect,
  disabled,
  fearlessPool,
  historySelectMode = 'off',
  shakeChampionId,
}: ChampionGridProps) {
  return (
    <div className="w-full pb-8 flex justify-center">
      <motion.div
        className="flex flex-wrap justify-center gap-2"
        style={{ width: '100%' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {champions.map((champion, index) => {
          const isUsed = usedChampions.has(champion.id);
          const isFearlessBanned = fearlessPool?.has(champion.id) || false;
          const isDisabled = historySelectMode !== 'off'
            ? isFearlessBanned
            : (disabled || isUsed);
          const shouldShake = shakeChampionId === champion.id;

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
            />
          );
        })}
      </motion.div>
    </div>
  );
}
