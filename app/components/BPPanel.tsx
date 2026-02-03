'use client';

import { motion } from 'framer-motion';
import { BPState, BPStep, Champion } from '../lib/types';

interface BPPanelProps {
  bpState: BPState;
  currentStep: BPStep | null;
  blueTeamPlayers?: (string | null)[];
  redTeamPlayers?: (string | null)[];
  fearlessBannedChampions?: Set<string>;
  champions?: Champion[];
  blueTeamName?: string;
  redTeamName?: string;
  blueTeamLogo?: string | null;
  redTeamLogo?: string | null;
}

export default function BPPanel({
  bpState,
  currentStep,
  blueTeamPlayers,
  redTeamPlayers,
  fearlessBannedChampions = new Set(),
  champions = [],
  blueTeamName = 'Blue Team',
  redTeamName = 'Red Team',
  blueTeamLogo = null,
  redTeamLogo = null
}: BPPanelProps) {
  const isBlueActive = currentStep?.team === 'blue';
  const isRedActive = currentStep?.team === 'red';

  const renderPick = (champion: Champion | null, index: number, team: 'blue' | 'red') => {
    const isActive = currentStep?.team === team && currentStep?.action === 'pick' && currentStep?.index === index;
    const isBlue = team === 'blue';
    const label = isBlue ? `B${index + 1}` : `R${index + 1}`;
    const isLast = index === 4;

    return (
      <motion.div
        key={`${team}-pick-${index}`}
        className={`relative h-56 overflow-hidden flex-shrink ${
          !isLast
            ? isActive
              ? isBlue
                ? 'border-r border-blue-400'
                : 'border-r border-red-400'
              : 'border-r border-white/20'
            : ''
        } ${
          isActive
            ? isBlue
              ? 'shadow-[0_0_20px_rgba(59,130,246,0.6)]'
              : 'shadow-[0_0_20px_rgba(239,68,68,0.6)]'
            : ''
        } ${champion ? '' : 'bg-slate-800/50'}`}
        style={{
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 90%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 90%, transparent 100%)'
        }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{
          opacity: 1,
          scale: 1,
          width: isActive ? 140 : 120,
          flexShrink: isActive ? 0 : 1
        }}
        transition={{
          delay: index * 0.05,
          width: { duration: 0.3, ease: "easeInOut" },
          flexShrink: { duration: 0.3, ease: "easeInOut" }
        }}
      >
        {/* Position Label */}
        <div className="absolute top-1 left-1 z-10 px-1.5 py-0.5 text-white text-xs font-bold">
          [{label}]
        </div>

        {champion ? (
          <>
            <img
              src={`https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${champion.id}_0.jpg`}
              alt={champion.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-center text-xs py-1 font-medium">
              {champion.name}
            </div>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm font-mono">
            {index + 1}
          </div>
        )}
      </motion.div>
    );
  };

  const renderBan = (banEntry: { champion: Champion | null; reason?: string }, index: number, team: 'blue' | 'red') => {
    const champion = banEntry.champion;
    const isActive = currentStep?.team === team && currentStep?.action === 'ban' && currentStep?.index === index;
    const isBlue = team === 'blue';

    return (
      <motion.div
        key={`ban-${team}-${index}`}
        className={`relative w-10 h-10 rounded border overflow-hidden bg-slate-800/50 ${
          isActive
            ? isBlue
              ? 'border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.8)]'
              : 'border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.8)]'
            : isBlue
              ? 'border-blue-500/50'
              : 'border-red-500/50'
        }`}
        animate={{
          scale: isActive ? [1, 1.1, 1] : 1,
          opacity: isActive ? [1, 0.7, 1] : 1
        }}
        transition={{
          duration: 0.6,
          repeat: isActive ? Infinity : 0,
          ease: "easeInOut"
        }}
      >
        {champion ? (
          <>
            <img
              src={champion.image}
              alt={champion.name}
              className="w-full h-full object-cover grayscale opacity-50"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className={`w-full h-0.5 rotate-45 absolute ${isBlue ? 'bg-blue-500' : 'bg-red-500'}`}></div>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs">
            {index + 1}
          </div>
        )}
      </motion.div>
    );
  };

  const fearlessChampions = champions.filter(c => fearlessBannedChampions.has(c.id));

  return (
    <div className="w-full px-4 mb-6 mt-8">
      <div className={`relative w-full backdrop-blur-sm p-6 ${
        isBlueActive
          ? 'shadow-[0_0_30px_rgba(59,130,246,0.3)] bg-blue-950/10'
          : isRedActive
            ? 'shadow-[0_0_30px_rgba(239,68,68,0.3)] bg-red-950/10'
            : 'bg-slate-900/20'
      }`}>
        <div className="flex items-start justify-center gap-8">
          {/* Blue Team Section */}
          <div className="flex flex-col items-start gap-4">
            {/* Blue Bans */}
            <div className="flex gap-1 justify-start w-full">
              {bpState.blueBans.map((ban, idx) => renderBan(ban, idx, 'blue'))}
            </div>
            {/* Blue Picks */}
            <div className="flex gap-0">
              {bpState.bluePicks.map((pick, idx) => renderPick(pick, idx, 'blue'))}
            </div>
          </div>

          {/* Center Section */}
          <div className="flex flex-col items-center justify-start relative" style={{ minWidth: '200px' }}>
            {/* Fearless Champions - Positioned between bans, doesn't affect layout */}
            {fearlessChampions.length > 0 && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex items-center justify-center" style={{ width: '800px' }}>
                <div className="grid grid-cols-20 gap-1.5">
                  {fearlessChampions.map((champ) => (
                    <div
                      key={champ.id}
                      className="w-8 h-8 rounded border border-amber-500/30 overflow-hidden"
                      title={champ.name}
                    >
                      <img
                        src={champ.image}
                        alt={champ.name}
                        className="w-full h-full object-cover opacity-40"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Spacer to align with center of picks */}
            <div style={{ height: '120px' }} />

            {/* Team Icons and Names with Triangle - center aligned with picks */}
            <div className="flex items-center gap-6">
              <div className="flex flex-col items-center gap-2">
                {blueTeamLogo ? (
                  <img src={blueTeamLogo} alt={blueTeamName} className="w-16 h-16 object-contain" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-blue-500/20 border-2 border-blue-500/50 flex items-center justify-center overflow-hidden">
                    <span className="text-blue-300 font-bold text-xs text-center px-1">{blueTeamName}</span>
                  </div>
                )}
                <span className="text-blue-300 text-xs font-medium">{blueTeamName}</span>
              </div>

              {/* Triangle pointing to active team - between logos */}
              <div className={`transition-transform duration-300 ${isRedActive ? 'rotate-0' : 'rotate-180'}`}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12 L19 5 L19 19 Z" fill="currentColor" className="text-slate-400" />
                </svg>
              </div>

              <div className="flex flex-col items-center gap-2">
                {redTeamLogo ? (
                  <img src={redTeamLogo} alt={redTeamName} className="w-16 h-16 object-contain" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500/50 flex items-center justify-center overflow-hidden">
                    <span className="text-red-300 font-bold text-xs text-center px-1">{redTeamName}</span>
                  </div>
                )}
                <span className="text-red-300 text-xs font-medium">{redTeamName}</span>
              </div>
            </div>
          </div>

          {/* Red Team Section */}
          <div className="flex flex-col items-end gap-4">
            {/* Red Bans */}
            <div className="flex gap-1 justify-end w-full">
              {bpState.redBans.map((ban, idx) => renderBan(ban, idx, 'red'))}
            </div>
            {/* Red Picks */}
            <div className="flex gap-0">
              {bpState.redPicks.map((pick, idx) => renderPick(pick, idx, 'red'))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
