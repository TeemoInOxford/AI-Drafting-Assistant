'use client';

import { BPState, BPStep, Champion, ProPlayer } from '../lib/types';

interface BPPanelProps {
  bpState: BPState;
  currentStep: BPStep | null;
  blueTeamPlayers?: (ProPlayer | null)[];
  redTeamPlayers?: (ProPlayer | null)[];
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

  const fearlessChampions = champions.filter(c => fearlessBannedChampions.has(c.id));

  return (
    <div className="w-full mb-6 mt-8">
      <div className={`relative w-full backdrop-blur-sm p-3 sm:p-4 lg:p-6 rounded-lg overflow-hidden ${
        isBlueActive
          ? 'shadow-[0_0_30px_rgba(59,130,246,0.3)] bg-blue-950/10'
          : isRedActive
            ? 'shadow-[0_0_30px_rgba(239,68,68,0.3)] bg-red-950/10'
            : 'bg-slate-900/20'
      }`}>
        <div className="flex items-start justify-center gap-1 sm:gap-2 lg:gap-4 overflow-x-auto scrollbar-thin">
          {/* Blue Team Section */}
          <div className="flex flex-col items-start gap-3 sm:gap-4 flex-shrink-0">
            {/* Blue Bans */}
            <div className="flex gap-1 justify-start w-full">
              {bpState.blueBans.map((ban, idx) => {
                const champion = ban.champion;
                const isActive = currentStep?.team === 'blue' && currentStep?.action === 'ban' && currentStep?.index === idx;
                const isCurrentTeam = currentStep?.team === 'blue';

                return (
                  <div
                    key={`blue-ban-${idx}-${champion?.id || 'empty'}`}
                    className={`
                      relative w-10 h-10 rounded border overflow-hidden bg-slate-800/50
                      transition-all duration-300 ease-in-out
                      ${isActive
                        ? 'border-blue-400 ring-2 ring-cyan-400/50 shadow-[0_0_15px_rgba(34,211,238,0.8)] animate-pulse'
                        : 'border-blue-500/50'
                      }
                      ${!isCurrentTeam ? 'opacity-60' : 'opacity-100'}
                    `}
                    style={{ zIndex: isActive ? 25 : 15 }}
                  >
                    {champion ? (
                      <>
                        <img
                          src={champion.image}
                          alt={champion.name}
                          className="w-full h-full object-cover grayscale opacity-50"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.onerror = null;
                            target.style.display = 'none';
                          }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-full h-0.5 rotate-45 absolute bg-blue-500"></div>
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs">
                        {idx + 1}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Blue Picks */}
            <div className="flex gap-0">
              {bpState.bluePicks.map((champion, idx) => {
                const isActive = currentStep?.team === 'blue' && currentStep?.action === 'pick' && currentStep?.index === idx;
                const isCurrentTeam = currentStep?.team === 'blue';
                const label = `B${idx + 1}`;
                const isLast = idx === 4;

                return (
                  <div
                    key={`blue-pick-${idx}-${champion?.id || 'empty'}`}
                    className={`
                      relative h-40 sm:h-44 lg:h-48 overflow-hidden flex-shrink
                      transition-all duration-300 ease-in-out
                      ${!isLast
                        ? isActive
                          ? 'border-r border-blue-400'
                          : 'border-r border-white/20'
                        : ''
                      }
                      ${isActive ? 'ring-4 ring-cyan-400/50 shadow-[0_0_40px_rgba(34,211,238,0.6)]' : ''}
                      ${champion ? '' : 'bg-slate-800/50'}
                      ${isActive ? 'w-[90px]' : 'w-[75px]'}
                      ${!isCurrentTeam ? 'opacity-70 grayscale-[0.3]' : 'opacity-100'}
                    `}
                    style={{
                      maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 90%, transparent 100%)',
                      WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 90%, transparent 100%)',
                      zIndex: isActive ? 25 : 15
                    }}
                  >
                    <div className="absolute top-1 left-1 z-10 px-1.5 py-0.5 text-white text-xs font-bold">
                      [{label}]
                    </div>
                    {champion ? (
                      <>
                        <img
                          src={`https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${champion.id}_0.jpg`}
                          alt={champion.name}
                          className={`w-full h-full object-cover transition-all duration-300 ${!isCurrentTeam ? 'grayscale-[0.3]' : ''}`}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.onerror = null;
                            target.src = champion.image;
                          }}
                        />
                        <div className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-center text-xs py-1 font-medium">
                          {champion.name}
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm font-mono">
                        {idx + 1}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Center Section */}
          <div className="flex flex-col items-center justify-start relative flex-shrink-0" style={{ minWidth: '100px', maxWidth: '160px' }}>
            {/* Fearless Champions - Same row as bans */}
            <div className="h-10 flex items-center mb-4">
              {fearlessChampions.length > 0 && (
                <div className="flex flex-wrap gap-1 max-w-xs justify-center">
                  {fearlessChampions.map((champ) => (
                    <div
                      key={`fearless-${champ.id}`}
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
              )}
            </div>

            {/* Spacer to align with center of picks */}
            <div className="hidden sm:block" style={{ height: '60px' }} />
            <div className="block sm:hidden" style={{ height: '40px' }} />

            {/* Team Icons and Names with Triangle - center aligned with picks */}
            <div className="flex items-center gap-2 sm:gap-4 lg:gap-6">
              <div className="flex flex-col items-center gap-1 sm:gap-2">
                {blueTeamLogo ? (
                  <img src={blueTeamLogo} alt={blueTeamName} className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 object-contain" />
                ) : (
                  <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-full bg-blue-500/20 border-2 border-blue-500/50 flex items-center justify-center overflow-hidden">
                    <span className="text-blue-300 font-bold text-[10px] sm:text-xs text-center px-1">{blueTeamName}</span>
                  </div>
                )}
                <span className="text-blue-300 text-[10px] sm:text-xs font-medium hidden sm:block">{blueTeamName}</span>
              </div>

              {/* Triangle pointing to active team - between logos */}
              <div className={`transition-transform duration-300 ${isRedActive ? 'rotate-0' : 'rotate-180'}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="sm:w-6 sm:h-6">
                  <path d="M5 12 L19 5 L19 19 Z" fill="currentColor" className="text-slate-400" />
                </svg>
              </div>

              <div className="flex flex-col items-center gap-1 sm:gap-2">
                {redTeamLogo ? (
                  <img src={redTeamLogo} alt={redTeamName} className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 object-contain" />
                ) : (
                  <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-full bg-red-500/20 border-2 border-red-500/50 flex items-center justify-center overflow-hidden">
                    <span className="text-red-300 font-bold text-[10px] sm:text-xs text-center px-1">{redTeamName}</span>
                  </div>
                )}
                <span className="text-red-300 text-[10px] sm:text-xs font-medium hidden sm:block">{redTeamName}</span>
              </div>
            </div>
          </div>

          {/* Red Team Section */}
          <div className="flex flex-col items-end gap-3 sm:gap-4 flex-shrink-0">
            {/* Red Bans */}
            <div className="flex gap-1 justify-end w-full">
              {bpState.redBans.map((ban, idx) => {
                const champion = ban.champion;
                const isActive = currentStep?.team === 'red' && currentStep?.action === 'ban' && currentStep?.index === idx;
                const isCurrentTeam = currentStep?.team === 'red';

                return (
                  <div
                    key={`red-ban-${idx}-${champion?.id || 'empty'}`}
                    className={`
                      relative w-10 h-10 rounded border overflow-hidden bg-slate-800/50
                      transition-all duration-300 ease-in-out
                      ${isActive
                        ? 'border-red-400 ring-2 ring-rose-400/50 shadow-[0_0_15px_rgba(244,63,94,0.8)] animate-pulse'
                        : 'border-red-500/50'
                      }
                      ${!isCurrentTeam ? 'opacity-60' : 'opacity-100'}
                    `}
                    style={{ zIndex: isActive ? 25 : 15 }}
                  >
                    {champion ? (
                      <>
                        <img
                          src={champion.image}
                          alt={champion.name}
                          className="w-full h-full object-cover grayscale opacity-50"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.onerror = null;
                            target.style.display = 'none';
                          }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-full h-0.5 rotate-45 absolute bg-red-500"></div>
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs">
                        {idx + 1}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Red Picks */}
            <div className="flex gap-0">
              {bpState.redPicks.map((champion, idx) => {
                const isActive = currentStep?.team === 'red' && currentStep?.action === 'pick' && currentStep?.index === idx;
                const isCurrentTeam = currentStep?.team === 'red';
                const label = `R${idx + 1}`;
                const isLast = idx === 4;

                return (
                  <div
                    key={`red-pick-${idx}-${champion?.id || 'empty'}`}
                    className={`
                      relative h-40 sm:h-44 lg:h-48 overflow-hidden flex-shrink
                      transition-all duration-300 ease-in-out
                      ${!isLast
                        ? isActive
                          ? 'border-r border-red-400'
                          : 'border-r border-white/20'
                        : ''
                      }
                      ${isActive ? 'ring-4 ring-rose-400/50 shadow-[0_0_40px_rgba(244,63,94,0.6)]' : ''}
                      ${champion ? '' : 'bg-slate-800/50'}
                      ${isActive ? 'w-[90px]' : 'w-[75px]'}
                      ${!isCurrentTeam ? 'opacity-70 grayscale-[0.3]' : 'opacity-100'}
                    `}
                    style={{
                      maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 90%, transparent 100%)',
                      WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 90%, transparent 100%)',
                      zIndex: isActive ? 25 : 15
                    }}
                  >
                    <div className="absolute top-1 left-1 z-10 px-1.5 py-0.5 text-white text-xs font-bold">
                      [{label}]
                    </div>
                    {champion ? (
                      <>
                        <img
                          src={`https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${champion.id}_0.jpg`}
                          alt={champion.name}
                          className={`w-full h-full object-cover transition-all duration-300 ${!isCurrentTeam ? 'grayscale-[0.3]' : ''}`}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.onerror = null;
                            target.src = champion.image;
                          }}
                        />
                        <div className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-center text-xs py-1 font-medium">
                          {champion.name}
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm font-mono">
                        {idx + 1}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
