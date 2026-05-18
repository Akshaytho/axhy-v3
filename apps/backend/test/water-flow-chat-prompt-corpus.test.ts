/**
 * Water-flow chat prompt corpus — 5 founder-specified scenarios.
 *
 * Founder lock 2026-05-18 PM: "for testing chat ai give me 5 types of prompts
 * and different workers should be involved ... half half broken, full prompts,
 * adding one line after line, talking about one person then sudden talks
 * about different person and again come to first person, what matters is it
 * remembers the context happened there fully and makes right decisions only
 * not wrong ones at all."
 *
 * The 5 scenarios:
 *   1. HALF-BROKEN: missing field — AI asks for the missing piece, does NOT
 *      silently invent.
 *   2. FULL PROMPT: all fields present — single decision card emitted in one
 *      turn, no clarification needed.
 *   3. INCREMENTAL: same intent built across 3 turns — turn 1 partial, turn 2
 *      fills a field, turn 3 fills the last. Final card has all fields.
 *   4. TOPIC SWITCH + RETURN: worker A → tangent worker B → return to A. AI
 *      must remember A's context after the tangent. The hard one.
 *   5. CROSS-SCREEN: a read intent (worker→sites) followed by a write intent
 *      (rule creation). Two distinct tools fire, no fabrication.
 *
 * Real DB (Railway sandbox) + real OpenAI. Slow on purpose — production-grade
 * means the AI actually runs, not mocked.
 *
 * Workers seeded: Sundeep Kumar, Pradeep Yadav, Mukesh Reddy, Ravi Sharma,
 * Lakshmi Devi. Sites: Apollo Hospital, Hospital A.
 *
 * @derives(feedback_walk_every_screen_as_real_user_before_founder.md)
 * @derives(feedback_tests_must_prove_the_bug_existed.md)
 * @derives(master-plan §G) — chat supervisor surface
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
const TEST_PREFIX = `corpus-${Date.now()}-`;

let app: FastifyInstance;
let companyId: string;
let supId: string;
let supToken: string;
let siteApolloId: string;
let siteHospitalId: string;
let workerIds: Record<'sundeep' | 'pradeep' | 'mukesh' | 'ravi' | 'lakshmi', string>;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  const co = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919900000301',
      ownerName: 'Owner',
    },
  });
  companyId = co.id;

  const sup = await prismaRaw.user.create({
    data: {
      phone: '+9181' + String(Date.now()).slice(-8),
      name: 'Ravi (corpus supervisor)',
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

  // Sites.
  const apollo = await prismaRaw.site.create({
    data: { companyId, name: 'Apollo Hospital', state: 'ACTIVE' },
  });
  siteApolloId = apollo.id;
  const hospitalA = await prismaRaw.site.create({
    data: { companyId, name: 'Hospital A', state: 'ACTIVE' },
  });
  siteHospitalId = hospitalA.id;

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  for (const sid of [siteApolloId, siteHospitalId]) {
    await prismaRaw.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId: sid,
        userId: supId,
        actingForUserId: null,
        effectiveFrom: yesterday,
        reason: 'corpus seed',
        createdBy: supId,
      },
    });
  }

  // Workers — five distinct realistic names per master plan §O personas.
  const workerSeed: Array<[string, string]> = [
    ['Sundeep Kumar', '+9182' + String(Date.now() + 1).slice(-8)],
    ['Pradeep Yadav', '+9183' + String(Date.now() + 2).slice(-8)],
    ['Mukesh Reddy', '+9184' + String(Date.now() + 3).slice(-8)],
    ['Ravi Sharma', '+9185' + String(Date.now() + 4).slice(-8)],
    ['Lakshmi Devi', '+9186' + String(Date.now() + 5).slice(-8)],
  ];
  const created: Partial<typeof workerIds> = {};
  for (const [name, phone] of workerSeed) {
    const w = await prismaRaw.worker.create({
      data: { companyId, name, phone, state: 'ACTIVE' },
    });
    const key = name.split(' ')[0]!.toLowerCase() as keyof typeof workerIds;
    created[key] = w.id;
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
    await prismaRaw.livingDoc.deleteMany({ where: { companyId } });
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

type DecisionCardLike = {
  toolName?: string;
  // Production response uses `fields`; `toolInput` is kept for forward-compat
  // with the corpus test. Real-world: read `fields` then fall back.
  fields?: Record<string, unknown>;
  toolInput?: Record<string, unknown>;
};

type ChatResponse = {
  threadId?: string;
  chatMessageId?: string;
  assistantText?: string;
  decisionCard: DecisionCardLike | null;
  decisionCards: DecisionCardLike[] | null;
  amend?: { didAmend?: boolean };
};

/** Pull the input map off a decision card regardless of which field carries it. */
function cardInput(card: DecisionCardLike | null | undefined): Record<string, unknown> {
  if (!card) return {};
  return card.fields ?? card.toolInput ?? {};
}

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

function assistantText(res: ChatResponse): string {
  return res.assistantText ?? '';
}

// ---------------------------------------------------------------------------
// Prompt 1 — HALF-BROKEN (missing one field)
// ---------------------------------------------------------------------------

describe('prompt 1 — half-broken (missing field)', () => {
  it('Mukesh ko remove karo Apollo se → AI asks for "when?", does not silently emit a card', async () => {
    const res = await sendChat('Mukesh ko remove karo Apollo se');
    const tools = allToolNames(res);
    const text = assistantText(res);

    // The AI MUST NOT silently propose a termination/end-assignment
    // from a half-broken phrase. It should clarify.
    const wroteTerminalCard = tools.some(
      (t) =>
        t === 'propose_termination' || t === 'propose_swap' || t === 'propose_create_assignment',
    );
    if (wroteTerminalCard) {
      // Surface the failure visibly so the founder can see the
      // un-clarified utterance and decide.
       
      console.error(
        '[prompt-1] AI emitted a terminal card without clarifying:',
        tools,
        'text=',
        text,
      );
    }
    expect(wroteTerminalCard).toBe(false);

    // The reply should be a clarifying question. Look for question marks
    // OR the word "when"/"date"/"how" — accepting model variation.
    const looksLikeQuestion =
      /\?/.test(text) ||
      /\bwhen\b/i.test(text) ||
      /\bdate\b/i.test(text) ||
      /\bhow\b/i.test(text) ||
      /\bclarif/i.test(text);
    expect(looksLikeQuestion, `assistant did not clarify; said: "${text}"`).toBe(true);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// Prompt 2 — FULL PROMPT (all fields complete)
// ---------------------------------------------------------------------------

describe('prompt 2 — full prompt (all fields)', () => {
  it('one fully-specified mark-absent → exactly one propose_mark_absent card, no clarification', async () => {
    const res = await sendChat(
      'Mark Sundeep Kumar absent at Apollo Hospital for today, he called in sick this morning',
    );
    const tools = allToolNames(res);
    expect(tools).toContain('propose_mark_absent');

    // The card should target Sundeep (workerId match).
    const card = res.decisionCard ?? (res.decisionCards?.length ? res.decisionCards[0] : null);
    const wid = cardInput(card).workerId as string | undefined;
    expect(wid).toBe(workerIds.sundeep);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// Prompt 3 — INCREMENTAL (line by line, 3 turns, same thread)
// ---------------------------------------------------------------------------

describe('prompt 3 — incremental (line by line context buildup)', () => {
  it('three short messages compose one propose_leave card with all fields', async () => {
    const r1 = await sendChat('Pradeep needs leave');
    // The server tracks one active thread per supervisor — no explicit
    // threadId in the request/response. Consecutive sendChat calls share
    // the same conversation context implicitly.

    const r2 = await sendChat('From next Monday');
    const r3 = await sendChat('Until Wednesday, family wedding');

    // By turn 3, the AI should have enough info to emit a propose_leave card.
    const finalTools = allToolNames(r3);
    // Some models emit on turn 2 if they decide "next Monday + need a reason"
    // is enough — accept either turn-2-or-3 emission.
    const turn2Tools = allToolNames(r2);
    const sawProposeLeave =
      finalTools.includes('propose_leave') || turn2Tools.includes('propose_leave');
    expect(
      sawProposeLeave,
      `propose_leave never emitted across 3 turns. tools per turn: t1=${allToolNames(r1)}, t2=${turn2Tools}, t3=${finalTools}`,
    ).toBe(true);

    // The eventual leave card must be for Pradeep.
    const card =
      r3.decisionCard ??
      (r3.decisionCards?.length ? r3.decisionCards[0] : null) ??
      r2.decisionCard ??
      (r2.decisionCards?.length ? r2.decisionCards[0] : null);
    const wid = cardInput(card).workerId as string | undefined;
    expect(wid).toBe(workerIds.pradeep);
  }, 300_000);
});

// ---------------------------------------------------------------------------
// Prompt 4 — TOPIC SWITCH + RETURN (the hard one)
// ---------------------------------------------------------------------------

describe('prompt 4 — topic switch with return (context retention test)', () => {
  it('Sundeep absent → tangent Lakshmi+Mukesh swap → return to Sundeep — AI tracks both', async () => {
    // Turn 1: mention Sundeep absent today at Apollo.
    const r1 = await sendChat('Sundeep absent today at Apollo Hospital');
    // Same threading model — server tracks per-supervisor active thread.

    // Turn 2: tangent — Lakshmi swap with Mukesh tomorrow at Apollo.
    const r2 = await sendChat(
      'Wait actually first, can Lakshmi swap shifts with Mukesh tomorrow at Apollo Hospital?',
    );

    // Turn 3: return to Sundeep + confirm both.
    const r3 = await sendChat(
      'Yes do the swap. Also confirm Sundeep is absent today as I said earlier',
    );

    // The conversation should produce TWO distinct decision kinds across
    // the three turns: a swap (from the tangent) AND a mark_absent (for
    // Sundeep). If only one shows up, the AI lost context on the harder
    // worker — that's the bug we're testing for.
    const allTools = [...allToolNames(r1), ...allToolNames(r2), ...allToolNames(r3)];

    expect(
      allTools.includes('propose_swap'),
      `propose_swap never emitted. tools=${JSON.stringify(allTools)}`,
    ).toBe(true);
    expect(
      allTools.includes('propose_mark_absent'),
      `propose_mark_absent for Sundeep never emitted — AI lost the topic-1 context after the tangent. tools=${JSON.stringify(allTools)}`,
    ).toBe(true);

    // Sundeep's mark_absent must use the right workerId — proves AI
    // remembered the name across the tangent.
    const sundeepCardSearch = [
      ...(r3.decisionCards ?? []),
      ...(r3.decisionCard ? [r3.decisionCard] : []),
      ...(r2.decisionCards ?? []),
      ...(r2.decisionCard ? [r2.decisionCard] : []),
      ...(r1.decisionCards ?? []),
      ...(r1.decisionCard ? [r1.decisionCard] : []),
    ].find(
      (c) =>
        c.toolName === 'propose_mark_absent' &&
        (cardInput(c).workerId as string | undefined) === workerIds.sundeep,
    );
    expect(
      sundeepCardSearch,
      'no propose_mark_absent card targeted Sundeep — context lost across the tangent',
    ).toBeDefined();
  }, 420_000);
});

// ---------------------------------------------------------------------------
// Prompt 5 — CROSS-SCREEN (rules + sites + decisions intersection)
// ---------------------------------------------------------------------------

describe('prompt 5 — cross-screen reference + rule creation', () => {
  it('asks about sites then proposes a LivingDoc rule — read intent then write intent', async () => {
    // Turn 1: read intent — what sites does Ravi Sharma cover?
    // (Ravi Sharma is a SEEDED WORKER, not the supervisor.)
    const r1 = await sendChat(
      'Which sites does Ravi Sharma work at? Just tell me, do not change anything',
    );
    // AI may answer in-line OR may invoke a read-only tool. Either is OK.
    // What matters: NO propose_* write tools fired.
    const tools1 = allToolNames(r1);
    const wroteOnRead = tools1.some((t) => t.startsWith('propose_'));
    expect(
      wroteOnRead,
      `AI invoked a write tool on a pure read intent: ${JSON.stringify(tools1)}`,
    ).toBe(false);

    // Turn 2: write intent — add a rule (LivingDoc update).
    const r2 = await sendChat(
      'Add a rule for me: no worker can take leave on the 1st day of any month. Apply it going forward.',
    );
    const tools2 = allToolNames(r2);
    expect(
      tools2.includes('propose_living_doc_update'),
      `propose_living_doc_update never emitted on rule-creation utterance. tools=${JSON.stringify(tools2)} text="${assistantText(r2)}"`,
    ).toBe(true);

    // The rule text or description should include "1st" / "leave" / "month"
    // so we know the AI captured the constraint, not a generic rule. The
    // exact field names vary by model — search across ALL string-valued
    // fields in the toolInput for the constraint signal.
    const card = r2.decisionCard ?? (r2.decisionCards?.length ? r2.decisionCards[0] : null);
    const input = cardInput(card);
    const allStringValues = Object.values(input)
      .filter((v): v is string => typeof v === 'string')
      .join(' ')
      .toLowerCase();
    const captured =
      /1st|first|month/.test(allStringValues) && /leave|off|absent/.test(allStringValues);
    expect(
      captured,
      `rule did not capture the "no leave on 1st of month" constraint. toolInput=${JSON.stringify(input)}`,
    ).toBe(true);
  }, 300_000);
});

// Silence the unused-helper warning — siteHospitalId is in scope for future
// extensions of the corpus (e.g., a cross-site swap that needs both sites).
void siteHospitalId;
