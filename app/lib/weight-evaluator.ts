/**
 * Weight Evaluator
 * 权重评估器 - 评估学习到的权重的性能
 */

import {
  TrainingSample,
  TrainingDataset,
  LearnedWeights,
  WeightEvaluationResult,
  WeightComparisonResult,
} from './weight-learning.types';
import { BanPhaseWeights, DEFAULT_BAN_SCORING_CONFIG } from './advanced-ban-scoring.types';
import { calculateBanScore } from './advanced-ban-scoring';

/**
 * 权重评估器类
 */
export class WeightEvaluator {
  /**
   * 评估权重性能
   */
  async evaluateWeights(
    weights: BanPhaseWeights,
    testDataset: TrainingDataset,
    phase: 'phase1' | 'phase2'
  ): Promise<WeightEvaluationResult> {
    console.log(`[Evaluator] Evaluating weights for ${phase}...`);

    // 过滤该阶段的样本
    const phaseSamples = testDataset.samples.filter(s => {
      const step = s.bpState.currentStep;
      if (phase === 'phase1') {
        return step <= 5;
      } else {
        return step >= 12 && step <= 15;
      }
    });

    console.log(`[Evaluator] Test samples: ${phaseSamples.length}`);

    if (phaseSamples.length === 0) {
      throw new Error(`No test samples for ${phase}`);
    }

    // 计算各项指标
    const accuracy = await this.calculateAccuracy(weights, phaseSamples, 1);
    const top3Accuracy = await this.calculateAccuracy(weights, phaseSamples, 3);
    const top5Accuracy = await this.calculateAccuracy(weights, phaseSamples, 5);
    const mrr = await this.calculateMRR(weights, phaseSamples);
    const ndcg = await this.calculateNDCG(weights, phaseSamples);

    // 计算特征重要性
    const featureImportance = {
      heroStrength: weights.heroStrength,
      enemyProficiency: weights.enemyProficiency,
      restrictionImpact: weights.restrictionImpact,
      strategicValue: weights.strategicValue,
    };

    console.log(`[Evaluator] Accuracy: ${(accuracy * 100).toFixed(2)}%`);
    console.log(`[Evaluator] Top-3 Accuracy: ${(top3Accuracy * 100).toFixed(2)}%`);
    console.log(`[Evaluator] Top-5 Accuracy: ${(top5Accuracy * 100).toFixed(2)}%`);
    console.log(`[Evaluator] MRR: ${mrr.toFixed(4)}`);
    console.log(`[Evaluator] NDCG: ${ndcg.toFixed(4)}`);

    return {
      weights,
      metrics: {
        accuracy,
        top3Accuracy,
        top5Accuracy,
        mrr,
        ndcg,
      },
      featureImportance,
      sampleSize: phaseSamples.length,
    };
  }

  /**
   * 计算准确率（Top-K）
   */
  private async calculateAccuracy(
    weights: BanPhaseWeights,
    samples: TrainingSample[],
    k: number
  ): Promise<number> {
    let correct = 0;

    for (const sample of samples) {
      const recommendations = await this.getRecommendations(sample, weights);
      const topK = recommendations.slice(0, k);

      if (topK.some(r => r.championId === sample.actualBan.id)) {
        correct++;
      }
    }

    return correct / samples.length;
  }

  /**
   * 计算平均倒数排名（MRR）
   */
  private async calculateMRR(
    weights: BanPhaseWeights,
    samples: TrainingSample[]
  ): Promise<number> {
    let totalRR = 0;

    for (const sample of samples) {
      const recommendations = await this.getRecommendations(sample, weights);
      const rank = recommendations.findIndex(r => r.championId === sample.actualBan.id) + 1;

      if (rank > 0) {
        totalRR += 1 / rank;
      }
    }

    return totalRR / samples.length;
  }

  /**
   * 计算归一化折损累积增益（NDCG）
   */
  private async calculateNDCG(
    weights: BanPhaseWeights,
    samples: TrainingSample[],
    k: number = 10
  ): Promise<number> {
    let totalNDCG = 0;

    for (const sample of samples) {
      const recommendations = await this.getRecommendations(sample, weights);
      const topK = recommendations.slice(0, k);

      // 计算DCG
      let dcg = 0;
      for (let i = 0; i < topK.length; i++) {
        const relevance = topK[i].championId === sample.actualBan.id ? 1 : 0;
        dcg += relevance / Math.log2(i + 2); // i+2 because log2(1)=0
      }

      // 计算IDCG（理想情况：实际Ban排第一）
      const idcg = 1 / Math.log2(2); // 1 / log2(2) = 1

      // NDCG
      const ndcg = dcg / idcg;
      totalNDCG += ndcg;
    }

    return totalNDCG / samples.length;
  }

  /**
   * 获取推荐列表
   */
  private async getRecommendations(
    sample: TrainingSample,
    weights: BanPhaseWeights
  ): Promise<Array<{ championId: string; score: number }>> {
    const recommendations: Array<{ championId: string; score: number }> = [];

    // 使用给定权重计算每个候选英雄的分数
    const config = {
      ...DEFAULT_BAN_SCORING_CONFIG,
      phase1Weights: weights,
      phase2Weights: weights,
    };

    for (const champion of sample.availableChampions) {
      const result = calculateBanScore(
        champion,
        sample.bpState,
        sample.enemyTeamPool,
        undefined,
        config
      );

      recommendations.push({
        championId: champion.id,
        score: result.finalScore,
      });
    }

    // 按分数降序排序
    return recommendations.sort((a, b) => b.score - a.score);
  }

  /**
   * 对比两组权重
   */
  async compareWeights(
    baselineWeights: BanPhaseWeights,
    learnedWeights: BanPhaseWeights,
    testDataset: TrainingDataset,
    phase: 'phase1' | 'phase2'
  ): Promise<WeightComparisonResult> {
    console.log('[Evaluator] Comparing weights...');

    // 评估基线权重
    const baselineEval = await this.evaluateWeights(
      baselineWeights,
      testDataset,
      phase
    );

    // 评估学习到的权重
    const learnedEval = await this.evaluateWeights(
      learnedWeights,
      testDataset,
      phase
    );

    // 计算提升
    const improvement = {
      accuracy: (learnedEval.metrics.accuracy - baselineEval.metrics.accuracy) * 100,
      top3Accuracy: (learnedEval.metrics.top3Accuracy - baselineEval.metrics.top3Accuracy) * 100,
      top5Accuracy: (learnedEval.metrics.top5Accuracy - baselineEval.metrics.top5Accuracy) * 100,
      mrr: learnedEval.metrics.mrr - baselineEval.metrics.mrr,
      ndcg: learnedEval.metrics.ndcg - baselineEval.metrics.ndcg,
    };

    // 统计显著性检验（简化版）
    const pValue = this.calculatePValue(
      baselineEval.metrics.accuracy,
      learnedEval.metrics.accuracy,
      testDataset.samples.length
    );

    const isSignificant = pValue < 0.05;

    // 推荐
    let recommendation: 'adopt' | 'reject' | 'needs_more_data';
    if (isSignificant && improvement.accuracy > 2) {
      recommendation = 'adopt';
    } else if (improvement.accuracy < -1) {
      recommendation = 'reject';
    } else {
      recommendation = 'needs_more_data';
    }

    console.log('[Evaluator] Comparison results:');
    console.log(`  Baseline accuracy: ${(baselineEval.metrics.accuracy * 100).toFixed(2)}%`);
    console.log(`  Learned accuracy: ${(learnedEval.metrics.accuracy * 100).toFixed(2)}%`);
    console.log(`  Improvement: ${improvement.accuracy.toFixed(2)} percentage points`);
    console.log(`  P-value: ${pValue.toFixed(4)}`);
    console.log(`  Recommendation: ${recommendation}`);

    return {
      baseline: baselineEval,
      learned: learnedEval,
      improvement,
      statisticalSignificance: {
        pValue,
        isSignificant,
      },
      recommendation,
    };
  }

  /**
   * 计算P值（简化版，使用Z检验）
   */
  private calculatePValue(
    accuracy1: number,
    accuracy2: number,
    sampleSize: number
  ): number {
    // 简化的Z检验
    const p1 = accuracy1;
    const p2 = accuracy2;
    const pooledP = (p1 + p2) / 2;

    const se = Math.sqrt(2 * pooledP * (1 - pooledP) / sampleSize);
    const z = Math.abs(p2 - p1) / se;

    // 近似P值（双尾检验）
    const pValue = 2 * (1 - this.normalCDF(z));

    return pValue;
  }

  /**
   * 标准正态分布的累积分布函数
   */
  private normalCDF(z: number): number {
    // 使用误差函数近似
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const prob =
      d *
      t *
      (0.3193815 +
        t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));

    return z > 0 ? 1 - prob : prob;
  }

  /**
   * K折交叉验证
   */
  async crossValidate(
    dataset: TrainingDataset,
    phase: 'phase1' | 'phase2',
    k: number = 5
  ): Promise<{
    meanAccuracy: number;
    stdAccuracy: number;
    foldResults: WeightEvaluationResult[];
  }> {
    console.log(`[Evaluator] Performing ${k}-fold cross-validation...`);

    // 导入训练数据收集器
    const { getTrainingCollector } = await import('./training-data-collector');
    const collector = getTrainingCollector();

    // 创建K折
    const folds = collector.kFoldSplit(dataset, k);

    const foldResults: WeightEvaluationResult[] = [];

    for (let i = 0; i < k; i++) {
      console.log(`[Evaluator] Fold ${i + 1}/${k}`);

      const [trainSet, testSet] = folds[i];

      // 训练
      const { WeightOptimizer } = await import('./weight-optimizer');
      const optimizer = new WeightOptimizer();
      const learnedWeights = await optimizer.learnWeights(trainSet, phase);

      // 评估
      const weights = phase === 'phase1'
        ? learnedWeights.phase1Weights
        : learnedWeights.phase2Weights;

      const evaluation = await this.evaluateWeights(weights, testSet, phase);
      foldResults.push(evaluation);
    }

    // 计算平均和标准差
    const accuracies = foldResults.map(r => r.metrics.accuracy);
    const meanAccuracy = accuracies.reduce((sum, acc) => sum + acc, 0) / k;
    const variance =
      accuracies.reduce((sum, acc) => sum + Math.pow(acc - meanAccuracy, 2), 0) / k;
    const stdAccuracy = Math.sqrt(variance);

    console.log(`[Evaluator] Cross-validation results:`);
    console.log(`  Mean accuracy: ${(meanAccuracy * 100).toFixed(2)}%`);
    console.log(`  Std accuracy: ${(stdAccuracy * 100).toFixed(2)}%`);

    return {
      meanAccuracy,
      stdAccuracy,
      foldResults,
    };
  }
}

/**
 * 全局评估器实例
 */
let globalEvaluator: WeightEvaluator | null = null;

/**
 * 获取全局评估器
 */
export function getWeightEvaluator(): WeightEvaluator {
  if (!globalEvaluator) {
    globalEvaluator = new WeightEvaluator();
  }
  return globalEvaluator;
}
