/**
 * Root ESLint flat config for Axhy v3.
 * Re-exports the shared config from @axhy/eslint-config-axhy.
 *
 * @derives(ADR-0019)
 */

import axhyConfig from './packages/eslint-config-axhy/src/index.js';

export default axhyConfig;
