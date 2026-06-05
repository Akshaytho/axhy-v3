/**
 * GET /me Zod schemas.
 *
 * Returns the authenticated user's profile + their active company + memberships.
 * Used by every app on every screen mount to confirm session.
 *
 * @derives(ADR-0007)
 */

import { z } from 'zod';

import { RoleSchema } from './auth.js';

/**
 * Per-membership notification opt-ins. The DB owns the truth for opt-outs
 * ('DB owns truth; OneSignal owns push transport'). An empty stored {} is
 * read as all-true by the backend's fallback, so DEFAULT_NOTIFICATION_PREFS
 * is what a brand-new membership effectively has.
 *
 * @derives(2026-06-04 notification-prefs persistence)
 */
export const NotificationPrefs = z
  .object({
    push: z.boolean(),
    whatsapp: z.boolean(),
    email: z.boolean(),
  })
  .strict();
export type NotificationPrefs = z.infer<typeof NotificationPrefs>;

/** PATCH body — only the toggled channel(s) need be sent. */
export const UpdateNotificationPrefsInput = NotificationPrefs.partial();
export type UpdateNotificationPrefsInput = z.infer<typeof UpdateNotificationPrefsInput>;

/** Effective defaults for a membership with no explicit prefs ({}). */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  push: true,
  whatsapp: true,
  email: true,
};

export const MeOutput = z.object({
  user: z.object({
    id: z.string().uuid(),
    phone: z.string(),
    name: z.string().nullable(),
    locale: z.string(),
  }),
  activeCompany: z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
  }),
  activeRole: RoleSchema,
  availableRoles: z.array(RoleSchema),
  memberships: z.array(
    z.object({
      companyId: z.string().uuid(),
      companyName: z.string(),
      role: RoleSchema,
    }),
  ),
  /** The active membership's effective notification prefs (all-true default). */
  notificationPrefs: NotificationPrefs,
});
export type MeOutput = z.infer<typeof MeOutput>;
