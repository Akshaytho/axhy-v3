# 09 — State & Lifecycles

> Source of truth: `99_CANON_FACTS.md` §9. Primary source: `packages/state-machines/src/` (live) + the closure spec for the unwired flows. Only **6** XState machines exist (worker, visit, capture, calendar, assignment, conflicts); leave/site/membership/binding lifecycles are **service-enforced**, not XState. The portal **reads** these states and renders them; it never re-derives legality on the client (`03 §1`).

---

## 1. Worker lifecycle (15 states, XState) — `worker.ts:17-187`

```
INVITED ─INVITE_ACCEPTED→ PENDING_ACTIVATION ─OTP_VERIFIED→ DOC_PENDING ─DOCS_PROVIDED→ ACTIVE
                                                                                          │
   ┌──────────────────────────────────────────────────────────────────────────┬─────────┤
   ▼                  ▼               ▼            ▼            ▼                ▼         ▼
ON_LEAVE        ON_SUSPENSION       ABSENT      AT_RISK      BLOCKED      DOC_PENDING  TRANSFER_PENDING
(LEAVE_APPROVED)  (SUSPEND)        (NO_SHOW)  (FLAG_AT_RISK)  (BLOCK)    (DOCS_MISSING) (TRANSFER_INITIATED)
   │
ON_LEAVE ─LEAVE_RETURNED→ ACTIVE

ACTIVE ─TERMINATE→ TERMINATION_PENDING ─TERMINATION_FINALIZED→ TERMINATED ─ARCHIVE_THRESHOLD→ ARCHIVED ─ANONYMIZATION_REQUESTED→ ANONYMIZED (final)
ACTIVE ─DEACTIVATE→ INACTIVE
```

**HR-portal mapping (no jargon in UI):**
| State | UI label | Where HR sees it |
|-------|----------|------------------|
| `PENDING_ACTIVATION` | "Invited — not activated" | Worker list, after invite |
| `DOC_PENDING` | "Documents pending" | Daily review queue |
| `ACTIVE` | "Active" | everywhere |
| `ON_LEAVE` | "On leave" | after leave approval |
| `ON_SUSPENSION` | "Suspended" | from supervisor/HR action |
| `ABSENT` | "Absent (no-show)" | from supervisor mark-absent |
| `TERMINATION_PENDING` | "Termination pending" | S16 after ack |
| `TERMINATED` / `ANONYMIZED` | "Terminated" / "Anonymized" | after offboarding |

The machine is **pure**; the backend writes audit/outbox around each transition. The portal must call the transition endpoint, not patch `state` (INV 10).

---

## 2. Leave lifecycle (service-enforced)

```
REQUESTED ──approve──▶ APPROVED   (+ per affected site-shift: LEAVE_APPROVED audit + create ReplacementInvite; worker → ON_LEAVE on the dates)
          ──reject───▶ REJECTED   (reason required)
```

- Race-safe: the decide uses a conditional `updateMany` so only the first decider wins; a second decider sees "already decided" (S15 stale state).
- Gate: **HR pod-ownership** (added in HR-A1; don't regress) or supervisor portfolio.

---

## 3. Binding lifecycle (service-enforced + DB constraint)

```
create ─▶ ACTIVE binding
          ├─ effectiveUntil reached ─▶ ended (BINDING_ENDED_AUTO)
          ├─ HR ends early (endedAt) ─▶ ended (BINDING_ENDED_MANUAL)
          └─ superseded by a new permanent ─▶ ended (BINDING_ENDED_SUPERSEDED_BY_PERMANENT)
```

- **Discriminator:** `actingForUserId` NULL = permanent / set = acting (acting requires `effectiveUntil`).
- **No-overlap invariant:** ≤1 active binding per `(siteId, acting-vs-permanent)` — discriminator is a CASE over `actingForUserId` (no `kind` column; `schema.prisma:1267-1268`), enforced by Postgres `EXCLUDE USING gist`. A violating create is **refused** — the UI explains, never silently overwrites (S10 stale).
- **Handoff package** is written in the same transaction as the binding (frozen JSON, `schemaVersion=1`, `siteRules` only in v1).

---

## 4. Termination / EMPLOYMENT-tier flow

```
supervisor proposes (typed phrase)   ┐
        OR                            ├─▶ SupervisorDecision(EMPLOYMENT, PROPOSED) ─▶ HR pod queue (URGENT-ish)
HR initiates directly                ┘
                                        │
                          HR opens S16 (decision-support) ── acquires lock
                                        │
            ┌───────────────────────────┴───────────────────────────┐
       Confirm (typed phrase + ack notes)                       Cancel / send back (reason)
            │                                                        │
   worker ACTIVE → TERMINATION_PENDING → TERMINATED            decision dismissed
   3-audience push (originator + current-responsible + subject)
   7-day appeal window opens (needs a WorkerTerminationAppeal table — to build; today only a Policy key)
   TERMINATION_NOTIFIED_TO_SUBJECT audit (kind catalogued, emitter to build)
```

- **`originContext`** (immutable JSON: chat excerpt + 30-day decisions + attendance/complaint history + originator identity) is captured at decision creation and shown to HR.
- **`proposedDuringAbsence`** flags decisions authored while the originator was on acting-cover.
- **One open EMPLOYMENT-tier decision per worker** at a time (collision rejected at the app layer — part of the to-build termination driver, not yet enforced).
- ⚠ **The HR-ack lock and the worker-machine transition driver are specified but NOT wired in code** (brain `d6b6f9a4`). The portal design assumes them; **they are a build item** (`14`, Layer 2/3). Until wired, do not claim the lock exists.

---

## 5. Queue item lifecycle (to build)

```
PENDING ─open─▶ LOCKED ─resolve─▶ RESOLVED
                  │
                  ├─ TTL/abandon ─▶ PENDING (lock released, HR_QUEUE_LOCK_EXPIRED)
                  ├─ age-escalate ─▶ ESCALATED (tier upgraded; backup pinged / cross-pod unlocked)
                  └─ window passes ─▶ EXPIRED
```

- **SLA tiers:** `URGENT` 2h · `NEXT_DAY` 24h · `STANDARD` 7d · `DIGEST` none (F-P-2).
- **Age-escalation (cron `hr-queue-age-escalation`):** STANDARD 5d→NEXT_DAY; NEXT_DAY 18h→URGENT; URGENT 90min→backup pinged; URGENT 2h→cross-pod unlocked.
- **Lock:** pessimistic, 15-min, renewable; `HR_QUEUE_LOCK_ACQUIRED/RELEASED/EXPIRED/FORCE_RELEASED`.
- ⚠ **No `QueueItem` table exists yet** — decide projection-vs-table at build time (`08 §3`).

---

## 6. HR-absent fallback chain (Decision 2)

```
HR primary available?  ──yes──▶ they own the pod queue
        │ no >24h
        ▼
backup owner available? ──yes──▶ backup becomes acting primary (HR_FALLBACK_INVOKED)
        │ no, both >48h
        ▼
any HR via cross-pod override (HR_CROSS_POD_OVERRIDE_USED, reason required)
        │ all HR >72h
        ▼
owner emergency alert ─▶ EXPLICIT 7-day emergency HR grant on a specific employee/action
                         (NOT silent inheritance; route auth refuses owner-by-default)
                         EMERGENCY_OVERRIDE_ACTIVATED audit
```

- Driven by cron `hr-availability-sweep` (last-login + last-action telemetry).
- Terminal secondary contact is **F-P-8**.

---

## 7. Time gates (apply across surfaces)

- **Same-day freeze (S-001, LOCKED 2026-05-16):** once the tenant-local day starts, no supervisor-responsibility change (acting cover, permanent reassign, binding-end) takes effect until next tenant-midnight. Server enforces `assertNotChangingTodaysResponsibility` → 400 on violation. Every binding UI defaults to "effective tomorrow"; Day-1 bootstrap uses `bypassFreezeReason`.
- **Lock TTL:** 15 min, renewable on activity.
- **SLA timers:** per tier (above).

---

## 8. What does NOT use a machine (and why that's fine)

- **Membership, Site, LeaveRequest, SiteSupervisorBinding** — lifecycles are simple and enforced in service code with conditional updates + DB constraints. Adding XState here would be over-engineering. The portal still treats their states as server-owned truth.
- **The portal never invents a transition.** If a state change isn't an existing endpoint, it's a backend build item first (`10`, `14`) — the UI is never the place a new transition is "simulated."
