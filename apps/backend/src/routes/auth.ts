// auth-exempt — the login bootstrap itself: /auth/otp/request and /auth/otp/verify
// MUST be public (no token exists yet); /auth/sign-out validates the refresh token
// it receives (see refreshTokenStore.validate below). Guarded instead by per-phone
// issuance limits (otp-store.ts), the S1 wrong-verify attempt cap, and the per-IP
// edge limiter. Checked by scripts/check-default-deny.mjs (ledger #23 safe half).
/**
 * /auth/* routes
 *
 *   POST /auth/otp/request   — issue OTP, deliver via WhatsApp Cloud API
 *   POST /auth/otp/verify    — verify OTP, return JWT(s) + memberships
 *
 * Channel pivoted from MSG91 SMS to WhatsApp 2026-05-25 — workers all carry
 * smartphones with WhatsApp installed, and WhatsApp removes the DLT-registration
 * blocker that previously delayed production OTP sends.
 *
 * @derives(ADR-0007)
 */

import type { FastifyInstance } from 'fastify';
import {
  RequestOTPInput,
  RequestOTPOutput,
  VerifyOTPInput,
  VerifyOTPOutput,
} from '@axhy/shared-schema';
import { RoleSchema, type Role } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { issueOtp, verifyOtp } from '../lib/otp-store.js';
import { sendOtpWhatsApp } from '../lib/whatsapp-otp.js';
import { isPhoneAllowlisted } from '../lib/otp-bypass.js';
import { issueAccessToken } from '../lib/jwt.js';
import { createRefreshTokenStore, isLegacyToken } from '../lib/services/refresh-token-store.js';
import { workerOtpVerifiedService } from '../lib/services/worker-otp-verified-service.js';
import { recordAuditEvent } from '../lib/audit-event.js';
import { withTenantContext, withUserContext } from '../middleware/tenant-context.js';

/**
 * Register /auth/* routes.
 *
 * @derives(ADR-0007)
 */
export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const refreshTokenStore = createRefreshTokenStore(prisma);

  app.post('/auth/otp/request', async (req, reply) => {
    const parsed = RequestOTPInput.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
      return;
    }

    try {
      const issued = await issueOtp(parsed.data.phone);
      // Skip WhatsApp delivery for operator-allowlisted phones (founder
      // testing in production). They authenticate with the magic code
      // '123456' via the otp-bypass allowlist instead. Avoids spurious
      // Meta API calls + cost during repeated test sessions.
      if (!isPhoneAllowlisted(parsed.data.phone)) {
        await sendOtpWhatsApp({ phone: parsed.data.phone, code: issued.code });
      }
      const out: RequestOTPOutput = { ok: true, resendInSeconds: issued.resendInSeconds };
      reply.send(out);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith('OTP_RATE_LIMITED')) {
        reply.code(429).send({ error: 'OTP_RATE_LIMITED', message: msg });
        return;
      }
      req.log.error({ err }, 'OTP request failed');
      reply.code(500).send({ error: 'OTP_FAILED', message: 'Could not issue OTP' });
    }
  });

  app.post('/auth/otp/verify', async (req, reply) => {
    const parsed = VerifyOTPInput.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
      return;
    }

    const ok = await verifyOtp(parsed.data.phone, parsed.data.code);
    if (!ok) {
      reply
        .code(401)
        .send({ error: 'OTP_INVALID', message: 'OTP invalid, expired, or already used' });
      return;
    }

    // Find or create the user.
    // Explicitly exclude anonymised rows (phone starts with 'anon:') — their
    // phone has been replaced by a one-way hash so they will never match an
    // incoming E.164 number anyway, but the NOT LIKE filter makes the intent
    // obvious in code. A re-registration on the same original phone number
    // creates a brand-new User row (new id, fresh start — no carry-over).
    // Single-tenant model lock 2026-05-18.
    let user = await prisma.user.findFirst({
      where: { phone: parsed.data.phone, NOT: { phone: { startsWith: 'anon:' } } },
      select: { id: true, phone: true, locale: true, is_platform_admin: true },
    });
    if (!user) {
      user = await prisma.user.create({
        // raw-ok: login creates user before tenant context exists
        data: { phone: parsed.data.phone, locale: 'en' },
        select: { id: true, phone: true, locale: true, is_platform_admin: true },
      });
    }

    // Pull all memberships. F1 trust model — select id + tokenEpoch so the
    // active row backs the new JWT claims; nested company.name stays in scope
    // for the VerifyOTPOutput mapping below.
    // RLS: a user reads their OWN memberships across companies via the
    // tenant_self_read policy — withUserContext sets axhy.current_user_id.
    const memberships = await withUserContext(prisma, user.id, (tx) =>
      tx.membership.findMany({
        where: { userId: user.id, status: 'ACTIVE' },
        select: {
          id: true,
          companyId: true,
          role: true,
          status: true,
          tokenEpoch: true,
          company: { select: { name: true } },
        },
      }),
    );

    if (memberships.length === 0) {
      reply.code(403).send({
        error: 'NO_MEMBERSHIPS',
        message: 'This phone is not a member of any company. Ask Axhy support to invite you.',
      });
      return;
    }

    // Default to first membership's company; mobile picker can rotate via /auth/switch later.
    const active = memberships[0]!;

    // F-006b 2026-05-21: if the active membership is WORKER, look up the
    // Worker row and fire the OTP_VERIFIED machine event when in
    // PENDING_ACTIVATION. The service is idempotent — it returns
    // NO_TRANSITION (no DB write) for any other state. Wrapped in a
    // best-effort transaction so token issuance is never blocked by a
    // transition failure; the gap is logged for ops.
    if (active.role === RoleSchema.enum.WORKER) {
      try {
        // 15s timeout covers the 5-query cold-connection path against
        // Railway proxy (~8s observed in first-call real-DB tests).
        // Warm subsequent calls complete in <1s; this only matters for
        // the first OTP verify in a fresh process.
        // RLS: writes (worker state transition) need the COMPANY GUC for
        // tenant_isolation WITH CHECK — withTenantContext(active.companyId).
        await withTenantContext(prisma, active.companyId, async (tx) => {
          const worker = await tx.worker.findFirst({
            where: { userId: user.id, companyId: active.companyId },
          });
          if (!worker) return;
          await workerOtpVerifiedService(tx, {
            workerId: worker.id,
            companyId: active.companyId,
            userId: user.id,
          });
        });
      } catch (err) {
        req.log.warn(
          { err, userId: user.id, companyId: active.companyId },
          'worker OTP_VERIFIED transition failed; auth proceeds',
        );
        // RCA-I 2026-06-04 — surface the silent gap. Auth still proceeds (we
        // never lock a worker out over a transition hiccup), but the failure
        // is now a queryable audit row for ops instead of a log line no one
        // greps. Best-effort: never let the audit write block login.
        try {
          await withTenantContext(prisma, active.companyId, (tx) =>
            recordAuditEvent(tx, {
              companyId: active.companyId,
              kind: 'WORKER_ACTIVATION_TRANSITION_FAILED',
              actorId: user.id,
              targetId: user.id,
              payload: {
                membershipId: active.id,
                reason: err instanceof Error ? err.message : String(err),
              },
            }),
          );
        } catch (auditErr) {
          req.log.error(
            { auditErr, userId: user.id, companyId: active.companyId },
            'failed to audit worker activation transition failure',
          );
        }
      }
    }

    // RCA-I 2026-06-04 — login audit. Before this, a successful OTP verify
    // issued tokens but recorded NOTHING for already-active workers and for
    // every supervisor / HR / owner login — no forensic trail of who signed
    // in and when. Record one AUTH_LOGIN row scoped to the active company
    // (the membership the issued token is for). Best-effort: a failed audit
    // write must never block a legitimate login.
    try {
      await withTenantContext(prisma, active.companyId, (tx) =>
        recordAuditEvent(tx, {
          companyId: active.companyId,
          kind: 'AUTH_LOGIN',
          actorId: user.id,
          targetId: user.id,
          payload: {
            role: active.role,
            membershipId: active.id,
            availableRoles: memberships.map((m) => m.role),
            via: 'otp',
            ip: req.ip ? req.ip.slice(0, 64) : null,
          },
        }),
      );
    } catch (err) {
      req.log.warn({ err, userId: user.id }, 'login audit write failed; auth proceeds');
    }

    const accessToken = await issueAccessToken({
      userId: user.id,
      companyId: active.companyId,
      role: active.role as Role,
      availableRoles: memberships.map((m) => m.role as Role),
      locale: user.locale,
      // F1 trust model — new-format claims (NEXT_SESSION.md 2026-05-27).
      membershipId: active.id,
      epoch: active.tokenEpoch,
      isPlatformAdmin: user.is_platform_admin === true,
    });
    const { plainToken: refreshToken } = await refreshTokenStore.create({
      userId: user.id,
      membershipId: active.id,
      userAgent: req.headers['user-agent']?.slice(0, 256),
      ipFirst: req.ip?.slice(0, 64),
    });

    const out: VerifyOTPOutput = {
      ok: true,
      accessToken,
      refreshToken,
      memberships: memberships.map((m) => ({
        companyId: m.companyId,
        companyName: m.company.name,
        role: m.role as Role,
      })),
    };
    reply.send(out);
  });

  app.post('/auth/sign-out', async (req, reply) => {
    const body = req.body as { refreshToken?: unknown } | null;
    const refreshToken = body && typeof body.refreshToken === 'string' ? body.refreshToken : '';
    if (!refreshToken || isLegacyToken(refreshToken)) {
      reply.send({ ok: true });
      return;
    }
    try {
      const result = await refreshTokenStore.validate(refreshToken);
      if (result.found && !result.revoked) {
        if (result.compromise) {
          await refreshTokenStore.revokeForCompromise(result.family.id);
        } else {
          await refreshTokenStore.revokeForLogout(result.family.id);
        }
      }
    } catch (err) {
      req.log.warn({ err }, 'sign-out revoke failed; returning ok');
    }
    reply.send({ ok: true });
  });
}
