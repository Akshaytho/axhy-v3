/**
 * Calendar routes — supervisor's soft-state planning surface.
 *
 * Wave 1 endpoints (more added in subsequent tasks):
 *   POST   /calendar               — create CalendarEntry
 *
 * @derives(master-plan §G)
 */

import type { FastifyInstance } from 'fastify';
import { CreateCalendarEntryInput } from '@axhy/shared-schema';
import { computeEditableUntil } from '@axhy/state-machines';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { recordAuditEvent } from '../lib/audit-event.js';

export async function registerCalendarRoutes(app: FastifyInstance): Promise<void> {
  app.post('/calendar', { preHandler: requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
      return;
    }

    const parsed = CreateCalendarEntryInput.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
      return;
    }

    const { kind, date, payload, notes } = parsed.data;
    const dateObj = new Date(date);
    if (Number.isNaN(dateObj.getTime())) {
      reply.code(400).send({ error: 'BAD_INPUT', message: 'invalid date' });
      return;
    }

    const now = new Date();
    const editableUntil = computeEditableUntil(now, null);

    try {
      const out = await withTenantContext(prisma, auth.companyId, async (tx) => {
        const entry = await tx.calendarEntry.create({
          data: {
            companyId: auth.companyId,
            supervisorId: auth.userId,
            date: dateObj,
            kind,
            payload: payload as object,
            notes: notes ?? null,
            editableUntil,
          },
        });

        await recordAuditEvent(tx, {
          companyId: auth.companyId,
          kind: 'CALENDAR_ENTRY_CREATED',
          actorId: auth.userId,
          targetId: entry.id,
          payload: { kind: entry.kind, date: date, notesPreview: (notes ?? '').slice(0, 100) },
        });

        return entry;
      });

      reply.code(200).send({
        id: out.id,
        kind: out.kind,
        date: out.date.toISOString().slice(0, 10),
        payload: out.payload,
        notes: out.notes,
        editableUntil: out.editableUntil.toISOString(),
      });
    } catch (err) {
      req.log.error({ err }, 'create-calendar-entry failed');
      reply.code(500).send({ error: 'INTERNAL', message: 'Could not create calendar entry' });
    }
  });
}
