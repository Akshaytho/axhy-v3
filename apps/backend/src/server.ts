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
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';

import { startDispatcher } from './dispatcher/index.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerAuthRefreshRoutes } from './routes/auth-refresh.js';
import { registerMeRoutes } from './routes/me.js';
import { registerWorkerConsentRoutes } from './routes/worker-consent.js';
import { registerWorkerHistoryRoutes } from './routes/worker-history.js';
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
import { registerSupervisorLivingDocRoutes } from './routes/supervisor-living-doc.js';
import { registerSupervisorSummaryRoutes } from './routes/supervisor-summary.js';
import { registerSupervisorUpdatesRoutes } from './routes/supervisor-updates.js';
import { registerChatTranscribeRoutes } from './routes/chat-transcribe.js';
import { registerComplaintRoutes } from './routes/complaints.js';
import { registerReplacementInviteRoutes } from './routes/replacement-invites.js';
import { registerVisitsRoutes } from './routes/visits.js';
import { registerActivityRoutes } from './routes/activity.js';
import { registerAdminPolicyRoutes } from './routes/admin-policy.js';
import { registerChatReloadContextRoutes } from './routes/chat-reload-context.js';
import { registerChatHistoryRoutes } from './routes/chat-history.js';
import { registerWorkerSubmitRoutes } from './routes/worker-submit.js';
import { registerWorkerLifecycleRoutes } from './routes/worker-lifecycle.js';
import { registerWorkerLeaveRoutes } from './routes/worker-leave.js';
import { registerAdminMembershipRoutes } from './routes/admin-memberships.js';
import { registerAdminWorkerRoutes } from './routes/admin-workers.js';
import { registerAdminSiteRoutes } from './routes/admin-sites.js';
import { registerSuperAdminMembershipRoutes } from './routes/super-admin-memberships.js';
import { registerSuperAdminCompanyRoutes } from './routes/super-admin-companies.js';
import { registerAdminCompanyRoutes } from './routes/admin-company.js';

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

  // RCA-G (2026-06-04): require an explicit Redis namespace in production.
  // redis-keys.ts falls back to NODE_ENV when AXHY_REDIS_NAMESPACE is unset —
  // fine for dev/test, but if staging and prod both run NODE_ENV=production
  // against a SHARED Redis they would both resolve to the 'production:' prefix
  // and collide on OTP codes, refresh-hash hot-path keys, rate-limit windows
  // and the circuit breaker (a cross-environment security + correctness
  // incident). Mirror the OTP-bypass deny-by-default guard above: refuse to
  // boot a production server until the namespace is set to a distinct value
  // per environment (e.g. 'prod' / 'staging'). Dev/test keep the fallback so
  // local + vitest are unaffected. getRedis() is lazy (only /health +
  // shutdown), so this runs before any Redis access.
  if (process.env.NODE_ENV === 'production' && !process.env.AXHY_REDIS_NAMESPACE) {
    throw new Error(
      'AXHY_REDIS_NAMESPACE is required in production (refusing the NODE_ENV fallback so ' +
        'staging and prod cannot collide on a shared Redis). Set a distinct value per Railway ' +
        "environment, e.g. 'prod' / 'staging'. Refusing to boot.",
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
  // Multipart is registered once at the app scope because @fastify/multipart
  // is published via fastify-plugin (hoists to root) and decorates
  // `request.formData`/`request.parts`/etc — a second registration throws
  // FST_ERR_DEC_ALREADY_PRESENT. The 20 MB cap accommodates worker capture
  // photos (MAX_PHOTO_BYTES = 20 MB) which is the largest multipart payload
  // the app accepts; routes with tighter caps (e.g. chat-transcribe at 10 MB)
  // override per-call via `req.file({ limits: { fileSize: ... } })`.
  await app.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024,
      files: 1,
    },
  });
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

  // Every path param in this API is a UUID (:id, :visitId, :messageId, :siteId).
  // Reject malformed ones with a clean 400 here instead of letting
  // prisma.findUnique throw a 500 deep inside a handler (audit NEW-2).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const UUID_PARAM_NAMES = ['id', 'visitId', 'messageId', 'siteId'] as const;
  app.addHook('preValidation', async (req, reply) => {
    const params = req.params as Record<string, string | undefined> | undefined;
    if (!params) return;
    for (const key of UUID_PARAM_NAMES) {
      const value = params[key];
      if (typeof value === 'string' && !UUID_RE.test(value)) {
        return reply.code(400).send({
          error: 'BAD_PATH_PARAM',
          message: `Path parameter "${key}" must be a valid UUID.`,
        });
      }
    }
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
  await registerAuthRefreshRoutes(app);
  await registerMeRoutes(app);
  await registerWorkerConsentRoutes(app);
  await registerWorkerHistoryRoutes(app);
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
  await registerSupervisorLivingDocRoutes(app);
  await registerSupervisorSummaryRoutes(app);
  await registerSupervisorUpdatesRoutes(app);
  await registerComplaintRoutes(app);
  await registerReplacementInviteRoutes(app);
  await registerVisitsRoutes(app);
  await registerActivityRoutes(app);
  await registerAdminPolicyRoutes(app);
  await registerChatReloadContextRoutes(app);
  await registerChatHistoryRoutes(app);
  await registerWorkerSubmitRoutes(app);
  await registerWorkerLifecycleRoutes(app);
  await registerWorkerLeaveRoutes(app);
  await registerAdminMembershipRoutes(app);
  await registerAdminWorkerRoutes(app);
  await registerAdminSiteRoutes(app);
  await registerSuperAdminMembershipRoutes(app);
  await registerSuperAdminCompanyRoutes(app);
  await registerAdminCompanyRoutes(app);

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

  // Run the outbox dispatcher IN-PROCESS — AI photo verification, async
  // notifications, payroll recompute, and the periodic sweeps all drain here.
  // Prod has no separate dispatcher service, so without this, submitted work is
  // enqueued but never processed. Set RUN_DISPATCHER_IN_PROCESS=false on the web
  // service if a dedicated dispatcher service is ever added (the CLAIM_LEASE_MS
  // atomic claim already makes concurrent dispatch safe either way).
  const dispatcher =
    process.env.RUN_DISPATCHER_IN_PROCESS === 'false' ? null : startDispatcher({ log: app.log });
  if (dispatcher) app.log.info('[axhy-backend] in-process outbox dispatcher started');

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
    if (dispatcher) {
      await raceTimeout(dispatcher.stop(), SHUTDOWN_FASTIFY_MS, 'dispatcher').catch((err) =>
        app.log.error({ err }, '[axhy-backend] error stopping dispatcher'),
      );
      app.log.info('[axhy-backend] dispatcher stopped');
    }
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
