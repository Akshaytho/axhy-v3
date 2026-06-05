# 06 — RCA Clusters & Fix Plan (root-cause, not patches)

**Mandate:** production-release quality. Everything here gets **completed**, not deferred. Order matters — fix the **root** first so the connected chain falls with it, and so dependents don't break on the next change. (Founder RCA principle: a broken thing's neighbours are usually broken by the same root; patch one in isolation and it breaks on any code change.)

The 109 audit findings collapse into **9 root causes**. Fix order is dependency-first.

---

## RCA-A — Worker identity contract drift (`Worker.id` vs `User.id`) · KEYSTONE, FIRST

- **Root cause:** every worker-touching route independently derives worker identity; some use `User.id` (JWT `sub`), some `Worker.id`. No single source of truth.
- **Connected chain:** R2 key mismatch (presign uses `User.id`, submit uses `Worker.id` → orphaned photos) [P1]; the HR-A1 leave `podId`-null bug (`1edbbfd`) [historical]; every future HR leave/anonymize/payroll path (all key on `Worker.id`).
- **Root fix (simplest-correct):** one `resolveWorkerFromAuth(tx, auth)` helper → `{ workerId: Worker.id, userId: User.id, worker }`. Make `worker-captures.ts` presign use `Worker.id` via it. Audit every worker route to use it. **One helper kills the whole class.**
- **Test:** water-flow — upload-urls → upload → submit → assert `VisitPhoto.r2Key` path == the path the presign returned (same `Worker.id`), object exists.

## RCA-D — `withTenantContext` on read paths (live uncommitted regression) · QUICK, SECOND

- **Root cause:** a recent uncommitted change wrapped a READ (`worker-history`) in `withTenantContext`, which enforces `Company.status==='ACTIVE'` (a write-path guard) → 403s reads for suspended companies + 30s/15s timeout divergence.
- **Root fix:** revert `worker-history.ts` to the bare `$transaction` read pattern used by `worker-today.ts` (tenant safety comes from `@unique(Worker.userId)` + explicit `companyId` filter). **Rule:** reads = bare transaction; writes = `withTenantContext`.
- **Test:** integration — suspended-company worker can still GET history; timeout matches `worker-today`.

## RCA-B — State-machine discipline violations (locked rule) · THIRD

- **Root cause:** `Visit.state` written directly in 3 services instead of through `visitMachine`; `LeaveRequest`/`SwapRequest` have no machine at all; phantom `COMPLETED`/`NEEDS_REVIEW` states referenced.
- **Connected chain:** `worker-submit-service.ts:94`, `visit-flagged-review-service.ts:176`, `ai.ts:381` (all write `Visit.state` raw) [P1]; `leave-requests.ts:269`, `swap-requests.ts:203` (raw enum) [P1]; `REJECTABLE_VISIT_STATES` references undefined states [P2].
- **Root fix:** one `applyVisitTransition(tx, visit, event)` helper = run `visitMachine` → write resulting state → audit; replace all 3 direct writes. **Judgment call (research):** do leave/swap need full XState machines, or is a pure `canTransition()` guard (like `assignment.ts` already does) enough? → **decide: simple guard** — 3-state lifecycles don't justify XState; build a `leaveRequestMachine`-equivalent _pure guard_ + tests (simple > complex). Fix phantom states (remove or define).
- **Test:** integration — illegal transition rejected; legal one writes state + audit in one tx.

## RCA-C — Idempotency / dedup gaps · FOURTH

- **Root cause:** mutation paths don't guard duplicate/retry uniformly.
- **Connected chain:** VisitPhoto bulk-insert dup rows [P1]; HR-update ack overwrites prior ack [P1]; consent double-insert [P1]; IdempotencyKey never swept [P2/P3].
- **Root fix:** per-write the right guard — `@@unique([visitId, side, r2Key])` + `skipDuplicates` on VisitPhoto; ack = check-before-update (200 same-text / 409 different); consent = check-or-unique; add the idempotency sweep job. **Pattern:** every retryable write is idempotent.
- **Test:** integration — double-submit → one set of rows; double-ack same text → 200, different → 409.

## RCA-F — Defensive rendering / unknown-enum crashes · FIFTH (cheap, high-value)

- **Root cause:** UI maps server enum strings with no fallback; server returns enums via type assertion (no Zod validation), so a new/unknown state crashes the UI.
- **Connected chain:** `StateBadge` crash on unknown state [P2, ×3 — same bug]; Profile "Verified" badge ignores real worker state [P2]; `NextSiteCard` default-prop masks errors [P3].
- **Root fix:** `StateBadge` fallback (`?? { label: state, tone: 'neutral' }`); validate the state enum server-side (Zod) before returning; Profile badge reads `workerState`. **One defensive pattern across enum maps.**
- **Test:** unit — StateBadge renders unknown state without crash; water-flow — suspended worker sees correct profile badge.

## RCA-I — Auth/identity-flow completeness · SIXTH

- **Root cause:** auth flow swallows transition failures + doesn't audit login.
- **Connected chain:** worker OTP transition fires best-effort, failure silent (token still issued) [P1]; no AuditEvent on OTP request/verify [P1]; OTP 401 doesn't distinguish expired/consumed/invalid [P2]; consent policyVersion unvalidated [P2].
- **Root fix:** capture + surface the OTP transition result (block or warn); audit `OTP_REQUESTED`/`OTP_VERIFIED` for all roles; return a reason code on OTP failure; validate `policyVersion` against a known list.
- **Test:** water-flow — OTP login audits a row; transition failure is visible, not silent.

## RCA-G — Connection-layer resilience / config hazards · SEVENTH

- **Root cause:** ADR-promised fallback/resilience paths partly unwired; config defaults are footguns.
- **Connected chain:** Redis namespace defaults to `NODE_ENV` → staging/prod collision [P2]; `/auth/refresh` no retry/backoff/timeout → frozen app on brief outage [P2]; rate-limit Postgres fallback in ADR-0024 not wired [P1].
- **Root fix:** assert/require unique `AXHY_REDIS_NAMESPACE` in prod; add timeout + bounded backoff to refresh. **Judgment (research):** rate-limit PG fallback — is it needed, or is the ADR overpromising? → likely **fix the ADR to match reality** (fail-open/fail-closed is acceptable for a rate-limiter at our scale) rather than build a SQL sliding-window. Decide with a quick best-practice check.
- **Test:** integration — refresh survives a transient 5xx; namespace assertion fires when unset in prod.

## RCA-H — Incomplete features to COMPLETE (not defer) · EIGHTH

- **Worker leave / notifications / drawer (21 stubs)** — workers must be able to request leave + see notifications. **Build the real flow** (UI + route + DB + state) end-to-end.
- **Supervisor Memory screen** — wire `GET /supervisor/living-doc` + render the rules (the data exists via `living-doc.ts`).
- **Notification prefs** — wire `Membership.notificationPrefs` + `PATCH /me/notification-prefs` (replace local-only).
- **Test:** water-flow each, both directions.

## RCA-E — HR-update PRODUCER + fan-out · WITH THE HR BUILD

- `POST /hr-updates` + outbox `hr_update.posted` + dispatcher handler [P0×2/P1]. This is the **HR portal producer side** — built in the HR phase (consumer side already works). Cascade-depth comment = **doc fix** (it's a design constraint, not runtime-enforced).

---

## Cross-cutting "is the doc wrong, not the code?" items

- Cascade depth ≤3 (RCA-E) — fix the comment.
- Rate-limit PG fallback (RCA-G) — likely fix ADR-0024.
- Memory drawer "23 rules · 12 aliases" claim — fix the design-doc claim (code shows empty until wired by RCA-H).
- Supervisor "I'm done"/Wages cards — already correctly marked deferred; leave doc honest.

## Execution order (roots first)

**A → D → B → C → F → I → G → H** (worker/supervisor) → **E** (HR phase) → **Android MCP water-flow over every fixed route** → UI polish pass (frontend-design) → honest handoff.

Each fix: read real code → `check_before_edit` → minimal root change → mixed water-flow + integration test vs **Railway prod DB** → `check_before_build` → mark done only when green.
