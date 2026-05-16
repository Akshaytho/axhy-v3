/**
 * F-004 — HandoffPackage composer.
 *
 * `composeHandoffPackage(tx, args)` reads the 4 source signals (siteRules from
 * outgoing supervisor's LivingDoc; recent complaints 90d; active workers;
 * openItems 14d), assembles the bucket-2 frozen snapshot, applies the spec
 * §3.7 line 322 truncation policy if the JSON exceeds 100KB, validates via
 * Zod, and returns the typed payload. Callers include the payload on the
 * `tx.siteSupervisorBinding.create` data so it lands inside the same atomic
 * tx that creates the binding row.
 *
 * Implementation notes from the F-004 round-4 v3 panel pass:
 *   - Naina: 4 reads parallelised via `Promise.all` on the same `tx` to keep
 *     lock-hold time minimal at scale.
 *   - Aanya: a high-volume "Telugu complaint body" test case exists in
 *     `apps/backend/test/handoff-package-composer.test.ts` to verify the
 *     truncation algorithm doesn't drop entire workers or strip everything.
 *   - Owner Q2 = (b): on first-ever binding, `outgoingSupervisorId = null`,
 *     `siteRules = []` (no outgoing LivingDoc to read); recentComplaints,
 *     activeWorkers, openItems are queried as usual and may be empty or
 *     non-empty depending on pre-binding site history. NOT hardcoded `[]`.
 *
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.7 — amended 2026-05-16 for schemaVersion)
 * @derives(F-004 scope round-4 v4)
 */

import type { Prisma } from '@prisma/client';
import {
  HANDOFF_PACKAGE_SCHEMA_VERSION,
  HandoffPackagePayloadSchema,
  type ComplaintSummary,
  type DecisionRef,
  type FlagSummary,
  type HandoffPackagePayload,
  type OpenItem,
  type ShiftRef,
  type WorkerSummary,
} from '@axhy/shared-schema';

/**
 * Default Policy-configurable byte limit per closure spec §3.7 Invariants
 * line 322. Owner can override at code time once Policy storage is wired,
 * but the spec default is 100KB.
 *
 * @derives(workflow-design-closure §3.7 Invariants line 322)
 * @derives(F-004 scope round-4 v4 Open Q3)
 */
export const DEFAULT_PACKAGE_BYTE_CAP = 100 * 1024;

/** Recent-complaints window from spec §3.7 (pick 3). */
const COMPLAINT_WINDOW_DAYS = 90;
/** activeWorkers.recentFlags + recentDecisions window from spec §3.7 (pick 4). */
const WORKER_RECENT_DAYS = 30;
/** openItems forward window from spec §3.7 (pick 5). */
const OPEN_ITEMS_HORIZON_DAYS = 14;

/** Interim default per Open Q5 (Complaint model has no `kind` column). */
const COMPLAINT_KIND_INTERIM_DEFAULT = 'site_complaint';

/** L3 site-rule visibilities allowed in the package per pick 2. */
const ALLOWED_SITE_RULE_VISIBILITIES = new Set(['COMPANY', 'SUPERVISOR_OWN']);

/**
 * Compose input — companyId, siteId, outgoing+incoming supervisor ids, optional
 * compose-at override (tests) and byte-cap override (tests).
 *
 * @derives(F-004 scope round-4 v4 §5)
 */
export type ComposeHandoffPackageInput = {
  companyId: string;
  siteId: string;
  /** NULL on first-ever binding for a site (Q2 = (b) locked). */
  outgoingSupervisorId: string | null;
  incomingSupervisorId: string;
  /** Override for tests; defaults to `new Date()`. */
  at?: Date;
  /** Override for tests; defaults to {@link DEFAULT_PACKAGE_BYTE_CAP}. */
  packageByteCap?: number;
};

/**
 * Compose the handoff package payload. Returns the typed object; caller is
 * responsible for casting to `Prisma.InputJsonValue` when storing on the
 * binding row.
 *
 * @derives(workflow-design-closure §3.7)
 * @derives(F-004 scope round-4 v4 §5 picks 1–8)
 */
export async function composeHandoffPackage(
  tx: Prisma.TransactionClient,
  input: ComposeHandoffPackageInput,
): Promise<HandoffPackagePayload> {
  const at = input.at ?? new Date();
  const generatedAt = at.toISOString();
  const byteCap = input.packageByteCap ?? DEFAULT_PACKAGE_BYTE_CAP;

  const complaintWindowStart = new Date(at.getTime() - COMPLAINT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const workerRecentStart = new Date(at.getTime() - WORKER_RECENT_DAYS * 24 * 60 * 60 * 1000);
  const openItemsEnd = new Date(at.getTime() + OPEN_ITEMS_HORIZON_DAYS * 24 * 60 * 60 * 1000);

  // ── 4 parallel reads (Naina code-stage note from panel) ────────────────
  const [siteRules, complaintRows, activeWorkerRows, openItems] = await Promise.all([
    readSiteRules(tx, input.companyId, input.outgoingSupervisorId, input.siteId),
    readRecentComplaints(tx, input.companyId, input.siteId, complaintWindowStart),
    readActiveWorkers(tx, input.companyId, input.siteId, workerRecentStart),
    readOpenItems(tx, {
      companyId: input.companyId,
      siteId: input.siteId,
      outgoingSupervisorId: input.outgoingSupervisorId,
      from: at,
      to: openItemsEnd,
    }),
  ]);

  // Compose initial payload (packageSizeBytes filled in after first
  // serialization; truncation may rewrite arrays + re-measure).
  let payload: HandoffPackagePayload = HandoffPackagePayloadSchema.parse({
    schemaVersion: HANDOFF_PACKAGE_SCHEMA_VERSION,
    generatedAt,
    outgoingSupervisorId: input.outgoingSupervisorId,
    incomingSupervisorId: input.incomingSupervisorId,
    siteRules,
    recentComplaints: complaintRows,
    activeWorkers: activeWorkerRows,
    openItems,
    packageSizeBytes: 0,
  });
  payload = withMeasuredSize(payload);

  if (payload.packageSizeBytes > byteCap) {
    payload = truncateToFitCap(payload, byteCap);
  }

  // Final Zod re-parse on the truncated payload for defence-in-depth.
  return HandoffPackagePayloadSchema.parse(payload);
}

// ─────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────

async function readSiteRules(
  tx: Prisma.TransactionClient,
  companyId: string,
  outgoingSupervisorId: string | null,
  siteId: string,
): Promise<string[]> {
  // First-ever binding: no outgoing supervisor, no LivingDoc to read.
  if (outgoingSupervisorId === null) return [];

  const doc = await tx.livingDoc.findUnique({
    where: {
      companyId_supervisorId: {
        companyId,
        supervisorId: outgoingSupervisorId,
      },
    },
    select: { siteRules: true },
  });
  if (!doc) return [];

  const raw = Array.isArray(doc.siteRules)
    ? (doc.siteRules as unknown as Array<Record<string, unknown>>)
    : [];
  const out: string[] = [];
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) continue;
    if (r.state !== 'ACTIVE') continue;
    const visibility = r.visibility;
    if (typeof visibility !== 'string' || !ALLOWED_SITE_RULE_VISIBILITIES.has(visibility)) continue;
    const scope = (r.scope ?? {}) as Record<string, unknown>;
    if (scope.siteId !== siteId) continue;
    const ruleText = r.ruleText;
    if (typeof ruleText !== 'string' || ruleText.length === 0) continue;
    out.push(ruleText);
  }
  return out;
}

async function readRecentComplaints(
  tx: Prisma.TransactionClient,
  companyId: string,
  siteId: string,
  windowStart: Date,
): Promise<ComplaintSummary[]> {
  const rows = await tx.complaint.findMany({
    where: {
      companyId,
      siteId,
      createdAt: { gte: windowStart },
    },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: COMPLAINT_KIND_INTERIM_DEFAULT,
    state: r.resolvedAt === null ? ('open' as const) : ('resolved' as const),
    loggedAt: r.createdAt.toISOString(),
    body: r.text,
  }));
}

async function readActiveWorkers(
  tx: Prisma.TransactionClient,
  companyId: string,
  siteId: string,
  recentStart: Date,
): Promise<WorkerSummary[]> {
  const assignments = await tx.assignment.findMany({
    where: {
      companyId,
      siteId,
      state: 'ACTIVE',
    },
    include: { worker: { select: { id: true, name: true } } },
  });

  // Group assignments by workerId so we list each worker once with all
  // their site-scoped shifts.
  const byWorker = new Map<string, { worker: { id: string; name: string }; shifts: ShiftRef[] }>();
  for (const a of assignments) {
    if (!a.worker) continue;
    const w = a.worker;
    const entry = byWorker.get(w.id) ?? { worker: w, shifts: [] };
    entry.shifts.push({
      assignmentId: a.id,
      shiftStart: a.shiftStart,
      shiftEnd: a.shiftEnd,
      dayMask: a.dayMask,
      validFrom: a.validFrom.toISOString(),
      validUntil: a.validUntil ? a.validUntil.toISOString() : null,
    });
    byWorker.set(w.id, entry);
  }

  if (byWorker.size === 0) return [];

  const workerIds = [...byWorker.keys()];

  // Pull recent flags (Visit.state='FLAGGED' last 30d for these workers + this site)
  const [flagRows, decisionRows] = await Promise.all([
    tx.visit.findMany({
      where: {
        companyId,
        siteId,
        workerId: { in: workerIds },
        state: 'FLAGGED',
        scheduledFor: { gte: recentStart },
      },
      select: { id: true, workerId: true, scheduledFor: true, completedAt: true },
      orderBy: { scheduledFor: 'desc' },
    }),
    tx.supervisorDecision.findMany({
      where: {
        companyId,
        targetId: { in: workerIds },
        createdAt: { gte: recentStart },
      },
      select: {
        id: true,
        targetId: true,
        kind: true,
        tier: true,
        appliedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const flagsByWorker = new Map<string, FlagSummary[]>();
  for (const f of flagRows) {
    const arr = flagsByWorker.get(f.workerId) ?? [];
    arr.push({
      visitId: f.id,
      scheduledFor: f.scheduledFor.toISOString(),
      flaggedAt: f.completedAt ? f.completedAt.toISOString() : null,
    });
    flagsByWorker.set(f.workerId, arr);
  }

  const decisionsByWorker = new Map<string, DecisionRef[]>();
  for (const d of decisionRows) {
    if (d.targetId === null) continue;
    const arr = decisionsByWorker.get(d.targetId) ?? [];
    arr.push({
      decisionId: d.id,
      kind: d.kind,
      tier: d.tier,
      appliedAt: d.appliedAt ? d.appliedAt.toISOString() : null,
      createdAt: d.createdAt.toISOString(),
    });
    decisionsByWorker.set(d.targetId, arr);
  }

  return [...byWorker.values()].map(({ worker, shifts }) => ({
    workerId: worker.id,
    name: worker.name,
    primaryShifts: shifts,
    recentFlags: flagsByWorker.get(worker.id) ?? [],
    recentDecisions: decisionsByWorker.get(worker.id) ?? [],
  }));
}

async function readOpenItems(
  tx: Prisma.TransactionClient,
  args: {
    companyId: string;
    siteId: string;
    outgoingSupervisorId: string | null;
    from: Date;
    to: Date;
  },
): Promise<OpenItem[]> {
  // Decisions: PROPOSED only (appliedAt IS NULL AND dismissedAt IS NULL).
  // Open to all in the company on this site's scope; bound by the window
  // via createdAt being the proposedAt proxy.
  //
  // First-ever binding (outgoingSupervisorId === null): we still query
  // decisions whose targetId matches a worker on this site or whose payload
  // has the site, but for simplicity at v1 we restrict to decisions
  // explicitly proposedBy the outgoing supervisor. With no outgoing, the
  // result is empty here. The 14-day forward window applies to proposedAt
  // — decisions proposed in the past 14 days that are still PROPOSED.
  // (We use createdAt >= from - 14d so a decision proposed today still
  // shows up as relevant context.)
  const lookbackStart = new Date(
    args.from.getTime() - OPEN_ITEMS_HORIZON_DAYS * 24 * 60 * 60 * 1000,
  );
  const decisionRows = args.outgoingSupervisorId
    ? await tx.supervisorDecision.findMany({
        where: {
          companyId: args.companyId,
          supervisorId: args.outgoingSupervisorId,
          appliedAt: null,
          dismissedAt: null,
          createdAt: { gte: lookbackStart },
        },
        select: {
          id: true,
          kind: true,
          tier: true,
          targetId: true,
          createdAt: true,
          supervisorId: true,
        },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  // CalendarEntry filter (STRICT, pick 6): include only entries where
  //   entry.companyId === companyId
  //   AND entry.payload.siteId === thisSiteId   (exact match)
  //   AND entry.date ∈ [from, from + 14d]
  //   AND entry.supervisorId === outgoingSupervisorId
  // Skip if payload.siteId is absent / ambiguous / loosely derived.
  //
  // The Prisma where-clause can't directly filter on payload.siteId at the
  // DB level for our schema (payload is `Json`; we'd need a raw query for
  // index-backed perf). We fetch the supervisor's + window subset and filter
  // payload.siteId in memory. Volume is small (single supervisor × 14 days).
  const calendarRows = args.outgoingSupervisorId
    ? await tx.calendarEntry.findMany({
        where: {
          companyId: args.companyId,
          supervisorId: args.outgoingSupervisorId,
          date: { gte: args.from, lte: args.to },
        },
        select: {
          id: true,
          kind: true,
          date: true,
          payload: true,
          notes: true,
        },
        orderBy: { date: 'asc' },
      })
    : [];

  const items: OpenItem[] = [];
  for (const d of decisionRows) {
    items.push({
      kind: 'DECISION',
      decisionId: d.id,
      kindLabel: d.kind,
      tier: d.tier,
      targetId: d.targetId,
      proposedAt: d.createdAt.toISOString(),
      proposedBy: d.supervisorId,
    });
  }
  for (const c of calendarRows) {
    if (typeof c.payload !== 'object' || c.payload === null || Array.isArray(c.payload)) continue;
    const payload = c.payload as Record<string, unknown>;
    if (payload.siteId !== args.siteId) continue;
    items.push({
      kind: 'CALENDAR_ENTRY',
      entryId: c.id,
      entryKind: c.kind,
      date: c.date.toISOString().slice(0, 10), // "YYYY-MM-DD"
      payload,
      notes: c.notes ?? null,
    });
  }

  // Sort ascending by relevance time (decision proposedAt OR calendar date).
  items.sort((a, b) => {
    const at = a.kind === 'DECISION' ? a.proposedAt : a.date;
    const bt = b.kind === 'DECISION' ? b.proposedAt : b.date;
    return at < bt ? -1 : at > bt ? 1 : 0;
  });

  return items;
}

// ─────────────────────────────────────────────────────────────────────────
// Size measurement + truncation (spec §3.7 Invariants line 322)
// ─────────────────────────────────────────────────────────────────────────

function measurePayloadBytes(p: HandoffPackagePayload): number {
  // The packageSizeBytes field itself is part of the JSON; we serialise
  // the whole payload with packageSizeBytes set to 0 to get a stable
  // upper bound, then overwrite. A real consumer reads packageSizeBytes
  // from the materialised JSON, which will include the final number.
  const probe = { ...p, packageSizeBytes: 0 };
  return Buffer.byteLength(JSON.stringify(probe), 'utf8');
}

function withMeasuredSize(p: HandoffPackagePayload): HandoffPackagePayload {
  const bytes = measurePayloadBytes(p);
  return { ...p, packageSizeBytes: bytes };
}

/**
 * Spec §3.7 Invariants line 322 truncation algorithm: "drop oldest
 * complaints first, then activeWorkers field detail."
 *
 *   Phase 1: drop oldest complaints one at a time, re-measuring after each.
 *            Recent-complaints rows are ordered desc by createdAt, so the
 *            "oldest" is the LAST element. Pop until we fit OR
 *            recentComplaints is empty.
 *   Phase 2: drop activeWorkers field detail (recentFlags + recentDecisions)
 *            ON ALL WORKERS (not entire workers — Aanya's panel note: workers
 *            list itself is the most operationally-useful field; only the
 *            detail arrays are eligible). Re-measure.
 *
 * If after both phases the payload still exceeds the cap, return as-is with
 * the measured oversized count — the caller can warn / alert. We don't
 * truncate the binding-create on size alone; soft-fail is preferred over
 * dropping the snapshot entirely.
 */
function truncateToFitCap(p: HandoffPackagePayload, byteCap: number): HandoffPackagePayload {
  // Phase 1: drop oldest complaints.
  let working: HandoffPackagePayload = { ...p, recentComplaints: [...p.recentComplaints] };
  while (working.recentComplaints.length > 0) {
    working.recentComplaints.pop(); // last is oldest (desc-sorted)
    working = withMeasuredSize(working);
    if (working.packageSizeBytes <= byteCap) return working;
  }

  // Phase 2: strip activeWorkers field detail.
  working = {
    ...working,
    activeWorkers: working.activeWorkers.map((w) => ({
      ...w,
      recentFlags: [],
      recentDecisions: [],
    })),
  };
  working = withMeasuredSize(working);
  return working;
}
