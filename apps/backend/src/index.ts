/**
 * apps/backend
 *
 * Axhy backend service entrypoint. Boots Fastify with all routes wired.
 *
 * @derives(ADR-0004)
 */

import { startServer } from './server.js';

startServer().catch((err) => {
  console.error('[axhy-backend] fatal startup error:', err);
  process.exit(1);
});
