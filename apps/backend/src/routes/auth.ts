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
import { issueAccessToken, issueRefreshToken } from '../lib/jwt.js';
import { workerOtpVerifiedService } from '../lib/services/worker-otp-verified-service.js';

/**
 * Register /auth/* routes.
 *
 * @derives(ADR-0007)
 */
export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
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
    });
    if (!user) {
      user = await prisma.user.create({
        // raw-ok: login creates user before tenant context exists
        data: { phone: parsed.data.phone, locale: 'en' },
      });
    }

    // Pull all memberships
    const memberships = await prisma.membership.findMany({
      where: { userId: user.id, status: 'ACTIVE' },
      include: { company: true },
    });

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
        await prisma.$transaction(
          async (tx) => {
            const worker = await tx.worker.findFirst({
              where: { userId: user.id, companyId: active.companyId },
            });
            if (!worker) return;
            await workerOtpVerifiedService(tx, {
              workerId: worker.id,
              companyId: active.companyId,
              userId: user.id,
            });
          },
          { timeout: 15_000, maxWait: 10_000 },
        );
      } catch (err) {
        req.log.warn(
          { err, userId: user.id, companyId: active.companyId },
          'worker OTP_VERIFIED transition failed; auth proceeds',
        );
      }
    }

    const accessToken = await issueAccessToken({
      userId: user.id,
      companyId: active.companyId,
      role: active.role as Role,
      availableRoles: memberships.map((m) => m.role as Role),
      locale: user.locale,
    });
    const refreshToken = await issueRefreshToken(user.id);

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
}
