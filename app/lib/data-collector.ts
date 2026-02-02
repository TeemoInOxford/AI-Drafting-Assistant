/**
 * Draft Data Collector Service
 * 数据收集服务 - 收集和分析职业比赛数据
 */

import { MatchData, TeamMatchData, ChampionPickData } from './counter-relationship.types';
import { MatchHistory, OpponentProfile, buildOpponentProfile } from './opponent-profiling';
import { Champion } from './types';

/**
 * 数据收集配置
 */
export interface DataCollectionConfig {
  minMatches: number;          // 最小比赛数量
  maxAge: number;              // 最大数据年龄（天）
  autoUpdate: boolean;         // 是否自动更新
  updateInterval: number;      // 更新间隔（小时）
}

/**
 * Draft模式分析结果
 */
export interface DraftPatterns {
  popularBans: Map<string, number>;      // 热门Ban英雄
  popularPicks: Map<string, number>;     // 热门Pick英雄
  synergyPairs: Map<string, Map<string, number>>;  // 协同组合
  counterPairs: Map<string, Map<string, number>>;  // 克制关系
  systemCompositions: SystemComposition[];  // 体系组合
}

/**
 * 体系组合
 */
export interface SystemComposition {
  name: string;
  coreChampions: string[];
  synergyChampions: string[];
  winRate: number;
  pickRate: number;
  confidence: number;
}

/**
 * 数据收集服务类
 */
export class DraftDataCollector {
  private config: DataCollectionConfig;
  private matchCache: Map<string, MatchData>;
  private profileCache: Map<string, OpponentProfile>;
  private lastUpdate: Date;

  constructor(config?: Partial<DataCollectionConfig>) {
    this.config = {
      minMatches: 20,
      maxAge: 90,
      autoUpdate: true,
      updateInterval: 24,
      ...config,
    };

    this.matchCache = new Map();
    this.profileCache = new Map();
    this.lastUpdate = new Date(0);
  }

  /**
   * 从数据库收集比赛数据
   */
  async collectMatchData(matchId: string): Promise<MatchData | null> {
    // 检查缓存
    if (this.matchCache.has(matchId)) {
      return this.matchCache.get(matchId)!;
    }

    try {
      // TODO: 从实际数据库读取
      // 这里需要连接到 SQLite 数据库
      console.log(`[DataCollector] Collecting match data: ${matchId}`);

      // 示例：从数据库读取
      const matchData = await this.fetchMatchFromDatabase(matchId);

      if (matchData) {
        this.matchCache.set(matchId, matchData);
      }

      return matchData;
    } catch (error) {
      console.error(`[DataCollector] Failed to collect match ${matchId}:`, error);
      return null;
    }
  }

  /**
   * 批量收集比赛数据
   */
  async collectBatchMatches(matchIds: string[]): Promise<MatchData[]> {
    const results: MatchData[] = [];

    // 并行收集
    const promises = matchIds.map(id => this.collectMatchData(id));
    const matches = await Promise.all(promises);

    for (const match of matches) {
      if (match) {
        results.push(match);
      }
    }

    console.log(`[DataCollector] Collected ${results.length}/${matchIds.length} matches`);
    return results;
  }

  /**
   * 分析Draft模式
   */
  async analyzeDraftPatterns(matches?: MatchData[]): Promise<DraftPatterns> {
    // 如果没有提供比赛数据，从缓存获取
    const matchData = matches || Array.from(this.matchCache.values());

    if (matchData.length < this.config.minMatches) {
      console.warn(`[DataCollector] Insufficient matches: ${matchData.length} < ${this.config.minMatches}`);
    }

    console.log(`[DataCollector] Analyzing draft patterns from ${matchData.length} matches`);

    // 统计热门Ban
    const popularBans = this.analyzePopularBans(matchData);

    // 统计热门Pick
    const popularPicks = this.analyzePopularPicks(matchData);

    // 分析协同关系
    const synergyPairs = this.analyzeSynergyPairs(matchData);

    // 分析克制关系
    const counterPairs = this.analyzeCounterPairs(matchData);

    // 发现体系组合
    const systemCompositions = this.discoverSystemCompositions(matchData);

    return {
      popularBans,
      popularPicks,
      synergyPairs,
      counterPairs,
      systemCompositions,
    };
  }

  /**
   * 更新推荐模型
   */
  async updateRecommendationModel(): Promise<void> {
    console.log('[DataCollector] Updating recommendation model...');

    // 1. 收集最新数据
    const recentMatches = await this.fetchRecentMatches(this.config.maxAge);

    // 2. 分析模式
    const patterns = await this.analyzeDraftPatterns(recentMatches);

    // 3. 更新对手档案
    await this.updateOpponentProfiles(recentMatches);

    // 4. 保存到缓存
    // TODO: 持久化到文件或数据库

    this.lastUpdate = new Date();
    console.log('[DataCollector] Model updated successfully');
  }

  /**
   * 获取对手档案
   */
  async getOpponentProfile(teamId: string): Promise<OpponentProfile | null> {
    // 检查缓存
    if (this.profileCache.has(teamId)) {
      return this.profileCache.get(teamId)!;
    }

    // 从数据库加载
    const profile = await this.loadOpponentProfile(teamId);

    if (profile) {
      this.profileCache.set(teamId, profile);
    }

    return profile;
  }

  /**
   * 检查是否需要更新
   */
  needsUpdate(): boolean {
    if (!this.config.autoUpdate) {
      return false;
    }

    const hoursSinceUpdate = (Date.now() - this.lastUpdate.getTime()) / (1000 * 60 * 60);
    return hoursSinceUpdate >= this.config.updateInterval;
  }

  // ========== 私有方法 ==========

  /**
   * 从数据库获取比赛数据
   */
  private async fetchMatchFromDatabase(matchId: string): Promise<MatchData | null> {
    // TODO: 实现实际的数据库查询
    // 这里需要连接到 SQLite 数据库并查询比赛数据
    return null;
  }

  /**
   * 获取最近的比赛
   */
  private async fetchRecentMatches(maxAgeDays: number): Promise<MatchData[]> {
    // TODO: 实现实际的数据库查询
    // 查询最近 maxAgeDays 天的比赛
    return [];
  }

  /**
   * 分析热门Ban
   */
  private analyzePopularBans(matches: MatchData[]): Map<string, number> {
    const banCount = new Map<string, number>();

    for (const match of matches) {
      const allBans = [...match.blueSide.bans, ...match.redSide.bans];

      for (const championId of allBans) {
        banCount.set(championId, (banCount.get(championId) || 0) + 1);
      }
    }

    return banCount;
  }

  /**
   * 分析热门Pick
   */
  private analyzePopularPicks(matches: MatchData[]): Map<string, number> {
    const pickCount = new Map<string, number>();

    for (const match of matches) {
      const allPicks = [
        ...match.blueSide.picks.map(p => p.championId),
        ...match.redSide.picks.map(p => p.championId),
      ];

      for (const championId of allPicks) {
        pickCount.set(championId, (pickCount.get(championId) || 0) + 1);
      }
    }

    return pickCount;
  }

  /**
   * 分析协同关系
   */
  private analyzeSynergyPairs(matches: MatchData[]): Map<string, Map<string, number>> {
    const synergyMap = new Map<string, Map<string, number>>();

    for (const match of matches) {
      // 分析蓝方
      this.analyzeSynergyForTeam(match.blueSide.picks, match.winner === 'blue', synergyMap);

      // 分析红方
      this.analyzeSynergyForTeam(match.redSide.picks, match.winner === 'red', synergyMap);
    }

    return synergyMap;
  }

  /**
   * 分析单个队伍的协同关系
   */
  private analyzeSynergyForTeam(
    picks: ChampionPickData[],
    won: boolean,
    synergyMap: Map<string, Map<string, number>>
  ): void {
    for (let i = 0; i < picks.length; i++) {
      for (let j = i + 1; j < picks.length; j++) {
        const champA = picks[i].championId;
        const champB = picks[j].championId;

        // 初始化
        if (!synergyMap.has(champA)) {
          synergyMap.set(champA, new Map());
        }
        if (!synergyMap.has(champB)) {
          synergyMap.set(champB, new Map());
        }

        // 记录协同（胜利+1，失败+0）
        const scoreA = synergyMap.get(champA)!;
        const scoreB = synergyMap.get(champB)!;

        scoreA.set(champB, (scoreA.get(champB) || 0) + (won ? 1 : 0));
        scoreB.set(champA, (scoreB.get(champA) || 0) + (won ? 1 : 0));
      }
    }
  }

  /**
   * 分析克制关系
   */
  private analyzeCounterPairs(matches: MatchData[]): Map<string, Map<string, number>> {
    const counterMap = new Map<string, Map<string, number>>();

    for (const match of matches) {
      const bluePicks = match.blueSide.picks;
      const redPicks = match.redSide.picks;
      const blueWon = match.winner === 'blue';

      // 分析蓝方vs红方
      for (const bluePick of bluePicks) {
        for (const redPick of redPicks) {
          // 只分析同位置对线
          if (bluePick.position !== redPick.position) {
            continue;
          }

          // 初始化
          if (!counterMap.has(bluePick.championId)) {
            counterMap.set(bluePick.championId, new Map());
          }
          if (!counterMap.has(redPick.championId)) {
            counterMap.set(redPick.championId, new Map());
          }

          // 记录克制（胜利+1，失败+0）
          const blueCounter = counterMap.get(bluePick.championId)!;
          const redCounter = counterMap.get(redPick.championId)!;

          blueCounter.set(redPick.championId, (blueCounter.get(redPick.championId) || 0) + (blueWon ? 1 : 0));
          redCounter.set(bluePick.championId, (redCounter.get(bluePick.championId) || 0) + (blueWon ? 0 : 1));
        }
      }
    }

    return counterMap;
  }

  /**
   * 发现体系组合
   */
  private discoverSystemCompositions(matches: MatchData[]): SystemComposition[] {
    // TODO: 使用聚类算法发现体系
    // 这里返回空数组，实际实现需要更复杂的算法
    return [];
  }

  /**
   * 更新对手档案
   */
  private async updateOpponentProfiles(matches: MatchData[]): Promise<void> {
    const teamMatches = new Map<string, MatchHistory[]>();

    // 按队伍分组
    for (const match of matches) {
      // 蓝方
      if (!teamMatches.has(match.blueSide.teamId)) {
        teamMatches.set(match.blueSide.teamId, []);
      }
      teamMatches.get(match.blueSide.teamId)!.push(this.convertToMatchHistory(match, 'blue'));

      // 红方
      if (!teamMatches.has(match.redSide.teamId)) {
        teamMatches.set(match.redSide.teamId, []);
      }
      teamMatches.get(match.redSide.teamId)!.push(this.convertToMatchHistory(match, 'red'));
    }

    // 为每个队伍构建档案
    for (const [teamId, history] of teamMatches.entries()) {
      const teamName = history[0]?.opponent || teamId; // 简化
      const profile = buildOpponentProfile(teamId, teamName, history);
      this.profileCache.set(teamId, profile);
    }

    console.log(`[DataCollector] Updated ${teamMatches.size} opponent profiles`);
  }

  /**
   * 转换为MatchHistory格式
   */
  private convertToMatchHistory(match: MatchData, side: 'blue' | 'red'): MatchHistory {
    const teamData = side === 'blue' ? match.blueSide : match.redSide;
    const opponentData = side === 'blue' ? match.redSide : match.blueSide;

    return {
      matchId: match.matchId,
      date: match.date,
      opponent: opponentData.teamName,
      bans: [], // TODO: 需要转换为Champion对象
      picks: [], // TODO: 需要转换为Champion对象
      result: match.winner === side ? 'win' : 'loss',
      duration: match.duration,
      patch: match.patch,
    };
  }

  /**
   * 加载对手档案
   */
  private async loadOpponentProfile(teamId: string): Promise<OpponentProfile | null> {
    // TODO: 从数据库或文件加载
    return null;
  }
}

/**
 * 全局数据收集器实例
 */
let globalCollector: DraftDataCollector | null = null;

/**
 * 获取全局数据收集器
 */
export function getDataCollector(config?: Partial<DataCollectionConfig>): DraftDataCollector {
  if (!globalCollector) {
    globalCollector = new DraftDataCollector(config);
  }
  return globalCollector;
}
