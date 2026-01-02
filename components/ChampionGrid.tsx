'use client';

import { motion } from 'framer-motion';
import { Champion, Language, HistorySelectMode } from '../lib/types';
import ChampionCard from './ChampionCard';

interface ChampionGridProps {
  champions: Champion[];
  usedChampions: Set<string>;
  onSelect: (champion: Champion) => void;
  disabled: boolean;
  language: Language;
  fearlessPool?: Set<string>;
  historySelectMode?: HistorySelectMode;
}

export default function ChampionGrid({
  champions,
  usedChampions,
  onSelect,
  disabled,
  language,
  fearlessPool,
  historySelectMode = 'off',
}: ChampionGridProps) {
  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 pb-8">
      <motion.div
        className="grid grid-cols-5 xs:grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-14 gap-1.5 sm:gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {champions.map((champion, index) => {
          const isUsed = usedChampions.has(champion.id);
          const isFearlessBanned = fearlessPool?.has(champion.id) || false;
          // 在历史选择模式下，只有fearlessPool中的英雄才禁用
          const isDisabled = historySelectMode !== 'off'
            ? isFearlessBanned
            : (disabled || isUsed);

          return (
            <ChampionCard
              key={champion.id}
              champion={champion}
              isUsed={isUsed}
              isFearlessBanned={isFearlessBanned && !isUsed}
              onClick={() => onSelect(champion)}
              disabled={isDisabled}
              index={index}
              language={language}
              historySelectMode={historySelectMode}
            />
          );
        })}
      </motion.div>
    </div>
  );
}
