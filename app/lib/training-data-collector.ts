/**
 * Training Data Collector
 * 训练数据收集器 - 从历史比赛中提取训练样本
 */

import {
  TrainingSample,
  TrainingDataset,
} from './weight-learning.types';
import { Champion, BPState, BanEntry } from './types';
import { TeamChampionPool } from './team-champion-pool.types';
import { MatchData } from './counter-relationship.types';

/**
 * 训练数据收集器类
 */
export class TrainingDataCollector {
  /**
   * 从比赛数据中提取训练样本
   */
  async collectTrainingSamples(
    matches: MatchData[],
    allChampions: Champion[]
  ): Promise<TrainingDataset> {
    console.log(`[Training] Collecting samples from ${matches.length} matches...`);

    const samples: TrainingSample[] = [];
    const patches = new Set<string>();
    const teams = new Set<string>();
    const tournaments = new Set<string>();

    for (const match of matches) {
      // 提取蓝方的Ban样本
      const blueSamples = await this.extractBanSamples(
        match,
        'blue',
        allChampions
      );
      samples.push(...blueSamples);

      // 提取红方的Ban样本
      const redSamples = await this.extractBanSamples(
        match,
        'red',
        allChampions
      );
      samples.push(...redSamples);

      // 收集元数据
      patches.add(match.patch);
      teams.add(match.blueSide.teamId);
      teams.add(match.redSide.teamId);
      // tournaments.add(match.tournamentName); // TODO: 需要添加到MatchData
    }

    // 计算日期范围
    const dates = matches.map(m => m.date.getTime());
    const dateRange = {
      start: new Date(Math.min(...dates)),
      end: new Date(Math.max(...dates)),
    };

    console.log(`[Training] Collected ${samples.length} training samples`);

    return {
      samples,
      metadata: {
        totalSamples: samples.length,
        dateRange,
        patches: Array.from(patches),
        teams: Array.from(teams),
        tournaments: Array.from(tournaments),
      },
    };
  }

  /**
   * 从单场比赛中提取Ban样本
   */
  private async extractBanSamples(
    match: MatchData,
    side: 'blue' | 'red',
    allChampions: Champion[]
  ): Promise<TrainingSample[]> {
    const samples: TrainingSample[] = [];

    const teamData = side === 'blue' ? match.blueSide : match.redSide;
    const opponentData = side === 'blue' ? match.redSide : match.blueSide;

    // 重建BP状态（逐步）
    const bpState = this.initializeBPState();

    // 模拟BP过程，在每个Ban位置创建训练样本
    const banSequence = this.getBanSequence(match, side);

    for (let i = 0; i < banSequence.length; i++) {
      const ban = banSequence[i];

      // 找到对应的英雄对象
      const actualBan = allChampions.find(c => c.id === ban.championId);
      if (!actualBan) {
        console.warn(`[Training] Champion not found: ${ban.championId}`);
        continue;
      }

      // 获取当前可用的英雄
      const availableChampions = this.getAvailableChampions(
        allChampions,
        bpState
      );

      // 创建训练样本
      const sample: TrainingSample = {
        bpState: this.cloneBPState(bpState),
        enemyTeamPool: null, // TODO: 需要加载队伍英雄池数据
        availableChampions,
        actualBan,
        matchId: match.matchId,
        teamId: teamData.teamId,
        teamName: teamData.teamName,
        opponentId: opponentData.teamId,
        opponentName: opponentData.teamName,
        matchResult: match.winner === side ? 'win' : 'loss',
        patch: match.patch,
        date: match.date,
        tournamentName: '', // TODO: 需要添加
        importance: 1.0, // TODO: 根据赛事类型计算
      };

      samples.push(sample);

      // 更新BP状态
      this.applyBan(bpState, ban, side);
    }

    return samples;
  }

  /**
   * 获取Ban序列
   */
  private getBanSequence(
    match: MatchData,
    side: 'blue' | 'red'
  ): Array<{ championId: string; step: number }> {
    const bans = side === 'blue' ? match.blueSide.bans : match.redSide.bans;

    return bans.map((championId, index) => ({
      championId,
      step: this.getBanStepForSide(side, index),
    }));
  }

  /**
   * 获取Ban步骤索引
   */
  private getBanStepForSide(side: 'blue' | 'red', banIndex: number): number {
    // BP顺序：
    // Ban1: B R B R B R (steps 0-5)
    // Pick1: B R R B B R (steps 6-11)
    // Ban2: R B R B (steps 12-15)
    // Pick2: R B B R (steps 16-19)

    if (banIndex < 3) {
      // Ban Phase 1
      return side === 'blue' ? banIndex * 2 : banIndex * 2 + 1;
    } else {
      // Ban Phase 2
      const ban2Index = banIndex - 3;
      return side === 'blue' ? 13 + ban2Index * 2 : 12 + ban2Index * 2;
    }
  }

  /**
   * 初始化BP状态
   */
  private initializeBPState(): BPState {
    return {
      currentStep: 0,
      blueBans: Array(5).fill({ champion: null }),
      redBans: Array(5).fill({ champion: null }),
      bluePicks: Array(5).fill(null),
      redPicks: Array(5).fill(null),
      usedChampions: new Set<string>(),
      history: [],
    };
  }

  /**
   * 克隆BP状态
   */
  private cloneBPState(state: BPState): BPState {
    return {
      currentStep: state.currentStep,
      blueBans: [...state.blueBans],
      redBans: [...state.redBans],
      bluePicks: [...state.bluePicks],
      redPicks: [...state.redPicks],
      usedChampions: new Set(state.usedChampions),
      history: [...state.history],
    };
  }

  /**
   * 应用Ban
   */
  private applyBan(
    state: BPState,
    ban: { championId: string; step: number },
    side: 'blue' | 'red'
  ): void {
    // 简化：直接添加到对应的Ban列表
    const banList = side === 'blue' ? state.blueBans : state.redBans;
    const banIndex = Math.floor(ban.step / 2);

    if (banIndex < banList.length) {
      // 需要创建Champion对象，这里简化处理
      banList[banIndex] = {
        champion: { id: ban.championId } as Champion,
        reason: 'manual',
      };
      state.usedChampions.add(ban.championId);
    }

    state.currentStep = ban.step + 1;
  }

  /**
   * 获取可用英雄
   */
  private getAvailableChampions(
    allChampions: Champion[],
    bpState: BPState
  ): Champion[] {
    return allChampions.filter(
      c => !bpState.usedChampions.has(c.id)
    );
  }

  /**
   * 数据预处理
   */
  preprocessDataset(dataset: TrainingDataset): TrainingDataset {
    console.log('[Training] Preprocessing dataset...');

    // 1. 过滤无效样本
    let samples = dataset.samples.filter(s => {
      return (
        s.actualBan &&
        s.availableChampions.length > 0 &&
        s.bpState
      );
    });

    console.log(`[Training] After filtering: ${samples.length} samples`);

    // 2. 数据平衡（可选）
    // 确保胜利和失败的样本比例平衡
    samples = this.balanceDataset(samples);

    console.log(`[Training] After balancing: ${samples.length} samples`);

    // 3. 按时间排序
    samples.sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
      ...dataset,
      samples,
      metadata: {
        ...dataset.metadata,
        totalSamples: samples.length,
      },
    };
  }

  /**
   * 数据平衡
   */
  private balanceDataset(samples: TrainingSample[]): TrainingSample[] {
    const winSamples = samples.filter(s => s.matchResult === 'win');
    const lossSamples = samples.filter(s => s.matchResult === 'loss');

    const minCount = Math.min(winSamples.length, lossSamples.length);

    // 随机采样到相同数量
    const balancedWin = this.randomSample(winSamples, minCount);
    const balancedLoss = this.randomSample(lossSamples, minCount);

    return [...balancedWin, ...balancedLoss];
  }

  /**
   * 随机采样
   */
  private randomSample<T>(array: T[], count: number): T[] {
    const shuffled = [...array].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  /**
   * 划分训练集和测试集
   */
  splitDataset(
    dataset: TrainingDataset,
    testSize: number = 0.2
  ): {
    train: TrainingDataset;
    test: TrainingDataset;
  } {
    const samples = dataset.samples;
    const splitIndex = Math.floor(samples.length * (1 - testSize));

    const trainSamples = samples.slice(0, splitIndex);
    const testSamples = samples.slice(splitIndex);

    console.log(`[Training] Split: ${trainSamples.length} train, ${testSamples.length} test`);

    return {
      train: {
        samples: trainSamples,
        metadata: {
          ...dataset.metadata,
          totalSamples: trainSamples.length,
        },
      },
      test: {
        samples: testSamples,
        metadata: {
          ...dataset.metadata,
          totalSamples: testSamples.length,
        },
      },
    };
  }

  /**
   * K折交叉验证划分
   */
  kFoldSplit(
    dataset: TrainingDataset,
    k: number = 5
  ): TrainingDataset[][] {
    const samples = dataset.samples;
    const foldSize = Math.floor(samples.length / k);
    const folds: TrainingDataset[][] = [];

    for (let i = 0; i < k; i++) {
      const testStart = i * foldSize;
      const testEnd = i === k - 1 ? samples.length : (i + 1) * foldSize;

      const testSamples = samples.slice(testStart, testEnd);
      const trainSamples = [
        ...samples.slice(0, testStart),
        ...samples.slice(testEnd),
      ];

      folds.push([
        {
          samples: trainSamples,
          metadata: {
            ...dataset.metadata,
            totalSamples: trainSamples.length,
          },
        },
        {
          samples: testSamples,
          metadata: {
            ...dataset.metadata,
            totalSamples: testSamples.length,
          },
        },
      ]);
    }

    console.log(`[Training] Created ${k} folds for cross-validation`);

    return folds;
  }

  /**
   * 数据增强（可选）
   */
  augmentDataset(dataset: TrainingDataset): TrainingDataset {
    // TODO: 实现数据增强策略
    // 例如：添加噪声、时间扰动等
    return dataset;
  }
}

/**
 * 全局训练数据收集器实例
 */
let globalTrainingCollector: TrainingDataCollector | null = null;

/**
 * 获取全局训练数据收集器
 */
export function getTrainingCollector(): TrainingDataCollector {
  if (!globalTrainingCollector) {
    globalTrainingCollector = new TrainingDataCollector();
  }
  return globalTrainingCollector;
}
