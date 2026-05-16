---
Status: Historical
Last validated against code: 2026-05-12
Validated branch: feat/phase-c-wave-4b-chat-completion
Validated commit: 49bc079
Primary owner: founder (Akshay Thota)
Replaces: nothing — first-version
Replaced by: nothing — historical record only
---

> **Historical record.** Preserved for traceability. Do not use for current implementation decisions. See `docs/index/canonical-truth.md` for the active doc tree.

# Phase C Wave 2a — AI chat vertical slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the AI chat magic loop end-to-end: voice (or text) → POST /chat/messages → Anthropic Sonnet 4.6 tool-use → DecisionCard → tap → POST /chat/apply → real Assignment row created. ONE tool wired (propose_create_assignment) plus its read dependencies (find_workers, find_sites). Hydrate Wave 1's deferred Assignment payloads into real rows.

**Architecture:** Single Wave 2a migration creates `Assignment` + `ChatRequestLog` + `ChatThread` + `ChatMessage` tables. Trigger `block_past_assignment_update` (function defined in Wave 1) attached to Assignment. New backend routes: `POST /assignments`, `POST /chat/messages`, `POST /chat/apply`. New `@axhy/ai-tools` Anthropic adapter (`sonnet-tool-loop.ts`) wraps the SDK's tool-use loop pattern. Idempotency dedup via ChatRequestLog (24h TTL). Server-side concurrency cap (50 concurrent chats per instance). One-time hydrator script converts Wave 1's `pendingAssignmentPayload` → real Assignment rows.

**Tech Stack:** Turborepo (pnpm), TypeScript strict, Fastify 5, Prisma 6, Postgres on Railway, Vitest (real-DB integration tests), Zod for validation, `@anthropic-ai/sdk@^0.30.0` (already in deps).

---

## Pre-flight

- [ ] **Read Spec 2 + Wave 1 completion memory**

  Open and skim:
  - `docs/specs/2026-05-09-phase-c-spec-2-ai-chat-design.md` (sections 3, 4, 5, 11)
  - Memory: `v3_phase_c_wave_1_done.md`

- [ ] **Verify Wave 1 is green on local**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend
  set -a && source .env.local && set +a
  pnpm test:integration 2>&1 | tail -10
  ```

  Expected: 66 tests pass. (If anything fails, fix before Wave 2a — regression is a blocker.)

- [ ] **Verify ANTHROPIC_API_KEY is set in apps/backend/.env.local**

  ```bash
  grep "^ANTHROPIC_API_KEY=" /Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/.env.local
  ```

  Expected: returns one line. (If not set, **STOP** and ask founder to add it before any chat tests can run.)

---

## File Structure

**New files (16):**

| Path                                                                              | Responsibility                                                                                 |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/shared-schema/prisma/migrations/20260510_phase_c_wave_2a/migration.sql` | One migration — Assignment + ChatRequestLog + ChatThread + ChatMessage tables + trigger attach |
| `packages/shared-schema/src/zod/chat.ts`                                          | `CreateChatMessageInput`, `ApplyDecisionCardInput` Zod schemas                                 |
| `packages/shared-schema/src/zod/assignment.ts`                                    | `CreateAssignmentInput` Zod schema (per Spec 1 §9.1 with `oneOffDate` shorthand)               |
| `packages/state-machines/src/assignment.ts`                                       | Pure functions: `canTransition()`, `validateAssignmentInputs()`                                |
| `packages/state-machines/src/assignment.test.ts`                                  | Unit tests for state transitions                                                               |
| `packages/ai-tools/src/sonnet-tool-loop.ts`                                       | Anthropic SDK wrapper — runs tool-use loop, returns final response + DecisionCard data         |
| `packages/ai-tools/src/tools/assignment.ts`                                       | `propose_create_assignment` tool schema                                                        |
| `packages/ai-tools/src/tools/read.ts`                                             | `find_workers`, `find_sites` tool schemas                                                      |
| `apps/backend/src/lib/chat-idempotency.ts`                                        | ChatRequestLog read/write helpers                                                              |
| `apps/backend/src/lib/chat-concurrency.ts`                                        | Per-instance semaphore (default 50)                                                            |
| `apps/backend/src/routes/assignments.ts`                                          | `POST /assignments` direct create endpoint                                                     |
| `apps/backend/src/routes/chat.ts`                                                 | `POST /chat/messages`, `POST /chat/apply`                                                      |
| `apps/backend/scripts/hydrate-deferred-assignments.ts`                            | One-time hydrator script                                                                       |
| `apps/backend/test/assignment-create.test.ts`                                     | POST /assignments — 401, 400, happy path, AuditEvent                                           |
| `apps/backend/test/assignment-trigger.test.ts`                                    | Trigger blocks past-Assignment edits                                                           |
| `apps/backend/test/hydrator.test.ts`                                              | Seed deferred → run script → assert real rows                                                  |
| `apps/backend/test/chat-create-message.test.ts`                                   | POST /chat/messages — idempotency + 503 + happy path                                           |
| `apps/backend/test/chat-tool-loop.test.ts`                                        | End-to-end: voice → AI → DecisionCard → Apply → Assignment row                                 |
| `apps/backend/test/cross-tenant-chat.test.ts`                                     | Tenant isolation across all chat endpoints                                                     |

**Modified files (6):**

| Path                                                        | Change                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `packages/shared-schema/prisma/schema.prisma`               | Add Assignment, ChatRequestLog, ChatThread, ChatMessage models                        |
| `packages/shared-schema/src/index.ts`                       | Re-export new zod + types                                                             |
| `packages/state-machines/src/index.ts`                      | Re-export `./assignment.js`                                                           |
| `packages/ai-tools/src/index.ts`                            | Re-export `./sonnet-tool-loop.js`, `./tools/assignment.js`, `./tools/read.js`         |
| `apps/backend/src/server.ts`                                | Register `assignments.ts` + `chat.ts` route modules                                   |
| `apps/backend/src/routes/calendar.ts` (the promote handler) | Replace `pendingAssignmentPayload + synthId` with direct `prisma.assignment.create()` |
| `apps/backend/test/calendar-promote.test.ts`                | Update assertions: real Assignment row exists, no synth IDs                           |

---

## Task 1: Branch + migration scaffolding

**Files:** new branch + empty migration dir.

- [ ] **Step 1: Create the feature branch**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git checkout feat/phase-c-wave-1-calendar
  git pull origin feat/phase-c-wave-1-calendar
  git checkout -b feat/phase-c-wave-2a-vertical-slice
  ```

  Expected: now on branch `feat/phase-c-wave-2a-vertical-slice`.

- [ ] **Step 2: Create migration directory + empty file**

  ```bash
  mkdir -p packages/shared-schema/prisma/migrations/20260510_phase_c_wave_2a
  touch packages/shared-schema/prisma/migrations/20260510_phase_c_wave_2a/migration.sql
  ```

- [ ] **Step 3: Commit scaffold**

  ```bash
  git add packages/shared-schema/prisma/migrations/20260510_phase_c_wave_2a/
  git commit -m "chore(schema): scaffold Phase C Wave 2a migration directory"
  ```

---

## Task 2: Add Assignment, ChatRequestLog, ChatThread, ChatMessage to Prisma schema

**Files:**

- Modify: `packages/shared-schema/prisma/schema.prisma`

- [ ] **Step 1: Add Assignment model** (insert after existing `CalendarEntry` model)

  ```prisma
  model Assignment {
    id              String    @id @default(uuid()) @db.Uuid
    companyId       String    @db.Uuid
    workerId        String    @db.Uuid
    siteId          String    @db.Uuid
    /// "HH:mm" format
    shiftStart      String
    shiftEnd        String
    /// 7-char Mon-Sun mask: "MTWTFS_" = Mon-Sat, "_______" = none
    dayMask         String
    validFrom       DateTime  @db.Date
    /// null = open-ended (per Q1 lock)
    validUntil      DateTime? @db.Date
    /// 3 states: DRAFT | ACTIVE | TERMINATED (per Q2 lock)
    state           String    @default("DRAFT")
    terminatedReason String?
    /// FK Membership — supervisor who terminated
    terminatedBy    String?   @db.Uuid
    createdAt       DateTime  @default(now())
    updatedAt       DateTime  @updatedAt

    company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
    worker  Worker  @relation(fields: [workerId], references: [id], onDelete: Cascade)
    site    Site    @relation(fields: [siteId], references: [id], onDelete: Cascade)

    @@index([companyId, state])
    @@index([workerId, state])
    @@index([siteId, state])
    @@schema("axhy")
  }
  ```

  Then add the back-relations to existing models:
  - `Company` model: add `assignments Assignment[]`
  - `Worker` model: add `assignments Assignment[]`
  - `Site` model: add `assignments Assignment[]`

- [ ] **Step 2: Add ChatThread model**

  ```prisma
  model ChatThread {
    id            String    @id @default(uuid()) @db.Uuid
    companyId     String    @db.Uuid
    /// FK Membership.id (per-supervisor)
    supervisorId  String    @db.Uuid
    createdAt     DateTime  @default(now())
    lastMessageAt DateTime?
    archivedAt    DateTime?

    company  Company       @relation(fields: [companyId], references: [id], onDelete: Cascade)
    messages ChatMessage[]

    @@unique([companyId, supervisorId])
    @@schema("axhy")
  }
  ```

  Add back-relation on Company: `chatThreads ChatThread[]`.

- [ ] **Step 3: Add ChatMessage model**

  ```prisma
  model ChatMessage {
    id              String    @id @default(uuid()) @db.Uuid
    companyId       String    @db.Uuid
    threadId        String    @db.Uuid
    /// 'user' | 'assistant' | 'system'
    role            String
    /// @personal supervisor's voice transcript or typed text
    transcript      String?
    /// @personal AI's response text
    aiResponseText  String?
    /// JSON array of { toolName, toolCallId, input, output? }
    toolCalls       Json?
    /// DecisionCardData per Spec 1 §9.5
    decisionCard    Json?
    /// 'HIGH'|'MEDIUM'|'LOW' from Sarvam
    voiceConfidence String?
    /// 'claude-sonnet-4-6' etc — for cost reconstruction
    modelUsed       String?
    /// Computed cost in INR
    costInr         Decimal?
    /// Idempotency-Key from request
    idempotencyKey  String?
    createdAt       DateTime  @default(now())

    thread  ChatThread @relation(fields: [threadId], references: [id], onDelete: Cascade)
    company Company    @relation(fields: [companyId], references: [id], onDelete: Cascade)

    @@index([companyId, threadId, createdAt])
    @@schema("axhy")
  }
  ```

  Add back-relation on Company: `chatMessages ChatMessage[]`.

- [ ] **Step 4: Add ChatRequestLog model**

  ```prisma
  model ChatRequestLog {
    companyId       String    @db.Uuid
    /// Client-generated UUID; same key = same response
    idempotencyKey  String
    /// Cached final response shape (full JSON returned to client)
    responseJson    Json
    /// FK to message row created on first call
    chatMessageId   String?   @db.Uuid
    createdAt       DateTime  @default(now())
    /// createdAt + 24h
    expiresAt       DateTime

    @@id([companyId, idempotencyKey])
    @@index([expiresAt])
    @@schema("axhy")
  }
  ```

- [ ] **Step 5: Run prisma generate**

  ```bash
  cd packages/shared-schema
  pnpm exec prisma generate
  ```

  Expected: "Generated Prisma Client" success. New types `Assignment`, `ChatThread`, `ChatMessage`, `ChatRequestLog` available.

- [ ] **Step 6: Commit schema additions**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add packages/shared-schema/prisma/schema.prisma
  git commit -m "feat(schema): Assignment + ChatThread + ChatMessage + ChatRequestLog models (Wave 2a)"
  ```

---

## Task 3: Write the migration SQL + apply to Railway

**Files:** `packages/shared-schema/prisma/migrations/20260510_phase_c_wave_2a/migration.sql`

- [ ] **Step 1: Write the SQL**

  Open `migration.sql`. Write:

  ```sql
  -- Section 1: Assignment table
  CREATE TABLE "axhy"."Assignment" (
      "id" UUID NOT NULL,
      "companyId" UUID NOT NULL,
      "workerId" UUID NOT NULL,
      "siteId" UUID NOT NULL,
      "shiftStart" TEXT NOT NULL,
      "shiftEnd" TEXT NOT NULL,
      "dayMask" TEXT NOT NULL,
      "validFrom" DATE NOT NULL,
      "validUntil" DATE,
      "state" TEXT NOT NULL DEFAULT 'DRAFT',
      "terminatedReason" TEXT,
      "terminatedBy" UUID,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,

      CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
  );

  CREATE INDEX "Assignment_companyId_state_idx" ON "axhy"."Assignment"("companyId", "state");
  CREATE INDEX "Assignment_workerId_state_idx" ON "axhy"."Assignment"("workerId", "state");
  CREATE INDEX "Assignment_siteId_state_idx" ON "axhy"."Assignment"("siteId", "state");

  ALTER TABLE "axhy"."Assignment" ADD CONSTRAINT "Assignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  ALTER TABLE "axhy"."Assignment" ADD CONSTRAINT "Assignment_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "axhy"."Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  ALTER TABLE "axhy"."Assignment" ADD CONSTRAINT "Assignment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "axhy"."Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

  -- Section 2: Attach immutability trigger (function defined in Wave 1 migration)
  CREATE TRIGGER assignment_block_past_update
    BEFORE UPDATE ON "axhy"."Assignment"
    FOR EACH ROW
    EXECUTE FUNCTION "axhy"."block_past_assignment_update"();

  -- Section 3: ChatThread table
  CREATE TABLE "axhy"."ChatThread" (
      "id" UUID NOT NULL,
      "companyId" UUID NOT NULL,
      "supervisorId" UUID NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastMessageAt" TIMESTAMP(3),
      "archivedAt" TIMESTAMP(3),

      CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
  );

  CREATE UNIQUE INDEX "ChatThread_companyId_supervisorId_key" ON "axhy"."ChatThread"("companyId", "supervisorId");
  ALTER TABLE "axhy"."ChatThread" ADD CONSTRAINT "ChatThread_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

  -- Section 4: ChatMessage table
  CREATE TABLE "axhy"."ChatMessage" (
      "id" UUID NOT NULL,
      "companyId" UUID NOT NULL,
      "threadId" UUID NOT NULL,
      "role" TEXT NOT NULL,
      "transcript" TEXT,
      "aiResponseText" TEXT,
      "toolCalls" JSONB,
      "decisionCard" JSONB,
      "voiceConfidence" TEXT,
      "modelUsed" TEXT,
      "costInr" DECIMAL(12,4),
      "idempotencyKey" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
  );

  CREATE INDEX "ChatMessage_companyId_threadId_createdAt_idx" ON "axhy"."ChatMessage"("companyId", "threadId", "createdAt");
  ALTER TABLE "axhy"."ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "axhy"."ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  ALTER TABLE "axhy"."ChatMessage" ADD CONSTRAINT "ChatMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

  -- Section 5: ChatRequestLog table (idempotency dedup)
  CREATE TABLE "axhy"."ChatRequestLog" (
      "companyId" UUID NOT NULL,
      "idempotencyKey" TEXT NOT NULL,
      "responseJson" JSONB NOT NULL,
      "chatMessageId" UUID,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "expiresAt" TIMESTAMP(3) NOT NULL,

      CONSTRAINT "ChatRequestLog_pkey" PRIMARY KEY ("companyId", "idempotencyKey")
  );

  CREATE INDEX "ChatRequestLog_expiresAt_idx" ON "axhy"."ChatRequestLog"("expiresAt");
  ```

- [ ] **Step 2: Apply to Railway**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema
  export $(grep -v '^#' ../../apps/backend/.env.local | grep '^DATABASE_URL=' | xargs)
  pnpm exec prisma migrate deploy
  ```

  Expected: "Applying migration `20260510_phase_c_wave_2a`" + "All migrations have been successfully applied."

- [ ] **Step 3: Sanity-check tables exist**

  ```bash
  pnpm exec prisma db execute --schema=./prisma/schema.prisma --stdin <<< 'SELECT count(*) FROM axhy."Assignment";'
  pnpm exec prisma db execute --schema=./prisma/schema.prisma --stdin <<< 'SELECT count(*) FROM axhy."ChatThread";'
  pnpm exec prisma db execute --schema=./prisma/schema.prisma --stdin <<< 'SELECT count(*) FROM axhy."ChatMessage";'
  pnpm exec prisma db execute --schema=./prisma/schema.prisma --stdin <<< 'SELECT count(*) FROM axhy."ChatRequestLog";'
  ```

  Expected: each returns `count: 0` (or some seeded value), no error.

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add packages/shared-schema/prisma/migrations/20260510_phase_c_wave_2a/migration.sql
  git commit -m "feat(schema): Wave 2a migration applied — Assignment + ChatThread + ChatMessage + ChatRequestLog tables on Railway"
  ```

---

## Task 4: Zod schemas for chat + assignment inputs

**Files:**

- Create: `packages/shared-schema/src/zod/chat.ts`
- Create: `packages/shared-schema/src/zod/assignment.ts`
- Modify: `packages/shared-schema/src/index.ts`

- [ ] **Step 1: Write `packages/shared-schema/src/zod/assignment.ts`**

  ```ts
  /**
   * @derives(master-plan §G)
   */

  import { z } from 'zod';

  /**
   * Recurring Assignment input. dayMask is 7-char Mon-Sun.
   * For single-day "send Suresh today only" use the oneOffDate variant below.
   */
  export const CreateAssignmentRecurringInput = z
    .object({
      workerId: z.string().uuid(),
      siteId: z.string().uuid(),
      dayMask: z.string().regex(/^[MTWTFS_]{7}$/),
      shiftStart: z.string().regex(/^\d{2}:\d{2}$/),
      shiftEnd: z.string().regex(/^\d{2}:\d{2}$/),
      validFrom: z.string(),
      validUntil: z.string().nullable().optional(),
    })
    .strict();

  /** Single-day shorthand. Backend auto-fills validFrom = validUntil = oneOffDate, dayMask = day-of-week of oneOffDate. */
  export const CreateAssignmentOneOffInput = z
    .object({
      workerId: z.string().uuid(),
      siteId: z.string().uuid(),
      oneOffDate: z.string(),
      shiftStart: z.string().regex(/^\d{2}:\d{2}$/),
      shiftEnd: z.string().regex(/^\d{2}:\d{2}$/),
    })
    .strict();

  /** Discriminated by presence of `oneOffDate`. */
  export const CreateAssignmentInput = z.union([
    CreateAssignmentRecurringInput,
    CreateAssignmentOneOffInput,
  ]);
  export type CreateAssignmentInputT = z.infer<typeof CreateAssignmentInput>;
  ```

- [ ] **Step 2: Write `packages/shared-schema/src/zod/chat.ts`**

  ```ts
  /**
   * @derives(master-plan §G)
   */

  import { z } from 'zod';

  export const CreateChatMessageInput = z
    .object({
      /** Supervisor's transcript or typed text */
      text: z.string().min(1).max(2000),
      /** STT confidence if voice; null for typed */
      voiceConfidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
    })
    .strict();
  export type CreateChatMessageInputT = z.infer<typeof CreateChatMessageInput>;

  export const ApplyDecisionCardInput = z
    .object({
      /** ChatMessage.id whose DecisionCard should be applied */
      chatMessageId: z.string().uuid(),
      /** Tool name from the proposed action (must match what AI emitted) */
      toolName: z.string(),
      /** Tool input args (must match what AI emitted, copied from DecisionCard) */
      toolInput: z.record(z.unknown()),
    })
    .strict();
  export type ApplyDecisionCardInputT = z.infer<typeof ApplyDecisionCardInput>;
  ```

- [ ] **Step 3: Re-export from `packages/shared-schema/src/index.ts`**

  Append:

  ```ts
  export * from './zod/assignment.js';
  export * from './zod/chat.js';
  ```

- [ ] **Step 4: Build the package**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema
  pnpm build
  ```

  Expected: tsc clean.

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add packages/shared-schema/src/zod/assignment.ts packages/shared-schema/src/zod/chat.ts packages/shared-schema/src/index.ts
  git commit -m "feat(shared-schema): Zod schemas for Assignment + chat inputs"
  ```

---

## Task 5: Assignment state-machine helpers

**Files:**

- Create: `packages/state-machines/src/assignment.test.ts`
- Create: `packages/state-machines/src/assignment.ts`
- Modify: `packages/state-machines/src/index.ts`

- [ ] **Step 1: Write the failing test**

  Create `packages/state-machines/src/assignment.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest';
  import { canTransition, dayMaskFromDate, expandOneOffToRecurring } from './assignment.js';

  describe('canTransition', () => {
    it('DRAFT → ACTIVE allowed', () => {
      expect(canTransition('DRAFT', 'ACTIVE')).toBe(true);
    });
    it('DRAFT → TERMINATED allowed', () => {
      expect(canTransition('DRAFT', 'TERMINATED')).toBe(true);
    });
    it('ACTIVE → TERMINATED allowed', () => {
      expect(canTransition('ACTIVE', 'TERMINATED')).toBe(true);
    });
    it('TERMINATED → ACTIVE blocked (terminal state)', () => {
      expect(canTransition('TERMINATED', 'ACTIVE')).toBe(false);
    });
    it('TERMINATED → DRAFT blocked (terminal state)', () => {
      expect(canTransition('TERMINATED', 'DRAFT')).toBe(false);
    });
    it('ACTIVE → DRAFT blocked (no going back)', () => {
      expect(canTransition('ACTIVE', 'DRAFT')).toBe(false);
    });
  });

  describe('dayMaskFromDate', () => {
    it('Tuesday 2026-05-12 → "_T_____"', () => {
      const result = dayMaskFromDate(new Date('2026-05-12T00:00:00Z'));
      expect(result).toBe('_T_____');
    });
    it('Sunday 2026-05-17 → "______S"', () => {
      const result = dayMaskFromDate(new Date('2026-05-17T00:00:00Z'));
      expect(result).toBe('______S');
    });
  });

  describe('expandOneOffToRecurring', () => {
    it('expands oneOffDate to validFrom=validUntil + day-of-week dayMask', () => {
      const result = expandOneOffToRecurring({
        workerId: 'w1',
        siteId: 's1',
        oneOffDate: '2026-05-12',
        shiftStart: '09:00',
        shiftEnd: '17:00',
      });
      expect(result.validFrom).toBe('2026-05-12');
      expect(result.validUntil).toBe('2026-05-12');
      expect(result.dayMask).toBe('_T_____');
    });
  });
  ```

- [ ] **Step 2: Run test to confirm fail**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3/packages/state-machines
  pnpm test assignment.test.ts
  ```

  Expected: tests FAIL with "Cannot find module './assignment.js'".

- [ ] **Step 3: Implement `packages/state-machines/src/assignment.ts`**

  ```ts
  /**
   * Assignment state-machine helpers (3 states: DRAFT, ACTIVE, TERMINATED).
   *
   * @derives(master-plan §G)
   */

  export type AssignmentState = 'DRAFT' | 'ACTIVE' | 'TERMINATED';

  /**
   * Allowed transitions.
   * DRAFT can go to ACTIVE (confirmed) or TERMINATED (cancelled before activation).
   * ACTIVE can only go to TERMINATED.
   * TERMINATED is terminal.
   */
  export function canTransition(from: AssignmentState, to: AssignmentState): boolean {
    if (from === 'DRAFT' && to === 'ACTIVE') return true;
    if (from === 'DRAFT' && to === 'TERMINATED') return true;
    if (from === 'ACTIVE' && to === 'TERMINATED') return true;
    return false;
  }

  /**
   * 7-char dayMask Mon-Sun.
   * Index 0 = Monday, index 6 = Sunday.
   * Single-day mask = letter at the date's day-of-week index, '_' elsewhere.
   */
  export function dayMaskFromDate(date: Date): string {
    const dayOfWeek = date.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const mondayIdx = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    return labels.map((ch, i) => (i === mondayIdx ? ch : '_')).join('');
  }

  type OneOffInput = {
    workerId: string;
    siteId: string;
    oneOffDate: string; // ISO YYYY-MM-DD
    shiftStart: string;
    shiftEnd: string;
  };

  type RecurringShape = {
    workerId: string;
    siteId: string;
    dayMask: string;
    shiftStart: string;
    shiftEnd: string;
    validFrom: string;
    validUntil: string;
  };

  /**
   * Convert a single-day "send Suresh today only" input into the canonical
   * recurring shape with validFrom = validUntil = oneOffDate.
   */
  export function expandOneOffToRecurring(input: OneOffInput): RecurringShape {
    const date = new Date(input.oneOffDate + 'T00:00:00Z');
    return {
      workerId: input.workerId,
      siteId: input.siteId,
      dayMask: dayMaskFromDate(date),
      shiftStart: input.shiftStart,
      shiftEnd: input.shiftEnd,
      validFrom: input.oneOffDate,
      validUntil: input.oneOffDate,
    };
  }
  ```

- [ ] **Step 4: Re-export from index**

  Append to `packages/state-machines/src/index.ts`:

  ```ts
  export * from './assignment.js';
  ```

- [ ] **Step 5: Run tests to verify pass**

  ```bash
  pnpm test assignment.test.ts
  ```

  Expected: 9/9 pass.

- [ ] **Step 6: Build + commit**

  ```bash
  pnpm build
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add packages/state-machines/src/assignment.ts packages/state-machines/src/assignment.test.ts packages/state-machines/src/index.ts
  git commit -m "feat(state-machines): Assignment 3-state transitions + dayMask helpers (9 unit tests)"
  ```

---

## Task 6: AI tool schemas (find_workers, find_sites, propose_create_assignment)

**Files:**

- Create: `packages/ai-tools/src/tools/read.ts`
- Create: `packages/ai-tools/src/tools/assignment.ts`
- Modify: `packages/ai-tools/src/index.ts`

- [ ] **Step 1: Write `packages/ai-tools/src/tools/read.ts`**

  ```ts
  /**
   * Read tool definitions — find_workers, find_sites.
   * AI uses these to resolve names → IDs before proposing actions.
   *
   * @derives(master-plan §G)
   */

  export const findWorkersTool = {
    name: 'find_workers',
    description:
      'Look up workers by name, alias, or phone-last-4. Returns exact matches + ambiguous candidates with disambiguation context (phone_last4, recentSite, recentAction, tenureDays). Use BEFORE proposing any worker-related action when the supervisor said a name.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Worker name, alias, or phone-last-4' },
        supervisorScope: {
          type: 'boolean',
          description: "true = only workers in this supervisor's sites; false = company-wide",
        },
      },
      required: ['query', 'supervisorScope'],
    },
  } as const;

  export const findSitesTool = {
    name: 'find_sites',
    description:
      'Look up sites by name or alias. Returns exact + ambiguous matches with context (alias, address_brief, activeAssignments count, client_name). Use BEFORE proposing any site-related action when supervisor said a site name.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Site name or alias' },
        supervisorScope: { type: 'boolean', description: "true = only this supervisor's sites" },
      },
      required: ['query', 'supervisorScope'],
    },
  } as const;
  ```

- [ ] **Step 2: Write `packages/ai-tools/src/tools/assignment.ts`**

  ```ts
  /**
   * propose_create_assignment tool.
   *
   * @derives(master-plan §G)
   */

  export const proposeCreateAssignmentTool = {
    name: 'propose_create_assignment',
    description:
      'Propose creating an Assignment (recurring worker × site × shift pattern). Returns DecisionCard that supervisor must confirm via separate Apply call. Use after find_workers/find_sites resolved the IDs. Two shapes: recurring (provide dayMask + validFrom/validUntil) or one-off (provide oneOffDate for single-day; backend auto-fills the rest).',
    input_schema: {
      type: 'object' as const,
      properties: {
        workerId: { type: 'string', description: 'Worker UUID from find_workers' },
        siteId: { type: 'string', description: 'Site UUID from find_sites' },
        shiftStart: { type: 'string', description: 'HH:mm 24h format, e.g., "09:00"' },
        shiftEnd: { type: 'string', description: 'HH:mm 24h format, e.g., "17:00"' },
        // Recurring case
        dayMask: {
          type: 'string',
          description: '7-char Mon-Sun mask, e.g., "MTWTFS_" for Mon-Sat. Required for recurring.',
        },
        validFrom: { type: 'string', description: 'ISO date YYYY-MM-DD. When the pattern starts.' },
        validUntil: {
          type: ['string', 'null'],
          description: 'ISO date or null. null = open-ended.',
        },
        // One-off case (mutually exclusive with dayMask/validFrom)
        oneOffDate: {
          type: 'string',
          description:
            'ISO date for single-day. Backend computes dayMask + validFrom=validUntil from this. Provide INSTEAD OF dayMask/validFrom/validUntil.',
        },
      },
      required: ['workerId', 'siteId', 'shiftStart', 'shiftEnd'],
    },
  } as const;
  ```

- [ ] **Step 3: Re-export from `packages/ai-tools/src/index.ts`**

  Append:

  ```ts
  export * from './tools/read.js';
  export * from './tools/assignment.js';
  ```

- [ ] **Step 4: Build + commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3/packages/ai-tools
  pnpm build
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add packages/ai-tools/src/tools/read.ts packages/ai-tools/src/tools/assignment.ts packages/ai-tools/src/index.ts
  git commit -m "feat(ai-tools): find_workers + find_sites + propose_create_assignment tool schemas"
  ```

---

## Task 7: Anthropic adapter — sonnet-tool-loop.ts

**Files:**

- Create: `packages/ai-tools/src/sonnet-tool-loop.ts`
- Modify: `packages/ai-tools/src/index.ts`

- [ ] **Step 1: Implement the tool-use loop**

  Create `packages/ai-tools/src/sonnet-tool-loop.ts`:

  ```ts
  /**
   * Anthropic Sonnet 4.6 tool-use loop wrapper.
   *
   * Takes a user message + tools + a tool-execution callback.
   * Runs the loop: assistant → tool_use → callback → tool_result → assistant ...
   * Returns the final assistant message + any DecisionCard data extracted from
   * propose_* tool calls (these don't commit; they return data for client confirm).
   *
   * @derives(ADR-0023 — voice_change_parse surface uses claude-sonnet-4-6)
   * @derives(master-plan §G — AI proposes, supervisor confirms via tap)
   */

  import Anthropic from '@anthropic-ai/sdk';
  import type { MessageParam, Tool, ContentBlock } from '@anthropic-ai/sdk/resources/messages.mjs';

  export type ToolHandler = (
    name: string,
    input: Record<string, unknown>,
  ) => Promise<{
    /** Result fed back to the model. JSON-stringifiable. */
    output: unknown;
    /** If this is a propose_* tool, the DecisionCard data to surface to client. */
    decisionCardData?: Record<string, unknown>;
  }>;

  export type SonnetToolLoopArgs = {
    apiKey: string;
    systemPrompt: string;
    userMessage: string;
    tools: Tool[];
    handler: ToolHandler;
    /** Hard cap to prevent runaway loops. */
    maxIterations?: number;
    /** Total time budget in ms. */
    timeoutMs?: number;
  };

  export type SonnetToolLoopResult = {
    finalText: string;
    toolCalls: Array<{
      toolName: string;
      toolCallId: string;
      input: Record<string, unknown>;
      output?: unknown;
    }>;
    decisionCards: Array<Record<string, unknown>>;
    /** ms total elapsed */
    elapsedMs: number;
    /** Anthropic usage from final response (last call) */
    usage: { inputTokens: number; outputTokens: number };
  };

  const MODEL = 'claude-sonnet-4-6';

  export async function sonnetToolLoop(args: SonnetToolLoopArgs): Promise<SonnetToolLoopResult> {
    const { apiKey, systemPrompt, userMessage, tools, handler } = args;
    const maxIterations = args.maxIterations ?? 10;
    const timeoutMs = args.timeoutMs ?? 9000;
    const startedAt = Date.now();

    const anthropic = new Anthropic({ apiKey });

    const messages: MessageParam[] = [{ role: 'user', content: userMessage }];
    const toolCalls: SonnetToolLoopResult['toolCalls'] = [];
    const decisionCards: SonnetToolLoopResult['decisionCards'] = [];
    let finalUsage = { inputTokens: 0, outputTokens: 0 };
    let finalText = '';

    for (let iter = 0; iter < maxIterations; iter++) {
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error('AI_TOOL_LOOP_TIMEOUT');
      }

      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1500,
        system: systemPrompt,
        tools,
        messages,
      });

      finalUsage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };

      const toolUseBlocks = response.content.filter(
        (b: ContentBlock): b is Extract<ContentBlock, { type: 'tool_use' }> =>
          b.type === 'tool_use',
      );
      const textBlocks = response.content.filter(
        (b: ContentBlock): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text',
      );

      // Append assistant message with all blocks for tool-result correlation
      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
        // No more tool calls — done
        finalText = textBlocks.map((b) => b.text).join('\n');
        break;
      }

      // Execute each tool, append tool_result blocks for next iteration
      const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];
      for (const block of toolUseBlocks) {
        const result = await handler(block.name, block.input as Record<string, unknown>);
        toolCalls.push({
          toolName: block.name,
          toolCallId: block.id,
          input: block.input as Record<string, unknown>,
          output: result.output,
        });
        if (result.decisionCardData) {
          decisionCards.push({
            toolName: block.name,
            toolCallId: block.id,
            ...result.decisionCardData,
          });
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result.output),
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    return {
      finalText,
      toolCalls,
      decisionCards,
      elapsedMs: Date.now() - startedAt,
      usage: finalUsage,
    };
  }
  ```

- [ ] **Step 2: Re-export from index**

  Append to `packages/ai-tools/src/index.ts`:

  ```ts
  export * from './sonnet-tool-loop.js';
  ```

- [ ] **Step 3: Build**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3/packages/ai-tools
  pnpm build
  ```

  If TypeScript complains about `@anthropic-ai/sdk` types, ensure `"@anthropic-ai/sdk"` is in `dependencies` (already is — `^0.30.0`).

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add packages/ai-tools/src/sonnet-tool-loop.ts packages/ai-tools/src/index.ts
  git commit -m "feat(ai-tools): sonnet-tool-loop adapter — Anthropic SDK tool-use orchestration"
  ```

---

## Task 8: POST /assignments route — TDD

**Files:**

- Create: `apps/backend/src/routes/assignments.ts`
- Create: `apps/backend/test/assignment-create.test.ts`
- Modify: `apps/backend/src/server.ts`

- [ ] **Step 1: Write the failing test**

  Create `apps/backend/test/assignment-create.test.ts`:

  ```ts
  /**
   * @derives(master-plan §G)
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
  const TEST_PREFIX = `assn-create-${Date.now()}-`;

  let app: FastifyInstance;
  let companyId: string;
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
        ownerPhone: '+919900000060',
        ownerName: 'O',
      },
    });
    companyId = co.id;
    const sup = await prismaRaw.user.create({
      data: { phone: `+9199${String(Date.now()).slice(-8)}`, name: 'S', locale: 'en' },
    });
    await prismaRaw.membership.create({
      data: { companyId, userId: sup.id, role: 'SUPERVISOR', status: 'ACTIVE' },
    });
    const w = await prismaRaw.worker.create({
      data: {
        companyId,
        name: 'Pradeep',
        state: 'ACTIVE',
        phone: `+9199${String(Date.now() + 1).slice(-8)}`,
      },
    });
    workerId = w.id;
    const s = await prismaRaw.site.create({ data: { companyId, name: 'Apollo' } });
    siteId = s.id;

    accessToken = await issueAccessToken({
      userId: sup.id,
      companyId,
      role: 'SUPERVISOR',
      availableRoles: ['SUPERVISOR'],
      locale: 'en',
    });
  });

  afterAll(async () => {
    await prismaRaw.assignment.deleteMany({ where: { companyId } });
    await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
    await prismaRaw.worker.deleteMany({ where: { companyId } });
    await prismaRaw.site.deleteMany({ where: { companyId } });
    await prismaRaw.membership.deleteMany({ where: { companyId } });
    await prismaRaw.company.delete({ where: { id: companyId } });
    await prismaRaw.$disconnect();
    await app.close();
  });

  describe('POST /assignments', () => {
    it('401 without auth', async () => {
      const r = await app.inject({
        method: 'POST',
        url: '/assignments',
        payload: {
          workerId,
          siteId,
          dayMask: 'MTWTFS_',
          shiftStart: '09:00',
          shiftEnd: '17:00',
          validFrom: '2026-05-12',
        },
      });
      expect(r.statusCode).toBe(401);
    });

    it('400 on bad dayMask', async () => {
      const r = await app.inject({
        method: 'POST',
        url: '/assignments',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          workerId,
          siteId,
          dayMask: 'invalid',
          shiftStart: '09:00',
          shiftEnd: '17:00',
          validFrom: '2026-05-12',
        },
      });
      expect(r.statusCode).toBe(400);
    });

    it('happy path: recurring assignment', async () => {
      const r = await app.inject({
        method: 'POST',
        url: '/assignments',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          workerId,
          siteId,
          dayMask: 'MTWTFS_',
          shiftStart: '09:00',
          shiftEnd: '17:00',
          validFrom: '2026-05-12',
        },
      });
      expect(r.statusCode).toBe(200);
      const body = r.json();
      expect(body.id).toBeTruthy();
      expect(body.state).toBe('DRAFT');

      const audit = await prismaRaw.auditEvent.findFirst({
        where: { companyId, kind: 'ASSIGNMENT_CREATED', targetId: body.id },
      });
      expect(audit).toBeTruthy();
    });

    it('happy path: oneOffDate shorthand', async () => {
      const r = await app.inject({
        method: 'POST',
        url: '/assignments',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          workerId,
          siteId,
          oneOffDate: '2026-05-12',
          shiftStart: '09:00',
          shiftEnd: '17:00',
        },
      });
      expect(r.statusCode).toBe(200);
      const body = r.json();
      expect(body.dayMask).toBe('_T_____'); // Tuesday
      expect(body.validFrom).toBe('2026-05-12');
      expect(body.validUntil).toBe('2026-05-12');
    });
  });
  ```

- [ ] **Step 2: Implement `apps/backend/src/routes/assignments.ts`**

  ```ts
  /**
   * @derives(master-plan §G)
   */

  import type { FastifyInstance } from 'fastify';
  import { CreateAssignmentInput } from '@axhy/shared-schema';
  import { expandOneOffToRecurring } from '@axhy/state-machines';

  import { prisma } from '../lib/prisma.js';
  import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
  import { recordAuditEvent } from '../lib/audit-event.js';

  export async function registerAssignmentRoutes(app: FastifyInstance): Promise<void> {
    app.post('/assignments', { preHandler: requireAuth }, async (req, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED' });
        return;
      }

      const parsed = CreateAssignmentInput.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }

      // Normalize: oneOffDate variant → recurring shape
      let normalized;
      if ('oneOffDate' in parsed.data) {
        normalized = expandOneOffToRecurring(parsed.data);
      } else {
        normalized = {
          workerId: parsed.data.workerId,
          siteId: parsed.data.siteId,
          dayMask: parsed.data.dayMask,
          shiftStart: parsed.data.shiftStart,
          shiftEnd: parsed.data.shiftEnd,
          validFrom: parsed.data.validFrom,
          validUntil: parsed.data.validUntil ?? null,
        };
      }

      const out = await withTenantContext(prisma, auth.companyId, async (tx) => {
        // Verify FKs are in this tenant
        const worker = await tx.worker.findFirst({
          where: { id: normalized.workerId, companyId: auth.companyId },
        });
        if (!worker) return { kind: 'WORKER_NOT_FOUND' as const };
        const site = await tx.site.findFirst({
          where: { id: normalized.siteId, companyId: auth.companyId },
        });
        if (!site) return { kind: 'SITE_NOT_FOUND' as const };

        const assignment = await tx.assignment.create({
          data: {
            companyId: auth.companyId,
            workerId: normalized.workerId,
            siteId: normalized.siteId,
            shiftStart: normalized.shiftStart,
            shiftEnd: normalized.shiftEnd,
            dayMask: normalized.dayMask,
            validFrom: new Date(normalized.validFrom),
            validUntil: normalized.validUntil ? new Date(normalized.validUntil) : null,
            state: 'DRAFT',
          },
        });

        await recordAuditEvent(tx, {
          companyId: auth.companyId,
          kind: 'ASSIGNMENT_CREATED',
          actorId: auth.userId,
          targetId: assignment.id,
          payload: {
            workerId: normalized.workerId,
            workerName: worker.name,
            siteId: normalized.siteId,
            siteName: site.name,
            dayMask: normalized.dayMask,
          },
        });

        return { kind: 'OK' as const, assignment };
      });

      if (out.kind === 'WORKER_NOT_FOUND') {
        reply.code(404).send({ error: 'WORKER_NOT_FOUND' });
        return;
      }
      if (out.kind === 'SITE_NOT_FOUND') {
        reply.code(404).send({ error: 'SITE_NOT_FOUND' });
        return;
      }
      reply.code(200).send({
        id: out.assignment.id,
        state: out.assignment.state,
        dayMask: out.assignment.dayMask,
        validFrom: out.assignment.validFrom.toISOString().slice(0, 10),
        validUntil: out.assignment.validUntil?.toISOString().slice(0, 10) ?? null,
      });
    });
  }
  ```

- [ ] **Step 3: Wire into `apps/backend/src/server.ts`**

  Add import alongside other route imports:

  ```ts
  import { registerAssignmentRoutes } from './routes/assignments.js';
  ```

  Add registration call alongside others:

  ```ts
  await registerAssignmentRoutes(app);
  ```

- [ ] **Step 4: Run tests + verify pass**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend
  pnpm test:integration test/assignment-create.test.ts 2>&1 | tail -10
  ```

  Expected: 4/4 pass.

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/backend/src/routes/assignments.ts apps/backend/src/server.ts apps/backend/test/assignment-create.test.ts
  git commit -m "feat(backend): POST /assignments — direct create with recurring + oneOffDate shapes"
  ```

---

## Task 9: Trigger blocks past-Assignment edits

**Files:** `apps/backend/test/assignment-trigger.test.ts`

- [ ] **Step 1: Write test**

  ```ts
  /**
   * @derives(master-plan §G)
   */

  import { describe, it, expect, beforeAll, afterAll } from 'vitest';
  import { PrismaClient } from '@prisma/client';

  const dbUrl =
    process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
  process.env.DATABASE_URL = dbUrl;
  const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const TEST_PREFIX = `assn-trig-${Date.now()}-`;

  let companyId: string;
  let workerId: string;
  let siteId: string;
  let pastAssignmentId: string;

  beforeAll(async () => {
    const co = await prismaRaw.company.create({
      data: {
        name: TEST_PREFIX + 'Co',
        slug: TEST_PREFIX + 'co',
        ownerPhone: '+919900000061',
        ownerName: 'O',
      },
    });
    companyId = co.id;
    const w = await prismaRaw.worker.create({
      data: {
        companyId,
        name: 'X',
        state: 'ACTIVE',
        phone: `+9199${String(Date.now()).slice(-8)}`,
      },
    });
    workerId = w.id;
    const s = await prismaRaw.site.create({ data: { companyId, name: 'X' } });
    siteId = s.id;

    // Seed past assignment (validUntil yesterday, state=ACTIVE)
    const a = await prismaRaw.assignment.create({
      data: {
        companyId,
        workerId,
        siteId,
        shiftStart: '09:00',
        shiftEnd: '17:00',
        dayMask: 'MTWTFS_',
        validFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        validUntil: new Date(Date.now() - 24 * 60 * 60 * 1000), // yesterday
        state: 'ACTIVE',
      },
    });
    pastAssignmentId = a.id;
  });

  afterAll(async () => {
    await prismaRaw.assignment.deleteMany({ where: { companyId } });
    await prismaRaw.worker.deleteMany({ where: { companyId } });
    await prismaRaw.site.deleteMany({ where: { companyId } });
    await prismaRaw.company.delete({ where: { id: companyId } });
    await prismaRaw.$disconnect();
  });

  describe('block_past_assignment_update trigger', () => {
    it('UPDATE on past Assignment with state=ACTIVE is blocked', async () => {
      await expect(
        prismaRaw.assignment.update({
          where: { id: pastAssignmentId },
          data: { dayMask: 'M______' },
        }),
      ).rejects.toThrow();
    });

    it('UPDATE to TERMINATE state is allowed (cleanup path)', async () => {
      const updated = await prismaRaw.assignment.update({
        where: { id: pastAssignmentId },
        data: { state: 'TERMINATED' },
      });
      expect(updated.state).toBe('TERMINATED');
    });
  });
  ```

- [ ] **Step 2: Run + verify**

  ```bash
  pnpm test:integration test/assignment-trigger.test.ts
  ```

  Expected: 2/2 pass. (Trigger function defined in Wave 1; attached in Wave 2a Task 3.)

- [ ] **Step 3: Commit**

  ```bash
  git add apps/backend/test/assignment-trigger.test.ts
  git commit -m "test(backend): block_past_assignment_update trigger blocks past edits"
  ```

---

## Task 10: Hydrator script + test

**Files:**

- Create: `apps/backend/scripts/hydrate-deferred-assignments.ts`
- Create: `apps/backend/test/hydrator.test.ts`

- [ ] **Step 1: Write hydrator script**

  Create `apps/backend/scripts/hydrate-deferred-assignments.ts`:

  ```ts
  /**
   * Run-once hydrator — converts Wave 1's deferred Assignment payloads
   * stored in CalendarEntry.pendingAssignmentPayload into real Assignment rows.
   * After this runs, Wave 1's synth-id pattern is gone.
   *
   * @derives(master-plan §G)
   */

  import { PrismaClient } from '@prisma/client';

  async function main() {
    const dbUrl = process.env.DATABASE_URL ?? process.env.AXHY_DB_URL;
    if (!dbUrl) throw new Error('DATABASE_URL required');
    const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

    const pending = await prisma.calendarEntry.findMany({
      where: {
        promotedToKind: 'ASSIGNMENT',
        pendingAssignmentPayload: { not: null as never },
      },
    });

    console.log(`[hydrator] found ${pending.length} deferred Assignment payloads`);

    let hydrated = 0;
    for (const entry of pending) {
      const payload = entry.pendingAssignmentPayload as {
        workerId: string;
        siteId: string;
        shiftStart: string;
        shiftEnd: string;
        dayMask: string;
        validFrom: string | Date;
        validUntil: string | Date | null;
      };

      const assignment = await prisma.assignment.create({
        data: {
          companyId: entry.companyId,
          workerId: payload.workerId,
          siteId: payload.siteId,
          shiftStart: payload.shiftStart,
          shiftEnd: payload.shiftEnd,
          dayMask: payload.dayMask,
          validFrom: new Date(payload.validFrom),
          validUntil: payload.validUntil ? new Date(payload.validUntil) : null,
          state: 'ACTIVE', // hydrated entries were already promoted = active
        },
      });

      await prisma.calendarEntry.update({
        where: { id: entry.id },
        data: { promotedToId: assignment.id, pendingAssignmentPayload: null },
      });

      await prisma.auditEvent.create({
        data: {
          companyId: entry.companyId,
          kind: 'ASSIGNMENT_HYDRATED_FROM_CALENDAR',
          actorId: entry.supervisorId,
          targetId: assignment.id,
          payload: {
            sourceEntryId: entry.id,
            originalSynthId: entry.promotedToId,
          },
        },
      });

      hydrated++;
    }

    console.log(`[hydrator] hydrated ${hydrated} entries`);
    await prisma.$disconnect();
  }

  main().catch((err) => {
    console.error('[hydrator] failed:', err);
    process.exit(1);
  });
  ```

- [ ] **Step 2: Write test**

  Create `apps/backend/test/hydrator.test.ts`:

  ```ts
  /**
   * @derives(master-plan §G)
   */

  import { describe, it, expect, beforeAll, afterAll } from 'vitest';
  import { PrismaClient } from '@prisma/client';
  import { spawn } from 'node:child_process';

  const dbUrl =
    process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
  process.env.DATABASE_URL = dbUrl;
  const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const TEST_PREFIX = `hydrator-${Date.now()}-`;

  let companyId: string;
  let entryId: string;

  beforeAll(async () => {
    const co = await prismaRaw.company.create({
      data: {
        name: TEST_PREFIX + 'Co',
        slug: TEST_PREFIX + 'co',
        ownerPhone: '+919900000062',
        ownerName: 'O',
      },
    });
    companyId = co.id;
    const sup = await prismaRaw.user.create({
      data: { phone: `+9199${String(Date.now()).slice(-8)}`, name: 'S', locale: 'en' },
    });
    await prismaRaw.membership.create({
      data: { companyId, userId: sup.id, role: 'SUPERVISOR', status: 'ACTIVE' },
    });
    const w = await prismaRaw.worker.create({
      data: {
        companyId,
        name: 'P',
        state: 'ACTIVE',
        phone: `+9199${String(Date.now() + 1).slice(-8)}`,
      },
    });
    const s = await prismaRaw.site.create({ data: { companyId, name: 'A' } });

    // Seed a deferred CalendarEntry as if Wave 1 had promoted it
    const synthId = '00000000-0000-4000-8000-000000000000';
    const e = await prismaRaw.calendarEntry.create({
      data: {
        companyId,
        supervisorId: sup.id,
        date: new Date('2026-05-12'),
        kind: 'TENTATIVE_ASSIGNMENT',
        payload: { workerId: w.id, siteId: s.id, shiftStart: '09:00', shiftEnd: '17:00' },
        editableUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        promotedToKind: 'ASSIGNMENT',
        promotedToId: synthId,
        promotedAt: new Date(),
        pendingAssignmentPayload: {
          workerId: w.id,
          siteId: s.id,
          shiftStart: '09:00',
          shiftEnd: '17:00',
          dayMask: '_T_____',
          validFrom: '2026-05-12',
          validUntil: '2026-05-12',
        },
      },
    });
    entryId = e.id;
  });

  afterAll(async () => {
    await prismaRaw.assignment.deleteMany({ where: { companyId } });
    await prismaRaw.calendarEntry.deleteMany({ where: { companyId } });
    await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
    await prismaRaw.worker.deleteMany({ where: { companyId } });
    await prismaRaw.site.deleteMany({ where: { companyId } });
    await prismaRaw.membership.deleteMany({ where: { companyId } });
    await prismaRaw.company.delete({ where: { id: companyId } });
    await prismaRaw.$disconnect();
  });

  describe('hydrate-deferred-assignments', () => {
    it('converts deferred payload → real Assignment row + nulls payload + updates promotedToId', async () => {
      // Run hydrator script
      await new Promise<void>((resolve, reject) => {
        const proc = spawn('pnpm', ['exec', 'tsx', 'scripts/hydrate-deferred-assignments.ts'], {
          stdio: 'inherit',
          env: { ...process.env, DATABASE_URL: dbUrl },
        });
        proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
      });

      // Verify
      const updated = await prismaRaw.calendarEntry.findUnique({ where: { id: entryId } });
      expect(updated?.pendingAssignmentPayload).toBeNull();
      expect(updated?.promotedToId).toBeTruthy();
      expect(updated?.promotedToId).not.toBe('00000000-0000-4000-8000-000000000000');

      const assignment = await prismaRaw.assignment.findUnique({
        where: { id: updated!.promotedToId! },
      });
      expect(assignment).toBeTruthy();
      expect(assignment?.state).toBe('ACTIVE');

      const audit = await prismaRaw.auditEvent.findFirst({
        where: { companyId, kind: 'ASSIGNMENT_HYDRATED_FROM_CALENDAR' },
      });
      expect(audit).toBeTruthy();
    });
  });
  ```

- [ ] **Step 3: Run + verify**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend
  pnpm test:integration test/hydrator.test.ts 2>&1 | tail -10
  ```

  Expected: 1/1 pass.

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/backend/scripts/hydrate-deferred-assignments.ts apps/backend/test/hydrator.test.ts
  git commit -m "feat(backend): hydrate-deferred-assignments script + test"
  ```

---

## Task 11: Update calendar promote route to write real Assignment

**Files:**

- Modify: `apps/backend/src/routes/calendar.ts`
- Modify: `apps/backend/test/calendar-promote.test.ts`

- [ ] **Step 1: Update promote handler**

  In `apps/backend/src/routes/calendar.ts`, find the promote handler (the `app.post<{ Params: { id: string } }>('/calendar/:id/promote', ...)` block). Replace the inner transaction body:

  Find the current implementation (around the deferred-payload + synthId section) and REPLACE the assignment-target branch:

  ```ts
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
      validUntil: assignmentPayload.validUntil ? new Date(assignmentPayload.validUntil) : null,
      state: 'ACTIVE',
    },
  });

  const promotedAt = new Date();

  const updatedEntry = await tx.calendarEntry.update({
    where: { id: entry.id },
    data: {
      promotedToKind: 'ASSIGNMENT',
      promotedToId: assignment.id, // real id, not synth
      promotedAt,
      pendingAssignmentPayload: null, // no deferral
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
  ```

  And update the response handler at the bottom of the function:

  ```ts
  reply.code(200).send({
    entryId: out.entry.id,
    promoted: { kind: 'ASSIGNMENT', id: out.assignmentId, deferred: false },
    promotedAt: out.entry.promotedAt!.toISOString(),
  });
  ```

  (Replace `out.synthId` references with `out.assignmentId`; replace `deferred: true` with `deferred: false`.)

- [ ] **Step 2: Update calendar-promote test assertions**

  In `apps/backend/test/calendar-promote.test.ts`, find the "happy path" test. Replace the assertion block:

  ```ts
  expect(r.statusCode).toBe(200);
  const body = r.json();
  expect(body.promoted.kind).toBe('ASSIGNMENT');
  expect(body.promoted.id).toBeTruthy();
  expect(body.promoted.deferred).toBe(false); // was true in Wave 1

  // Calendar entry now has promotedTo* set with REAL Assignment id
  const updatedEntry = await prismaRaw.calendarEntry.findUnique({ where: { id: entry.id } });
  expect(updatedEntry?.promotedToKind).toBe('ASSIGNMENT');
  expect(updatedEntry?.promotedToId).toBe(body.promoted.id);
  expect(updatedEntry?.promotedAt).toBeTruthy();
  expect(updatedEntry?.pendingAssignmentPayload).toBeNull(); // cleared

  // Real Assignment row exists
  const assignment = await prismaRaw.assignment.findUnique({ where: { id: body.promoted.id } });
  expect(assignment).toBeTruthy();
  expect(assignment?.state).toBe('ACTIVE');

  // AuditEvents
  const audits = await prismaRaw.auditEvent.findMany({
    where: { companyId, OR: [{ kind: 'CALENDAR_ENTRY_PROMOTED' }, { kind: 'ASSIGNMENT_CREATED' }] },
  });
  expect(audits.length).toBeGreaterThanOrEqual(2);
  ```

  Add cleanup of new Assignment rows in afterAll:

  ```ts
  await prismaRaw.assignment.deleteMany({ where: { companyId } });
  ```

- [ ] **Step 3: Run + verify**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend
  pnpm test:integration test/calendar-promote.test.ts 2>&1 | tail -10
  ```

  Expected: 3/3 pass.

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/backend/src/routes/calendar.ts apps/backend/test/calendar-promote.test.ts
  git commit -m "feat(backend): /calendar/:id/promote writes real Assignment (Wave 2a closes Wave 1's deferral)"
  ```

---

## Task 12: Idempotency + concurrency helpers

**Files:**

- Create: `apps/backend/src/lib/chat-idempotency.ts`
- Create: `apps/backend/src/lib/chat-concurrency.ts`

- [ ] **Step 1: Write idempotency helper**

  Create `apps/backend/src/lib/chat-idempotency.ts`:

  ```ts
  /**
   * Chat request idempotency dedup.
   *
   * @derives(master-plan §G)
   */

  import type { PrismaClient } from '@prisma/client';

  export async function checkIdempotency(
    prisma: PrismaClient,
    companyId: string,
    idempotencyKey: string,
  ): Promise<{ cached: true; responseJson: unknown } | { cached: false }> {
    const row = await prisma.chatRequestLog.findUnique({
      where: { companyId_idempotencyKey: { companyId, idempotencyKey } },
    });
    if (!row) return { cached: false };
    if (row.expiresAt < new Date()) {
      await prisma.chatRequestLog.delete({
        where: { companyId_idempotencyKey: { companyId, idempotencyKey } },
      });
      return { cached: false };
    }
    return { cached: true, responseJson: row.responseJson };
  }

  export async function recordIdempotency(
    prisma: PrismaClient,
    companyId: string,
    idempotencyKey: string,
    responseJson: object,
    chatMessageId: string | null,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.chatRequestLog.create({
      data: { companyId, idempotencyKey, responseJson, chatMessageId, expiresAt },
    });
  }
  ```

- [ ] **Step 2: Write concurrency helper**

  Create `apps/backend/src/lib/chat-concurrency.ts`:

  ```ts
  /**
   * Per-instance semaphore for chat requests.
   *
   * @derives(master-plan §G)
   */

  const MAX_CONCURRENT = parseInt(process.env.CHAT_MAX_CONCURRENT ?? '50', 10);
  let inFlight = 0;

  export function tryAcquireChatSlot(): boolean {
    if (inFlight >= MAX_CONCURRENT) return false;
    inFlight++;
    return true;
  }

  export function releaseChatSlot(): void {
    if (inFlight > 0) inFlight--;
  }

  export function getChatInFlight(): number {
    return inFlight;
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/backend/src/lib/chat-idempotency.ts apps/backend/src/lib/chat-concurrency.ts
  git commit -m "feat(backend): chat idempotency + concurrency helpers"
  ```

---

## Task 13: POST /chat/messages route + test

**Files:**

- Create: `apps/backend/src/routes/chat.ts`
- Create: `apps/backend/test/chat-create-message.test.ts`
- Modify: `apps/backend/src/server.ts`

- [ ] **Step 1: Write the route**

  Create `apps/backend/src/routes/chat.ts`:

  ```ts
  /**
   * Chat routes — POST /chat/messages and POST /chat/apply.
   *
   * @derives(master-plan §G)
   */

  import type { FastifyInstance } from 'fastify';
  import { CreateChatMessageInput, ApplyDecisionCardInput } from '@axhy/shared-schema';
  import {
    sonnetToolLoop,
    findWorkersTool,
    findSitesTool,
    proposeCreateAssignmentTool,
  } from '@axhy/ai-tools';

  import { prisma } from '../lib/prisma.js';
  import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
  import { recordAuditEvent } from '../lib/audit-event.js';
  import { checkIdempotency, recordIdempotency } from '../lib/chat-idempotency.js';
  import { tryAcquireChatSlot, releaseChatSlot } from '../lib/chat-concurrency.js';

  const SYSTEM_PROMPT = `You are Axhy's AI assistant for cleaning-company supervisors in India.
  When the supervisor asks to add a worker to a site, FIRST call find_workers and find_sites to
  resolve names → IDs, THEN call propose_create_assignment with the resolved IDs.
  Speak in the same language(s) the supervisor used (English, Hindi, Telugu).
  Keep responses concise — supervisors are busy.`;

  export async function registerChatRoutes(app: FastifyInstance): Promise<void> {
    app.post('/chat/messages', { preHandler: requireAuth }, async (req, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED' });
        return;
      }

      const idempotencyKey = req.headers['idempotency-key'];
      if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8) {
        reply.code(400).send({ error: 'IDEMPOTENCY_KEY_REQUIRED' });
        return;
      }

      const parsed = CreateChatMessageInput.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }

      // Idempotency check
      const dedup = await checkIdempotency(prisma, auth.companyId, idempotencyKey);
      if (dedup.cached) {
        reply.code(200).send(dedup.responseJson);
        return;
      }

      // Concurrency cap
      if (!tryAcquireChatSlot()) {
        reply.code(503).header('Retry-After', '5').send({ error: 'CHAT_BUSY' });
        return;
      }

      try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          reply.code(500).send({ error: 'AI_NOT_CONFIGURED' });
          return;
        }

        // Build tool list — Wave 2a: 3 tools
        const tools = [findWorkersTool, findSitesTool, proposeCreateAssignmentTool];

        // Run the tool loop with a handler that executes read tools but returns
        // propose_* as DecisionCard data without committing.
        const loopResult = await sonnetToolLoop({
          apiKey,
          systemPrompt: SYSTEM_PROMPT,
          userMessage: parsed.data.text,
          tools: tools as never,
          maxIterations: 6,
          timeoutMs: 9000,
          handler: async (name, input) => {
            if (name === 'find_workers') {
              const workers = await withTenantContext(prisma, auth.companyId, async (tx) =>
                tx.worker.findMany({
                  where: {
                    companyId: auth.companyId,
                    name: { contains: String(input.query), mode: 'insensitive' },
                  },
                  take: 10,
                }),
              );
              return {
                output: {
                  exact: workers.length === 1 ? workers : [],
                  ambiguous: workers.length > 1 ? workers : [],
                  none: workers.length === 0,
                },
              };
            }
            if (name === 'find_sites') {
              const sites = await withTenantContext(prisma, auth.companyId, async (tx) =>
                tx.site.findMany({
                  where: {
                    companyId: auth.companyId,
                    name: { contains: String(input.query), mode: 'insensitive' },
                  },
                  take: 10,
                }),
              );
              return {
                output: {
                  exact: sites.length === 1 ? sites : [],
                  ambiguous: sites.length > 1 ? sites : [],
                  none: sites.length === 0,
                },
              };
            }
            if (name === 'propose_create_assignment') {
              // DON'T commit — return DecisionCard data
              return {
                output: { proposed: true, fields: input },
                decisionCardData: {
                  title: 'Confirm assignment',
                  description: `Create assignment with these fields?`,
                  fields: input,
                  severity: 'CONFIRM',
                },
              };
            }
            return { output: { error: 'UNKNOWN_TOOL' } };
          },
        });

        // Persist ChatThread (upsert) + ChatMessage (user + assistant rows)
        const chatMessageId = await withTenantContext(prisma, auth.companyId, async (tx) => {
          const thread = await tx.chatThread.upsert({
            where: {
              companyId_supervisorId: { companyId: auth.companyId, supervisorId: auth.userId },
            },
            create: {
              companyId: auth.companyId,
              supervisorId: auth.userId,
              lastMessageAt: new Date(),
            },
            update: { lastMessageAt: new Date() },
          });

          await tx.chatMessage.create({
            data: {
              companyId: auth.companyId,
              threadId: thread.id,
              role: 'user',
              transcript: parsed.data.text,
              voiceConfidence: parsed.data.voiceConfidence ?? null,
              idempotencyKey,
            },
          });

          const assistantMsg = await tx.chatMessage.create({
            data: {
              companyId: auth.companyId,
              threadId: thread.id,
              role: 'assistant',
              aiResponseText: loopResult.finalText,
              toolCalls: loopResult.toolCalls,
              decisionCard: loopResult.decisionCards[0] ?? null, // Wave 2a: 1 card per turn
              modelUsed: 'claude-sonnet-4-6',
              idempotencyKey,
            },
          });

          await recordAuditEvent(tx, {
            companyId: auth.companyId,
            kind: 'CHAT_MESSAGE_CREATED',
            actorId: auth.userId,
            targetId: assistantMsg.id,
            payload: {
              textLen: parsed.data.text.length,
              decisionCardCount: loopResult.decisionCards.length,
            },
          });

          return assistantMsg.id;
        });

        const response = {
          chatMessageId,
          assistantText: loopResult.finalText,
          decisionCard: loopResult.decisionCards[0] ?? null,
        };

        await recordIdempotency(prisma, auth.companyId, idempotencyKey, response, chatMessageId);

        reply.code(200).send(response);
      } finally {
        releaseChatSlot();
      }
    });

    // POST /chat/apply — Task 14 implements this body
    app.post('/chat/apply', { preHandler: requireAuth }, async (req, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED' });
        return;
      }
      const parsed = ApplyDecisionCardInput.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }
      // For Wave 2a: only propose_create_assignment is supported.
      // We delegate by calling our own POST /assignments with the parsed input.
      if (parsed.data.toolName !== 'propose_create_assignment') {
        reply
          .code(501)
          .send({ error: 'NOT_IMPLEMENTED', message: 'Only propose_create_assignment in Wave 2a' });
        return;
      }
      const inner = await app.inject({
        method: 'POST',
        url: '/assignments',
        headers: { authorization: req.headers.authorization! },
        payload: parsed.data.toolInput,
      });
      reply.code(inner.statusCode).send(inner.json());
    });
  }
  ```

- [ ] **Step 2: Wire into server.ts**

  Add import + registration in `apps/backend/src/server.ts`:

  ```ts
  import { registerChatRoutes } from './routes/chat.js';
  // ... in route-registration block:
  await registerChatRoutes(app);
  ```

- [ ] **Step 3: Write the test** (Task 13 test, Task 14 test, simpler one combined)

  Create `apps/backend/test/chat-create-message.test.ts`:

  ```ts
  /**
   * @derives(master-plan §G)
   */

  import { describe, it, expect, beforeAll, afterAll } from 'vitest';
  import type { FastifyInstance } from 'fastify';
  import { PrismaClient } from '@prisma/client';
  import crypto from 'node:crypto';

  process.env.AXHY_OTP_BYPASS = '1';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

  const dbUrl =
    process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
  process.env.DATABASE_URL = dbUrl;
  const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const TEST_PREFIX = `chat-msg-${Date.now()}-`;

  let app: FastifyInstance;
  let companyId: string;
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
        ownerPhone: '+919900000063',
        ownerName: 'O',
      },
    });
    companyId = co.id;
    const sup = await prismaRaw.user.create({
      data: { phone: `+9199${String(Date.now()).slice(-8)}`, name: 'S', locale: 'en' },
    });
    await prismaRaw.membership.create({
      data: { companyId, userId: sup.id, role: 'SUPERVISOR', status: 'ACTIVE' },
    });

    accessToken = await issueAccessToken({
      userId: sup.id,
      companyId,
      role: 'SUPERVISOR',
      availableRoles: ['SUPERVISOR'],
      locale: 'en',
    });
  });

  afterAll(async () => {
    await prismaRaw.chatRequestLog.deleteMany({ where: { companyId } });
    await prismaRaw.chatMessage.deleteMany({ where: { companyId } });
    await prismaRaw.chatThread.deleteMany({ where: { companyId } });
    await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
    await prismaRaw.membership.deleteMany({ where: { companyId } });
    await prismaRaw.company.delete({ where: { id: companyId } });
    await prismaRaw.$disconnect();
    await app.close();
  });

  describe('POST /chat/messages', () => {
    it('400 on missing Idempotency-Key', async () => {
      const r = await app.inject({
        method: 'POST',
        url: '/chat/messages',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { text: 'hello' },
      });
      expect(r.statusCode).toBe(400);
    });

    it('happy path returns assistantText + decisionCard fields', async () => {
      const idempKey = crypto.randomUUID();
      const r = await app.inject({
        method: 'POST',
        url: '/chat/messages',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'idempotency-key': idempKey,
        },
        payload: { text: 'Hello, can you say hi back?' },
      });
      expect(r.statusCode).toBe(200);
      const body = r.json();
      expect(body.chatMessageId).toBeTruthy();
      expect(typeof body.assistantText).toBe('string');

      // Verify ChatThread + ChatMessage rows
      const thread = await prismaRaw.chatThread.findFirst({ where: { companyId } });
      expect(thread).toBeTruthy();
      const messages = await prismaRaw.chatMessage.findMany({ where: { companyId } });
      expect(messages.length).toBeGreaterThanOrEqual(2); // user + assistant
    }, 20000);

    it('idempotency dedup: same key returns cached response', async () => {
      const idempKey = crypto.randomUUID();
      const r1 = await app.inject({
        method: 'POST',
        url: '/chat/messages',
        headers: { authorization: `Bearer ${accessToken}`, 'idempotency-key': idempKey },
        payload: { text: 'Test idempotency' },
      });
      const r2 = await app.inject({
        method: 'POST',
        url: '/chat/messages',
        headers: { authorization: `Bearer ${accessToken}`, 'idempotency-key': idempKey },
        payload: { text: 'Test idempotency' },
      });
      expect(r1.statusCode).toBe(200);
      expect(r2.statusCode).toBe(200);
      expect(r1.json().chatMessageId).toBe(r2.json().chatMessageId);
    }, 20000);
  });
  ```

- [ ] **Step 4: Run + verify**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend
  pnpm test:integration test/chat-create-message.test.ts 2>&1 | tail -10
  ```

  Expected: 3/3 pass. (Real Anthropic API calls — costs ~$0.10 total.)

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/backend/src/routes/chat.ts apps/backend/src/server.ts apps/backend/test/chat-create-message.test.ts
  git commit -m "feat(backend): POST /chat/messages with idempotency + Anthropic tool-use loop"
  ```

---

## Task 14: End-to-end magic-loop test (chat-tool-loop)

**Files:** `apps/backend/test/chat-tool-loop.test.ts`

- [ ] **Step 1: Write the end-to-end test**

  ```ts
  /**
   * End-to-end: voice message → AI → DecisionCard → Apply → real Assignment row.
   * Vignette 1 + 5 from Vision Narrative.
   *
   * @derives(master-plan §G)
   */

  import { describe, it, expect, beforeAll, afterAll } from 'vitest';
  import type { FastifyInstance } from 'fastify';
  import { PrismaClient } from '@prisma/client';
  import crypto from 'node:crypto';

  process.env.AXHY_OTP_BYPASS = '1';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

  const dbUrl =
    process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
  process.env.DATABASE_URL = dbUrl;
  const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const TEST_PREFIX = `chat-loop-${Date.now()}-`;

  let app: FastifyInstance;
  let companyId: string;
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
        ownerPhone: '+919900000064',
        ownerName: 'O',
      },
    });
    companyId = co.id;
    const sup = await prismaRaw.user.create({
      data: { phone: `+9199${String(Date.now()).slice(-8)}`, name: 'S', locale: 'en' },
    });
    await prismaRaw.membership.create({
      data: { companyId, userId: sup.id, role: 'SUPERVISOR', status: 'ACTIVE' },
    });
    const w = await prismaRaw.worker.create({
      data: {
        companyId,
        name: 'Pradeep',
        state: 'ACTIVE',
        phone: `+9199${String(Date.now() + 1).slice(-8)}`,
      },
    });
    workerId = w.id;
    const s = await prismaRaw.site.create({ data: { companyId, name: 'Apollo Hospital' } });
    siteId = s.id;

    accessToken = await issueAccessToken({
      userId: sup.id,
      companyId,
      role: 'SUPERVISOR',
      availableRoles: ['SUPERVISOR'],
      locale: 'en',
    });
  });

  afterAll(async () => {
    await prismaRaw.assignment.deleteMany({ where: { companyId } });
    await prismaRaw.chatRequestLog.deleteMany({ where: { companyId } });
    await prismaRaw.chatMessage.deleteMany({ where: { companyId } });
    await prismaRaw.chatThread.deleteMany({ where: { companyId } });
    await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
    await prismaRaw.worker.deleteMany({ where: { companyId } });
    await prismaRaw.site.deleteMany({ where: { companyId } });
    await prismaRaw.membership.deleteMany({ where: { companyId } });
    await prismaRaw.company.delete({ where: { id: companyId } });
    await prismaRaw.$disconnect();
    await app.close();
  });

  describe('end-to-end magic loop (vignette 1 + 5)', () => {
    it('voice → AI → DecisionCard → Apply → real Assignment row', async () => {
      // 1. Send a chat message that should trigger find_workers + find_sites + propose_create_assignment
      const idempKey = crypto.randomUUID();
      const chatRes = await app.inject({
        method: 'POST',
        url: '/chat/messages',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'idempotency-key': idempKey,
        },
        payload: {
          text: 'Add Pradeep to Apollo Hospital, Mon-Sat 9am to 5pm, starting May 12 2026',
        },
      });
      expect(chatRes.statusCode).toBe(200);
      const chatBody = chatRes.json();
      expect(chatBody.decisionCard).toBeTruthy();
      expect(chatBody.decisionCard.toolName).toBe('propose_create_assignment');
      const proposedFields = chatBody.decisionCard.fields;
      expect(proposedFields.workerId).toBe(workerId);
      expect(proposedFields.siteId).toBe(siteId);

      // No Assignment row yet (proposal only)
      const beforeApply = await prismaRaw.assignment.findMany({ where: { companyId } });
      expect(beforeApply.length).toBe(0);

      // 2. Tap Apply
      const applyRes = await app.inject({
        method: 'POST',
        url: '/chat/apply',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          chatMessageId: chatBody.chatMessageId,
          toolName: 'propose_create_assignment',
          toolInput: proposedFields,
        },
      });
      expect(applyRes.statusCode).toBe(200);

      // Real Assignment row exists
      const afterApply = await prismaRaw.assignment.findMany({ where: { companyId } });
      expect(afterApply.length).toBe(1);
      expect(afterApply[0].workerId).toBe(workerId);
      expect(afterApply[0].siteId).toBe(siteId);
    }, 30000);
  });
  ```

- [ ] **Step 2: Run + verify**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend
  pnpm test:integration test/chat-tool-loop.test.ts 2>&1 | tail -15
  ```

  Expected: 1/1 pass. (Real Anthropic API call — ~$0.20.)

  **If it fails:**
  - Check `ANTHROPIC_API_KEY` is set in `apps/backend/.env.local`
  - Check `claude-sonnet-4-6` model name is valid (per ADR-0023; if not yet GA, fallback to `claude-sonnet-4-5` for the test)
  - Inspect the test output for what the AI emitted — accuracy depends on model behavior

- [ ] **Step 3: Commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/backend/test/chat-tool-loop.test.ts
  git commit -m "test(backend): end-to-end magic-loop test — voice → AI → DecisionCard → Apply → Assignment row"
  ```

---

## Task 15: Cross-tenant chat isolation test

**Files:** `apps/backend/test/cross-tenant-chat.test.ts`

- [ ] **Step 1: Write the test**

  ```ts
  /**
   * @derives(master-plan §G)
   */

  import { describe, it, expect, beforeAll, afterAll } from 'vitest';
  import type { FastifyInstance } from 'fastify';
  import { PrismaClient } from '@prisma/client';
  import crypto from 'node:crypto';

  process.env.AXHY_OTP_BYPASS = '1';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

  const dbUrl =
    process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
  process.env.DATABASE_URL = dbUrl;
  const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const TEST_PREFIX = `chat-xt-${Date.now()}-`;

  let app: FastifyInstance;
  let coAId: string;
  let coBId: string;
  let supATokenAValid: string;
  let supBTokenBValid: string;

  beforeAll(async () => {
    const { buildServer } = await import('../src/server.js');
    const { issueAccessToken } = await import('../src/lib/jwt.js');
    app = await buildServer();
    await app.ready();

    const a = await prismaRaw.company.create({
      data: {
        name: TEST_PREFIX + 'A',
        slug: TEST_PREFIX + 'a',
        ownerPhone: '+919900000065',
        ownerName: 'OA',
      },
    });
    coAId = a.id;
    const b = await prismaRaw.company.create({
      data: {
        name: TEST_PREFIX + 'B',
        slug: TEST_PREFIX + 'b',
        ownerPhone: '+919900000066',
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
      data: { companyId: coAId, userId: supA.id, role: 'SUPERVISOR', status: 'ACTIVE' },
    });
    await prismaRaw.membership.create({
      data: { companyId: coBId, userId: supB.id, role: 'SUPERVISOR', status: 'ACTIVE' },
    });

    supATokenAValid = await issueAccessToken({
      userId: supA.id,
      companyId: coAId,
      role: 'SUPERVISOR',
      availableRoles: ['SUPERVISOR'],
      locale: 'en',
    });
    supBTokenBValid = await issueAccessToken({
      userId: supB.id,
      companyId: coBId,
      role: 'SUPERVISOR',
      availableRoles: ['SUPERVISOR'],
      locale: 'en',
    });
  });

  afterAll(async () => {
    await prismaRaw.chatRequestLog.deleteMany({
      where: { OR: [{ companyId: coAId }, { companyId: coBId }] },
    });
    await prismaRaw.chatMessage.deleteMany({
      where: { OR: [{ companyId: coAId }, { companyId: coBId }] },
    });
    await prismaRaw.chatThread.deleteMany({
      where: { OR: [{ companyId: coAId }, { companyId: coBId }] },
    });
    await prismaRaw.auditEvent.deleteMany({
      where: { OR: [{ companyId: coAId }, { companyId: coBId }] },
    });
    await prismaRaw.membership.deleteMany({
      where: { OR: [{ companyId: coAId }, { companyId: coBId }] },
    });
    await prismaRaw.company.deleteMany({ where: { id: { in: [coAId, coBId] } } });
    await prismaRaw.$disconnect();
    await app.close();
  });

  describe('cross-tenant chat isolation', () => {
    it('Tenant B cannot reuse Tenant A idempotency key', async () => {
      const sharedKey = crypto.randomUUID();

      // Tenant A sends first
      await app.inject({
        method: 'POST',
        url: '/chat/messages',
        headers: { authorization: `Bearer ${supATokenAValid}`, 'idempotency-key': sharedKey },
        payload: { text: 'Hello A' },
      });

      // Tenant B reuses same key — should NOT get A's cached response
      const rB = await app.inject({
        method: 'POST',
        url: '/chat/messages',
        headers: { authorization: `Bearer ${supBTokenBValid}`, 'idempotency-key': sharedKey },
        payload: { text: 'Hello B' },
      });
      expect(rB.statusCode).toBe(200);

      // Verify A's threads exist for A only, B's for B only
      const aThreads = await prismaRaw.chatThread.findMany({ where: { companyId: coAId } });
      const bThreads = await prismaRaw.chatThread.findMany({ where: { companyId: coBId } });
      expect(aThreads.length).toBe(1);
      expect(bThreads.length).toBe(1);
    }, 30000);
  });
  ```

- [ ] **Step 2: Run + verify**

  ```bash
  pnpm test:integration test/cross-tenant-chat.test.ts 2>&1 | tail -10
  ```

  Expected: 1/1 pass. (Two real Anthropic calls — ~$0.20.)

- [ ] **Step 3: Commit**

  ```bash
  git add apps/backend/test/cross-tenant-chat.test.ts
  git commit -m "test(backend): cross-tenant chat isolation"
  ```

---

## Task 16: Full suite green check

- [ ] **Step 1: Run full test suite**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend
  set -a && source .env.local && set +a
  pnpm test:integration 2>&1 | tail -20
  ```

  Expected: 66 (Phase B + Wave 1) + ~14 (Wave 2a) = ~80 tests pass. 0 fails.

- [ ] **Step 2: If anything fails, STOP and investigate**

  Phase B + Wave 1 regressions are blockers. Common causes:
  - calendar-promote test was incompletely updated → re-check Task 11
  - server.ts route registration order broke imports → check imports
  - Prisma client out of date → run `pnpm exec prisma generate` from `packages/shared-schema`

- [ ] **Step 3: If green, marker commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git commit --allow-empty -m "ci(backend): Wave 2a + Wave 1 + Phase B all green (~80 tests)"
  ```

---

## Task 17: Push branch + open draft PR

- [ ] **Step 1: Push**

  ```bash
  git push -u origin feat/phase-c-wave-2a-vertical-slice
  ```

- [ ] **Step 2: Open draft PR**

  ```bash
  gh pr create --draft --base feat/phase-c-wave-1-calendar --title "Phase C Wave 2a — AI chat vertical slice" --body "$(cat <<'EOF'
  ## Summary

  Wave 2a wires the AI chat magic loop end-to-end. Voice → AI → DecisionCard → tap → real Assignment row. The vignette-1+5 magic moment now works against real Anthropic + real Railway.

  - Assignment table created + block_past_assignment_update trigger attached
  - ChatThread + ChatMessage + ChatRequestLog tables (idempotency dedup)
  - POST /assignments — direct create (recurring + oneOffDate shapes)
  - POST /chat/messages — Anthropic Sonnet 4.6 tool-use loop with idempotency + 503 concurrency
  - POST /chat/apply — execute confirmed proposed action
  - 3 AI tools wired: find_workers, find_sites, propose_create_assignment
  - sonnet-tool-loop.ts adapter in @axhy/ai-tools
  - Hydrator script converts Wave 1's deferred Assignment payloads → real rows
  - calendar-promote route updated to write real Assignment directly (Wave 1's deferral closed)
  - Assignment state-machine helpers + 9 unit tests
  - 14 new integration tests on real Railway

  ## Out of scope (deferred to 2b/c/d)

  - LivingDoc restructure (Wave 2b)
  - propose_living_doc_update tool (Wave 2b)
  - Other 14 propose_* tools beyond propose_create_assignment
  - Prompt cache 3-tier (Wave 2d)
  - Cost ceiling enforcement (Wave 2d)
  - Chat history scroll-back / GET /chat/messages (Wave 2c)
  - Visit materialization cron (Wave 3)

  ## Test plan

  - [ ] All Phase B (50) + Wave 1 (16) tests still pass
  - [ ] All 14 Wave 2a tests pass
  - [ ] Cross-tenant isolation enforced
  - [ ] Real Anthropic API calls return DecisionCard data correctly
  - [ ] Hydrator converts deferred → real rows correctly

  Spec: docs/specs/2026-05-09-phase-c-spec-2-ai-chat-design.md
  Plan: docs/plans/2026-05-09-phase-c-wave-2a-vertical-slice.md

  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  EOF
  )"
  ```

- [ ] **Step 3: Report PR URL** to founder for review.

---

## Self-review

Spec coverage check (Spec 2 §3 schema, §4 AI loop, §7 hydrator, §11 routes):

- §3.1 Assignment → Task 2-3 ✓
- §3.2 ChatThread → Task 2-3 ✓
- §3.3 ChatMessage → Task 2-3 ✓
- §3.4 ChatRequestLog → Task 2-3 ✓
- §3.5 LivingDoc → DEFERRED to Wave 2b (per spec §13) ✓
- §3.7 Migrations + hydrator → Task 3 + Task 10 ✓
- §4 AI loop architecture (sync + idempotency + concurrency + tool-use loop) → Task 7, 12, 13 ✓
- §7 Hydrator → Task 10 ✓
- §11 Backend routes — Wave 2a subset (POST /assignments, POST /chat/messages, POST /chat/apply) → Task 8, 13 ✓

**Spec gaps left for later waves:**

- LivingDoc + LivingDocProposal logic → Wave 2b
- propose_living_doc_update + nightly cron → Wave 2b
- GET /chat/messages history endpoint → Wave 2c
- Prompt cache 3-tier → Wave 2d
- Cost ceiling + Company.aiSpendDailyInr column → Wave 2d (column added later, not in 2a migration)

**Type consistency check:** `AssignmentState` ('DRAFT'|'ACTIVE'|'TERMINATED') consistent across Task 2, 5, 8, 11. `dayMaskFromDate` returns 7-char string consistent across Task 5, 6, 8. `CreateAssignmentInput` Zod shape consistent across Task 4, 8.

**Placeholder check:** No "TBD"/"TODO"/vague refs. Every step has runnable code or exact command.

---

**Plan complete and saved to `docs/plans/2026-05-09-phase-c-wave-2a-vertical-slice.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
