'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Shuffle, ChevronUp, ChevronDown, X } from 'lucide-react';
import { TeamSetupState, TeamData, PlayerInTeam } from '@/app/lib/team-champion-pool.types';

interface TeamSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (setup: TeamSetupState) => void;
  initialSetup?: TeamSetupState;
}

export default function TeamSelectionModal({
  isOpen,
  onClose,
  onConfirm,
  initialSetup,
}: TeamSelectionModalProps) {
  const [blueTeam, setBlueTeam] = useState<TeamData | null>(null);
  const [redTeam, setRedTeam] = useState<TeamData | null>(null);
  const [bluePlayerOrder, setBluePlayerOrder] = useState<PlayerInTeam[]>([]);
  const [redPlayerOrder, setRedPlayerOrder] = useState<PlayerInTeam[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TeamData[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeSelector, setActiveSelector] = useState<'blue' | 'red' | null>(null);

  // 搜索战队
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const searchTeams = async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`/api/lol/hierarchy?type=search&q=${encodeURIComponent(searchQuery)}`);
        const data = await response.json();
        if (data.success && data.teams) {
          setSearchResults(data.teams);
        }
      } catch (error) {
        console.error('Failed to search teams:', error);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchTeams, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  // 选择战队
  const handleTeamSelect = async (team: TeamData, side: 'blue' | 'red') => {
    try {
      // 获取战队详细信息（包含选手）
      const response = await fetch(`/api/lol/hierarchy?type=team&team=${team.id}`);
      const data = await response.json();

      if (data.success && data.players) {
        const teamData: TeamData = {
          id: data.team.id,
          name: data.team.name,
          logoUrl: data.team.logoUrl,
          playerCount: data.players.length,
          seriesCount: data.team.seriesCount,
          players: data.players,
        };

        // 初始化选手顺序（取前5个选手）
        const playerOrder: PlayerInTeam[] = data.players
          .slice(0, 5)
          .map((player: any, index: number) => ({
            playerId: player.id,
            playerName: player.nickname,
            orderIndex: index,
          }));

        if (side === 'blue') {
          setBlueTeam(teamData);
          setBluePlayerOrder(playerOrder);
        } else {
          setRedTeam(teamData);
          setRedPlayerOrder(playerOrder);
        }

        setActiveSelector(null);
        setSearchQuery('');
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Failed to load team details:', error);
    }
  };

  // 随机打乱选手顺序
  const shufflePlayers = (side: 'blue' | 'red') => {
    const order = side === 'blue' ? bluePlayerOrder : redPlayerOrder;
    const shuffled = [...order].sort(() => Math.random() - 0.5);
    const reindexed = shuffled.map((player, index) => ({
      ...player,
      orderIndex: index,
    }));

    if (side === 'blue') {
      setBluePlayerOrder(reindexed);
    } else {
      setRedPlayerOrder(reindexed);
    }
  };

  // 交换选手位置
  const swapPlayers = (side: 'blue' | 'red', index1: number, index2: number) => {
    const order = side === 'blue' ? [...bluePlayerOrder] : [...redPlayerOrder];
    if (index2 < 0 || index2 >= order.length) return;

    [order[index1], order[index2]] = [order[index2], order[index1]];
    const reindexed = order.map((player, index) => ({
      ...player,
      orderIndex: index,
    }));

    if (side === 'blue') {
      setBluePlayerOrder(reindexed);
    } else {
      setRedPlayerOrder(reindexed);
    }
  };

  // 确认并开始 BP
  const handleConfirm = () => {
    const setup: TeamSetupState = {
      enabled: !!(blueTeam || redTeam),
      blueTeam: {
        teamId: blueTeam?.id || null,
        teamName: blueTeam?.name || '',
        teamLogo: blueTeam?.logoUrl || null,
        playerOrder: bluePlayerOrder,
      },
      redTeam: {
        teamId: redTeam?.id || null,
        teamName: redTeam?.name || '',
        teamLogo: redTeam?.logoUrl || null,
        playerOrder: redPlayerOrder,
      },
    };

    onConfirm(setup);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-gray-900 rounded-lg shadow-2xl border border-gray-700"
        >
          {/* Header */}
          <div className="sticky top-0 z-10 bg-gray-900 border-b border-gray-700 px-6 py-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">🏆 选择对战战队</h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-8">
            {/* Blue Team */}
            <TeamSelector
              side="blue"
              team={blueTeam}
              playerOrder={bluePlayerOrder}
              searchQuery={activeSelector === 'blue' ? searchQuery : ''}
              searchResults={activeSelector === 'blue' ? searchResults : []}
              isSearching={isSearching}
              onSearchChange={(query) => {
                setActiveSelector('blue');
                setSearchQuery(query);
              }}
              onTeamSelect={(team) => handleTeamSelect(team, 'blue')}
              onShuffle={() => shufflePlayers('blue')}
              onSwap={(index1, index2) => swapPlayers('blue', index1, index2)}
              onClearSearch={() => {
                setActiveSelector(null);
                setSearchQuery('');
              }}
            />

            {/* Divider */}
            <div className="border-t border-gray-700" />

            {/* Red Team */}
            <TeamSelector
              side="red"
              team={redTeam}
              playerOrder={redPlayerOrder}
              searchQuery={activeSelector === 'red' ? searchQuery : ''}
              searchResults={activeSelector === 'red' ? searchResults : []}
              isSearching={isSearching}
              onSearchChange={(query) => {
                setActiveSelector('red');
                setSearchQuery(query);
              }}
              onTeamSelect={(team) => handleTeamSelect(team, 'red')}
              onShuffle={() => shufflePlayers('red')}
              onSwap={(index1, index2) => swapPlayers('red', index1, index2)}
              onClearSearch={() => {
                setActiveSelector(null);
                setSearchQuery('');
              }}
            />
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-gray-900 border-t border-gray-700 px-6 py-4 flex justify-between items-center">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              跳过
            </button>
            <button
              onClick={handleConfirm}
              disabled={!blueTeam && !redTeam}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-medium transition-colors"
            >
              开始 BP
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// Team Selector Component
interface TeamSelectorProps {
  side: 'blue' | 'red';
  team: TeamData | null;
  playerOrder: PlayerInTeam[];
  searchQuery: string;
  searchResults: TeamData[];
  isSearching: boolean;
  onSearchChange: (query: string) => void;
  onTeamSelect: (team: TeamData) => void;
  onShuffle: () => void;
  onSwap: (index1: number, index2: number) => void;
  onClearSearch: () => void;
}

function TeamSelector({
  side,
  team,
  playerOrder,
  searchQuery,
  searchResults,
  isSearching,
  onSearchChange,
  onTeamSelect,
  onShuffle,
  onSwap,
  onClearSearch,
}: TeamSelectorProps) {
  const sideColor = side === 'blue' ? 'text-blue-400' : 'text-red-400';
  const sideBg = side === 'blue' ? 'bg-blue-600' : 'bg-red-600';
  const sideEmoji = side === 'blue' ? '🔵' : '🔴';

  return (
    <div className="space-y-4">
      <h3 className={`text-xl font-bold ${sideColor}`}>
        {sideEmoji} {side === 'blue' ? '蓝色方' : '红色方'}
      </h3>

      {/* Search Box */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => onSearchChange(searchQuery)}
            placeholder="搜索战队..."
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Search Results Dropdown */}
        {searchQuery && searchResults.length > 0 && (
          <div className="absolute z-20 w-full mt-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
            {searchResults.map((result) => (
              <button
                key={result.id}
                onClick={() => onTeamSelect(result)}
                className="w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors border-b border-gray-700 last:border-b-0"
              >
                <div className="font-medium text-white">{result.name}</div>
                <div className="text-sm text-gray-400">
                  {result.playerCount} 名选手 · {result.seriesCount} 场比赛
                </div>
              </button>
            ))}
          </div>
        )}

        {isSearching && (
          <div className="absolute z-20 w-full mt-2 bg-gray-800 border border-gray-700 rounded-lg p-4 text-center text-gray-400">
            搜索中...
          </div>
        )}
      </div>

      {/* Selected Team */}
      {team && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-white font-medium">已选择：{team.name}</div>
            <button
              onClick={onShuffle}
              className="flex items-center gap-2 px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors"
            >
              <Shuffle size={16} />
              随机排序
            </button>
          </div>

          {/* Player Order List */}
          <div className="bg-gray-800 rounded-lg p-4 space-y-2">
            {playerOrder.map((player, index) => (
              <div
                key={player.playerId}
                className="flex items-center justify-between bg-gray-700 rounded px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'][index]}</span>
                  <span className="text-white font-medium">{player.playerName}</span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => onSwap(index, index - 1)}
                    disabled={index === 0}
                    className="p-1 hover:bg-gray-600 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronUp size={16} className="text-gray-300" />
                  </button>
                  <button
                    onClick={() => onSwap(index, index + 1)}
                    disabled={index === playerOrder.length - 1}
                    className="p-1 hover:bg-gray-600 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronDown size={16} className="text-gray-300" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="text-sm text-gray-400 italic">
            💡 提示：顺序决定 BP 阶段的选人顺序，不代表游戏内位置
          </div>
        </div>
      )}
    </div>
  );
}
