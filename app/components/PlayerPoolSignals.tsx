/**
 * Player Pool Signals Component
 *
 * Step 5: Player Champion Pool Layer - UI Integration
 *
 * Displays top champions for a selected opponent player with:
 * - Pool strength score
 * - Pick rate and win rate (conservative bounds)
 * - Ban-against rate
 * - Evidence modal
 */

'use client';

import React, { useState, useMemo } from 'react';
import {
  ChampionPoolEntry,
  PlayerPool,
  getPoolStrengthTier,
  getPoolStrengthColor,
  getPoolStrengthLabel,
} from '@/app/lib/player-pool-types';

interface PlayerPoolSignalsProps {
  playerPool: PlayerPool | null;
  onChampionClick?: (championName: string) => void;
  maxDisplay?: number;
  minScore?: number;
}

export function PlayerPoolSignals({
  playerPool,
  onChampionClick,
  maxDisplay = 5,
  minScore = 50,
}: PlayerPoolSignalsProps) {
  const [selectedChampion, setSelectedChampion] = useState<ChampionPoolEntry | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);

  const displayChampions = useMemo(() => {
    if (!playerPool) return [];
    return playerPool.champions
      .filter(c => c.poolStrengthScore >= minScore)
      .slice(0, maxDisplay);
  }, [playerPool, maxDisplay, minScore]);

  if (!playerPool) {
    return (
      <div className="text-gray-500 text-sm italic">
        Select an opponent player to see pool signals
      </div>
    );
  }

  if (displayChampions.length === 0) {
    return (
      <div className="text-gray-500 text-sm italic">
        No significant pool signals for {playerPool.playerName}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-300">
          {playerPool.playerName}'s Pool
        </h4>
        <span className="text-xs text-gray-500">
          {playerPool.totalGames} games, {playerPool.uniqueChampions} champs
        </span>
      </div>

      {/* Champion list */}
      <div className="space-y-1">
        {displayChampions.map((champ) => {
          const tier = getPoolStrengthTier(champ.poolStrengthScore);
          const colorClass = getPoolStrengthColor(tier);
          const tierLabel = getPoolStrengthLabel(tier);

          return (
            <div
              key={champ.championId}
              className="flex items-center justify-between p-2 rounded bg-gray-800/50 hover:bg-gray-800 cursor-pointer transition-colors"
              onClick={() => {
                setSelectedChampion(champ);
                setShowEvidence(true);
                onChampionClick?.(champ.championName);
              }}
            >
              {/* Champion info */}
              <div className="flex items-center gap-2">
                <span className="font-medium text-white">{champ.championName}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded border ${colorClass}`}>
                  {tierLabel}
                </span>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-3 text-xs">
                <span className="text-gray-400">
                  {champ.pickCount} picks
                </span>
                <span className="text-green-400">
                  {(champ.winRateLowerBound * 100).toFixed(0)}%+ WR
                </span>
                {champ.banAgainstCount > 0 && (
                  <span className="text-red-400">
                    {champ.banAgainstCount} bans
                  </span>
                )}
                <span className="text-blue-400 font-medium">
                  {champ.poolStrengthScore.toFixed(0)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Evidence Modal */}
      {showEvidence && selectedChampion && (
        <PlayerPoolEvidence
          champion={selectedChampion}
          playerName={playerPool.playerName}
          onClose={() => setShowEvidence(false)}
        />
      )}
    </div>
  );
}

interface PlayerPoolEvidenceProps {
  champion: ChampionPoolEntry;
  playerName: string;
  onClose: () => void;
}

function PlayerPoolEvidence({ champion, playerName, onClose }: PlayerPoolEvidenceProps) {
  const tier = getPoolStrengthTier(champion.poolStrengthScore);
  const colorClass = getPoolStrengthColor(tier);
  const tierLabel = getPoolStrengthLabel(tier);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg p-4 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-white">{champion.championName}</h3>
            <span className={`text-xs px-2 py-1 rounded border ${colorClass}`}>
              {tierLabel}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Player context */}
        <div className="text-sm text-gray-400 mb-4">
          Pool signal for <span className="text-white font-medium">{playerName}</span>
        </div>

        {/* Score */}
        <div className="mb-4">
          <div className="text-3xl font-bold text-blue-400">
            {champion.poolStrengthScore.toFixed(1)}
          </div>
          <div className="text-xs text-gray-500">Pool Strength Score</div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Pick stats */}
          <div className="bg-gray-800 rounded p-3">
            <div className="text-xs text-gray-500 mb-1">Pick Association</div>
            <div className="text-lg font-medium text-white">
              {champion.pickCount} / {champion.gamesPlayed}
            </div>
            <div className="text-xs text-gray-400">
              {(champion.pickRateWithinPlayer * 100).toFixed(1)}% of picks
            </div>
            <div className="text-xs text-green-400">
              {(champion.pickRateLowerBound * 100).toFixed(1)}%+ conservative
            </div>
          </div>

          {/* Win stats */}
          <div className="bg-gray-800 rounded p-3">
            <div className="text-xs text-gray-500 mb-1">Win Performance</div>
            <div className="text-lg font-medium text-white">
              {champion.wins} / {champion.pickCount}
            </div>
            <div className="text-xs text-gray-400">
              {(champion.winRate * 100).toFixed(1)}% win rate
            </div>
            <div className="text-xs text-green-400">
              {(champion.winRateLowerBound * 100).toFixed(1)}%+ conservative
            </div>
          </div>

          {/* Ban-against stats */}
          <div className="bg-gray-800 rounded p-3">
            <div className="text-xs text-gray-500 mb-1">Ban-Against</div>
            <div className="text-lg font-medium text-white">
              {champion.banAgainstCount}
            </div>
            <div className="text-xs text-gray-400">
              {(champion.banAgainstRate * 100).toFixed(1)}% of games
            </div>
            {champion.banAgainstCount > 0 && (
              <div className="text-xs text-red-400">
                Opponents target this pick
              </div>
            )}
          </div>

          {/* Uncertainty */}
          <div className="bg-gray-800 rounded p-3">
            <div className="text-xs text-gray-500 mb-1">Confidence</div>
            <div className="text-lg font-medium text-white">
              ±{(champion.winRateUncertainty * 100 / 2).toFixed(1)}%
            </div>
            <div className="text-xs text-gray-400">
              Win rate uncertainty
            </div>
            <div className="text-xs text-yellow-400">
              {champion.pickCount < 10 ? 'Small sample' : 'Reliable sample'}
            </div>
          </div>
        </div>

        {/* Notes */}
        {champion.notes.length > 0 && (
          <div className="border-t border-gray-700 pt-3">
            <div className="text-xs text-gray-500 mb-2">Evidence Notes</div>
            <ul className="text-sm text-gray-300 space-y-1">
              {champion.notes.map((note, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-blue-400">•</span>
                  {note}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Methodology note */}
        <div className="mt-4 text-xs text-gray-500 border-t border-gray-700 pt-3">
          Score uses Dirichlet-smoothed pick association, Beta-Binomial conservative win rate,
          and ban-against signals. Small samples are penalized.
        </div>
      </div>
    </div>
  );
}

export default PlayerPoolSignals;
