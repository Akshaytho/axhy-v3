/**
 * AI verification handler — production implementation.
 *
 * Topic: `ai.verify`
 * Payload: `{ visitId: string; companyId: string }`
 *
 * Pipeline:
 *   1. Load visit + site + all VisitPhoto rows (companyId-scoped).
 *   2. Idempotency guard: if visit is already in a terminal verification state,
 *      return early so dispatcher marks the outbox row processed without
 *      re-spending AI cost on a re-delivery.
 *   3. Generate short-lived presigned GET URLs for every submitted photo
 *      (up to 8 before + 8 after = 16 max, founder cap 2026-06-03).
 *   4. Call OpenAI Chat Completions with `gpt-5.4-nano` multimodal + strict
 *      JSON output schema. detail:'high' on every image (~1100 tokens/img)
 *      so a max-size 16-photo call lands ~₹0.4 worst case — well under the
 *      ₹1/call ceiling per founder directive 2026-06-03.
 *   5. Parse JSON via Zod. Map AI verdict → v3 schema:
 *        APPROVE  → Visit.state = VERIFIED, all VisitPhoto.aiVerifyStatus = PASS
 *        REVIEW   → Visit.state = FLAGGED + flagged=true, photos = NEEDS_REVIEW
 *        REJECT   → Visit.state = FLAGGED + flagged=true, photos = FLAGGED
 *   6. On AI failure (network / 5xx / parse), exhaust MAX_RETRIES then fall
 *      back to FLAGGED + photos=NEEDS_REVIEW. NEVER auto-VERIFY on failure.
 *
 * The handler is invoked from the outbox dispatcher (every 2s tick). If this
 * function throws, the dispatcher records failCount++ and retries with
 * exponential backoff up to 5 attempts before quarantining the row.
 *
 * @derives(ADR-0023) — model-by-surface; ai_verification = gpt-5.4-nano, ₹1/call
 * @derives(ADR-0009) — outbox over Redis, in-transaction enqueue
 * @derives(master-plan §G) — worker verification surface
 * @derives(panel-2026-05-08) — phase B.6 (real impl, supersedes Phase B stub)
 * @derives(v2 backend/src/modules/verify/ai.ts) — strict JSON schema +
 *   UNCERTAIN-on-failure pattern ported, detail upgraded to 'high' per
 *   founder directive 2026-06-03 (still fits under ₹1 with nano)
 */

import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import {
  assertWithinBudget,
  tokenCostInrFor,
  incrementSpend,
  AICostBudgetError,
} from '@axhy/ai-tools';

import { prisma } from '../../lib/prisma.js';
import { generatePresignedGetUrls } from '../../lib/r2-presign.js';
import {
  assertCircuitClosed,
  recordSuccess as recordCircuitSuccess,
  recordFailure as recordCircuitFailure,
  CircuitOpenError,
} from '../../lib/openai-circuit-breaker.js';

const MODEL = 'gpt-5.4-nano';
const MODEL_VERSION = `${MODEL}-2026-06`;
const MAX_RETRIES = 2;
const VISION_TIMEOUT_MS = 60_000;
const MAX_PHOTOS_PER_PHASE = 8;
const COST_CEILING_INR = 1.0;

const AIPayloadSchema = z.object({
  visitId: z.string().uuid(),
  companyId: z.string().uuid(),
});

const AIResponseSchema = z.object({
  verification_score: z.number().min(0).max(1),
  label: z.enum(['EXCELLENT', 'GOOD', 'UNCERTAIN', 'POOR']),
  reasoning: z.string().min(1).max(2000),
  work_evident: z.boolean(),
  suspicious_activity: z.boolean(),
  fraud_probability: z.number().min(0).max(1),
  recommendation: z.enum(['APPROVE', 'REVIEW', 'REJECT']),
});

type MultimodalPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail: 'low' | 'high' } };

const SYSTEM_PROMPT = `You are an AI cleaning verification system for Axhy, a B2B facility management platform.
You verify that cleaning work was performed at a site based on before/after photos and visit metadata.

Analyze the provided evidence and score the work. Consider:
1. TIME vs DIFFICULTY: Is the duration physically possible for the work described?
2. PHOTO EVIDENCE: Are there enough before AND after photos? Does the comparison show real cleaning?
3. VISUAL INTEGRITY: Do photos look genuine (real site, similar angles, consistent lighting) or staged/manipulated?
4. FRAUD INDICATORS: Duplicate photos, identical before/after, too-fast completion, signs of reuse.

Respond in strict JSON:
{
  "verification_score": <0.0 to 1.0>,
  "label": "EXCELLENT" | "GOOD" | "UNCERTAIN" | "POOR",
  "reasoning": "<2-3 sentence explanation>",
  "work_evident": <boolean>,
  "suspicious_activity": <boolean>,
  "fraud_probability": <0.0 to 1.0>,
  "recommendation": "APPROVE" | "REVIEW" | "REJECT"
}`;

/** @derives(master-plan §G) */
export async function handleAiVerify(payload: unknown, log: FastifyBaseLogger): Promise<void> {
  const parsedPayload = AIPayloadSchema.safeParse(payload);
  if (!parsedPayload.success) {
    log.error({ payload }, 'ai.verify: invalid payload — refusing to process');
    return;
  }
  const { visitId, companyId } = parsedPayload.data;

  const visit = await prisma.visit.findFirst({
    where: { id: visitId, companyId },
    select: {
      id: true,
      state: true,
      startedAt: true,
      completedAt: true,
      photosBefore: true,
      photosAfter: true,
      verificationModel: true,
      site: { select: { name: true, address: true } },
      photos: {
        select: { id: true, side: true, r2Key: true, aiVerifyStatus: true },
      },
    },
  });

  if (!visit) {
    log.warn({ visitId, companyId }, 'ai.verify: visit not found — payload may be stale');
    return;
  }

  if (visit.state === 'VERIFIED' || visit.state === 'FLAGGED') {
    log.info(
      { visitId, currentState: visit.state, prevModel: visit.verificationModel },
      'ai.verify: visit already in terminal state — skipping',
    );
    return;
  }

  if (visit.state !== 'AWAITING_VERIFICATION') {
    log.warn(
      { visitId, currentState: visit.state },
      'ai.verify: visit not in AWAITING_VERIFICATION — refusing to verify',
    );
    return;
  }

  const before = visit.photos
    .filter((p) => p.side === 'BEFORE')
    .sort((a, b) => a.r2Key.localeCompare(b.r2Key))
    .slice(0, MAX_PHOTOS_PER_PHASE);
  const after = visit.photos
    .filter((p) => p.side === 'AFTER')
    .sort((a, b) => a.r2Key.localeCompare(b.r2Key))
    .slice(0, MAX_PHOTOS_PER_PHASE);

  if (before.length === 0 || after.length === 0) {
    log.warn(
      { visitId, beforeCount: before.length, afterCount: after.length },
      'ai.verify: missing before or after photos — auto-flagging for supervisor review',
    );
    await applyOutcome(visitId, companyId, {
      reasoning: `Insufficient photo evidence: ${before.length} before, ${after.length} after.`,
      recommendation: 'REVIEW',
      modelVersion: `${MODEL_VERSION}-no-photos`,
    });
    return;
  }

  // Cost ceiling estimate. detail:'high' = ~1100 tokens/image. 16 images × 1100
  // + prompt (~500) + output (≤500) ≈ 18.6K input tokens. At gpt-5.4-nano
  // pricing this is comfortably under ₹1. Logged for ops dashboards.
  const estTokensIn = (before.length + after.length) * 1100 + 500;
  const estTokensOut = 500;

  // P0 fix: enforce the tenant's daily AI budget BEFORE spending on OpenAI.
  // The verify surface previously called OpenAI directly with no budget gate
  // and never recorded spend, so the ₹/day cap + owner WARN/CAP alerts never
  // fired for photo verification and the tenant's daily AI spend was
  // undercounted. incrementSpend() below is the atomic raw-SQL increment.
  const estCostInr = tokenCostInrFor(MODEL, {
    inputTokens: estTokensIn,
    outputTokens: estTokensOut,
  });
  try {
    await assertWithinBudget('ai_verification', estCostInr, { companyId, prisma });
  } catch (err) {
    if (err instanceof AICostBudgetError) {
      log.warn(
        { visitId, companyId },
        'ai.verify: daily AI budget reached — deferring to manual supervisor review',
      );
      await applyOutcome(visitId, companyId, {
        reasoning: 'Daily AI verification budget reached; deferred to manual supervisor review.',
        recommendation: 'REVIEW',
        modelVersion: `${MODEL_VERSION}-budget-capped`,
      });
      return;
    }
    throw err;
  }

  log.info(
    {
      visitId,
      before: before.length,
      after: after.length,
      estTokensIn,
      estTokensOut,
      ceilingInr: COST_CEILING_INR,
      model: MODEL,
    },
    'ai.verify: starting verification',
  );

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      log.error(
        { visitId },
        'ai.verify: OPENAI_API_KEY missing in production — refusing to verify',
      );
      throw new Error('OPENAI_API_KEY required in production for AI verification');
    }
    log.warn({ visitId }, 'ai.verify: no API key in non-prod — flagging visit for manual review');
    await applyOutcome(visitId, companyId, {
      reasoning: 'AI verification unavailable in this environment (no API key). Manual review.',
      recommendation: 'REVIEW',
      modelVersion: `${MODEL_VERSION}-no-key`,
    });
    return;
  }

  const allKeys = [...before.map((p) => p.r2Key), ...after.map((p) => p.r2Key)];
  const presigned = await generatePresignedGetUrls(allKeys, 300);
  if (presigned.kind !== 'OK') {
    log.error({ visitId }, 'ai.verify: R2 not configured — cannot fetch photos');
    throw new Error('R2 not configured for AI verification photo GET');
  }
  const beforeUrls = presigned.urls.slice(0, before.length).map((u) => u.getUrl);
  const afterUrls = presigned.urls.slice(before.length).map((u) => u.getUrl);

  const durationMinutes =
    visit.startedAt && visit.completedAt
      ? Math.round(
          (new Date(visit.completedAt).getTime() - new Date(visit.startedAt).getTime()) / 60_000,
        )
      : 0;
  const siteName = visit.site?.name ?? 'Unknown site';
  const siteAddress = visit.site?.address ?? 'Unknown address';

  // Circuit breaker: if OpenAI is failing across the fleet, skip the call and
  // defer to manual review instead of hammering a down provider (this verify
  // path previously bypassed the breaker that chat already uses).
  try {
    await assertCircuitClosed();
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      log.warn(
        { visitId, companyId },
        'ai.verify: OpenAI circuit open — deferring to manual supervisor review',
      );
      await applyOutcome(visitId, companyId, {
        reasoning:
          'AI verification temporarily unavailable (provider circuit open); manual review.',
        recommendation: 'REVIEW',
        modelVersion: `${MODEL_VERSION}-circuit-open`,
      });
      return;
    }
    throw err;
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const content: MultimodalPart[] = [
        {
          type: 'text',
          text: buildUserPrompt({
            siteName,
            siteAddress,
            durationMinutes,
            beforeCount: before.length,
            afterCount: after.length,
          }),
        },
        ...beforeUrls.map<MultimodalPart>((url) => ({
          type: 'image_url',
          image_url: { url, detail: 'high' },
        })),
        ...afterUrls.map<MultimodalPart>((url) => ({
          type: 'image_url',
          image_url: { url, detail: 'high' },
        })),
      ];

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content },
          ],
          temperature: 0.2,
          max_completion_tokens: estTokensOut,
          // Structured Outputs — schema-guaranteed JSON, no parse retries.
          // Stricter than v2's `json_object` mode: the model API enforces
          // shape so a malformed response is impossible by construction.
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'verify_visit',
              strict: true,
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  verification_score: { type: 'number', minimum: 0, maximum: 1 },
                  label: {
                    type: 'string',
                    enum: ['EXCELLENT', 'GOOD', 'UNCERTAIN', 'POOR'],
                  },
                  reasoning: { type: 'string' },
                  work_evident: { type: 'boolean' },
                  suspicious_activity: { type: 'boolean' },
                  fraud_probability: { type: 'number', minimum: 0, maximum: 1 },
                  recommendation: {
                    type: 'string',
                    enum: ['APPROVE', 'REVIEW', 'REJECT'],
                  },
                },
                required: [
                  'verification_score',
                  'label',
                  'reasoning',
                  'work_evident',
                  'suspicious_activity',
                  'fraud_probability',
                  'recommendation',
                ],
              },
            },
          },
        }),
        signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`OpenAI ${response.status}: ${errText.slice(0, 200)}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      // H11: compute the spend for THIS OpenAI call, but DEFER recording it into
      // applyOutcome's transaction so it is gated behind the first-writer-wins
      // state claim — a redelivered ai.verify that loses the claim must NOT
      // re-charge the tenant's daily budget (eliminates the financial double-count).
      const spendInr = tokenCostInrFor(MODEL, {
        inputTokens: data.usage?.prompt_tokens ?? estTokensIn,
        outputTokens: data.usage?.completion_tokens ?? estTokensOut,
      });

      const raw = data.choices?.[0]?.message?.content;
      if (!raw) throw new Error('OpenAI returned empty completion');

      const result = AIResponseSchema.parse(JSON.parse(raw));

      log.info(
        {
          visitId,
          score: result.verification_score,
          label: result.label,
          recommendation: result.recommendation,
          fraud: result.fraud_probability,
          tokensIn: data.usage?.prompt_tokens,
          tokensOut: data.usage?.completion_tokens,
          model: MODEL,
        },
        'ai.verify: verification complete',
      );

      await applyOutcome(visitId, companyId, {
        reasoning: result.reasoning,
        recommendation: result.recommendation,
        modelVersion: MODEL_VERSION,
        spendInr,
      });
      await recordCircuitSuccess();
      return;
    } catch (err) {
      // Tell the breaker OpenAI failed (best-effort; a Redis blip here must not
      // mask the verification error below).
      await recordCircuitFailure().catch((cbErr) =>
        log.debug(
          { visitId, err: (cbErr as Error).message },
          'ai.verify: circuit recordFailure failed',
        ),
      );
      log.warn(
        { visitId, attempt, err: err instanceof Error ? err.message : String(err) },
        'ai.verify: call failed',
      );
      if (attempt === MAX_RETRIES) {
        log.error(
          { visitId },
          'ai.verify: exhausted retries — flagging for manual supervisor review',
        );
        await applyOutcome(visitId, companyId, {
          reasoning:
            'AI verification could not complete after retries. Flagged for supervisor review.',
          recommendation: 'REVIEW',
          modelVersion: `${MODEL_VERSION}-fallback`,
        });
        return;
      }
    }
  }
}

/**
 * Map the AI's verdict to v3 state transitions:
 *   APPROVE  → Visit.state=VERIFIED, photos.aiVerifyStatus=PASS
 *   REVIEW   → Visit.state=FLAGGED + flagged=true, photos=NEEDS_REVIEW
 *   REJECT   → Visit.state=FLAGGED + flagged=true, photos=FLAGGED
 *
 * Single transaction so visit state and photo statuses can never diverge.
 *
 * @derives(master-plan §G)
 */
async function applyOutcome(
  visitId: string,
  companyId: string,
  outcome: {
    reasoning: string;
    recommendation: 'APPROVE' | 'REVIEW' | 'REJECT';
    modelVersion: string;
    // H11: when set, the OpenAI spend for this call is recorded atomically with
    // the state claim below — only the writer that WINS the claim charges the
    // budget, so a redelivered ai.verify can never double-count daily spend.
    spendInr?: number;
  },
): Promise<void> {
  const photoStatus: 'PASS' | 'FLAGGED' | 'NEEDS_REVIEW' =
    outcome.recommendation === 'APPROVE'
      ? 'PASS'
      : outcome.recommendation === 'REJECT'
        ? 'FLAGGED'
        : 'NEEDS_REVIEW';
  const visitState: 'VERIFIED' | 'FLAGGED' =
    outcome.recommendation === 'APPROVE' ? 'VERIFIED' : 'FLAGGED';
  const flagged = visitState === 'FLAGGED';

  await prisma.$transaction(async (tx) => {
    // First-writer-wins: only transition a visit still AWAITING_VERIFICATION so
    // a concurrent supervisor resolve/reject or a re-delivered ai.verify cannot
    // clobber a newer state (TOCTOU guard; visit.ts allows AI_VERIFIED/AI_FLAGGED
    // only from AWAITING_VERIFICATION; mirrors worker-submit-service.ts).
    const claimed = await tx.visit.updateMany({
      where: { id: visitId, state: 'AWAITING_VERIFICATION' },
      data: {
        state: visitState,
        flagged,
        verificationModel: outcome.modelVersion,
        verificationText: outcome.reasoning,
      },
    });
    if (claimed.count === 0) return; // visit already moved on — nothing to do
    await tx.visitPhoto.updateMany({
      where: { visitId, companyId },
      data: {
        aiVerifyStatus: photoStatus,
        aiVerifyText: outcome.reasoning.slice(0, 1500),
      },
    });
    // H11: charge the tenant's daily AI budget ATOMICALLY with the winning claim.
    // A redelivery that lost the claim above already returned, so it never reaches
    // here — no financial double-count. incrementSpend accepts the tx client.
    if (outcome.spendInr != null) {
      await incrementSpend(companyId, outcome.spendInr, tx);
    }
  });
}

/** @derives(v2 ai.ts) — text portion of the multimodal prompt */
function buildUserPrompt(args: {
  siteName: string;
  siteAddress: string;
  durationMinutes: number;
  beforeCount: number;
  afterCount: number;
}): string {
  return `Verify cleaning work at "${args.siteName}" (${args.siteAddress}):

EVIDENCE:
- Before photos: ${args.beforeCount}
- After photos: ${args.afterCount}
- Duration: ${args.durationMinutes} minutes

CRITICAL CHECKS:
1. Is ${args.durationMinutes} minutes reasonable for cleaning this area?
2. Do the before and after photos look like the SAME location, just at different points in time?
3. Is there observable cleaning progress between the before and after groups?
4. Any signs of staged photos, identical before/after, or photo reuse from prior jobs?

VISUAL EVIDENCE:
The next ${args.beforeCount} images are BEFORE photos, the following ${args.afterCount} images are AFTER photos. Compare them carefully.

Visual checks to perform:
1. Is there an observable difference between before and after (cleaning evidence)?
2. Do photos look like a real residential/commercial site (not stock images or staged)?
3. Are before/after photos from approximately the same angle/position?
4. Does lighting/shadows suggest similar capture times?
5. Any signs of digital manipulation, identical content, or reuse?

If visual evidence contradicts the metadata (e.g. metadata says 60 min but photos look identical), heavily downgrade the score and recommend REJECT.

Provide your verdict in the required JSON format.`;
}
