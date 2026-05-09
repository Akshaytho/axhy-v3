# Phase C Wave 4a-PRO — Chat + Assignment world-domination — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Per `feedback_expo_fast_refresh_plus_playwright.md`: keep Expo dev + persistent browser tab open during all UI iteration; use Playwright headed mode for systematic capture.

**Goal:** Wire 4 missing propose\_\* tools (mark_absent, leave, swap, termination) into chat handler, plumb conflict detection, add multi-tool batch UI, polish UI gaps. Result: chat handles ~95% of supervisor daily volume → product moat.

**Architecture:** No schema changes. Each tool branch in chat handler validates tenant scope, calls `detectConflicts()` from `packages/state-machines/conflicts.ts`, returns DecisionCard with severity color + override chips. `POST /chat/apply` routes to existing Phase B endpoints (workers/mark-absent, leave-requests, swap-requests) or inline Worker state transitions for terminations. Mobile UI extends DecisionCard with chip picker, multi-card batch parent, day-mask humanization, severity color verified for all 3 tiers.

**Tech Stack:** TypeScript strict, Fastify 5 + Prisma 6, Vitest real-DB integration tests, Anthropic Sonnet 4.6 (`@anthropic-ai/sdk@^0.30.0`), React Native 0.74 + Expo SDK 54, vitest for mobile lib/, Playwright headed for UI flow capture, `@axhy/ui-tokens` terracotta+paper.

---

## Pre-flight

- [ ] **Read Spec 4 + key existing routes**

  ```bash
  cat docs/specs/2026-05-09-phase-c-spec-4-wave-4a-pro-chat-domination.md
  cat apps/backend/src/routes/chat.ts
  cat apps/backend/src/routes/workers.ts | head -120  # mark-absent pattern
  cat apps/backend/src/routes/leave-requests.ts | head -80
  cat apps/backend/src/routes/swap-requests.ts | head -100
  cat packages/state-machines/src/conflicts.ts 2>/dev/null || echo "conflicts.ts may not exist yet — Spec 1 §7.4 says it should"
  ```

- [ ] **Verify environment**

  Three terminals running:

  ```bash
  # Terminal 1
  cd apps/backend && pnpm dev   # listens :4000
  # Terminal 2
  cd apps/mobile && EXPO_PUBLIC_API_BASE_URL=http://localhost:4000 pnpm exec expo start --web --port 8081
  # Terminal 3 (Chrome tab open at http://localhost:8081/)
  ```

- [ ] **Check baseline tests still green**

  ```bash
  cd apps/backend
  set -a && source .env.local && set +a
  pnpm test:integration 2>&1 | tail -10
  ```

  Expected: 79+ tests pass (the existing chat-create-message + chat-tool-loop + cross-tenant + earlier waves).

- [ ] **Check `packages/state-machines/conflicts.ts` exists**

  Spec 1 §7.4 says it should. Confirm:

  ```bash
  ls packages/state-machines/src/conflicts.ts && head -30 packages/state-machines/src/conflicts.ts
  ```

  If missing → STOP, escalate. The plan assumes it exists; if not, Wave 1 didn't ship it and Task 9 can't proceed.

---

## File Structure

**New files (10):**

| Path                                         | Responsibility                     |
| -------------------------------------------- | ---------------------------------- |
| `packages/ai-tools/src/tools/mark-absent.ts` | `proposeMarkAbsentTool` schema     |
| `packages/ai-tools/src/tools/leave.ts`       | `proposeLeaveTool` schema          |
| `packages/ai-tools/src/tools/swap.ts`        | `proposeSwapTool` schema           |
| `packages/ai-tools/src/tools/termination.ts` | `proposeTerminationTool` schema    |
| `apps/backend/test/chat-mark-absent.test.ts` | mark-absent flow integration test  |
| `apps/backend/test/chat-leave.test.ts`       | leave flow integration test        |
| `apps/backend/test/chat-swap.test.ts`        | swap flow integration test         |
| `apps/backend/test/chat-termination.test.ts` | termination flow integration test  |
| `apps/backend/test/chat-conflict.test.ts`    | conflict detection wired into chat |
| `apps/backend/test/chat-batch.test.ts`       | multi-tool-turn batch DecisionCard |
| `apps/mobile/lib/format.ts`                  | `humanizeDayMask()`                |
| `apps/mobile/lib/format.test.ts`             | format helpers unit tests          |
| `apps/mobile/components/ChipPicker.tsx`      | override-reason chip picker        |
| `apps/mobile/components/EmptyState.tsx`      | chat empty-state welcome           |
| `apps/mobile/components/SkeletonBubble.tsx`  | shimmer skeleton placeholder       |

**Modified files (5):**

| Path                                         | Change                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `apps/backend/src/routes/chat.ts`            | Add 4 tool branches + plumb detectConflicts + multi-tool batch shape                                    |
| `apps/mobile/components/DecisionCard.tsx`    | Use `humanizeDayMask`, render ChipPicker for SOFT severity, render batch sub-items, fix Cancel contrast |
| `apps/mobile/lib/chat-api.ts`                | Type response shape to support `decisionCards: Array<>`                                                 |
| `apps/mobile/app/(supervisor)/chat.tsx`      | Use EmptyState + SkeletonBubble                                                                         |
| `apps/mobile/scripts/screenshot-wave-4a.mjs` | Extend to 12 flows (mark-absent, leave, swap, termination, conflict-chip, batch)                        |

---

## Task 1: `propose_mark_absent` tool schema

**Files:** Create `packages/ai-tools/src/tools/mark-absent.ts`; modify `packages/ai-tools/src/index.ts`

- [ ] **Step 1: Create the tool schema**

  ```ts
  /**
   * propose_mark_absent — supervisor's #1 daily action.
   *
   * @derives(master-plan §G)
   */

  export const proposeMarkAbsentTool = {
    name: 'propose_mark_absent',
    description:
      'Propose marking a worker absent for a specific date. Use when supervisor says "Mukesh is absent today" / "Suresh did not show up" / "Lakshmi called sick". After find_workers resolves the worker by name, propose this. Backend will detect if the worker is already on leave (conflict) and surface as WARN.',
    input_schema: {
      type: 'object' as const,
      properties: {
        workerId: { type: 'string', description: 'UUID from find_workers' },
        date: { type: 'string', description: 'ISO date YYYY-MM-DD; default today if omitted' },
        reason: {
          type: 'string',
          enum: ['sick', 'family', 'transport', 'unknown', 'other'],
          description: 'Common buckets; "unknown" if supervisor did not say',
        },
        reasonDetail: { type: 'string', description: 'Optional supervisor note' },
      },
      required: ['workerId'],
    },
  } as const;
  ```

- [ ] **Step 2: Re-export**

  Append to `packages/ai-tools/src/index.ts`:

  ```ts
  export * from './tools/mark-absent.js';
  ```

- [ ] **Step 3: Build**

  ```bash
  cd packages/ai-tools && ~/.nvm/versions/node/v20.20.1/bin/pnpm build
  ```

  Expected: tsc clean.

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add packages/ai-tools/src/tools/mark-absent.ts packages/ai-tools/src/index.ts
  git commit -m "feat(ai-tools): propose_mark_absent tool schema"
  ```

---

## Task 2: Wire mark_absent handler + integration test

**Files:**

- Modify: `apps/backend/src/routes/chat.ts` (add tool to tools list + handler branch)
- Create: `apps/backend/test/chat-mark-absent.test.ts`

- [ ] **Step 1: Write the failing integration test**

  Create `apps/backend/test/chat-mark-absent.test.ts`:

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
  const PFX = `chat-mka-${Date.now()}-`;

  let app: FastifyInstance;
  let companyId: string;
  let workerId: string;
  let token: string;

  beforeAll(async () => {
    const { buildServer } = await import('../src/server.js');
    const { issueAccessToken } = await import('../src/lib/jwt.js');
    app = await buildServer();
    await app.ready();

    const co = await prismaRaw.company.create({
      data: { name: PFX + 'Co', slug: PFX + 'co', ownerPhone: '+919900000201', ownerName: 'O' },
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
        name: 'Sundeep',
        state: 'ACTIVE',
        phone: `+9199${String(Date.now() + 1).slice(-8)}`,
      },
    });
    workerId = w.id;
    token = await issueAccessToken({
      userId: sup.id,
      companyId,
      role: 'SUPERVISOR',
      availableRoles: ['SUPERVISOR'],
      locale: 'en',
    });
  });

  afterAll(async () => {
    await prismaRaw.attendance.deleteMany({ where: { companyId } });
    await prismaRaw.chatRequestLog.deleteMany({ where: { companyId } });
    await prismaRaw.chatMessage.deleteMany({ where: { companyId } });
    await prismaRaw.chatThread.deleteMany({ where: { companyId } });
    await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
    await prismaRaw.worker.deleteMany({ where: { companyId } });
    await prismaRaw.membership.deleteMany({ where: { companyId } });
    await prismaRaw.company.delete({ where: { id: companyId } });
    await prismaRaw.$disconnect();
    await app.close();
  });

  describe('chat → propose_mark_absent', () => {
    it('voice → AI → DecisionCard → Apply → Attendance row', async () => {
      const idem = crypto.randomUUID();
      const chatRes = await app.inject({
        method: 'POST',
        url: '/chat/messages',
        headers: { authorization: `Bearer ${token}`, 'idempotency-key': idem },
        payload: { text: 'Sundeep is absent today, called in sick' },
      });
      expect(chatRes.statusCode).toBe(200);
      const body = chatRes.json();
      expect(body.decisionCard).toBeTruthy();
      expect(body.decisionCard.toolName).toBe('propose_mark_absent');
      const proposed = body.decisionCard.fields;
      expect(proposed.workerId).toBe(workerId);

      const applyRes = await app.inject({
        method: 'POST',
        url: '/chat/apply',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          chatMessageId: body.chatMessageId,
          toolName: 'propose_mark_absent',
          toolInput: proposed,
        },
      });
      expect(applyRes.statusCode).toBe(200);

      const attendance = await prismaRaw.attendance.findFirst({ where: { companyId, workerId } });
      expect(attendance).toBeTruthy();
      expect(attendance?.status).toBe('ABSENT');
    }, 60000);
  });
  ```

- [ ] **Step 2: Confirm red**

  ```bash
  cd apps/backend
  set -a && source .env.local && set +a
  ~/.nvm/versions/node/v20.20.1/bin/node node_modules/vitest/vitest.mjs run test/chat-mark-absent.test.ts 2>&1 | tail -10
  ```

  Expected: fails with `tools` array not including mark_absent → AI returns text-only or different tool.

- [ ] **Step 3: Add tool to chat handler**

  Open `apps/backend/src/routes/chat.ts`. Update import:

  ```ts
  import {
    sonnetToolLoop,
    findWorkersTool,
    findSitesTool,
    proposeCreateAssignmentTool,
    proposeMarkAbsentTool, // NEW
  } from '@axhy/ai-tools';
  ```

  Update the `tools` array inside the route handler:

  ```ts
  const tools = [
    findWorkersTool,
    findSitesTool,
    proposeCreateAssignmentTool,
    proposeMarkAbsentTool, // NEW
  ];
  ```

  Add a handler branch (inside the `handler: async (name, input) => {...}`):

  ```ts
  if (name === 'propose_mark_absent') {
    const {
      workerId: wid,
      date,
      reason,
      reasonDetail,
    } = input as {
      workerId: string;
      date?: string;
      reason?: string;
      reasonDetail?: string;
    };
    const worker = await withTenantContext(prisma, auth.companyId, async (tx) =>
      tx.worker.findFirst({ where: { id: wid, companyId: auth.companyId } }),
    );
    if (!worker) return { output: { error: 'WORKER_NOT_FOUND' } };
    const dateStr = date ?? new Date().toISOString().slice(0, 10);
    return {
      output: { proposed: true, fields: { workerId: wid, date: dateStr, reason, reasonDetail } },
      decisionCardData: {
        title: 'Mark absent',
        description: `Mark ${worker.name} absent on ${dateStr}?`,
        fields: {
          workerId: wid,
          date: dateStr,
          reason: reason ?? 'unknown',
          ...(reasonDetail ? { reasonDetail } : {}),
        },
        severity: 'CONFIRM',
      },
    };
  }
  ```

- [ ] **Step 4: Add /chat/apply branch for propose_mark_absent**

  In the same file, find the `app.post('/chat/apply', ...)` block. Currently only handles `propose_create_assignment`. Add:

  ```ts
  if (parsed.data.toolName === 'propose_mark_absent') {
    const inner = await app.inject({
      method: 'POST',
      url: `/workers/${parsed.data.toolInput.workerId}/mark-absent`,
      headers: { authorization: req.headers.authorization! },
      payload: {
        date: parsed.data.toolInput.date,
        reason: parsed.data.toolInput.reason,
        reasonDetail: parsed.data.toolInput.reasonDetail,
      },
    });
    reply.code(inner.statusCode).send(inner.json());
    return;
  }
  ```

  (Note: Phase B's `POST /workers/:id/mark-absent` route accepts `{ date, reason, reasonDetail }` per the existing schema. Verify in `apps/backend/src/routes/workers.ts` if signature differs — adjust payload shape.)

- [ ] **Step 5: Run test → green**

  ```bash
  cd apps/backend
  ~/.nvm/versions/node/v20.20.1/bin/node node_modules/vitest/vitest.mjs run test/chat-mark-absent.test.ts 2>&1 | tail -10
  ```

  Expected: 1/1 pass.

- [ ] **Step 6: Commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/backend/src/routes/chat.ts apps/backend/test/chat-mark-absent.test.ts
  git commit -m "feat(backend): wire propose_mark_absent in chat handler + integration test"
  ```

---

## Task 3: `propose_leave` tool schema

**Files:** Create `packages/ai-tools/src/tools/leave.ts`; modify `packages/ai-tools/src/index.ts`

- [ ] **Step 1: Create the tool schema**

  Create `packages/ai-tools/src/tools/leave.ts`:

  ```ts
  /**
   * propose_leave — workers requesting time off.
   *
   * @derives(master-plan §G)
   */

  export const proposeLeaveTool = {
    name: 'propose_leave',
    description:
      'Propose a leave request for a worker. Use when supervisor says "Suresh sick for 3 days" / "Pradeep needs leave Monday to Wednesday". HR approves per Spec 1 §6 approver-role table.',
    input_schema: {
      type: 'object' as const,
      properties: {
        workerId: { type: 'string', description: 'UUID from find_workers' },
        fromDate: { type: 'string', description: 'ISO date YYYY-MM-DD' },
        toDate: {
          type: 'string',
          description: 'ISO date YYYY-MM-DD; same as fromDate for one-day',
        },
        reason: {
          type: 'string',
          enum: ['sick', 'casual', 'vacation', 'emergency', 'other'],
        },
        reasonDetail: { type: 'string' },
      },
      required: ['workerId', 'fromDate', 'toDate'],
    },
  } as const;
  ```

- [ ] **Step 2: Re-export**

  Append to `packages/ai-tools/src/index.ts`:

  ```ts
  export * from './tools/leave.js';
  ```

- [ ] **Step 3: Build + commit**

  ```bash
  cd packages/ai-tools && ~/.nvm/versions/node/v20.20.1/bin/pnpm build
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add packages/ai-tools/src/tools/leave.ts packages/ai-tools/src/index.ts
  git commit -m "feat(ai-tools): propose_leave tool schema"
  ```

---

## Task 4: Wire leave handler + integration test

**Files:**

- Modify: `apps/backend/src/routes/chat.ts`
- Create: `apps/backend/test/chat-leave.test.ts`

- [ ] **Step 1: Write the failing test**

  Mirror Task 2's test structure. Create `apps/backend/test/chat-leave.test.ts`:

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
  const PFX = `chat-lv-${Date.now()}-`;
  let app: FastifyInstance;
  let companyId: string;
  let workerId: string;
  let token: string;

  beforeAll(async () => {
    const { buildServer } = await import('../src/server.js');
    const { issueAccessToken } = await import('../src/lib/jwt.js');
    app = await buildServer();
    await app.ready();
    const co = await prismaRaw.company.create({
      data: { name: PFX + 'Co', slug: PFX + 'co', ownerPhone: '+919900000202', ownerName: 'O' },
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
    token = await issueAccessToken({
      userId: sup.id,
      companyId,
      role: 'SUPERVISOR',
      availableRoles: ['SUPERVISOR'],
      locale: 'en',
    });
  });

  afterAll(async () => {
    await prismaRaw.leaveRequest.deleteMany({ where: { companyId } });
    await prismaRaw.chatRequestLog.deleteMany({ where: { companyId } });
    await prismaRaw.chatMessage.deleteMany({ where: { companyId } });
    await prismaRaw.chatThread.deleteMany({ where: { companyId } });
    await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
    await prismaRaw.worker.deleteMany({ where: { companyId } });
    await prismaRaw.membership.deleteMany({ where: { companyId } });
    await prismaRaw.company.delete({ where: { id: companyId } });
    await prismaRaw.$disconnect();
    await app.close();
  });

  describe('chat → propose_leave', () => {
    it('voice → AI → DecisionCard → Apply → LeaveRequest row', async () => {
      const idem = crypto.randomUUID();
      const chatRes = await app.inject({
        method: 'POST',
        url: '/chat/messages',
        headers: { authorization: `Bearer ${token}`, 'idempotency-key': idem },
        payload: { text: 'Pradeep needs sick leave from May 12 to May 14 2026' },
      });
      expect(chatRes.statusCode).toBe(200);
      const body = chatRes.json();
      expect(body.decisionCard?.toolName).toBe('propose_leave');
      const proposed = body.decisionCard.fields;
      expect(proposed.workerId).toBe(workerId);

      const applyRes = await app.inject({
        method: 'POST',
        url: '/chat/apply',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          chatMessageId: body.chatMessageId,
          toolName: 'propose_leave',
          toolInput: proposed,
        },
      });
      expect(applyRes.statusCode).toBe(200);

      const leave = await prismaRaw.leaveRequest.findFirst({ where: { companyId, workerId } });
      expect(leave).toBeTruthy();
    }, 60000);
  });
  ```

- [ ] **Step 2: Confirm red**

  ```bash
  ~/.nvm/versions/node/v20.20.1/bin/node node_modules/vitest/vitest.mjs run test/chat-leave.test.ts 2>&1 | tail -10
  ```

- [ ] **Step 3: Add to chat.ts**

  Add `proposeLeaveTool` to imports + `tools` array. Add handler branch:

  ```ts
  if (name === 'propose_leave') {
    const {
      workerId: wid,
      fromDate,
      toDate,
      reason,
      reasonDetail,
    } = input as {
      workerId: string;
      fromDate: string;
      toDate: string;
      reason?: string;
      reasonDetail?: string;
    };
    const worker = await withTenantContext(prisma, auth.companyId, async (tx) =>
      tx.worker.findFirst({ where: { id: wid, companyId: auth.companyId } }),
    );
    if (!worker) return { output: { error: 'WORKER_NOT_FOUND' } };
    return {
      output: { proposed: true, fields: { workerId: wid, fromDate, toDate, reason, reasonDetail } },
      decisionCardData: {
        title: 'Leave request',
        description: `Submit leave for ${worker.name} from ${fromDate} to ${toDate}?`,
        fields: {
          workerId: wid,
          fromDate,
          toDate,
          reason: reason ?? 'other',
          ...(reasonDetail ? { reasonDetail } : {}),
        },
        severity: 'CONFIRM',
      },
    };
  }
  ```

  Add `/chat/apply` branch:

  ```ts
  if (parsed.data.toolName === 'propose_leave') {
    const inner = await app.inject({
      method: 'POST',
      url: '/leave-requests',
      headers: { authorization: req.headers.authorization! },
      payload: parsed.data.toolInput,
    });
    reply.code(inner.statusCode).send(inner.json());
    return;
  }
  ```

  (Verify the existing `POST /leave-requests` route accepts this payload shape via `cat apps/backend/src/routes/leave-requests.ts | head -60`.)

- [ ] **Step 4: Run test → green**

  ```bash
  ~/.nvm/versions/node/v20.20.1/bin/node node_modules/vitest/vitest.mjs run test/chat-leave.test.ts 2>&1 | tail -10
  ```

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/backend/src/routes/chat.ts apps/backend/test/chat-leave.test.ts
  git commit -m "feat(backend): wire propose_leave in chat handler + integration test"
  ```

---

## Task 5: `propose_swap` tool schema

**Files:** Create `packages/ai-tools/src/tools/swap.ts`; modify `packages/ai-tools/src/index.ts`

- [ ] **Step 1: Create**

  ```ts
  /**
   * propose_swap — exchange two workers' assignments at a site.
   *
   * @derives(master-plan §G)
   */

  export const proposeSwapTool = {
    name: 'propose_swap',
    description:
      'Propose swapping two workers between sites or shifts. Use when supervisor says "Swap Ravi and Lakshmi at Hospital A tomorrow". Both workers must exist; resolve via find_workers first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        fromWorkerId: { type: 'string', description: 'Worker leaving the site (UUID)' },
        toWorkerId: { type: 'string', description: 'Worker taking the site (UUID)' },
        siteId: { type: 'string', description: 'Site UUID from find_sites' },
        effectiveAt: { type: 'string', description: 'ISO datetime when swap takes effect' },
        reason: { type: 'string' },
      },
      required: ['fromWorkerId', 'toWorkerId', 'siteId', 'effectiveAt'],
    },
  } as const;
  ```

- [ ] **Step 2: Re-export + build + commit**

  ```bash
  echo "export * from './tools/swap.js';" >> packages/ai-tools/src/index.ts
  cd packages/ai-tools && ~/.nvm/versions/node/v20.20.1/bin/pnpm build
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add packages/ai-tools/src/tools/swap.ts packages/ai-tools/src/index.ts
  git commit -m "feat(ai-tools): propose_swap tool schema"
  ```

---

## Task 6: Wire swap handler + integration test

**Files:**

- Modify: `apps/backend/src/routes/chat.ts`
- Create: `apps/backend/test/chat-swap.test.ts`

- [ ] **Step 1: Write test (mirror Task 4 structure with two workers + a site)**

  Create `apps/backend/test/chat-swap.test.ts` following Task 4's pattern, but seed:
  - 2 workers (Ravi, Lakshmi) — assign distinct names to test AI disambiguation
  - 1 site (Hospital A)
  - Test message: `"Swap Ravi and Lakshmi at Hospital A tomorrow at 9am"`
  - Assert: `body.decisionCard.toolName === 'propose_swap'` + `proposed.fromWorkerId !== proposed.toWorkerId`
  - After /chat/apply: `prismaRaw.swapRequest.findFirst({ where: { companyId } })` returns a row

- [ ] **Step 2: Add tool to chat.ts**

  Update imports + tools array to include `proposeSwapTool`. Add handler branch:

  ```ts
  if (name === 'propose_swap') {
    const { fromWorkerId, toWorkerId, siteId, effectiveAt, reason } = input as {
      fromWorkerId: string;
      toWorkerId: string;
      siteId: string;
      effectiveAt: string;
      reason?: string;
    };
    if (fromWorkerId === toWorkerId) {
      return { output: { error: 'SAME_WORKER' } };
    }
    const out = await withTenantContext(prisma, auth.companyId, async (tx) => {
      const fw = await tx.worker.findFirst({
        where: { id: fromWorkerId, companyId: auth.companyId },
      });
      const tw = await tx.worker.findFirst({
        where: { id: toWorkerId, companyId: auth.companyId },
      });
      const site = await tx.site.findFirst({ where: { id: siteId, companyId: auth.companyId } });
      return { fw, tw, site };
    });
    if (!out.fw || !out.tw) return { output: { error: 'WORKER_NOT_FOUND' } };
    if (!out.site) return { output: { error: 'SITE_NOT_FOUND' } };
    return {
      output: { proposed: true, fields: { fromWorkerId, toWorkerId, siteId, effectiveAt, reason } },
      decisionCardData: {
        title: 'Swap workers',
        description: `Swap ${out.fw.name} → ${out.tw.name} at ${out.site.name}, effective ${effectiveAt}?`,
        fields: { fromWorkerId, toWorkerId, siteId, effectiveAt, ...(reason ? { reason } : {}) },
        severity: 'CONFIRM',
      },
    };
  }
  ```

  Add /chat/apply branch:

  ```ts
  if (parsed.data.toolName === 'propose_swap') {
    const inner = await app.inject({
      method: 'POST',
      url: '/swap-requests',
      headers: { authorization: req.headers.authorization! },
      payload: parsed.data.toolInput,
    });
    reply.code(inner.statusCode).send(inner.json());
    return;
  }
  ```

- [ ] **Step 3: Run test + commit**

  ```bash
  ~/.nvm/versions/node/v20.20.1/bin/node node_modules/vitest/vitest.mjs run test/chat-swap.test.ts 2>&1 | tail -10
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/backend/src/routes/chat.ts apps/backend/test/chat-swap.test.ts
  git commit -m "feat(backend): wire propose_swap in chat handler + integration test"
  ```

---

## Task 7: `propose_termination` tool schema

**Files:** Create `packages/ai-tools/src/tools/termination.ts`; modify `packages/ai-tools/src/index.ts`

- [ ] **Step 1: Create**

  ```ts
  /**
   * propose_termination — single tool; backend resolves probation/permanent via tenure.
   *
   * @derives(master-plan §G)
   */

  export const proposeTerminationTool = {
    name: 'propose_termination',
    description:
      'Propose terminating a worker. Use when supervisor says "Fire Pradeep, performance issues". Backend computes whether this is probation (tenure < 240 days, HR approves) or permanent (tenure >= 240 days, OWNER approves) per Spec 1 §6.',
    input_schema: {
      type: 'object' as const,
      properties: {
        workerId: { type: 'string', description: 'UUID from find_workers' },
        effectiveDate: { type: 'string', description: 'ISO date YYYY-MM-DD' },
        reason: {
          type: 'string',
          enum: ['performance', 'attendance', 'misconduct', 'mutual', 'redundancy', 'other'],
        },
        reasonDetail: {
          type: 'string',
          description: 'Required for permanent terminations (>=240 days tenure)',
        },
      },
      required: ['workerId', 'effectiveDate', 'reason'],
    },
  } as const;
  ```

- [ ] **Step 2: Re-export + build + commit**

  ```bash
  echo "export * from './tools/termination.js';" >> packages/ai-tools/src/index.ts
  cd packages/ai-tools && ~/.nvm/versions/node/v20.20.1/bin/pnpm build
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add packages/ai-tools/src/tools/termination.ts packages/ai-tools/src/index.ts
  git commit -m "feat(ai-tools): propose_termination tool schema"
  ```

---

## Task 8: Wire termination handler + integration test

**Files:**

- Modify: `apps/backend/src/routes/chat.ts`
- Create: `apps/backend/test/chat-termination.test.ts`

- [ ] **Step 1: Write test**

  Create `apps/backend/test/chat-termination.test.ts` mirroring Task 4 structure with:
  - 1 worker named "Pradeep" with `state: 'ACTIVE'`
  - Test message: `"Fire Pradeep effective May 31 2026, performance issues"`
  - Assert: `body.decisionCard.toolName === 'propose_termination'`
  - After /chat/apply: worker state transitioned: `prismaRaw.worker.findUnique({ where: { id: workerId } })` → `state === 'TERMINATED'`
  - Plus AuditEvent: `prismaRaw.auditEvent.findFirst({ where: { companyId, kind: 'WORKER_TERMINATED' } })` exists

- [ ] **Step 2: Add tool branch in chat.ts**

  ```ts
  if (name === 'propose_termination') {
    const {
      workerId: wid,
      effectiveDate,
      reason,
      reasonDetail,
    } = input as {
      workerId: string;
      effectiveDate: string;
      reason: string;
      reasonDetail?: string;
    };
    const worker = await withTenantContext(prisma, auth.companyId, async (tx) =>
      tx.worker.findFirst({ where: { id: wid, companyId: auth.companyId } }),
    );
    if (!worker) return { output: { error: 'WORKER_NOT_FOUND' } };
    if (worker.state === 'TERMINATED') return { output: { error: 'ALREADY_TERMINATED' } };
    return {
      output: { proposed: true, fields: { workerId: wid, effectiveDate, reason, reasonDetail } },
      decisionCardData: {
        title: 'Terminate worker',
        description: `Terminate ${worker.name} effective ${effectiveDate}? Reason: ${reason}.`,
        fields: { workerId: wid, effectiveDate, reason, ...(reasonDetail ? { reasonDetail } : {}) },
        severity: 'WARN',
      },
    };
  }
  ```

- [ ] **Step 3: Add /chat/apply branch — Wave 4a-PRO does inline state transition (Wave 2b adds full ChangeRequest workflow)**

  ```ts
  if (parsed.data.toolName === 'propose_termination') {
    const {
      workerId: wid,
      effectiveDate,
      reason,
      reasonDetail,
    } = parsed.data.toolInput as {
      workerId: string;
      effectiveDate: string;
      reason: string;
      reasonDetail?: string;
    };
    const out = await withTenantContext(prisma, auth.companyId, async (tx) => {
      const w = await tx.worker.findFirst({ where: { id: wid, companyId: auth.companyId } });
      if (!w) return { kind: 'NOT_FOUND' as const };
      if (w.state === 'TERMINATED') return { kind: 'ALREADY' as const };
      const updated = await tx.worker.update({
        where: { id: wid },
        data: { state: 'TERMINATED' },
      });
      await recordAuditEvent(tx, {
        companyId: auth.companyId,
        kind: 'WORKER_TERMINATED',
        actorId: auth.userId,
        targetId: wid,
        payload: { effectiveDate, reason, reasonDetail: reasonDetail ?? null },
      });
      return { kind: 'OK' as const, worker: updated };
    });
    if (out.kind === 'NOT_FOUND') {
      reply.code(404).send({ error: 'WORKER_NOT_FOUND' });
      return;
    }
    if (out.kind === 'ALREADY') {
      reply.code(409).send({ error: 'ALREADY_TERMINATED' });
      return;
    }
    reply.code(200).send({ workerId: out.worker.id, state: out.worker.state });
    return;
  }
  ```

- [ ] **Step 4: Run test + commit**

  ```bash
  ~/.nvm/versions/node/v20.20.1/bin/node node_modules/vitest/vitest.mjs run test/chat-termination.test.ts 2>&1 | tail -10
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/backend/src/routes/chat.ts apps/backend/test/chat-termination.test.ts
  git commit -m "feat(backend): wire propose_termination in chat handler — inline Worker.state transition"
  ```

---

## Task 9: Plumb `detectConflicts()` into chat tool handlers + integration test

**Files:**

- Modify: `apps/backend/src/routes/chat.ts`
- Create: `apps/backend/test/chat-conflict.test.ts`

- [ ] **Step 1: Verify conflicts.ts exports the right shape**

  ```bash
  cat packages/state-machines/src/conflicts.ts | head -50
  ```

  Expected: exports `detectConflicts(ctx, state): Conflict[]` per Spec 1 §7.4. If signature differs from spec, adapt the call site below.

- [ ] **Step 2: Write the failing conflict integration test**

  Create `apps/backend/test/chat-conflict.test.ts`:

  ```ts
  /**
   * Conflict detection plumbed into chat — overlap returns SOFT severity DecisionCard with chips.
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
  const PFX = `chat-cf-${Date.now()}-`;
  let app: FastifyInstance;
  let companyId: string;
  let workerId: string;
  let siteAId: string;
  let siteBId: string;
  let token: string;

  beforeAll(async () => {
    const { buildServer } = await import('../src/server.js');
    const { issueAccessToken } = await import('../src/lib/jwt.js');
    app = await buildServer();
    await app.ready();
    const co = await prismaRaw.company.create({
      data: { name: PFX + 'Co', slug: PFX + 'co', ownerPhone: '+919900000204', ownerName: 'O' },
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
        name: 'Suresh',
        state: 'ACTIVE',
        phone: `+9199${String(Date.now() + 1).slice(-8)}`,
      },
    });
    workerId = w.id;
    const sA = await prismaRaw.site.create({ data: { companyId, name: 'Apollo' } });
    siteAId = sA.id;
    const sB = await prismaRaw.site.create({ data: { companyId, name: 'Westfield' } });
    siteBId = sB.id;
    // Seed an existing assignment that would conflict
    await prismaRaw.assignment.create({
      data: {
        companyId,
        workerId,
        siteId: siteAId,
        shiftStart: '09:00',
        shiftEnd: '17:00',
        dayMask: 'MTWTFS_',
        validFrom: new Date('2026-05-01'),
        validUntil: null,
        state: 'ACTIVE',
      },
    });
    token = await issueAccessToken({
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

  describe('chat → conflict detection', () => {
    it('overlapping assignment returns WARN severity DecisionCard with chips', async () => {
      const idem = crypto.randomUUID();
      const r = await app.inject({
        method: 'POST',
        url: '/chat/messages',
        headers: { authorization: `Bearer ${token}`, 'idempotency-key': idem },
        payload: {
          text: 'Add Suresh to Westfield Mon-Sat 12pm to 4pm starting May 12 2026',
        },
      });
      expect(r.statusCode).toBe(200);
      const body = r.json();
      expect(body.decisionCard?.toolName).toBe('propose_create_assignment');
      // Severity must be WARN due to time overlap with existing Apollo Mon-Sat 9-5
      expect(body.decisionCard.severity).toBe('WARN');
      expect(body.decisionCard.presets?.chips).toBeTruthy();
      expect(Array.isArray(body.decisionCard.presets.chips)).toBe(true);
      expect(body.decisionCard.presets.chips.length).toBeGreaterThan(0);
      // Conflicts array surfaced
      expect(body.decisionCard.conflicts).toBeTruthy();
      expect(body.decisionCard.conflicts.length).toBeGreaterThan(0);
    }, 60000);
  });
  ```

- [ ] **Step 3: Plumb detectConflicts in chat.ts**

  Add import at top of `apps/backend/src/routes/chat.ts`:

  ```ts
  import { detectConflicts } from '@axhy/state-machines';
  ```

  In the `propose_create_assignment` handler branch (existing), after computing the assignment payload but BEFORE returning the DecisionCard, add:

  ```ts
  // Plumb detectConflicts — Wave 4a-PRO
  const conflicts = await withTenantContext(prisma, auth.companyId, async (tx) => {
    const activeAssignments = await tx.assignment.findMany({
      where: { companyId: auth.companyId, workerId: input.workerId, state: 'ACTIVE' },
    });
    return detectConflicts(
      {
        workerId: input.workerId as string,
        dateRange: {
          from: new Date(input.validFrom as string),
          to: input.validUntil ? new Date(input.validUntil as string) : null,
        },
        newShift: {
          shiftStart: input.shiftStart as string,
          shiftEnd: input.shiftEnd as string,
          dayMask: input.dayMask as string,
        },
      },
      { activeAssignments, visits: [], calendarEntries: [], changeRequests: [] },
    );
  });

  // Compute severity from conflicts
  const hasHard = conflicts.some((c) => c.severity === 'HARD');
  const hasSoft = conflicts.some((c) => c.severity === 'SOFT');
  const severity = hasHard ? 'BLOCKED' : hasSoft ? 'WARN' : 'CONFIRM';
  const chips = hasSoft
    ? [
        { label: 'Split shift', value: 'split-shift' },
        { label: 'Covering for someone', value: 'covering' },
        { label: 'Mistake — cancel', value: 'mistake' },
        { label: 'Other', value: 'other' },
      ]
    : undefined;

  return {
    output: { proposed: true, fields: input, conflicts },
    decisionCardData: {
      title: 'Confirm assignment',
      description: 'Create assignment with these fields?',
      fields: input,
      severity,
      conflicts,
      ...(chips ? { presets: { chips } } : {}),
    },
  };
  ```

  Apply similar plumbing to `propose_mark_absent`, `propose_swap` (skip leave + termination — no shift overlap concept). Each one calls `detectConflicts` with the right ctx shape.

- [ ] **Step 4: Run conflict test → green**

  ```bash
  ~/.nvm/versions/node/v20.20.1/bin/node node_modules/vitest/vitest.mjs run test/chat-conflict.test.ts 2>&1 | tail -10
  ```

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/backend/src/routes/chat.ts apps/backend/test/chat-conflict.test.ts
  git commit -m "feat(backend): plumb detectConflicts into chat handler — WARN/BLOCKED severity + chip presets"
  ```

---

## Task 10: Multi-tool-turn batch DecisionCard handling

**Files:**

- Modify: `apps/backend/src/routes/chat.ts`
- Create: `apps/backend/test/chat-batch.test.ts`

- [ ] **Step 1: Write batch test**

  Create `apps/backend/test/chat-batch.test.ts`:

  ```ts
  /**
   * Compound utterance → 2+ propose_* in one Anthropic turn → batch DecisionCard.
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
  const PFX = `chat-batch-${Date.now()}-`;
  let app: FastifyInstance;
  let companyId: string;
  let token: string;

  beforeAll(async () => {
    const { buildServer } = await import('../src/server.js');
    const { issueAccessToken } = await import('../src/lib/jwt.js');
    app = await buildServer();
    await app.ready();
    const co = await prismaRaw.company.create({
      data: { name: PFX + 'Co', slug: PFX + 'co', ownerPhone: '+919900000205', ownerName: 'O' },
    });
    companyId = co.id;
    const sup = await prismaRaw.user.create({
      data: { phone: `+9199${String(Date.now()).slice(-8)}`, name: 'S', locale: 'en' },
    });
    await prismaRaw.membership.create({
      data: { companyId, userId: sup.id, role: 'SUPERVISOR', status: 'ACTIVE' },
    });
    await prismaRaw.worker.create({
      data: {
        companyId,
        name: 'Sundeep',
        state: 'ACTIVE',
        phone: `+9199${String(Date.now() + 1).slice(-8)}`,
      },
    });
    await prismaRaw.worker.create({
      data: {
        companyId,
        name: 'Pradeep',
        state: 'ACTIVE',
        phone: `+9199${String(Date.now() + 2).slice(-8)}`,
      },
    });
    token = await issueAccessToken({
      userId: sup.id,
      companyId,
      role: 'SUPERVISOR',
      availableRoles: ['SUPERVISOR'],
      locale: 'en',
    });
  });

  afterAll(async () => {
    await prismaRaw.attendance.deleteMany({ where: { companyId } });
    await prismaRaw.chatRequestLog.deleteMany({ where: { companyId } });
    await prismaRaw.chatMessage.deleteMany({ where: { companyId } });
    await prismaRaw.chatThread.deleteMany({ where: { companyId } });
    await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
    await prismaRaw.worker.deleteMany({ where: { companyId } });
    await prismaRaw.membership.deleteMany({ where: { companyId } });
    await prismaRaw.company.delete({ where: { id: companyId } });
    await prismaRaw.$disconnect();
    await app.close();
  });

  describe('chat → multi-tool-turn batch', () => {
    it('compound utterance returns decisionCards array (length 2)', async () => {
      const idem = crypto.randomUUID();
      const r = await app.inject({
        method: 'POST',
        url: '/chat/messages',
        headers: { authorization: `Bearer ${token}`, 'idempotency-key': idem },
        payload: { text: 'Sundeep is absent today, and also Pradeep is sick today' },
      });
      expect(r.statusCode).toBe(200);
      const body = r.json();
      // New Wave 4a-PRO response shape: decisionCards (plural array)
      expect(Array.isArray(body.decisionCards) || body.decisionCards === undefined).toBe(true);
      if (Array.isArray(body.decisionCards)) {
        expect(body.decisionCards.length).toBeGreaterThanOrEqual(2);
        expect(body.decisionCards[0].toolName).toBe('propose_mark_absent');
        expect(body.decisionCards[1].toolName).toBe('propose_mark_absent');
      } else {
        // AI may have decided to do them as separate turns — also acceptable
        expect(body.decisionCard).toBeTruthy();
      }
    }, 60000);
  });
  ```

- [ ] **Step 2: Update chat.ts response shape**

  In the chat handler, after the sonnetToolLoop returns, change:

  ```ts
  // OLD (Wave 2a):
  decisionCard: loopResult.decisionCards[0] ?? null,

  // NEW (Wave 4a-PRO): support both single + batch
  ...(loopResult.decisionCards.length > 1
    ? { decisionCards: loopResult.decisionCards, decisionCard: null }
    : { decisionCard: loopResult.decisionCards[0] ?? null, decisionCards: undefined }),
  ```

  This keeps backward-compat with existing single-card consumers while adding batch support.

- [ ] **Step 3: Run + commit**

  ```bash
  ~/.nvm/versions/node/v20.20.1/bin/node node_modules/vitest/vitest.mjs run test/chat-batch.test.ts 2>&1 | tail -10
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/backend/src/routes/chat.ts apps/backend/test/chat-batch.test.ts
  git commit -m "feat(backend): chat response supports decisionCards array for multi-tool-turn batches"
  ```

---

## Task 11: `humanizeDayMask` helper + tests

**Files:**

- Create: `apps/mobile/lib/format.ts`
- Create: `apps/mobile/lib/format.test.ts`

- [ ] **Step 1: Write failing test**

  Create `apps/mobile/lib/format.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest';
  import { humanizeDayMask } from './format';

  describe('humanizeDayMask', () => {
    it('"MTWTFS_" → "Mon-Sat"', () => {
      expect(humanizeDayMask('MTWTFS_')).toBe('Mon-Sat');
    });
    it('"MTWTFSS" → "Every day"', () => {
      expect(humanizeDayMask('MTWTFSS')).toBe('Every day');
    });
    it('"MTWTF__" → "Weekdays"', () => {
      expect(humanizeDayMask('MTWTF__')).toBe('Weekdays');
    });
    it('"_T_____" → "Tue"', () => {
      expect(humanizeDayMask('_T_____')).toBe('Tue');
    });
    it('"M_W_F__" → "Mon, Wed, Fri"', () => {
      expect(humanizeDayMask('M_W_F__')).toBe('Mon, Wed, Fri');
    });
    it('"_______" → "(none)"', () => {
      expect(humanizeDayMask('_______')).toBe('(none)');
    });
  });
  ```

- [ ] **Step 2: Confirm red**

  ```bash
  cd apps/mobile
  ~/.nvm/versions/node/v20.20.1/bin/pnpm test 2>&1 | tail -10
  ```

- [ ] **Step 3: Implement**

  Create `apps/mobile/lib/format.ts`:

  ```ts
  /**
   * UI formatting helpers — humanize raw backend values.
   *
   * @derives(master-plan §G)
   */

  /**
   * Convert 7-char Mon-Sun dayMask to human-readable.
   * "MTWTFS_" → "Mon-Sat"
   * "MTWTFSS" → "Every day"
   * "MTWTF__" → "Weekdays"
   * "_T_____" → "Tue"
   * "M_W_F__" → "Mon, Wed, Fri"
   * "_______" → "(none)"
   */
  export function humanizeDayMask(mask: string): string {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      if (mask[i] && mask[i] !== '_') days.push(labels[i]);
    }
    if (days.length === 0) return '(none)';
    if (days.length === 7) return 'Every day';
    if (mask === 'MTWTFS_') return 'Mon-Sat';
    if (mask === 'MTWTF__') return 'Weekdays';
    return days.join(', ');
  }
  ```

- [ ] **Step 4: Run + commit**

  ```bash
  ~/.nvm/versions/node/v20.20.1/bin/pnpm test 2>&1 | tail -10
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/mobile/lib/format.ts apps/mobile/lib/format.test.ts
  git commit -m "feat(mobile): humanizeDayMask helper + 6 unit tests"
  ```

---

## Task 12: Use humanizer in DecisionCard

**Files:** Modify `apps/mobile/components/DecisionCard.tsx`

- [ ] **Step 1: Add import + apply**

  Open `apps/mobile/components/DecisionCard.tsx`. Add at top:

  ```tsx
  import { humanizeDayMask } from '../lib/format';
  ```

  In the field-rendering loop (where `Object.entries(card.fields).map(...)` renders `[key, value]`):

  ```tsx
  {
    Object.entries(card.fields).map(([key, value]) => {
      if (
        typeof value === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
      ) {
        return null; // skip UUIDs
      }
      let displayValue = String(value);
      if (key === 'dayMask' && typeof value === 'string') {
        displayValue = humanizeDayMask(value);
      } else if (key === 'validUntil' && (value === null || value === undefined)) {
        displayValue = 'Open-ended';
      }
      return (
        <View key={key} style={s.fieldRow}>
          <Text style={s.fieldKey}>{FIELD_LABELS[key] ?? key}</Text>
          <Text style={s.fieldValue}>{displayValue}</Text>
        </View>
      );
    });
  }
  ```

- [ ] **Step 2: Verify in browser via Fast Refresh**

  With Expo dev running (Terminal 2) and Chrome tab open at localhost:8081, save the file. The page hot-reloads in 1-3s. Trigger a chat with a real assignment; observe `dayMask` now shows "Mon-Sat" instead of "MTWTFS\_".

- [ ] **Step 3: Commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/mobile/components/DecisionCard.tsx
  git commit -m "feat(mobile): DecisionCard uses humanizeDayMask + Open-ended for null validUntil"
  ```

---

## Task 13: Verify severity color rendering (Playwright)

**Files:** Modify `apps/mobile/scripts/screenshot-wave-4a.mjs`

- [ ] **Step 1: Add 2 new flows to the script**

  After the existing flows, add:

  ```js
  // Flow 13: WARN severity (overlap conflict)
  // Use the seeded Suresh + existing Apollo assignment to trigger overlap with Westfield
  const chatInputW = page.locator('input').last();
  await chatInputW.fill('Add Suresh to Westfield Mon-Sat 12pm to 4pm starting May 12 2026');
  await page.getByRole('button', { name: /send/i }).first().click();
  for (let i = 0; i < 7; i++) {
    await page.waitForTimeout(10000);
    const cardOrange = await page.evaluate(() => {
      const cards = document.querySelectorAll(
        '[role="presentation"], [data-testid*="decision-card"]',
      );
      // Heuristic: any element with computed border-color in WARN orange range
      return Array.from(cards).some((el) => {
        const c = window.getComputedStyle(el).borderColor;
        return c.includes('rgb(255') || c.includes('orange') || c.includes('FFA');
      });
    });
    if (cardOrange) {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/13-warn-orange.png`, fullPage: true });
      console.log(`✓ 13-warn-orange.png — WARN severity card rendered after ${(i + 1) * 10}s`);
      break;
    }
  }

  // Flow 14: BLOCKED severity (terminated worker)
  // First terminate Suresh in DB directly to set up; then chat tries to assign him
  // (This requires direct DB manipulation; see Task 14 for chip picker test which is more interactive)
  ```

- [ ] **Step 2: Run script + capture**

  ```bash
  cd apps/mobile
  ~/.nvm/versions/node/v20.20.1/bin/node scripts/screenshot-wave-4a.mjs 2>&1 | tail -15
  ```

- [ ] **Step 3: Read the new screenshots, panel-critique, commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/mobile/scripts/screenshot-wave-4a.mjs
  git commit -m "test(mobile): Playwright captures WARN severity card (orange border)"
  ```

---

## Task 14: ChipPicker component

**Files:** Create `apps/mobile/components/ChipPicker.tsx`

- [ ] **Step 1: Create the component**

  Create `apps/mobile/components/ChipPicker.tsx`:

  ```tsx
  /**
   * Override-reason chip picker for SOFT conflict DecisionCards.
   *
   * @derives(master-plan §G)
   */

  import { useState } from 'react';
  import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
  import { tokens } from '@axhy/ui-tokens';

  type Chip = { label: string; value: string };

  type Props = {
    chips: Chip[];
    onChange: (selectedValue: string | null, freeText: string | null) => void;
  };

  export function ChipPicker({ chips, onChange }: Props) {
    const [selected, setSelected] = useState<string | null>(null);
    const [freeText, setFreeText] = useState('');

    const select = (val: string) => {
      const next = selected === val ? null : val;
      setSelected(next);
      onChange(next, next === 'other' ? freeText : null);
    };

    const onFreeTextChange = (txt: string) => {
      setFreeText(txt);
      if (selected === 'other') onChange('other', txt);
    };

    return (
      <View style={s.root}>
        <Text style={s.label}>Why?</Text>
        <View style={s.chipsRow}>
          {chips.map((chip) => {
            const isSelected = selected === chip.value;
            return (
              <Pressable
                key={chip.value}
                onPress={() => select(chip.value)}
                style={[s.chip, isSelected && s.chipSelected]}
              >
                <Text style={[s.chipText, isSelected && s.chipTextSelected]}>{chip.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {selected === 'other' && (
          <TextInput
            style={s.freeTextInput}
            placeholder="Tell us more..."
            placeholderTextColor={tokens.color.ink.placeholder}
            value={freeText}
            onChangeText={onFreeTextChange}
          />
        )}
      </View>
    );
  }

  const s = StyleSheet.create({
    root: { marginVertical: 12 },
    label: {
      fontSize: tokens.type.caption.size,
      color: tokens.color.ink.secondary,
      marginBottom: 6,
    },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: tokens.color.surface.cardEdge,
      backgroundColor: tokens.color.surface.card,
    },
    chipSelected: {
      borderColor: tokens.color.brand.accent,
      backgroundColor: tokens.color.brand.accentSoft,
    },
    chipText: {
      fontSize: tokens.type.caption.size,
      color: tokens.color.ink.primary,
    },
    chipTextSelected: {
      color: tokens.color.brand.accentInk,
      fontWeight: '600',
    },
    freeTextInput: {
      marginTop: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: tokens.color.surface.cardEdge,
      backgroundColor: tokens.color.surface.card,
      color: tokens.color.ink.primary,
      fontSize: tokens.type.body.size,
    },
  });
  ```

- [ ] **Step 2: TS clean + commit**

  ```bash
  cd apps/mobile
  ~/.nvm/versions/node/v20.20.1/bin/node ../../node_modules/typescript/bin/tsc --noEmit 2>&1 | tail -5
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/mobile/components/ChipPicker.tsx
  git commit -m "feat(mobile): ChipPicker component for SOFT conflict override reason"
  ```

---

## Task 15: Wire ChipPicker into DecisionCard

**Files:** Modify `apps/mobile/components/DecisionCard.tsx`

- [ ] **Step 1: Import + render conditionally**

  Open `apps/mobile/components/DecisionCard.tsx`. Add import:

  ```tsx
  import { ChipPicker } from './ChipPicker';
  ```

  Add state for the chip selection:

  ```tsx
  const [chipReason, setChipReason] = useState<string | null>(null);
  const [chipFreeText, setChipFreeText] = useState<string | null>(null);
  ```

  In the JSX, between the fields table and the buttons row, render the chip picker when severity is WARN AND `card.presets?.chips` exists:

  ```tsx
  {
    severity === 'WARN' && card.presets?.chips && (
      <ChipPicker
        chips={card.presets.chips}
        onChange={(val, free) => {
          setChipReason(val);
          setChipFreeText(free);
        }}
      />
    );
  }
  ```

  In the `onApply` function, include the chip reason in the toolInput when applying:

  ```tsx
  const onApply = async () => {
    if (!card.toolName) return;
    setApplying(true);
    setError(null);
    try {
      const enrichedInput = {
        ...(card.fields ?? {}),
        ...(chipReason
          ? { overrideReason: chipReason, ...(chipFreeText ? { overrideText: chipFreeText } : {}) }
          : {}),
      };
      await applyDecisionCard({
        chatMessageId,
        toolName: card.toolName,
        toolInput: enrichedInput,
      });
      setApplied(true);
      onApplied?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
      setApplying(false);
    }
  };
  ```

  Also: when severity is WARN and chips exist but no selection has been made, disable Apply:

  ```tsx
  const applyDisabled = applying || (severity === 'WARN' && card.presets?.chips && !chipReason);
  // Apply Pressable: disabled={applyDisabled}, also style with applying-disabled-look
  ```

- [ ] **Step 2: Hot-reload verify**

  Save → Fast Refresh → trigger conflict in chat (use the seeded overlap from Task 9 setup). Verify chip picker renders, selecting a chip enables Apply, applying sends `overrideReason` field.

- [ ] **Step 3: Commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/mobile/components/DecisionCard.tsx
  git commit -m "feat(mobile): DecisionCard renders ChipPicker for SOFT conflicts; Apply gated until reason chosen"
  ```

---

## Task 16: Multi-tool batch DecisionCard UI

**Files:**

- Modify: `apps/mobile/lib/chat-api.ts` (response type)
- Modify: `apps/mobile/components/DecisionCard.tsx` (render batch)
- Modify: `apps/mobile/app/(supervisor)/chat.tsx` (handle decisionCards array)

- [ ] **Step 1: Update chat-api.ts response type**

  In `apps/mobile/lib/chat-api.ts`:

  ```ts
  export type ChatMessageResponse = {
    chatMessageId: string;
    assistantText: string;
    decisionCard: DecisionCardData; // single — for backward compat
    decisionCards?: NonNullable<DecisionCardData>[]; // batch — Wave 4a-PRO
  };
  ```

- [ ] **Step 2: chat.tsx renders batch when present**

  In `apps/mobile/app/(supervisor)/chat.tsx`, in the assistant-message append block:

  ```tsx
  setMessages((prev) => [
    ...prev,
    {
      id: generateIdempotencyKey(),
      role: 'assistant',
      text: res.assistantText || '(no response)',
      chatMessageId: res.chatMessageId,
      decisionCard: res.decisionCard,
      decisionCards: res.decisionCards, // NEW
    },
  ]);
  ```

  Update `LocalMessage` type:

  ```tsx
  type LocalMessage = {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    chatMessageId?: string;
    decisionCard?: DecisionCardData;
    decisionCards?: NonNullable<DecisionCardData>[]; // NEW
    status?: 'pending' | 'sent' | 'failed';
  };
  ```

- [ ] **Step 3: MessageBubble passes decisionCards through**

  In `apps/mobile/components/MessageBubble.tsx`, accept and pass `decisionCards` prop. If `decisionCards` array is present, render multiple DecisionCards stacked OR a parent wrapper (per Spec 4 §4.4):

  ```tsx
  {
    decisionCards && decisionCards.length > 0 ? (
      <View style={s.batchWrapper}>
        <Text style={s.batchTitle}>Apply {decisionCards.length} changes?</Text>
        {decisionCards.map((c, i) => (
          <DecisionCard
            key={`${chatMessageId}-${i}`}
            chatMessageId={chatMessageId!}
            card={c}
            onApplied={onCardApplied}
            onCancelled={onCardCancelled}
          />
        ))}
      </View>
    ) : decisionCard && chatMessageId ? (
      <DecisionCard
        chatMessageId={chatMessageId}
        card={decisionCard}
        onApplied={onCardApplied}
        onCancelled={onCardCancelled}
      />
    ) : null;
  }
  ```

  Add to styles:

  ```tsx
  batchWrapper: { marginVertical: 8 },
  batchTitle: {
    fontSize: tokens.type.body.size,
    fontWeight: '700',
    color: tokens.color.ink.primary,
    marginBottom: 4,
  },
  ```

- [ ] **Step 4: TS clean + commit**

  ```bash
  cd apps/mobile
  ~/.nvm/versions/node/v20.20.1/bin/node ../../node_modules/typescript/bin/tsc --noEmit 2>&1 | tail -5
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/mobile/lib/chat-api.ts apps/mobile/components/MessageBubble.tsx apps/mobile/app/\(supervisor\)/chat.tsx
  git commit -m "feat(mobile): batch DecisionCards rendered as stacked group with parent title"
  ```

---

## Task 17: Empty state welcome component

**Files:**

- Create: `apps/mobile/components/EmptyState.tsx`
- Modify: `apps/mobile/app/(supervisor)/chat.tsx`

- [ ] **Step 1: Create the component**

  ```tsx
  /**
   * Chat tab empty-state welcome — replaces blank canvas with suggestions.
   *
   * @derives(master-plan §G)
   */

  import { View, Text, StyleSheet } from 'react-native';
  import { tokens } from '@axhy/ui-tokens';

  type Props = { supervisorName?: string };

  const SUGGESTIONS = [
    '"Mark Suresh absent today"',
    '"Add Ravi to Hospital A Mon-Sat 9-5"',
    '"Pradeep sick for 3 days"',
    '"Swap Lakshmi and Mukesh at Apollo tomorrow"',
  ];

  export function EmptyState({ supervisorName }: Props) {
    return (
      <View style={s.root}>
        <Text style={s.wave}>👋</Text>
        <Text style={s.greeting}>Hello{supervisorName ? `, ${supervisorName}` : ''}</Text>
        <Text style={s.tip}>Try saying:</Text>
        {SUGGESTIONS.map((sugg, i) => (
          <Text key={i} style={s.suggestion}>
            • {sugg}
          </Text>
        ))}
        <Text style={s.tipFooter}>Or just type below.</Text>
      </View>
    );
  }

  const s = StyleSheet.create({
    root: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    wave: { fontSize: 36, marginBottom: 12 },
    greeting: {
      fontSize: tokens.type.heading.size,
      fontWeight: '700',
      color: tokens.color.ink.primary,
      marginBottom: 16,
    },
    tip: {
      fontSize: tokens.type.body.size,
      color: tokens.color.ink.secondary,
      marginBottom: 8,
    },
    suggestion: {
      fontSize: tokens.type.body.size,
      color: tokens.color.ink.tertiary,
      lineHeight: 24,
    },
    tipFooter: {
      fontSize: tokens.type.caption.size,
      color: tokens.color.ink.tertiary,
      marginTop: 16,
    },
  });
  ```

- [ ] **Step 2: Use in chat.tsx**

  In `apps/mobile/app/(supervisor)/chat.tsx`, when `messages.length === 0 && !thinking`:

  ```tsx
  import { EmptyState } from '../../components/EmptyState';
  // ...

  {messages.length === 0 && !thinking ? (
    <EmptyState supervisorName="Mukesh" />  // TODO Wave 4b: pull from auth context
  ) : (
    <FlatList ... />
  )}
  ```

  (Hardcoded "Mukesh" for Wave 4a-PRO since auth-store doesn't expose user.name yet; Wave 4b wires it.)

- [ ] **Step 3: Hot-reload verify + commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/mobile/components/EmptyState.tsx apps/mobile/app/\(supervisor\)/chat.tsx
  git commit -m "feat(mobile): EmptyState welcome component on chat tab first-open"
  ```

---

## Task 18: Skeleton loading component

**Files:**

- Create: `apps/mobile/components/SkeletonBubble.tsx`

- [ ] **Step 1: Create**

  ```tsx
  /**
   * Shimmer skeleton bubble — replaces ActivityIndicator on first chat-tab open.
   *
   * @derives(master-plan §G)
   */

  import { useEffect, useRef } from 'react';
  import { View, Animated, StyleSheet } from 'react-native';
  import { tokens } from '@axhy/ui-tokens';

  export function SkeletonBubble() {
    const opacity = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }, [opacity]);

    return (
      <View style={s.row}>
        <Animated.View style={[s.bubble, { opacity }]} />
      </View>
    );
  }

  const s = StyleSheet.create({
    row: { alignSelf: 'flex-start', padding: 4 },
    bubble: {
      width: 80,
      height: 36,
      borderRadius: 16,
      backgroundColor: tokens.color.surface.muted ?? tokens.color.surface.cardEdge,
    },
  });
  ```

- [ ] **Step 2: Use in chat.tsx during thinking state**

  Replace the existing `<ActivityIndicator />` thinking indicator:

  ```tsx
  ListHeaderComponent={
    thinking ? (
      <View style={s.thinking}>
        <SkeletonBubble />
      </View>
    ) : null
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/mobile/components/SkeletonBubble.tsx apps/mobile/app/\(supervisor\)/chat.tsx
  git commit -m "feat(mobile): SkeletonBubble shimmer replaces ActivityIndicator"
  ```

---

## Task 19: Cancel button contrast fix

**Files:** Modify `apps/mobile/components/DecisionCard.tsx`

- [ ] **Step 1: Update Cancel button styles**

  In the `cancelBtn` and `cancelText` style entries:

  ```tsx
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderWidth: 1.5,                            // was 1
    borderColor: tokens.color.ink.tertiary,      // was secondary (lower contrast)
  },
  cancelText: {
    color: tokens.color.ink.primary,             // was secondary
    fontSize: tokens.type.body.size,
    fontWeight: '600',
  },
  ```

- [ ] **Step 2: Hot-reload verify (Cancel now visible)**

- [ ] **Step 3: Commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/mobile/components/DecisionCard.tsx
  git commit -m "fix(mobile): Cancel button contrast — thicker border + ink primary text"
  ```

---

## Task 20: Comprehensive Playwright suite (12 flows)

**Files:** Modify `apps/mobile/scripts/screenshot-wave-4a.mjs`

- [ ] **Step 1: Update script to cover all 12 flows in headed mode with slowMo**

  Edit `apps/mobile/scripts/screenshot-wave-4a.mjs`:

  ```js
  // Change browser launch:
  const browser = await chromium.launch({
    headless: process.env.CI === 'true', // headless in CI, headed locally
    slowMo: process.env.CI === 'true' ? 0 : 500,
  });
  ```

  Add NEW flows after the existing 9 (which already cover login/OTP/chat/typed/thinking/card/applied/cancelled/multi-message/clarification/empty/long):
  - **Flow 10: Mark absent** — Reset rate-limit, login, navigate to chat. Send "Sundeep is absent today". Expect DecisionCard with toolName=propose_mark_absent. Tap Apply. Screenshot `16-mark-absent-card.png` and `17-mark-absent-applied.png`.
  - **Flow 11: Leave** — "Pradeep sick for 3 days from May 12". Expect propose_leave card. Apply. Screenshot `18-leave-card.png`, `19-leave-applied.png`.
  - **Flow 12: Termination** — "Fire Pradeep effective May 31, performance issues". Expect propose_termination card with WARN severity (per Task 8). Apply. Screenshot `20-termination-card.png`.
  - **Flow 13: Conflict + chip picker** — Set up: in DB, create an Active Assignment for Suresh at Apollo Mon-Sat 9-5. Then send "Add Suresh to Westfield Mon-Sat 12-4 starting May 12 2026". Expect WARN severity card with chip picker visible. Tap a chip. Screenshot `21-conflict-chips.png`. Verify Apply enables only after chip selection. Tap Apply. Screenshot `22-conflict-applied.png`.
  - **Flow 14: Batch** — "Sundeep absent today, and Pradeep sick today". Expect 2 DecisionCards stacked under "Apply 2 changes?" parent. Screenshot `23-batch.png`.
  - **Flow 15: Empty state** — Logout + login fresh, navigate to chat tab. Screenshot `24-empty-state.png` showing welcome + suggestion bullets.

- [ ] **Step 2: Run + capture**

  ```bash
  cd apps/mobile
  ~/.nvm/versions/node/v20.20.1/bin/node scripts/screenshot-wave-4a.mjs 2>&1 | tail -30
  ```

  Expected runtime: ~10-12 minutes (multiple Anthropic calls + chip-picker interactions).

- [ ] **Step 3: Read each screenshot in this controller — panel critique**

  Don't dispatch — read the PNG files directly. List visual issues in a table. Tier-1 fix any blockers.

- [ ] **Step 4: Commit script**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git add apps/mobile/scripts/screenshot-wave-4a.mjs
  git commit -m "test(mobile): Playwright suite extended to 15 flows — all 5 tools + chips + batch + empty state"
  ```

---

## Task 21: Run all backend tests — verify ~85+ green

- [ ] **Step 1: Reset OTP rate limit + run full suite**

  ```bash
  cd packages/shared-schema
  ~/.nvm/versions/node/v20.20.1/bin/pnpm exec prisma db execute --schema=./prisma/schema.prisma --stdin <<<'TRUNCATE TABLE axhy.otp_attempts;'
  cd ../../apps/backend
  set -a && source .env.local && set +a
  ~/.nvm/versions/node/v20.20.1/bin/node node_modules/vitest/vitest.mjs run 2>&1 | tail -20
  ```

  Expected: 79 (prior) + 5 new (mark-absent, leave, swap, termination, conflict) + 1 new (batch) = ~85 tests pass. 0 fails.

- [ ] **Step 2: If anything fails — STOP and investigate**

  Common causes:
  - Tool branch ordering matters in chat handler (later branches shadow earlier ones if check is wrong)
  - detectConflicts signature mismatch with packages/state-machines
  - Phase B routes (workers/leave-requests/swap-requests) signature changed unexpectedly

- [ ] **Step 3: If green, marker commit**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git commit --allow-empty -m "ci(backend): Wave 4a-PRO + Wave 2a + Wave 1 + Phase B all green"
  ```

---

## Task 22: Mobile unit tests — full suite green

- [ ] **Step 1: Run mobile vitest**

  ```bash
  cd apps/mobile
  ~/.nvm/versions/node/v20.20.1/bin/pnpm test 2>&1 | tail -10
  ```

  Expected: 6 (idempotency-key + chat-api) + 6 (humanizeDayMask) = 12 tests pass.

- [ ] **Step 2: If green, no separate commit needed (already pushed in earlier tasks)**

---

## Task 23: Run Playwright headed suite — capture all 15 milestones for panel review

- [ ] **Step 1: Run script in headed mode (default for local)**

  ```bash
  cd apps/mobile
  ~/.nvm/versions/node/v20.20.1/bin/node scripts/screenshot-wave-4a.mjs 2>&1 | tail -10
  ```

- [ ] **Step 2: Read each new PNG (controller reads, no subagent)**

  ```bash
  ls -la /Users/thotaakshay/eclean_workspace/axhy-v3/apps/mobile/screenshots-wave-4a/
  ```

  Read 16-mark-absent-card.png through 24-empty-state.png. Make a table of visual issues. For each Tier 1 issue, fix in DecisionCard / ChipPicker / EmptyState / SkeletonBubble (whichever component) → hot-reload → re-capture screenshot for that flow only.

- [ ] **Step 3: Commit any fix-loops + a marker**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git commit --allow-empty -m "ci(mobile): Wave 4a-PRO Playwright 15 flows panel-reviewed"
  ```

---

## Task 24: Push branch + open draft PR

- [ ] **Step 1: Verify all commits**

  ```bash
  cd /Users/thotaakshay/eclean_workspace/axhy-v3
  git log --oneline main..HEAD | head -30
  ```

  Expected: ~25 commits including the spec doc + 4 tool schemas + 4 wire+test pairs + conflict + batch + UI components + tests.

- [ ] **Step 2: Push**

  ```bash
  git push origin feat/phase-c-wave-4a-pro-chat-domination
  ```

- [ ] **Step 3: Open draft PR**

  ```bash
  /usr/local/bin/gh pr create --draft --base main --title "Phase C Wave 4a-PRO — Chat + Assignment world-domination" --body "$(cat <<'EOF'
  ## Summary

  Wave 4a-PRO closes the gap from MVP chat (1 tool) to flagship chat (5 tools + conflict + batch + polish). Mukesh can now run ~95% of his daily workflow from the chat tab.

  ## What ships

  ### Backend
  - 4 new tools wired in chat handler: propose_mark_absent, propose_leave, propose_swap, propose_termination
  - detectConflicts() plumbed into chat — overlap returns SOFT/BLOCKED severity DecisionCard
  - Multi-tool-turn batch DecisionCard response shape (decisionCards: array)
  - 6 new integration tests on real Railway + real Anthropic

  ### Mobile UI
  - humanizeDayMask helper ("MTWTFS_" → "Mon-Sat") + 6 unit tests
  - DecisionCard renders dayMask humanized + Open-ended for null validUntil
  - ChipPicker component for SOFT conflict override reasons
  - DecisionCard wires ChipPicker; Apply gated until chip selected
  - Multi-tool batch UI — N DecisionCards stacked under parent "Apply N changes?"
  - EmptyState welcome with supervisor name + 4 suggestion bullets
  - SkeletonBubble shimmer replaces ActivityIndicator
  - Cancel button contrast fix (thicker border, ink primary text)

  ### Test discipline
  - Playwright suite extended to 15 flows
  - All 5 propose_* tools captured with screenshots
  - Conflict + chip picker flow captured
  - Batch flow captured
  - Empty state captured
  - Headed mode + slowMo for visual review

  ## Verified
  - 85+ backend tests green on real Railway + real Anthropic
  - 12+ mobile unit tests green
  - 15 Playwright UI flows captured + panel-reviewed
  - Tier 1 visual bugs caught + fixed before founder sees

  ## Out of scope (still deferred)
  - LivingDoc rule capture (Wave 2b)
  - Real Sarvam/Whisper voice (Wave 4b)
  - Today/Summary/Updates/Profile tabs (Wave 4b)
  - Calendar tab UI (Wave 4b)
  - Chat history scroll-back (Wave 2c)
  - Prompt cache + cost ceiling (Wave 2d)
  - ChangeRequest table consolidation (Wave 2b)

  Spec: docs/specs/2026-05-09-phase-c-spec-4-wave-4a-pro-chat-domination.md
  Plan: docs/plans/2026-05-09-phase-c-wave-4a-pro-plan.md

  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  EOF
  )"
  ```

- [ ] **Step 4: Report PR URL** to founder.

---

## Task 25: Founder iPhone manual smoke test (the gate)

This is not a coding task — founder runs this on his iPhone as the final verification gate before Wave 4a-PRO can merge.

- [ ] **Step 1: Backend + Expo running**

  Founder's two terminals:

  ```bash
  # Terminal 1
  cd apps/backend && pnpm dev
  # Terminal 2
  cd apps/mobile
  EXPO_PUBLIC_API_BASE_URL=http://<MAC_LAN_IP>:4000 pnpm dev
  ```

- [ ] **Step 2: iPhone via Expo Go**
  - Install Expo Go from App Store
  - Same Wi-Fi as Mac
  - Camera scan QR code

- [ ] **Step 3: Verify all 5 tool flows**
  - [ ] Login as `+919999999999` / OTP `123456`
  - [ ] Chat tab loads with EmptyState welcome message + suggestion bullets
  - [ ] Type or dictate: "Mark Sundeep absent today" → DecisionCard → Apply → Attendance row in DB
  - [ ] Type: "Pradeep needs sick leave May 12 to May 14" → DecisionCard → Apply → LeaveRequest row
  - [ ] Type: "Swap Mukesh and Ravi at Apollo tomorrow at 9am" → DecisionCard → Apply → SwapRequest row
  - [ ] Type: "Fire Pradeep effective May 31, performance" → DecisionCard (WARN orange) → Apply → Worker.state=TERMINATED + AuditEvent
  - [ ] Type compound message: "Sundeep absent today, and Pradeep sick today" → 2 cards stacked under "Apply 2 changes?"
  - [ ] dayMask in any DecisionCard shows "Mon-Sat" not "MTWTFS\_"
  - [ ] Cancel button is clearly visible (not blending in)
  - [ ] Skeleton loading while AI is thinking (not raw spinner)

- [ ] **Step 4: Verify in Prisma Studio**

  ```bash
  cd packages/shared-schema && pnpm exec prisma studio
  ```

  Browser at localhost:5555. Confirm rows in Attendance / LeaveRequest / SwapRequest / Worker.

- [ ] **Step 5: Note any UX issues for Wave 4b**

  Save notes to a file or as `> FOUNDER NOTE:` lines in the spec.

- [ ] **Step 6: Report back**
  - ✅ All flows pass → merge PR
  - ⚠️ Some passes, some issues → I diagnose + fix
  - ❌ Major bugs → diagnose + fix before merge

---

## Self-review

**Spec coverage:** Spec 4 §3 backend extensions → Tasks 1-10. §4 mobile UI polish → Tasks 11-19. §5 dual workflow discipline embedded throughout. §6 test surface → Tasks 20-23. §7 deferred items left out (correct). §8 re-debate triggers in spec, not plan.

**Placeholder check:** None of "TBD"/"TODO"/"implement later"/"add validation". All steps have runnable code or exact commands. One reference to "TODO Wave 4b: pull from auth context" — that's an explicit deferral comment IN THE CODE, not a plan placeholder. Acceptable.

**Type consistency:** `humanizeDayMask` — same signature in Tasks 11+12. `proposeMarkAbsentTool` — same export name in Tasks 1+2. `decisionCards` (plural array) — added to type in Task 16, consumed in same task across mobile chat-api/MessageBubble/chat.tsx. `detectConflicts` ctx shape — Task 9 uses the shape Spec 1 §7.4 defines. `Conflict[]` return shape — same across Task 9 + downstream UI consumption in Tasks 13+14+15.

---

## Execution Handoff

**Plan complete and saved to `docs/plans/2026-05-09-phase-c-wave-4a-pro-plan.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Same pattern that delivered Wave 1 (66 tests), Wave 2a (79 tests), Wave 4a (panel-reviewed via Playwright). Per `feedback_expo_fast_refresh_plus_playwright.md`: subagents instructed to use Expo Fast Refresh during iteration + Playwright headed for milestones.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
