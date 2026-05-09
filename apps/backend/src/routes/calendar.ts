/**
 * Calendar routes — supervisor's soft-state planning surface.
 *
 * Wave 1 endpoints (more added in subsequent tasks):
 *   POST   /calendar               — create CalendarEntry
 *
 * @derives(master-plan §G)
 */

import type { FastifyInstance } from 'fastify';
import {
  CreateCalendarEntryInput,
  UpdateCalendarEntryInput,
  PromoteCalendarEntryInput,
} from '@axhy/shared-schema';
import {
  computeEditableUntil,
  canEdit,
  canPromote,
  mapCalendarPayloadToAssignment,
} from '@axhy/state-machines';

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

  app.patch<{ Params: { id: string } }>(
    '/calendar/:id',
    { preHandler: requireAuth },
    async (req, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth' });
        return;
      }

      const parsed = UpdateCalendarEntryInput.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }

      const out = await withTenantContext(prisma, auth.companyId, async (tx) => {
        const entry = await tx.calendarEntry.findFirst({
          where: { id: req.params.id, companyId: auth.companyId },
        });
        if (!entry) return { kind: 'NOT_FOUND' as const };
        if (!canEdit(entry.editableUntil, entry.promotedAt)) {
          return { kind: 'NOT_EDITABLE' as const };
        }

        const updates: { notes?: string | null; payload?: object } = {};
        if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
        if (parsed.data.payload !== undefined) updates.payload = parsed.data.payload as object;

        const updated = await tx.calendarEntry.update({
          where: { id: entry.id },
          data: updates,
        });

        await recordAuditEvent(tx, {
          companyId: auth.companyId,
          kind: 'CALENDAR_ENTRY_UPDATED',
          actorId: auth.userId,
          targetId: entry.id,
          payload: { changes: Object.keys(updates) },
        });

        return { kind: 'OK' as const, entry: updated };
      });

      if (out.kind === 'NOT_FOUND') {
        reply.code(404).send({ error: 'NOT_FOUND' });
        return;
      }
      if (out.kind === 'NOT_EDITABLE') {
        reply
          .code(403)
          .send({ error: 'NOT_EDITABLE', message: 'Past editable window or already promoted' });
        return;
      }
      reply.code(200).send({
        id: out.entry.id,
        kind: out.entry.kind,
        payload: out.entry.payload,
        notes: out.entry.notes,
        editableUntil: out.entry.editableUntil.toISOString(),
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/calendar/:id/promote',
    { preHandler: requireAuth },
    async (req, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED' });
        return;
      }

      const parsed = PromoteCalendarEntryInput.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }

      const out = await withTenantContext(prisma, auth.companyId, async (tx) => {
        const entry = await tx.calendarEntry.findFirst({
          where: { id: req.params.id, companyId: auth.companyId },
        });
        if (!entry) return { kind: 'NOT_FOUND' as const };
        if (entry.promotedAt) return { kind: 'ALREADY_PROMOTED' as const };
        if (
          !canPromote(
            entry.kind as 'NOTE' | 'DEMAND' | 'TENTATIVE_ASSIGNMENT' | 'EVENT',
            parsed.data.target,
          )
        ) {
          return { kind: 'CANNOT_PROMOTE' as const };
        }

        // Wave 1 only handles assignment target
        if (parsed.data.target !== 'assignment') {
          return { kind: 'NOT_IMPLEMENTED' as const };
        }

        const assignmentPayload = mapCalendarPayloadToAssignment(
          entry.payload as {
            workerId: string;
            siteId: string;
            shiftStart?: string;
            shiftEnd?: string;
          },
          entry.date,
          { extraFields: parsed.data.additionalFields as { validUntil?: Date | null } | undefined },
        );

        const promotedAt = new Date();
        const synthId = crypto.randomUUID();

        const updatedEntry = await tx.calendarEntry.update({
          where: { id: entry.id },
          data: {
            promotedToKind: 'ASSIGNMENT',
            promotedToId: synthId,
            promotedAt,
            pendingAssignmentPayload: assignmentPayload as object,
          },
        });

        await recordAuditEvent(tx, {
          companyId: auth.companyId,
          kind: 'CALENDAR_ENTRY_PROMOTED',
          actorId: auth.userId,
          targetId: entry.id,
          payload: { target: 'assignment', synthAssignmentId: synthId },
        });

        await recordAuditEvent(tx, {
          companyId: auth.companyId,
          kind: 'ASSIGNMENT_CREATED',
          actorId: auth.userId,
          targetId: synthId,
          payload: { source: 'calendar', sourceEntryId: entry.id, deferred: true },
        });

        return { kind: 'OK' as const, entry: updatedEntry, synthId };
      });

      if (out.kind === 'NOT_FOUND') {
        reply.code(404).send({ error: 'NOT_FOUND' });
        return;
      }
      if (out.kind === 'ALREADY_PROMOTED') {
        reply.code(409).send({ error: 'ALREADY_PROMOTED' });
        return;
      }
      if (out.kind === 'CANNOT_PROMOTE') {
        reply.code(400).send({ error: 'CANNOT_PROMOTE', message: 'kind cannot promote to target' });
        return;
      }
      if (out.kind === 'NOT_IMPLEMENTED') {
        reply
          .code(501)
          .send({
            error: 'NOT_IMPLEMENTED',
            message: 'Only assignment target supported in Wave 1',
          });
        return;
      }
      reply.code(200).send({
        entryId: out.entry.id,
        promoted: { kind: 'ASSIGNMENT', id: out.synthId, deferred: true },
        promotedAt: out.entry.promotedAt!.toISOString(),
      });
    },
  );
}
