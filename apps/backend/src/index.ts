/**
 * apps/backend
 *
 * Axhy backend service entrypoint. Boots Fastify with all routes wired.
 *
 * @derives(ADR-0004)
 */

import { initSentry, captureError, flushSentry } from './lib/sentry.js';
import { startServer } from './server.js';

// Init before the server boots so default integrations catch
// uncaughtException/unhandledRejection too. No-op without SENTRY_DSN.
const sentryOn = initSentry();
if (sentryOn) console.log('[axhy-backend] sentry enabled');

startServer().catch(async (err) => {
  console.error('[axhy-backend] fatal startup error:', err);
  captureError(err, { phase: 'startup' });
  await flushSentry();
  process.exit(1);
});
