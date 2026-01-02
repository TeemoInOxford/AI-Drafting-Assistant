'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Champion, Language, BPState, Position, AIControlMode, AIRecommendation, AIAnalysis, SeriesState, HistorySelectMode } from './lib/types';
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
import AIControlPanel from './components/AIControlPanel';
import AIAnalysisPanel from './components/AIAnalysisPanel';
import SeriesSetup from './components/SeriesSetup';
import { generateAIAnalysis } from './lib/ai-analysis';

export default function LOLBPPage() {
  const [language, setLanguage] = useState<Language>('zh');
  const [champions, setChampions] = useState<Champion[]>([]);
  const [bpState, setBpState] = useState<BPState>(createInitialState());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [version, setVersion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);

  // AI 模式状态
  const [aiMode, setAiMode] = useState<AIControlMode>('off');
  const [aiThinking, setAiThinking] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState<AIRecommendation | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [autoPlay, setAutoPlay] = useState(true);
  const aiTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 无畏征召 (Fearless Draft) 状态
  const [fearlessMode, setFearlessMode] = useState(false);
  const [seriesState, setSeriesState] = useState<SeriesState>({
    format: 'bo3',
    currentGame: 1,
    gameRecords: [],
    fearlessPool: new Set(),
  });
  const [historySelectMode, setHistorySelectMode] = useState<HistorySelectMode>('off');

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

  // 合并当局usedChampions和无畏征召池
  const allUsedChampions = useMemo(() => {
    const combined = new Set(bpState.usedChampions);
    if (fearlessMode) {
      seriesState.fearlessPool.forEach(id => combined.add(id));
    }
    return combined;
  }, [bpState.usedChampions, fearlessMode, seriesState.fearlessPool]);

  // 获取当前步骤信息
  const currentStep = getCurrentStep(bpState);
  const phaseDesc = getPhaseDescription(bpState.currentStep, language);

  // 获取当前回合的队伍
  const currentTeam = currentStep?.team || 'blue';

  // 判断是否是AI的回合
  const isAITurn = useMemo(() => {
    if (aiMode === 'off') return false;
    if (aiMode === 'both') return true;
    if (aiMode === 'blue' && currentTeam === 'blue') return true;
    if (aiMode === 'red' && currentTeam === 'red') return true;
    return false;
  }, [aiMode, currentTeam]);

  // AI 随机选择（占位，后续优化为真正AI）
  const getRandomChampion = useCallback(() => {
    const available = champions.filter(c => !allUsedChampions.has(c.id));
    if (available.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * available.length);
    return available[randomIndex];
  }, [champions, allUsedChampions]);

  // AI 分析生成（当BP状态变化或AI模式开启时）
  useEffect(() => {
    if (aiMode === 'off' || loading || champions.length === 0 || isBPComplete(bpState)) {
      setAiAnalysis(null);
      return;
    }

    // 生成AI分析
    if (currentStep) {
      const analysis = generateAIAnalysis(
        bpState,
        champions,
        currentStep.action,
        currentStep.team,
        language
      );
      setAiAnalysis(analysis);
    }
  }, [aiMode, bpState.currentStep, champions.length, loading, language]);

  // AI 自动操作逻辑
  useEffect(() => {
    if (aiTimeoutRef.current) {
      clearTimeout(aiTimeoutRef.current);
      aiTimeoutRef.current = null;
    }

    if (!isAITurn || isBPComplete(bpState) || loading || champions.length === 0) {
      setAiThinking(false);
      setAiRecommendation(null);
      return;
    }

    setAiThinking(true);
    setAiRecommendation(null);

    // 模拟思考延迟 0.8-2秒
    const thinkingDelay = 800 + Math.random() * 1200;

    aiTimeoutRef.current = setTimeout(() => {
      const champion = getRandomChampion();

      if (champion && aiAnalysis && aiAnalysis.recommendations.length > 0) {
        // 使用分析中的第一个推荐
        const topRec = aiAnalysis.recommendations[0];
        const matchedChamp = champions.find(
          c => c.enName === topRec.champion || c.zhName === topRec.champion
        ) || champion;

        setAiRecommendation(topRec);
        setAiThinking(false);

        if (autoPlay) {
          aiTimeoutRef.current = setTimeout(() => {
            setBpState(prev => selectChampion(prev, matchedChamp));
          }, 500);
        }
      } else if (champion) {
        const recommendation: AIRecommendation = {
          champion: language === 'zh' ? champion.zhName : champion.enName,
          score: Math.floor(Math.random() * 30) + 70,
          reason: language === 'zh' ? 'AI随机选择（占位）' : 'AI random selection (placeholder)',
          winRate: Math.floor(Math.random() * 20) + 45
        };

        setAiRecommendation(recommendation);
        setAiThinking(false);

        if (autoPlay) {
          aiTimeoutRef.current = setTimeout(() => {
            setBpState(prev => selectChampion(prev, champion));
          }, 500);
        }
      } else {
        setAiThinking(false);
      }
    }, thinkingDelay);

    return () => {
      if (aiTimeoutRef.current) {
        clearTimeout(aiTimeoutRef.current);
      }
    };
  }, [isAITurn, bpState.currentStep, loading, champions.length, autoPlay, getRandomChampion, aiAnalysis, language]);

  // 处理AI模式切换
  const handleAIModeChange = (mode: AIControlMode) => {
    setAiMode(mode);
    setAiThinking(false);
    setAiRecommendation(null);
    // 如果开启AI，立即生成分析
    if (mode !== 'off' && currentStep && champions.length > 0) {
      const analysis = generateAIAnalysis(bpState, champions, currentStep.action, currentStep.team, language);
      setAiAnalysis(analysis);
    } else {
      setAiAnalysis(null);
    }
  };

  // 处理英雄选择
  const handleChampionSelect = (champion: Champion) => {
    // 如果在历史选择模式，添加到历史记录
    if (historySelectMode !== 'off') {
      handleAddToHistory(champion);
      return;
    }

    // 正常BP模式
    if (allUsedChampions.has(champion.id)) return;
    if (isBPComplete(bpState)) return;
    setBpState(selectChampion(bpState, champion));
  };

  // 处理撤销
  const handleUndo = () => {
    setBpState(undoLastAction(bpState));
  };

  // 处理重置（同时重置AI状态）
  const handleReset = () => {
    setBpState(createInitialState());
    setAiThinking(false);
    setAiRecommendation(null);
    setAiAnalysis(null);
  };

  // 无畏征召：保存进度到localStorage
  const handleSaveSeries = () => {
    const data = {
      format: seriesState.format,
      currentGame: seriesState.currentGame,
      gameRecords: seriesState.gameRecords,
      fearlessPool: Array.from(seriesState.fearlessPool),
    };
    localStorage.setItem('lol-fearless-series', JSON.stringify(data));
    alert(language === 'zh' ? '进度已保存！' : 'Progress saved!');
  };

  // 无畏征召：从localStorage加载进度
  const handleLoadSeries = () => {
    const saved = localStorage.getItem('lol-fearless-series');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setSeriesState({
          format: data.format,
          currentGame: data.currentGame,
          gameRecords: data.gameRecords,
          fearlessPool: new Set(data.fearlessPool),
        });
        setFearlessMode(true);
        alert(language === 'zh' ? '进度已加载！' : 'Progress loaded!');
      } catch {
        alert(language === 'zh' ? '加载失败，数据格式错误' : 'Load failed, invalid data');
      }
    } else {
      alert(language === 'zh' ? '没有保存的进度' : 'No saved progress');
    }
  };

  // 无畏征召：重置系列赛
  const handleResetSeries = () => {
    if (confirm(language === 'zh' ? '确定要重置整个系列赛吗？' : 'Reset the entire series?')) {
      setSeriesState({
        format: seriesState.format,
        currentGame: 1,
        gameRecords: [],
        fearlessPool: new Set(),
      });
      setBpState(createInitialState());
      setHistorySelectMode('off');
    }
  };

  // 无畏征召：添加英雄到历史记录
  const handleAddToHistory = (champion: Champion) => {
    if (historySelectMode === 'off') return;

    const targetGame = seriesState.currentGame - 1; // 添加到"之前"的局
    if (targetGame < 1) return;

    // 检查是否已在池中
    if (seriesState.fearlessPool.has(champion.id)) return;

    const existingRecord = seriesState.gameRecords.find(r => r.gameNumber === targetGame);
    const newRecords = [...seriesState.gameRecords];

    if (existingRecord) {
      const recordIndex = newRecords.findIndex(r => r.gameNumber === targetGame);
      if (historySelectMode === 'blue') {
        if (existingRecord.bluePicks.length >= 5) return; // 每队最多5个
        newRecords[recordIndex] = {
          ...existingRecord,
          bluePicks: [...existingRecord.bluePicks, champion.id],
        };
      } else {
        if (existingRecord.redPicks.length >= 5) return;
        newRecords[recordIndex] = {
          ...existingRecord,
          redPicks: [...existingRecord.redPicks, champion.id],
        };
      }
    } else {
      // 创建新记录
      newRecords.push({
        gameNumber: targetGame,
        bluePicks: historySelectMode === 'blue' ? [champion.id] : [],
        redPicks: historySelectMode === 'red' ? [champion.id] : [],
      });
      // 按局数排序
      newRecords.sort((a, b) => a.gameNumber - b.gameNumber);
    }

    // 更新fearlessPool
    const newPool = new Set<string>();
    newRecords.forEach(r => {
      r.bluePicks.forEach(id => newPool.add(id));
      r.redPicks.forEach(id => newPool.add(id));
    });

    setSeriesState({
      ...seriesState,
      gameRecords: newRecords,
      fearlessPool: newPool,
    });
  };

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
        className="text-center pt-4 sm:pt-6 pb-3 sm:pb-4 px-4"
      >
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          {language === 'zh' ? 'LOL Ban/Pick 工具' : 'LOL Ban/Pick Tool'}
        </h1>
        <p className="text-gray-400 mt-1.5 sm:mt-2 text-xs sm:text-sm">
          {language === 'zh' ? '正规比赛BP规则' : 'Tournament BP Rules'}
          {version && <span className="ml-2 text-gray-500">v{version}</span>}
        </p>
      </motion.div>

      {/* 无畏征召设置 */}
      <div className="max-w-2xl mx-auto px-4">
        <SeriesSetup
          language={language}
          seriesState={seriesState}
          onSeriesStateChange={setSeriesState}
          fearlessMode={fearlessMode}
          onFearlessModeChange={setFearlessMode}
          historySelectMode={historySelectMode}
          onHistorySelectModeChange={setHistorySelectMode}
          onSave={handleSaveSeries}
          onLoad={handleLoadSeries}
          onReset={handleResetSeries}
          champions={champions}
        />
      </div>

      {/* AI 控制面板 */}
      <div className="max-w-2xl mx-auto px-4">
        <AIControlPanel
          language={language}
          aiMode={aiMode}
          onModeChange={handleAIModeChange}
          isThinking={aiThinking}
          currentTeam={currentTeam}
          recommendation={aiRecommendation}
          autoPlay={autoPlay}
          onAutoPlayChange={setAutoPlay}
        />
      </div>

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

      {/* AI 分析面板 */}
      {aiMode !== 'off' && (
        <div className="max-w-4xl mx-auto px-4 my-4">
          <AIAnalysisPanel
            language={language}
            analysis={aiAnalysis}
            isThinking={aiThinking}
            currentTeam={currentTeam}
            currentAction={currentStep?.action || 'ban'}
            isAIEnabled={true}
          />
        </div>
      )}

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
          usedChampions={allUsedChampions}
          onSelect={handleChampionSelect}
          disabled={isBPComplete(bpState) && historySelectMode === 'off'}
          language={language}
          fearlessPool={fearlessMode ? seriesState.fearlessPool : undefined}
          historySelectMode={historySelectMode}
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
