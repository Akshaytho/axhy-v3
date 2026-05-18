# Sprint 1 Backend Trilogy — Deep Code Review (Waves 1–3)

**Date:** 2026-05-18
**Reviewer:** Senior Code Reviewer (Opus 4.7, 1M ctx)
**Scope:** Waves 1 (ReplacementInvite), 2 (Decisions UNION ALL), 3 (Chat intent classifier + Complaint threading) — backend only
**Plan reviewed against:** `/Users/thotaakshay/eclean_workspace/axhy-v3/docs/plans/2026-05-18-supervisor-30-day-real-life-simulation-v2.md` §3 + §5 + §6
**Locks read:** 40-year quality bar, P1–P10 + L4, replacement-invite-single-recipient, make-it-exist-dont-defer, confidence-score

---

## 0. Top-of-file summary

- **Clusters:** 9 root-cause clusters identified.
- **Severity tally:** **P0 = 2**, **P1 = 11**, **P2 = 9**, **P3 (cosmetic / cleanup) = 6** issues across all clusters and single-symptom.
- **Top 3 clusters by impact:**
  1. **Cluster A — Authorization gap on Wave 2 `actions[]` endpoints (P0).** Wave 2 surfaces `/leave-requests/:id/approve|reject` via `actions[]` for every supervisor, but those routes have NO role check, NO portfolio binding check, and accept a body that ignores the spec'd `reason` for reject. Any authenticated user in the tenant can decide any leave. The Decisions builder routes by portfolio; the action endpoints don't re-check it.
  2. **Cluster B — Stale broadcast remnants survive the single-recipient refactor (P1).** Wave 1 dropped `groupId` in migration 011 but Wave 1's done-memo, migration 010 header + body, `supervisor-decision-kinds.ts` line 171 ("created by dispatcher when broadcast resolves"), and the `register*` function JSDoc still describe a broadcast / PUBG / "candidates[]" / "sibling expire" model. Future devs will be confused about which mental model is canonical.
  3. **Cluster C — Migration date drift + sequence integrity (P1).** Migrations are numbered 009/010/011 but date-stamped 2026-05-21 / 22 / 23, which is in the FUTURE relative to today (2026-05-18). Mismatch between the lockfile date and migration filenames will trip every replay and every future migration date check.

- **Recommendation:** Run a single **root-level fix-PR** covering Clusters A + B + C + D + E in one pass (these all share "Wave 1/2/3 leftovers + cross-wave inconsistency" as the trunk root cause); ship Cluster F (idempotency) + G (ComplaintMessageRead FK gap) as a follow-up because they touch separate concerns.

---

## Cluster A — Wave 2 `actions[]` endpoints are NOT authorization-hardened to match the read-side routing model

**Severity:** **P0** (privilege escalation within tenant)
**Confidence:** **97 %**

### Symptoms

1. `apps/backend/src/routes/leave-requests.ts:95-103` — both `POST /leave-requests/:id/approve` and `/reject` are gated only by `requireAuth`. There is no role check (`SUPERVISOR`), no portfolio binding check (`worker's primary site in caller's portfolio`), no `state='REQUESTED'` precondition inside the `update` itself. The Decisions builder filters rows by `deriveWorkerPrimarySiteId ∈ supervisedSiteIds` (`decisions-service.ts:488`); the action endpoint never re-validates that gate.
2. `apps/backend/src/routes/leave-requests.ts:116` — `LeaveDecisionInput` is `{ note? }`. **No `reason` field.** Wave 2 `swapRequestSource` and `leaveRequestSource` advertise the action as `requiresConfirm:'reason-sheet'`; on submit the mobile merges `{reason}` into body, but the server-side schema doesn't even parse it, so the rejection "reason" is silently discarded. The audit payload writes `reason: leave.reason` (the worker's reason, not the supervisor's) — silent data loss masquerading as audit.
3. `apps/backend/src/routes/leave-requests.ts:135` — race-window between the `findFirst` and the `update`: a concurrent caller can pass the same `state === 'REQUESTED'` check and both succeed (no `state='REQUESTED'` clause on the UPDATE WHERE). Violates **P2** (no check-then-act races).
4. `apps/backend/src/lib/services/decisions-service.ts:500-525` — `leaveRequestSource` synthesises an action body `{ dayCount }`. The server route doesn't read it (only reads `note`). Mobile sends it anyway; field is dropped. Wire-shape drift between client expectation and server contract.
5. `apps/backend/src/routes/swap-requests.ts:134-273` — the NEW `/swap-requests/:id/decide` route DOES check `isInitiator || isResponsibleSupervisor`. **Wave 2 added this correctly** for swap but did not back-port the same gate to the pre-existing leave routes that it newly drove from `actions[]`. Inconsistency across the same wave.

### Why it's a real issue

- Violates **P1** (invariants enforced) and **L3** (workflow not production-grade if business side effect succeeds under stale/wrong authority).
- Violates 40-year-quality-bar: "enumerate the user population — multi-tenant collision" — within-tenant cross-supervisor is the most common collision.
- Violates **P7** — a "documented limitation" (Wave 2 done-memo §2.E claims "zod validation + tenant scoping on new routes" but the leave route had NEITHER the role gate nor the portfolio gate added).

### One-line fix at the root

Add a `requireSupervisorWithLeavePortfolio` guard (mirrors the new swap-decide one at swap-requests.ts:171-182) to leave approve/reject, extend `LeaveDecisionInput` with `reason` and refine to require it on reject path (use a discriminated body or `?action=reject` rule), and convert the `update` to a conditional `updateMany WHERE state='REQUESTED'`.

---

## Cluster B — Single-recipient refactor left a trail of stale broadcast/PUBG references

**Severity:** **P1** (correctness OK, but documentation / mental-model rot violates the 40-year-team bar)
**Confidence:** **99 %**

### Symptoms

1. `packages/shared-schema/prisma/migrations/20260522_010_replacement_invite/migration.sql:7,11,17,21,182,191-210` — header says "Create `axhy.ReplacementInvite` (PUBG-style multi-worker invite broadcast)", body still has `groupId` column + `ReplacementInvite_groupId_idx` + the partial unique index `ReplacementInvite_one_accepted_per_group_uniq`. Migration 011 drops them, but 010's TEXT still describes broadcast. Anyone reading 010 in isolation will be misled. A `git log -p 010` reader will see broadcast-shaped intent.
2. `docs/done-memos/2026-05-18-wave-1-replacement-invite-backend.md:11,19,38-39,42,49-55,103` — claims the wave shipped "PUBG-style multi-worker shift-invite broadcast primitive" + race-condition test "3 simultaneous accepts on same group: 1×200 / 2×409 ALREADY_DECIDED" + advisory-lock + partial-unique-index design. **None of this is in the shipped code.** The actual `acceptReplacementInvite` is a single-row conditional UPDATE; no advisory lock; no partial unique index (dropped in 011); no group concept; no sibling expire; test asserts re-accept on the SAME invite returns 409 (1 row, not 3).
3. `packages/shared-schema/src/zod/supervisor-decision-kinds.ts:171` — comment "created by dispatcher when broadcast resolves" still references the dead broadcast model. Should be "created by sweep when an invite expires with no response."
4. `packages/shared-schema/prisma/schema.prisma:1216` — model JSDoc is good (clearly says single-recipient). ✅ no issue here. But the migration text and done-memo contradict it.

### Why it's a real issue

- Violates **rule 27** (pre-decided product behavior is an input, not a topic): the founder LOCKED single-recipient 2026-05-18 in `feedback_replacement_invite_single_recipient.md`. Shipped docs that contradict the lock will cause the next session to re-debate.
- Violates 40-year-team bar: "No 'current task' comments… comments must explain _why_ a non-obvious constraint exists, not _what_ the code does." Migration 010's header is a _historical_ description of an abandoned design; future readers don't need it.
- Violates the done-memo discipline gate (`feedback_done_memo_requires_spec_coverage_matrix.md`): the matrix claims things that are not in the code.

### One-line fix at the root

Rewrite migration 010's header + the partial-unique-index comment block to describe what 010+011 _together_ produce (single-recipient schema). Rewrite the Wave 1 done-memo top-to-bottom to match the shipped code. Fix the one stale comment in `supervisor-decision-kinds.ts:171`.

---

## Cluster C — Migration date stamps are in the future and out of order

**Severity:** **P1** (audit-trail integrity + CI replay reproducibility)
**Confidence:** **95 %**

### Symptoms

1. `packages/shared-schema/prisma/migrations/20260521_009_complaint_threading/` — dated 2026-05-21 (3 days in the future from today 2026-05-18).
2. `packages/shared-schema/prisma/migrations/20260522_010_replacement_invite/` — dated 2026-05-22 (4 days future).
3. `packages/shared-schema/prisma/migrations/20260523_011_replacement_invite_drop_group/` — dated 2026-05-23 (5 days future).
4. Wave 1 done-memo §1 claims migration filename `20260522_010_replacement_invite` is "date-sequenced after Wave 3's `20260521_009_*`." That sequencing was an arbitrary choice — there is no reason the date prefixes had to be 2026-05-21/22/23. All three waves shipped on 2026-05-18.

### Why it's a real issue

- Migrations are append-only history. Future-dated migrations look like a planning mistake (or — worse — like someone manually edited the timestamp to dodge a conflict). In a 40-year-team codebase, an auditor reading `git blame` on a 2026-05-21 migration will not find a commit that day and will assume tampering.
- Violates the operability gate ("every cron has owner + on-call doc"; analogous for migrations: "every migration has a timestamp that matches the commit").
- The `prisma migrate resolve` command relies on the directory name; future-stamped migrations may fail to apply if a CI script enforces "no migration dated after today."

### One-line fix at the root

Rename the three directories to `20260518_009_*`, `20260518_010_*`, `20260518_011_*` (or fold 010+011 into a single 20260518_010_replacement_invite_single_recipient that ships the final shape directly — see Cluster B fix-companion). Update `migration_lock.toml` if needed. **Optional but recommended:** collapse 010 + 011 into one migration since they ship in the same commit on the same day; the two-step "broadcast then drop broadcast" is a story we do not need to preserve.

---

## Cluster D — Wave 1 + Wave 3 audit & notification writes are NOT inside the same Prisma transaction in the cron sweep path

**Severity:** **P1** (orphan rows + duplicate notifications under crash)
**Confidence:** **88 %**

### Symptoms

1. `apps/backend/src/lib/services/replacement-invite-service.ts:572-633` — `sweepExpiredReplacementInvites` takes `PrismaClient | Prisma.TransactionClient` and is invoked from `jobs/replacement-invite-expiry-sweep.ts:91` with the **bare `PrismaClient`** (no `prisma.$transaction` wrap). The raw `UPDATE ... RETURNING` flips status to EXPIRED in one statement, then the per-row loop creates SupervisorDecision + Notification separately. **If the process crashes mid-loop, some rows are EXPIRED with no outcome decision + no push.** Next tick: `emitInviteOutcomeDecision`'s `findFirst` dedup catches the missing SupervisorDecision (good), but the Notification push has no dedup — supervisor never gets pushed, OR (worse) on retry the Notification fires twice.
2. `apps/backend/src/lib/services/replacement-invite-service.ts:614-629` — Notification is created inside the loop on the raw `client` (not a tx). No "if not exists" guard. A second-tick retry after a partial crash will duplicate the push.
3. `apps/backend/src/lib/services/complaint-service.ts:243` — `appendComplaintMessage` HR-author path does an `update` followed by `recordAuditEvent`. These are inside `tx` so OK, but only because the route wraps it in `withTenantContext`. If a future caller forgets to wrap, the audit + the counter increment + the state transition are no longer atomic. There's no service-layer assertion that `tx` is a real tx vs a `PrismaClient`. Defense-in-depth gap.

### Why it's a real issue

- Violates **P3** (no final state before the real domain effect): EXPIRED is the terminal state in DB. Setting it before the outcome decision + notification fire is "final state before domain effect."
- Violates **P1** (invariants enforced): the sweep relies on the _next tick_ to re-emit missing outcomes. Multi-replica: two replicas can each successfully INSERT a Notification row for the same expired invite because there's no DB-level dedup on Notification.
- Compare to the gold-standard pattern in `binding-expire-sweep.ts:99-180` — that sweep uses a per-binding `prisma.$transaction` so the audit + the row-status are atomic, and uses `INSERT ... ON CONFLICT DO NOTHING` (per migration 20260519*f003*\*) for the audit. Wave 1's sweep does NOT mirror this gold standard.

### One-line fix at the root

Wrap each per-row work in `prisma.$transaction(async (tx) => { ... })` in `sweepExpiredReplacementInvites` so the UPDATE + outcome SupervisorDecision + Notification are atomic per invite. Or move the raw UPDATE into the same loop and use `updateMany WHERE id=? AND status='PENDING' AND expiresAt < now` so it's safe to retry.

---

## Cluster E — Cross-wave inconsistency in error envelope, route surface, and naming

**Severity:** **P2** (developer experience + mobile-side renderer complexity)
**Confidence:** **94 %**

### Symptoms

1. **Error envelopes drift across the three new route files.**
   - Wave 1 `replacement-invites.ts:89,93,98,111,167,170,178,213,234,261,342,346,355` — uses `{ error: 'X' }` and sometimes `{ error: 'X', message: '…' }`.
   - Wave 2 `swap-requests.ts:241-258` decide endpoint — uses `{ error: 'X', message: '…' }` and one variant `{ error: 'X', message, state }`.
   - Wave 3 `complaints.ts:155,160,166,238,303,307,357,400` — uses `{ error: 'X' }` and `{ error: 'X', message }` and `{ error: 'X', state }` and `{ error: 'X', state, message }`.
   - Existing pattern in `supervisor-decisions.ts:50,58,86` mixes `{ error, message }` and `{ error }`. No canonical envelope shape exists; each route picks its own.
2. **Cursor encoding is reinvented in three different files.**
   - `replacement-invites.ts:57-74` encodes `<isoSentAt>:<id>` via base64url.
   - `complaints.ts:69-86` encodes `<isoCreatedAt>:<id>` via base64url (almost-identical, copy-pasted).
   - `decisions-service.ts:180-211` encodes `{priority, proposedAt, id}` JSON via base64url.
     No shared helper; three near-identical implementations that will drift.
3. **`registerXRoutes` naming.** Most existing handlers are `registerSitesRoutes`, `registerSwapRequestRoutes`, etc. Wave 1 chose `registerReplacementInviteRoutes` (singular). Inconsistency. Compare `registerComplaintRoutes` (Wave 3, singular) vs `registerLeaveRequestRoutes` (existing, plural for some, singular for others — codebase is already inconsistent, but Wave 1 + 3 should have picked one).
4. **`audienceUserId` Notification push** — Wave 1 enqueues a Notification row on every state transition (sent, accepted, declined, cancelled, expired). This is fine on the happy path but the "push the candidate so their pending banner disappears" on cancel is fired regardless of whether the candidate has a linked device. No dedupe key — a supervisor double-tapping cancel will fire two pushes.
5. **`SwapDecisionInput.refine` for `approve_anyway` re-validates `overrideToken === 'OVERRIDE'`.** ✅ Good. But the action body for "Accept anyway" in `decisions-service.ts:644-649` sends `decision:'approve_anyway', overrideToken:'OVERRIDE'` pre-filled — meaning the typed-phrase confirm is purely a UX gate, and any client can bypass the typed-phrase by directly POSTing the body. The server `.refine` catches `decision==='approve_anyway' && overrideToken!=='OVERRIDE'` but the spec intent was "the supervisor types OVERRIDE." Server cannot tell if it was typed or pre-filled. So the typed-phrase is decorative. Not a security hole (the override IS audited), but the spec intent ("typed-phrase is the gate") is mobile-only.
6. **`workerProfile.companyId !== input.companyId` candidate gate in `createReplacementInvite:166`.** Worker has `companyId` directly; we don't need the join through `workerProfile`. The current check works but is one query too many; the original membership filter (`memberships: { where: { companyId } }`) is already the tenant gate. Slight inefficiency.

### Why it's a real issue

- Violates the 40-year-team bar: "File / function boundaries match the domain — not coincidental groupings" and "no abbreviated identifiers." Three different cursor encoders is coincidental grouping.
- Mobile-side renderer complexity: every new error code shape forces a switch statement on mobile. A single canonical envelope means one parser.
- 40-year-bar "permanent code" — drift across siblings is the highest-frequency entropy source in a long-lived repo.

### One-line fix at the root

Add `apps/backend/src/lib/http-helpers.ts` (or extend an existing one) with `replyError(reply, status, code, message?, extra?)` and `encodeCursor(payload)` / `decodeCursor(token, shape)`. Refactor all three new route files + supervisor-decisions through it. Then write a one-paragraph ADR pinning the envelope shape so the next route follows it.

---

## Cluster F — No idempotency-key support on state-changing routes; double-tap creates duplicates

**Severity:** **P1** (UX regression + audit-trail clutter)
**Confidence:** **92 %**

### Symptoms

1. `POST /supervisor/replacement-invites` — double-tap creates TWO `ReplacementInvite` rows to the same worker. Both are PENDING; both push the worker; supervisor sees both in their inbox. No `Idempotency-Key` header support, no unique constraint on `(companyId, fromSupervisorId, toWorkerId, scheduledStart) WHERE status='PENDING'` — though the founder's lock explicitly says "supervisor sends ONE invite to ONE worker," the DB allows N simultaneous PENDING.
2. `POST /complaints/:id/messages` — double-tap creates two identical ComplaintMessage rows. Bumps `lastReplyAt` twice. HR sees two copies. No dedupe.
3. `POST /complaints/:id/resolve` — idempotent (conditional UPDATE returns 0 on the second call → 409). ✅ This one's OK.
4. `POST /swap-requests/:id/decide` — idempotent on second call (409 ALREADY_DECIDED). ✅ OK.
5. `POST /worker/replacement-invites/:id/accept` and `/decline` — idempotent (409 ALREADY_DECIDED). ✅ OK.

### Why it's a real issue

- Violates 40-year-team-bar "real-life behaviour under pressure: retries, double-taps, concurrent actors, stale clients" (P8).
- A supervisor on Slow 3G will absolutely double-tap. The Wave 1 plan §3 even lists "Slow 3G half the days" as a walkthrough condition.
- Compare to `swap-request-service.ts` (sibling pattern) — also no idempotency key; the codebase doesn't have one yet. **This is a codebase-wide gap, not Sprint-1-introduced**, but Sprint 1 surfaces it because the new routes (especially replacement-invite SEND and complaint message APPEND) are the highest-frequency double-tap candidates.

### One-line fix at the root

Add `Idempotency-Key` header support in a shared Fastify pre-handler: if present, hash `(companyId, route, method, idempotencyKey)` → `IdempotencyKey` table; first call writes the row + response, second call within 10 min returns the cached response. Migration adds `IdempotencyKey` table with composite-PK. Wire into all three new routes + replication to existing routes follows in a sibling cleanup.

---

## Cluster G — ComplaintMessageRead is missing a companyId FK constraint + Prisma back-relation

**Severity:** **P2** (cross-tenant defense-in-depth gap)
**Confidence:** **96 %**

### Symptoms

1. `packages/shared-schema/prisma/migrations/20260521_009_complaint_threading/migration.sql:174-211` — creates table `ComplaintMessageRead` with a `companyId UUID NOT NULL` column but NO foreign key constraint to `Company`. Compare to `ComplaintMessage` (line 144-157) which DOES have an FK. Inconsistent.
2. `packages/shared-schema/prisma/schema.prisma:738-753` — `ComplaintMessageRead` Prisma model has `companyId` field + `@@index([companyId, actorUserId])`, but no `company Company @relation(...)` back-relation (compare `ComplaintMessage` line 716: `company Company @relation(...)`). Cascade-on-tenant-delete is broken for `ComplaintMessageRead`.
3. **Consequence:** if a Company is deleted, ComplaintMessageRead rows become orphans with a dangling `companyId`. RLS GUC-based isolation still works (filter on `companyId = current_company_id`), but a future cleanup script that joins `ComplaintMessageRead.companyId → Company` (assuming FK) will fail silently with the rows it can't resolve.

### Why it's a real issue

- Violates **P1** (invariants enforced at DB level): the invariant "every tenant-scoped row's companyId points to a real Company" is enforced for every other tenant-scoped table in the codebase. The omission stands out.
- Defense-in-depth: the codebase relies on (a) the application-layer `withTenantContext`, (b) the GUC + RLS policy, (c) the FK constraint. (c) is the only one that catches a database-level drift bug.

### One-line fix at the root

Add `ComplaintMessageRead_companyId_fkey` to migration 009 (or a follow-up 012) + add `company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)` to the schema.prisma model.

---

## Cluster H — Direct-button complaint route (sites.ts) diverges from the chat-tool route (chat.ts)

**Severity:** **P2** (data-shape drift between two paths writing the same table)
**Confidence:** **93 %**

### Symptoms

1. `apps/backend/src/routes/sites.ts:66-84` — direct-button `POST /sites/:id/complaints` creates a `Complaint` row with `kind='other'`, `state='OPEN'`, and **no initial `ComplaintMessage` row**.
2. `apps/backend/src/lib/services/complaint-service.ts:97-125` — chat-tool path uses `createComplaintWithInitialMessage` which creates a `Complaint` + initial `ComplaintMessage` + bumps `lastReplyAt`.
3. **Consequence:** a button-route complaint has zero messages. Opening `GET /complaints/:id` returns `messages: []`. Mobile thread view will look like "this complaint has no body." The body text IS on `Complaint.text` but the thread renderer expects to find it on `messages[0].body`.
4. `sites.ts:81` sets `kind: 'other'` and notes "until the supervisor UI exposes a kind picker." This is fine for now, BUT it means every button-route complaint will be `kind='other'` — and the HR triage view that filters by kind will see all button-complaints in one bucket. The supervisor cannot fix this from the supervisor UI today.
5. `sites.ts` does not call `createComplaintWithInitialMessage`. The Wave 3 done-memo §1 explicitly says "One service so chat + REST paths cannot drift" — but the actual code lets them drift. The route was modified to set the new columns (`createdByUserId`, `kind`, `state`) but not migrated to the new service.

### Why it's a real issue

- Violates the Wave 3 done-memo's own claim: "One service so chat + REST paths cannot drift."
- Violates the 40-year-team-bar "permanent code" principle: two paths into the same table that produce different on-disk shapes is the highest-frequency source of subtle bugs in a long-lived schema.

### One-line fix at the root

In `sites.ts` POST `/sites/:id/complaints`, replace the inline `tx.complaint.create` + `tx.recordAuditEvent` + `tx.enqueueOutbox` with one call to `createComplaintWithInitialMessage(tx, { …, origin: 'BUTTON' })`. The service already supports the `BUTTON` origin tag. Delete the parallel logic.

---

## Cluster I — Test coverage gaps that allow regressions to slip through

**Severity:** **P2** (latent — surface a regression at the next walkthrough)
**Confidence:** **85 %**

### Symptoms

1. `wave-1-replacement-invite-routes.test.ts` — **no concurrent-accept race test.** The done-memo claims "race condition tests (3 workers tap Accept within 100 ms — exactly one wins)" but the file at line 192-198 only tests **idempotent re-accept on the same invite by the same worker**. There's no test for two parallel `accept` calls on a single invite — and there shouldn't need to be, since the lock above guarantees row-level serialisation, but the done-memo's race-test claim is contradicted by the actual test.
2. `wave-3-complaints-routes.test.ts` — **no test for double-resolve race.** The route is conditional-UPDATE-safe, but no test proves it.
3. `wave-3-complaints-routes.test.ts` — **no test for what happens when an HR-authored ComplaintMessage exists.** All tests author messages as SUPERVISOR. The `unreadHrRepliesCount` increment + IN_HR transition + decrement-on-read code paths are unexercised.
4. `wave-1-replacement-invite-routes.test.ts:191` — re-accept asserts `409` but doesn't check the response body has `error:'ALREADY_DECIDED'`. So a future regression to `error:'INVITE_NOT_FOUND'` would silently pass.
5. No test for the leave-request approve/reject portfolio gate (Cluster A) — because that gate doesn't exist yet, but the test should be the spec.
6. No cross-wave integration test: a complaint logged via chat → does its `COMPLAINT_HR_REPLY` decision surface in `GET /supervisor/decisions`? The Wave 2 `additionalDecisionSources` plug-in for ComplaintMessage isn't wired (deferred to Sprint 2 per done-memo §7), so there's no path yet — but no test asserts the gap is fully described.

### Why it's a real issue

- Violates **P6** (negative-path tests mandatory): unauthorized, cross-tenant, already-terminal, bad input, concurrent, partial failure, stale client.
- The Wave 1 done-memo claims a 3-worker race test that doesn't exist in the test file. Stale done-memo (overlaps with Cluster B).

### One-line fix at the root

Add `vitest` `Promise.all`-based race tests for: (a) two concurrent `accept` calls on one invite, (b) two concurrent `resolve` calls on one complaint, (c) HR-authored message → supervisor read → `unreadHrRepliesCount` decrements from 1 to 0 exactly once even with two concurrent reads. Plus extend Wave 1's idempotent-re-accept assertion to check the response body's `error` field.

---

## Single-symptom issues (not clustered)

1. **`replacement-invite-service.ts:309-324` — `dayMask` computation uses `getDay()` (local TZ) but `shiftStart`/`shiftEnd` use `getUTCHours()` (UTC).** Mixing local + UTC time zones in the same computation is a bug-magnet. **P1.** Confidence 96 %.
2. **`replacement-invite-service.ts:325-340` — auto-Assignment defaults to an 8-hour shift starting at the invite's `scheduledStart`.** Hardcoded magic number. Wave 1 confidence-score §3 even calls this out at 80 % own. The 8h is not derived from the supervisor's portfolio config or from the worker's existing assignment template. Founder will likely want a refinement; flag as a follow-up issue. **P2.** Confidence 75 %.
3. **`decisions-service.ts:340,481,604` — every source caps at 200 rows.** Wave 2 done-memo §5 §2 says "at target scale (≤200 pending per supervisor)." If a tenant has 201 swap requests for one supervisor, row #201 is silently dropped. Should at minimum log a warning. **P2.** Confidence 90 %.
4. **`decisions-service.ts:813-820` — boot-time registry self-check throws.** Good pattern — but the throw happens at _module import_, meaning a unit test that imports this file even tangentially will fail to start if the registry drifts. Should be a startup function called from `server.ts` (lazy throw on first HTTP request, OR runtime startup check). **P2.** Confidence 88 %.
5. **`chat.ts:115` — `SYSTEM_PROMPT` is one long template literal.** No localisation key, no version pin. The Wave 3 done-memo §2.C claims "20+ Hyderabad supervisor phrasings"; counting the actual prompt shows ~15. Cosmetic. **P3.** Confidence 80 %.
6. **`complaint-service.ts:222` — `attachments` is cast `as unknown as Prisma.InputJsonValue`.** Violates 40-year-bar ("No `as unknown as Foo`"). Should use `Prisma.JsonValue` directly or refactor `ComplaintAttachment` to extend `Prisma.JsonValue`. **P2.** Confidence 92 %.
7. **`replacement-invites.ts:84-358` — `registerReplacementInviteRoutes` is 275 LOC of single function.** Compare to `complaints.ts` which has same structure but each handler is shorter. Cosmetic. **P3.** Confidence 70 %.
8. **`chat-transcribe.ts:67-204` and `205-374` — two routes (`/chat/transcribe` and `/chat/transcribe-stream`) duplicate ~80 % of the OpenAI-call code.** Should be one shared helper with `wantWordTimestamps: boolean`. **P3.** Confidence 90 %.
9. **`replacement-invite-service.ts:81-101` — `toRow` helper takes 3 args (row, siteName, toWorkerName) but is only used once at line 225 in `createReplacementInvite`.** `acceptReplacementInvite` line 378 reuses it but with a different shape (cast through `as ReplacementInviteDbRow`). The helper is fragile. **P3.** Confidence 80 %.
10. **`wave-1-replacement-invite-routes.test.ts:35-37` — `afterAll` calls `prisma.$disconnect()` but the test fixture's `withMultipleTenants` may have already disconnected.** Possible flakiness on CI. **P3.** Confidence 60 %.

---

## False alarms (looked wrong, was intentional)

1. **`SupervisorDecision.kind` as a free String column with no enum migration in Wave 2** — looks like it would let bad data in, but the registry self-check + the writer's Zod gate make this fine. Wave 2 confidence §1 §99 % is justified.
2. **`decisions-service.ts:236` — `Promise.all` of all sources loaded in parallel** — at scale this could mean 5 large queries. But each is capped at 200 rows; total parallel cost is bounded.
3. **`complaints.ts:152` and 152 — `GET /complaints` filters by `createdByUserId: auth.userId`** — at first looks like a hard restriction. But that's the supervisor-scoping intent; HR future surface will use a different endpoint. Documented in `complaints.ts:36-37` (header).
4. **`replacement-invite-service.ts:300-304` — defensive Worker row re-check after the conditional UPDATE** — looks like a redundant query. But it covers the case where the worker was unlinked between send and accept (e.g. HR off-boarded between t=0 and t=120s). The comment at 297-299 explains why.
5. **`expedirsAt` validation `MIN_EXPIRES_IN_SEC=30` / `MAX_EXPIRES_IN_SEC=30*60`** — the founder said 2-min, and 30s feels too short. But the spec at `replacement-invite.ts:64-66` documents it as "anything below this is a UX accident." 30s is a guard against test-mode payloads. Defensible.

---

## Estimated root-level fix effort

**Single fix-PR (Clusters A + B + C + D + E + H):**

- Files touched: ~14
  - `apps/backend/src/routes/leave-requests.ts` (auth gate + body schema)
  - `apps/backend/src/routes/sites.ts` (call service)
  - `apps/backend/src/lib/services/replacement-invite-service.ts` (tx-wrap sweep)
  - `apps/backend/src/lib/services/decisions-service.ts` (refactor registry self-check + 200-row warning)
  - `apps/backend/src/lib/http-helpers.ts` (NEW — canonical error envelope + cursor encoding)
  - `apps/backend/src/lib/cursor.ts` (NEW)
  - `apps/backend/src/routes/replacement-invites.ts` (use helpers)
  - `apps/backend/src/routes/complaints.ts` (use helpers)
  - `apps/backend/src/routes/swap-requests.ts` (use helpers)
  - `packages/shared-schema/src/zod/supervisor.ts` (extend `LeaveDecisionInput` with `reason`)
  - `packages/shared-schema/src/zod/supervisor-decision-kinds.ts` (fix line 171 stale broadcast comment)
  - `packages/shared-schema/prisma/migrations/` (rename + collapse 010+011 OR rewrite 010 header)
  - `docs/done-memos/2026-05-18-wave-1-replacement-invite-backend.md` (rewrite top-to-bottom)
  - `apps/backend/test/wave-1-replacement-invite-routes.test.ts` (race test + assertion strengthening)
- Migration impact: 1 rename (or 1 fold) — backwards-compatible since the schema is the same.
- Test impact: Wave 1 + new auth-test for leave + race tests. ~3 new tests, 1 modified.
- Effort: ~4-6 hours focused work.

**Follow-up fix-PR (Cluster F — idempotency-key):**

- Files touched: ~8 (new IdempotencyKey table + middleware + 5 routes wired)
- Effort: ~3 hours.

**Follow-up fix-PR (Cluster G — ComplaintMessageRead FK):**

- Files touched: 2 (migration + schema).
- Effort: ~30 minutes.

**Total Sprint-1-cleanup investment:** ~8-10 hours. Recommended split: one root-level fix-PR covering A–E + H; two small follow-ups for F and G.

— end of findings memo
