'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Team } from '../lib/grid-types';
import PlayerList from './PlayerList';

interface TeamCardProps {
  team: Team;
  language: 'zh' | 'en';
}

export default function TeamCard({ team, language }: TeamCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = () => setIsExpanded(!isExpanded);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`
        bg-gradient-to-br from-white/5 to-white/[0.02]
        border border-white/10 rounded-xl overflow-hidden
        hover:border-white/20 transition-all duration-300
        ${isExpanded ? 'col-span-full md:col-span-2 lg:col-span-3' : ''}
      `}
      style={{
        borderColor: team.colorPrimary ? `${team.colorPrimary}40` : undefined,
      }}
    >
      {/* Team Header */}
      <div
        onClick={toggleExpand}
        className="p-4 cursor-pointer flex items-center gap-4 hover:bg-white/5 transition-colors"
      >
        {/* Team Logo */}
        <div
          className="w-14 h-14 rounded-lg overflow-hidden bg-white/10 flex items-center justify-center flex-shrink-0"
          style={{
            backgroundColor: team.colorPrimary ? `${team.colorPrimary}20` : undefined,
          }}
        >
          {team.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={team.logoUrl}
              alt={team.name}
              className="w-full h-full object-contain p-1"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <span className="text-2xl font-bold text-gray-400">
              {team.nameShortened?.charAt(0) || team.name.charAt(0)}
            </span>
          )}
        </div>

        {/* Team Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white truncate">{team.name}</h3>
          <p className="text-sm text-gray-400">
            {team.nameShortened !== team.name && (
              <span className="mr-2">{team.nameShortened}</span>
            )}
            <span>
              {team.players.length} {language === 'zh' ? '名选手' : 'players'}
            </span>
          </p>
        </div>

        {/* Expand Icon */}
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-gray-400"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </motion.div>
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-white/10">
              <PlayerList players={team.players} language={language} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
