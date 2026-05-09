# Phase C Wave 1 — CalendarEntry vertical slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Calendar (soft-state) primitive end-to-end so vignettes 1 + 5 from the vision narrative work — Mukesh voices "Apollo needs 5 next Tuesday, thinking Pradeep" → AI tool stub fires → DecisionCard data returned → tap-to-promote materializes hard Assignment row. Plus the Visit append-only correction infrastructure (`correctsVisitId` chain + `latest_visit` view + Postgres triggers) needed by future waves.

**Architecture:** Single Prisma migration (`20260509_phase_c_wave_1_calendar`) adds `CalendarEntry` table + Visit correction columns + `latest_visit` view + 2 Postgres triggers (past-Assignment immutability, partial unique index on Visit chain). State-machine package gets `calendar.ts` (kind validation, `editableUntil` computation, promotion guards). AI-tools package gets `calendar.ts` tool definitions (no Anthropic call yet — Wave 2 wires real model). Backend gets `apps/backend/src/routes/calendar.ts` with 4 endpoints (POST, PATCH, POST /promote, GET). 6 integration tests on real Railway, all using existing tenant-context middleware + Outbox + AuditEvent patterns from Phase B.

**Tech Stack:** Turborepo (pnpm workspaces), TypeScript strict, Fastify 5, Prisma 6, Postgres on Railway, Vitest (real-DB integration tests), Zod for input validation. State machines pure-TS in `packages/state-machines`; tool schemas pure-TS in `packages/ai-tools` (consumed by Spec 2's Anthropic adapter).

---

## Pre-flight

- [ ] **Read Spec 1 + Vision Narrative**

  Open and skim:
  - `docs/specs/2026-05-09-phase-c-assignment-design.md` — schema, state machines, tool surface contract (especially Sections 3.4, 6, 9.3, 9.6)
  - `docs/specs/2026-05-09-phase-c-vision-narrative.md` — vignettes 1 + 5

- [ ] **Verify Phase B is green on local + Railway**

  Run:

  ```bash
  cd apps/backend
  pnpm test
  ```

  Expected: 50 tests pass, 0 fail. (If anything fails, fix before starting Wave 1 — Phase B regression is a blocker.)

- [ ] **Confirm DATABASE_URL points to axhy-sandbox tenant on Railway**

  Run:

  ```bash
  cat .env.local | grep DATABASE_URL
  ```

  Expected: shows the Railway Postgres URL with `axhy-sandbox` as the active tenant context.

---

## File Structure

**New files (10):**

| Path                                                                                      | Responsibility                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared-schema/prisma/migrations/20260509_phase_c_wave_1_calendar/migration.sql` | One migration: CalendarEntry table + Visit correction columns + `latest_visit` view + 2 triggers + 1 partial unique index                                                                    |
| `packages/shared-schema/src/zod/calendar.ts`                                              | Zod schemas: `CreateCalendarEntryInput`, `UpdateCalendarEntryInput`, `PromoteCalendarEntryInput`, plus discriminated payload schemas per kind                                                |
| `packages/state-machines/src/calendar.ts`                                                 | Pure functions: `computeEditableUntil()`, `validateKindPayload()`, `canEdit()`, `canPromote()`, `mapCalendarPayloadToAssignment()`                                                           |
| `packages/ai-tools/src/tools/calendar.ts`                                                 | Tool schema definitions (Anthropic-compatible JSON schema): `propose_calendar_entry`, `propose_promote_calendar_entry`. No handler — Wave 2 wires the API.                                   |
| `apps/backend/src/routes/calendar.ts`                                                     | Fastify route registrations: POST/PATCH /calendar, POST /calendar/:id/promote, GET /calendar                                                                                                 |
| `apps/backend/test/calendar-create.test.ts`                                               | POST /calendar — 401 unauth, 400 malformed, 400 invalid kind payload, happy path (NOTE / DEMAND / TENTATIVE_ASSIGNMENT / EVENT) writes row + AuditEvent                                      |
| `apps/backend/test/calendar-edit.test.ts`                                                 | PATCH /calendar/:id — 404 wrong-id, 403 past editableUntil, 403 promoted entries are read-only, happy path edits payload + writes AuditEvent                                                 |
| `apps/backend/test/calendar-promote.test.ts`                                              | POST /calendar/:id/promote — 404 wrong-id, 400 invalid target for kind, happy path TENTATIVE_ASSIGNMENT → Assignment row + Calendar.promotedTo\* set + AuditEvent + AuditEvent for promotion |
| `apps/backend/test/calendar-find.test.ts`                                                 | GET /calendar?supervisorId&from&to — returns entries within range, respects editableUntil flag                                                                                               |
| `apps/backend/test/calendar-cross-tenant.test.ts`                                         | Calendar entries from Tenant A invisible to Tenant B across all 4 endpoints                                                                                                                  |

**Modified files (5):**

| Path                                          | Change                                                                                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared-schema/prisma/schema.prisma` | Add `CalendarEntry` model. Add Visit correction columns (`correctsVisitId`, `originalVisitId`, `correctionReason`, `correctionNote`). |
| `packages/shared-schema/src/index.ts`         | Re-export Calendar zod schemas + types                                                                                                |
| `packages/state-machines/src/index.ts`        | Re-export `*` from `./calendar.js`                                                                                                    |
| `packages/ai-tools/src/index.ts`              | Re-export Calendar tool definitions                                                                                                   |
| `apps/backend/src/server.ts`                  | Add `await registerCalendarRoutes(app)` call alongside existing route registrations                                                   |

---

## Task 1: Branch + migration scaffolding

**Files:**

- New branch: `feat/phase-c-wave-1-calendar` from `feat/connectedness-map`

- [ ] **Step 1: Create the feature branch**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git checkout feat/connectedness-map
  git pull origin feat/connectedness-map
  git checkout -b feat/phase-c-wave-1-calendar
  ```

  Expected: now on branch `feat/phase-c-wave-1-calendar`.

- [ ] **Step 2: Create the migration directory**

  ```bash
  mkdir -p packages/shared-schema/prisma/migrations/20260509_phase_c_wave_1_calendar
  touch packages/shared-schema/prisma/migrations/20260509_phase_c_wave_1_calendar/migration.sql
  ```

  Expected: directory and empty file exist.

- [ ] **Step 3: Commit scaffolding**

  ```bash
  git add packages/shared-schema/prisma/migrations/20260509_phase_c_wave_1_calendar/
  git commit -m "chore(schema): scaffold phase C wave 1 migration directory"
  ```

---

## Task 2: Add CalendarEntry model to Prisma schema

**Files:**

- Modify: `packages/shared-schema/prisma/schema.prisma`

- [ ] **Step 1: Add the model after the existing `Visit` model (around line 207)**

  ```prisma
  model CalendarEntry {
    id             String    @id @default(uuid()) @db.Uuid
    companyId      String    @db.Uuid
    /// FK Membership — per-supervisor scope
    supervisorId   String    @db.Uuid
    date           DateTime  @db.Date
    /// 'NOTE' | 'DEMAND' | 'TENTATIVE_ASSIGNMENT' | 'EVENT'
    kind           String
    /// kind-specific structured fields validated at app layer (Zod)
    payload        Json      @default("{}")
    /// @personal — free-form text (PII-bearing, scrubbed on supervisor erasure)
    notes          String?
    /// computed: min(createdAt + 30d, promotedAt) — stored for query speed
    editableUntil  DateTime
    /// 'ASSIGNMENT' | 'SITE_SHIFT_REQ' | 'CHANGE_REQUEST' | null
    promotedToKind String?
    promotedToId   String?   @db.Uuid
    promotedAt     DateTime?
    createdAt      DateTime  @default(now())
    updatedAt      DateTime  @updatedAt

    company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

    @@index([companyId, supervisorId, date])
    @@index([companyId, date])
    @@schema("axhy")
  }
  ```

- [ ] **Step 2: Add Visit correction columns to the `Visit` model**

  Edit the existing `Visit` model (line 172). Add these fields just before the relations block:

  ```prisma
    /// FK to Visit being corrected — null on canonical (uncorrected) row
    correctsVisitId   String?  @db.Uuid
    /// self-pointer to root of correction chain — equals own id on root rows
    originalVisitId   String?  @db.Uuid
    /// 'wrong-site' | 'wrong-time' | 'duplicate' | 'wrong-worker' | 'other'
    correctionReason  String?
    correctionNote    String?
  ```

- [ ] **Step 3: Run prisma generate to refresh types**

  ```bash
  cd packages/shared-schema
  pnpm exec prisma generate
  ```

  Expected: "Generated Prisma Client" success, no errors. New types `CalendarEntry` available.

- [ ] **Step 4: Generate the SQL migration via prisma migrate diff**

  ```bash
  cd packages/shared-schema
  pnpm exec prisma migrate diff \
    --from-migrations ./prisma/migrations \
    --to-schema-datamodel ./prisma/schema.prisma \
    --script > prisma/migrations/20260509_phase_c_wave_1_calendar/migration.sql.draft
  ```

  Expected: file written with CREATE TABLE for CalendarEntry + ALTER TABLE for Visit columns. Inspect the file and rename to `migration.sql` after review:

  ```bash
  mv prisma/migrations/20260509_phase_c_wave_1_calendar/migration.sql.draft \
     prisma/migrations/20260509_phase_c_wave_1_calendar/migration.sql
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add packages/shared-schema/prisma/schema.prisma packages/shared-schema/prisma/migrations/20260509_phase_c_wave_1_calendar/migration.sql
  git commit -m "feat(schema): CalendarEntry table + Visit correction columns (Phase C Wave 1)"
  ```

---

## Task 3: Add latest_visit view + partial unique index + immutability triggers to migration

**Files:**

- Modify: `packages/shared-schema/prisma/migrations/20260509_phase_c_wave_1_calendar/migration.sql`

- [ ] **Step 1: Append the latest_visit view to the migration**

  Open `migration.sql` in your editor and append at the end:

  ```sql
  -- Section 6: latest_visit view
  -- Returns the most-recent (uncorrected) row in each correction chain.
  -- Reporting queries in services/payroll/* and services/billing/* MUST use this view.
  CREATE VIEW "axhy"."latest_visit" AS
    SELECT v.*
    FROM "axhy"."Visit" v
    WHERE NOT EXISTS (
      SELECT 1 FROM "axhy"."Visit" v2
      WHERE v2."correctsVisitId" = v.id
    );

  -- Section 7: partial unique index on Visit correction chain
  -- Guarantees one canonical (uncorrected) row per chain.
  CREATE UNIQUE INDEX "Visit_canonical_per_chain"
    ON "axhy"."Visit" ("originalVisitId")
    WHERE "correctsVisitId" IS NULL;
  ```

- [ ] **Step 2: Append the past-Assignment immutability trigger** (placeholder for now — Assignment table arrives in Wave 2)

  ```sql
  -- Section 8: past-Assignment immutability trigger placeholder.
  -- The Assignment table is created in Wave 2 (Phase C migration 002). The
  -- trigger function is defined here so Wave 2 only needs to attach it.
  CREATE OR REPLACE FUNCTION "axhy"."block_past_assignment_update"()
  RETURNS TRIGGER AS $$
  BEGIN
    IF OLD."validUntil" IS NOT NULL
       AND OLD."validUntil" < CURRENT_DATE
       AND OLD.state != 'TERMINATED' THEN
      RAISE EXCEPTION 'past-immutability: Assignment validUntil < today and state != TERMINATED'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
  ```

  > Note: the `BEFORE UPDATE` trigger that wires this function to Assignment lives in Wave 2's migration. Wave 1 only defines the function so the chain is gradual.

- [ ] **Step 3: Apply migration to Railway sandbox**

  ```bash
  cd packages/shared-schema
  pnpm exec prisma migrate deploy
  ```

  Expected: "1 migration applied: 20260509_phase_c_wave_1_calendar". If error, debug SQL syntax then retry.

- [ ] **Step 4: Sanity-check view exists in DB**

  ```bash
  pnpm exec prisma db execute --schema=./prisma/schema.prisma --stdin <<<"SELECT count(*) FROM axhy.latest_visit;"
  ```

  Expected: returns a count (likely 0 if Visit table empty, but no error).

- [ ] **Step 5: Commit**

  ```bash
  git add packages/shared-schema/prisma/migrations/20260509_phase_c_wave_1_calendar/migration.sql
  git commit -m "feat(schema): latest_visit view + partial unique index + immutability function (Phase C Wave 1)"
  ```

---

## Task 4: Zod schemas for Calendar inputs

**Files:**

- Create: `packages/shared-schema/src/zod/calendar.ts`
- Modify: `packages/shared-schema/src/index.ts`

- [ ] **Step 1: Write the Zod schemas**

  Create `packages/shared-schema/src/zod/calendar.ts`:

  ```ts
  import { z } from 'zod';

  export const CalendarEntryKind = z.enum(['NOTE', 'DEMAND', 'TENTATIVE_ASSIGNMENT', 'EVENT']);
  export type CalendarEntryKindT = z.infer<typeof CalendarEntryKind>;

  // Per-kind payload schemas. Validated at app layer; Prisma stores Json.
  export const NotePayload = z.object({}).strict();

  export const DemandPayload = z
    .object({
      siteId: z.string().uuid(),
      headcount: z.number().int().min(1).max(500),
      shift: z.object({ start: z.string(), end: z.string() }).optional(),
      skillRequired: z.string().max(64).optional(),
    })
    .strict();

  export const TentativeAssignmentPayload = z
    .object({
      workerId: z.string().uuid(),
      siteId: z.string().uuid(),
      shiftStart: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .optional(),
      shiftEnd: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .optional(),
    })
    .strict();

  export const EventPayload = z
    .object({
      siteId: z.string().uuid().optional(),
      title: z.string().min(1).max(200),
      startTime: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .optional(),
      endTime: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .optional(),
    })
    .strict();

  // Discriminated input — kind drives payload shape.
  export const CreateCalendarEntryInput = z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('NOTE'),
      date: z.string(),
      payload: NotePayload,
      notes: z.string().min(1).max(2000),
    }),
    z.object({
      kind: z.literal('DEMAND'),
      date: z.string(),
      payload: DemandPayload,
      notes: z.string().max(2000).optional(),
    }),
    z.object({
      kind: z.literal('TENTATIVE_ASSIGNMENT'),
      date: z.string(),
      payload: TentativeAssignmentPayload,
      notes: z.string().max(2000).optional(),
    }),
    z.object({
      kind: z.literal('EVENT'),
      date: z.string(),
      payload: EventPayload,
      notes: z.string().max(2000).optional(),
    }),
  ]);
  export type CreateCalendarEntryInputT = z.infer<typeof CreateCalendarEntryInput>;

  export const UpdateCalendarEntryInput = z
    .object({
      payload: z.unknown().optional(), // re-validated against kind in route
      notes: z.string().max(2000).nullable().optional(),
    })
    .strict();
  export type UpdateCalendarEntryInputT = z.infer<typeof UpdateCalendarEntryInput>;

  export const PromoteCalendarEntryInput = z
    .object({
      target: z.enum(['assignment', 'requirement', 'change_request']),
      additionalFields: z.record(z.unknown()).optional(), // e.g., validFrom/validUntil for Assignment promotion
    })
    .strict();
  export type PromoteCalendarEntryInputT = z.infer<typeof PromoteCalendarEntryInput>;
  ```

- [ ] **Step 2: Re-export from package index**

  Add to `packages/shared-schema/src/index.ts` (append to existing exports):

  ```ts
  export * from './zod/calendar.js';
  ```

- [ ] **Step 3: Build the package**

  ```bash
  cd packages/shared-schema
  pnpm build
  ```

  Expected: tsc completes without error. Generated types in `dist/`.

- [ ] **Step 4: Commit**

  ```bash
  git add packages/shared-schema/src/zod/calendar.ts packages/shared-schema/src/index.ts
  git commit -m "feat(shared-schema): Zod input schemas for CalendarEntry"
  ```

---

## Task 5: State machine for CalendarEntry (pure functions)

**Files:**

- Create: `packages/state-machines/src/calendar.ts`
- Modify: `packages/state-machines/src/index.ts`

- [ ] **Step 1: Write a failing test alongside (TDD)**

  Create `packages/state-machines/src/calendar.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest';
  import {
    computeEditableUntil,
    canEdit,
    canPromote,
    mapCalendarPayloadToAssignment,
  } from './calendar.js';

  describe('computeEditableUntil', () => {
    it('returns createdAt + 30 days when not promoted', () => {
      const created = new Date('2026-05-09T00:00:00Z');
      const result = computeEditableUntil(created, null);
      expect(result.toISOString()).toBe('2026-06-08T00:00:00.000Z');
    });

    it('returns promotedAt when promoted before 30 days', () => {
      const created = new Date('2026-05-09T00:00:00Z');
      const promoted = new Date('2026-05-12T10:30:00Z');
      const result = computeEditableUntil(created, promoted);
      expect(result.toISOString()).toBe('2026-05-12T10:30:00.000Z');
    });
  });

  describe('canEdit', () => {
    it('blocks if past editableUntil', () => {
      const now = new Date('2026-06-09T00:00:00Z');
      const editableUntil = new Date('2026-06-08T00:00:00Z');
      expect(canEdit(editableUntil, null, now)).toBe(false);
    });
    it('blocks if already promoted', () => {
      const now = new Date('2026-05-15T00:00:00Z');
      const editableUntil = new Date('2026-06-08T00:00:00Z');
      expect(canEdit(editableUntil, new Date('2026-05-14T00:00:00Z'), now)).toBe(false);
    });
    it('allows otherwise', () => {
      const now = new Date('2026-05-15T00:00:00Z');
      expect(canEdit(new Date('2026-06-08T00:00:00Z'), null, now)).toBe(true);
    });
  });

  describe('canPromote', () => {
    it('NOTE cannot promote', () => {
      expect(canPromote('NOTE', 'assignment')).toBe(false);
    });
    it('TENTATIVE_ASSIGNMENT to assignment ok', () => {
      expect(canPromote('TENTATIVE_ASSIGNMENT', 'assignment')).toBe(true);
    });
    it('DEMAND to requirement ok', () => {
      expect(canPromote('DEMAND', 'requirement')).toBe(true);
    });
    it('EVENT to change_request blocked', () => {
      expect(canPromote('EVENT', 'change_request')).toBe(false);
    });
  });

  describe('mapCalendarPayloadToAssignment', () => {
    it('maps TENTATIVE_ASSIGNMENT payload to Assignment fields with single-day shorthand', () => {
      const result = mapCalendarPayloadToAssignment(
        { workerId: 'w1', siteId: 's1', shiftStart: '09:00', shiftEnd: '17:00' },
        new Date('2026-05-12T00:00:00Z'),
        { extraFields: { validUntil: null } },
      );
      expect(result).toEqual({
        workerId: 'w1',
        siteId: 's1',
        shiftStart: '09:00',
        shiftEnd: '17:00',
        // 2026-05-12 is a Tuesday; dayMask "_T_____" places T at position 1 (Monday=0)
        dayMask: '_T_____',
        validFrom: new Date('2026-05-12T00:00:00Z'),
        validUntil: new Date('2026-05-12T00:00:00Z'),
      });
    });
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  ```bash
  cd packages/state-machines
  pnpm test calendar.test.ts
  ```

  Expected: all tests FAIL with "Cannot find module './calendar.js'" or similar.

- [ ] **Step 3: Implement the calendar state-machine module**

  Create `packages/state-machines/src/calendar.ts`:

  ```ts
  /**
   * CalendarEntry state-machine helpers.
   *
   * All functions pure. No DB access, no side effects.
   *
   * @derives(docs/specs/2026-05-09-phase-c-assignment-design.md §3.4, §9.6)
   */

  export type CalendarKind = 'NOTE' | 'DEMAND' | 'TENTATIVE_ASSIGNMENT' | 'EVENT';
  export type PromoteTarget = 'assignment' | 'requirement' | 'change_request';

  const EDITABLE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

  export function computeEditableUntil(createdAt: Date, promotedAt: Date | null): Date {
    const cap = new Date(createdAt.getTime() + EDITABLE_WINDOW_MS);
    if (!promotedAt) return cap;
    return promotedAt.getTime() < cap.getTime() ? promotedAt : cap;
  }

  export function canEdit(
    editableUntil: Date,
    promotedAt: Date | null,
    now: Date = new Date(),
  ): boolean {
    if (promotedAt) return false;
    return now.getTime() < editableUntil.getTime();
  }

  /**
   * Which kinds can promote to which targets.
   *
   * @derives(docs/specs/2026-05-09-phase-c-assignment-design.md §3.4 — kinds table)
   */
  export function canPromote(kind: CalendarKind, target: PromoteTarget): boolean {
    if (kind === 'NOTE') return false;
    if (kind === 'EVENT') return false;
    if (kind === 'DEMAND') return target === 'requirement';
    if (kind === 'TENTATIVE_ASSIGNMENT') return target === 'assignment';
    return false;
  }

  type TentativeAssignmentPayload = {
    workerId: string;
    siteId: string;
    shiftStart?: string;
    shiftEnd?: string;
  };

  /**
   * Map TENTATIVE_ASSIGNMENT calendar entry → Assignment row inputs for
   * single-day promotion (validFrom = validUntil = entry's date).
   *
   * Day-mask layout: 7-char string, Monday-indexed (M T W T F S S).
   *
   * @derives(docs/specs/2026-05-09-phase-c-assignment-design.md §3.2)
   */
  export function mapCalendarPayloadToAssignment(
    payload: TentativeAssignmentPayload,
    date: Date,
    opts: { extraFields?: { validUntil?: Date | null } } = {},
  ): {
    workerId: string;
    siteId: string;
    shiftStart: string;
    shiftEnd: string;
    dayMask: string;
    validFrom: Date;
    validUntil: Date | null;
  } {
    const dayOfWeek = date.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    // Convert Sun-indexed JS day to Mon-indexed mask position
    const mondayIdx = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const dayMask = labels.map((ch, i) => (i === mondayIdx ? ch : '_')).join('');

    const overrideValidUntil = opts.extraFields?.validUntil;
    return {
      workerId: payload.workerId,
      siteId: payload.siteId,
      shiftStart: payload.shiftStart ?? '09:00',
      shiftEnd: payload.shiftEnd ?? '17:00',
      dayMask,
      validFrom: date,
      validUntil: overrideValidUntil === undefined ? date : overrideValidUntil,
    };
  }
  ```

- [ ] **Step 4: Re-export from package index**

  Add to `packages/state-machines/src/index.ts` (append):

  ```ts
  export * from './calendar.js';
  ```

- [ ] **Step 5: Run tests to verify pass**

  ```bash
  cd packages/state-machines
  pnpm test calendar.test.ts
  ```

  Expected: 4 tests pass, 0 fail.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/state-machines/src/calendar.ts packages/state-machines/src/calendar.test.ts packages/state-machines/src/index.ts
  git commit -m "feat(state-machines): CalendarEntry pure-function helpers (computeEditableUntil, canEdit, canPromote, mapCalendarPayloadToAssignment) + 4 unit tests"
  ```

---

## Task 6: AI tool definitions (Wave-1 stubs)

**Files:**

- Create: `packages/ai-tools/src/tools/calendar.ts`
- Modify: `packages/ai-tools/src/index.ts`

> Wave 1 ships _tool schemas_ only. The Anthropic adapter that invokes these tools lives in Wave 2 (Spec 2 territory). Defining schemas now locks the Spec 1 → Spec 2 contract.

- [ ] **Step 1: Write the tool schema definitions**

  Create `packages/ai-tools/src/tools/calendar.ts`:

  ```ts
  /**
   * Calendar tool definitions (Anthropic-compatible JSON schema).
   *
   * Wave 1: schemas only. Wave 2 wires the Anthropic adapter that calls
   * these tools and routes to the backend POST /calendar / POST /calendar/:id/promote routes.
   *
   * @derives(docs/specs/2026-05-09-phase-c-assignment-design.md §9.3, §9.6)
   */

  export const proposeCalendarEntryTool = {
    name: 'propose_calendar_entry',
    description:
      'Propose a soft-state calendar entry on a specific date for the supervisor. Use for: tentative plans, demand statements, free-form notes, and events. NOT for committed assignments — use propose_create_assignment for those. Multiple calls in one turn allowed for compound utterances (see Spec §9.6).',
    input_schema: {
      type: 'object' as const,
      properties: {
        date: {
          type: 'string',
          description: 'ISO date YYYY-MM-DD. Within the next 30 days from today.',
        },
        kind: {
          type: 'string',
          enum: ['NOTE', 'DEMAND', 'TENTATIVE_ASSIGNMENT', 'EVENT'],
          description:
            "NOTE = free-form text only. DEMAND = site needs N workers. TENTATIVE_ASSIGNMENT = supervisor's tentative pick of a worker for a site. EVENT = non-shift event (client visit, audit, etc).",
        },
        payload: {
          type: 'object',
          description:
            'Kind-specific structured fields. NOTE: empty {}. DEMAND: { siteId, headcount, shift?, skillRequired? }. TENTATIVE_ASSIGNMENT: { workerId, siteId, shiftStart?, shiftEnd? }. EVENT: { siteId?, title, startTime?, endTime? }.',
        },
        notes: {
          type: 'string',
          description: 'Free-form supervisor text. Required for NOTE; optional for other kinds.',
        },
      },
      required: ['date', 'kind', 'payload'],
    },
  } as const;

  export const proposePromoteCalendarEntryTool = {
    name: 'propose_promote_calendar_entry',
    description:
      "Promote a soft-state calendar entry to a hard-state row (Assignment, SiteShiftRequirement, or ChangeRequest). Use when supervisor says 'lock in', 'confirm', 'commit' on a previously-stored tentative or demand. Multiple promotes in one turn allowed for batch confirmations.",
    input_schema: {
      type: 'object' as const,
      properties: {
        entryId: {
          type: 'string',
          description: 'CalendarEntry.id to promote.',
        },
        target: {
          type: 'string',
          enum: ['assignment', 'requirement', 'change_request'],
          description:
            'TENTATIVE_ASSIGNMENT promotes to assignment. DEMAND promotes to requirement. NOTE/EVENT cannot promote.',
        },
        additionalFields: {
          type: 'object',
          description:
            "Optional overrides. Example: { validUntil: null } to make a TENTATIVE_ASSIGNMENT promotion open-ended (default is single-day matching entry's date).",
        },
      },
      required: ['entryId', 'target'],
    },
  } as const;

  export const calendarTools = [proposeCalendarEntryTool, proposePromoteCalendarEntryTool] as const;
  ```

- [ ] **Step 2: Re-export from index**

  Add to `packages/ai-tools/src/index.ts`:

  ```ts
  export * from './tools/calendar.js';
  ```

- [ ] **Step 3: Build**

  ```bash
  cd packages/ai-tools
  pnpm build
  ```

  Expected: tsc clean.

- [ ] **Step 4: Commit**

  ```bash
  git add packages/ai-tools/src/tools/calendar.ts packages/ai-tools/src/index.ts
  git commit -m "feat(ai-tools): tool schemas for propose_calendar_entry + propose_promote_calendar_entry (Wave 1 — schemas only, Wave 2 wires Anthropic)"
  ```

---

## Task 7: POST /calendar route — TDD red phase

**Files:**

- Create: `apps/backend/test/calendar-create.test.ts`

- [ ] **Step 1: Write the integration test (will fail until route exists)**

  Create `apps/backend/test/calendar-create.test.ts`:

  ```ts
  /**
   * Real-DB integration test: POST /calendar
   *
   * Exercises:
   *   1. 401 unauth
   *   2. 400 malformed body
   *   3. 400 invalid kind payload (e.g., DEMAND missing siteId)
   *   4. happy path: NOTE entry persists + AuditEvent
   *   5. happy path: DEMAND entry with full payload
   *   6. happy path: TENTATIVE_ASSIGNMENT entry — supervisor's "thinking Pradeep" magic moment
   *
   * @derives(docs/specs/2026-05-09-phase-c-assignment-design.md §3.4, §9.3)
   * @derives(docs/specs/2026-05-09-phase-c-vision-narrative.md vignette 1)
   */

  import { describe, it, expect, beforeAll, afterAll } from 'vitest';
  import type { FastifyInstance } from 'fastify';
  import { PrismaClient } from '@prisma/client';

  process.env.AXHY_OTP_BYPASS = '1';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

  const dbUrl =
    process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
  process.env.DATABASE_URL = dbUrl;

  const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const TEST_PREFIX = `cal-create-${Date.now()}-`;

  let app: FastifyInstance;
  let companyId: string;
  let supervisorId: string;
  let workerId: string;
  let siteId: string;
  let accessToken: string;

  beforeAll(async () => {
    const { buildServer } = await import('../src/server.js');
    const { issueAccessToken } = await import('../src/lib/jwt.js');
    app = await buildServer();
    await app.ready();

    const co = await prismaRaw.company.create({
      data: {
        name: TEST_PREFIX + 'Co',
        slug: TEST_PREFIX + 'co',
        ownerPhone: '+919900000010',
        ownerName: 'Owner',
      },
    });
    companyId = co.id;

    const sup = await prismaRaw.user.create({
      data: { phone: `+9199${String(Date.now()).slice(-8)}`, name: 'Sup', locale: 'en' },
    });
    const supMembership = await prismaRaw.membership.create({
      data: { companyId, userId: sup.id, role: 'SUPERVISOR', state: 'ACTIVE' },
    });
    supervisorId = supMembership.id;

    const worker = await prismaRaw.worker.create({
      data: { companyId, name: 'Pradeep', state: 'ACTIVE' },
    });
    workerId = worker.id;

    const site = await prismaRaw.site.create({
      data: { companyId, name: 'Apollo Hospital' },
    });
    siteId = site.id;

    accessToken = await issueAccessToken({
      sub: sup.id,
      companyId,
      role: 'SUPERVISOR',
      availableRoles: ['SUPERVISOR'],
      locale: 'en',
    });
  });

  afterAll(async () => {
    await prismaRaw.calendarEntry.deleteMany({ where: { companyId } });
    await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
    await prismaRaw.worker.deleteMany({ where: { companyId } });
    await prismaRaw.site.deleteMany({ where: { companyId } });
    await prismaRaw.membership.deleteMany({ where: { companyId } });
    await prismaRaw.company.delete({ where: { id: companyId } });
    await prismaRaw.$disconnect();
    await app.close();
  });

  describe('POST /calendar', () => {
    it('401 without auth', async () => {
      const r = await app.inject({
        method: 'POST',
        url: '/calendar',
        payload: { kind: 'NOTE', date: '2026-05-12', payload: {}, notes: 'test' },
      });
      expect(r.statusCode).toBe(401);
    });

    it('400 on missing kind', async () => {
      const r = await app.inject({
        method: 'POST',
        url: '/calendar',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { date: '2026-05-12', payload: {}, notes: 'test' },
      });
      expect(r.statusCode).toBe(400);
    });

    it('400 on DEMAND without siteId', async () => {
      const r = await app.inject({
        method: 'POST',
        url: '/calendar',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { kind: 'DEMAND', date: '2026-05-12', payload: { headcount: 5 }, notes: 'apollo' },
      });
      expect(r.statusCode).toBe(400);
    });

    it('happy path: NOTE entry', async () => {
      const r = await app.inject({
        method: 'POST',
        url: '/calendar',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          kind: 'NOTE',
          date: '2026-05-12',
          payload: {},
          notes: 'Diwali Mon — short shifts everywhere',
        },
      });
      expect(r.statusCode).toBe(200);
      const body = r.json();
      expect(body.id).toBeTruthy();
      expect(body.kind).toBe('NOTE');
      expect(body.editableUntil).toBeTruthy();

      // verify row + audit event
      const row = await prismaRaw.calendarEntry.findUnique({ where: { id: body.id } });
      expect(row?.notes).toBe('Diwali Mon — short shifts everywhere');
      const audit = await prismaRaw.auditEvent.findFirst({
        where: { companyId, kind: 'CALENDAR_ENTRY_CREATED', targetId: body.id },
      });
      expect(audit).toBeTruthy();
    });

    it('happy path: DEMAND entry with full payload', async () => {
      const r = await app.inject({
        method: 'POST',
        url: '/calendar',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          kind: 'DEMAND',
          date: '2026-05-12',
          payload: { siteId, headcount: 5 },
          notes: 'Apollo needs 5 next Tuesday',
        },
      });
      expect(r.statusCode).toBe(200);
      const body = r.json();
      expect(body.kind).toBe('DEMAND');
      expect(body.payload).toEqual({ siteId, headcount: 5 });
    });

    it('happy path: TENTATIVE_ASSIGNMENT (vignette 1 magic)', async () => {
      const r = await app.inject({
        method: 'POST',
        url: '/calendar',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          kind: 'TENTATIVE_ASSIGNMENT',
          date: '2026-05-12',
          payload: { workerId, siteId, shiftStart: '09:00', shiftEnd: '17:00' },
          notes: 'Thinking Pradeep at Apollo Tuesday',
        },
      });
      expect(r.statusCode).toBe(200);
      const body = r.json();
      expect(body.kind).toBe('TENTATIVE_ASSIGNMENT');
      expect(body.payload.workerId).toBe(workerId);
    });
  });
  ```

- [ ] **Step 2: Run the test to confirm it fails (route doesn't exist yet)**

  ```bash
  cd apps/backend
  pnpm test calendar-create.test.ts
  ```

  Expected: all tests FAIL — likely 404 since route is unregistered. (Or 401 due to error before reaching missing route — either is fine; what matters is no 200 happy-path passes yet.)

- [ ] **Step 3: Commit the red test**

  ```bash
  git add apps/backend/test/calendar-create.test.ts
  git commit -m "test(backend): failing integration test for POST /calendar (TDD red phase)"
  ```

---

## Task 8: POST /calendar route — TDD green phase

**Files:**

- Create: `apps/backend/src/routes/calendar.ts`
- Modify: `apps/backend/src/server.ts`

- [ ] **Step 1: Implement the route**

  Create `apps/backend/src/routes/calendar.ts`:

  ```ts
  /**
   * Calendar routes — supervisor's soft-state planning surface.
   *
   * Wave 1 endpoints:
   *   POST   /calendar               — create CalendarEntry
   *   PATCH  /calendar/:id           — edit (within editableUntil window)
   *   POST   /calendar/:id/promote   — promote to hard state (Assignment / SiteShiftRequirement)
   *   GET    /calendar               — find by supervisor + date range
   *
   * @derives(docs/specs/2026-05-09-phase-c-assignment-design.md §3.4, §9.3)
   * @derives(docs/specs/2026-05-09-phase-c-vision-narrative.md vignettes 1, 5)
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
    });

    // PATCH and POST /promote and GET registered in subsequent tasks.
  }
  ```

- [ ] **Step 2: Wire into server.ts**

  Modify `apps/backend/src/server.ts` — find the existing route-registration block (where `registerSwapRequestRoutes(app)` etc. are called) and add:

  ```ts
  await registerCalendarRoutes(app);
  ```

  Also add the import at the top alongside other route imports:

  ```ts
  import { registerCalendarRoutes } from './routes/calendar.js';
  ```

- [ ] **Step 3: Run tests to verify green**

  ```bash
  cd apps/backend
  pnpm test calendar-create.test.ts
  ```

  Expected: 6/6 tests pass.

- [ ] **Step 4: Commit**

  ```bash
  git add apps/backend/src/routes/calendar.ts apps/backend/src/server.ts
  git commit -m "feat(backend): POST /calendar route — CalendarEntry create with AuditEvent"
  ```

---

## Task 9: PATCH /calendar/:id route + edit test

**Files:**

- Create: `apps/backend/test/calendar-edit.test.ts`
- Modify: `apps/backend/src/routes/calendar.ts`

- [ ] **Step 1: Write the failing edit test**

  Create `apps/backend/test/calendar-edit.test.ts`:

  ```ts
  import { describe, it, expect, beforeAll, afterAll } from 'vitest';
  import type { FastifyInstance } from 'fastify';
  import { PrismaClient } from '@prisma/client';

  process.env.AXHY_OTP_BYPASS = '1';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

  const dbUrl =
    process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
  process.env.DATABASE_URL = dbUrl;

  const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const TEST_PREFIX = `cal-edit-${Date.now()}-`;

  let app: FastifyInstance;
  let companyId: string;
  let supervisorUserId: string;
  let accessToken: string;
  let entryId: string;

  beforeAll(async () => {
    const { buildServer } = await import('../src/server.js');
    const { issueAccessToken } = await import('../src/lib/jwt.js');
    app = await buildServer();
    await app.ready();

    const co = await prismaRaw.company.create({
      data: {
        name: TEST_PREFIX + 'Co',
        slug: TEST_PREFIX + 'co',
        ownerPhone: '+919900000020',
        ownerName: 'O',
      },
    });
    companyId = co.id;
    const sup = await prismaRaw.user.create({
      data: { phone: `+9199${String(Date.now()).slice(-8)}`, name: 'S', locale: 'en' },
    });
    supervisorUserId = sup.id;
    await prismaRaw.membership.create({
      data: { companyId, userId: sup.id, role: 'SUPERVISOR', state: 'ACTIVE' },
    });

    accessToken = await issueAccessToken({
      sub: sup.id,
      companyId,
      role: 'SUPERVISOR',
      availableRoles: ['SUPERVISOR'],
      locale: 'en',
    });

    // Seed an entry to edit
    const entry = await prismaRaw.calendarEntry.create({
      data: {
        companyId,
        supervisorId: sup.id,
        date: new Date('2026-05-12'),
        kind: 'NOTE',
        payload: {},
        notes: 'original',
        editableUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    entryId = entry.id;
  });

  afterAll(async () => {
    await prismaRaw.calendarEntry.deleteMany({ where: { companyId } });
    await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
    await prismaRaw.membership.deleteMany({ where: { companyId } });
    await prismaRaw.company.delete({ where: { id: companyId } });
    await prismaRaw.$disconnect();
    await app.close();
  });

  describe('PATCH /calendar/:id', () => {
    it('404 on wrong id', async () => {
      const r = await app.inject({
        method: 'PATCH',
        url: '/calendar/00000000-0000-4000-8000-000000000000',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { notes: 'updated' },
      });
      expect(r.statusCode).toBe(404);
    });

    it('happy path: notes update', async () => {
      const r = await app.inject({
        method: 'PATCH',
        url: `/calendar/${entryId}`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { notes: 'updated text' },
      });
      expect(r.statusCode).toBe(200);
      const row = await prismaRaw.calendarEntry.findUnique({ where: { id: entryId } });
      expect(row?.notes).toBe('updated text');
    });

    it('403 if past editableUntil', async () => {
      // age the entry past its window
      await prismaRaw.calendarEntry.update({
        where: { id: entryId },
        data: { editableUntil: new Date(Date.now() - 60_000) },
      });
      const r = await app.inject({
        method: 'PATCH',
        url: `/calendar/${entryId}`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { notes: 'too late' },
      });
      expect(r.statusCode).toBe(403);
    });
  });
  ```

- [ ] **Step 2: Run to confirm fail**

  ```bash
  cd apps/backend
  pnpm test calendar-edit.test.ts
  ```

  Expected: tests fail (route not implemented).

- [ ] **Step 3: Implement PATCH handler in calendar.ts**

  In `apps/backend/src/routes/calendar.ts`, add inside `registerCalendarRoutes`:

  ```ts
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
  ```

- [ ] **Step 4: Run test to verify pass**

  ```bash
  pnpm test calendar-edit.test.ts
  ```

  Expected: 3/3 pass.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/backend/src/routes/calendar.ts apps/backend/test/calendar-edit.test.ts
  git commit -m "feat(backend): PATCH /calendar/:id with editableUntil guard"
  ```

---

## Task 10: POST /calendar/:id/promote route + promote test

**Files:**

- Create: `apps/backend/test/calendar-promote.test.ts`
- Modify: `apps/backend/src/routes/calendar.ts`

> **Note:** Wave 1 promotes TENTATIVE_ASSIGNMENT → Assignment ONLY (the magic vignette). DEMAND → SiteShiftRequirement and CHANGE_REQUEST promotion are Wave 2 (those tables don't exist yet). For Wave 1, return 501 NOT_IMPLEMENTED for non-assignment targets.

- [ ] **Step 1: Write the test**

  Create `apps/backend/test/calendar-promote.test.ts`:

  ```ts
  import { describe, it, expect, beforeAll, afterAll } from 'vitest';
  import type { FastifyInstance } from 'fastify';
  import { PrismaClient } from '@prisma/client';

  process.env.AXHY_OTP_BYPASS = '1';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

  const dbUrl =
    process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
  process.env.DATABASE_URL = dbUrl;

  const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const TEST_PREFIX = `cal-promote-${Date.now()}-`;

  let app: FastifyInstance;
  let companyId: string;
  let supId: string;
  let accessToken: string;
  let workerId: string;
  let siteId: string;

  beforeAll(async () => {
    const { buildServer } = await import('../src/server.js');
    const { issueAccessToken } = await import('../src/lib/jwt.js');
    app = await buildServer();
    await app.ready();

    const co = await prismaRaw.company.create({
      data: {
        name: TEST_PREFIX + 'Co',
        slug: TEST_PREFIX + 'co',
        ownerPhone: '+919900000030',
        ownerName: 'O',
      },
    });
    companyId = co.id;
    const sup = await prismaRaw.user.create({
      data: { phone: `+9199${String(Date.now()).slice(-8)}`, name: 'S', locale: 'en' },
    });
    supId = sup.id;
    await prismaRaw.membership.create({
      data: { companyId, userId: sup.id, role: 'SUPERVISOR', state: 'ACTIVE' },
    });
    const w = await prismaRaw.worker.create({
      data: { companyId, name: 'Pradeep', state: 'ACTIVE' },
    });
    workerId = w.id;
    const s = await prismaRaw.site.create({ data: { companyId, name: 'Apollo' } });
    siteId = s.id;

    accessToken = await issueAccessToken({
      sub: sup.id,
      companyId,
      role: 'SUPERVISOR',
      availableRoles: ['SUPERVISOR'],
      locale: 'en',
    });
  });

  afterAll(async () => {
    await prismaRaw.calendarEntry.deleteMany({ where: { companyId } });
    await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
    await prismaRaw.worker.deleteMany({ where: { companyId } });
    await prismaRaw.site.deleteMany({ where: { companyId } });
    await prismaRaw.membership.deleteMany({ where: { companyId } });
    await prismaRaw.company.delete({ where: { id: companyId } });
    await prismaRaw.$disconnect();
    await app.close();
  });

  describe('POST /calendar/:id/promote', () => {
    it('happy path: TENTATIVE_ASSIGNMENT → Assignment row', async () => {
      // Seed tentative
      const entry = await prismaRaw.calendarEntry.create({
        data: {
          companyId,
          supervisorId: supId,
          date: new Date('2026-05-12'),
          kind: 'TENTATIVE_ASSIGNMENT',
          payload: { workerId, siteId, shiftStart: '09:00', shiftEnd: '17:00' },
          notes: null,
          editableUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      const r = await app.inject({
        method: 'POST',
        url: `/calendar/${entry.id}/promote`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { target: 'assignment' },
      });
      expect(r.statusCode).toBe(200);
      const body = r.json();
      expect(body.promoted.kind).toBe('ASSIGNMENT');
      expect(body.promoted.id).toBeTruthy();

      // Calendar entry now has promotedTo* set
      const updatedEntry = await prismaRaw.calendarEntry.findUnique({ where: { id: entry.id } });
      expect(updatedEntry?.promotedToKind).toBe('ASSIGNMENT');
      expect(updatedEntry?.promotedToId).toBe(body.promoted.id);
      expect(updatedEntry?.promotedAt).toBeTruthy();

      // AuditEvents: 1 promotion + 1 assignment-created
      const audits = await prismaRaw.auditEvent.findMany({
        where: {
          companyId,
          OR: [{ kind: 'CALENDAR_ENTRY_PROMOTED' }, { kind: 'ASSIGNMENT_CREATED' }],
        },
      });
      expect(audits.length).toBeGreaterThanOrEqual(2);
    });

    it('400 when promoting NOTE (canPromote returns false)', async () => {
      const note = await prismaRaw.calendarEntry.create({
        data: {
          companyId,
          supervisorId: supId,
          date: new Date('2026-05-12'),
          kind: 'NOTE',
          payload: {},
          notes: 'cant promote',
          editableUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      const r = await app.inject({
        method: 'POST',
        url: `/calendar/${note.id}/promote`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { target: 'assignment' },
      });
      expect(r.statusCode).toBe(400);
    });

    it('501 for DEMAND → requirement (not Wave 1 scope)', async () => {
      const demand = await prismaRaw.calendarEntry.create({
        data: {
          companyId,
          supervisorId: supId,
          date: new Date('2026-05-12'),
          kind: 'DEMAND',
          payload: { siteId, headcount: 5 },
          notes: null,
          editableUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      const r = await app.inject({
        method: 'POST',
        url: `/calendar/${demand.id}/promote`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { target: 'requirement' },
      });
      expect(r.statusCode).toBe(501);
    });
  });
  ```

- [ ] **Step 2: Run to confirm fail**

  ```bash
  pnpm test calendar-promote.test.ts
  ```

  Expected: tests fail.

- [ ] **Step 3: Implement promote handler**

  > **Wave-1 simplification:** Wave 1 doesn't have an `Assignment` Prisma table yet (Wave 2 brings it). Until Wave 2 lands, promotion writes a placeholder row to a temporary `_pending_assignment` table OR returns the to-be-Assignment payload + tags the CalendarEntry as promoted with a synthetic id. Pick one:

  **Option A (chosen for Wave 1):** Write a _deferred_ assignment payload as JSON in the CalendarEntry's `promotedToKind='ASSIGNMENT'` + `promotedToId=null` + new column `pendingAssignmentPayload Json?` (added in this task's migration). Wave 2 picks up these pending payloads and creates real Assignment rows.

  > **Migration patch:** Add to `migration.sql`:
  >
  > ```sql
  > ALTER TABLE "axhy"."CalendarEntry" ADD COLUMN "pendingAssignmentPayload" JSONB;
  > ```
  >
  > Update Prisma model accordingly + run `pnpm exec prisma generate`.

  Add to `apps/backend/src/routes/calendar.ts`:

  ```ts
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

        // Map calendar payload → Assignment payload (Wave 2 inserts into Assignment table)
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

        // Wave 1 stores deferred payload; Wave 2 creates real Assignment row.
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
  ```

- [ ] **Step 4: Apply migration patch**

  ```bash
  cd packages/shared-schema
  pnpm exec prisma migrate deploy
  pnpm exec prisma generate
  cd ../..
  ```

- [ ] **Step 5: Run tests**

  ```bash
  cd apps/backend
  pnpm test calendar-promote.test.ts
  ```

  Expected: 3/3 pass.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/shared-schema/prisma/schema.prisma packages/shared-schema/prisma/migrations/20260509_phase_c_wave_1_calendar/migration.sql apps/backend/src/routes/calendar.ts apps/backend/test/calendar-promote.test.ts
  git commit -m "feat(backend): POST /calendar/:id/promote — TENTATIVE_ASSIGNMENT to deferred Assignment payload (Wave 2 will hydrate)"
  ```

---

## Task 11: GET /calendar route + find test

**Files:**

- Create: `apps/backend/test/calendar-find.test.ts`
- Modify: `apps/backend/src/routes/calendar.ts`

- [ ] **Step 1: Write the failing test**

  Create `apps/backend/test/calendar-find.test.ts`:

  ```ts
  import { describe, it, expect, beforeAll, afterAll } from 'vitest';
  import type { FastifyInstance } from 'fastify';
  import { PrismaClient } from '@prisma/client';

  process.env.AXHY_OTP_BYPASS = '1';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

  const dbUrl =
    process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
  process.env.DATABASE_URL = dbUrl;

  const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const TEST_PREFIX = `cal-find-${Date.now()}-`;

  let app: FastifyInstance;
  let companyId: string;
  let supId: string;
  let accessToken: string;

  beforeAll(async () => {
    const { buildServer } = await import('../src/server.js');
    const { issueAccessToken } = await import('../src/lib/jwt.js');
    app = await buildServer();
    await app.ready();

    const co = await prismaRaw.company.create({
      data: {
        name: TEST_PREFIX + 'Co',
        slug: TEST_PREFIX + 'co',
        ownerPhone: '+919900000040',
        ownerName: 'O',
      },
    });
    companyId = co.id;
    const sup = await prismaRaw.user.create({
      data: { phone: `+9199${String(Date.now()).slice(-8)}`, name: 'S', locale: 'en' },
    });
    supId = sup.id;
    await prismaRaw.membership.create({
      data: { companyId, userId: sup.id, role: 'SUPERVISOR', state: 'ACTIVE' },
    });

    accessToken = await issueAccessToken({
      sub: sup.id,
      companyId,
      role: 'SUPERVISOR',
      availableRoles: ['SUPERVISOR'],
      locale: 'en',
    });

    // Seed 3 entries: one in range, one before, one after
    await prismaRaw.calendarEntry.createMany({
      data: [
        {
          companyId,
          supervisorId: sup.id,
          date: new Date('2026-05-12'),
          kind: 'NOTE',
          payload: {},
          notes: 'in range',
          editableUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        {
          companyId,
          supervisorId: sup.id,
          date: new Date('2026-04-01'),
          kind: 'NOTE',
          payload: {},
          notes: 'before',
          editableUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        {
          companyId,
          supervisorId: sup.id,
          date: new Date('2026-06-30'),
          kind: 'NOTE',
          payload: {},
          notes: 'after',
          editableUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      ],
    });
  });

  afterAll(async () => {
    await prismaRaw.calendarEntry.deleteMany({ where: { companyId } });
    await prismaRaw.membership.deleteMany({ where: { companyId } });
    await prismaRaw.company.delete({ where: { id: companyId } });
    await prismaRaw.$disconnect();
    await app.close();
  });

  describe('GET /calendar', () => {
    it('returns only entries within from/to range', async () => {
      const r = await app.inject({
        method: 'GET',
        url: `/calendar?supervisorId=${supId}&from=2026-05-01&to=2026-05-31`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(r.statusCode).toBe(200);
      const body = r.json();
      expect(body.entries.length).toBe(1);
      expect(body.entries[0].notes).toBe('in range');
    });
  });
  ```

- [ ] **Step 2: Implement GET handler**

  Add to `apps/backend/src/routes/calendar.ts`:

  ```ts
  app.get<{ Querystring: { supervisorId?: string; from?: string; to?: string } }>(
    '/calendar',
    { preHandler: requireAuth },
    async (req, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED' });
        return;
      }

      const supervisorId = req.query.supervisorId ?? auth.userId;
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
  ```

- [ ] **Step 3: Run tests to verify pass**

  ```bash
  pnpm test calendar-find.test.ts
  ```

  Expected: 1/1 pass.

- [ ] **Step 4: Commit**

  ```bash
  git add apps/backend/src/routes/calendar.ts apps/backend/test/calendar-find.test.ts
  git commit -m "feat(backend): GET /calendar with supervisor + date-range filter"
  ```

---

## Task 12: Cross-tenant isolation test

**Files:**

- Create: `apps/backend/test/calendar-cross-tenant.test.ts`

- [ ] **Step 1: Write the test**

  Create `apps/backend/test/calendar-cross-tenant.test.ts`:

  ```ts
  /**
   * Cross-tenant isolation for all 4 Calendar endpoints.
   * Tenant B's token must never see / edit / promote / find Tenant A's calendar entries.
   *
   * @derives(Phase B's cross-tenant-isolation.test.ts pattern)
   */

  import { describe, it, expect, beforeAll, afterAll } from 'vitest';
  import type { FastifyInstance } from 'fastify';
  import { PrismaClient } from '@prisma/client';

  process.env.AXHY_OTP_BYPASS = '1';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

  const dbUrl =
    process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
  process.env.DATABASE_URL = dbUrl;

  const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const TEST_PREFIX = `cal-xtenant-${Date.now()}-`;

  let app: FastifyInstance;
  let coAId: string;
  let coBId: string;
  let supBToken: string;
  let entryAId: string;

  beforeAll(async () => {
    const { buildServer } = await import('../src/server.js');
    const { issueAccessToken } = await import('../src/lib/jwt.js');
    app = await buildServer();
    await app.ready();

    const a = await prismaRaw.company.create({
      data: {
        name: TEST_PREFIX + 'A',
        slug: TEST_PREFIX + 'a',
        ownerPhone: '+919900000050',
        ownerName: 'OA',
      },
    });
    coAId = a.id;
    const b = await prismaRaw.company.create({
      data: {
        name: TEST_PREFIX + 'B',
        slug: TEST_PREFIX + 'b',
        ownerPhone: '+919900000051',
        ownerName: 'OB',
      },
    });
    coBId = b.id;

    const supA = await prismaRaw.user.create({
      data: { phone: `+9199${String(Date.now()).slice(-8)}`, name: 'A', locale: 'en' },
    });
    const supB = await prismaRaw.user.create({
      data: { phone: `+9199${String(Date.now() + 1).slice(-8)}`, name: 'B', locale: 'en' },
    });
    await prismaRaw.membership.create({
      data: { companyId: coAId, userId: supA.id, role: 'SUPERVISOR', state: 'ACTIVE' },
    });
    await prismaRaw.membership.create({
      data: { companyId: coBId, userId: supB.id, role: 'SUPERVISOR', state: 'ACTIVE' },
    });

    const entryA = await prismaRaw.calendarEntry.create({
      data: {
        companyId: coAId,
        supervisorId: supA.id,
        date: new Date('2026-05-12'),
        kind: 'NOTE',
        payload: {},
        notes: 'tenant A only',
        editableUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    entryAId = entryA.id;

    supBToken = await issueAccessToken({
      sub: supB.id,
      companyId: coBId,
      role: 'SUPERVISOR',
      availableRoles: ['SUPERVISOR'],
      locale: 'en',
    });
  });

  afterAll(async () => {
    await prismaRaw.calendarEntry.deleteMany({
      where: { OR: [{ companyId: coAId }, { companyId: coBId }] },
    });
    await prismaRaw.membership.deleteMany({
      where: { OR: [{ companyId: coAId }, { companyId: coBId }] },
    });
    await prismaRaw.company.deleteMany({ where: { id: { in: [coAId, coBId] } } });
    await prismaRaw.$disconnect();
    await app.close();
  });

  describe('Cross-tenant isolation — Calendar', () => {
    it('Tenant B cannot PATCH Tenant A entry (404, not 403 — leakage of existence is itself a leak)', async () => {
      const r = await app.inject({
        method: 'PATCH',
        url: `/calendar/${entryAId}`,
        headers: { authorization: `Bearer ${supBToken}` },
        payload: { notes: 'hijack attempt' },
      });
      expect(r.statusCode).toBe(404);
    });

    it('Tenant B cannot promote Tenant A entry', async () => {
      const r = await app.inject({
        method: 'POST',
        url: `/calendar/${entryAId}/promote`,
        headers: { authorization: `Bearer ${supBToken}` },
        payload: { target: 'assignment' },
      });
      expect(r.statusCode).toBe(404);
    });

    it("Tenant B's GET /calendar returns 0 entries when filtering for Tenant A's date range", async () => {
      const r = await app.inject({
        method: 'GET',
        url: `/calendar?from=2026-05-01&to=2026-05-31`,
        headers: { authorization: `Bearer ${supBToken}` },
      });
      expect(r.statusCode).toBe(200);
      const body = r.json();
      expect(body.entries.length).toBe(0);
    });
  });
  ```

- [ ] **Step 2: Run**

  ```bash
  cd apps/backend
  pnpm test calendar-cross-tenant.test.ts
  ```

  Expected: 3/3 pass (existing tenant-context middleware enforces this for free).

- [ ] **Step 3: Commit**

  ```bash
  git add apps/backend/test/calendar-cross-tenant.test.ts
  git commit -m "test(backend): cross-tenant isolation for Calendar endpoints"
  ```

---

## Task 13: Run full Phase B + Wave 1 test suite — non-regression check

- [ ] **Step 1: Run all backend tests**

  ```bash
  cd apps/backend
  pnpm test
  ```

  Expected: 50 (Phase B) + ~13 (Calendar Wave 1) = ~63 tests pass. 0 fails.

- [ ] **Step 2: If any Phase B test failed, STOP — investigate**

  Read the failing test output. Phase B regressions are blockers. Common causes:
  - Migration accidentally altered a Phase B table → review `migration.sql`
  - Server.ts route registration order broke something → check imports

- [ ] **Step 3: If green, commit a marker**

  ```bash
  git commit --allow-empty -m "ci(backend): Wave 1 + Phase B both green (63 tests)"
  ```

---

## Task 14: Push branch + open draft PR

- [ ] **Step 1: Push**

  ```bash
  git push -u origin feat/phase-c-wave-1-calendar
  ```

- [ ] **Step 2: Open draft PR**

  ```bash
  gh pr create --draft --title "Phase C Wave 1 — Calendar primitive (vertical slice)" --body "$(cat <<'EOF'
  ## Summary

  - CalendarEntry table (18th in schema lock) — soft-state planning surface
  - Visit correction columns (correctsVisitId, originalVisitId, correctionReason, correctionNote)
  - latest_visit view + partial unique index on canonical Visit per chain
  - Past-Assignment immutability function (trigger attached in Wave 2)
  - 4 endpoints: POST/PATCH/POST-promote/GET on /calendar
  - 13 integration tests on real Railway, all green
  - State-machine helpers in @axhy/state-machines (4 unit tests)
  - AI tool definitions in @axhy/ai-tools (Wave 2 wires Anthropic adapter)

  Implements vignettes 1 + 5 from Vision Narrative — Mukesh's "thinking out loud" → tentative entry, then "lock in Apollo Tuesday" → promotion to Assignment.

  Wave-1 scope deliberately limited:
  - Promotion to assignment only (DEMAND→requirement and CHANGE_REQUEST come in Wave 2)
  - Assignment row creation deferred — Wave 1 stores pendingAssignmentPayload; Wave 2 hydrates real Assignment rows.
  - AI tool schemas defined but not wired to Anthropic — Wave 2.

  ## Test plan

  - [ ] All 50 Phase B tests still pass
  - [ ] 13 Wave 1 tests pass
  - [ ] Cross-tenant isolation enforced on all 4 endpoints
  - [ ] Migration applies cleanly to Railway sandbox
  - [ ] latest_visit view returns rows when Visit table populated

  Spec: docs/specs/2026-05-09-phase-c-assignment-design.md
  Vision: docs/specs/2026-05-09-phase-c-vision-narrative.md

  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  EOF
  )"
  ```

  Expected: PR URL printed.

- [ ] **Step 3: Report PR URL** to the founder for review.

---

## Self-review

I checked this plan against the spec sections it covers:

- **Spec §3.4** (CalendarEntry schema) — Task 2 + 10 (pendingAssignmentPayload added)
- **Spec §6** (Visit correction infrastructure) — Task 2 (columns) + Task 3 (view + index)
- **Spec §9.3** (Calendar tools) — Task 6
- **Spec §9.6** (Multi-call pattern) — Documented in tool descriptions; no backend change needed (frontend renders batch DecisionCard in Spec 3)
- **Vignette 1 + 5** (Vision Narrative) — Tasks 7-10 cover the full magic loop

**Spec gaps left for later waves (intentional):**

- `Assignment` table itself → Wave 2
- `propose_create_assignment`, `propose_terminate_assignment`, etc. → Wave 2
- AI chat (Anthropic adapter) → Wave 2
- Real Outbox cascades on promotion (gupshup.send to workers) → Wave 2
- Mobile UI rendering → Wave 4

**Type consistency check:** `mapCalendarPayloadToAssignment` returns `dayMask, validFrom, validUntil, ...` consistently between state-machine signature (Task 5) and route consumer (Task 10). `editableUntil` computed in `computeEditableUntil` and stored in Prisma — consistent. `kind` enum values match across Zod schema (Task 4), state-machine (Task 5), tool definition (Task 6), and route (Task 8).

**Placeholder check:** No "TBD" / "TODO" / "implement later" / "appropriate error handling" / vague refs. Every step has runnable code or an exact command.

---

**Plan complete and saved to `docs/plans/2026-05-09-phase-c-wave-1-calendar.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
