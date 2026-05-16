# Workflow Maps — HR (Kavitha)

> **Layer 2 — HR control-plane journey architecture.** Reads alongside `execution-state/hr-kavitha.md`. Most HR backend primitives are PARTIAL (table + helpers shipped) but the admin-web HR portal does not exist — `apps/admin-web/app/hr/` is missing. Diagrams show the intended flow plus where the absent portal is the implementation horizon.
>
> Spec lineage: closure spec §4 (HR pod model) + Decisions 1, 2, 3, 6 + responsibility-model §5.7; `axhy-v3/docs/audits/2026-05-15-1yr-sim-hr-kavitha.md` (H-1..H-9).

## Single horizon for the entire HR persona

```mermaid
graph LR
    classDef built fill:#1e8e3e,stroke:#0b6624,color:#fff
    classDef partial fill:#f5b400,stroke:#8a6900,color:#000
    classDef notstarted fill:#e53935,stroke:#7a1715,color:#fff
    classDef horizon fill:#fff,stroke:#e53935,stroke-dasharray: 5 5,color:#e53935

    A[Backend tables + helpers shipped:<br/>SiteSupervisorBinding · HRPod · Policy ·<br/>Notification · Digest · audit helpers]:::partial
    A --> H{{IMPLEMENTATION HORIZON —<br/>apps/admin-web/app/hr/ does not exist.<br/>HR can only operate via raw DB / tests today.}}:::horizon
    H --> B[admin-web HR portal:<br/>queue · bindings · pods · policy ·<br/>seed-review · ack screen · audit-chain timeline]:::notstarted
```

---

## Journey 1 — Bootstrap seed review (H-6, pick 8)

The first thing Kavitha does at migration time. Per ops §8 + closure Decision 6.

```mermaid
graph TD
    classDef built fill:#1e8e3e,stroke:#0b6624,color:#fff
    classDef partial fill:#f5b400,stroke:#8a6900,color:#000
    classDef notstarted fill:#e53935,stroke:#7a1715,color:#fff
    classDef table fill:#e0f2f1,stroke:#00695c,color:#000
    classDef event fill:#ede7f6,stroke:#4527a0,color:#000
    classDef horizon fill:#fff,stroke:#e53935,stroke-dasharray: 5 5,color:#e53935

    Start(("Migration day —<br/>Surya's existing supervisors + sites imported"))
    Start --> SeedScript[Seed script reads active Assignment rows]:::notstarted
    SeedScript --> InferBinding[Infer permanent binding per site<br/>actingForUserId=NULL<br/>reason='BOOTSTRAP_SEED — pending HR review']:::notstarted
    InferBinding --> SeedRow[(SiteSupervisorBinding rows<br/>marked BOOTSTRAP_SEED)]:::table

    H1{{No seed script exists yet — closure Decision 6 +<br/>responsibility-model pick 8 + audit H-6}}:::horizon
    SeedScript -.-> H1

    SeedRow --> KavithaPortal[Kavitha opens<br/>admin-web/hr/seed-review]:::notstarted
    KavithaPortal --> ListInferred[List of inferred bindings<br/>highlighted as pending review]:::notstarted
    ListInferred --> PerRow{Per-row<br/>decision}

    PerRow -->|"Confirm"| ConfirmRoute[POST /hr/bindings/:id/confirm-seed]:::notstarted
    PerRow -->|"Reassign"| ReassignRoute[Use reassignPermanentBinding helper]:::built
    PerRow -->|"Bulk-confirm"| BulkRoute[POST /hr/bindings/bulk-confirm-seed]:::notstarted

    ConfirmRoute --> ConfirmEvt{{AuditEvent: BOOTSTRAP_SEED_CONFIRMED}}:::event
    ReassignRoute --> ReassignEvt{{AuditEvent: BOOTSTRAP_SEED_REASSIGNED}}:::event
    BulkRoute --> BulkEvts{{N × AuditEvent: BOOTSTRAP_SEED_CONFIRMED}}:::event

    ConfirmEvt --> End1(("Binding marked verified —<br/>reason field cleared"))
    ReassignEvt --> End2(("Old binding superseded — new permanent active"))
    BulkEvts --> End3(("Pod's seeds confirmed in batch"))
```

---

## Journey 2 — Create acting cover (H-1, F26 orchestration)

Kavitha gets a call: Ravi is sick. She needs to bind Lakshmi as acting for Ravi's sites.

```mermaid
graph TD
    classDef built fill:#1e8e3e,stroke:#0b6624,color:#fff
    classDef partial fill:#f5b400,stroke:#8a6900,color:#000
    classDef notstarted fill:#e53935,stroke:#7a1715,color:#fff
    classDef table fill:#e0f2f1,stroke:#00695c,color:#000
    classDef event fill:#ede7f6,stroke:#4527a0,color:#000
    classDef horizon fill:#fff,stroke:#e53935,stroke-dasharray: 5 5,color:#e53935

    Start(("Ravi calls Kavitha sick"))
    Start --> Portal[admin-web/hr/bindings/new<br/>acting-coverage form]:::notstarted
    Portal --> CapacityPanel[See capacity context:<br/>Lakshmi current sites + recent decisions]:::notstarted
    CapacityPanel --> Pick[Pick acting userId = Lakshmi<br/>+ effectiveUntil = +7 days]:::notstarted

    H1{{Admin-web HR portal absent —<br/>closure §4 capacity-context panel + acting-window form}}:::horizon
    Pick -.-> H1

    Pick --> Route[POST /hr/site-supervisor-bindings]:::notstarted
    Route --> BindRow[(SiteSupervisorBinding row<br/>actingForUserId=Ravi<br/>effectiveUntil=+7d)]:::table
    Route --> CheckExclusion{Postgres EXCLUDE<br/>constraint check}

    CheckExclusion -->|"overlap detected"| Reject[Reject — show 'this site already has acting binding by X']:::built
    CheckExclusion -->|"ok"| BindEvt{{AuditEvent: BINDING_CREATED}}:::event

    BindEvt --> Outbox[(Outbox: worker_supervisor_change<br/>+ acting_window_start)]:::table
    Outbox --> Dispatcher[Outbox dispatcher]:::notstarted

    Dispatcher --> NotifyLakshmi[Push: 'You're acting for Ravi]:::notstarted
    Dispatcher --> NotifyRavi[Push: 'Lakshmi covers you']:::notstarted
    Dispatcher --> NotifyWorkers[Workers on Ravi's sites:<br/>push + banner + SMS + localised]:::notstarted

    H2{{Outbox dispatcher + push channel absent}}:::horizon
    Dispatcher -.-> H2

    NotifyLakshmi --> End1(("Acting window live"))
    NotifyRavi --> End1
    NotifyWorkers --> End1
```

---

## Journey 3 — Permanent reassignment + portfolio liquidation (H-2 + H-4)

Q3 rebalance: Anjali takes 3 sites from Ravi. Or a supervisor quits and his portfolio liquidates.

```mermaid
graph TD
    classDef built fill:#1e8e3e,stroke:#0b6624,color:#fff
    classDef partial fill:#f5b400,stroke:#8a6900,color:#000
    classDef notstarted fill:#e53935,stroke:#7a1715,color:#fff
    classDef table fill:#e0f2f1,stroke:#00695c,color:#000
    classDef event fill:#ede7f6,stroke:#4527a0,color:#000
    classDef horizon fill:#fff,stroke:#e53935,stroke-dasharray: 5 5,color:#e53935

    Start(("Q3 rebalance OR<br/>supervisor quits"))
    Start --> Portal[admin-web/hr/bindings/reassign<br/>'switch all sites' bulk form]:::notstarted
    Portal --> Pick[Pick sites + new supervisor +<br/>cutover date]:::notstarted

    H1{{HR portal absent — closure §4 'switch all sites'<br/>convenience UI named but unbuilt}}:::horizon
    Pick -.-> H1

    Pick --> Loop{For each site}
    Loop --> CallHelper[reassignPermanentBinding helper]:::built
    CallHelper --> OldRow[(Old binding<br/>effectiveUntil=cutover)]:::table
    CallHelper --> NewRow[(New binding<br/>effectiveFrom=cutover)]:::table
    CallHelper --> SupersededEvt{{AuditEvent: BINDING_ENDED_SUPERSEDED_BY_PERMANENT}}:::event
    CallHelper --> CreatedEvt{{AuditEvent: BINDING_CREATED}}:::event

    Loop --> NotifyOld[Push to losing supervisor:<br/>'portfolio shrinks by N']:::notstarted
    Loop --> NotifyNew[Push to gaining supervisor:<br/>'you now own N new sites']:::notstarted
    Loop --> NotifyWorkers[Workers on each site: W-3 push]:::notstarted

    H2{{Portfolio-delta digest + worker W-3 push absent —<br/>audit Month 9/11 flagged this as MISSING}}:::horizon
    NotifyOld -.-> H2

    NotifyOld --> End1(("Reassignment effective at cutover"))
    NotifyNew --> End1
    NotifyWorkers --> End1
```

---

## Journey 4 — EMPLOYMENT-tier final ack gate (H-7, D20 HR side)

Ravi proposes terminating a worker. Kavitha is the ack gate.

```mermaid
graph TD
    classDef built fill:#1e8e3e,stroke:#0b6624,color:#fff
    classDef partial fill:#f5b400,stroke:#8a6900,color:#000
    classDef notstarted fill:#e53935,stroke:#7a1715,color:#fff
    classDef table fill:#e0f2f1,stroke:#00695c,color:#000
    classDef event fill:#ede7f6,stroke:#4527a0,color:#000
    classDef horizon fill:#fff,stroke:#e53935,stroke-dasharray: 5 5,color:#e53935

    Start(("Ravi proposes terminate in chat"))
    Start --> Dwi[Write SupervisorDecision<br/>tier=EMPLOYMENT<br/>ackRequired=true<br/>+ originContext snapshot]:::notstarted
    Dwi --> DwiRow[(SupervisorDecision row<br/>+ originContext JSONB<br/>+ proposedDuringAbsence)]:::table

    H1{{DWI writer NOT_STARTED.<br/>Schema columns BUILT (P1.5).<br/>Chat emits WORKER_TERMINATION_REQUESTED AuditEvent only.}}:::horizon
    Dwi -.-> H1

    DwiRow --> Queue[Routes to HR pod queue]:::notstarted
    Queue --> AckScreen[admin-web/hr/ack/:id<br/>typed-phrase capture]:::notstarted
    AckScreen --> DecisionPanel[Decision-support panel:<br/>originContext + worker history +<br/>recent decisions]:::notstarted

    H2{{HR ack screen + decision-support panel absent}}:::horizon
    AckScreen -.-> H2

    DecisionPanel --> Type[Kavitha types exact phrase<br/>(per closure §5.3.9)]:::notstarted
    Type --> AckRoute[POST /decisions/:id/ack-employment]:::notstarted
    AckRoute --> Acked[(DWI ackedAt set)]:::table
    AckRoute --> AckEvt{{AuditEvent: TERMINATION_ACKED}}:::event

    Acked --> ApplyAfter[Auto-apply or queue for apply]:::notstarted
    ApplyAfter --> WorkerTerm[(Worker.state = TERMINATED)]:::table
    ApplyAfter --> AppliedEvt{{AuditEvent: TERMINATION_APPLIED}}:::event
    AppliedEvt --> ThreeAudience[3-audience push:<br/>originator + responsible + subject]:::notstarted

    ThreeAudience --> End1(("Termination effective"))
```

---

## Journey 5 — HR queue + leave approval (E21 HR side, SLA-tiered)

Closure Decision 3: 3 tiers + age-escalation.

```mermaid
graph TD
    classDef built fill:#1e8e3e,stroke:#0b6624,color:#fff
    classDef partial fill:#f5b400,stroke:#8a6900,color:#000
    classDef notstarted fill:#e53935,stroke:#7a1715,color:#fff
    classDef table fill:#e0f2f1,stroke:#00695c,color:#000
    classDef event fill:#ede7f6,stroke:#4527a0,color:#000
    classDef horizon fill:#fff,stroke:#e53935,stroke-dasharray: 5 5,color:#e53935

    Start(("Worker / supervisor creates<br/>LeaveRequest"))
    Start --> LRRow[(LeaveRequest row<br/>state=REQUESTED)]:::table
    LRRow --> QView[QueueItem view surfaces it]:::built

    QView --> Tier{Tier by Policy<br/>(closure Decision 3)}
    Tier -->|"URGENT 2h SLA"| Urgent[Top of queue]:::notstarted
    Tier -->|"NEXT_DAY 24h SLA"| NextDay[Mid queue]:::notstarted
    Tier -->|"STANDARD 7d"| Standard[Bottom]:::notstarted

    H1{{Tier classification logic + Policy reads absent —<br/>Policy table exists, classifier code does not}}:::horizon
    Tier -.-> H1

    Urgent --> Lock[Pessimistic lock acquired]:::notstarted
    Lock --> LockEvt{{AuditEvent: HR_QUEUE_LOCK_ACQUIRED}}:::event
    Lock --> KavithaUI[admin-web HR queue UI]:::notstarted

    KavithaUI --> Decide{Decide}
    Decide -->|"approve"| Approve[POST /leave-requests/:id/approve]:::built
    Decide -->|"reject"| Reject[POST /leave-requests/:id/reject]:::built
    Decide -->|"skip"| SkipUnlock[Release lock]:::notstarted

    Approve --> LREvt{{AuditEvent: LEAVE_APPROVED}}:::event
    Reject --> RejectEvt{{AuditEvent: LEAVE_REJECTED}}:::event

    LRRow --> AgeWatch{Age > SLA?}
    AgeWatch -->|"yes"| Escalate[Auto-escalate tier]:::notstarted
    Escalate --> EscEvt{{AuditEvent: HR_QUEUE_TIER_ESCALATED}}:::event

    H2{{Age-escalation cron not built (Stream F)}}:::horizon
    AgeWatch -.-> H2

    Approve --> End1(("Leave granted"))
    Reject --> End2(("Leave rejected with reason"))
```

---

## Journey 6 — HR-absent fallback (H-5, G-1, closure Decision 2)

What happens when Kavitha herself is on PTO for 3 days. Closure Decision 2: tiered fallback.

```mermaid
graph TD
    classDef built fill:#1e8e3e,stroke:#0b6624,color:#fff
    classDef notstarted fill:#e53935,stroke:#7a1715,color:#fff
    classDef table fill:#e0f2f1,stroke:#00695c,color:#000
    classDef event fill:#ede7f6,stroke:#4527a0,color:#000
    classDef horizon fill:#fff,stroke:#e53935,stroke-dasharray: 5 5,color:#e53935

    Start(("Kavitha takes 3-day PTO"))
    Start --> Queue[(HR queue items pile up)]:::table
    Queue --> AgeCheck[Per-item age timer ticks]:::notstarted

    AgeCheck --> Tier1{Age > 24h?}
    Tier1 -->|"yes"| InheritBackup[Backup pod owner inherits<br/>per HRPod.backupOwnerUserId]:::notstarted
    InheritBackup --> InheritEvt{{AuditEvent: HR_FALLBACK_INVOKED tier=1}}:::event
    InheritBackup --> NotifyBackup[Push to backup owner]:::notstarted

    AgeCheck --> Tier2{Age > 48h?}
    Tier2 -->|"yes"| CrossPod[Any HR user can override<br/>via cross-pod override flow]:::notstarted
    CrossPod --> CrossEvt{{AuditEvent: HR_CROSS_POD_OVERRIDE_USED tier=2}}:::event

    AgeCheck --> Tier3{Age > 72h?}
    Tier3 -->|"yes"| OwnerOverride[Owner emergency-override available<br/>(explicit invocation, NOT auto)]:::notstarted
    OwnerOverride --> OwnerNotify[Notify owner with severity]:::notstarted
    OwnerNotify --> OwnerInvoke[Owner explicitly invokes override]:::notstarted
    OwnerInvoke --> OverrideEvt{{AuditEvent: EMERGENCY_OVERRIDE_ACTIVATED tier=3}}:::event

    H1{{All three fallback tiers NOT_STARTED.<br/>HRPod columns exist (primaryOwnerUserId + backupOwnerUserId)<br/>but the age-tracking cron + escalation logic absent}}:::horizon
    Tier1 -.-> H1

    OverrideEvt --> End1(("Owner can take action on urgent items"))
```

---

## Spec lineage per journey

| Journey                              | Primary spec section                                  |
| ------------------------------------ | ----------------------------------------------------- |
| 1 — Bootstrap seed                   | responsibility-model §10 + pick 8; closure Decision 6 |
| 2 — Create acting                    | closure §4 + Decision 4; responsibility-model §5.7    |
| 3 — Permanent reassign + liquidation | closure §4; ops §8; P1.5 fix `44a453d`                |
| 4 — EMPLOYMENT ack                   | closure §5.3.9 + Decision 7; D.1 §2.5                 |
| 5 — HR queue + SLA                   | closure Decision 3                                    |
| 6 — HR-absent fallback               | closure Decision 2 (G-1)                              |
