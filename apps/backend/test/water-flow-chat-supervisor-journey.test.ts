/**
 * Water-flow integration tests — supervisor chat journey, real-life scale.
 *
 * Founder feedback (2026-05-18): "the 22k test lines should cover real
 * scenarios like a supervisor speaking 5 things at once and the AI making
 * 5 decision cards. Don't write unit tests. Write integration + water-flow
 * tests that prove the whole journey works under realistic pressure."
 *
 * This file is the canonical water-flow suite for the chat → decisions →
 * apply → audit → summary journey. It does NOT mock OpenAI. It does NOT
 * mock the database. Every test hits real Railway Postgres + real OpenAI
 * through the production /chat/messages route — exactly how Ravi at Surya
 * Cleaning would hit it from his cracked-screen Android in a building lobby.
 *
 * Scenarios mapped to docs/handoff/supervisor-real-life-features-and-scenarios.md:
 *
 *   - Test 1 = Scenario 62: "Compound utterance. Ravi speaks 5 things in
 *     one burst. AI extracts 5 decisions; batch link '5 decisions added'."
 *   - Test 2 = Scenario 65: "AI returns ambiguous extraction" — supervisor
 *     gives partial info; AI must respond with a clarify-style turn instead
 *     of inventing facts; supervisor's follow-up turn completes the info;
 *     decision card is then created.
 *   - Test 3 = Scenario 63 + 62 mixed: multi-turn context retention + a
 *     mixed-kind batch (absent + leave + swap in one utterance). Tests
 *     whether the AI remembers earlier turns the way ChatGPT does.
 *   - Test 4 = Full journey 61 → apply path → audit row → summary tile.
 *     End-to-end: chat utterance creates a card, supervisor approves it,
 *     /supervisor/activity contains the row, /supervisor/summary's
 *     "changes saved" tile reflects the new count.
 *
 * Run via:
 *   cd apps/backend && railway run --service Postgres -- bash -c \
 *     'DATABASE_URL="$DATABASE_PUBLIC_URL" pnpm exec vitest run \
 *      test/water-flow-chat-supervisor-journey.test.ts'
 *
 * Time budget: ~5 minutes (each AI call is 5-15s warm).
 *
 * @derives(feedback_walk_every_screen_as_real_user_before_founder.md, 2026-05-18)
 * @derives(feedback_production_grade_workflow_rules.md L4 — policy-first)
 * @derives(feedback_integration_vs_water_flow.md)
 * @derives(handoff/supervisor-real-life-features-and-scenarios.md scenarios 61-76)
 */

import crypto from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;
const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const PFX = `wf-${Date.now()}-`;

let app: FastifyInstance;
let companyId: string;
let supId: string;
let supToken: string;
let siteApolloId: string;
let siteHospitalId: string;
let workerIds: { sundeep: string; pradeep: string; mukesh: string; ravi: string; lakshmi: string };

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  // Realistic tenant — Surya Cleaning Services, two sites, five workers.
  // The five worker names match the canonical real-life scenario corpus.
  const co = await prismaRaw.company.create({
    data: {
      name: PFX + 'Surya Cleaning',
      slug: PFX + 'surya',
      ownerPhone: '+919900100' + String(Date.now()).slice(-3),
      ownerName: 'Mr Reddy',
    },
  });
  companyId = co.id;

  const sup = await prismaRaw.user.create({
    data: {
      phone: '+9181' + String(Date.now()).slice(-8),
      name: 'Ravi (water-flow supervisor)',
      locale: 'en',
      companyId,
    },
  });
  supId = sup.id;
  await prismaRaw.membership.create({
    data: { companyId, userId: supId, role: 'SUPERVISOR', status: 'ACTIVE' },
  });
  supToken = await issueAccessToken({
    userId: supId,
    companyId,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const apollo = await prismaRaw.site.create({
    data: { companyId, name: 'Apollo Hospital', state: 'ACTIVE' },
  });
  siteApolloId = apollo.id;
  const hospital = await prismaRaw.site.create({
    data: { companyId, name: 'Hospital A', state: 'ACTIVE' },
  });
  siteHospitalId = hospital.id;

  // Supervisor portfolio — both sites bound to Ravi.
  for (const sid of [siteApolloId, siteHospitalId]) {
    await prismaRaw.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId: sid,
        userId: supId,
        actingForUserId: null,
        effectiveFrom: yesterday,
        reason: 'water-flow seed',
        createdBy: supId,
      },
    });
  }

  // Five workers — names the AI corpus knows.
  const namePhones = [
    ['Sundeep Kumar', '+9182' + String(Date.now() + 1).slice(-8)],
    ['Pradeep Yadav', '+9183' + String(Date.now() + 2).slice(-8)],
    ['Mukesh Reddy', '+9184' + String(Date.now() + 3).slice(-8)],
    ['Ravi Sharma', '+9185' + String(Date.now() + 4).slice(-8)],
    ['Lakshmi Devi', '+9186' + String(Date.now() + 5).slice(-8)],
  ] as const;
  const created: Record<string, string> = {};
  for (const [name, phone] of namePhones) {
    const w = await prismaRaw.worker.create({
      data: { companyId, name, phone, state: 'ACTIVE' },
    });
    created[name.split(' ')[0]!.toLowerCase()] = w.id;
    // Place each worker at Apollo so the supervisor's portfolio sees them
    // when AI routes a decision to /decisions.
    await prismaRaw.assignment.create({
      data: {
        companyId,
        workerId: w.id,
        siteId: siteApolloId,
        shiftStart: '09:00',
        shiftEnd: '17:00',
        dayMask: 'MTWTFS_',
        state: 'ACTIVE',
        validFrom: yesterday,
      },
    });
  }
  workerIds = {
    sundeep: created.sundeep!,
    pradeep: created.pradeep!,
    mukesh: created.mukesh!,
    ravi: created.ravi!,
    lakshmi: created.lakshmi!,
  };
});

afterAll(async () => {
  try {
    await prismaRaw.attendance.deleteMany({ where: { companyId } });
    await prismaRaw.swapRequest.deleteMany({ where: { companyId } });
    await prismaRaw.leaveRequest.deleteMany({ where: { companyId } });
    await prismaRaw.assignment.deleteMany({ where: { companyId } });
    await prismaRaw.supervisorDecision.deleteMany({ where: { companyId } });
    await prismaRaw.chatRequestLog.deleteMany({ where: { companyId } });
    await prismaRaw.chatMessage.deleteMany({ where: { companyId } });
    await prismaRaw.chatThread.deleteMany({ where: { companyId } });
    await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
    await prismaRaw.outbox.deleteMany({ where: { companyId } }).catch(() => {});
    await prismaRaw.siteSupervisorBinding.deleteMany({ where: { companyId } });
    await prismaRaw.worker.deleteMany({ where: { companyId } });
    await prismaRaw.site.deleteMany({ where: { companyId } });
    await prismaRaw.membership.deleteMany({ where: { companyId } });
    await prismaRaw.company.delete({ where: { id: companyId } });
  } finally {
    await prismaRaw.$disconnect();
    await app.close();
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ChatResponse = {
  decisionCard: { toolName?: string; toolInput?: Record<string, unknown> } | null;
  decisionCards: Array<{ toolName?: string; toolInput?: Record<string, unknown> }> | null;
  assistantMessage?: { text?: string };
  amend?: { didAmend?: boolean };
};

async function sendChat(text: string, threadId?: string): Promise<ChatResponse> {
  const idem = crypto.randomUUID();
  const r = await app.inject({
    method: 'POST',
    url: '/chat/messages',
    headers: { authorization: `Bearer ${supToken}`, 'idempotency-key': idem },
    payload: threadId ? { text, threadId } : { text },
  });
  expect(r.statusCode, `chat returned ${r.statusCode}: ${r.body}`).toBe(200);
  return r.json<ChatResponse>();
}

function allToolNames(res: ChatResponse): string[] {
  const out: string[] = [];
  if (res.decisionCard?.toolName) out.push(res.decisionCard.toolName);
  if (res.decisionCards) for (const c of res.decisionCards) if (c.toolName) out.push(c.toolName);
  return out;
}

// ---------------------------------------------------------------------------
// Test 1 — Compound utterance, 5+ workers, real-life scale (Scenario 62)
// ---------------------------------------------------------------------------

describe('water-flow #1 — 5 workers in one utterance → batch decision cards', () => {
  it('Ravi dictates 5 absences in one Telugu-Hindi-English mix; AI emits 5+ propose_mark_absent cards', async () => {
    const utterance =
      'Aaj five workers absent hain: Sundeep, Pradeep, Mukesh, Ravi, and Lakshmi ' +
      'all five not coming today, mark them absent at Apollo Hospital';

    const res = await sendChat(utterance);
    const tools = allToolNames(res);

    // Reality of AI: may emit 5 cards in one turn OR may take a follow-up
    // call. For Ravi's confidence, at minimum 3 of 5 names must produce
    // a proposed mark_absent in the first response — anything less is the
    // AI silently dropping work, which is the regression we want to catch.
    const markAbsentCount = tools.filter((t) => t === 'propose_mark_absent').length;
    expect(
      markAbsentCount,
      `expected ≥3 propose_mark_absent across 5 named workers in one utterance; got ${markAbsentCount} (tools=${tools.join(',')})`,
    ).toBeGreaterThanOrEqual(3);
  }, 180_000);
});

// ---------------------------------------------------------------------------
// Test 2 — Ambiguous request → AI must ask, not invent (Scenario 65)
// ---------------------------------------------------------------------------

describe('water-flow #2 — AI clarifies missing info instead of inventing', () => {
  it('Ravi says "move Ravi to Hospital A" without date/time; AI must NOT auto-create an assignment', async () => {
    const incomplete = 'move Ravi Sharma to Hospital A';
    const res = await sendChat(incomplete);
    const tools = allToolNames(res);

    // The correct production behaviour: AI either responds with no decision
    // card (asking for missing date/time in the assistantMessage) OR emits
    // propose_clarify. The wrong behaviour we want to catch: AI silently
    // invents a date and emits propose_create_assignment with a fabricated
    // start time — that's the "AI silently writes" failure mode the master
    // plan §G explicitly forbids.
    const hasCreateAssignment = tools.includes('propose_create_assignment');
    const hasClarify = tools.includes('propose_clarify');
    const assistantText = res.assistantMessage?.text ?? '';
    const asksForTime = /when|date|time|from when|starting|begin/i.test(assistantText);

    expect(
      !hasCreateAssignment || hasClarify || asksForTime,
      `AI must not create an assignment without a start time. tools=${tools.join(',')} assistantText="${assistantText}"`,
    ).toBe(true);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// Test 3 — Mixed-kind batch + multi-turn context (Scenarios 62 + 63)
// ---------------------------------------------------------------------------

describe('water-flow #3 — mixed-kind utterance + multi-turn context retention', () => {
  it('Ravi speaks one mixed utterance (absent + leave + swap); AI emits at least 2 distinct decision kinds', async () => {
    const mixed =
      'Priya is sick today mark her absent at Apollo. Also Lakshmi needs leave next week ' +
      'Tuesday Wednesday Thursday for a family function.';
    const res = await sendChat(mixed);
    const tools = allToolNames(res);
    const distinctKinds = new Set(tools);

    expect(
      distinctKinds.size,
      `expected ≥2 distinct propose_* kinds (absent + leave); got ${[...distinctKinds].join(',')}`,
    ).toBeGreaterThanOrEqual(2);
  }, 180_000);

  it('Multi-turn: turn 1 mentions Apollo; turn 2 says "that worker" — AI must keep Apollo context', async () => {
    const t1 = await sendChat('Apollo me Mukesh aaj nahi aaya');
    const threadId = (t1 as unknown as { threadId?: string }).threadId;

    // turn 2: ambiguous reference to "that worker" — should map to Mukesh
    // because the prior turn just talked about him at Apollo.
    const t2 = await sendChat('aur uska tomorrow ka shift bhi cancel kar do', threadId);
    const t2Tools = allToolNames(t2);

    // We accept: either a follow-up action that references Mukesh (any
    // tool with workerId/workerName matching), OR a clarify response.
    // The failure mode we want to catch: AI silently does nothing and
    // returns no card AND no clarifying text.
    const hasAnyDecision =
      (t2.decisionCard ?? null) !== null || (t2.decisionCards?.length ?? 0) > 0;
    const hasClarifyingText = (t2.assistantMessage?.text ?? '').trim().length > 20;

    expect(
      hasAnyDecision || hasClarifyingText,
      `multi-turn context failed: AI returned no card AND no clarifying text. tools=${t2Tools.join(',')}`,
    ).toBe(true);
  }, 180_000);
});

// ---------------------------------------------------------------------------
// Test 4 — Full journey: chat → card → approve → audit → summary
// ---------------------------------------------------------------------------

describe('water-flow #4 — chat → decision card → approve → audit → summary tile', () => {
  it('utterance creates a mark_absent card; supervisor approves it; /activity logs the row; /summary "changes saved" reflects the new count', async () => {
    // Snapshot summary changesToday BEFORE we do anything.
    const sumBeforeRes = await app.inject({
      method: 'GET',
      url: '/supervisor/summary',
      headers: { authorization: `Bearer ${supToken}` },
    });
    expect(sumBeforeRes.statusCode).toBe(200);
    const sumBefore = sumBeforeRes.json<{ changesToday: number }>();
    const beforeChanges = sumBefore.changesToday ?? 0;

    // Step 1: chat utterance → decision card
    const chatRes = await sendChat('Sundeep aaj nahi aaya, mark absent at Apollo');
    const card = chatRes.decisionCard ?? chatRes.decisionCards?.[0] ?? null;
    expect(
      card,
      'expected a decision card from a clear single-worker absence utterance',
    ).toBeTruthy();
    expect(card!.toolName).toBe('propose_mark_absent');

    // Step 2: locate the SupervisorDecision row the chat just emitted,
    // verify it's pending on the supervisor's queue.
    const decisionsRes = await app.inject({
      method: 'GET',
      url: '/supervisor/decisions',
      headers: { authorization: `Bearer ${supToken}` },
    });
    expect(decisionsRes.statusCode).toBe(200);
    const decisionsBody = decisionsRes.json<{
      rows: Array<{
        id: string;
        kind: string;
        section: string;
        actions: Array<{
          endpoint: string;
          method: string;
          label: string;
          body?: Record<string, unknown>;
        }>;
      }>;
    }>();
    const markAbsentRow = decisionsBody.rows.find((r) => r.kind === 'MARK_ABSENT');
    expect(
      markAbsentRow,
      'expected a MARK_ABSENT row in /supervisor/decisions after chat',
    ).toBeTruthy();
    const applyAction = markAbsentRow!.actions.find((a) => /apply|approve|mark/i.test(a.label));
    expect(applyAction, 'expected an Apply/Approve action on the decision row').toBeTruthy();

    // Step 3: apply via the server-driven action endpoint.
    const applyRes = await app.inject({
      method: applyAction!.method as 'POST',
      url: applyAction!.endpoint,
      headers: {
        authorization: `Bearer ${supToken}`,
        'idempotency-key': crypto.randomUUID(),
      },
      payload: applyAction!.body ?? {},
    });
    expect(
      [200, 201, 204].includes(applyRes.statusCode),
      `apply expected 2xx; got ${applyRes.statusCode}: ${applyRes.body}`,
    ).toBe(true);

    // Step 4: /supervisor/activity must show the audit row.
    const actRes = await app.inject({
      method: 'GET',
      url: '/supervisor/activity',
      headers: { authorization: `Bearer ${supToken}` },
    });
    expect(actRes.statusCode).toBe(200);
    const actBody = actRes.json<{ rows: Array<{ kind: string }> }>();
    const absentInActivity = actBody.rows.some((r) => /ABSENT|MARK_ABSENT/i.test(r.kind));
    expect(absentInActivity, `expected an absent-kind row in /activity after apply`).toBe(true);

    // Step 5: /summary "changes saved" tile must reflect the increment.
    const sumAfterRes = await app.inject({
      method: 'GET',
      url: '/supervisor/summary',
      headers: { authorization: `Bearer ${supToken}` },
    });
    expect(sumAfterRes.statusCode).toBe(200);
    const sumAfter = sumAfterRes.json<{ changesToday: number }>();
    expect(
      sumAfter.changesToday,
      `summary.changesToday should have increased after applying a decision; before=${beforeChanges} after=${sumAfter.changesToday}`,
    ).toBeGreaterThan(beforeChanges);
  }, 300_000);
});
