/**
 * BeliefUpdate Algorithm
 * Implements Bayesian inference to update beliefs about opponent strategies
 *
 * Formula: P(θ|a) ∝ P(a|θ) × P(θ)
 * - θ: Opponent strategy/style
 * - a: Observed action
 * - P(θ|a): Posterior belief
 * - P(a|θ): Likelihood function
 * - P(θ): Prior belief
 */

import { Champion } from '../types';
import {
  OpponentStyle,
  CFRBanPickState,
  BeliefUpdateParams,
  BeliefUpdateResult
} from '../types';
import { OpponentModelManager } from '../models/OpponentModel';

export class BeliefUpdate {
  private learningRate: number;

  constructor(learningRate: number = 0.1) {
    this.learningRate = learningRate;
  }

  /**
   * Update beliefs based on observed action
   */
  public update(params: BeliefUpdateParams): BeliefUpdateResult {
    const { priorBeliefs, observedAction, learningRate } = params;
    const effectiveLearningRate = learningRate || this.learningRate;

    // Calculate likelihood P(a|θ) for each opponent style
    const likelihoods = this.calculateLikelihoods(
      observedAction.champion,
      observedAction.phase,
      observedAction.context
    );

    // Calculate posterior beliefs using Bayes' rule
    const posteriorBeliefs = this.calculatePosterior(priorBeliefs, likelihoods);

    // Apply learning rate (smooth update)
    const smoothedBeliefs = this.smoothUpdate(
      priorBeliefs,
      posteriorBeliefs,
      effectiveLearningRate
    );

    // Calculate surprise score (KL divergence)
    const surpriseScore = this.calculateSurprise(priorBeliefs, posteriorBeliefs);

    // Calculate confidence (inverse entropy)
    const confidence = this.calculateConfidence(smoothedBeliefs);

    return {
      posteriorBeliefs: smoothedBeliefs,
      likelihood: likelihoods,
      surpriseScore,
      confidence,
    };
  }

  /**
   * Calculate likelihood P(a|θ) for each opponent style
   */
  private calculateLikelihoods(
    champion: Champion,
    phase: 'ban' | 'pick',
    context: CFRBanPickState
  ): Map<OpponentStyle, number> {
    const likelihoods = new Map<OpponentStyle, number>();

    // Aggressive: Prefers carries, assassins, fighters
    likelihoods.set('aggressive', this.calculateAggressiveLikelihood(champion, phase, context));

    // Defensive: Prefers tanks, supports, utility
    likelihoods.set('defensive', this.calculateDefensiveLikelihood(champion, phase, context));

    // Meta follower: Prefers high win rate champions
    likelihoods.set('meta_follower', this.calculateMetaLikelihood(champion, phase, context));

    // Counter focused: Prefers counter picks
    likelihoods.set('counter_focused', this.calculateCounterLikelihood(champion, phase, context));

    // Flex master: Prefers multi-role champions
    likelihoods.set('flex_master', this.calculateFlexLikelihood(champion, phase, context));

    // Unknown: Uniform likelihood
    likelihoods.set('unknown', 0.5);

    return likelihoods;
  }

  /**
   * Calculate likelihood for aggressive style
   */
  private calculateAggressiveLikelihood(
    champion: Champion,
    phase: 'ban' | 'pick',
    context: CFRBanPickState
  ): number {
    let likelihood = 0.5; // Base likelihood

    // Check if champion is a carry/damage dealer
    const carryTags = ['Assassin', 'Marksman', 'Fighter', 'Mage'];
    const isCarry = champion.tags.some(tag => carryTags.includes(tag));

    if (phase === 'pick' && isCarry) {
      likelihood = 0.8;
    } else if (phase === 'ban' && isCarry) {
      // Aggressive players ban enemy carries
      likelihood = 0.7;
    } else {
      likelihood = 0.3;
    }

    return likelihood;
  }

  /**
   * Calculate likelihood for defensive style
   */
  private calculateDefensiveLikelihood(
    champion: Champion,
    phase: 'ban' | 'pick',
    context: CFRBanPickState
  ): number {
    let likelihood = 0.5;

    const defensiveTags = ['Tank', 'Support'];
    const isDefensive = champion.tags.some(tag => defensiveTags.includes(tag));

    if (phase === 'pick' && isDefensive) {
      likelihood = 0.8;
    } else if (phase === 'ban' && !isDefensive) {
      // Defensive players ban enemy threats
      likelihood = 0.7;
    } else {
      likelihood = 0.3;
    }

    return likelihood;
  }

  /**
   * Calculate likelihood for meta follower style
   */
  private calculateMetaLikelihood(
    champion: Champion,
    phase: 'ban' | 'pick',
    context: CFRBanPickState
  ): number {
    // Placeholder - would integrate with champion stats
    // Meta followers pick/ban high win rate champions
    return 0.6;
  }

  /**
   * Calculate likelihood for counter focused style
   */
  private calculateCounterLikelihood(
    champion: Champion,
    phase: 'ban' | 'pick',
    context: CFRBanPickState
  ): number {
    // Placeholder - would integrate with counter relationship data
    // Counter focused players pick counters to enemy picks
    let likelihood = 0.5;

    if (phase === 'pick' && context.theirPicks.length > 0) {
      // If picking after enemy, more likely to be counter pick
      likelihood = 0.7;
    }

    return likelihood;
  }

  /**
   * Calculate likelihood for flex master style
   */
  private calculateFlexLikelihood(
    champion: Champion,
    phase: 'ban' | 'pick',
    context: CFRBanPickState
  ): number {
    let likelihood = 0.5;

    const isFlexible = champion.positions.length >= 2;

    if (phase === 'pick' && isFlexible) {
      likelihood = 0.8;
    } else if (phase === 'pick' && !isFlexible) {
      likelihood = 0.3;
    }

    return likelihood;
  }

  /**
   * Calculate posterior beliefs using Bayes' rule
   * P(θ|a) ∝ P(a|θ) × P(θ)
   */
  private calculatePosterior(
    priorBeliefs: Map<OpponentStyle, number>,
    likelihoods: Map<OpponentStyle, number>
  ): Map<OpponentStyle, number> {
    const posterior = new Map<OpponentStyle, number>();
    let sum = 0;

    // Calculate unnormalized posterior
    for (const [style, prior] of priorBeliefs) {
      const likelihood = likelihoods.get(style) || 0.5;
      const unnormalized = likelihood * prior;
      posterior.set(style, unnormalized);
      sum += unnormalized;
    }

    // Normalize to sum to 1
    if (sum > 0) {
      for (const [style, value] of posterior) {
        posterior.set(style, value / sum);
      }
    }

    return posterior;
  }

  /**
   * Smooth update using learning rate
   * new_belief = (1 - α) × prior + α × posterior
   */
  private smoothUpdate(
    priorBeliefs: Map<OpponentStyle, number>,
    posteriorBeliefs: Map<OpponentStyle, number>,
    learningRate: number
  ): Map<OpponentStyle, number> {
    const smoothed = new Map<OpponentStyle, number>();

    for (const [style, prior] of priorBeliefs) {
      const posterior = posteriorBeliefs.get(style) || prior;
      const smoothedValue = (1 - learningRate) * prior + learningRate * posterior;
      smoothed.set(style, smoothedValue);
    }

    return smoothed;
  }

  /**
   * Calculate surprise score (KL divergence)
   * Measures how unexpected the observation was
   */
  private calculateSurprise(
    priorBeliefs: Map<OpponentStyle, number>,
    posteriorBeliefs: Map<OpponentStyle, number>
  ): number {
    let klDivergence = 0;

    for (const [style, posterior] of posteriorBeliefs) {
      const prior = priorBeliefs.get(style) || 0.001;
      if (posterior > 0 && prior > 0) {
        klDivergence += posterior * Math.log(posterior / prior);
      }
    }

    // Normalize to [0, 1]
    const maxKL = Math.log(posteriorBeliefs.size);
    return Math.min(1, klDivergence / maxKL);
  }

  /**
   * Calculate confidence (inverse entropy)
   */
  private calculateConfidence(beliefs: Map<OpponentStyle, number>): number {
    let entropy = 0;

    for (const prob of beliefs.values()) {
      if (prob > 0) {
        entropy -= prob * Math.log2(prob);
      }
    }

    // Normalize entropy to [0, 1]
    const maxEntropy = Math.log2(beliefs.size);
    const normalizedEntropy = entropy / maxEntropy;

    // Confidence is inverse of entropy
    return 1 - normalizedEntropy;
  }

  /**
   * Set learning rate
   */
  public setLearningRate(rate: number): void {
    this.learningRate = Math.max(0, Math.min(1, rate));
  }

  /**
   * Get learning rate
   */
  public getLearningRate(): number {
    return this.learningRate;
  }
}
