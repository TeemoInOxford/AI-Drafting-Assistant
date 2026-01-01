'use client';

import { motion } from 'framer-motion';
import { Champion, Language } from '../lib/types';
import ChampionCard from './ChampionCard';

interface ChampionGridProps {
  champions: Champion[];
  usedChampions: Set<string>;
  onSelect: (champion: Champion) => void;
  disabled: boolean;
  language: Language;
}

export default function ChampionGrid({
  champions,
  usedChampions,
  onSelect,
  disabled,
  language,
}: ChampionGridProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 pb-8">
      <motion.div
        className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-14 gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {champions.map((champion, index) => (
          <ChampionCard
            key={champion.id}
            champion={champion}
            isUsed={usedChampions.has(champion.id)}
            onClick={() => onSelect(champion)}
            disabled={disabled || usedChampions.has(champion.id)}
            index={index}
            language={language}
          />
        ))}
      </motion.div>
    </div>
  );
}
