'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type Language = 'zh' | 'en';

// 类型定义
interface Region {
  code: string;
  name: string;
  fullName: string;
  country: string;
  tournamentCount: number;
  teamCount: number;
  playerCount: number;
  matchCount: number;
}

interface Tournament {
  id: string;
  name: string;
  nameShortened?: string;
  startDate?: string;
  endDate?: string;
  teamCount: number;
}

interface Team {
  id: string;
  name: string;
  nameShortened?: string;
  logoUrl?: string;
  organization?: { id: string; name: string };
  playerCount: number;
  players?: Player[];
}

interface Player {
  id: string;
  nickname: string;
}

// 新增：比赛状态相关类型
interface ObjectiveState {
  type: string;
  completionCount: number;
}

interface MultikillState {
  numberOfKills: number;
  count: number;
}

interface InventoryItem {
  id: string;
  name: string;
}

interface PlayerState {
  id: string;
  name: string;
  character?: { id: string; name: string };
  participationStatus?: string;
  kills?: number;
  deaths?: number;
  killAssistsGiven?: number;
  selfkills?: number;
  teamkills?: number;
  netWorth?: number;
  money?: number;
  structuresDestroyed?: number;
  structuresCaptured?: number;
  objectives?: ObjectiveState[];
  multikills?: MultikillState[];
  inventory?: { items: InventoryItem[] };
}

interface DraftAction {
  type: string;
  sequenceNumber: string;
  drafter: { id: string; type: string };
  draftable: { id: string; type: string; name: string };
}

interface GameTeamState {
  id: string;
  name: string;
  score: number;
  side: string;
  won: boolean;
  netWorth?: number;
  money?: number;
  loadoutValue?: number;
  kills?: number;
  deaths?: number;
  killAssistsGiven?: number;
  selfkills?: number;
  teamkills?: number;
  structuresDestroyed?: number;
  structuresCaptured?: number;
  objectives?: ObjectiveState[];
  multikills?: MultikillState[];
  players: PlayerState[];
}

interface GameState {
  id: string;
  sequenceNumber: number;
  started?: boolean;
  finished: boolean;
  startedAt?: string;
  duration?: string;
  draftActions?: DraftAction[];
  teams: GameTeamState[];
}

interface SeriesTeamState {
  id: string;
  name: string;
  score: number;
  won: boolean;
  kills?: number;
  deaths?: number;
  killAssistsGiven?: number;
  structuresDestroyed?: number;
  objectives?: ObjectiveState[];
  multikills?: MultikillState[];
  players: { id: string; name: string }[];
}

interface SeriesState {
  id: string;
  started: boolean;
  finished: boolean;
  format: string;
  startedAt?: string;
  duration?: string;
  teams: SeriesTeamState[];
  games: GameState[];
}

interface Series {
  id: string;
  startTimeScheduled: string;
  format: { name: string; nameShortened: string };
  type: string;
  tournament: {
    id: string;
    name: string;
    parent?: { id: string; name: string; parent?: { id: string; name: string } };
  };
  teams: Array<{
    baseInfo: { id: string; name: string; nameShortened: string; logoUrl: string };
    scoreAdvantage: number;
  }>;
  state?: SeriesState | null;
}

interface Summary {
  totalPlayers: number;
  totalTeams: number;
  totalTournaments: number;
  regionCount: number;
  totalPlayersWithTeams: number;
  totalPlayersAll: number;
}

// 翻译
const translations = {
  zh: {
    title: 'LOL 电竞数据',
    subtitle: '赛区 → 联赛 → 战队 → 选手（仅有比赛记录的数据）',
    backToBP: '← BP 工具',
    loading: '加载中...',
    regions: '赛区',
    tournaments: '联赛',
    teams: '战队',
    players: '选手',
    series: '赛事',
    selectRegion: '选择赛区查看联赛',
    selectTournament: '选择联赛查看战队',
    selectTeam: '选择战队查看选手',
    noData: '暂无数据',
    total: '共',
    updated: '更新于',
    withMatchRecords: '有比赛记录',
    viewSeries: '查看赛事',
    close: '关闭',
    vs: 'vs',
    noSeries: '暂无赛事数据',
    seriesCount: '场赛事',
    game: '第{n}局',
    lineup: '首发阵容',
    win: '胜',
    loss: '负',
    kills: '击杀',
    deaths: '死亡',
    assists: '助攻',
    gold: '金币',
    champion: '英雄',
    kda: 'KDA',
    redSide: '红方',
    blueSide: '蓝方',
    showDetails: '展开详情',
    hideDetails: '收起详情',
    notStarted: '未开始',
    inProgress: '进行中',
    finished: '已结束',
    // 新增
    bans: '禁用',
    picks: '选择',
    duration: '时长',
    towers: '防御塔',
    dragons: '小龙',
    barons: '大龙',
    heralds: '先锋',
    grubs: '虚空蝎',
    inhibitors: '水晶',
    objectives: '目标',
    multikills: '多杀',
    doubleKill: '双杀',
    tripleKill: '三杀',
    quadraKill: '四杀',
    pentaKill: '五杀',
    items: '装备',
    teamStats: '战队数据',
    playerStats: '选手数据',
    structuresDestroyed: '推塔',
    matchCount: '场比赛',
    playerMatches: '选手赛事',
    noMatchRecord: '无比赛记录',
    hasMatches: '有比赛',
    forfeited: '弃权',
    paused: '暂停中',
  },
  en: {
    title: 'LOL Esports Data',
    subtitle: 'Region → League → Team → Player (Match Records Only)',
    backToBP: '← BP Tool',
    loading: 'Loading...',
    regions: 'Regions',
    tournaments: 'Leagues',
    teams: 'Teams',
    players: 'Players',
    series: 'Matches',
    selectRegion: 'Select a region to view leagues',
    selectTournament: 'Select a league to view teams',
    selectTeam: 'Select a team to view players',
    noData: 'No data available',
    total: 'Total',
    updated: 'Updated',
    withMatchRecords: 'with match records',
    viewSeries: 'View Matches',
    close: 'Close',
    vs: 'vs',
    noSeries: 'No match data available',
    seriesCount: 'matches',
    game: 'Game {n}',
    lineup: 'Starting Lineup',
    win: 'W',
    loss: 'L',
    kills: 'K',
    deaths: 'D',
    assists: 'A',
    gold: 'Gold',
    champion: 'Champion',
    kda: 'KDA',
    redSide: 'Red',
    blueSide: 'Blue',
    showDetails: 'Show Details',
    hideDetails: 'Hide Details',
    notStarted: 'Not Started',
    inProgress: 'In Progress',
    finished: 'Finished',
    // New
    bans: 'Bans',
    picks: 'Picks',
    duration: 'Duration',
    towers: 'Towers',
    dragons: 'Dragons',
    barons: 'Barons',
    heralds: 'Heralds',
    grubs: 'Grubs',
    inhibitors: 'Inhibitors',
    objectives: 'Objectives',
    multikills: 'Multikills',
    doubleKill: 'Double',
    tripleKill: 'Triple',
    quadraKill: 'Quadra',
    pentaKill: 'Penta',
    items: 'Items',
    teamStats: 'Team Stats',
    playerStats: 'Player Stats',
    structuresDestroyed: 'Towers',
    matchCount: 'matches',
    playerMatches: 'Player Matches',
    noMatchRecord: 'No match record',
    hasMatches: 'Has matches',
    forfeited: 'Forfeited',
    paused: 'Paused',
  },
};

function getDefaultLanguage(): Language {
  if (typeof window === 'undefined') return 'zh';
  const browserLang = navigator.language || '';
  return browserLang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function formatDate(dateStr: string, lang: Language): string {
  const date = new Date(dateStr);
  if (lang === 'zh') {
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatGold(gold: number): string {
  if (gold >= 1000) {
    return (gold / 1000).toFixed(1) + 'k';
  }
  return gold.toString();
}

// 格式化时长
function formatDuration(duration: string | undefined): string {
  if (!duration) return '';
  // duration 格式可能是 "PT30M15S" 或毫秒数
  if (duration.startsWith('PT')) {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (match) {
      const hours = parseInt(match[1] || '0');
      const minutes = parseInt(match[2] || '0');
      const seconds = parseInt(match[3] || '0');
      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      }
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }
  // 如果是毫秒数
  const ms = parseInt(duration);
  if (!isNaN(ms)) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  return duration;
}

// 目标类型翻译映射
const objectiveTypeMap: Record<string, { zh: string; en: string; icon: string }> = {
  'turret_destroyed': { zh: '防御塔', en: 'Tower', icon: '🗼' },
  'inhibitor_destroyed': { zh: '水晶', en: 'Inhibitor', icon: '💎' },
  'dragon_killed': { zh: '小龙', en: 'Dragon', icon: '🐉' },
  'baron_killed': { zh: '大龙', en: 'Baron', icon: '👾' },
  'herald_killed': { zh: '先锋', en: 'Herald', icon: '👁️' },
  'grubs_killed': { zh: '虚空蝎', en: 'Grubs', icon: '🦂' },
  'atakhan_killed': { zh: '阿塔汗', en: 'Atakhan', icon: '🔥' },
};

// 多杀名称
const multikillNames: Record<number, { zh: string; en: string }> = {
  2: { zh: '双杀', en: 'Double' },
  3: { zh: '三杀', en: 'Triple' },
  4: { zh: '四杀', en: 'Quadra' },
  5: { zh: '五杀', en: 'Penta' },
};

// 单场比赛详情组件
function SeriesDetail({ series, language, t }: { series: Series; language: Language; t: typeof translations['zh'] }) {
  const [expanded, setExpanded] = useState(false);
  const state = series.state;

  // 获取比赛状态文本
  const getStatusText = () => {
    if (!state) return '';
    if (!state.started) return t.notStarted;
    if (!state.finished) return t.inProgress;
    return t.finished;
  };

  const statusText = getStatusText();
  const team1 = series.teams[0];
  const team2 = series.teams[1];
  const stateTeam1 = state?.teams?.find(t => t.id === team1?.baseInfo?.id);
  const stateTeam2 = state?.teams?.find(t => t.id === team2?.baseInfo?.id);

  // 渲染目标统计
  const renderObjectives = (objectives: ObjectiveState[] | undefined) => {
    if (!objectives || objectives.length === 0) return null;
    const filtered = objectives.filter(o => o.completionCount > 0);
    if (filtered.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-1">
        {filtered.map(obj => {
          const info = objectiveTypeMap[obj.type];
          return (
            <span key={obj.type} className="bg-white/10 px-1.5 py-0.5 rounded text-xs flex items-center gap-1">
              <span>{info?.icon || '🎯'}</span>
              <span>{info ? info[language] : obj.type}</span>
              <span className="text-yellow-400">×{obj.completionCount}</span>
            </span>
          );
        })}
      </div>
    );
  };

  // 渲染多杀统计
  const renderMultikills = (multikills: MultikillState[] | undefined) => {
    if (!multikills) return null;
    const filtered = multikills.filter(m => m.count > 0 && m.numberOfKills >= 2);
    if (filtered.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-1">
        {filtered.map(mk => {
          const name = multikillNames[mk.numberOfKills];
          return (
            <span key={mk.numberOfKills} className="bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded text-xs">
              {name ? name[language] : `${mk.numberOfKills}杀`} ×{mk.count}
            </span>
          );
        })}
      </div>
    );
  };

  // 渲染BP阶段
  const renderDraftPhase = (game: GameState) => {
    if (!game.draftActions || game.draftActions.length === 0) return null;

    const bans = game.draftActions.filter(a => a.type === 'ban');
    const picks = game.draftActions.filter(a => a.type === 'pick');
    const teamIds = game.teams.map(t => t.id);

    // 分组
    const team1Bans = bans.filter(b => b.drafter.id === teamIds[0]);
    const team2Bans = bans.filter(b => b.drafter.id === teamIds[1]);
    const team1Picks = picks.filter(p => p.drafter.id === teamIds[0]);
    const team2Picks = picks.filter(p => p.drafter.id === teamIds[1]);

    return (
      <div className="mb-3 bg-white/5 rounded p-2">
        <div className="text-xs text-gray-400 mb-2">{t.bans} / {t.picks}</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {/* 队伍1 */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              <span className="text-gray-300">{game.teams[0]?.name}</span>
            </div>
            <div className="flex flex-wrap gap-1 mb-1">
              {team1Bans.map(b => (
                <span key={b.sequenceNumber} className="bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded line-through opacity-70">
                  {b.draftable.name}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {team1Picks.map(p => (
                <span key={p.sequenceNumber} className="bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded">
                  {p.draftable.name}
                </span>
              ))}
            </div>
          </div>
          {/* 队伍2 */}
          <div className="text-right">
            <div className="flex items-center gap-1 mb-1 justify-end">
              <span className="text-gray-300">{game.teams[1]?.name}</span>
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
            </div>
            <div className="flex flex-wrap gap-1 mb-1 justify-end">
              {team2Bans.map(b => (
                <span key={b.sequenceNumber} className="bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded line-through opacity-70">
                  {b.draftable.name}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-1 justify-end">
              {team2Picks.map(p => (
                <span key={p.sequenceNumber} className="bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded">
                  {p.draftable.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white/5 rounded-lg overflow-hidden">
      {/* 基本信息 */}
      <div className="p-4">
        {/* 时间、格式、状态、时长 */}
        <div className="flex justify-between items-center mb-3 text-sm">
          <span className="text-gray-400">
            {formatDate(series.startTimeScheduled, language)}
          </span>
          <div className="flex items-center gap-2">
            {state?.duration && (
              <span className="text-gray-400 text-xs">
                ⏱️ {formatDuration(state.duration)}
              </span>
            )}
            {statusText && (
              <span className={`px-2 py-0.5 rounded text-xs ${
                state?.finished ? 'bg-green-500/20 text-green-300' :
                state?.started ? 'bg-yellow-500/20 text-yellow-300' :
                'bg-gray-500/20 text-gray-300'
              }`}>
                {statusText}
              </span>
            )}
            <span className="bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded text-xs">
              {series.format.nameShortened || series.format.name}
            </span>
          </div>
        </div>

        {/* 对阵双方及比分 */}
        {series.teams.length >= 2 ? (
          <div className="flex items-center justify-between gap-4">
            {/* 队伍1 */}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                {team1?.baseInfo?.logoUrl ? (
                  <img
                    src={team1.baseInfo.logoUrl}
                    alt={team1.baseInfo.name}
                    className="w-10 h-10 rounded object-contain bg-white/10"
                  />
                ) : (
                  <div className="w-10 h-10 rounded bg-blue-500/20 flex items-center justify-center">🏆</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className={`font-medium truncate ${stateTeam1?.won ? 'text-green-400' : ''}`}>
                    {team1?.baseInfo?.name || 'TBD'}
                  </div>
                  <div className="text-xs text-gray-400">{team1?.baseInfo?.nameShortened}</div>
                </div>
              </div>
            </div>

            {/* 比分 */}
            <div className="flex items-center gap-2 text-2xl font-bold">
              <span className={stateTeam1?.won ? 'text-green-400' : 'text-gray-400'}>
                {stateTeam1?.score ?? '-'}
              </span>
              <span className="text-gray-600 text-lg">:</span>
              <span className={stateTeam2?.won ? 'text-green-400' : 'text-gray-400'}>
                {stateTeam2?.score ?? '-'}
              </span>
            </div>

            {/* 队伍2 */}
            <div className="flex-1">
              <div className="flex items-center gap-2 justify-end">
                <div className="flex-1 min-w-0 text-right">
                  <div className={`font-medium truncate ${stateTeam2?.won ? 'text-green-400' : ''}`}>
                    {team2?.baseInfo?.name || 'TBD'}
                  </div>
                  <div className="text-xs text-gray-400">{team2?.baseInfo?.nameShortened}</div>
                </div>
                {team2?.baseInfo?.logoUrl ? (
                  <img
                    src={team2.baseInfo.logoUrl}
                    alt={team2.baseInfo.name}
                    className="w-10 h-10 rounded object-contain bg-white/10"
                  />
                ) : (
                  <div className="w-10 h-10 rounded bg-red-500/20 flex items-center justify-center">🏆</div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-400">TBD</div>
        )}

        {/* 首发阵容 */}
        {state && state.teams && state.teams.length >= 2 && (
          <div className="mt-4 grid grid-cols-2 gap-4">
            {state.teams.map((team, idx) => (
              <div key={team.id} className={`text-xs ${idx === 0 ? '' : 'text-right'}`}>
                <div className="text-gray-500 mb-1">{t.lineup}</div>
                <div className={`flex flex-wrap gap-1 ${idx === 0 ? 'justify-start' : 'justify-end'}`}>
                  {team.players.map(player => (
                    <span key={player.id} className="bg-white/10 px-1.5 py-0.5 rounded">
                      {player.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 展开/收起按钮 */}
        {state && state.games && state.games.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-3 w-full text-center text-xs text-purple-400 hover:text-purple-300 py-1"
          >
            {expanded ? t.hideDetails : t.showDetails} ({state.games.length} {language === 'zh' ? '局' : 'games'})
          </button>
        )}
      </div>

      {/* 展开的详细信息 */}
      <AnimatePresence>
        {expanded && state && state.games && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/10 p-4 space-y-4">
              {state.games.map((game) => (
                <div key={game.id} className="bg-white/5 rounded-lg p-3">
                  {/* 局数标题和时长 */}
                  <div className="flex justify-between items-center mb-3">
                    <span className="font-medium text-sm">
                      {t.game.replace('{n}', game.sequenceNumber.toString())}
                    </span>
                    <div className="flex items-center gap-2">
                      {game.duration && (
                        <span className="text-xs text-gray-400">⏱️ {formatDuration(game.duration)}</span>
                      )}
                      {game.finished && (
                        <span className="text-xs text-green-400">{t.finished}</span>
                      )}
                    </div>
                  </div>

                  {/* BP阶段 */}
                  {renderDraftPhase(game)}

                  {/* 双方数据 */}
                  {game.teams.map((gameTeam, teamIdx) => {
                    const isWinner = gameTeam.won;
                    const sideColor = gameTeam.side === 'blue' ? 'blue' : 'red';

                    return (
                      <div key={gameTeam.id} className={`${teamIdx > 0 ? 'mt-3 pt-3 border-t border-white/10' : ''}`}>
                        {/* 队伍标题 */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${sideColor === 'blue' ? 'bg-blue-500' : 'bg-red-500'}`}></span>
                            <span className={`font-medium text-sm ${isWinner ? 'text-green-400' : ''}`}>
                              {gameTeam.name}
                            </span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              sideColor === 'blue' ? 'bg-blue-500/20 text-blue-300' : 'bg-red-500/20 text-red-300'
                            }`}>
                              {sideColor === 'blue' ? t.blueSide : t.redSide}
                            </span>
                            {isWinner && (
                              <span className="text-xs bg-green-500/20 text-green-300 px-1.5 py-0.5 rounded">{t.win}</span>
                            )}
                          </div>
                          <span className="text-sm font-bold">{gameTeam.score}</span>
                        </div>

                        {/* 战队统计 */}
                        <div className="mb-2 flex flex-wrap gap-2 text-xs">
                          <span className="bg-white/10 px-2 py-0.5 rounded">
                            <span className="text-green-400">{gameTeam.kills ?? 0}</span>
                            <span className="text-gray-500">/</span>
                            <span className="text-red-400">{gameTeam.deaths ?? 0}</span>
                            <span className="text-gray-500">/</span>
                            <span className="text-blue-400">{gameTeam.killAssistsGiven ?? 0}</span>
                          </span>
                          <span className="bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded">
                            💰 {gameTeam.netWorth ? formatGold(gameTeam.netWorth) : '-'}
                          </span>
                          {(gameTeam.structuresDestroyed ?? 0) > 0 && (
                            <span className="bg-white/10 px-2 py-0.5 rounded">
                              🗼 {gameTeam.structuresDestroyed}
                            </span>
                          )}
                        </div>

                        {/* 目标统计 */}
                        {gameTeam.objectives && gameTeam.objectives.length > 0 && (
                          <div className="mb-2">
                            {renderObjectives(gameTeam.objectives)}
                          </div>
                        )}

                        {/* 多杀统计 */}
                        {gameTeam.multikills && gameTeam.multikills.length > 0 && (
                          <div className="mb-2">
                            {renderMultikills(gameTeam.multikills)}
                          </div>
                        )}

                        {/* 选手数据表格 */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500">
                                <th className="text-left py-1 px-1">{t.players}</th>
                                <th className="text-left py-1 px-1">{t.champion}</th>
                                <th className="text-center py-1 px-1">{t.kda}</th>
                                <th className="text-right py-1 px-1">{t.gold}</th>
                                <th className="text-left py-1 px-1 hidden sm:table-cell">{t.items}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {gameTeam.players.map((player) => (
                                <tr key={player.id} className="border-t border-white/5">
                                  <td className="py-1.5 px-1 font-medium">{player.name}</td>
                                  <td className="py-1.5 px-1 text-purple-300">
                                    {player.character?.name || '-'}
                                  </td>
                                  <td className="py-1.5 px-1 text-center">
                                    <span className="text-green-400">{player.kills ?? 0}</span>
                                    <span className="text-gray-500">/</span>
                                    <span className="text-red-400">{player.deaths ?? 0}</span>
                                    <span className="text-gray-500">/</span>
                                    <span className="text-blue-400">{player.killAssistsGiven ?? 0}</span>
                                  </td>
                                  <td className="py-1.5 px-1 text-right text-yellow-400">
                                    {player.netWorth ? formatGold(player.netWorth) : '-'}
                                  </td>
                                  <td className="py-1.5 px-1 hidden sm:table-cell">
                                    {player.inventory?.items && player.inventory.items.length > 0 ? (
                                      <div className="flex flex-wrap gap-0.5">
                                        {player.inventory.items.slice(0, 6).map((item, i) => (
                                          <span key={i} className="bg-white/5 px-1 py-0.5 rounded text-[10px] text-gray-300" title={item.name}>
                                            {item.name.length > 8 ? item.name.substring(0, 8) + '…' : item.name}
                                          </span>
                                        ))}
                                      </div>
                                    ) : '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 所属联赛 */}
      {series.tournament.parent && (
        <div className="px-4 pb-3 text-xs text-gray-500">
          {series.tournament.name}
        </div>
      )}
    </div>
  );
}

export default function DataPage() {
  const [language, setLanguage] = useState<Language>('zh');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);

  // 选中状态
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

  // 数据
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);

  // 赛事相关
  const [showSeriesModal, setShowSeriesModal] = useState(false);
  const [seriesData, setSeriesData] = useState<Series[]>([]);
  const [seriesTotal, setSeriesTotal] = useState(0);
  const [seriesTournament, setSeriesTournament] = useState<Tournament | null>(null);
  const [loadingSeries, setLoadingSeries] = useState(false);

  // 联赛比赛数量缓存
  const [tournamentSeriesCounts, setTournamentSeriesCounts] = useState<Record<string, number>>({});

  // 选手赛事相关
  const [showPlayerSeriesModal, setShowPlayerSeriesModal] = useState(false);
  const [playerSeriesData, setPlayerSeriesData] = useState<Series[]>([]);
  const [playerSeriesTotal, setPlayerSeriesTotal] = useState(0);
  const [seriesPlayer, setSeriesPlayer] = useState<Player | null>(null);
  const [loadingPlayerSeries, setLoadingPlayerSeries] = useState(false);

  // 加载状态
  const [loadingTournaments, setLoadingTournaments] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingPlayers, setLoadingPlayers] = useState(false);

  const t = translations[language];

  // 初始化语言
  useEffect(() => {
    setLanguage(getDefaultLanguage());
  }, []);

  // 加载摘要和赛区数据
  useEffect(() => {
    Promise.all([
      fetch('/api/lol/hierarchy?type=summary').then((res) => res.json()),
      fetch('/api/lol/hierarchy?type=regions').then((res) => res.json()),
    ])
      .then(([summaryData, regionsData]) => {
        if (summaryData.success) {
          setSummary(summaryData);
        }
        if (regionsData.success) {
          setRegions(regionsData.regions);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // 选择赛区时加载联赛
  const handleSelectRegion = async (region: Region) => {
    setSelectedRegion(region);
    setSelectedTournament(null);
    setSelectedTeam(null);
    setTeams([]);
    setPlayers([]);
    setLoadingTournaments(true);

    try {
      const res = await fetch(`/api/lol/hierarchy?type=region&region=${region.code}`);
      const data = await res.json();
      if (data.success) {
        setTournaments(data.tournaments);
      }
    } catch (e) {
      console.error('Failed to load tournaments:', e);
    }
    setLoadingTournaments(false);
  };

  // 选择联赛时加载战队
  const handleSelectTournament = async (tournament: Tournament) => {
    setSelectedTournament(tournament);
    setSelectedTeam(null);
    setPlayers([]);
    setLoadingTeams(true);

    try {
      const res = await fetch(`/api/lol/hierarchy?type=tournament&tournament=${tournament.id}`);
      const data = await res.json();
      if (data.success) {
        setTeams(data.teams);
      }
    } catch (e) {
      console.error('Failed to load teams:', e);
    }
    setLoadingTeams(false);
  };

  // 选择战队时加载选手
  const handleSelectTeam = async (team: Team) => {
    setSelectedTeam(team);
    setLoadingPlayers(true);

    try {
      const res = await fetch(`/api/lol/hierarchy?type=team&team=${team.id}`);
      const data = await res.json();
      if (data.success) {
        setPlayers(data.players);
      }
    } catch (e) {
      console.error('Failed to load players:', e);
    }
    setLoadingPlayers(false);
  };

  // 查看联赛赛事（包含完整状态数据）
  const handleViewSeries = async (tournament: Tournament, e: React.MouseEvent) => {
    e.stopPropagation();
    setSeriesTournament(tournament);
    setShowSeriesModal(true);
    setLoadingSeries(true);
    setSeriesData([]);
    setSeriesTotal(0);

    try {
      // 加入 includeState=true 获取完整比赛数据
      const res = await fetch(`/api/lol/series?type=tournament&tournament=${tournament.id}&includeState=true`);
      const data = await res.json();
      if (data.success) {
        setSeriesData(data.series);
        setSeriesTotal(data.total);
      }
    } catch (e) {
      console.error('Failed to load series:', e);
    }
    setLoadingSeries(false);
  };

  // 加载联赛比赛数量
  useEffect(() => {
    if (tournaments.length > 0) {
      // 并行加载所有联赛的比赛数量
      const loadCounts = async () => {
        const newCounts: Record<string, number> = {};
        await Promise.all(
          tournaments.map(async (t) => {
            try {
              const res = await fetch(`/api/lol/series?type=count&tournament=${t.id}`);
              const data = await res.json();
              if (data.success) {
                newCounts[t.id] = data.count;
              }
            } catch {
              newCounts[t.id] = 0;
            }
          })
        );
        setTournamentSeriesCounts(prev => ({ ...prev, ...newCounts }));
      };
      loadCounts();
    }
  }, [tournaments]);

  // 查看选手赛事
  const handleViewPlayerSeries = async (player: Player, e: React.MouseEvent) => {
    e.stopPropagation();
    setSeriesPlayer(player);
    setShowPlayerSeriesModal(true);
    setLoadingPlayerSeries(true);
    setPlayerSeriesData([]);
    setPlayerSeriesTotal(0);

    try {
      const res = await fetch(`/api/lol/series?type=player&player=${player.id}&includeState=true`);
      const data = await res.json();
      if (data.success) {
        setPlayerSeriesData(data.series);
        setPlayerSeriesTotal(data.total);
      }
    } catch (e) {
      console.error('Failed to load player series:', e);
    }
    setLoadingPlayerSeries(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-gray-400">{t.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white pb-8">
      {/* 语言切换 */}
      <button
        onClick={() => setLanguage((l) => (l === 'zh' ? 'en' : 'zh'))}
        className="fixed top-4 right-4 z-50 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors"
      >
        {language === 'zh' ? 'EN' : '中文'}
      </button>

      {/* 标题 */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center pt-6 pb-4 px-4"
      >
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          {t.title}
        </h1>
        <p className="text-gray-400 mt-2 text-sm">{t.subtitle}</p>

        {/* 导航 */}
        <div className="mt-4 flex justify-center gap-4">
          <a
            href="/"
            className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-gray-300 hover:text-white transition-colors border border-white/10"
          >
            {t.backToBP}
          </a>
        </div>

        {/* 统计 */}
        {summary && (
          <div className="mt-4 flex justify-center gap-6 text-sm text-gray-500">
            <span>
              {t.total} {summary.totalPlayers.toLocaleString()} {t.players}
            </span>
            <span>
              {summary.totalTeams.toLocaleString()} {t.teams}
            </span>
            <span>
              {summary.totalTournaments} {t.tournaments}
            </span>
            <span>
              {summary.regionCount} {t.regions}
            </span>
          </div>
        )}
      </motion.div>

      {/* 四列布局 */}
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 赛区列 */}
          <div className="bg-white/5 rounded-xl p-4">
            <h2 className="text-lg font-bold mb-4 text-blue-400">{t.regions}</h2>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {regions.map((region) => (
                <button
                  key={region.code}
                  onClick={() => handleSelectRegion(region)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedRegion?.code === region.code
                      ? 'bg-blue-500/30 border border-blue-500/50'
                      : 'bg-white/5 hover:bg-white/10 border border-transparent'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{region.name}</span>
                    <span className="text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded">
                      {region.matchCount} {t.matchCount}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {region.tournamentCount} {t.tournaments} · {region.teamCount} {t.teams} · {region.playerCount} {t.players}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 联赛列 */}
          <div className="bg-white/5 rounded-xl p-4">
            <h2 className="text-lg font-bold mb-4 text-purple-400">{t.tournaments}</h2>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {loadingTournaments ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-purple-400 mx-auto"></div>
                </div>
              ) : tournaments.length > 0 ? (
                tournaments.map((tournament) => (
                  <div
                    key={tournament.id}
                    className={`p-3 rounded-lg transition-colors ${
                      selectedTournament?.id === tournament.id
                        ? 'bg-purple-500/30 border border-purple-500/50'
                        : 'bg-white/5 hover:bg-white/10 border border-transparent'
                    }`}
                  >
                    <button
                      onClick={() => handleSelectTournament(tournament)}
                      className="w-full text-left"
                    >
                      <div className="font-medium text-sm">{tournament.name}</div>
                      <div className="text-xs text-gray-400 mt-1 flex flex-wrap gap-1">
                        <span>{tournament.teamCount} {t.teams}</span>
                        {tournament.startDate && <span>· {tournament.startDate}</span>}
                        {tournamentSeriesCounts[tournament.id] !== undefined && (
                          <span className="text-purple-400">· {tournamentSeriesCounts[tournament.id]} {t.matchCount}</span>
                        )}
                      </div>
                    </button>
                    {/* 查看赛事按钮 */}
                    <button
                      onClick={(e) => handleViewSeries(tournament, e)}
                      className="mt-2 w-full text-xs bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 py-1.5 px-2 rounded transition-colors flex items-center justify-center gap-1"
                    >
                      <span>📋</span>
                      <span>{t.viewSeries}</span>
                      {tournamentSeriesCounts[tournament.id] !== undefined && (
                        <span className="bg-purple-500/30 px-1.5 rounded">{tournamentSeriesCounts[tournament.id]}</span>
                      )}
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500 text-sm">
                  {selectedRegion ? t.noData : t.selectRegion}
                </div>
              )}
            </div>
          </div>

          {/* 战队列 */}
          <div className="bg-white/5 rounded-xl p-4">
            <h2 className="text-lg font-bold mb-4 text-pink-400">{t.teams}</h2>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {loadingTeams ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-pink-400 mx-auto"></div>
                </div>
              ) : teams.length > 0 ? (
                teams.map((team) => (
                  <button
                    key={team.id}
                    onClick={() => handleSelectTeam(team)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedTeam?.id === team.id
                        ? 'bg-pink-500/30 border border-pink-500/50'
                        : 'bg-white/5 hover:bg-white/10 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {team.logoUrl && !team.logoUrl.includes('generic') ? (
                        <img
                          src={team.logoUrl}
                          alt={team.name}
                          className="w-6 h-6 rounded object-contain bg-white/10"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded bg-pink-500/20 flex items-center justify-center text-xs">
                          🏆
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{team.name}</div>
                        {team.nameShortened && (
                          <div className="text-xs text-gray-400">{team.nameShortened}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {team.playerCount} {t.players}
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500 text-sm">
                  {selectedTournament ? t.noData : t.selectTournament}
                </div>
              )}
            </div>
          </div>

          {/* 选手列 */}
          <div className="bg-white/5 rounded-xl p-4">
            <h2 className="text-lg font-bold mb-4 text-green-400">{t.players}</h2>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {loadingPlayers ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-green-400 mx-auto"></div>
                </div>
              ) : players.length > 0 ? (
                <>
                  {/* 战队信息 */}
                  {selectedTeam && (
                    <div className="bg-white/5 rounded-lg p-3 mb-4">
                      <div className="flex items-center gap-3">
                        {selectedTeam.logoUrl && !selectedTeam.logoUrl.includes('generic') ? (
                          <img
                            src={selectedTeam.logoUrl}
                            alt={selectedTeam.name}
                            className="w-10 h-10 rounded object-contain bg-white/10"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded bg-pink-500/20 flex items-center justify-center text-xl">
                            🏆
                          </div>
                        )}
                        <div>
                          <div className="font-bold">{selectedTeam.name}</div>
                          {selectedTeam.organization && (
                            <div className="text-xs text-gray-400">
                              {selectedTeam.organization.name}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 选手列表 */}
                  {players.map((player) => (
                    <div
                      key={player.id}
                      className="bg-white/5 rounded-lg p-3 flex items-center gap-3 justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-sm">
                          👤
                        </div>
                        <div className="font-medium">{player.nickname}</div>
                      </div>
                      <button
                        onClick={(e) => handleViewPlayerSeries(player, e)}
                        className="text-xs px-2 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded transition-colors"
                      >
                        {t.playerMatches}
                      </button>
                    </div>
                  ))}
                </>
              ) : (
                <div className="text-center py-8 text-gray-500 text-sm">
                  {selectedTeam ? t.noData : t.selectTeam}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 面包屑导航 */}
      <AnimatePresence>
        {(selectedRegion || selectedTournament || selectedTeam) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-sm rounded-full px-6 py-3 flex items-center gap-2 text-sm"
          >
            {selectedRegion && (
              <>
                <span className="text-blue-400">{selectedRegion.name}</span>
                {selectedTournament && (
                  <>
                    <span className="text-gray-500">→</span>
                    <span className="text-purple-400 max-w-[150px] truncate">
                      {selectedTournament.nameShortened || selectedTournament.name}
                    </span>
                  </>
                )}
                {selectedTeam && (
                  <>
                    <span className="text-gray-500">→</span>
                    <span className="text-pink-400">{selectedTeam.name}</span>
                  </>
                )}
              </>
            )}
            <button
              onClick={() => {
                setSelectedRegion(null);
                setSelectedTournament(null);
                setSelectedTeam(null);
                setTournaments([]);
                setTeams([]);
                setPlayers([]);
              }}
              className="ml-2 text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 赛事弹窗 */}
      <AnimatePresence>
        {showSeriesModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowSeriesModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-900 rounded-xl max-w-3xl w-full max-h-[85vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 弹窗头部 */}
              <div className="p-4 border-b border-white/10 flex justify-between items-center sticky top-0 bg-gray-900 z-10">
                <div>
                  <h3 className="font-bold text-lg text-purple-400">
                    {seriesTournament?.name || t.series}
                  </h3>
                  <p className="text-sm text-gray-400">
                    {seriesTotal} {t.seriesCount}
                  </p>
                </div>
                <button
                  onClick={() => setShowSeriesModal(false)}
                  className="text-gray-400 hover:text-white text-xl p-2"
                >
                  ✕
                </button>
              </div>

              {/* 赛事列表 */}
              <div className="p-4 overflow-y-auto max-h-[calc(85vh-80px)]">
                {loadingSeries ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-400 mx-auto mb-4"></div>
                    <p className="text-gray-400">{t.loading}</p>
                  </div>
                ) : seriesData.length > 0 ? (
                  <div className="space-y-3">
                    {seriesData.map((series) => (
                      <SeriesDetail
                        key={series.id}
                        series={series}
                        language={language}
                        t={t}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-400">
                    {t.noSeries}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 选手赛事弹窗 */}
      <AnimatePresence>
        {showPlayerSeriesModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowPlayerSeriesModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-900 rounded-xl max-w-3xl w-full max-h-[85vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 弹窗头部 */}
              <div className="p-4 border-b border-white/10 flex justify-between items-center sticky top-0 bg-gray-900 z-10">
                <div>
                  <h3 className="font-bold text-lg text-green-400">
                    {seriesPlayer?.nickname} - {t.playerMatches}
                  </h3>
                  <p className="text-sm text-gray-400">
                    {playerSeriesTotal} {t.seriesCount}
                  </p>
                </div>
                <button
                  onClick={() => setShowPlayerSeriesModal(false)}
                  className="text-gray-400 hover:text-white text-xl p-2"
                >
                  ✕
                </button>
              </div>

              {/* 赛事列表 */}
              <div className="p-4 overflow-y-auto max-h-[calc(85vh-80px)]">
                {loadingPlayerSeries ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-400 mx-auto mb-4"></div>
                    <p className="text-gray-400">{t.loading}</p>
                  </div>
                ) : playerSeriesData.length > 0 ? (
                  <div className="space-y-3">
                    {playerSeriesData.map((series) => (
                      <SeriesDetail
                        key={series.id}
                        series={series}
                        language={language}
                        t={t}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-400">
                    {t.noSeries}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
