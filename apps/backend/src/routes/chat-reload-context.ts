/**
 * POST /chat/reload-context — force-refresh the prompt context blocks
 * (LivingDoc + Calendar + Company/HR rules) for the calling supervisor.
 *
 * Per docs/locked/chat-sidebar-context-flow.md Reload Context Button:
 *   - Limited to 3 presses per supervisor per IST day
 *   - 4th press → 429 with nextResetAt header
 *   - Returns the refreshed { livingDoc, calendarBlock, companyRules, hrRules }
 *     so the mobile sidebar can render the current state without an extra
 *     round-trip
 *
 * The counter is stored in AuditEvent (kind=CHAT_RELOAD_CONTEXT) so no
 * extra schema is needed and the audit trail records every reload.
 *
 * @derives(master-plan §G)
 * @derives(docs/locked/chat-sidebar-context-flow.md — Reload Context Button)
 * @derives(plans/abstract-wandering-kazoo.md Phase 3)
 */

import type { FastifyInstance } from 'fastify';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { getLivingDoc } from '../lib/living-doc.js';
import { formatLivingDocPrompt } from '../lib/living-doc-prompt.js';
import { loadCalendarTier3 } from '../lib/calendar-context.js';
import { loadCompanyRules, loadHrRules } from '../lib/policy-rules-loader.js';
import { composeCompanyRulesBlock, composeHrRulesBlock } from '../lib/prompt-composer.js';
import { consumeReloadContext, RELOAD_CONTEXT_DAILY_LIMIT } from '../lib/reload-context-counter.js';

export async function registerChatReloadContextRoutes(app: FastifyInstance): Promise<void> {
  app.post('/chat/reload-context', { preHandler: requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED' });
      return;
    }

    try {
      const result = await withTenantContext(prisma, auth.companyId, async (tx) => {
        const consume = await consumeReloadContext(tx, {
          companyId: auth.companyId,
          supervisorId: auth.userId,
        });
        if (!consume.ok) {
          return { kind: 'EXCEEDED' as const, consume };
        }

        // Friend review Wave A.2 #3 — graceful-degradation: one slow peripheral
        // read shouldn't fail the whole Reload Context call. Each piece has a
        // safe default; rejections are logged so ops sees the pain.
        const settled = await Promise.allSettled([
          getLivingDoc(tx, auth.companyId, auth.userId),
          loadCalendarTier3(tx, auth.companyId, auth.userId),
          loadCompanyRules(tx, auth.companyId),
          loadHrRules(tx, auth.companyId),
        ]);
        function unwrap<T>(idx: number, label: string, fallback: T): T {
          const r = settled[idx]!;
          if (r.status === 'fulfilled') return r.value as T;
          req.log.warn(
            {
              event: 'reload_context.partial_failure',
              stream: label,
              err: r.reason instanceof Error ? r.reason.message : String(r.reason),
            },
            `reload-context: ${label} failed — using fallback`,
          );
          return fallback;
        }
        const livingDoc = unwrap<Awaited<ReturnType<typeof getLivingDoc>>>(0, 'livingDoc', {
          id: '',
          companyId: auth.companyId,
          supervisorId: auth.userId,
          version: 0,
          siteRules: [],
          workerNotes: [],
          clientPreferences: [],
          recurringTasks: [],
          freeNotes: [],
        });
        const calendarBlock = unwrap<string>(1, 'calendar', '');
        const companyRules = unwrap<Awaited<ReturnType<typeof loadCompanyRules>>>(
          2,
          'companyRules',
          [],
        );
        const hrRules = unwrap<Awaited<ReturnType<typeof loadHrRules>>>(3, 'hrRules', []);

        return {
          kind: 'OK' as const,
          consume,
          livingDocBlock: formatLivingDocPrompt(livingDoc),
          livingDocVersion: livingDoc.version,
          calendarBlock,
          companyRulesBlock: composeCompanyRulesBlock(companyRules),
          hrRulesBlock: composeHrRulesBlock(hrRules),
          companyRuleCount: companyRules.length,
          hrRuleCount: hrRules.length,
        };
      });

      if (result.kind === 'EXCEEDED') {
        reply.code(429).header('X-Reload-Next-Reset-At', result.consume.nextResetAt.toISOString());
        reply.send({
          error: 'RELOAD_LIMIT_REACHED',
          message: `You've reached today's reload limit (${RELOAD_CONTEXT_DAILY_LIMIT}/day). It resets at IST midnight.`,
          dailyLimit: RELOAD_CONTEXT_DAILY_LIMIT,
          usedToday: result.consume.usedToday,
          remaining: 0,
          nextResetAt: result.consume.nextResetAt.toISOString(),
        });
        return;
      }

      reply.code(200).send({
        ok: true,
        dailyLimit: RELOAD_CONTEXT_DAILY_LIMIT,
        usedToday: result.consume.usedToday,
        remaining: result.consume.remaining,
        livingDocVersion: result.livingDocVersion,
        companyRuleCount: result.companyRuleCount,
        hrRuleCount: result.hrRuleCount,
        // Block contents are large; surface them so the client can
        // optionally preview / debug what the AI is seeing. UI only
        // displays the counts above.
        blocks: {
          companyRulesBlock: result.companyRulesBlock,
          hrRulesBlock: result.hrRulesBlock,
          livingDocBlock: result.livingDocBlock,
          calendarBlock: result.calendarBlock,
        },
      });
    } catch (err) {
      if (err && typeof err === 'object' && 'statusCode' in err && err.statusCode === 403) {
        reply.code(403).send({
          error: 'COMPANY_NOT_ACTIVE',
          message: 'Your company account is not active.',
        });
        return;
      }
      throw err;
    }
  });

  // GET /chat/reload-context/state — read current counter without consuming.
  // Drawer uses this on mount to render the counter pill correctly without
  // burning a reload slot.
  app.get('/chat/reload-context/state', { preHandler: requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED' });
      return;
    }
    const { getReloadCountToday } = await import('../lib/reload-context-counter.js');
    try {
      const state = await withTenantContext(prisma, auth.companyId, async (tx) =>
        getReloadCountToday(tx, { companyId: auth.companyId, supervisorId: auth.userId }),
      );
      reply.code(200).send({
        dailyLimit: RELOAD_CONTEXT_DAILY_LIMIT,
        usedToday: state.usedToday,
        remaining: state.remaining,
        nextResetAt: state.nextResetAt.toISOString(),
      });
    } catch (err) {
      if (err && typeof err === 'object' && 'statusCode' in err && err.statusCode === 403) {
        reply.code(403).send({ error: 'COMPANY_NOT_ACTIVE' });
        return;
      }
      throw err;
    }
  });
}
