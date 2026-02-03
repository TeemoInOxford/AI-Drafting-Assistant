/**
 * @deprecated This test script is no longer valid.
 *
 * The role adjustment layer tested here was designed for the old Bayesian
 * inference model. The current system uses weighted-role-posteriors.json
 * where roles are observed values, not inferred.
 *
 * To test role data, use:
 *   npx tsx -e "import {loadWeightedRolePosteriors} from './app/lib/weighted-role-loader'; ..."
 *
 * This file is kept for historical reference only.
 */

console.error('This script is deprecated. See file header for alternatives.');
process.exit(1);
