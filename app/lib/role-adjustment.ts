/**
 * @deprecated This module is no longer used in runtime.
 *
 * The role adjustment logic (patch/region calibration) has been superseded by:
 * - weighted-role-posteriors.json which already incorporates:
 *   - Beta (patch time decay)
 *   - Gamma (maturity)
 *   - Team weight sensitivity
 *   - Delta patch cap
 *
 * Role probabilities are now observed values from professional matches,
 * not inferred posteriors requiring patch/region adjustment.
 *
 * This file is kept for historical reference only. Do not import or use.
 */

// No exports - this module is deprecated
export {};
