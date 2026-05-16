# Workflow Maps — Worker (Suresh)

> **Layer 2 — workflow architecture from Suresh's seat.** Reads alongside `execution-state/worker-suresh.md`. **Every journey here is `NOT_STARTED` from Suresh's perspective today** because the worker mobile app folder does not exist (`apps/worker-mobile/` is missing). The diagrams document the INTENDED flow so the worker-app slice, when it lands, has a target.
>
> Spec lineage: closure spec §5 (worker surface) + Decision 4 (W-1/W-2/W-3/W-7 notifications) + Decision 5 (termination notification + appeal); `axhy-v3/docs/audits/2026-05-14-1yr-sim-worker-suresh.md`.

## Single horizon for this entire persona

```mermaid
graph LR
    classDef built fill:#1e8e3e,stroke:#0b6624,color:#fff
    classDef notstarted fill:#e53935,stroke:#7a1715,color:#fff
    classDef horizon fill:#fff,stroke:#e53935,stroke-dasharray: 5 5,color:#e53935

    A[Backend: Worker, Attendance,<br/>LeaveRequest, Visit, Notification]:::built
    A --> H{{IMPLEMENTATION HORIZON —<br/>No apps/worker-mobile/ folder exists.<br/>Zero Suresh-facing surfaces today.}}:::horizon
    H --> B[Worker mobile app:<br/>auth · home · schedule · leave ·<br/>notifications · appeals · records]:::notstarted
```

Until this horizon moves, all 5 journeys below are aspirational.

---

## Journey 1 — First activation (A3 + A4)

How Suresh experiences day 1 when the worker app exists.

```mermaid
graph TD
    classDef built fill:#1e8e3e,stroke:#0b6624,color:#fff
    classDef notstarted fill:#e53935,stroke:#7a1715,color:#fff
    classDef table fill:#e0f2f1,stroke:#00695c,color:#000
    classDef event fill:#ede7f6,stroke:#4527a0,color:#000
    classDef horizon fill:#fff,stroke:#e53935,stroke-dasharray: 5 5,color:#e53935

    Start(("Kavitha sends activation SMS<br/>after onboarding paperwork"))
    Start --> SMS[Worker receives SMS link]:::notstarted
    SMS --> AppOpen[Suresh opens worker app first time]:::notstarted
    AppOpen --> OTP[OTP login screen]:::notstarted
    OTP --> AuthBE[POST /auth/otp + verify — backend reuse]:::built
    AuthBE --> Home[Home screen<br/>'Welcome Suresh' + pending docs]:::notstarted

    Home --> DocsList[Doc upload list:<br/>Aadhaar, bank passbook, photo]:::notstarted
    DocsList --> UploadRoute[POST /workers/:id/docs]:::notstarted
    UploadRoute --> WorkerRow[(Worker.state =<br/>DOC_PENDING → DOCS_SUBMITTED)]:::table

    H1{{No upload route or worker-app screen today}}:::horizon
    UploadRoute -.-> H1

    WorkerRow --> HRReview[Kavitha reviews docs]:::notstarted
    HRReview --> Approve[POST /workers/:id/activate]:::notstarted
    Approve --> WorkerActive[(Worker.state = ACTIVE)]:::table
    Approve --> ActivateEvt{{AuditEvent: WORKER_ACTIVATED}}:::event
    Approve --> NotifySuresh[Push: 'You're active — first shift tomorrow']:::notstarted

    NotifySuresh --> End1(("Suresh can see schedule"))
```

---

## Journey 2 — Marked absent (C11 subject view)

Suresh wakes up sick; supervisor marks him absent; Suresh wants to know what happened.

```mermaid
graph TD
    classDef built fill:#1e8e3e,stroke:#0b6624,color:#fff
    classDef notstarted fill:#e53935,stroke:#7a1715,color:#fff
    classDef table fill:#e0f2f1,stroke:#00695c,color:#000
    classDef event fill:#ede7f6,stroke:#4527a0,color:#000
    classDef horizon fill:#fff,stroke:#e53935,stroke-dasharray: 5 5,color:#e53935

    Start(("Ravi marks Suresh absent in chat"))
    Start --> AttRow[(Attendance row<br/>status=ABSENT_NO_CALL)]:::table
    Start --> Deduct[payDeductPaise computed]:::built
    AttRow --> Notify[Push to Suresh:<br/>'Marked absent — ₹500 deducted']:::notstarted

    H1{{No worker-side notification surface;<br/>no NOTIFY → Suresh learns via WhatsApp from a peer}}:::horizon
    Notify -.-> H1

    Notify --> AttendanceCard[Attendance history card in worker app]:::notstarted
    AttendanceCard --> DisputeButton[Dispute button — 'I was present']:::notstarted
    DisputeButton --> DisputeRoute[POST /attendance/:id/dispute]:::notstarted
    DisputeRoute --> DisputeRow[(WorkerDispute row<br/>NOT YET MODELLED)]:::table
    DisputeRoute --> DisputeEvt{{AuditEvent: WORKER_DISPUTE_FILED}}:::event

    H2{{Audit kind catalogued but no row schema,<br/>no route, no surface — audit Day 3 MISSING}}:::horizon
    DisputeRow -.-> H2

    DisputeEvt --> HRResolve[HR reviews dispute]:::notstarted
    HRResolve --> Resolution{Decision}
    Resolution -->|"upheld"| End1(("Marking stands"))
    Resolution -->|"reversed"| Reverse[POST /attendance/:id/reverse]:::notstarted
    Reverse --> End2(("Pay restored"))
```

---

## Journey 3 — Suresh requests leave (E21 worker-initiated)

He has a family wedding, wants 2 days off.

```mermaid
graph TD
    classDef built fill:#1e8e3e,stroke:#0b6624,color:#fff
    classDef partial fill:#f5b400,stroke:#8a6900,color:#000
    classDef notstarted fill:#e53935,stroke:#7a1715,color:#fff
    classDef table fill:#e0f2f1,stroke:#00695c,color:#000
    classDef event fill:#ede7f6,stroke:#4527a0,color:#000
    classDef horizon fill:#fff,stroke:#e53935,stroke-dasharray: 5 5,color:#e53935

    Start(("'Family wedding' — needs 2 days"))
    Start --> AppForm[Worker app: 'Request leave']:::notstarted
    AppForm --> Submit[Submit dates + reason]:::notstarted
    Submit --> Route[POST /leave-requests by-worker]:::notstarted

    H1{{Route exists supervisor-shaped today;<br/>worker-initiated path absent}}:::horizon
    Route -.-> H1

    Route --> LRRow[(LeaveRequest row<br/>state=REQUESTED<br/>workerInitiated=true)]:::table
    Route --> LREvt{{AuditEvent: LEAVE_REQUESTED}}:::event
    Route --> Queue[Routes to HR queue<br/>via QueueItem view]:::partial

    Queue --> HRApprove[Kavitha sees URGENT/STANDARD<br/>tier per closure Decision 3]:::notstarted
    HRApprove --> Decide{HR decides}
    Decide -->|"approve"| Approved[POST /leave-requests/:id/approve]:::built
    Decide -->|"reject"| Rejected[POST /leave-requests/:id/reject]:::built

    Approved --> ApprovedEvt{{AuditEvent: LEAVE_APPROVED}}:::event
    Approved --> NotifyApprove[Push to Suresh:<br/>'Approved for May 18-19']:::notstarted

    Rejected --> RejectedEvt{{AuditEvent: LEAVE_REJECTED}}:::event
    Rejected --> NotifyReject[Push to Suresh:<br/>'Rejected — reason: X']:::notstarted

    NotifyApprove --> End1(("Suresh sees Approved status"))
    NotifyReject --> End2(("Suresh sees rejection + reason"))
```

---

## Journey 4 — Supervisor change notification (W-1 + W-2 + W-3 + W-7)

The headline Suresh case. Closure Decision 4 mandates this; nothing exists today.

```mermaid
graph TD
    classDef built fill:#1e8e3e,stroke:#0b6624,color:#fff
    classDef notstarted fill:#e53935,stroke:#7a1715,color:#fff
    classDef table fill:#e0f2f1,stroke:#00695c,color:#000
    classDef event fill:#ede7f6,stroke:#4527a0,color:#000
    classDef horizon fill:#fff,stroke:#e53935,stroke-dasharray: 5 5,color:#e53935

    Start(("HR creates acting binding<br/>OR permanent reassignment for Suresh's site"))
    Start --> Binding[(SiteSupervisorBinding row inserted<br/>or effectiveUntil updated)]:::table
    Start --> BindEvt{{AuditEvent: BINDING_CREATED<br/>or BINDING_ENDED_SUPERSEDED_BY_PERMANENT}}:::event

    BindEvt --> Trigger[Notification emitter<br/>worker-supervisor-change]:::notstarted
    Trigger --> Notif[(Notification row<br/>audienceWorkerId=Suresh<br/>kind=supervisor_change)]:::table

    H1{{Closure Decision 4 mandates this whole branch.<br/>Zero notification emitters wired for binding lifecycle.<br/>AuditEvent kind WORKER_SUPERVISOR_CHANGE_NOTIFIED catalogued, no emitter.}}:::horizon
    Trigger -.-> H1

    Trigger --> Dispatch[Outbox dispatcher → channels]:::notstarted
    Dispatch --> Push[Push: 'Your supervisor is now Lakshmi (acting for Ravi until May 22)']:::notstarted
    Dispatch --> Banner[In-app banner on worker home]:::notstarted
    Dispatch --> SMSFallback[SMS fallback if push fails]:::notstarted

    Push --> Localised{Suresh's<br/>preferredLanguage}
    Localised -->|"hi"| HiText[Hindi text content]:::notstarted
    Localised -->|"en"| EnText[English text content]:::notstarted
    Localised -->|"te/bn/ta"| OtherLang[Other locale per Worker.preferredLanguage column]:::notstarted

    HiText --> End1(("Suresh knows who to call this week"))
    EnText --> End1
    OtherLang --> End1
```

**Note:** `Worker.preferredLanguage` column shipped in P1.5 (commit `095c766`) with `'hi'` default per closure §5.1. The column exists — the emitter doesn't.

---

## Journey 5 — Suresh is terminated (E24 / W-4 subject view)

The most consequential moment for Suresh. Closure Decision 5: in-app push + 7-day appeal + records export.

```mermaid
graph TD
    classDef built fill:#1e8e3e,stroke:#0b6624,color:#fff
    classDef partial fill:#f5b400,stroke:#8a6900,color:#000
    classDef notstarted fill:#e53935,stroke:#7a1715,color:#fff
    classDef table fill:#e0f2f1,stroke:#00695c,color:#000
    classDef event fill:#ede7f6,stroke:#4527a0,color:#000
    classDef horizon fill:#fff,stroke:#e53935,stroke-dasharray: 5 5,color:#e53935

    Start(("Ravi proposes termination via chat"))
    Start --> ChatEvt[AuditEvent: WORKER_TERMINATION_REQUESTED]:::built
    ChatEvt --> WorkerPending[(Worker.state = TERMINATION_PENDING)]:::table

    H1{{Today the chat-driven path emits an AuditEvent and<br/>transitions Worker.state to TERMINATION_PENDING.<br/>No SupervisorDecision row, no HR ack gate, no worker push.}}:::horizon
    WorkerPending -.-> H1

    ChatEvt -.->|"intended"| Dwi[Write SupervisorDecision<br/>tier=EMPLOYMENT<br/>+ originContext snapshot]:::notstarted
    Dwi --> DwiRow[(SupervisorDecision row<br/>tier=EMPLOYMENT<br/>ackRequired=true)]:::table

    DwiRow --> HRAck[Kavitha types confirmation phrase]:::notstarted
    HRAck --> AckedRow[(DWI ackedAt set)]:::table
    HRAck --> AppliedRoute[POST /decisions/:id/apply]:::notstarted
    AppliedRoute --> WorkerTerminated[(Worker.state = TERMINATED)]:::table
    AppliedRoute --> TermEvt{{AuditEvent: TERMINATION_APPLIED}}:::event

    TermEvt --> ThreeAudiencePush[3-audience push:<br/>originator + current responsible + Suresh]:::notstarted
    ThreeAudiencePush --> SureshNotif[(Notification row<br/>kind=termination_notified_to_subject)]:::table
    ThreeAudiencePush --> SureshEvt{{AuditEvent: TERMINATION_NOTIFIED_TO_SUBJECT}}:::event

    SureshNotif --> SureshScreen[Worker app: 'You've been terminated effective today']:::notstarted
    SureshScreen --> Reason[Plain-language reason shown]:::notstarted
    SureshScreen --> Appeal[Appeal button — 7 day window]:::notstarted

    H2{{Worker app + appeal form NOT_STARTED}}:::horizon
    SureshScreen -.-> H2

    Appeal --> AppealRoute[POST /termination-appeals]:::notstarted
    AppealRoute --> AppealEvt{{AuditEvent: TERMINATION_APPEAL_FILED}}:::event
    AppealEvt --> HRResolve[HR resolves appeal]:::notstarted

    SureshScreen --> RecordsExport[Records export button]:::notstarted
    RecordsExport --> ExportRoute[GET /workers/:id/records-export]:::notstarted
    ExportRoute --> PDF[(PDF: attendance + pay + complaints + leaves)]:::notstarted

    HRResolve --> End1(("Appeal upheld OR original stands"))
    PDF --> End2(("Suresh keeps employment record"))
```

**Audit verdict:** `BROKEN` design today — the worker's most consequential moment is fully offline (no app, no push, no appeal). The fix is closure Decision 5 implementation in full.

---

## Spec lineage per journey

| Journey                            | Primary spec section                                           |
| ---------------------------------- | -------------------------------------------------------------- |
| 1 — First activation               | ops-workflow-model A3+A4; state-machines worker.ts             |
| 2 — Marked absent subject view     | ops §6 C11; audit Day 3 MISSING                                |
| 3 — Worker leave init              | ops §6 E21; closure Decision 3 (SLA tiers)                     |
| 4 — Supervisor change notification | closure Decision 4 (mandatory push + banner + SMS + localised) |
| 5 — Termination subject            | closure Decision 5 (in-app + 7-day appeal + records export)    |
