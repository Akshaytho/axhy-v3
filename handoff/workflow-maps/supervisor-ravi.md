# Workflow Maps — Supervisor (Ravi)

> **Layer 2 — workflow architecture.** Reads alongside `execution-state/supervisor-ravi.md` (which is the build-state tracker). This file is the _journey_ layer: how each workflow is intended to run end-to-end from Ravi's seat, what entities are touched, where the implementation horizon is.
>
> Spec lineage:
>
> - `axhy-v3/docs/specs/2026-05-14-supervisor-responsibility-model.md` §§5–7
> - `axhy-v3/docs/specs/2026-05-15-workflow-design-closure.md` §§3–9
> - `axhy-v3/docs/specs/2026-05-12-supervisor-mobile-r6-design.md` (R6)
> - `axhy-v3/docs/audits/2026-05-14-1yr-sim-supervisor-ravi.md`

## Current-slice focus

The diagram below shows ONLY the path the active routing slice touches. Updated at start, pause/block, and after verify+commit (failure-mode rule 8).

```mermaid
graph LR
    classDef built fill:#1e8e3e,stroke:#0b6624,color:#fff
    classDef wip fill:#1a73e8,stroke:#0b3d8a,color:#fff
    classDef current fill:#fff176,stroke:#806e00,color:#000
    classDef notstarted fill:#e53935,stroke:#7a1715,color:#fff
    classDef horizon fill:#fff,stroke:#e53935,stroke-dasharray: 5 5,color:#e53935

    A[Chat extraction emits<br/>DecisionCard]:::built
    A --> B[Should write<br/>SupervisorDecision PROPOSED<br/>row D17]:::notstarted
    B --> C[Routing helper<br/>getEffectiveBinding<br/>+ derive primary site]:::current
    C --> D[GET /decisions/proposed-for-me<br/>returns rows for current responsible]:::current
    D --> E[Today tab consumes<br/>the read API]:::notstarted

    H{{Implementation horizon —<br/>WIP 84ae39c<br/>4th test file unwritten<br/>real-DB run not yet executed}}:::horizon

    C -.-> H
    H -.-> D
```

**State of current slice:** routing slice paused at WIP commit `84ae39c`. Helpers + 2 routes + 3 of 4 tests written. Real-DB sweep not yet run. The blocking step is the test file `apps/backend/test/effective-responsibility-point-in-time.test.ts`.

---

## Journey 1 — Worker no-show → mark absent → maybe replacement

The most-common daily flow. Ravi gets a phone call from Suresh-the-supervisor-of-record, or notices on the chat. Spec: data-flow §5; ops-workflow-model A.C11 + F28.

```mermaid
graph TD
    classDef built fill:#1e8e3e,stroke:#0b6624,color:#fff
    classDef partial fill:#f5b400,stroke:#8a6900,color:#000
    classDef notstarted fill:#e53935,stroke:#7a1715,color:#fff
    classDef table fill:#e0f2f1,stroke:#00695c,color:#000
    classDef event fill:#ede7f6,stroke:#4527a0,color:#000
    classDef horizon fill:#fff,stroke:#e53935,stroke-dasharray: 5 5,color:#e53935

    Start(("Worker Mukesh<br/>doesn't show up at 7am"))
    Start --> Voice[Ravi voice-captures<br/>'Mukesh didn't come']:::built
    Voice --> Chat[POST /chat/messages — backend]:::built
    Chat --> Extract[AI extracts intent →<br/>DecisionCard MARK_ABSENT C11]:::built
    Extract --> Card[Card shown in mobile chat]:::built
    Card --> Apply[Ravi taps Apply]:::built

    Apply --> MarkRoute[POST /workers/:id/mark-absent]:::built
    MarkRoute --> AttRow[(Attendance row)]:::table
    MarkRoute --> AuditMA{{AuditEvent: WORKER_MARKED_ABSENT}}:::event
    MarkRoute --> Outbox[(Outbox: hr.attendance_marked)]:::table

    Apply -.->|"design intends"| DwiPath[Write SupervisorDecision<br/>PROPOSED row + originContext]:::notstarted

    H1{{Implementation horizon —<br/>DWI lifecycle skipped today;<br/>chat applies direct mutation}}:::horizon
    DwiPath -.-> H1

    AttRow --> Replace{Replacement<br/>needed?}
    Replace -->|"yes — F28"| InviteRoute[POST replacement-invite]:::notstarted
    Replace -->|"no"| End1(("Suresh's pay deducted ₹500"))

    InviteRoute --> InviteEvent{{AuditEvent: REPLACEMENT_INVITE_SENT}}:::event
    InviteEvent --> Wait[Wait for worker accept/reject]:::notstarted
    Wait --> End2(("Replacement on site"))
```

**What's intended but missing:**

- DWI lifecycle path (D17 row): the chat applies the mutation directly today, skipping PROPOSED → APPLIED. Every audit + analytics use case behind that lifecycle is gone.
- Replacement invite (F28): no backend route, no UI, no worker-side response surface.

**What's load-bearing today:** Attendance row + AuditEvent. Pay-deduct math works. The 1-of-3 surfaces that's fully `END_TO_END` for daily ops.

---

## Journey 2 — Daily scheduling (calendar → assignment → visit)

Ravi's recurring weekly rhythm. Spec: ops-workflow-model B.B7–B10 + C.C12; R6 §4.

```mermaid
graph TD
    classDef built fill:#1e8e3e,stroke:#0b6624,color:#fff
    classDef partial fill:#f5b400,stroke:#8a6900,color:#000
    classDef notstarted fill:#e53935,stroke:#7a1715,color:#fff
    classDef table fill:#e0f2f1,stroke:#00695c,color:#000
    classDef event fill:#ede7f6,stroke:#4527a0,color:#000
    classDef horizon fill:#fff,stroke:#e53935,stroke-dasharray: 5 5,color:#e53935

    Start(("Sunday evening — Ravi<br/>plans next week"))
    Start --> CalCreate[Create CalendarEntry<br/>for Mon-Sat]:::partial
    CalCreate --> CalRow[(CalendarEntry row)]:::table
    CalCreate --> CalEvt{{AuditEvent: CALENDAR_ENTRY_CREATED}}:::event

    H1{{No mobile UI today — backend only.<br/>Today/Summary tabs are 'Coming soon' stubs}}:::horizon
    CalRow -.-> H1

    CalRow --> Promote[Promote to Assignment<br/>POST /calendar/:id/promote]:::partial
    Promote --> AssignRow[(Assignment row)]:::table
    Promote --> Conflict{Conflict<br/>detected?}
    Conflict -->|"yes (B10)"| Reject[Reject with details]:::built
    Conflict -->|"no"| AssignEvt{{AuditEvent: ASSIGNMENT_CREATED}}:::event

    AssignRow --> ShiftStart[Worker starts shift]:::notstarted
    ShiftStart --> VisitRow[(Visit row, state=IN_PROGRESS)]:::table
    VisitRow --> WorkerEnd[Worker submits photos + ends]:::notstarted
    WorkerEnd --> EndRoute[POST /visits/:id/end]:::built
    EndRoute --> VisitEnd[(Visit row, state=ENDED)]:::table
    EndRoute --> EndEvt{{AuditEvent: VISIT_ENDED}}:::event
    EndRoute --> VerifyOutbox[(Outbox: ai.verify)]:::table

    H2{{Mid-flight horizon —<br/>worker app doesn't exist;<br/>visits stay SCHEDULED with no trigger}}:::horizon
    ShiftStart -.-> H2

    VerifyOutbox --> AIDispatch[AI verification dispatcher]:::notstarted
    AIDispatch --> Flagged{Flagged?}
    Flagged -->|"yes"| FlagSheet[Ravi reviews FlaggedReviewSheet]:::notstarted
    Flagged -->|"no"| End1(("Visit completed — billable"))
    FlagSheet --> ResolveFlag[Resolve or escalate]:::notstarted
    ResolveFlag --> End1
```

**What's intended but missing:** worker mobile app blocks the entire middle. Backend handles the start + end transitions, but no human can trigger them from Suresh's side today. AI verification dispatcher is Phase C.

---

## Journey 3 — Site complaint

Ravi logs a complaint about a site (client called, area unclean, equipment missing). Spec: data-flow §5; ops-workflow-model C13.

```mermaid
graph TD
    classDef built fill:#1e8e3e,stroke:#0b6624,color:#fff
    classDef partial fill:#f5b400,stroke:#8a6900,color:#000
    classDef notstarted fill:#e53935,stroke:#7a1715,color:#fff
    classDef table fill:#e0f2f1,stroke:#00695c,color:#000
    classDef event fill:#ede7f6,stroke:#4527a0,color:#000
    classDef horizon fill:#fff,stroke:#e53935,stroke-dasharray: 5 5,color:#e53935

    Start(("Client phones —<br/>'second floor was missed'"))
    Start --> Voice[Voice or button: 'Complaint at Lakeview']:::partial
    Voice --> Route[POST /sites/:id/complaints]:::built
    Route --> ComRow[(Complaint row<br/>severity=LOW)]:::table
    Route --> ComEvt{{AuditEvent: SITE_COMPLAINT_LOGGED}}:::event
    Route --> ComOutbox[(Outbox: hr.complaint_persisted)]:::table

    H1{{No supervisor mobile UI today —<br/>only chat-driven extraction}}:::horizon
    Voice -.-> H1

    ComRow --> Count{3+ complaints<br/>in 24h?}
    Count -->|"yes"| Cascade[SiteState → FLAGGED]:::notstarted
    Count -->|"no"| HRReview[HR reviews]:::notstarted

    Cascade --> CascadeEvt{{AuditEvent: SITE_STATE_CHANGED}}:::event
    CascadeEvt --> WorkerPush[Push to workers + supervisor<br/>'site flagged']:::notstarted

    H2{{Site state machine not wired —<br/>14 states named in schema, 0 transitions enforced}}:::horizon
    Cascade -.-> H2

    HRReview --> End1(("Complaint resolved or dismissed"))
    WorkerPush --> End2(("Crew aware site flagged"))
```

**What's intended but missing:** SiteState machine is a placeholder string today. The cascade to FLAGGED + worker push is closure Decision 5 unbuilt.

---

## Journey 4 — Chat → DWI lifecycle (the missing-middle)

The headline gap. Closure spec mandates a PROPOSED-row intermediate for every supervisor-initiated decision. Chat MVP currently skips it.

```mermaid
graph TD
    classDef built fill:#1e8e3e,stroke:#0b6624,color:#fff
    classDef partial fill:#f5b400,stroke:#8a6900,color:#000
    classDef wip fill:#1a73e8,stroke:#0b3d8a,color:#fff
    classDef notstarted fill:#e53935,stroke:#7a1715,color:#fff
    classDef table fill:#e0f2f1,stroke:#00695c,color:#000
    classDef event fill:#ede7f6,stroke:#4527a0,color:#000
    classDef horizon fill:#fff,stroke:#e53935,stroke-dasharray: 5 5,color:#e53935

    Start(("Ravi voice-captures<br/>any intent in chat"))
    Start --> Chat[POST /chat/messages]:::built
    Chat --> Extract[AI extraction → DecisionCard]:::built
    Extract --> CardShown[Card visible in mobile chat]:::built

    Extract -.->|"intended"| DwiWrite[Write SupervisorDecision<br/>PROPOSED row<br/>+ originContext snapshot]:::notstarted
    DwiWrite --> DwiRow[(SupervisorDecision row<br/>appliedAt=NULL)]:::table
    DwiWrite --> DwiEvt{{AuditEvent: DWI_PROPOSED}}:::event

    H1{{IMPLEMENTATION HORIZON —<br/>grep -r supervisorDecision.create = 0 matches.<br/>The DWI lifecycle has no writer code today.}}:::horizon
    DwiWrite -.-> H1

    DwiRow --> Read[GET /decisions/proposed-for-me]:::wip
    Read --> Route[Route by current responsibility:<br/>getEffectiveBinding +<br/>deriveWorkerPrimarySiteId]:::wip
    Route --> CurrentTab[Today / Decisions tab consumes]:::notstarted

    CurrentTab --> ApplyTap[Supervisor taps Apply]:::notstarted
    ApplyTap --> ApplyRoute[POST /decisions/:id/apply]:::notstarted
    ApplyRoute --> Flip[Set appliedAt = now]:::notstarted
    ApplyRoute --> ExecuteDomain[Execute domain mutation<br/>e.g., Attendance create]:::notstarted
    ApplyRoute --> AppliedEvt{{AuditEvent: DWI_APPLIED}}:::event

    ExecuteDomain --> End1(("Decision applied"))

    CardShown -.->|"workaround today"| DirectApply[Direct domain mutation<br/>e.g., POST /workers/:id/mark-absent]:::built
    DirectApply --> End2(("Decision applied —<br/>but no DWI audit row"))
```

**Why this matters:** every cross-cutting feature (acting cover routing, EMPLOYMENT-tier HR ack, decision-dismiss, undo) rides on the DWI lifecycle existing. Without it, those features have no rows to read.

**Current slice (routing) does the read side.** The writer side is a separate slice.

---

## Journey 5 — Ravi gets sick → Lakshmi covers (F26 from Ravi's seat)

The headline P1.5 workflow. Spec: responsibility-model §5–7; closure Decision 4.

```mermaid
graph TD
    classDef built fill:#1e8e3e,stroke:#0b6624,color:#fff
    classDef partial fill:#f5b400,stroke:#8a6900,color:#000
    classDef wip fill:#1a73e8,stroke:#0b3d8a,color:#fff
    classDef notstarted fill:#e53935,stroke:#7a1715,color:#fff
    classDef table fill:#e0f2f1,stroke:#00695c,color:#000
    classDef event fill:#ede7f6,stroke:#4527a0,color:#000
    classDef horizon fill:#fff,stroke:#e53935,stroke-dasharray: 5 5,color:#e53935

    Start(("Ravi calls Kavitha sick —<br/>'can't work next 7 days'"))
    Start --> HRCreate[Kavitha creates acting binding<br/>Lakshmi acts for Ravi]:::notstarted
    HRCreate --> Binding[(SiteSupervisorBinding<br/>actingForUserId=Ravi)]:::table
    HRCreate --> BindEvt{{AuditEvent: BINDING_CREATED}}:::event

    H1{{No HR portal UI today —<br/>HR can only create bindings via raw DB / tests}}:::horizon
    HRCreate -.-> H1

    HRCreate --> NotifyLakshmi[Push: 'You're acting for Ravi']:::notstarted
    HRCreate --> NotifyRavi[Push: 'Lakshmi is covering you']:::notstarted
    HRCreate --> NotifyWorkers[Push to all workers on Ravi's sites:<br/>'Your supervisor is Lakshmi this week']:::notstarted

    Binding --> ReadAPI[GET /sites/:id/effective-supervisor<br/>returns Lakshmi, kind=ACTING]:::wip

    H2{{Routing slice WIP @84ae39c —<br/>read API works in tests; real-DB sweep pending}}:::horizon
    ReadAPI -.-> H2

    ReadAPI --> RaviToday[Ravi opens app during sick week]:::partial
    RaviToday --> EmptyToday[Today tab empty / 'covered']:::notstarted

    Binding --> WindowEnd[7 days pass — endedAt set OR<br/>effectiveUntil reached]:::notstarted
    WindowEnd --> ExpireCron[binding-expire-sweep cron]:::notstarted
    WindowEnd --> Digest[While-You-Were-Out digest<br/>posted to Ravi]:::notstarted

    H3{{Cron framework + digest composer<br/>both NOT_STARTED}}:::horizon
    WindowEnd -.-> H3

    Digest --> RaviReturn[Ravi returns Monday]:::partial
    RaviReturn --> ReadHistorical[Activity tab — see what Lakshmi did]:::notstarted
    ReadHistorical --> End1(("Coverage transition complete"))
```

**What's built:** the binding table + EXCLUDE invariant + audit-emit helpers + reassignPermanentBinding service helper + the routing read API (WIP @84ae39c).

**Five surfaces gating end-to-end:** (1) HR portal create-binding form, (2) Lakshmi push, (3) Ravi push, (4) worker push (W-1), (5) while-you-were-out digest. None built.

---

## Journey 6 — Ravi hands sites to Anjali (F27 future-dated handoff from Ravi's seat)

Future-dated permanent reassignment. The P1.5 fix made this work mechanically. Spec: responsibility-model §7 + §9; closure §4.

```mermaid
graph TD
    classDef built fill:#1e8e3e,stroke:#0b6624,color:#fff
    classDef partial fill:#f5b400,stroke:#8a6900,color:#000
    classDef wip fill:#1a73e8,stroke:#0b3d8a,color:#fff
    classDef notstarted fill:#e53935,stroke:#7a1715,color:#fff
    classDef table fill:#e0f2f1,stroke:#00695c,color:#000
    classDef event fill:#ede7f6,stroke:#4527a0,color:#000
    classDef horizon fill:#fff,stroke:#e53935,stroke-dasharray: 5 5,color:#e53935

    Start(("Q3 rebalance —<br/>Anjali takes 3 of Ravi's sites Mon"))
    Start --> HRReassign[HR uses<br/>reassignPermanentBinding helper]:::built
    HRReassign --> OldRow[(Old SiteSupervisorBinding<br/>effectiveUntil set to Mon)]:::table
    HRReassign --> NewRow[(New SiteSupervisorBinding<br/>effectiveFrom=Mon)]:::table
    HRReassign --> SupersededEvt{{AuditEvent: BINDING_ENDED_SUPERSEDED_BY_PERMANENT}}:::event
    HRReassign --> CreatedEvt{{AuditEvent: BINDING_CREATED}}:::event

    H1{{HR portal UI absent —<br/>helper only callable from test or future code}}:::horizon
    HRReassign -.-> H1

    OldRow --> BeforeQuery[Before cutover:<br/>getEffectiveBinding returns Ravi]:::wip
    NewRow --> AfterQuery[After cutover Mon+1min:<br/>getEffectiveBinding returns Anjali]:::wip

    BeforeQuery --> RaviPortfolio[Ravi sees site in his list this week]:::notstarted
    AfterQuery --> AnjaliPortfolio[Anjali sees site in her list next week]:::notstarted

    Start -.->|"intended"| DeltaDigest[Ravi receives 'shrinking portfolio'<br/>digest tomorrow morning]:::notstarted
    Start -.->|"intended"| WorkerNotify[Workers on the 3 sites:<br/>'Your supervisor changes Monday W-3']:::notstarted

    H2{{Portfolio-delta digest + worker W-3 push<br/>both NOT_STARTED}}:::horizon
    DeltaDigest -.-> H2

    RaviPortfolio --> End1(("Monday — site routes to Anjali"))
    AnjaliPortfolio --> End1
```

**What's built:** the mechanism (binding rows + audit events + future-dated cutover via effectiveUntil — the P1.5 fix 44a453d).

**What's not:** HR portal write surface, supervisor portfolio-delta digest (audit Month 9/11 named this as MISSING), worker W-3 push.

---

## Spec lineage per journey

| Journey                       | Primary spec section                                                |
| ----------------------------- | ------------------------------------------------------------------- |
| 1 — Mark absent + replacement | ops-workflow-model §6 (C11, F28); data-flow §5                      |
| 2 — Daily scheduling          | R6 §4; ops §6 (B7–B10, C12); state-machines visit.ts                |
| 3 — Site complaint            | data-flow §5; ops §6 (C13); closure Decision 5 (site state cascade) |
| 4 — Chat → DWI lifecycle      | D.1 §2; closure Decision 7 (originContext); ops §6 (D16–D20)        |
| 5 — F26 sick coverage         | responsibility-model §5–7; closure Decision 4                       |
| 6 — F27 future-dated reassign | responsibility-model §7+§9; closure §4; P1.5 fix commit `44a453d`   |

## Recent commits affecting Ravi's journeys

```
d4bb4c8 docs(handoff): execution-state tracker (journey 4, 5, 6 build-state)
84ae39c wip(routing): foundation read APIs (journey 4 read side, journeys 5+6 lookup)
44a453d fix(binding): permanent reassignment uses effectiveUntil (journey 6 fix)
fe0f6f4 test(binding): SiteSupervisorBinding real-DB lifecycle tests (journeys 5+6)
a8eed8b feat(audit): BINDING_* audit helpers (journeys 5+6)
9c0b3d8 feat(schema): SiteSupervisorBinding table (journeys 5+6)
```
