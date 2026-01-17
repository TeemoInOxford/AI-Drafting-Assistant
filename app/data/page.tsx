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

interface Summary {
  generated_at: string;
  total_players: number;
  total_teams: number;
  total_tournaments: number;
  regions: Region[];
}

// 翻译
const translations = {
  zh: {
    title: 'LOL 电竞数据',
    subtitle: '赛区 → 联赛 → 战队 → 选手',
    backToBP: '← BP 工具',
    loading: '加载中...',
    regions: '赛区',
    tournaments: '联赛',
    teams: '战队',
    players: '选手',
    selectRegion: '选择赛区查看联赛',
    selectTournament: '选择联赛查看战队',
    selectTeam: '选择战队查看选手',
    noData: '暂无数据',
    total: '共',
    updated: '更新于',
  },
  en: {
    title: 'LOL Esports Data',
    subtitle: 'Region → League → Team → Player',
    backToBP: '← BP Tool',
    loading: 'Loading...',
    regions: 'Regions',
    tournaments: 'Leagues',
    teams: 'Teams',
    players: 'Players',
    selectRegion: 'Select a region to view leagues',
    selectTournament: 'Select a league to view teams',
    selectTeam: 'Select a team to view players',
    noData: 'No data available',
    total: 'Total',
    updated: 'Updated',
  },
};

function getDefaultLanguage(): Language {
  if (typeof window === 'undefined') return 'zh';
  const browserLang = navigator.language || '';
  return browserLang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export default function DataPage() {
  const [language, setLanguage] = useState<Language>('zh');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);

  // 选中状态
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

  // 数据
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);

  // 加载状态
  const [loadingTournaments, setLoadingTournaments] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingPlayers, setLoadingPlayers] = useState(false);

  const t = translations[language];

  // 初始化语言
  useEffect(() => {
    setLanguage(getDefaultLanguage());
  }, []);

  // 加载摘要数据
  useEffect(() => {
    fetch('/api/lol/hierarchy?type=summary')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setSummary(data);
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
              {t.total} {summary.total_players.toLocaleString()} {t.players}
            </span>
            <span>
              {summary.total_teams.toLocaleString()} {t.teams}
            </span>
            <span>
              {summary.total_tournaments} {t.tournaments}
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
              {summary?.regions.map((region) => (
                <button
                  key={region.code}
                  onClick={() => handleSelectRegion(region)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedRegion?.code === region.code
                      ? 'bg-blue-500/30 border border-blue-500/50'
                      : 'bg-white/5 hover:bg-white/10 border border-transparent'
                  }`}
                >
                  <div className="font-medium">{region.name}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {region.tournamentCount} {t.tournaments} · {region.teamCount} {t.teams}
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
                  <button
                    key={tournament.id}
                    onClick={() => handleSelectTournament(tournament)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedTournament?.id === tournament.id
                        ? 'bg-purple-500/30 border border-purple-500/50'
                        : 'bg-white/5 hover:bg-white/10 border border-transparent'
                    }`}
                  >
                    <div className="font-medium text-sm">{tournament.name}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {tournament.teamCount} {t.teams}
                      {tournament.startDate && ` · ${tournament.startDate}`}
                    </div>
                  </button>
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
                      className="bg-white/5 rounded-lg p-3 flex items-center gap-3"
                    >
                      <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-sm">
                        👤
                      </div>
                      <div className="font-medium">{player.nickname}</div>
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
    </div>
  );
}
