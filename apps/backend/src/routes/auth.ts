/**
 * /auth/* routes
 *
 *   POST /auth/otp/request   — issue OTP, deliver via MSG91
 *   POST /auth/otp/verify    — verify OTP, return JWT(s) + memberships
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
import type { Role } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { issueOtp, verifyOtp } from '../lib/otp-store.js';
import { sendOtpSms } from '../lib/msg91.js';
import { issueAccessToken, issueRefreshToken } from '../lib/jwt.js';

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
      const issued = await issueOtp(prisma, parsed.data.phone);
      await sendOtpSms({ phone: parsed.data.phone, code: issued.code });
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

    const ok = await verifyOtp(prisma, parsed.data.phone, parsed.data.code);
    if (!ok) {
      reply
        .code(401)
        .send({ error: 'OTP_INVALID', message: 'OTP invalid, expired, or already used' });
      return;
    }

    // Find or create the user
    let user = await prisma.user.findUnique({ where: { phone: parsed.data.phone } });
    if (!user) {
      user = await prisma.user.create({
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
