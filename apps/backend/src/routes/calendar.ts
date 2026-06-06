/**
 * Calendar routes — supervisor's soft-state planning surface.
 *
 * Wave 1 endpoints (more added in subsequent tasks):
 *   POST   /calendar               — create CalendarEntry
 *
 * @derives(master-plan §G)
 */

import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
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
import { requireRole } from '../middleware/role-gates.js';
import { recordAuditEvent } from '../lib/audit-event.js';

export async function registerCalendarRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/calendar',
    { preHandler: [requireAuth, requireRole('SUPERVISOR')] },
    async (req, reply) => {
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
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/calendar/:id',
    { preHandler: [requireAuth, requireRole('SUPERVISOR')] },
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
          where: { id: req.params.id, companyId: auth.companyId, supervisorId: auth.userId },
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
    { preHandler: [requireAuth, requireRole('SUPERVISOR')] },
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
          where: { id: req.params.id, companyId: auth.companyId, supervisorId: auth.userId },
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

        // Tenant-validate the payload BEFORE writing an Assignment. workerId/
        // siteId come straight from the stored calendar payload and Assignment
        // has no RLS, so an entry referencing another tenant's ids would
        // otherwise create a cross-tenant Assignment. Reject as not-promotable.
        const cp = entry.payload as { workerId: string; siteId: string };
        const [pWorker, pSite] = await Promise.all([
          tx.worker.findFirst({
            where: { id: cp.workerId, companyId: auth.companyId },
            select: { id: true },
          }),
          tx.site.findFirst({
            where: { id: cp.siteId, companyId: auth.companyId },
            select: { id: true },
          }),
        ]);
        if (!pWorker || !pSite) return { kind: 'CANNOT_PROMOTE' as const };

        // Atomic claim (first-writer-wins): only one concurrent promote may flip
        // promotedAt from NULL, so at most one Assignment is created per entry.
        const claim = await tx.calendarEntry.updateMany({
          where: { id: entry.id, companyId: auth.companyId, promotedAt: null },
          data: { promotedAt: new Date() },
        });
        if (claim.count === 0) return { kind: 'ALREADY_PROMOTED' as const };

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

        // Wave 2a: write real Assignment instead of deferred payload
        const assignment = await tx.assignment.create({
          data: {
            companyId: auth.companyId,
            workerId: assignmentPayload.workerId,
            siteId: assignmentPayload.siteId,
            shiftStart: assignmentPayload.shiftStart,
            shiftEnd: assignmentPayload.shiftEnd,
            dayMask: assignmentPayload.dayMask,
            validFrom: new Date(assignmentPayload.validFrom),
            validUntil: assignmentPayload.validUntil
              ? new Date(assignmentPayload.validUntil)
              : null,
            state: 'ACTIVE',
          },
        });

        const promotedAt = new Date();

        const updatedEntry = await tx.calendarEntry.update({
          where: { id: entry.id },
          data: {
            promotedToKind: 'ASSIGNMENT',
            promotedToId: assignment.id,
            promotedAt,
            pendingAssignmentPayload: Prisma.JsonNull,
          },
        });

        await recordAuditEvent(tx, {
          companyId: auth.companyId,
          kind: 'CALENDAR_ENTRY_PROMOTED',
          actorId: auth.userId,
          targetId: entry.id,
          payload: { target: 'assignment', assignmentId: assignment.id },
        });

        await recordAuditEvent(tx, {
          companyId: auth.companyId,
          kind: 'ASSIGNMENT_CREATED',
          actorId: auth.userId,
          targetId: assignment.id,
          payload: { source: 'calendar', sourceEntryId: entry.id, deferred: false },
        });

        return { kind: 'OK' as const, entry: updatedEntry, assignmentId: assignment.id };
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
        reply.code(501).send({
          error: 'NOT_IMPLEMENTED',
          message: 'Only assignment target supported in Wave 1',
        });
        return;
      }
      reply.code(200).send({
        entryId: out.entry.id,
        promoted: { kind: 'ASSIGNMENT', id: out.assignmentId, deferred: false },
        promotedAt: out.entry.promotedAt!.toISOString(),
      });
    },
  );

  app.get<{ Querystring: { supervisorId?: string; from?: string; to?: string } }>(
    '/calendar',
    { preHandler: [requireAuth, requireRole('SUPERVISOR')] },
    async (req, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED' });
        return;
      }

      // Own calendar only — never trust a client-supplied supervisorId (cross-supervisor read).
      const supervisorId = auth.userId;
      const from = req.query.from ? new Date(req.query.from) : new Date();
      const to = req.query.to
        ? new Date(req.query.to)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        reply.code(400).send({ error: 'BAD_INPUT', message: 'invalid from/to date' });
        return;
      }

      const entries = await withTenantContext(prisma, auth.companyId, async (tx) =>
        tx.calendarEntry.findMany({
          where: {
            companyId: auth.companyId,
            supervisorId,
            date: { gte: from, lte: to },
          },
          orderBy: { date: 'asc' },
          take: 200,
        }),
      );

      reply.code(200).send({
        entries: entries.map((e) => ({
          id: e.id,
          kind: e.kind,
          date: e.date.toISOString().slice(0, 10),
          payload: e.payload,
          notes: e.notes,
          editableUntil: e.editableUntil.toISOString(),
          promotedToKind: e.promotedToKind,
          promotedToId: e.promotedToId,
          promotedAt: e.promotedAt?.toISOString() ?? null,
        })),
      });
    },
  );
}
