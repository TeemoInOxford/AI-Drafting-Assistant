'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Language, SeriesFormat, SeriesState, GameRecord, Champion, HistorySelectMode } from '../lib/types';

interface SeriesSetupProps {
  language: Language;
  seriesState: SeriesState;
  onSeriesStateChange: (state: SeriesState) => void;
  fearlessMode: boolean;
  onFearlessModeChange: (enabled: boolean) => void;
  historySelectMode: HistorySelectMode;
  onHistorySelectModeChange: (mode: HistorySelectMode) => void;
  onSave: () => void;
  onLoad: () => void;
  onReset: () => void;
  champions: Champion[];
}

export default function SeriesSetup({
  language,
  seriesState,
  onSeriesStateChange,
  fearlessMode,
  onFearlessModeChange,
  historySelectMode,
  onHistorySelectModeChange,
  onSave,
  onLoad,
  onReset,
  champions,
}: SeriesSetupProps) {
  const formats: SeriesFormat[] = ['bo3', 'bo5'];

  const formatLabels: Record<SeriesFormat, { zh: string; en: string }> = {
    bo1: { zh: 'BO1', en: 'BO1' },
    bo3: { zh: 'BO3', en: 'BO3' },
    bo5: { zh: 'BO5', en: 'BO5' },
  };

  const getMaxGames = (format: SeriesFormat) => {
    switch (format) {
      case 'bo1': return 1;
      case 'bo3': return 3;
      case 'bo5': return 5;
    }
  };

  const handleFormatChange = (format: SeriesFormat) => {
    onSeriesStateChange({
      ...seriesState,
      format,
      currentGame: 1,
      gameRecords: [],
      fearlessPool: new Set(),
    });
  };

  const handleGameChange = (game: number) => {
    onSeriesStateChange({
      ...seriesState,
      currentGame: game,
    });
  };

  const getChampionName = (championId: string) => {
    const champ = champions.find(c => c.id === championId);
    if (!champ) return championId;
    return language === 'zh' ? champ.zhName : champ.enName;
  };

  const getChampionImage = (championId: string) => {
    const champ = champions.find(c => c.id === championId);
    return champ?.image || '';
  };

  // 删除历史记录中的英雄
  const removeFromHistory = (gameIndex: number, team: 'blue' | 'red', championId: string) => {
    const newRecords = [...seriesState.gameRecords];
    const record = newRecords[gameIndex];
    if (record) {
      if (team === 'blue') {
        record.bluePicks = record.bluePicks.filter(id => id !== championId);
      } else {
        record.redPicks = record.redPicks.filter(id => id !== championId);
      }

      // 更新 fearlessPool
      const newPool = new Set<string>();
      newRecords.forEach(r => {
        r.bluePicks.forEach(id => newPool.add(id));
        r.redPicks.forEach(id => newPool.add(id));
      });

      onSeriesStateChange({
        ...seriesState,
        gameRecords: newRecords,
        fearlessPool: newPool,
      });
    }
  };

  const maxGames = getMaxGames(seriesState.format);

  return (
    <div className="bg-gradient-to-br from-amber-900/30 to-orange-900/30 rounded-xl p-3 sm:p-4 border border-amber-500/30 mb-4">
      {/* 标题和开关 */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">🏆</span>
          <h3 className="text-white font-bold text-sm sm:text-base">
            {language === 'zh' ? '无畏征召 (BO3/BO5)' : 'Fearless Draft (BO3/BO5)'}
          </h3>
        </div>

        {/* 开关 */}
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs sm:text-sm text-gray-400">
            {fearlessMode
              ? (language === 'zh' ? '已启用' : 'Enabled')
              : (language === 'zh' ? '已关闭' : 'Disabled')}
          </span>
          <div
            className={`w-10 h-5 rounded-full transition-colors ${fearlessMode ? 'bg-amber-500' : 'bg-gray-600'}`}
            onClick={() => onFearlessModeChange(!fearlessMode)}
          >
            <motion.div
              className="w-4 h-4 bg-white rounded-full mt-0.5"
              animate={{ marginLeft: fearlessMode ? '22px' : '2px' }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </div>
        </label>
      </div>

      <AnimatePresence>
        {fearlessMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3"
          >
            {/* 赛制选择 */}
            <div>
              <p className="text-xs text-gray-400 mb-2">
                {language === 'zh' ? '赛制' : 'Format'}
              </p>
              <div className="flex gap-2">
                {formats.map((format) => (
                  <motion.button
                    key={format}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleFormatChange(format)}
                    className={`
                      px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all
                      ${seriesState.format === format
                        ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30'
                        : 'bg-white/10 text-gray-300 hover:bg-white/20'}
                    `}
                  >
                    {formatLabels[format][language]}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* 当前局数选择 */}
            <div>
                <p className="text-xs text-gray-400 mb-2">
                  {language === 'zh' ? '当前局数' : 'Current Game'}
                </p>
                <div className="flex gap-2">
                  {Array.from({ length: maxGames }, (_, i) => i + 1).map((game) => (
                    <motion.button
                      key={game}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleGameChange(game)}
                      className={`
                        w-8 h-8 sm:w-10 sm:h-10 rounded-lg text-xs sm:text-sm font-bold transition-all
                        ${seriesState.currentGame === game
                          ? 'bg-amber-500 text-white'
                          : game <= seriesState.gameRecords.length
                            ? 'bg-green-500/30 text-green-300 border border-green-500/50'
                            : 'bg-white/10 text-gray-400 hover:bg-white/20'}
                      `}
                    >
                      {game}
                    </motion.button>
                  ))}
                </div>
            </div>

            {/* 历史记录显示 */}
            {seriesState.gameRecords.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-400">
                  {language === 'zh' ? '已完成局数' : 'Completed Games'}
                </p>
                {seriesState.gameRecords.map((record, idx) => (
                  <div key={idx} className="bg-black/20 rounded-lg p-2 sm:p-3">
                    <p className="text-xs text-gray-300 mb-2">
                      {language === 'zh' ? `第${record.gameNumber}局` : `Game ${record.gameNumber}`}
                    </p>

                    {/* 蓝方 */}
                    <div className="flex items-center gap-1 mb-1.5">
                      <span className="text-[10px] sm:text-xs text-blue-400 w-8 sm:w-10">
                        {language === 'zh' ? '蓝方' : 'Blue'}
                      </span>
                      <div className="flex gap-1 flex-wrap">
                        {record.bluePicks.map((champId) => (
                          <div
                            key={champId}
                            className="relative group"
                            onClick={() => removeFromHistory(idx, 'blue', champId)}
                          >
                            {getChampionImage(champId) ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={getChampionImage(champId)}
                                alt={getChampionName(champId)}
                                className="w-6 h-6 sm:w-8 sm:h-8 rounded border border-blue-500/50 cursor-pointer hover:opacity-70"
                                title={getChampionName(champId)}
                              />
                            ) : (
                              <span className="text-[10px] bg-blue-500/20 px-1 rounded">
                                {getChampionName(champId)}
                              </span>
                            )}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded cursor-pointer">
                              <span className="text-red-400 text-xs">✕</span>
                            </div>
                          </div>
                        ))}
                        {record.bluePicks.length === 0 && (
                          <span className="text-[10px] text-gray-500">-</span>
                        )}
                      </div>
                    </div>

                    {/* 红方 */}
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] sm:text-xs text-red-400 w-8 sm:w-10">
                        {language === 'zh' ? '红方' : 'Red'}
                      </span>
                      <div className="flex gap-1 flex-wrap">
                        {record.redPicks.map((champId) => (
                          <div
                            key={champId}
                            className="relative group"
                            onClick={() => removeFromHistory(idx, 'red', champId)}
                          >
                            {getChampionImage(champId) ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={getChampionImage(champId)}
                                alt={getChampionName(champId)}
                                className="w-6 h-6 sm:w-8 sm:h-8 rounded border border-red-500/50 cursor-pointer hover:opacity-70"
                                title={getChampionName(champId)}
                              />
                            ) : (
                              <span className="text-[10px] bg-red-500/20 px-1 rounded">
                                {getChampionName(champId)}
                              </span>
                            )}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded cursor-pointer">
                              <span className="text-red-400 text-xs">✕</span>
                            </div>
                          </div>
                        ))}
                        {record.redPicks.length === 0 && (
                          <span className="text-[10px] text-gray-500">-</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 添加历史英雄按钮 */}
            {seriesState.currentGame > 1 && (
              <div>
                <p className="text-xs text-gray-400 mb-2">
                  {language === 'zh' ? '添加之前局数的英雄' : 'Add champions from previous games'}
                </p>
                <div className="flex gap-2 flex-wrap">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onHistorySelectModeChange(historySelectMode === 'blue' ? 'off' : 'blue')}
                    className={`
                      px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1
                      ${historySelectMode === 'blue'
                        ? 'bg-blue-500 text-white ring-2 ring-blue-300'
                        : 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'}
                    `}
                  >
                    <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                    {language === 'zh' ? '选蓝方' : 'Pick Blue'}
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onHistorySelectModeChange(historySelectMode === 'red' ? 'off' : 'red')}
                    className={`
                      px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1
                      ${historySelectMode === 'red'
                        ? 'bg-red-500 text-white ring-2 ring-red-300'
                        : 'bg-red-500/20 text-red-300 hover:bg-red-500/30'}
                    `}
                  >
                    <span className="w-2 h-2 rounded-full bg-red-400"></span>
                    {language === 'zh' ? '选红方' : 'Pick Red'}
                  </motion.button>
                </div>
                {historySelectMode !== 'off' && (
                  <p className="text-[10px] sm:text-xs text-amber-300 mt-2">
                    {language === 'zh'
                      ? `点击下方英雄添加到${historySelectMode === 'blue' ? '蓝方' : '红方'}历史记录`
                      : `Click champions below to add to ${historySelectMode === 'blue' ? 'Blue' : 'Red'} history`}
                  </p>
                )}
              </div>
            )}

            {/* 禁用英雄池统计 */}
            {seriesState.fearlessPool.size > 0 && (
              <div className="bg-red-900/20 rounded-lg p-2 border border-red-500/30">
                <p className="text-xs text-red-300">
                  {language === 'zh'
                    ? `🚫 已禁用 ${seriesState.fearlessPool.size} 个英雄`
                    : `🚫 ${seriesState.fearlessPool.size} champions disabled`}
                </p>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-2 flex-wrap pt-2 border-t border-white/10">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onSave}
                className="px-3 py-1.5 bg-green-500/20 text-green-300 rounded-lg text-xs sm:text-sm hover:bg-green-500/30 transition-all"
              >
                💾 {language === 'zh' ? '保存进度' : 'Save'}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onLoad}
                className="px-3 py-1.5 bg-blue-500/20 text-blue-300 rounded-lg text-xs sm:text-sm hover:bg-blue-500/30 transition-all"
              >
                📂 {language === 'zh' ? '加载进度' : 'Load'}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onReset}
                className="px-3 py-1.5 bg-red-500/20 text-red-300 rounded-lg text-xs sm:text-sm hover:bg-red-500/30 transition-all"
              >
                🗑️ {language === 'zh' ? '重置系列' : 'Reset'}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
