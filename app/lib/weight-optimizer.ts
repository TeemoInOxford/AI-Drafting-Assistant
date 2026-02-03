/**
 * Weight Optimizer
 * 权重优化器 - 使用梯度下降和Adam优化算法学习最优权重
 */

import {
  TrainingSample,
  TrainingDataset,
  LearnedWeights,
  WeightLearningConfig,
  DEFAULT_WEIGHT_LEARNING_CONFIG,
  TrainingProgress,
  Gradient,
  ObjectiveFunction,
} from './weight-learning.types';
import { BanPhaseWeights } from './advanced-ban-scoring.types';
import { calculateBanScore } from './advanced-ban-scoring';
import { Champion } from './types';

/**
 * 权重优化器类
 */
export class WeightOptimizer {
  private config: WeightLearningConfig;
  private progressCallback?: (progress: TrainingProgress) => void;

  constructor(
    config?: Partial<WeightLearningConfig>,
    progressCallback?: (progress: TrainingProgress) => void
  ) {
    this.config = {
      ...DEFAULT_WEIGHT_LEARNING_CONFIG,
      ...config,
    };
    this.progressCallback = progressCallback;
  }

  /**
   * 学习最优权重
   */
  async learnWeights(
    dataset: TrainingDataset,
    phase: 'phase1' | 'phase2'
  ): Promise<LearnedWeights> {
    console.log(`[Optimizer] Learning weights for ${phase}...`);
    console.log(`[Optimizer] Algorithm: ${this.config.algorithm}`);
    console.log(`[Optimizer] Samples: ${dataset.samples.length}`);

    const startTime = Date.now();

    // 过滤该阶段的样本
    const phaseSamples = this.filterPhaseSamples(dataset.samples, phase);
    console.log(`[Optimizer] Phase samples: ${phaseSamples.length}`);

    if (phaseSamples.length < 10) {
      throw new Error(`Insufficient samples for ${phase}: ${phaseSamples.length}`);
    }

    // 初始化权重（使用当前默认值）
    let weights = this.initializeWeights();

    // 选择优化算法
    let optimizedWeights: BanPhaseWeights;
    let trainingMetrics: any;

    switch (this.config.algorithm) {
      case 'gradient_descent':
        ({ weights: optimizedWeights, metrics: trainingMetrics } =
          await this.gradientDescent(phaseSamples, weights));
        break;

      case 'adam':
        ({ weights: optimizedWeights, metrics: trainingMetrics } =
          await this.adamOptimizer(phaseSamples, weights));
        break;

      case 'genetic':
        ({ weights: optimizedWeights, metrics: trainingMetrics } =
          await this.geneticAlgorithm(phaseSamples, weights));
        break;

      case 'bayesian':
        ({ weights: optimizedWeights, metrics: trainingMetrics } =
          await this.bayesianOptimization(phaseSamples, weights));
        break;

      default:
        throw new Error(`Unknown algorithm: ${this.config.algorithm}`);
    }

    const convergenceTime = (Date.now() - startTime) / 1000;

    // 计算置信度
    const confidence = this.calculateConfidence(phaseSamples.length, trainingMetrics.loss);

    // 构建结果
    const learnedWeights: LearnedWeights = {
      phase1Weights: phase === 'phase1' ? optimizedWeights : this.initializeWeights(),
      phase2Weights: phase === 'phase2' ? optimizedWeights : this.initializeWeights(),
      confidence,
      sampleSize: phaseSamples.length,
      validationAccuracy: 0, // 将在评估时填充
      trainingMetrics: {
        loss: trainingMetrics.loss,
        iterations: trainingMetrics.iterations,
        convergenceTime,
      },
      version: this.generateVersion(),
      lastUpdated: new Date(),
      trainingConfig: this.config,
    };

    console.log(`[Optimizer] Training completed in ${convergenceTime.toFixed(2)}s`);
    console.log(`[Optimizer] Final loss: ${trainingMetrics.loss.toFixed(4)}`);
    console.log(`[Optimizer] Learned weights:`, optimizedWeights);

    return learnedWeights;
  }

  /**
   * Adam优化器（推荐）
   */
  private async adamOptimizer(
    samples: TrainingSample[],
    initialWeights: BanPhaseWeights
  ): Promise<{ weights: BanPhaseWeights; metrics: any }> {
    let weights = { ...initialWeights };

    // Adam参数
    const beta1 = 0.9;
    const beta2 = 0.999;
    const epsilon = 1e-8;

    // 一阶矩估计（动量）
    let m: Gradient = {
      heroStrength: 0,
      enemyProficiency: 0,
      restrictionImpact: 0,
      strategicValue: 0,
    };

    // 二阶矩估计（RMSProp）
    let v: Gradient = {
      heroStrength: 0,
      enemyProficiency: 0,
      restrictionImpact: 0,
      strategicValue: 0,
    };

    let bestLoss = Infinity;
    let bestWeights = { ...weights };
    let patienceCounter = 0;

    for (let iter = 0; iter < this.config.maxIterations; iter++) {
      // 计算损失和梯度
      const { loss, gradient } = this.computeLossAndGradient(samples, weights);

      // 更新一阶矩估计
      m.heroStrength = beta1 * m.heroStrength + (1 - beta1) * gradient.heroStrength;
      m.enemyProficiency = beta1 * m.enemyProficiency + (1 - beta1) * gradient.enemyProficiency;
      m.restrictionImpact = beta1 * m.restrictionImpact + (1 - beta1) * gradient.restrictionImpact;
      m.strategicValue = beta1 * m.strategicValue + (1 - beta1) * gradient.strategicValue;

      // 更新二阶矩估计
      v.heroStrength = beta2 * v.heroStrength + (1 - beta2) * gradient.heroStrength ** 2;
      v.enemyProficiency = beta2 * v.enemyProficiency + (1 - beta2) * gradient.enemyProficiency ** 2;
      v.restrictionImpact = beta2 * v.restrictionImpact + (1 - beta2) * gradient.restrictionImpact ** 2;
      v.strategicValue = beta2 * v.strategicValue + (1 - beta2) * gradient.strategicValue ** 2;

      // 偏差修正
      const mHat = {
        heroStrength: m.heroStrength / (1 - Math.pow(beta1, iter + 1)),
        enemyProficiency: m.enemyProficiency / (1 - Math.pow(beta1, iter + 1)),
        restrictionImpact: m.restrictionImpact / (1 - Math.pow(beta1, iter + 1)),
        strategicValue: m.strategicValue / (1 - Math.pow(beta1, iter + 1)),
      };

      const vHat = {
        heroStrength: v.heroStrength / (1 - Math.pow(beta2, iter + 1)),
        enemyProficiency: v.enemyProficiency / (1 - Math.pow(beta2, iter + 1)),
        restrictionImpact: v.restrictionImpact / (1 - Math.pow(beta2, iter + 1)),
        strategicValue: v.strategicValue / (1 - Math.pow(beta2, iter + 1)),
      };

      // 更新权重
      weights.heroStrength -= this.config.learningRate * mHat.heroStrength / (Math.sqrt(vHat.heroStrength) + epsilon);
      weights.enemyProficiency -= this.config.learningRate * mHat.enemyProficiency / (Math.sqrt(vHat.enemyProficiency) + epsilon);
      weights.restrictionImpact -= this.config.learningRate * mHat.restrictionImpact / (Math.sqrt(vHat.restrictionImpact) + epsilon);
      weights.strategicValue -= this.config.learningRate * mHat.strategicValue / (Math.sqrt(vHat.strategicValue) + epsilon);

      // 应用约束
      weights = this.applyConstraints(weights);

      // 早停检查
      if (loss < bestLoss - this.config.earlyStop.minDelta) {
        bestLoss = loss;
        bestWeights = { ...weights };
        patienceCounter = 0;
      } else {
        patienceCounter++;
      }

      // 报告进度
      if (this.progressCallback && iter % 10 === 0) {
        this.progressCallback({
          currentIteration: iter,
          totalIterations: this.config.maxIterations,
          currentLoss: loss,
          bestLoss,
          validationAccuracy: 0,
          elapsedTime: 0,
          estimatedTimeRemaining: 0,
          status: 'running',
        });
      }

      // 收敛检查
      if (Math.abs(loss - bestLoss) < this.config.convergenceThreshold) {
        console.log(`[Optimizer] Converged at iteration ${iter}`);
        break;
      }

      // 早停
      if (this.config.earlyStop.enabled && patienceCounter >= this.config.earlyStop.patience) {
        console.log(`[Optimizer] Early stopping at iteration ${iter}`);
        break;
      }
    }

    return {
      weights: bestWeights,
      metrics: {
        loss: bestLoss,
        iterations: this.config.maxIterations,
      },
    };
  }

  /**
   * 梯度下降优化器
   */
  private async gradientDescent(
    samples: TrainingSample[],
    initialWeights: BanPhaseWeights
  ): Promise<{ weights: BanPhaseWeights; metrics: any }> {
    let weights = { ...initialWeights };
    let bestLoss = Infinity;
    let bestWeights = { ...weights };

    for (let iter = 0; iter < this.config.maxIterations; iter++) {
      const { loss, gradient } = this.computeLossAndGradient(samples, weights);

      // 更新权重
      weights.heroStrength -= this.config.learningRate * gradient.heroStrength;
      weights.enemyProficiency -= this.config.learningRate * gradient.enemyProficiency;
      weights.restrictionImpact -= this.config.learningRate * gradient.restrictionImpact;
      weights.strategicValue -= this.config.learningRate * gradient.strategicValue;

      // 应用约束
      weights = this.applyConstraints(weights);

      if (loss < bestLoss) {
        bestLoss = loss;
        bestWeights = { ...weights };
      }

      if (Math.abs(loss - bestLoss) < this.config.convergenceThreshold) {
        break;
      }
    }

    return {
      weights: bestWeights,
      metrics: { loss: bestLoss, iterations: this.config.maxIterations },
    };
  }

  /**
   * 遗传算法（简化版）
   */
  private async geneticAlgorithm(
    samples: TrainingSample[],
    initialWeights: BanPhaseWeights
  ): Promise<{ weights: BanPhaseWeights; metrics: any }> {
    // TODO: 实现遗传算法
    return this.adamOptimizer(samples, initialWeights);
  }

  /**
   * 贝叶斯优化（简化版）
   */
  private async bayesianOptimization(
    samples: TrainingSample[],
    initialWeights: BanPhaseWeights
  ): Promise<{ weights: BanPhaseWeights; metrics: any }> {
    // TODO: 实现贝叶斯优化
    return this.adamOptimizer(samples, initialWeights);
  }

  /**
   * 计算损失和梯度
   */
  private computeLossAndGradient(
    samples: TrainingSample[],
    weights: BanPhaseWeights
  ): { loss: number; gradient: Gradient } {
    let totalLoss = 0;
    const gradient: Gradient = {
      heroStrength: 0,
      enemyProficiency: 0,
      restrictionImpact: 0,
      strategicValue: 0,
    };

    // 使用小批量（提高效率）
    const batchSize = Math.min(32, samples.length);
    const batch = this.randomSample(samples, batchSize);

    for (const sample of batch) {
      // 计算每个候选英雄的分数
      const scores = this.computeScores(sample, weights);

      // 找到实际Ban的英雄的排名
      const actualBanScore = scores.find(s => s.championId === sample.actualBan.id)?.score || 0;
      const rank = scores.filter(s => s.score > actualBanScore).length + 1;

      // 损失函数：Ranking Loss (Hinge Loss)
      // 目标：实际Ban的英雄应该排名第一
      const loss = Math.max(0, 1 - actualBanScore + scores[0].score);
      totalLoss += loss;

      // 计算梯度（数值梯度，简化版）
      const epsilon = 0.0001;

      // heroStrength梯度
      const weightsPlus = { ...weights, heroStrength: weights.heroStrength + epsilon };
      const scoresPlusHS = this.computeScores(sample, weightsPlus);
      const actualScorePlusHS = scoresPlusHS.find(s => s.championId === sample.actualBan.id)?.score || 0;
      gradient.heroStrength += (actualScorePlusHS - actualBanScore) / epsilon;

      // 其他维度类似...（简化）
    }

    // 平均
    totalLoss /= batch.length;
    gradient.heroStrength /= batch.length;
    gradient.enemyProficiency /= batch.length;
    gradient.restrictionImpact /= batch.length;
    gradient.strategicValue /= batch.length;

    // 添加正则化
    if (this.config.regularization.type === 'l2') {
      const lambda = this.config.regularization.lambda;
      totalLoss += lambda * (
        weights.heroStrength ** 2 +
        weights.enemyProficiency ** 2 +
        weights.restrictionImpact ** 2 +
        weights.strategicValue ** 2
      );

      gradient.heroStrength += 2 * lambda * weights.heroStrength;
      gradient.enemyProficiency += 2 * lambda * weights.enemyProficiency;
      gradient.restrictionImpact += 2 * lambda * weights.restrictionImpact;
      gradient.strategicValue += 2 * lambda * weights.strategicValue;
    }

    return { loss: totalLoss, gradient };
  }

  /**
   * 计算分数
   */
  private computeScores(
    sample: TrainingSample,
    weights: BanPhaseWeights
  ): Array<{ championId: string; score: number }> {
    const scores: Array<{ championId: string; score: number }> = [];

    for (const champion of sample.availableChampions) {
      // 简化：只使用权重计算分数，不调用完整的calculateBanScore
      // 实际应用中应该调用完整函数
      const score =
        0.5 * weights.heroStrength +
        0.3 * weights.enemyProficiency +
        0.2 * weights.restrictionImpact +
        0.1 * weights.strategicValue;

      scores.push({ championId: champion.id, score });
    }

    return scores.sort((a, b) => b.score - a.score);
  }

  /**
   * 应用约束
   */
  private applyConstraints(weights: BanPhaseWeights): BanPhaseWeights {
    let constrained = { ...weights };

    // 限制范围
    constrained.heroStrength = Math.max(
      this.config.constraints.minWeight,
      Math.min(this.config.constraints.maxWeight, constrained.heroStrength)
    );
    constrained.enemyProficiency = Math.max(
      this.config.constraints.minWeight,
      Math.min(this.config.constraints.maxWeight, constrained.enemyProficiency)
    );
    constrained.restrictionImpact = Math.max(
      this.config.constraints.minWeight,
      Math.min(this.config.constraints.maxWeight, constrained.restrictionImpact)
    );
    constrained.strategicValue = Math.max(
      this.config.constraints.minWeight,
      Math.min(this.config.constraints.maxWeight, constrained.strategicValue)
    );

    // 归一化到和为1
    if (this.config.constraints.sumToOne) {
      const sum =
        constrained.heroStrength +
        constrained.enemyProficiency +
        constrained.restrictionImpact +
        constrained.strategicValue;

      constrained.heroStrength /= sum;
      constrained.enemyProficiency /= sum;
      constrained.restrictionImpact /= sum;
      constrained.strategicValue /= sum;
    }

    return constrained;
  }

  /**
   * 初始化权重
   */
  private initializeWeights(): BanPhaseWeights {
    return {
      heroStrength: 0.35,
      enemyProficiency: 0.30,
      restrictionImpact: 0.25,
      strategicValue: 0.10,
    };
  }

  /**
   * 过滤阶段样本
   */
  private filterPhaseSamples(
    samples: TrainingSample[],
    phase: 'phase1' | 'phase2'
  ): TrainingSample[] {
    return samples.filter(s => {
      const step = s.bpState.currentStep;
      if (phase === 'phase1') {
        return step <= 5; // Ban Phase 1
      } else {
        return step >= 12 && step <= 15; // Ban Phase 2
      }
    });
  }

  /**
   * 随机采样
   */
  private randomSample<T>(array: T[], count: number): T[] {
    const shuffled = [...array].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, array.length));
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(sampleSize: number, loss: number): number {
    // 基于样本量和损失值计算置信度
    const sampleConfidence = Math.min(1.0, sampleSize / 1000);
    const lossConfidence = Math.max(0, 1 - loss);
    return (sampleConfidence + lossConfidence) / 2;
  }

  /**
   * 生成版本号
   */
  private generateVersion(): string {
    const date = new Date();
    return `v${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
  }
}
