/**
 * Zod-layer test: Notification mutual-exclusion refine.
 *
 * Layer 1 PR 2. The audienceUserId XOR audienceWorkerId rule is enforced ONLY
 * in the Zod schema (NotificationSchema and ScheduleNotificationInput). The
 * database has both columns as nullable UUIDs with no CHECK constraint — by
 * design, see notification-persistence.test.ts.
 *
 * This file tests that the Zod boundary rejects:
 *   - both audience IDs set
 *   - neither audience ID set
 * And accepts exactly one set (either side).
 *
 * No DB connection, no Prisma — pure Zod.
 *
 * @derives(workflow-design-closure §3.4 — Notification primitive)
 * @derives(panel-2026-05-15) — Layer 1 PR 2
 */

import { describe, it, expect } from 'vitest';
import { ScheduleNotificationInput } from '@axhy/shared-schema';

const COMPANY = '00000000-0000-0000-0000-000000000001';
const USER = '00000000-0000-0000-0000-000000000002';
const WORKER = '00000000-0000-0000-0000-000000000003';

const baseValidPayload = {
  companyId: COMPANY,
  kind: 'supervisor_change' as const,
  channel: 'push' as const,
  payload: { message: 'test' },
};

describe('ScheduleNotificationInput audience XOR refine', () => {
  it('accepts a payload with only audienceUserId set', () => {
    const result = ScheduleNotificationInput.safeParse({
      ...baseValidPayload,
      audienceUserId: USER,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a payload with only audienceWorkerId set', () => {
    const result = ScheduleNotificationInput.safeParse({
      ...baseValidPayload,
      audienceWorkerId: WORKER,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a payload with audienceUserId set + audienceWorkerId explicitly null', () => {
    const result = ScheduleNotificationInput.safeParse({
      ...baseValidPayload,
      audienceUserId: USER,
      audienceWorkerId: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a payload with both audience IDs set', () => {
    const result = ScheduleNotificationInput.safeParse({
      ...baseValidPayload,
      audienceUserId: USER,
      audienceWorkerId: WORKER,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => /one of audience/i.test(i.message))).toBe(true);
    }
  });

  it('rejects a payload with neither audience ID set', () => {
    const result = ScheduleNotificationInput.safeParse({
      ...baseValidPayload,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a payload with both audience IDs explicitly null', () => {
    const result = ScheduleNotificationInput.safeParse({
      ...baseValidPayload,
      audienceUserId: null,
      audienceWorkerId: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown kind values', () => {
    const result = ScheduleNotificationInput.safeParse({
      ...baseValidPayload,
      audienceUserId: USER,
      kind: 'not_a_real_kind' as never,
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown channel values', () => {
    const result = ScheduleNotificationInput.safeParse({
      ...baseValidPayload,
      audienceUserId: USER,
      channel: 'fax' as never,
    });
    expect(result.success).toBe(false);
  });
});
