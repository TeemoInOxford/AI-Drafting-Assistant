'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Champion, Language, BPState, Position } from './lib/types';
import {
  createInitialState,
  selectChampion,
  undoLastAction,
  getCurrentStep,
  getPhaseDescription,
  isBPComplete
} from './lib/bp-logic';
import { getLatestVersion, getChampions } from './lib/champion-api';
import ChampionGrid from './components/ChampionGrid';
import BPPanel from './components/BPPanel';
import PhaseIndicator from './components/PhaseIndicator';
import ControlBar from './components/ControlBar';
import LanguageToggle from './components/LanguageToggle';
import PositionFilter from './components/PositionFilter';

export default function LOLBPPage() {
  const [language, setLanguage] = useState<Language>('zh');
  const [champions, setChampions] = useState<Champion[]>([]);
  const [bpState, setBpState] = useState<BPState>(createInitialState());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [version, setVersion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);

  // 加载英雄数据
  useEffect(() => {
    async function loadChampions() {
      setLoading(true);
      setError(null);
      try {
        const ver = await getLatestVersion();
        setVersion(ver);
        const data = await getChampions(ver);
        // 按名称排序（根据当前语言）
        setChampions(data.sort((a, b) => {
          const nameA = language === 'zh' ? a.zhName : a.enName;
          const nameB = language === 'zh' ? b.zhName : b.enName;
          return nameA.localeCompare(nameB);
        }));
      } catch (err) {
        console.error('Failed to load champions:', err);
        setError(language === 'zh' ? '加载英雄数据失败，请刷新重试' : 'Failed to load champions, please refresh');
      }
      setLoading(false);
    }
    loadChampions();
  }, []);

  // 语言切换时重新排序
  useEffect(() => {
    if (champions.length > 0) {
      setChampions(prev => [...prev].sort((a, b) => {
        const nameA = language === 'zh' ? a.zhName : a.enName;
        const nameB = language === 'zh' ? b.zhName : b.enName;
        return nameA.localeCompare(nameB);
      }));
    }
  }, [language]);

  // 过滤英雄（搜索 + 位置）
  const filteredChampions = useMemo(() => {
    let result = champions;

    // 位置过滤
    if (selectedPosition) {
      result = result.filter(c => c.positions.includes(selectedPosition));
    }

    // 搜索过滤
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(c =>
        c.enName.toLowerCase().includes(term) ||
        c.zhName.toLowerCase().includes(term) ||
        c.id.toLowerCase().includes(term)
      );
    }

    return result;
  }, [champions, searchTerm, selectedPosition]);

  // 处理英雄选择
  const handleChampionSelect = (champion: Champion) => {
    if (bpState.usedChampions.has(champion.id)) return;
    if (isBPComplete(bpState)) return;
    setBpState(selectChampion(bpState, champion));
  };

  // 处理撤销
  const handleUndo = () => {
    setBpState(undoLastAction(bpState));
  };

  // 处理重置
  const handleReset = () => {
    setBpState(createInitialState());
  };

  const currentStep = getCurrentStep(bpState);
  const phaseDesc = getPhaseDescription(bpState.currentStep, language);

  return (
    <div className="min-h-screen text-white">
      {/* 语言切换 */}
      <LanguageToggle
        language={language}
        onToggle={() => setLanguage(l => l === 'zh' ? 'en' : 'zh')}
      />

      {/* 标题 */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center pt-6 pb-4"
      >
        <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          {language === 'zh' ? 'LOL Ban/Pick 工具' : 'LOL Ban/Pick Tool'}
        </h1>
        <p className="text-gray-400 mt-2 text-sm">
          {language === 'zh' ? '正规比赛BP规则 · Tournament Rules' : 'Tournament BP Rules'}
          {version && <span className="ml-2 text-gray-500">v{version}</span>}
        </p>
      </motion.div>

      {/* 阶段指示器 */}
      <PhaseIndicator
        phase={phaseDesc}
        currentStep={currentStep}
        language={language}
      />

      {/* BP面板 */}
      <BPPanel
        bpState={bpState}
        currentStep={currentStep}
        language={language}
      />

      {/* 控制栏 */}
      <ControlBar
        onUndo={handleUndo}
        onReset={handleReset}
        canUndo={bpState.history.length > 0}
        isComplete={isBPComplete(bpState)}
        language={language}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
      />

      {/* 位置过滤 */}
      <PositionFilter
        selectedPosition={selectedPosition}
        onSelect={setSelectedPosition}
        language={language}
      />

      {/* 英雄网格 */}
      {loading ? (
        <div className="flex flex-col justify-center items-center h-64 gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-400"></div>
          <p className="text-gray-400">
            {language === 'zh' ? '加载英雄数据中...' : 'Loading champions...'}
          </p>
        </div>
      ) : error ? (
        <div className="flex flex-col justify-center items-center h-64 gap-4">
          <p className="text-red-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 rounded-lg"
          >
            {language === 'zh' ? '刷新页面' : 'Refresh'}
          </button>
        </div>
      ) : (
        <ChampionGrid
          champions={filteredChampions}
          usedChampions={bpState.usedChampions}
          onSelect={handleChampionSelect}
          disabled={isBPComplete(bpState)}
          language={language}
        />
      )}

      {/* 英雄数量统计 */}
      {!loading && !error && (
        <div className="text-center pb-8 text-gray-500 text-sm">
          {language === 'zh'
            ? `共 ${champions.length} 位英雄${(searchTerm || selectedPosition) ? `，显示 ${filteredChampions.length} 位` : ''}`
            : `${champions.length} champions${(searchTerm || selectedPosition) ? `, showing ${filteredChampions.length}` : ''}`}
        </div>
      )}
    </div>
  );
}
