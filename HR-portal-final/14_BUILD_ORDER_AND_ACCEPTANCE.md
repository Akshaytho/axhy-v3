# 14 — Build Order & Acceptance

> Source of truth: `99_CANON_FACTS.md`, `05_FEATURE_INVENTORY.md`, `10_API_CONTRACTS.md`, `11_ARCHITECTURE.md §7`. This is the execution plan: what to build, in what order, and how to know each piece is _actually_ done. It follows Axhy's vertical-slice rule — foundation → consumer surface → feedback loop — not backend-first-for-months. (memory `feedback_vertical_slices_not_backend_first`)

The portal is **Layer 2** on a **Layer-1 foundation that's mostly schema-present but route/driver-absent.** So Layer 1 here is "finish the plumbing," not "design new tables."

---

## Sequencing principle

Each wave ships a **thin vertical slice** that a real HR user can walk end-to-end (fresh UI → kept/new route → real DB → audit/notification), proven by a Playwright walk against the running UI (not ahead of it — §12.6 lesson). No wave is "done" on typecheck alone.

Order is driven by **Kavitha's pain frequency × bluntness of the current workaround:** leave + people are daily and already half-built (start there to retire curl fastest); the queue + pods are the structural backbone (build next, everything routes through them); terminations + coverage are high-stakes and need backend driver-wiring (after the backbone); payroll + audit are periodic (last).

---

## Wave 0 — Foundation finish (Layer 1 plumbing)

**Blocked-by (settle first, from `12 §C`):** the QueueItem projection-vs-table choice, the api-client generate-vs-handwrite choice, and the termination ack-driver wiring. These three gate the rest of the build; answer them before writing Wave-0 code.

Build the routes/drivers/cron the schema already anticipates. No HR surface yet.

- **HRPod CRUD** (`POST/PATCH/GET /hr-pods`, `MEMBERSHIP_POD_ASSIGNED`) — pods are assumed-existing by everything else.
- **Pod-assignment migration** + the 30-day "all HR see all rows" transition.
- **QueueItem decision** (projection vs. thin table; §C1 in `12`) + lock fields + `HR_QUEUE_LOCK_*`.
- **NotificationService** (fallback chain) + dispatcher wiring + **HR-facing read/ack** routes.
- **Cron framework** + shell jobs: `hr-availability-sweep`, `hr-queue-age-escalation`, `bootstrap-seed-aging-sweep`, `binding-expire-sweep`, digest composers.
- **Termination driver** — wire the HR-ack lock + worker-machine transition + `originContext` population (the §C3 gap).
- **admin-web auth hardening** — refresh-token rotation; the fresh `/hr` shell + `requireRole('HR')`.
- **Identity helper** — one `workerIdentity` module surfacing `Worker.id` correctly everywhere (§12.1).
- **RLS on HR tables** — enable Postgres row-level security on the HR-touched tables (today RLS is only on chat embeddings; app-level `companyId` filtering is currently load-bearing). Closes the INV-1 constitutional debt noted in `04 §3`.

**Exit:** migrations applied; all new audit kinds emit; HRPod CRUD works; notifications deliver; the termination driver transitions a worker in a real-DB test; the fresh shell renders behind the role gate.

---

## Wave 1 — Daily bread (retire curl fastest)

The two things HR does every day, already half-built.

- **People:** S3 directory, S4 invite member, S5 invite worker, S6 worker detail + anonymize. (Routes 1-6 kept.)
- **Leave:** S14 inbox, S15 detail approve/reject (with lock). (Routes 12-15 kept.)
- **Sites + bindings:** S7-S10. (Routes 7-9 kept.)
- **Thin payroll-reconciliation export (pulled forward from Wave 5):** a read-only per-worker **attendance + base** summary for a period that HR can export and diff against Tally. Not the full close screen — just the reconciliation that retires the manual Excel attendance-export step. This is deliberately early because **payroll is the named fear** and a coordination-only Wave 1 would leave it untouched for months; even a read-only export earns trust faster than another coordination screen.

**Exit (acceptance):** Kavitha invites a worker, the worker OTP-activates, HR approves a leave (replacement invite fires + worker notified), HR creates an acting binding (handoff generated, same-day-freeze enforced), HR anonymizes a resigned worker (owner-notified), **and exports a month's attendance+base reconciliation** — **all in the fresh UI, zero curl**, proven by a Playwright walk + real-DB assertions on the audit rows.

---

## Wave 2 — The backbone (queue + pods)

Everything routes through here; build once the daily surfaces prove the shell.

- **S1 Pod home** (the landing).
- **S2 Queue** + **S2a lock** + **C3 SLA badges/escalation**.
- **C4 multi-HR lock UI** across ACT screens.
- **Cross-pod tabs** (my pod / backing up / all pods) with audited override.

**Exit:** two HR users cannot silently collide on a row (lock proven); an URGENT item floats above 47 routine rows (SLA proven); pod-home counts match the DB; cross-pod override writes its audit. The Month-2 and Month-6 failures are demonstrably gone.

---

## Wave 3 — High-stakes (terminations + coverage correction)

Needs Wave-0 driver-wiring; high blast radius, so after the backbone is stable.

- **S16 termination ack** (decision-support) — on the now-wired driver.
- **S11 acting-cover wizard** (create/cancel/re-pick with notification text).
- **S12 permanent reassign**, **S13 switch-all-sites** (atomic).

**Exit:** a supervisor-proposed termination is acked with full context the same day (Month-7 gone); a cover re-pick notifies the dropped supervisor (Month-8 gone); a quitting supervisor's 8 sites move in one atomic action + membership inactive (Month-11 gone). Real-DB tests assert atomicity + the 3-audience push.

---

## Wave 4 — Setup, broadcast & audit

- **S19 bootstrap review** (one-time; `bypassFreezeReason`).
- **S17 HR Updates composer** (`POST /hr-updates`) + **S18 HR rules editor**.
- **S20 audit-chain** reconstruction.

**Exit:** Day-1 seed confirmed via the screen, not Sequel Pro (Month-1 gone); an HR Update fans out and supervisors must 5-word-ack; the audit chain renders a readable who-owned-what-when timeline (Month-9 gone).

---

## Wave 5 — The fear (payroll-close, prep-only)

- **S21 payroll-close** — computed per-worker summary (Visit + LeaveRequest + overtime + `Membership.baseSalaryPaise`), HR edits + approves a file. **No engine.**

**Exit:** month-end produces a reconciled per-worker summary HR trusts, replacing the Excel-vs-Tally step — even though disbursement stays manual. The first real "payroll is easier" win.

---

## Acceptance bar (every wave)

Per the founder's strict QA standard (memory `feedback_qa_strict_production_standard`), a wave passes only when:

1. **Gates green** — typecheck + unit + integration (real DB, no mocked Prisma).
2. **Screen walk** — every screen's state matrix (`07`) greened forward _and_ back, in a real browser (Playwright against the running UI, dev OTP `123456`).
3. **State coverage** — every state machine / lifecycle the wave touches is exercised with a real-DB test.
4. **Real data** — no seed-only proof; drive with created-then-acted-on rows.
5. **All cases** — happy + negative + edge (lock collision, out-of-pod 404, suspended-company block, same-day-freeze refusal, overlap refusal, atomic-failure rollback).
6. **Governance audit** — every MUST/MUST NOT in `04 §8` checked against the wave's surfaces.
7. **Honesty** — the done-memo states what was driven on-device vs. what rests on tests; no optimistic "done."
8. **Real-life narrative** — the wave's exit scenario (a Kavitha month) actually walks.

A wave that skips a section is not done; re-open it. (`feedback_qa_strict_production_standard`, `sop_qa_enterprise_walk`)

---

## Traceability — pain → wave

|                              Kavitha month | Pain                            | Closed in                                           |
| -----------------------------------------: | ------------------------------- | --------------------------------------------------- |
|                                          1 | bootstrap triage via SQL+Gmail  | Wave 4 (S19)                                        |
|                                          2 | silent double-approval          | Wave 2 (lock)                                       |
|                                          4 | HR-absent 72h park              | Wave 0 (fallback cron) + Wave 2 (queue visibility)  |
|                                          6 | urgent item buried              | Wave 2 (SLA)                                        |
|                                          7 | context-free termination        | Wave 3 (S16)                                        |
|                                          8 | silent disappearing bindings    | Wave 3 (S11 notify)                                 |
|                                          9 | unreadable audit chain          | Wave 4 (S20)                                        |
|                                         11 | hand-curl portfolio liquidation | Wave 3 (S13)                                        |
|                               (named fear) | payroll harder, not easier      | Wave 1 (recon export, partial) → Wave 5 (S21 close) |
| accounts (advances/statutory/F&F/pro-rata) | half her job untouched          | Deferred (`05` G3–G5) — named, not silently dropped |

**Month-end acceptance (added so "done" includes the accounts half):** before the portal is called done for Kavitha, a real month-end must walk — **a mid-month joiner paid pro-rata, an outstanding advance shown and deducted, and a disputed attendance day reopened-and-corrected before approve** (S21 states). Coordination acceptance (the nine months above) and accounts acceptance are _both_ required; a portal that passes only the coordination months is, by the persona's own title, half-done.

When the nine coordination months close end-to-end **and** the month-end accounts scenario walks, the HR portal is done for v1 — with statutory/F&F/bonus honestly deferred. The acceptance test is not a feature count — it's **Kavitha's year stops hurting**, both halves of it.
