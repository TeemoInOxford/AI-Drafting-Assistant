/**
 * Beta Distribution Quantile Function
 *
 * Computes the quantile (inverse CDF) of the Beta distribution.
 * Used for computing credible intervals in Bayesian analysis.
 *
 * This implementation uses:
 * 1. Regularized incomplete beta function I_x(a,b)
 * 2. Bisection method to invert the CDF
 *
 * All computations are deterministic.
 */

/**
 * Log Gamma function using Lanczos approximation
 * More numerically stable than computing gamma directly
 */
function logGamma(z: number): number {
  if (z < 0.5) {
    // Reflection formula: Gamma(z) * Gamma(1-z) = pi / sin(pi*z)
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }

  z -= 1;

  // Lanczos coefficients for g=7
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }

  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Log Beta function: log(B(a,b)) = log(Gamma(a)) + log(Gamma(b)) - log(Gamma(a+b))
 */
function logBeta(a: number, b: number): number {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

/**
 * Regularized Incomplete Beta Function I_x(a,b)
 *
 * Uses continued fraction expansion for numerical stability.
 * This is the CDF of the Beta distribution.
 *
 * I_x(a,b) = B_x(a,b) / B(a,b)
 * where B_x(a,b) is the incomplete beta function
 */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x < 0 || x > 1) {
    throw new Error(`x must be in [0,1], got ${x}`);
  }
  if (a <= 0 || b <= 0) {
    throw new Error(`a and b must be positive, got a=${a}, b=${b}`);
  }

  // Edge cases
  if (x === 0) return 0;
  if (x === 1) return 1;

  // Use symmetry relation for better convergence:
  // I_x(a,b) = 1 - I_{1-x}(b,a)
  // Use the form where x < (a+1)/(a+b+2) for faster convergence
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - incompleteBeta(1 - x, b, a);
  }

  // Continued fraction using Lentz's algorithm
  const maxIterations = 200;
  const epsilon = 1e-14;
  const tiny = 1e-30;

  // Front factor: x^a * (1-x)^b / (a * B(a,b))
  const lnFront = a * Math.log(x) + b * Math.log(1 - x) - logBeta(a, b) - Math.log(a);
  const front = Math.exp(lnFront);

  // Continued fraction coefficients
  // a_m = numerator coefficients, b_m = 1 for all m
  function cfCoeff(m: number): number {
    if (m === 0) return 1;
    const k = Math.floor((m + 1) / 2);
    if (m % 2 === 1) {
      // Odd m: a_{2k-1}
      return -(a + k - 1) * (a + b + k - 1) * x / ((a + 2 * k - 2) * (a + 2 * k - 1));
    } else {
      // Even m: a_{2k}
      return k * (b - k) * x / ((a + 2 * k - 1) * (a + 2 * k));
    }
  }

  // Lentz's algorithm for continued fraction
  let f = tiny;
  let C = tiny;
  let D = 0;

  for (let m = 0; m < maxIterations; m++) {
    const am = cfCoeff(m);
    const bm = 1;

    D = bm + am * D;
    if (Math.abs(D) < tiny) D = tiny;
    D = 1 / D;

    C = bm + am / C;
    if (Math.abs(C) < tiny) C = tiny;

    const delta = C * D;
    f *= delta;

    if (Math.abs(delta - 1) < epsilon) {
      break;
    }
  }

  return front * f;
}

/**
 * Beta distribution CDF
 * P(X <= x) where X ~ Beta(a, b)
 */
export function betaCDF(x: number, a: number, b: number): number {
  return incompleteBeta(x, a, b);
}

/**
 * Beta distribution quantile (inverse CDF)
 *
 * Finds x such that P(X <= x) = p where X ~ Beta(a, b)
 *
 * Uses bisection method for robustness and determinism.
 *
 * @param p - probability level (0 < p < 1)
 * @param a - first shape parameter (a > 0)
 * @param b - second shape parameter (b > 0)
 * @returns quantile value in [0, 1]
 */
export function betaQuantile(p: number, a: number, b: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  if (a <= 0 || b <= 0) {
    throw new Error(`Shape parameters must be positive: a=${a}, b=${b}`);
  }

  // Bisection method
  const maxIterations = 100;
  const tolerance = 1e-10;

  let lo = 0;
  let hi = 1;

  for (let i = 0; i < maxIterations; i++) {
    const mid = (lo + hi) / 2;
    const cdf = betaCDF(mid, a, b);

    if (Math.abs(cdf - p) < tolerance) {
      return mid;
    }

    if (cdf < p) {
      lo = mid;
    } else {
      hi = mid;
    }

    // Check for convergence
    if (hi - lo < tolerance) {
      return (lo + hi) / 2;
    }
  }

  return (lo + hi) / 2;
}

/**
 * Compute the lower bound of a credible interval for a proportion
 *
 * Given observed successes x out of n trials, and a Beta prior Beta(a0, b0),
 * compute the lower bound of a (1-alpha) credible interval.
 *
 * @param x - number of successes (bans observed)
 * @param n - number of trials (games played)
 * @param a0 - prior alpha parameter
 * @param b0 - prior beta parameter
 * @param alpha - significance level (default 0.20 for 80% CI)
 * @returns lower bound of the credible interval
 */
export function credibleLowerBound(
  x: number,
  n: number,
  a0: number,
  b0: number,
  alpha: number = 0.20
): number {
  // Posterior parameters: Beta(a0 + x, b0 + (n - x))
  const aPost = a0 + x;
  const bPost = b0 + (n - x);

  // Lower bound is the alpha/2 quantile for two-sided,
  // or alpha quantile for one-sided lower bound
  // We use alpha directly for the lower bound of an 80% CI
  return betaQuantile(alpha / 2, aPost, bPost);
}

/**
 * Compute prior parameters from expected rate
 *
 * @param exp - expected rate (baseline ban rate)
 * @param m - prior strength (pseudo-observations)
 * @returns { a0, b0 } prior parameters
 */
export function computePrior(
  exp: number,
  m: number
): { a0: number; b0: number } {
  // Ensure exp is valid
  const safeExp = Math.max(0.001, Math.min(0.999, exp));
  return {
    a0: safeExp * m,
    b0: (1 - safeExp) * m,
  };
}
