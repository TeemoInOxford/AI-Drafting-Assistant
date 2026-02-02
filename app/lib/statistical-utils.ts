/**
 * Statistical Utilities for AI Drafting Assistant
 * 统计工具函数 - 用于提升AI推荐的准确性和可靠性
 */

/**
 * Calculate Bayesian confidence interval using Wilson Score
 * 使用Wilson Score计算贝叶斯置信区间
 *
 * @param successes - Number of successes (e.g., wins)
 * @param total - Total number of trials (e.g., total games)
 * @param confidenceLevel - Confidence level (default 0.95 for 95%)
 * @returns Lower bound of confidence interval
 */
export function calculateWilsonScore(
  successes: number,
  total: number,
  confidenceLevel: number = 0.95
): number {
  if (total === 0) return 0;

  const p = successes / total;
  const z = getZScore(confidenceLevel);
  const n = total;

  const denominator = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / denominator;

  // Return lower bound (conservative estimate)
  return Math.max(0, center - margin);
}

/**
 * Get Z-score for confidence level
 */
function getZScore(confidenceLevel: number): number {
  // Common confidence levels
  const zScores: Record<number, number> = {
    0.90: 1.645,
    0.95: 1.96,
    0.99: 2.576,
  };

  return zScores[confidenceLevel] || 1.96;
}

/**
 * Calculate Bayesian confidence for player proficiency
 * 计算选手熟练度的贝叶斯置信度
 *
 * @param totalGames - Total games played with champion
 * @param winRate - Observed win rate (0-1)
 * @param priorWinRate - Prior belief about win rate (default 0.5)
 * @param priorWeight - Weight of prior belief (default 10 games)
 * @returns Confidence score (0-1)
 */
export function calculateBayesianConfidence(
  totalGames: number,
  winRate: number,
  priorWinRate: number = 0.5,
  priorWeight: number = 10
): number {
  if (totalGames === 0) return 0;

  // Bayesian smoothing
  const smoothedWinRate =
    (winRate * totalGames + priorWinRate * priorWeight) /
    (totalGames + priorWeight);

  // Confidence increases with sample size
  const confidence = totalGames / (totalGames + priorWeight);

  // Use Wilson score for additional confidence adjustment
  const wilsonScore = calculateWilsonScore(
    Math.round(winRate * totalGames),
    totalGames,
    0.95
  );

  // Combine both measures
  return confidence * (wilsonScore / Math.max(winRate, 0.01));
}

/**
 * Apply temporal decay to data based on age
 * 根据数据年龄应用时间衰减
 *
 * @param daysSinceData - Days since the data was collected
 * @param halfLifeDays - Half-life in days (default 14 days = 2 weeks)
 * @returns Decay factor (0-1)
 */
export function calculateTemporalDecay(
  daysSinceData: number,
  halfLifeDays: number = 14
): number {
  // Exponential decay: factor = exp(-days / halfLife)
  // After halfLife days, factor = 0.5
  // After 2*halfLife days, factor = 0.25
  return Math.exp(-daysSinceData / halfLifeDays);
}

/**
 * Apply temporal decay to champion stats
 * 对英雄统计数据应用时间衰减
 *
 * @param stats - Original stats object
 * @param lastPatchDate - Date of last patch
 * @param halfLifeDays - Half-life for decay (default 14 days)
 * @returns Adjusted stats with decay applied
 */
export function applyTemporalDecayToStats<T extends { confidence?: number; weight?: number }>(
  stats: T,
  lastPatchDate: Date,
  halfLifeDays: number = 14
): T {
  const daysSincePatch =
    (Date.now() - lastPatchDate.getTime()) / (1000 * 60 * 60 * 24);
  const decayFactor = calculateTemporalDecay(daysSincePatch, halfLifeDays);

  return {
    ...stats,
    confidence: (stats.confidence || 1) * decayFactor,
    weight: (stats.weight || 1) * decayFactor,
  };
}

/**
 * Calculate confidence from sample size
 * 从样本量计算置信度
 *
 * @param sampleSize - Number of samples
 * @param minSamples - Minimum samples for full confidence (default 30)
 * @returns Confidence score (0-1)
 */
export function calculateSampleConfidence(
  sampleSize: number,
  minSamples: number = 30
): number {
  if (sampleSize >= minSamples) return 1.0;
  if (sampleSize === 0) return 0;

  // Logarithmic growth: confidence grows quickly at first, then slows
  return Math.log(sampleSize + 1) / Math.log(minSamples + 1);
}

/**
 * Combine multiple confidence scores
 * 组合多个置信度分数
 *
 * @param confidences - Array of confidence scores (0-1)
 * @param weights - Optional weights for each confidence
 * @returns Combined confidence score (0-1)
 */
export function combineConfidences(
  confidences: number[],
  weights?: number[]
): number {
  if (confidences.length === 0) return 0;

  if (weights && weights.length === confidences.length) {
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    if (totalWeight === 0) return 0;

    const weightedSum = confidences.reduce(
      (sum, conf, i) => sum + conf * weights[i],
      0
    );
    return weightedSum / totalWeight;
  }

  // Unweighted: use geometric mean (more conservative)
  const product = confidences.reduce((prod, conf) => prod * conf, 1);
  return Math.pow(product, 1 / confidences.length);
}

/**
 * Calculate Shannon entropy for uncertainty quantification
 * 计算香农熵用于不确定性量化
 *
 * @param probabilities - Array of probabilities (should sum to 1)
 * @returns Entropy value (0 = certain, higher = more uncertain)
 */
export function calculateEntropy(probabilities: number[]): number {
  if (probabilities.length === 0) return 0;

  // Normalize probabilities
  const sum = probabilities.reduce((s, p) => s + p, 0);
  if (sum === 0) return 0;

  const normalized = probabilities.map(p => p / sum);

  // Calculate entropy: H = -Σ(p * log2(p))
  let entropy = 0;
  for (const p of normalized) {
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }

  return entropy;
}

/**
 * Convert entropy to confidence
 * 将熵转换为置信度
 *
 * @param entropy - Entropy value
 * @param maxEntropy - Maximum possible entropy (default log2(n) for n options)
 * @returns Confidence score (0-1)
 */
export function entropyToConfidence(
  entropy: number,
  maxEntropy: number
): number {
  if (maxEntropy === 0) return 1;
  return 1 - entropy / maxEntropy;
}

/**
 * Bayesian update for belief distribution
 * 贝叶斯更新信念分布
 *
 * @param prior - Prior probability distribution
 * @param likelihood - Likelihood of observation given each hypothesis
 * @returns Posterior probability distribution (normalized)
 */
export function bayesianUpdate(
  prior: Record<string, number>,
  likelihood: Record<string, number>
): Record<string, number> {
  const posterior: Record<string, number> = {};
  let sum = 0;

  // Calculate unnormalized posterior
  for (const key in prior) {
    const value = prior[key] * (likelihood[key] || 0);
    posterior[key] = value;
    sum += value;
  }

  // Normalize
  if (sum > 0) {
    for (const key in posterior) {
      posterior[key] /= sum;
    }
  }

  return posterior;
}

/**
 * Calculate moving average with exponential decay
 * 计算指数衰减的移动平均
 *
 * @param values - Array of values (most recent last)
 * @param decayRate - Decay rate (0-1, higher = more weight on recent)
 * @returns Weighted average
 */
export function exponentialMovingAverage(
  values: number[],
  decayRate: number = 0.3
): number {
  if (values.length === 0) return 0;

  let weightedSum = 0;
  let weightSum = 0;

  for (let i = 0; i < values.length; i++) {
    const age = values.length - 1 - i;
    const weight = Math.exp(-age * decayRate);
    weightedSum += values[i] * weight;
    weightSum += weight;
  }

  return weightSum > 0 ? weightedSum / weightSum : 0;
}
