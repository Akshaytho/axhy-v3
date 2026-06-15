/**
 * GET  /me                      — profile + active company + memberships + notif prefs
 * PATCH /me/notification-prefs  — update the caller's own notification toggles
 * PATCH /me/locale              — update the caller's own UI locale (en|hi|te)
 *
 * Mobile + admin call GET /me on every screen mount to confirm session health
 * and to seed the notification toggles from the server (no longer device-local).
 *
 * @derives(ADR-0007)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { MeOutput, Role, NotificationPrefs } from '@axhy/shared-schema';
import { UpdateNotificationPrefsInput, DEFAULT_NOTIFICATION_PREFS } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext, withUserContext } from '../middleware/tenant-context.js';
import { recordAuditEvent } from '../lib/audit-event.js';

/** Locales the UI offers (matches the Settings language picker + worker default). */
const UpdateLocaleInput = z.object({ locale: z.enum(['en', 'hi', 'te']) });

/**
 * Read a stored notificationPrefs JSON value into a full NotificationPrefs,
 * applying the all-true default for any missing/invalid channel. An empty
 * stored `{}` (the column default + the 13 backfilled rows) therefore reads
 * as "everything on".
 */
function mergeNotificationPrefs(raw: unknown): NotificationPrefs {
  const r =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    push: typeof r.push === 'boolean' ? r.push : DEFAULT_NOTIFICATION_PREFS.push,
    whatsapp: typeof r.whatsapp === 'boolean' ? r.whatsapp : DEFAULT_NOTIFICATION_PREFS.whatsapp,
    email: typeof r.email === 'boolean' ? r.email : DEFAULT_NOTIFICATION_PREFS.email,
  };
}

export async function registerMeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/me', { preHandler: requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
      return;
    }

    // tenant-exempt: read-only parallel queries, no writes.
    // Latency fix (Cluster 1, 2026-05-18): bare prisma → parallel dispatch.
    // /me was 7.5s with tx; ~1 RTT without.
    // learned-ok: intentional Promise.all — /me is foundational, mobile
    // app calls it on every screen mount and depends on ALL three rows;
    // partial-degradation here would mask real errors (e.g. orphan user
    // with no company) that should surface as 404 not silent-success.
    const [user, company, memberships] = await Promise.all([
      prisma.user.findUnique({ where: { id: auth.userId } }),
      prisma.company.findUnique({ where: { id: auth.companyId } }),
      // RLS: User + Company are not tenant-isolated; Membership is — read the
      // caller's own memberships across companies via tenant_self_read.
      withUserContext(prisma, auth.userId, (tx) =>
        tx.membership.findMany({
          where: { userId: auth.userId, status: 'ACTIVE' },
          include: { company: true },
        }),
      ),
    ]);

    if (!user || !company) {
      reply.code(404).send({ error: 'NOT_FOUND', message: 'User or company not found' });
      return;
    }

    // The active membership is the one the token was issued for (membershipId),
    // falling back to the active-company+role match for legacy tokens.
    const activeMembership =
      memberships.find((m) => m.id === auth.membershipId) ??
      memberships.find((m) => m.companyId === auth.companyId && m.role === auth.role);

    const result: MeOutput = {
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        locale: user.locale,
      },
      activeCompany: {
        id: company.id,
        name: company.name,
        slug: company.slug,
      },
      activeRole: auth.role,
      availableRoles: [...auth.availableRoles],
      memberships: memberships.map((m) => ({
        companyId: m.companyId,
        companyName: m.company.name,
        role: m.role as Role,
      })),
      notificationPrefs: mergeNotificationPrefs(activeMembership?.notificationPrefs),
    };
    reply.send(result);
  });

  // PATCH the caller's OWN active membership's notification toggles. Keyed by
  // auth.membershipId (never a client id) so a user can only edit their own.
  app.patch('/me/notification-prefs', { preHandler: requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
      return;
    }
    if (!auth.membershipId) {
      // SUPER_ADMIN / legacy tokens have no per-company membership to scope to.
      reply
        .code(400)
        .send({ error: 'NO_MEMBERSHIP', message: 'This session has no membership to update.' });
      return;
    }
    const parsed = UpdateNotificationPrefsInput.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
      return;
    }
    const membershipId = auth.membershipId;

    try {
      const out = await withTenantContext(prisma, auth.companyId, async (tx) => {
        const current = await tx.membership.findFirst({
          where: { id: membershipId, companyId: auth.companyId },
          select: { notificationPrefs: true },
        });
        if (!current) return null;
        // Merge the partial patch over the current full prefs so toggling one
        // channel never clears the others.
        const merged: NotificationPrefs = {
          ...mergeNotificationPrefs(current.notificationPrefs),
          ...parsed.data,
        };
        await tx.membership.updateMany({
          where: { id: membershipId, companyId: auth.companyId },
          data: { notificationPrefs: merged },
        });
        await recordAuditEvent(tx, {
          companyId: auth.companyId,
          kind: 'MEMBERSHIP_NOTIFICATION_PREFS_UPDATED',
          actorId: auth.userId,
          targetId: membershipId,
          payload: { prefs: merged },
        });
        return merged;
      });

      if (!out) {
        reply.code(404).send({ error: 'MEMBERSHIP_NOT_FOUND', message: 'Membership not found.' });
        return;
      }
      reply.send({ ok: true, notificationPrefs: out });
    } catch (err) {
      req.log.error({ err }, 'PATCH /me/notification-prefs failed');
      reply
        .code(500)
        .send({ error: 'INTERNAL', message: 'Could not update notification preferences.' });
    }
  });

  // PATCH the caller's OWN UI locale (User.locale). Keyed by auth.userId so a
  // user can only change their own. Written under withUserContext so any
  // user-self RLS policy passes; audited under the active company.
  app.patch('/me/locale', { preHandler: requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
      return;
    }
    const parsed = UpdateLocaleInput.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
      return;
    }
    const { locale } = parsed.data;
    try {
      await withUserContext(prisma, auth.userId, async (tx) => {
        await tx.user.update({ where: { id: auth.userId }, data: { locale } });
        if (auth.membershipId) {
          await recordAuditEvent(tx, {
            companyId: auth.companyId,
            kind: 'USER_LOCALE_UPDATED',
            actorId: auth.userId,
            targetId: auth.userId,
            payload: { locale },
          });
        }
      });
      reply.send({ ok: true, locale });
    } catch (err) {
      req.log.error({ err }, 'PATCH /me/locale failed');
      reply.code(500).send({ error: 'INTERNAL', message: 'Could not update locale.' });
    }
  });
}
