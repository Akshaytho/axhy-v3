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

# Wave 4b — Phase 1: Cost Protection (Detailed Sub-Task Plan)

**Date:** 2026-05-10
**Phase:** 1 of 4 in Wave 4b
**Branch:** `feat/phase-c-wave-4b-chat-completion` (created in Task 1.0)
**Source spec:** `axhy-v3/docs/specs/2026-05-09-phase-c-spec-2-ai-chat-design.md` §9 (per-tenant daily AI cost ceiling)
**Parent plan:** `axhy-v3/docs/plans/2026-05-10-phase-c-wave-4b-chat-completion.md`
**Production-ready rule:** `feedback_production_ready_no_patch_work.md` (locked 2026-05-10) — applies to every sub-task in this plan, no exceptions

---

## Top-level commitment

Every sub-task below is production-ready by the criteria in `feedback_production_ready_no_patch_work.md`. Patch-work signals to catch before any commit:

1. Would this survive a 100-tenant production load right now?
2. If malformed input hit this path, is the error user-clear AND audit-traceable?
3. If two concurrent requests hit this code, is the result deterministic?
4. If the column / table / route I depend on is missing, what happens?
5. If I'm woken at 2am because this broke, is the log line enough?

All five must answer "yes" before any commit.

---

## Why Phase 1 first (panel locked, do not reorder)

- **Maya Krishnan:** Without cost ceiling, Phase 2 (LivingDoc) and Phase 3 (more tools) BOTH increase per-call complexity. Cost ceiling is the safety net that makes those phases shippable.
- **Naina Bansal:** Master plan §B locks AI cost at ₹2/visit. Today there is zero enforcement. A single runaway tenant could burn unbounded — kills 30% margin from one bad customer.
- **Vikram Shah:** Cost is per-tenant. RLS-grade scoping must exist on the spend column from day one or we get cross-tenant cost leakage in production.
- **Eric Chen (10-yr arc):** Without measurement infra (the spend column + alerts), we have no way to know whether Phase 2's caching wins are real. Phase 1 is the measurement substrate.

---

## Phase 1 spec coverage (Spec 2 §9)

| Spec § | Feature                                                        | Phase 1 task  |
| ------ | -------------------------------------------------------------- | ------------- |
| §9.1   | `Company.aiSpendDailyInr` Decimal column                       | 1.1           |
| §9.2   | Gateway check (₹3K warn, ₹5K cap, AICostBudgetError)           | 1.2, 1.3, 1.4 |
| §9.3   | Daily reset cron at midnight UTC                               | 1.5           |
| §9.4   | Hard-cap UX (429 + friendly mobile error) + Owner alert outbox | 1.6, 1.7      |
| §9.5   | Integration test (simulate burn, assert 429 fires)             | 1.8           |

After Phase 1 close (Task 1.9), §9 is 100% shipped. Done-memo will mark every row ✅ with commit SHA.

---

## Pre-flight (before any task starts)

Verify environment is ready:

```bash
# (a) Repo state
cd /Users/thotaakshay/eclean_workspace/axhy-v3
git status                           # expect: clean tree on feat/phase-c-wave-4a-pro-chat-domination
git branch --show-current            # expect: feat/phase-c-wave-4a-pro-chat-domination
git log --oneline -5                 # expect: b42fcc3 + 80ba614 at top

# (b) Backend dev server
curl -s http://localhost:4000/health # expect: 200
# If not running: cd apps/backend && pnpm dev (port 4000)

# (c) Outbox dispatcher
ps aux | grep outbox-dispatcher      # expect: running PID
# If not: pnpm --filter @axhy/backend dispatch (or whatever the existing command is)

# (d) Expo dev server (only needed for Task 1.6)
curl -s http://localhost:8081/       # expect: 200 (Metro bundler)

# (e) Railway sandbox connectivity
railway status                       # expect: linked to Eclean_future
psql "$DATABASE_URL" -c '\l'         # expect: railway DB connection ok

# (f) Cost projector script
node scripts/project-costs.mjs --scenario big   # expect: numeric output
```

If any of (a)-(e) fail, halt — fix infra before starting. (f) is run again as part of Task 1.1.

---

## Task 1.0 — Migration-auth panel poll + branch creation

### Description

Per `feedback_no_ui_code_without_panel_approval.md` Iteration 5, DB migrations against Railway sandbox require a panel poll (3-6 voices) BEFORE the migration runs. Consensus = execute without founder ack. Dissent = escalate.

This task: (a) run that panel poll for the upcoming Phase 1 schema change, (b) create the Wave 4b feature branch, (c) push branch with upstream tracking. No code edits in this task itself.

### Production-ready criteria

- Branch is clean — no orphaned files from prior wave
- Branch tracks remote so push/pull is one-step
- Panel poll captured in commit message of Task 1.1 (not lost)
- No accidental main-branch commits

### Files affected

- git only (no file edits)

### Implementation steps

1. Verify clean working tree on `feat/phase-c-wave-4a-pro-chat-domination` (no uncommitted Wave 4a-PRO leftovers)
2. Pull latest: `git pull --ff-only`
3. Create branch: `git checkout -b feat/phase-c-wave-4b-chat-completion`
4. Push with tracking: `git push -u origin feat/phase-c-wave-4b-chat-completion`
5. Capture panel poll output in this plan's "Panel review" section below (resolves Iter 5 requirement)

### Panel review (Iteration 5 migration-auth poll)

**Hari (DB ops):** "Adding one nullable Decimal column with default 0 to Company table is the safest migration shape — no data movement, no nullability flip on existing data, sub-second on Railway sandbox. ✅ approve."

**Maya Krishnan (architecture):** "Branching off `feat/phase-c-wave-4a-pro-chat-domination` (not main) is right because PR #5 hasn't merged yet and we don't want to fork two diverging chat surfaces. ✅ approve. Once PR #5 merges, rebase Wave 4b onto main."

**Vikram Shah (multi-tenant):** "`Company.aiSpendDailyInr` is per-tenant by definition (FK is `id` on Company). RLS scoping is implicit. Increment SQL must use `WHERE id = $companyId` always. ✅ approve, with the SQL discipline noted."

**Naina Bansal (cost):** "Migration is reversible (drop column = no data loss because column starts at 0). Cost projector will be run before commit per Iter 4 §A. ✅ approve."

**Consensus:** 4/4 voices approve. No dissent → execute Task 1.1 migration after branch is created.

### Verification

```bash
git status                                    # expect: On branch feat/phase-c-wave-4b-chat-completion, nothing to commit
git log --oneline -5                          # expect: same SHAs as parent branch
git branch -vv                                # expect: tracking remote
```

### Rollback

- Branch deletion: `git checkout feat/phase-c-wave-4a-pro-chat-domination && git branch -D feat/phase-c-wave-4b-chat-completion && git push origin --delete feat/phase-c-wave-4b-chat-completion`
- No data state to roll back; this is git only

---

## Task 1.1 — Schema column + migration + Railway sandbox apply

### Description

Add `Company.aiSpendDailyInr Decimal @default(0) @db.Decimal(10, 2)` column. Migration is additive; column is NOT NULL with default 0 so existing rows are valid immediately. Apply to Railway sandbox DB. Cost projector run captured in commit message.

### Production-ready criteria

- Decimal precision sufficient for any plausible daily spend (₹99,99,999.99 max — way past any cap)
- Default 0 means rollback is safe (just drop the column)
- No `/// @personal` annotation — `aiSpendDailyInr` is a financial counter, not personal data (Vinod confirms via DPDP scoping rule)
- Inline comment names the spec section so future readers find the rule
- Prisma client regenerated; downstream packages get the new field type
- Cost projector output captured in commit body for audit trail

### Files affected

- `packages/shared-schema/prisma/schema.prisma` — add column to Company model
- `packages/shared-schema/prisma/migrations/<ts>_phase_c_wave_4b_cost_protection/migration.sql` — new migration
- `packages/shared-schema/prisma/migrations/migration_lock.toml` — auto-updated
- Generated Prisma client (gitignored / regenerated)

### Implementation steps

1. Run cost projector pre-migration:

   ```bash
   node scripts/project-costs.mjs --scenario big > /tmp/wave-4b-phase-1-cost-projection-big.txt
   node scripts/project-costs.mjs --scenario pilot > /tmp/wave-4b-phase-1-cost-projection-pilot.txt
   ```

   Capture both — embed in commit message.

2. Edit `packages/shared-schema/prisma/schema.prisma`. In `model Company { ... }`, add:

   ```prisma
   /// daily AI spend in INR; reset at UTC midnight per Spec 2 §9.3
   aiSpendDailyInr Decimal @default(0) @db.Decimal(10, 2)
   ```

   (NOT `/// @personal` — financial counter is not personal data per Vinod's DPDP scoping in `feedback_pii_field_requires_personal_annotation.md`.)

3. Generate migration without applying:

   ```bash
   pnpm --filter @axhy/shared-schema prisma migrate dev \
     --name phase_c_wave_4b_cost_protection \
     --create-only
   ```

4. Inspect generated SQL — should be exactly one `ALTER TABLE` adding the column with default 0. If anything else appears (data movement, index creation we didn't ask for), STOP and investigate.

5. Add reverse-migration documentation in commit body:

   ```sql
   -- ROLLBACK
   ALTER TABLE axhy."Company" DROP COLUMN "aiSpendDailyInr";
   ```

   (Do NOT add a separate `down.sql` file — Prisma doesn't use those; commit-body documentation is the audit trail.)

6. Apply to Railway sandbox:

   ```bash
   railway run --service Postgres -- pnpm --filter @axhy/shared-schema prisma migrate deploy
   ```

7. Verify column exists on Railway:

   ```bash
   railway run --service Postgres -- psql -c '\d axhy."Company"' | grep aiSpendDailyInr
   # expect: aiSpendDailyInr | numeric(10,2) | not null default 0
   ```

8. Regenerate Prisma client locally:

   ```bash
   pnpm --filter @axhy/shared-schema prisma generate
   ```

9. Type-check across monorepo to confirm new field is visible:

   ```bash
   pnpm typecheck
   ```

10. Commit:

    ```
    feat(schema): add Company.aiSpendDailyInr for daily AI cost ceiling

    Spec 2 §9.1. Decimal(10,2) NOT NULL DEFAULT 0 — additive migration,
    safe rollback via ALTER TABLE DROP COLUMN. Applied to Railway sandbox
    via prisma migrate deploy.

    Cost projection (pilot 5 customers): <pasted output>
    Cost projection (big 1000 customers): <pasted output>

    No /// @personal — financial counter, not personal data (DPDP scoping
    rule per feedback_pii_field_requires_personal_annotation.md).

    Iter 5 panel poll: Hari + Maya + Vikram + Naina approved (4/4), see
    docs/plans/2026-05-10-phase-c-wave-4b-phase-1-detailed.md §1.0.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```

### Panel review

**Hari:** "Decimal(10, 2) — 8 digits before decimal, 2 after. Max ₹99,99,999.99 per day. At ₹500/day average per supervisor that's a 19,998-supervisor tenant before overflow. Margin is 100x; ✅."

**Vikram Shah:** "Default 0 is right — every existing tenant immediately becomes valid. No NULL handling needed in code paths."

**Maya Krishnan:** "Single column, single concept, single retention. Doesn't violate `feedback_no_premature_schema_slots`. ✅."

**Vinod (DPDP):** "Financial counters are explicitly out of DPDP personal-data scope. Confirmed no `/// @personal` needed."

**Eric Chen (day-365):** "After 1 year of pilot, this column has been incremented ~365 × N tenants × ~100 chats/day = N × 36,500 increments. Single Postgres ALTER TABLE handles that fine — no perf concern. ✅."

### Verification

- `git diff` shows ONLY the schema.prisma + migration.sql additions (no incidental changes)
- Railway sandbox `\d "Company"` shows the new column
- `pnpm typecheck` green
- `pnpm --filter @axhy/shared-schema test` green (if package has tests)

### Rollback

1. Code-side: `git revert <commit-sha>` and force-push (only acceptable on feature branch)
2. Schema-side: connect to Railway → `ALTER TABLE axhy."Company" DROP COLUMN "aiSpendDailyInr";`
3. Migration history: `prisma migrate resolve --rolled-back phase_c_wave_4b_cost_protection`

---

## Task 1.2 — Constants in @axhy/business-rules + Gateway extension + AICostBudgetError

### Description

Move ₹3K and ₹5K thresholds to `@axhy/business-rules` (NOT inline). Extend existing `assertWithinBudget(surface, estimatedCostInr)` body in `@axhy/ai-tools/model-policy.ts` to ALSO enforce per-tenant daily cap. Introduce `AICostBudgetError` typed exception. New `cost-tracking.ts` helper with `incrementSpend` and `dispatchBudgetAlert` (idempotent).

### Production-ready criteria

- ZERO hardcoded ₹3000 / ₹5000 in non-business-rules files (grep verified)
- Gateway extension PRESERVES existing single-chokepoint contract — new function signature is backward-compatible (optional `ctx` parameter)
- `AICostBudgetError` is a named class, not a magic string — consumers can instanceof-check
- Idempotency on alerts is database-enforced (unique key), not best-effort in code
- Error message is operator-friendly: tenant ID, current spend, cap — sufficient for 2am incident triage
- Unit tests cover threshold-exact, threshold±1, threshold±0.01 (Decimal precision matters)
- No `any` types; all helpers exported with explicit return types

### Files affected

- `packages/business-rules/src/constants.ts` — extend with budget constants (read existing first to confirm location)
- `packages/business-rules/src/index.ts` — re-export
- `packages/ai-tools/src/model-policy.ts` — extend `assertWithinBudget` body
- `packages/ai-tools/src/errors.ts` — NEW (or extend if file exists)
- `packages/ai-tools/src/cost-tracking.ts` — NEW (helper module)
- `packages/ai-tools/src/index.ts` — re-export new symbols
- `packages/ai-tools/test/budget.test.ts` — NEW (unit tests)

### Implementation steps

1. **Read existing structure first** (no edits yet):

   ```bash
   ls packages/business-rules/src/
   ls packages/ai-tools/src/
   cat packages/ai-tools/src/model-policy.ts | head -100
   ```

2. **Add constants** to `packages/business-rules/src/constants.ts`:

   ```ts
   /// @derives axhy-v3/docs/specs/2026-05-09-phase-c-spec-2-ai-chat-design.md §9.5
   /** Soft warn threshold for per-tenant daily AI spend (INR). Owner gets outbox alert. */
   export const AI_BUDGET_DAILY_WARN_INR = 3000;

   /// @derives axhy-v3/docs/specs/2026-05-09-phase-c-spec-2-ai-chat-design.md §9.5
   /** Hard cap for per-tenant daily AI spend (INR). Throws AICostBudgetError → 429. */
   export const AI_BUDGET_DAILY_CAP_INR = 5000;
   ```

3. **Re-export** from `packages/business-rules/src/index.ts`.

4. **Create `packages/ai-tools/src/errors.ts`** (or extend existing):

   ```ts
   /// @derives axhy-v3/docs/specs/2026-05-09-phase-c-spec-2-ai-chat-design.md §9.4
   export class AICostBudgetError extends Error {
     readonly companyId: string;
     readonly currentSpendInr: number;
     readonly capInr: number;
     readonly attemptedCostInr: number;

     constructor(args: {
       companyId: string;
       currentSpendInr: number;
       capInr: number;
       attemptedCostInr: number;
     }) {
       super(
         `AI_BUDGET_EXCEEDED: tenant ${args.companyId} at ₹${args.currentSpendInr.toFixed(2)}` +
           ` + ₹${args.attemptedCostInr.toFixed(2)} ≥ cap ₹${args.capInr.toFixed(2)}`,
       );
       this.name = 'AICostBudgetError';
       this.companyId = args.companyId;
       this.currentSpendInr = args.currentSpendInr;
       this.capInr = args.capInr;
       this.attemptedCostInr = args.attemptedCostInr;
     }
   }
   ```

5. **Create `packages/ai-tools/src/cost-tracking.ts`** with `incrementSpend` (atomic SQL) and `dispatchBudgetAlert` (idempotent outbox). Both take an explicit `prisma` parameter so the caller controls transaction scope.

6. **Extend `assertWithinBudget`** in `model-policy.ts`:
   - Existing per-surface check unchanged (top of function)
   - NEW optional `ctx?: { companyId: string; prisma: PrismaClient }` parameter
   - If `ctx` provided: fetch `Company.aiSpendDailyInr`; compute `projected = current + estimatedCost`
   - If `projected >= AI_BUDGET_DAILY_CAP_INR` → throw `AICostBudgetError`
   - If `current < AI_BUDGET_DAILY_WARN_INR` AND `projected >= AI_BUDGET_DAILY_WARN_INR` → call `dispatchBudgetAlert(companyId, 'owner.ai_budget_warning', prisma)` (idempotent)

7. **Re-export** new symbols from `@axhy/ai-tools/src/index.ts`.

8. **Unit tests** in `packages/ai-tools/test/budget.test.ts`. Use a real Prisma client wired to test schema (no mocking Prisma per production-ready rule §6). Boundary cases:
   - `current=0, est=0.01` → no warn, no cap
   - `current=2999.99, est=0.01` → warn fires (projected=3000.00)
   - `current=2999.99, est=0.00` → no warn (projected unchanged)
   - `current=3000.00, est=0` → no NEW warn (already past threshold; `current < WARN_INR` false)
   - `current=4999.99, est=0.02` → cap throws
   - `current=4999.00, est=1.00` → cap throws (projected=5000.00 exactly)
   - `current=5000.00, est=0` → cap throws on next call regardless of est
   - missing column (migration not run) → throws helpful error, not Prisma raw error
   - Decimal precision: `current=2999.999999, est=0.000001` → handles paise-level math correctly

9. **ESLint** passes; `pnpm typecheck` green.

10. **Commit:**

    ```
    feat(ai-tools): add AI budget gateway with daily cap + warn

    Spec 2 §9.2/§9.4. Constants moved to @axhy/business-rules
    (AI_BUDGET_DAILY_WARN_INR, AI_BUDGET_DAILY_CAP_INR) — no hardcoded
    thresholds in any non-business-rules file (grep clean).

    assertWithinBudget extended with optional ctx.{companyId, prisma};
    new AICostBudgetError class. cost-tracking.ts adds incrementSpend
    (atomic SQL) and dispatchBudgetAlert (idempotent outbox).

    Unit tests cover threshold-exact, threshold±0.01, missing-column
    fallback, Decimal precision. No mocked Prisma — real test schema.

    Panel: Naina (thresholds) + Maya (single chokepoint) + Aanya (surface
    enum integrity) + Eric (day-365 ₹5K still right at scale) — converged.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```

### Panel review

**Naina Bansal:** "Constants in `@axhy/business-rules` so a future `OWNER` tier can override per-tenant without code change. ✅."

**Maya Krishnan:** "Optional `ctx` parameter preserves backward compat with existing call sites. Single chokepoint stays single. ✅."

**Aanya Mehta:** "Surface enum is preserved — gateway still routes through `modelFor(surface)`. No raw model strings introduced. ✅."

**Eric Chen (day-365):** "Will ₹5000/day still be right at 1000 supervisors per tenant? Math: ₹5000 / 1000 supervisors = ₹5/supervisor/day. Average load is ₹0.65/supervisor/day. ₹5K cap = ~7.5x normal at the 1000-supervisor extreme — still catches runaway loops without nuking legitimate heavy days. ✅."

**Vikram Shah:** "`Company.aiSpendDailyInr` query and increment ALWAYS scoped by `id = $companyId`. Confirm in code review."

### Verification

- `pnpm --filter @axhy/ai-tools test` green (all 9 boundary cases)
- `pnpm typecheck` green
- `pnpm lint` green
- `grep -RnE '(3000|5000)' packages/ai-tools/src apps/backend/src` returns ONLY references to `AI_BUDGET_DAILY_WARN_INR` / `AI_BUDGET_DAILY_CAP_INR` from `@axhy/business-rules` (NOT raw numbers)

### Rollback

- Revert commit on feature branch — no DB changes in this task

---

## Task 1.3 — AI-impact-analyzer grep + wrap every AI call site + ESLint rename

### Description

Per `feedback_ai_impact_analyzer_v3_default.md`, before cross-cutting changes, run grep+reason to enumerate impact. Find EVERY AI call site in the monorepo. Confirm each routes through `assertWithinBudget` with the new `ctx` parameter. Wrap any uncovered ones. Rename ESLint rule `no-raw-anthropic-call` → `no-raw-llm-call` since OpenAI swap commit `80ba614`.

### Production-ready criteria

- 100% of AI call sites wrapped — provable via grep
- ESLint custom rule renamed AND detection logic updated to also catch OpenAI direct calls
- Every wrapped site also calls `incrementSpend` AFTER successful AI response, in same DB transaction
- Existing tests still pass — no behavior regression on the chat happy path
- No bypass paths created (e.g., a "skip-budget" flag)

### Files affected

- `apps/backend/src/routes/chat.ts` — confirm wrap (likely already partially correct)
- `packages/ai-tools/src/openai-tool-loop.ts` — internal call site
- Any cron jobs that invoke AI (likely zero today; verify)
- ESLint config: `tools/eslint-plugin-axhy/rules/no-raw-anthropic-call.js` → rename to `no-raw-llm-call.js`
- ESLint config consumer files (`.eslintrc.cjs` or similar)
- Any test fixture file that references the old rule name

### Implementation steps

1. **AI-impact-analyzer grep** — enumerate every AI call site:

   ```bash
   grep -RnE 'openai\.(chat|completions|messages)\.create|anthropic\.messages\.create|openaiToolLoop|sonnetToolLoop|invokeLLM|callLLM' \
     apps/ packages/ \
     --include='*.ts' --include='*.tsx' \
     | grep -v node_modules \
     | grep -v dist
   ```

2. **Build the impact table** — for each match, capture:
   - File:line
   - Function context
   - Surface (enum value)
   - Currently wrapped? (Y/N)
   - Has incrementSpend after? (Y/N)
   - Notes

3. **For every "N"**: add the wrap. Wrap shape:

   ```ts
   await assertWithinBudget(surface, estimatedCost, { companyId, prisma });
   const response = await openai.chat.completions.create(...);
   await incrementSpend(companyId, computedCost, prisma);   // same tx as ChatMessage write
   ```

4. **Rename ESLint rule:**
   - File rename: `no-raw-anthropic-call.js` → `no-raw-llm-call.js`
   - Update rule message: "Direct LLM calls (Anthropic, OpenAI, etc.) are banned. Use @axhy/ai-tools wrappers."
   - Detection logic: match `anthropic.messages.create`, `openai.chat.completions.create`, `openai.completions.create`, future providers
   - Update `.eslintrc.cjs` rule name reference
   - Update any test snapshot

5. **Run ESLint across monorepo:**

   ```bash
   pnpm lint
   ```

   Expect: 0 violations. If any → wrap that site OR (if it's `model-policy.ts` itself) add to the rule's allowlist.

6. **Run grep AGAIN** as final check:

   ```bash
   grep -RnE 'openai\.(chat|completions|messages)\.create|anthropic\.messages\.create' \
     apps/ packages/ \
     --include='*.ts' --include='*.tsx' \
     | grep -v node_modules \
     | grep -v 'src/model-policy.ts' \
     | grep -v 'src/openai-tool-loop.ts' \
     | grep -v dist
   ```

   Expect: zero hits (only model-policy.ts and the ai-tools internal loop are allowed to call providers).

7. **Run all tests** to confirm no regression:

   ```bash
   pnpm test
   ```

8. **Commit:**

   ```
   refactor(ai-tools): wrap all LLM call sites with budget gateway

   Spec 2 §9.2. AI-impact-analyzer grep enumerated N call sites
   (table in commit body); all now route through assertWithinBudget
   with ctx.{companyId, prisma}.

   ESLint rule no-raw-anthropic-call → no-raw-llm-call (post OpenAI
   swap in commit 80ba614). Detection covers OpenAI + Anthropic.
   Final grep clean: 0 hits outside model-policy.ts and ai-tools loop.

   Existing chat.test.ts + chat-tool-loop.test.ts still green.

   Panel: Maya (gateway pattern) + Aanya (no raw model strings) — converged.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   ```

### Panel review

**Maya Krishnan:** "Single chokepoint preserved. Every AI call now passes through one function. ✅."

**Aanya Mehta:** "ESLint rename catches the OpenAI swap regression — rule name no longer lies. ✅."

**Hari:** "Grep before AND after the change is the right discipline — proves coverage instead of assumes it. ✅."

### Verification

- Grep returns 0 unwrapped sites
- `pnpm lint` green with renamed rule
- `pnpm test` green (no regression)
- Impact table captured in commit body for audit

### Rollback

- Revert commit; ESLint rule rename is reversible via git
- No DB state changes

---

## Task 1.4 — Atomic increment in chat write transaction

### Description

Implement `incrementSpend(companyId, costInr, prisma)` using raw SQL `UPDATE ... SET aiSpendDailyInr = aiSpendDailyInr + $1 WHERE id = $2`. Race-safe at 50-concurrent semaphore. Wire into chat route's transaction so increment commits atomically with the ChatMessage row.

### Production-ready criteria

- Atomic at the database level (no read-modify-write in app code)
- Always scoped by `companyId` — cross-tenant isolation provable
- Costs that are null/undefined throw immediately, never silently skip
- Concurrency-tested: 50 simultaneous increments converge to correct sum
- Failures roll back the parent transaction (no orphan ChatMessage rows with no spend update)
- Structured log for every increment (tenant, amount, new total) at debug level (production tunable)

### Files affected

- `packages/ai-tools/src/cost-tracking.ts` — `incrementSpend` implementation
- `apps/backend/src/routes/chat.ts` — call site inside the existing chat write transaction
- `packages/ai-tools/test/cost-tracking.test.ts` — concurrency test

### Implementation steps

1. Implement `incrementSpend`:

   ```ts
   import type { PrismaClient } from '@axhy/shared-schema';

   /// @derives axhy-v3/docs/specs/2026-05-09-phase-c-spec-2-ai-chat-design.md §9.2
   export async function incrementSpend(
     companyId: string,
     costInr: number,
     prisma: PrismaClient,
   ): Promise<void> {
     if (typeof costInr !== 'number' || Number.isNaN(costInr) || costInr < 0) {
       throw new Error(`incrementSpend: invalid costInr=${costInr} for tenant=${companyId}`);
     }
     const rows = await prisma.$executeRaw`
       UPDATE axhy."Company"
       SET "aiSpendDailyInr" = "aiSpendDailyInr" + ${costInr}
       WHERE "id" = ${companyId}::uuid
     `;
     if (rows === 0) {
       throw new Error(`incrementSpend: no Company row matched id=${companyId}`);
     }
   }
   ```

2. Wire into chat route — find the existing transaction that writes ChatMessage:

   ```ts
   await prisma.$transaction(async (tx) => {
     await tx.chatMessage.create({
       /* existing */
     });
     await tx.chatThread.update({
       /* existing */
     });
     await incrementSpend(companyId, computedCost, tx); // NEW
     await tx.auditEvent.create({
       /* existing */
     });
   });
   ```

3. **Concurrency test** (`packages/ai-tools/test/cost-tracking.test.ts`):
   - Seed `axhy-sandbox` Company with `aiSpendDailyInr = 0`
   - Fire 50 concurrent `incrementSpend(id, 1.00, prisma)` calls via `Promise.all`
   - Assert final `aiSpendDailyInr === 50.00` (within Decimal precision)
   - Assert NO lost increments (the production-ready criterion)
   - Cleanup: reset to 0

4. **Edge case tests:**
   - `costInr = NaN` → throws
   - `costInr = -1` → throws
   - `costInr = undefined` → throws (TS prevents but runtime check too)
   - `companyId = 'non-existent-uuid'` → throws "no Company row matched"
   - `companyId` of one tenant doesn't affect another tenant's `aiSpendDailyInr`

5. Run test:

   ```bash
   pnpm --filter @axhy/ai-tools test cost-tracking
   ```

6. Commit:

   ```
   feat(ai-tools): atomic incrementSpend in chat write transaction

   Spec 2 §9.2. Raw UPDATE with WHERE id = $companyId — race-free at
   50-concurrent semaphore (test seeds 0, fires 50 parallel increments
   of ₹1, asserts final = ₹50).

   Wired into chat.ts $transaction so increment commits with ChatMessage
   row atomically. Failures roll back both — no orphan messages.

   Panel: Vikram (tenant scoping) + Maya (race-free, no app-level RMW) — converged.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   ```

### Panel review

**Vikram Shah:** "WHERE id = $companyId is in every code path. Cross-tenant test included. ✅."

**Maya Krishnan:** "$executeRaw makes the increment atomic at the DB layer — no app-level read-modify-write race. ✅."

**Hari:** "Concurrency test fires 50 in Promise.all on real Postgres — that's the production-ready validation, not a unit test mock. ✅."

### Verification

- `pnpm test cost-tracking` — all cases green
- 50-concurrent test converges deterministically
- Manual sanity: trigger one chat in sandbox, query `Company.aiSpendDailyInr`, see it incremented

### Rollback

- Revert commit; column remains untouched (just no further increments)
- Manual reset: `UPDATE axhy."Company" SET "aiSpendDailyInr" = 0;`

---

## Task 1.5 — Daily reset cron at midnight UTC

### Description

New cron job `apps/backend/src/jobs/reset-ai-spend.ts`. Schedule: `0 0 * * *` (midnight UTC). Body: `UPDATE axhy."Company" SET "aiSpendDailyInr" = 0`. Register in existing cron registry alongside outbox dispatcher.

### Production-ready criteria

- Idempotent — safe to fire twice (zero is zero)
- Logs structured success/failure with tenant count
- Audit event per reset for compliance trail
- UTC vs IST timing documented in code + commit message
- Cron registration is verifiable (server log on boot)
- Cron failure does NOT crash the server process

### Files affected

- `apps/backend/src/jobs/reset-ai-spend.ts` — NEW
- `apps/backend/src/server.ts` — register cron alongside outbox dispatcher
- `apps/backend/test/integration/reset-ai-spend.test.ts` — NEW

### Implementation steps

1. Read existing cron registry to confirm pattern (e.g., the outbox dispatcher registration). Don't reinvent — match the established shape.

2. Create job file:

   ```ts
   /// @derives axhy-v3/docs/specs/2026-05-09-phase-c-spec-2-ai-chat-design.md §9.3
   import type { FastifyInstance } from 'fastify';
   import type { PrismaClient } from '@axhy/shared-schema';

   /**
    * Daily reset of per-tenant AI spend at UTC midnight.
    *
    * UTC vs IST: midnight UTC = 5:30am IST. Mr. Reddy / Suresh persona on
    * day-365 sees fresh budget at 5:30am, before their workday starts.
    * Per-tenant local-time reset is deferred to Phase D (multi-region tenants).
    */
   export async function resetAiSpend(
     prisma: PrismaClient,
     log: FastifyInstance['log'],
   ): Promise<void> {
     const startedAt = Date.now();
     try {
       const result = await prisma.$executeRaw`
         UPDATE axhy."Company" SET "aiSpendDailyInr" = 0
       `;
       const durationMs = Date.now() - startedAt;
       log.info(
         { event: 'reset_ai_spend.success', tenantsReset: result, durationMs },
         'Daily AI spend reset completed',
       );
       // AuditEvent: one row per cron run (not per tenant) — bulk reset is the audited action
       await prisma.auditEvent.create({
         data: {
           kind: 'AI_SPEND_DAILY_RESET',
           payload: { tenantsReset: result, durationMs },
         },
       });
     } catch (err) {
       log.error(
         { event: 'reset_ai_spend.failure', err: (err as Error).message },
         'Daily AI spend reset FAILED — will retry next midnight UTC',
       );
       // Don't rethrow — cron failure must not crash server
     }
   }
   ```

3. Register in server.ts using the existing cron mechanism (same pattern as outbox dispatcher).

4. Integration test (`reset-ai-spend.test.ts`):
   - Seed three sandbox tenants with non-zero aiSpendDailyInr
   - Call `resetAiSpend(prisma, fakeLog)` directly
   - Assert all three are 0
   - Assert AuditEvent of kind `AI_SPEND_DAILY_RESET` exists with tenantsReset count
   - Run twice → second time, count is still N (idempotent: zero+zero=zero, but rows-affected unchanged)

5. **Cron-firing test** (gentler — verify registration without waiting 24h):
   - Server start log includes line `Registered cron: reset-ai-spend at 0 0 * * *`
   - Verify by booting server in test, checking log buffer

6. Commit:

   ```
   feat(backend): daily reset cron for Company.aiSpendDailyInr

   Spec 2 §9.3. Cron 0 0 * * * (UTC midnight = 5:30am IST). Bulk UPDATE
   ... SET aiSpendDailyInr = 0 + AuditEvent of kind AI_SPEND_DAILY_RESET.

   Cron failure logged at error level but does NOT crash server (next
   midnight retries). Per-tenant local-time reset deferred to Phase D.

   Integration test: 3 tenants → reset → all 0 + audit row written.
   Idempotent: second run leaves zeros zeros.

   Panel: Maya (cron registry parity) + Eric (UTC timing documented) — converged.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   ```

### Panel review

**Maya Krishnan:** "Same registration pattern as outbox dispatcher — no novelty. ✅."

**Eric Chen:** "UTC vs IST documented in code comment AND commit message. Future maintainer won't be surprised. ✅."

**Naina Bansal:** "Idempotency on the SQL is implicit (zero=zero); idempotency in the audit log is per-run not per-tenant — that's intentional, since the cron run is the audited entity. ✅."

### Verification

- `pnpm test reset-ai-spend` green
- Boot server locally, observe cron registration log
- (24h) Wait for first midnight UTC, verify Railway audit log has one entry

### Rollback

- Revert commit; cron is unregistered, manual SQL reset still possible

---

## Task 1.6 — Mobile 429 AI_BUDGET_EXCEEDED UX (Expo Fast Refresh + Playwright + panel)

### Description

Mobile chat client maps `429 { error: 'AI_BUDGET_EXCEEDED' }` to a typed error and renders a friendly inline banner. Distinct from network-error and 503-retry UX. Iterate via Expo Fast Refresh; finalize via headed Playwright; 4-voice panel critique BEFORE founder iPhone test.

### Production-ready criteria

- Error type is named (`AIBudgetExceededError`) with distinct handling, not a generic 4xx fallback
- Copy from `@axhy/copy` package (English + Hindi), not inline strings
- Visual distinct from network error (amber/warning, NOT red error)
- No retry button (distinct from 503 retry)
- Graceful degradation: user can scroll history, view sites, just can't send new chat
- Bundle hash verified post-deploy per `feedback_verify_deploy_via_actual_bundle`
- Playwright captures + panel sign-off documented in commit message
- Accessible: banner has role="alert" or equivalent

### Files affected

- `apps/mobile/src/lib/chat-api.ts` — error mapping (read existing first)
- `apps/mobile/src/lib/errors.ts` — NEW or extend, add `AIBudgetExceededError`
- `apps/mobile/src/screens/chat/ChatScreen.tsx` (or wherever the chat UI lives post-Wave 4a-PRO)
- `packages/copy/src/strings.ts` — add `aiBudgetExceeded.en` + `.hi` keys
- `apps/mobile/test/...` — UI snapshot + Playwright milestone

### Implementation steps

1. Verify Expo dev server + persistent browser tab open. Verify backend dev server running.

2. Read existing `chat-api.ts` to find current error mapping pattern.

3. Add typed error class (or extend existing errors module):

   ```ts
   export class AIBudgetExceededError extends Error {
     constructor() {
       super('AI_BUDGET_EXCEEDED');
       this.name = 'AIBudgetExceededError';
     }
   }
   ```

4. In chat-api response handler:

   ```ts
   if (response.status === 429) {
     const body = await response.json();
     if (body?.error === 'AI_BUDGET_EXCEEDED') {
       throw new AIBudgetExceededError();
     }
   }
   ```

5. Add copy keys to `@axhy/copy/src/strings.ts`:

   ```ts
   aiBudgetExceeded: {
     en: 'Daily AI usage limit reached. Try again tomorrow or contact your administrator.',
     hi: 'Aaj ki AI usage limit khatam ho gayi. Kal try karein ya admin ko bolen.',
   }
   ```

6. In ChatScreen catch block:
   - If `err instanceof AIBudgetExceededError` → set state to render the budget banner
   - Otherwise → existing error handling

7. Banner component:
   - Amber/yellow background tone (NOT red)
   - Icon: clock or wallet, NOT exclamation
   - Copy from `@axhy/copy`
   - NO retry button
   - Above the input, replacing the input (or disabling it)
   - History scrolling still works

8. Iterate via Expo Fast Refresh — keep browser tab at `http://localhost:8081/` open. After each edit, visually verify in the tab. NO Playwright run between every line change.

9. When change feels "done":

   ```bash
   # Headed Playwright capture
   node /tmp/wave-4b-1.6-screenshots.mjs
   ```

   Capture at:
   - Mobile 390×844: empty chat with banner, scrollable history with banner, after dismissing keyboard
   - Desktop 1280×800: same three states

10. Read screenshots myself (multimodal). Run 4-voice panel critique:
    - **Sara Park (visual hierarchy):** banner placement, color, weight, typography
    - **Priya Subramanian (UXR / readability):** copy clarity, English + Hindi parity, tone
    - **Suresh persona (day-365 cognitive load):** "Is this the third time this week I've hit the cap? Does this banner help me figure out who to call?"
    - **Megha (CMO first-impression):** "Does this look like a broken app or a graceful limit?"

11. Categorize feedback Tier 1 / Tier 2 / Tier 3. Fix Tier 1, re-screenshot, re-panel until panel says ship.

12. Verify bundle post-build (this is a mobile RN web build):

    ```bash
    curl -s http://localhost:8081/_expo/static/js/web/index.js -o /tmp/mobile-bundle.js
    grep -c 'aiBudgetExceeded' /tmp/mobile-bundle.js   # expect: > 0
    ```

13. Commit:

    ```
    feat(mobile): AI_BUDGET_EXCEEDED 429 UX with typed error + amber banner

    Spec 2 §9.4. Distinct from network and 503-retry UX: typed
    AIBudgetExceededError, amber/wallet iconography, no retry button,
    history scroll preserved (graceful degradation).

    Copy from @axhy/copy (en + hi). 4-voice panel sign-off captured below.

    Bundle verified: aiBudgetExceeded string present in compiled output.

    Panel sign-off:
    - Sara: amber + wallet icon distinct from network error ✅
    - Priya: en + hi copy reads as billing/usage limit, not breakage ✅
    - Suresh persona day-365: clear who to contact, no panic ✅
    - Megha: looks intentional, not broken ✅

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```

### Panel review (this task summary)

**Sara Park:** "Amber banner + wallet icon distinct from red-network-error. Replacing the input (vs floating modal) is the right pattern — user CAN'T accidentally send and waste a roundtrip. ✅."

**Priya Subramanian:** "Hindi copy uses Roman script per existing app convention; reads at 5th-grade Hindi level. ✅."

**Suresh persona day-365:** _"Banner mein 'admin ko bolen' likha hai — tab mujhe pata hai HR ko bolna hai, owner ko nahi. ✅."_

**Megha (CMO):** "Banner copy doesn't say 'error' or 'failed' — says 'limit reached'. Sets expectation that this is a NORMAL part of the product, not a bug. ✅."

### Verification

- Playwright captures stored, attached to PR
- Panel critique captured in commit message
- Manual iPhone smoke test by founder AFTER panel sign-off (separate event)
- Bundle grep confirms copy is in shipped output

### Rollback

- Revert commit; mobile reverts to generic 4xx error (suboptimal but not broken)

---

## Task 1.7 — Outbox alerts (owner.ai_budget_warning + owner.ai_budget_capped)

### Description

Wire `dispatchBudgetAlert(companyId, kind, prisma)` to emit Outbox topics. Idempotent per-tenant-per-day via daily key. Topics route to OWNER per `feedback_phase_c_approver_role_principle` (money + legal anchor). Dispatcher delivery is stub for Wave 4b; real Slack/email wiring is Phase D — but stub is EXPLICIT, named, gated, NOT silent.

### Production-ready criteria

- Idempotency is database-enforced (unique constraint on `(companyId, kind, dateUtc)`), not best-effort
- Stub dispatcher logs at info level with full context — operator can tail logs to confirm alerts fire even before real delivery is wired
- Outbox topics registered in central registry, not free-form strings
- Payload schema validated by Zod
- Cross-tenant isolation: Tenant A's alert never delivered to Tenant B's owner (test included)

### Files affected

- `apps/backend/src/lib/outbox.ts` — register new topics (read existing first)
- `packages/ai-tools/src/cost-tracking.ts` — `dispatchBudgetAlert` implementation
- `apps/backend/src/jobs/outbox-dispatcher.ts` — handle the new topics (stub log + audit, real delivery Phase D)
- `apps/backend/test/integration/owner-budget-alerts.test.ts` — NEW

### Implementation steps

1. Read existing outbox structure — confirm topic registration pattern.

2. Register topics:

   ```ts
   export const OUTBOX_TOPICS = {
     // ... existing
     OWNER_AI_BUDGET_WARNING: 'owner.ai_budget_warning',
     OWNER_AI_BUDGET_CAPPED: 'owner.ai_budget_capped',
   } as const;
   ```

3. Define Zod payload:

   ```ts
   export const aiBudgetAlertPayload = z.object({
     companyId: z.string().uuid(),
     currentSpendInr: z.number().nonnegative(),
     capInr: z.number().positive(),
     dateUtc: z.string(), // ISO date
   });
   ```

4. `dispatchBudgetAlert` in `cost-tracking.ts`:

   ```ts
   export async function dispatchBudgetAlert(
     companyId: string,
     kind: 'owner.ai_budget_warning' | 'owner.ai_budget_capped',
     prisma: PrismaClient,
   ): Promise<void> {
     const dateUtc = new Date().toISOString().slice(0, 10);
     // Idempotent: unique key (companyId, kind, dateUtc)
     try {
       await prisma.outbox.create({
         data: {
           companyId,
           topic: kind,
           payload: {
             /* ... */
           },
           idempotencyKey: `${companyId}:${kind}:${dateUtc}`,
         },
       });
     } catch (err) {
       // Unique constraint violation = already alerted today — that's the desired idempotency
       if (isPrismaUniqueViolation(err)) return;
       throw err;
     }
   }
   ```

5. Add unique constraint to Outbox `idempotencyKey` if not already present (separate sub-migration if needed; surface in panel review if so — could be Task 1.7.1 if migration required).

6. Outbox dispatcher handles new topics:

   ```ts
   case OUTBOX_TOPICS.OWNER_AI_BUDGET_WARNING:
   case OUTBOX_TOPICS.OWNER_AI_BUDGET_CAPPED: {
     log.info(
       { event: 'owner_budget_alert', topic, companyId, payload },
       `Owner budget alert: ${topic} (Phase D will wire Slack/email delivery)`,
     );
     await prisma.auditEvent.create({ data: { kind: 'OWNER_BUDGET_ALERT_DISPATCHED', companyId, payload } });
     // PHASE D: wire MSG91/Slack/email here
     break;
   }
   ```

7. Integration test:
   - Trigger warn → assert exactly 1 outbox row
   - Trigger warn AGAIN same day → assert STILL 1 outbox row (idempotency holds)
   - Trigger cap → assert 2 outbox rows (warn + cap)
   - Trigger warn for Tenant A → assert Tenant B has 0 alerts

8. Commit (similar shape to prior tasks, includes panel attribution).

### Panel review

**Mr. Reddy persona day-365:** _"₹3K warn 1 din pehle aaye — main HR ko bol kar limit badha sakta hu, panic se bach sakta hu. ✅."_

**Naina Bansal:** "80% threshold gives ~1-day buffer for owner action before hard cap. Right shape. ✅."

**Vikram Shah:** "Idempotency key includes companyId — no cross-tenant key collision possible. Cross-tenant isolation test confirms. ✅."

**Maya Krishnan:** "Stub dispatcher is EXPLICIT (logs at info, writes audit row) — not silent. Phase D wiring path is named in code comment. Production-ready by the rule. ✅."

### Verification

- `pnpm test owner-budget-alerts` green (4 cases)
- Triggering warn manually in sandbox creates exactly one outbox row + audit row
- Re-trigger same day creates zero new rows

### Rollback

- Revert commit; outbox topic ids harmless if left registered

---

## Task 1.8 — Cost ceiling integration test on real Railway

### Description

Comprehensive test in `apps/backend/test/integration/cost-ceiling.test.ts`. Real Railway via `axhy-sandbox` tenant. NO mocked DB. OpenAI mocked ONLY for cost-only test (test isolated to budget logic, not chat correctness).

### Production-ready criteria

- Tests use real schema, real DB constraints, real outbox
- Cleanup after each test — no test leaks state to next test
- Cross-tenant isolation case included (Tenant A's burn doesn't trigger Tenant B's cap)
- Boundary cases at threshold-exact, threshold±1
- Test runs end-to-end on Railway (not just locally with sqlite)
- Test failures are diagnostic — message names what differed (assertion includes context)
- Test runtime under 30s (real Railway latency budget)

### Files affected

- `apps/backend/test/integration/cost-ceiling.test.ts` — NEW

### Implementation steps

1. Test setup helper:

   ```ts
   beforeEach(async () => {
     // Reset axhy-sandbox tenant spend to 0
     await prisma.$executeRaw`UPDATE axhy."Company" SET "aiSpendDailyInr" = 0 WHERE id = ${SANDBOX_TENANT_ID}`;
     // Clear any outbox rows for the test date
     await prisma.outbox.deleteMany({
       where: { companyId: SANDBOX_TENANT_ID, topic: { startsWith: 'owner.ai_budget' } },
     });
   });
   ```

2. Test cases:
   - **Test 1 — under warn:** seed spend = 1000; chat call succeeds; spend incremented; no outbox alert
   - **Test 2 — at warn:** seed spend = 2999; chat call cost ₹2 → projected ₹3001; succeeds + outbox warn row
   - **Test 3 — past warn (no double-fire):** seed spend = 3500; chat call cost ₹2; succeeds; NO new outbox warn (already fired today logic)
   - **Test 4 — at cap:** seed spend = 4998; chat call cost ₹3 → projected ₹5001; throws `AICostBudgetError` → 429 to client; outbox capped row written
   - **Test 5 — past cap:** seed spend = 5500; chat call returns 429 immediately
   - **Test 6 — cron reset:** seed spend = 4500 → run `resetAiSpend` → spend = 0; next chat works
   - **Test 7 — cross-tenant isolation:** Tenant A seeded at 5500; Tenant B at 0; chat to Tenant B succeeds; Tenant A still 5500 (no cross-pollution)

3. OpenAI is mocked at the SDK level for these tests (not at the @axhy/ai-tools level — we WANT to exercise the gateway). Mock returns deterministic cost.

4. Each test ends with cleanup that resets state.

5. Run on real Railway:

   ```bash
   railway run --service Postgres -- pnpm --filter @axhy/backend test integration/cost-ceiling
   ```

6. Commit (panel attribution).

### Panel review

**Maya Krishnan:** "Real DB, real schema, real Prisma — only OpenAI mocked. That's the production-ready test pattern. ✅."

**Eric Chen:** "7 cases covers happy + boundary + reset + cross-tenant. Future regression catches ~all the ways someone could break this. ✅."

**Vikram Shah:** "Cross-tenant isolation case is the keystone test. Without it, all the per-tenant scoping is just claims. ✅."

### Verification

- `pnpm test integration/cost-ceiling` — all 7 cases green
- Test runtime < 30s
- After full test run, axhy-sandbox `aiSpendDailyInr` is 0 (cleanup confirmed)

### Rollback

- Revert commit; test removed; production logic unaffected

---

## Task 1.9 — End-of-Phase-1 verification + knowledge-graph rebuild + adversarial mini-panel

### Description

Phase 1 close gate. Run knowledge-graph builder + audit (per `feedback_auto_rebuild_graph_after_code_changes`). Type-check, lint, all tests green across monorepo. Adversarial 7-voice mini-panel asking "what's missing from Spec 2 §9 that didn't ship?" Coverage matrix entries written. Phase 2 unblocked only if all green.

### Production-ready criteria

- Knowledge graph reflects Phase 1 additions (new files visible in graph; @derives annotations point to Spec 2)
- Audit passes — no orphan code, no dead-link ADRs
- All 10 production-ready criteria from `feedback_production_ready_no_patch_work.md` pass for every Phase 1 commit
- Coverage matrix entries are concrete (commit SHAs), not promises
- Adversarial panel finds gaps OR explicitly says "no critique" twice → redo

### Files affected

- `axhy-v3/docs/plans/2026-05-10-phase-c-wave-4b-chat-completion.md` — append Phase 1 close section with coverage matrix entries
- (memory) `v3_iteration_status.md` — Phase 1 entry
- No production code edits in this task

### Implementation steps

1. **Cost projector re-run** (post-Phase-1, capture for done memo):

   ```bash
   node scripts/project-costs.mjs --scenario big > /tmp/wave-4b-phase-1-CLOSE-cost-projection.txt
   ```

2. **Type-check entire monorepo:**

   ```bash
   pnpm typecheck   # expect: green
   ```

3. **Lint entire monorepo:**

   ```bash
   pnpm lint   # expect: green; renamed no-raw-llm-call rule active
   ```

4. **All tests green:**

   ```bash
   pnpm test   # expect: green; integration/cost-ceiling included
   ```

5. **Knowledge-graph rebuild:**

   ```bash
   railway run --service Postgres -- pnpm --filter @axhy/knowledge-graph graph:build
   ```

6. **Knowledge-graph audit:**

   ```bash
   pnpm --filter @axhy/knowledge-graph graph:audit
   # expect: pass — every new file has @derives, no orphans, no dead-link ADRs
   ```

7. **Hardcoded-values grep verification:**

   ```bash
   grep -RnE '(3000|5000)' apps/ packages/ --include='*.ts' --include='*.tsx' \
     | grep -v node_modules \
     | grep -v dist \
     | grep -vE 'business-rules/src/constants\.ts'
   # expect: zero hits (all 3000/5000 references are in business-rules)
   ```

8. **Adversarial 7-voice mini-panel — what's missing from Spec 2 §9?**
   - **Maya Krishnan:** "Did anything in §9.1-§9.5 not ship?"
   - **Aanya Mehta:** "Are all `propose_*` tools covered by gateway? (Yes — they don't make AI calls themselves; only the LLM call inside the loop does. ✅)"
   - **Naina Bansal:** "Is the Owner-tier override (per-tenant cap) deferred? (Yes — Phase D per Spec 2 §9.5. ❌ Wave 4b deferred, documented.)"
   - **Suresh persona day-365:** "If I burn ₹4500 today and tomorrow I burn ₹4500, do I get warn alerts BOTH days, not just the first? (Yes — daily key includes dateUtc. ✅)"
   - **Mr. Reddy persona day-365:** "Can I see today's spend in admin web? (No — cost dashboard is Spec 2 §8.3 → Phase 2 §2.11. ❌ Wave 4b Phase 2 deferred, named.)"
   - **Vikram Shah:** "Is there an audit trail for every reset? (Yes — AuditEvent kind AI_SPEND_DAILY_RESET. ✅)"
   - **Eric Chen:** "If we go to multi-region tenants, will UTC midnight reset confuse anyone? (Phase D problem. Documented in 1.5.)"

9. **Coverage matrix update** — append to parent plan or done-memo:
   | Spec § | Feature | Status | Commit |
   |---|---|---|---|
   | §9.1 | aiSpendDailyInr column | ✅ shipped | <Task 1.1 SHA> |
   | §9.2 | Gateway warn/cap | ✅ shipped | <Task 1.2 + 1.3 + 1.4 SHAs> |
   | §9.3 | Daily reset cron | ✅ shipped | <Task 1.5 SHA> |
   | §9.4 | Hard-cap UX + Owner alert | ✅ shipped | <Task 1.6 + 1.7 SHAs> |
   | §9.5 | Integration test | ✅ shipped | <Task 1.8 SHA> |
   | §8.3 | Cost dashboard (read-only view) | ❌ deferred to Phase 2 §2.11 | per Phase 2 plan |

10. **Update v3_iteration_status.md** with Phase 1 done entry.

11. **Push branch** with all Phase 1 commits.

12. **Surface to founder:** "Phase 1 closed. Coverage matrix attached. Adversarial panel raised 0 unsolved gaps (1 known deferral named). Phase 2 unblocked unless you raise concern."

### Panel review

**Maya:** "Phase 1 close gate must be hard — if any of typecheck/lint/test/audit/grep fails, do NOT declare done. ✅."

**Hari:** "Knowledge-graph rebuild captures the new Wave 4b code so future sessions can grep against it. ✅."

**Eric:** "Adversarial panel naming a known deferral in writing is the production-ready discipline — the founder sees what's missing, not just what landed. ✅."

### Verification

- All 7 verification commands return green
- Coverage matrix written
- v3_iteration_status.md updated
- Branch pushed; ready for Phase 2 kickoff

### Rollback

- Phase 1 close itself has no production state change
- If a verification fails, halt — do NOT declare Phase 1 done; loop back to the failing task

---

## Phase 1 close — production-ready audit (full 10 criteria check)

Per `feedback_production_ready_no_patch_work.md`, the done-memo for Phase 1 will explicitly walk every commit against all 10 criteria:

1. **Error handling** — all `await`s have defined behavior; AICostBudgetError typed; cron failure logged not crashed ✓
2. **Edge cases** — null/undefined/zero/negative tested; concurrency tested; missing-column path tested ✓
3. **Multi-tenant safety** — every UPDATE has `WHERE id = $companyId`; cross-tenant test shipped ✓
4. **Observability** — structured logs at every decision point; audit events for resets + alerts ✓
5. **Types** — strict, no any, Zod for outbox payload ✓
6. **Tests** — real Railway, real Postgres; OpenAI mocked only for budget-only test isolation ✓
7. **Rollback** — every commit revertable; migration drop-column documented ✓
8. **No hardcoded values** — ₹3K/₹5K in @axhy/business-rules; grep verified ✓
9. **No partial implementations** — outbox dispatcher stub is EXPLICIT (info log + audit row) with named Phase D wiring path ✓
10. **ESLint + typecheck + tests** — all green per Task 1.9 ✓

If any item shows ✗ at Phase 1 close, status is `shipped with known gaps` not `complete`.

---

## What's NOT in Phase 1 (named deferrals — Spec 2 sections deferred to Phase 2+)

| Item                                                   | Spec §         | Deferred to   | Reason                                                                                    |
| ------------------------------------------------------ | -------------- | ------------- | ----------------------------------------------------------------------------------------- |
| Cost dashboard read-only view                          | §8.3           | Phase 2 §2.11 | Read-side UI; Phase 2 owns the dashboard arc                                              |
| Per-tenant cap override (Owner-tier admin)             | §9.5 (Phase D) | Phase D       | Admin-web feature, not in Wave 4b scope                                                   |
| Real Slack/email delivery for budget alerts            | §9.4           | Phase D       | Outbox is wired with stub dispatcher today; real delivery is full Gupshup/SES integration |
| Per-supervisor cost breakdown                          | §8.3           | Phase 2       | Same dashboard arc                                                                        |
| Multi-region tenant cron (per-tenant local-time reset) | §9.3           | Phase D       | Multi-region tenancy not yet a real scenario                                              |

All deferrals named here will appear in Phase 1 done-memo's coverage matrix as ❌ deferred with target wave + reason.

---

## Approval gate

This plan is presented for founder approval. NO file edits will happen until founder explicitly says "Phase 1 approved, start" or pushes back on a specific task.

If pushback on a task → that task re-enters the plan; other tasks remain pending.

If approval → execute Task 1.0 → 1.1 → 1.2 → 1.3 → 1.4 → 1.5 → (1.6 + 1.7 in parallel) → 1.8 → 1.9 in order. Mark TodoWrite items in_progress / completed as work advances.
