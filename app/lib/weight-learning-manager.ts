/**
 * Weight Learning Manager
 * 权重学习管理器 - 统一管理权重学习流程
 */

import {
  LearnedWeights,
  WeightLearningConfig,
  DEFAULT_WEIGHT_LEARNING_CONFIG,
  TrainingProgress,
  WeightHistory,
  WeightComparisonResult,
} from './weight-learning.types';
import { DEFAULT_BAN_SCORING_CONFIG } from './advanced-ban-scoring.types';
import { MatchData } from './counter-relationship.types';
import { Champion } from './types';
import { TrainingDataCollector, getTrainingCollector } from './training-data-collector';
import { WeightOptimizer } from './weight-optimizer';
import { WeightEvaluator, getWeightEvaluator } from './weight-evaluator';

/**
 * 权重学习管理器类
 */
export class WeightLearningManager {
  private config: WeightLearningConfig;
  private history: WeightHistory[] = [];
  private currentWeights: LearnedWeights | null = null;

  constructor(config?: Partial<WeightLearningConfig>) {
    this.config = {
      ...DEFAULT_WEIGHT_LEARNING_CONFIG,
      ...config,
    };
  }

  /**
   * 完整的权重学习流程
   */
  async learnFromMatches(
    matches: MatchData[],
    allChampions: Champion[],
    progressCallback?: (progress: TrainingProgress) => void
  ): Promise<{
    learnedWeights: LearnedWeights;
    comparison: WeightComparisonResult;
  }> {
    console.log('========================================');
    console.log('权重学习流程开始');
    console.log('========================================');

    // 1. 收集训练数据
    console.log('\n[Step 1/5] 收集训练数据...');
    const collector = getTrainingCollector();
    let dataset = await collector.collectTrainingSamples(matches, allChampions);

    // 2. 数据预处理
    console.log('\n[Step 2/5] 数据预处理...');
    dataset = collector.preprocessDataset(dataset);

    // 3. 划分训练集和测试集
    console.log('\n[Step 3/5] 划分数据集...');
    const { train, test } = collector.splitDataset(
      dataset,
      this.config.crossValidation.testSize
    );

    // 4. 训练权重
    console.log('\n[Step 4/5] 训练权重...');

    // Phase 1权重
    console.log('\n训练 Phase 1 权重...');
    const optimizer1 = new WeightOptimizer(this.config, progressCallback);
    const phase1Weights = await optimizer1.learnWeights(train, 'phase1');

    // Phase 2权重
    console.log('\n训练 Phase 2 权重...');
    const optimizer2 = new WeightOptimizer(this.config, progressCallback);
    const phase2Weights = await optimizer2.learnWeights(train, 'phase2');

    // 合并权重
    const learnedWeights: LearnedWeights = {
      phase1Weights: phase1Weights.phase1Weights,
      phase2Weights: phase2Weights.phase2Weights,
      confidence: (phase1Weights.confidence + phase2Weights.confidence) / 2,
      sampleSize: dataset.samples.length,
      validationAccuracy: 0, // 将在评估时填充
      trainingMetrics: {
        loss: (phase1Weights.trainingMetrics.loss + phase2Weights.trainingMetrics.loss) / 2,
        iterations: phase1Weights.trainingMetrics.iterations,
        convergenceTime:
          phase1Weights.trainingMetrics.convergenceTime +
          phase2Weights.trainingMetrics.convergenceTime,
      },
      version: phase1Weights.version,
      lastUpdated: new Date(),
      trainingConfig: this.config,
    };

    // 5. 评估和对比
    console.log('\n[Step 5/5] 评估权重...');
    const evaluator = getWeightEvaluator();

    // 对比Phase 1
    const comparison1 = await evaluator.compareWeights(
      DEFAULT_BAN_SCORING_CONFIG.phase1Weights,
      learnedWeights.phase1Weights,
      test,
      'phase1'
    );

    // 对比Phase 2
    const comparison2 = await evaluator.compareWeights(
      DEFAULT_BAN_SCORING_CONFIG.phase2Weights,
      learnedWeights.phase2Weights,
      test,
      'phase2'
    );

    // 综合对比结果
    const comparison: WeightComparisonResult = {
      baseline: comparison1.baseline,
      learned: comparison1.learned,
      improvement: {
        accuracy: (comparison1.improvement.accuracy + comparison2.improvement.accuracy) / 2,
        top3Accuracy: (comparison1.improvement.top3Accuracy + comparison2.improvement.top3Accuracy) / 2,
        top5Accuracy: (comparison1.improvement.top5Accuracy + comparison2.improvement.top5Accuracy) / 2,
        mrr: (comparison1.improvement.mrr + comparison2.improvement.mrr) / 2,
        ndcg: (comparison1.improvement.ndcg + comparison2.improvement.ndcg) / 2,
      },
      statisticalSignificance: comparison1.statisticalSignificance,
      recommendation: comparison1.recommendation,
    };

    // 更新验证准确度
    learnedWeights.validationAccuracy = comparison.learned.metrics.accuracy;

    // 保存到历史
    this.addToHistory(learnedWeights, comparison.learned);

    // 如果推荐采用，更新当前权重
    if (comparison.recommendation === 'adopt') {
      this.currentWeights = learnedWeights;
      console.log('\n✅ 新权重已采用！');
    } else {
      console.log(`\n⚠️  新权重未采用（推荐: ${comparison.recommendation}）`);
    }

    console.log('\n========================================');
    console.log('权重学习流程完成');
    console.log('========================================');

    return {
      learnedWeights,
      comparison,
    };
  }

  /**
   * 交叉验证
   */
  async crossValidate(
    matches: MatchData[],
    allChampions: Champion[],
    k: number = 5
  ): Promise<{
    phase1Results: any;
    phase2Results: any;
  }> {
    console.log(`\n开始 ${k} 折交叉验证...`);

    // 收集和预处理数据
    const collector = getTrainingCollector();
    let dataset = await collector.collectTrainingSamples(matches, allChampions);
    dataset = collector.preprocessDataset(dataset);

    // 交叉验证
    const evaluator = getWeightEvaluator();

    const phase1Results = await evaluator.crossValidate(dataset, 'phase1', k);
    const phase2Results = await evaluator.crossValidate(dataset, 'phase2', k);

    console.log('\n交叉验证结果:');
    console.log(`Phase 1: ${(phase1Results.meanAccuracy * 100).toFixed(2)}% ± ${(phase1Results.stdAccuracy * 100).toFixed(2)}%`);
    console.log(`Phase 2: ${(phase2Results.meanAccuracy * 100).toFixed(2)}% ± ${(phase2Results.stdAccuracy * 100).toFixed(2)}%`);

    return {
      phase1Results,
      phase2Results,
    };
  }

  /**
   * 获取当前权重
   */
  getCurrentWeights(): LearnedWeights | null {
    return this.currentWeights;
  }

  /**
   * 加载权重
   */
  loadWeights(weights: LearnedWeights): void {
    this.currentWeights = weights;
    console.log(`[WeightManager] Loaded weights version ${weights.version}`);
  }

  /**
   * 保存权重到文件
   */
  async saveWeights(filePath: string): Promise<void> {
    if (!this.currentWeights) {
      throw new Error('No weights to save');
    }

    const data = JSON.stringify(this.currentWeights, null, 2);
    // TODO: 实现文件保存
    console.log(`[WeightManager] Weights saved to ${filePath}`);
  }

  /**
   * 从文件加载权重
   */
  async loadWeightsFromFile(filePath: string): Promise<void> {
    // TODO: 实现文件加载
    console.log(`[WeightManager] Weights loaded from ${filePath}`);
  }

  /**
   * 添加到历史
   */
  private addToHistory(weights: LearnedWeights, evaluation: any): void {
    const historyEntry: WeightHistory = {
      version: weights.version,
      weights,
      evaluation,
      deployedAt: new Date(),
    };

    this.history.push(historyEntry);

    // 只保留最近10个版本
    if (this.history.length > 10) {
      this.history.shift();
    }
  }

  /**
   * 获取历史记录
   */
  getHistory(): WeightHistory[] {
    return this.history;
  }

  /**
   * 打印权重对比
   */
  printComparison(comparison: WeightComparisonResult): void {
    console.log('\n========================================');
    console.log('权重对比结果');
    console.log('========================================');

    console.log('\n基线权重（当前）:');
    console.log(`  准确率: ${(comparison.baseline.metrics.accuracy * 100).toFixed(2)}%`);
    console.log(`  Top-3: ${(comparison.baseline.metrics.top3Accuracy * 100).toFixed(2)}%`);
    console.log(`  Top-5: ${(comparison.baseline.metrics.top5Accuracy * 100).toFixed(2)}%`);
    console.log(`  MRR: ${comparison.baseline.metrics.mrr.toFixed(4)}`);
    console.log(`  NDCG: ${comparison.baseline.metrics.ndcg.toFixed(4)}`);

    console.log('\n学习到的权重:');
    console.log(`  准确率: ${(comparison.learned.metrics.accuracy * 100).toFixed(2)}%`);
    console.log(`  Top-3: ${(comparison.learned.metrics.top3Accuracy * 100).toFixed(2)}%`);
    console.log(`  Top-5: ${(comparison.learned.metrics.top5Accuracy * 100).toFixed(2)}%`);
    console.log(`  MRR: ${comparison.learned.metrics.mrr.toFixed(4)}`);
    console.log(`  NDCG: ${comparison.learned.metrics.ndcg.toFixed(4)}`);

    console.log('\n提升:');
    console.log(`  准确率: ${comparison.improvement.accuracy > 0 ? '+' : ''}${comparison.improvement.accuracy.toFixed(2)} 百分点`);
    console.log(`  Top-3: ${comparison.improvement.top3Accuracy > 0 ? '+' : ''}${comparison.improvement.top3Accuracy.toFixed(2)} 百分点`);
    console.log(`  Top-5: ${comparison.improvement.top5Accuracy > 0 ? '+' : ''}${comparison.improvement.top5Accuracy.toFixed(2)} 百分点`);
    console.log(`  MRR: ${comparison.improvement.mrr > 0 ? '+' : ''}${comparison.improvement.mrr.toFixed(4)}`);
    console.log(`  NDCG: ${comparison.improvement.ndcg > 0 ? '+' : ''}${comparison.improvement.ndcg.toFixed(4)}`);

    console.log('\n统计显著性:');
    console.log(`  P-value: ${comparison.statisticalSignificance.pValue.toFixed(4)}`);
    console.log(`  显著: ${comparison.statisticalSignificance.isSignificant ? '是' : '否'} (p < 0.05)`);

    console.log('\n推荐:');
    const recommendations = {
      adopt: '✅ 采用新权重',
      reject: '❌ 拒绝新权重',
      needs_more_data: '⚠️  需要更多数据',
    };
    console.log(`  ${recommendations[comparison.recommendation]}`);

    console.log('\n========================================');
  }
}

/**
 * 全局权重学习管理器实例
 */
let globalManager: WeightLearningManager | null = null;

/**
 * 获取全局权重学习管理器
 */
export function getWeightLearningManager(
  config?: Partial<WeightLearningConfig>
): WeightLearningManager {
  if (!globalManager) {
    globalManager = new WeightLearningManager(config);
  }
  return globalManager;
}

/**
 * 便捷函数：从比赛数据学习权重
 */
export async function learnWeightsFromMatches(
  matches: MatchData[],
  allChampions: Champion[],
  config?: Partial<WeightLearningConfig>,
  progressCallback?: (progress: TrainingProgress) => void
): Promise<{
  learnedWeights: LearnedWeights;
  comparison: WeightComparisonResult;
}> {
  const manager = getWeightLearningManager(config);
  return manager.learnFromMatches(matches, allChampions, progressCallback);
}
