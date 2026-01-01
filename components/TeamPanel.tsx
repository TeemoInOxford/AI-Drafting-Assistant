'use client';

import { motion } from 'framer-motion';
import { Team, ActionType, Champion, Language } from '../lib/types';

interface TeamPanelProps {
  team: Team;
  bans: (Champion | null)[];
  picks: (Champion | null)[];
  isActive: boolean;
  currentAction: ActionType | null;
  currentIndex: number | null;
  language: Language;
}

export default function TeamPanel({
  team,
  bans,
  picks,
  isActive,
  currentAction,
  currentIndex,
  language,
}: TeamPanelProps) {
  const teamName = language === 'zh'
    ? (team === 'blue' ? '蓝方' : '红方')
    : (team === 'blue' ? 'Blue Side' : 'Red Side');

  const renderSlot = (
    champion: Champion | null,
    index: number,
    action: ActionType,
    isCurrentSlot: boolean
  ) => {
    const isBan = action === 'ban';

    return (
      <motion.div
        key={`${action}-${index}`}
        className={`
          relative w-12 h-12 md:w-14 md:h-14 rounded-lg overflow-hidden
          ${isBan ? 'border-2 border-red-500/50' : 'border-2 border-green-500/50'}
          ${isCurrentSlot ? 'ring-2 ring-yellow-400 animate-pulse' : ''}
          ${champion ? '' : 'bg-white/10'}
        `}
        whileHover={{ scale: 1.05 }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: index * 0.05 }}
      >
        {champion ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={champion.image}
              alt={champion.name}
              className={`w-full h-full object-cover ${isBan ? 'grayscale opacity-50' : ''}`}
            />
            {isBan && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-full h-0.5 bg-red-500 rotate-45 absolute"></div>
              </div>
            )}
            {/* 英雄名称提示 */}
            <div className="absolute inset-x-0 bottom-0 bg-black/70 text-[8px] text-center text-white truncate px-0.5">
              {language === 'zh' ? champion.zhName : champion.enName}
            </div>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">
            {index + 1}
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <motion.div
      className={`
        p-4 rounded-xl backdrop-blur-sm
        ${team === 'blue'
          ? 'bg-blue-500/10 border border-blue-500/30'
          : 'bg-red-500/10 border border-red-500/30'}
        ${isActive ? 'ring-2 ring-yellow-400/50' : ''}
      `}
      initial={{ opacity: 0, x: team === 'blue' ? -20 : 20 }}
      animate={{ opacity: 1, x: 0 }}
    >
      {/* 队伍名称 */}
      <h3 className={`text-lg font-bold mb-3 ${team === 'blue' ? 'text-blue-400' : 'text-red-400'}`}>
        {teamName}
        {isActive && (
          <span className="ml-2 text-yellow-400 text-sm animate-pulse">
            {language === 'zh' ? '(当前)' : '(Active)'}
          </span>
        )}
      </h3>

      {/* Ban区域 */}
      <div className="mb-4">
        <p className="text-xs text-gray-400 mb-2">
          {language === 'zh' ? '禁用 (Bans)' : 'Bans'}
        </p>
        <div className="flex gap-2 flex-wrap">
          {bans.map((champ, idx) =>
            renderSlot(
              champ,
              idx,
              'ban',
              isActive && currentAction === 'ban' && currentIndex === idx
            )
          )}
        </div>
      </div>

      {/* Pick区域 */}
      <div>
        <p className="text-xs text-gray-400 mb-2">
          {language === 'zh' ? '选择 (Picks)' : 'Picks'}
        </p>
        <div className="flex gap-2 flex-wrap">
          {picks.map((champ, idx) =>
            renderSlot(
              champ,
              idx,
              'pick',
              isActive && currentAction === 'pick' && currentIndex === idx
            )
          )}
        </div>
      </div>
    </motion.div>
  );
}
