/**
 * Fastify server bootstrap.
 *
 * Plugins:
 *   - cors (tighten in production)
 *   - helmet (sane security headers)
 *   - rate-limit (per-tenant + per-IP, applies before auth)
 *   - structured pino logging
 *
 * Routes:
 *   - /auth/otp/request, /auth/otp/verify  → @derives(ADR-0007)
 *   - /me                                  → @derives(ADR-0007)
 *   - /workers/:id/mark-absent             → @derives(data-flow §5)
 *   - /leave-requests/:id/{approve,reject} → @derives(data-flow §5)
 *   - /sites/:id/complaints                → @derives(data-flow §5)
 *   - /swap-requests                       → @derives(data-flow §5)
 *
 * @derives(ADR-0004)
 */

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

import { registerAuthRoutes } from './routes/auth.js';
import { registerMeRoutes } from './routes/me.js';
import { registerWorkerRoutes } from './routes/workers.js';
import { registerLeaveRequestRoutes } from './routes/leave-requests.js';
import { registerSitesRoutes } from './routes/sites.js';
import { registerSwapRequestRoutes } from './routes/swap-requests.js';

/**
 * Build a Fastify instance with all plugins + routes wired.
 * Used by both `dev` server (server.ts:main) and integration tests.
 *
 * @derives(ADR-0004)
 */
export async function buildServer(): Promise<FastifyInstance> {
  // Refuse to boot if the OTP bypass is on in production — magic code "123456"
  // would let anyone log in as anyone.
  if (process.env.NODE_ENV === 'production' && process.env.AXHY_OTP_BYPASS === '1') {
    throw new Error(
      'AXHY_OTP_BYPASS=1 is set in production. Refusing to boot — unset before deploy.',
    );
  }

  const app = Fastify({
    logger:
      process.env.NODE_ENV === 'production'
        ? { level: 'info' }
        : { level: 'debug', transport: { target: 'pino-pretty' } },
    disableRequestLogging: false,
    bodyLimit: 5 * 1024 * 1024, // 5MB — voice notes upload via signed URL, not JSON
  });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(helmet);
  await app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_TENANT_REQUESTS_PER_MIN ?? 100),
    timeWindow: '1 minute',
  });

  app.get('/health', async () => ({ ok: true, version: '0.0.1', ts: new Date().toISOString() }));
  await registerAuthRoutes(app);
  await registerMeRoutes(app);
  await registerWorkerRoutes(app);
  await registerLeaveRequestRoutes(app);
  await registerSitesRoutes(app);
  await registerSwapRequestRoutes(app);

  return app;
}

/**
 * Start the server when invoked directly (apps/backend/src/index.ts).
 *
 * @derives(ADR-0004)
 */
export async function startServer(): Promise<void> {
  const app = await buildServer();
  const port = Number(process.env.PORT ?? 4000);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`[axhy-backend] listening on :${port}`);
}
