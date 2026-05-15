# Workflow Maps — Combined / Cross-Persona End-to-End

> **Layer 2 — system flow architecture.** This is the load-bearing artifact for "does Supervisor / Worker / HR / Owner line up together?" Each sequence diagram shows every participating persona + backend + outbox, with the implementation horizon marked explicitly.
>
> Reads alongside `execution-state/combined.md` (which tracks the build-state roll-up). Diagrams here show the INTENDED end-to-end flow; horizon markers show where it actually stops today.
>
> Spec lineage: closure spec §3–9; responsibility-model §5.5–5.9; ops-workflow-model §6 + §12; the 5 audit drafts in `axhy-v3/docs/audits/`.

## Reading conventions

- 🟢 = step is BUILT today
- 🟡 = step is PARTIAL
- 🔵 = step is WIP this slice
- ⛔ = IMPLEMENTATION STOPS HERE — everything below this point is intended but not coded
- 🔴 = step is NOT_STARTED
- Dashed arrows after ⛔ = "spec says this should happen"

## Sequence 1 — F26 Acting cover (Ravi sick, Lakshmi covers for 7 days)

The headline P1.5 workflow. Friend's audit Month 8.

```mermaid
sequenceDiagram
    actor Ravi as Ravi (covered)
    actor Kavitha as Kavitha (HR)
    actor Lakshmi as Lakshmi (acting)
    actor Suresh as Suresh (worker on Ravi's site)
    participant Admin as admin-web HR portal
    participant BE as backend
    participant DB as Postgres
    participant OBX as Outbox/dispatcher
    participant WApp as Worker app

    Note over Ravi,Kavitha: 🟢 Phone call works today<br/>(off-app)
    Ravi->>Kavitha: "I'm sick — can't work for a week"

    Note over Kavitha,Admin: 🔴 admin-web HR portal doesn't exist
    Kavitha--xAdmin: opens /hr/bindings/new (DOESN'T EXIST)

    Note over Admin,BE: ⛔ IMPLEMENTATION STOPS HERE for HR creation flow

    rect rgba(255,200,200,0.2)
    Admin-->>BE: POST /hr/site-supervisor-bindings (acting Lakshmi → Ravi's sites)
    BE-->>DB: 🟢 INSERT SiteSupervisorBinding row (P1.5 BUILT)
    DB-->>BE: 🟢 EXCLUDE constraint passes
    BE-->>DB: 🟢 emit BINDING_CREATED AuditEvent (helper BUILT)
    BE-->>OBX: 🔴 enqueue worker_supervisor_change + acting_window_start
    end

    Note over OBX,Suresh: 🔴 outbox dispatcher to WhatsApp/SMS/push NOT_STARTED
    OBX-->>WApp: 🔴 push to Suresh (W-1)
    OBX-->>Lakshmi: 🔴 push "You're acting"
    OBX-->>Ravi: 🔴 push "Lakshmi covers"

    Note over Lakshmi,BE: 🔵 Read-side WIP this slice (commit 84ae39c)
    Lakshmi->>BE: GET /sites/:id/effective-supervisor
    BE->>DB: 🔵 getEffectiveBinding (WIP)
    DB-->>BE: returns Lakshmi binding (kind=ACTING)
    BE-->>Lakshmi: { userId: Lakshmi, kind: ACTING, ... }

    Note over Ravi,WApp: 🔴 During sick week — supervisor app + worker app blind to handoff in UI
    Ravi-->>BE: opens Today tab
    BE-->>Ravi: stub "Coming soon — Slice 2+"

    Note over Lakshmi,BE: 7 days pass — window expiry
    BE-->>BE: 🔴 binding-expire-sweep cron (NOT_STARTED — Stream F)
    BE-->>DB: 🔴 set endedAt OR effectiveUntil reached
    BE-->>DB: 🔴 emit BINDING_ENDED_AUTO
    BE-->>OBX: 🔴 compose while-you-were-out digest
    OBX-->>Ravi: 🔴 digest delivered Mon morning
```

**Where it really stops today:** the helper + audit-emit layer is built and verified. Everything above the routing read API is unbuilt: HR portal, dispatcher, worker push, cron. 5 surfaces gate end-to-end.

---

## Sequence 2 — F27 Permanent reassignment (future-dated handoff)

Q3 rebalance. Anjali takes 3 of Ravi's sites starting Monday.

```mermaid
sequenceDiagram
    actor Kavitha as Kavitha (HR)
    actor Ravi as Ravi (losing)
    actor Anjali as Anjali (gaining)
    actor Suresh as Suresh (worker on site)
    participant Admin as admin-web HR portal
    participant BE as backend
    participant DB as Postgres
    participant OBX as Outbox/dispatcher

    Note over Kavitha,Admin: 🔴 HR portal absent
    Kavitha--xAdmin: opens /hr/bindings/reassign (DOESN'T EXIST)

    Note over Admin,BE: ⛔ IMPLEMENTATION STOPS HERE for HR write
    rect rgba(255,200,200,0.2)
    Admin-->>BE: POST /hr/site-supervisor-bindings/reassign (cutover = Mon)
    BE-->>BE: 🟢 reassignPermanentBinding helper (P1.5 BUILT, fix 44a453d)
    BE-->>DB: 🟢 UPDATE old row effectiveUntil = Mon
    BE-->>DB: 🟢 INSERT new row effectiveFrom = Mon
    BE-->>DB: 🟢 emit BINDING_ENDED_SUPERSEDED_BY_PERMANENT + BINDING_CREATED
    end

    Note over Ravi,Anjali: BEFORE cutover (this week)
    Ravi->>BE: 🔵 GET /sites/:id/effective-supervisor (WIP)
    BE-->>Ravi: { userId: Ravi } (still owns the site)
    Anjali->>BE: 🔵 GET /sites/:id/effective-supervisor (WIP)
    BE-->>Anjali: { userId: Ravi } (Anjali doesn't see it yet)

    Note over BE,OBX: 🔴 Notification + digest absent — audit Month 9/11 MISSING
    BE--xOBX: 🔴 portfolio-delta digest to Ravi NOT_STARTED
    BE--xOBX: 🔴 'you've gained 3 sites' push to Anjali NOT_STARTED
    BE--xOBX: 🔴 worker W-3 push to Suresh NOT_STARTED

    Note over Ravi,Anjali: AT cutover (Mon 00:00)
    Ravi->>BE: 🔵 GET /sites/:id/effective-supervisor
    BE-->>Ravi: { userId: Anjali } (no longer his)
    Anjali->>BE: 🔵 GET /sites/:id/effective-supervisor
    BE-->>Anjali: { userId: Anjali } (now hers)

    Note over Suresh,OBX: 🔴 Suresh never gets told<br/>Learns via WhatsApp from a peer
```

**Where it really stops today:** mechanism BUILT (P1.5 fix is verified). Notification + digest surfaces NOT_STARTED.

---

## Sequence 3 — D17 Decision apply (the missing-middle)

The chat MVP path works but skips the DWI lifecycle entirely. Closure spec requires it.

```mermaid
sequenceDiagram
    actor Ravi as Ravi (supervisor)
    participant Mobile as mobile/chat.tsx
    participant BE as backend
    participant DB as Postgres

    Note over Ravi,Mobile: 🟢 BUILT — Wave 4a chat MVP works end-to-end
    Ravi->>Mobile: voice "Mukesh didn't come today"
    Mobile->>BE: POST /chat/messages
    BE->>BE: 🟢 AI extracts intent
    BE-->>Mobile: 🟢 DecisionCard { kind: MARK_ABSENT, workerId, ... }
    Mobile->>Ravi: shows card

    Note over BE,DB: ⛔ IMPLEMENTATION STOPS HERE for DWI lifecycle<br/>(grep -r supervisorDecision.create = 0 matches in code)

    rect rgba(255,200,200,0.2)
    Mobile-->>BE: 🔴 (intended) POST /decisions (PROPOSED)
    BE-->>DB: 🔴 INSERT SupervisorDecision row + originContext
    BE-->>DB: 🔴 emit DWI_PROPOSED AuditEvent
    Note over BE,DB: 🔵 Routing slice WIP @84ae39c covers READ side only
    Ravi-->>BE: GET /decisions/proposed-for-me
    BE-->>BE: 🔵 getEffectiveBinding + deriveWorkerPrimarySiteId
    BE-->>Ravi: returns rows routed by current responsibility
    end

    Note over Ravi,Mobile: 🟢 Today's workaround: direct mutation skips the DWI lifecycle
    Ravi->>Mobile: tap "Apply"
    Mobile->>BE: 🟢 POST /workers/:id/mark-absent (DIRECT)
    BE->>DB: 🟢 INSERT Attendance + AuditEvent + Outbox
    BE-->>Mobile: 🟢 success

    Note over BE,DB: Consequence: ALL workflows that depend on the DWI lifecycle<br/>(EMPLOYMENT ack, originContext-across-binding, dismiss/undo, analytics)<br/>have no rows to read.
```

**This is the largest single workflow gap.** Schema BUILT; writer NOT_STARTED; routing read API WIP.

---

## Sequence 4 — E21 Leave request end-to-end

Suresh → HR queue → approval → all parties notified.

```mermaid
sequenceDiagram
    actor Suresh as Suresh (worker)
    actor Ravi as Ravi (supervisor)
    actor Kavitha as Kavitha (HR)
    actor Reddy as Reddy (owner — digest only)
    participant WApp as Worker app
    participant SApp as Supervisor mobile
    participant Admin as admin-web HR portal
    participant BE as backend
    participant DB as Postgres
    participant OBX as Outbox

    Note over Suresh,WApp: ⛔ Worker app doesn't exist
    Suresh--xWApp: tries to request leave (DOESN'T EXIST)

    Note over Ravi,SApp: 🟡 Supervisor-on-behalf path partially works (route exists)
    Ravi->>SApp: voice "Suresh wants 2 days off for wedding"
    SApp->>BE: 🟢 POST /chat/messages → DecisionCard
    SApp->>BE: 🟢 POST /leave-requests (current backend shape)
    BE->>DB: 🟢 INSERT LeaveRequest row state=REQUESTED
    BE->>DB: 🟢 emit LEAVE_REQUESTED AuditEvent

    Note over BE,DB: 🟢 QueueItem view surfaces it (P1.5)
    BE->>DB: SELECT FROM axhy.QueueItem WHERE companyId

    Note over Kavitha,Admin: 🔴 HR queue UI absent
    Kavitha--xAdmin: opens /hr/queue (DOESN'T EXIST)

    Note over Admin,BE: ⛔ IMPLEMENTATION STOPS HERE for HR queue UI
    rect rgba(255,200,200,0.2)
    Admin-->>BE: GET /hr/queue (tier-classified)
    BE-->>BE: 🔴 classify by Policy SLA tiers (closure Decision 3)
    BE-->>Admin: queue items grouped URGENT/NEXT_DAY/STANDARD
    Kavitha->>Admin: tap "Approve" on Suresh's request
    Admin-->>BE: POST /leave-requests/:id/approve
    BE-->>DB: 🟢 UPDATE LeaveRequest state=APPROVED (route BUILT)
    BE-->>DB: 🟢 emit LEAVE_APPROVED AuditEvent
    BE-->>OBX: 🟢 enqueue worker.leave_approved (outbox topic BUILT)
    end

    Note over OBX,Suresh: 🔴 outbox dispatcher NOT_STARTED
    OBX-->>Suresh: 🔴 push "Approved for May 18-19"
    OBX-->>Ravi: 🔴 push "Suresh leave approved — cascade scheduled"
    OBX-->>Reddy: 🔴 (monthly digest entry queued)

    Note over Ravi,DB: 🔴 Cascade — find replacement / adjust assignments
    Ravi--xBE: 🔴 NO automatic cascade today
```

---

## Sequence 5 — E24 Worker termination end-to-end

Ravi proposes → Kavitha types phrase → applied → Suresh notified.

```mermaid
sequenceDiagram
    actor Ravi as Ravi (supervisor)
    actor Kavitha as Kavitha (HR)
    actor Suresh as Suresh (terminated worker)
    actor Reddy as Reddy (digest)
    participant SApp as Supervisor mobile
    participant Admin as admin-web HR portal
    participant BE as backend
    participant DB as Postgres
    participant OBX as Outbox
    participant WApp as Worker app

    Note over Ravi,SApp: 🟢 Chat extraction works
    Ravi->>SApp: voice "I want to terminate Mukesh — repeated no-shows"
    SApp->>BE: 🟢 POST /chat/messages
    BE-->>BE: 🟢 AI extraction
    BE->>DB: 🟢 emit WORKER_TERMINATION_REQUESTED AuditEvent
    BE->>DB: 🟢 UPDATE Worker.state = TERMINATION_PENDING

    Note over BE,DB: ⛔ IMPLEMENTATION STOPS HERE for DWI + HR ack
    rect rgba(255,200,200,0.2)
    BE-->>DB: 🔴 INSERT SupervisorDecision row<br/>tier=EMPLOYMENT, ackRequired=true,<br/>originContext snapshot (closure Decision 7)
    Kavitha->>Admin: opens ack screen (NOT_STARTED)
    Admin-->>BE: GET /hr/ack-queue
    BE-->>Admin: list of pending EMPLOYMENT-tier DWIs
    Kavitha->>Admin: opens specific DWI — decision-support panel shows originContext + worker history
    Admin->>Kavitha: typed-phrase capture per closure §5.3.9
    Admin-->>BE: POST /decisions/:id/ack-employment + phrase
    BE-->>DB: 🔴 UPDATE DWI ackedAt
    BE-->>DB: 🔴 UPDATE Worker.state = TERMINATED
    BE-->>DB: 🔴 emit TERMINATION_APPLIED AuditEvent
    BE-->>OBX: 🔴 3-audience push (originator + responsible + subject)
    end

    Note over OBX,Suresh: 🔴 Worker app + push absent
    OBX-->>Ravi: 🔴 push confirmation
    OBX-->>Kavitha: 🔴 push "Termination applied"
    OBX-->>WApp: 🔴 push to Suresh — TERMINATION_NOTIFIED_TO_SUBJECT

    Note over Suresh,WApp: 🔴 Worker app doesn't exist
    Suresh--xWApp: opens app to see (DOESN'T EXIST)
    Suresh--xWApp: appeal button (NOT_STARTED — closure Decision 5)
    Suresh--xWApp: records export (NOT_STARTED)

    OBX-->>Reddy: 🔴 monthly digest entry queued
```

**Audit verdict:** `BROKEN` — Suresh's most consequential moment is entirely offline.

---

## Sequence 6 — Overlap stress scene (audit Round 5 combined)

Multiple workflows fire the same morning. The classic "monsoon Tuesday" stress test.

```mermaid
sequenceDiagram
    actor Ravi as Ravi
    actor Lakshmi as Lakshmi (acting for Anil — different supervisor)
    actor Kavitha as Kavitha (HR)
    participant BE as backend
    participant DB as Postgres
    participant OBX as Outbox

    par 3 workers no-show simultaneously
        Ravi->>BE: 🟢 mark-absent Worker A
        Ravi->>BE: 🟢 mark-absent Worker B
        Ravi->>BE: 🟢 mark-absent Worker C
    and Kavitha creates new acting binding for another supervisor
        Kavitha->>BE: 🔴 POST /hr/bindings (acting Lakshmi for Anil)
        BE->>DB: 🟢 INSERT binding (P1.5 EXCLUDE prevents overlap)
    and Permanent reassignment cutover scheduled for tomorrow
        BE->>BE: 🟢 helper already wrote both rows; cutover tomorrow
    end

    Note over BE,DB: 🟢 EXCLUDE invariant holds across all 3 concurrent ops<br/>(P1.5 tests prove this)

    Note over BE,OBX: ⛔ Burst handling — closure Decision 9 NOT_STARTED
    rect rgba(255,200,200,0.2)
    BE-->>OBX: 🔴 coalesce 3 mark-absent events into one supervisor digest
    BE-->>BE: 🔴 AI backlog throttling chip ('Processing...')
    BE-->>BE: 🔴 global busy banner if company-wide burst detected
    end

    Note over Lakshmi,BE: 🔵 Routing slice would handle this read side correctly
    Lakshmi->>BE: GET /decisions/proposed-for-me
    BE-->>BE: 🔵 deriveWorkerPrimarySiteId for each worker
    BE-->>BE: 🔵 getEffectiveBinding for each site
    BE-->>Lakshmi: 🔵 only Anil's sites' decisions surface (correct routing)

    Note over Kavitha,DB: 🟢 Concurrent HR writes by 2+ users — DB serializes
    Note over Kavitha,DB: 🔴 But: queue lock + cross-pod override flow NOT_STARTED
```

**What works under burst today:** the DB-level invariants (EXCLUDE, CHECK constraints, FKs). What doesn't: coalescing, AI throttling, queue locks, multi-HR-user coordination.

---

## Cross-persona summary verdict (mid-2026-05-15)

| Workflow               | End-to-end status                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| F26 acting cover       | 1 of 5 surfaces wired (backend + routing WIP). HR / dispatcher / worker push / cron / digest all missing. |
| F27 permanent reassign | Mechanism 100% verified. 0 of 4 surfaces wired.                                                           |
| D17 decision apply     | Writer 0%. Reader WIP. Schema 100%.                                                                       |
| E21 leave request      | Backend 80%. HR queue UI 0%. Worker app 0%. SLA wiring 0%.                                                |
| E24 termination        | Backend partial (AuditEvent only). DWI writer 0%. HR ack 0%. Worker app 0%. Appeal 0%. Export 0%.         |
| Overlap stress         | DB invariants 100%. Coalescing / throttling 0%. Queue lock 0%.                                            |

The pattern is consistent: **backend is done or nearly done. Surfaces are not.** This is the right state for Layer 1 — but the gap will be the entire Layer 2 lift.
