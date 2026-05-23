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
 *   - /visits/:id/end                      → @derives(data-flow §5)
 *   - /calendar                            → @derives(master-plan §G)
 *   - /supervisor/summary                  → @derives(master-plan §G)
 *   - /supervisor/updates                  → @derives(master-plan §G)
 *   - /supervisor/updates/:id/acknowledge  → @derives(master-plan §G)
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
import { registerWorkerConsentRoutes } from './routes/worker-consent.js';
import { registerWorkerTodayRoutes } from './routes/worker-today.js';
import { registerWorkerVisitRoutes } from './routes/worker-visit.js';
import { registerWorkerCapturesRoutes } from './routes/worker-captures.js';
import { registerWorkerRoutes } from './routes/workers.js';
import { registerLeaveRequestRoutes } from './routes/leave-requests.js';
import { registerSitesRoutes } from './routes/sites.js';
import { registerSwapRequestRoutes } from './routes/swap-requests.js';
import { registerCalendarRoutes } from './routes/calendar.js';
import { registerAssignmentRoutes } from './routes/assignments.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerDecisionsRoutes } from './routes/decisions.js';
import { registerSupervisorTodayRoutes } from './routes/supervisor-today.js';
import { registerSupervisorActivityRoutes } from './routes/supervisor-activity.js';
import { registerSupervisorDecisionsRoutes } from './routes/supervisor-decisions.js';
import { registerSupervisorContextRoutes } from './routes/supervisor-context.js';
import { registerSupervisorSummaryRoutes } from './routes/supervisor-summary.js';
import { registerSupervisorUpdatesRoutes } from './routes/supervisor-updates.js';
import { registerChatTranscribeRoutes } from './routes/chat-transcribe.js';
import { registerComplaintRoutes } from './routes/complaints.js';
import { registerReplacementInviteRoutes } from './routes/replacement-invites.js';
import { registerVisitsRoutes } from './routes/visits.js';
import { registerActivityRoutes } from './routes/activity.js';
import { registerAdminPolicyRoutes } from './routes/admin-policy.js';
import { registerChatReloadContextRoutes } from './routes/chat-reload-context.js';

/**
 * Build a Fastify instance with all plugins + routes wired.
 * Used by both `dev` server (server.ts:main) and integration tests.
 *
 * @derives(ADR-0004)
 */
export async function buildServer(): Promise<FastifyInstance> {
  // Friend review #8 (HIGH): deny-by-default for OTP bypass. Previously
  // the guard checked NODE_ENV === 'production' — if NODE_ENV was unset
  // on a misconfigured Railway deploy, the guard didn't fire AND bypass
  // was active, letting anyone log in with code 123456. Now: bypass is
  // ONLY honored when NODE_ENV is exactly 'development' or 'test'.
  if (process.env.AXHY_OTP_BYPASS === '1') {
    const env = process.env.NODE_ENV;
    if (env !== 'development' && env !== 'test') {
      throw new Error(
        `AXHY_OTP_BYPASS=1 requires NODE_ENV=development|test, got ${env ?? '<unset>'}. Refusing to boot.`,
      );
    }
  }

  const app = Fastify({
    logger:
      process.env.NODE_ENV === 'production'
        ? { level: 'info' }
        : { level: 'debug', transport: { target: 'pino-pretty' } },
    disableRequestLogging: false,
    bodyLimit: 5 * 1024 * 1024, // 5MB — voice notes upload via signed URL, not JSON
  });

  // Friend review #6 (HIGH): CORS whitelist in production. The previous
  // `origin: true` reflected the Origin header back, letting any website
  // make authenticated cross-origin requests if a supervisor was logged
  // in elsewhere. Production now: explicit whitelist from
  // `AXHY_CORS_ORIGINS` (comma-separated). Dev defaults to `true`
  // (reflect-back) so Expo dev server + localhost just works.
  const corsOriginsRaw = process.env.AXHY_CORS_ORIGINS ?? '';
  const corsOrigins = corsOriginsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const corsOrigin: boolean | string[] =
    process.env.NODE_ENV === 'production'
      ? corsOrigins.length > 0
        ? corsOrigins
        : false // production with no whitelist = no CORS (safer than wildcard)
      : true;
  await app.register(cors, { origin: corsOrigin, credentials: true });
  await app.register(helmet);
  // Friend review #14 (MEDIUM): two rate-limit layers serve DIFFERENT
  // dimensions and are documented here so they're not mysterious:
  //   - @fastify/rate-limit (in-memory, per-IP, 100/min) = edge DDoS guard.
  //     Coarse, per-replica, intentional — a single bad IP can't flood
  //     any one replica even if Redis is down.
  //   - lib/redis-rate-limit.ts (Redis sliding window, per-userId+route) =
  //     business rate limit. Distributed, per-route, what the product
  //     spec mandates (30 chat msgs/min/supervisor, etc).
  // No double-charging: the dimensions are orthogonal (IP vs userId).
  await app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_TENANT_REQUESTS_PER_MIN ?? 100),
    timeWindow: '1 minute',
  });

  // Friend review #13 (MEDIUM): /health pings Redis + Postgres so the
  // load balancer doesn't route to an instance with dead downstream
  // connections. Returns 503 with the failing dep on outage.
  app.get('/health', async (_req, reply) => {
    const { prisma } = await import('./lib/prisma.js');
    const checks: Record<string, 'ok' | 'fail'> = {};
    try {
      await prisma.$queryRawUnsafe('SELECT 1');
      checks.postgres = 'ok';
    } catch {
      checks.postgres = 'fail';
    }
    try {
      const { getRedis } = await import('./lib/redis.js');
      const pong = await getRedis().ping();
      checks.redis = pong === 'PONG' ? 'ok' : 'fail';
    } catch {
      checks.redis = 'fail';
    }
    const allOk = Object.values(checks).every((v) => v === 'ok');
    reply.code(allOk ? 200 : 503).send({
      ok: allOk,
      version: '0.0.1',
      ts: new Date().toISOString(),
      checks,
    });
  });
  await registerAuthRoutes(app);
  await registerMeRoutes(app);
  await registerWorkerConsentRoutes(app);
  await registerWorkerTodayRoutes(app);
  await registerWorkerVisitRoutes(app);
  await registerWorkerCapturesRoutes(app);
  await registerWorkerRoutes(app);
  await registerLeaveRequestRoutes(app);
  await registerSitesRoutes(app);
  await registerSwapRequestRoutes(app);
  await registerCalendarRoutes(app);
  await registerAssignmentRoutes(app);
  await registerChatRoutes(app);
  await registerChatTranscribeRoutes(app);
  await registerDecisionsRoutes(app);
  await registerSupervisorTodayRoutes(app);
  await registerSupervisorActivityRoutes(app);
  await registerSupervisorDecisionsRoutes(app);
  await registerSupervisorContextRoutes(app);
  await registerSupervisorSummaryRoutes(app);
  await registerSupervisorUpdatesRoutes(app);
  await registerComplaintRoutes(app);
  await registerReplacementInviteRoutes(app);
  await registerVisitsRoutes(app);
  await registerActivityRoutes(app);
  await registerAdminPolicyRoutes(app);
  await registerChatReloadContextRoutes(app);

  return app;
}

/**
 * Start the server when invoked directly (apps/backend/src/index.ts).
 *
 * Wires SIGTERM + SIGINT handlers so Railway redeploys drain in-flight
 * AI calls (up to 50s timeout per call) and close the Redis + Prisma
 * connections cleanly. Friend review #15 — without this, in-flight
 * `persistChatTurn` writes can be killed mid-transaction.
 *
 * @derives(ADR-0004)
 * @derives(friend review #15)
 */
export async function startServer(): Promise<void> {
  const app = await buildServer();
  const port = Number(process.env.PORT ?? 4000);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`[axhy-backend] listening on :${port}`);

  // Graceful shutdown — Railway sends SIGTERM 30s before SIGKILL. Drain
  // in-flight requests, close DB + Redis, then exit. Idempotent: a second
  // signal during drain is a no-op (already shutting down).
  //
  // Friend review #16 (MEDIUM): each phase has a hard deadline. An
  // in-flight AI call that hangs past the drain budget would otherwise
  // hold the process open until SIGKILL — wasted drain time. We give
  // Fastify 25s (most of Railway's 30s window), Redis 2s, Prisma 2s.
  let shuttingDown = false;
  const SHUTDOWN_FASTIFY_MS = Number(process.env.SHUTDOWN_FASTIFY_MS ?? 25_000);
  const SHUTDOWN_REDIS_MS = Number(process.env.SHUTDOWN_REDIS_MS ?? 2_000);
  const SHUTDOWN_PRISMA_MS = Number(process.env.SHUTDOWN_PRISMA_MS ?? 2_000);
  async function raceTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const t = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        app.log.warn({ label, ms }, `[axhy-backend] ${label} drain timed out — forcing next phase`);
        resolve();
      }, ms);
    });
    await Promise.race([p.then(() => undefined), t]);
    if (timer) clearTimeout(timer);
  }
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, '[axhy-backend] received shutdown signal, draining...');
    await raceTimeout(app.close(), SHUTDOWN_FASTIFY_MS, 'fastify').catch((err) =>
      app.log.error({ err }, '[axhy-backend] error draining fastify'),
    );
    app.log.info('[axhy-backend] fastify drained');
    try {
      const { closeRedis } = await import('./lib/redis.js');
      await raceTimeout(closeRedis(), SHUTDOWN_REDIS_MS, 'redis');
      app.log.info('[axhy-backend] redis closed');
    } catch (err) {
      app.log.error({ err }, '[axhy-backend] error closing redis');
    }
    try {
      const { prisma } = await import('./lib/prisma.js');
      await raceTimeout(prisma.$disconnect(), SHUTDOWN_PRISMA_MS, 'prisma');
      app.log.info('[axhy-backend] prisma disconnected');
    } catch (err) {
      app.log.error({ err }, '[axhy-backend] error disconnecting prisma');
    }
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}
