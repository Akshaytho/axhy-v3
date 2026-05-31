# AXHY persona-route map — Mermaid prototype

**Snapshot:** main @ 1c4859f &middot; **Generated:** 2026-05-31
**Sources:** EVID-HR-A1-PLAYWRIGHT, EVID-OWNER-PERSONA-MAP (slice-2 branch), EVID-SUPER-ADMIN-PERSONA-MAP (slice-3 branch), backend route grep.

This is **prototype 2** of two. Same data as `../prototype-html/index.html`, rendered as a single Mermaid `flowchart LR` so GitHub previews it natively.

## How to read this

- Five **subgraphs**, one per persona. Box color = persona.
- Each **node** inside a subgraph = a route that persona calls.
- **Arrows between subgraphs** = cross-persona data flow (data created by one persona that feeds another's surface).
- Status is encoded via CSS class: green = working, red = broken/invariant-gap, amber = planned, gray = locked constitutional doc.
- Mermaid does not show route metadata (reads/writes/side-effects) — hover-detail is impossible. See the table at the bottom for those contracts.

## Legend

| Symbol | Meaning                                                        |
| ------ | -------------------------------------------------------------- |
| green  | Route exists on `main`, audited this session, behaves as spec. |
| red    | Route exists but has a known invariant violation or audit gap. |
| amber  | Route does NOT exist on `main`; called out as gap in an EVID.  |
| gray   | Constitutional / panel-locked (docs/locked/...).               |
| arrow  | Cross-persona data flow (label says via which route).          |

## The graph

```mermaid
flowchart LR
  %% ============ persona subgraphs ============

  subgraph SA[SUPER_ADMIN Akshay - platform-wide]
    direction TB
    SA1["POST /super-admin/memberships"]:::working
    SA2["GET /api/graph (admin-web)"]:::broken
    SA3["GET /super-admin/audit"]:::planned
    SA4["POST /super-admin/hard-delete/:type/:id"]:::planned
  end

  subgraph OW[OWNER founder/CEO - tenant-wide]
    direction TB
    OW1["POST /admin/memberships"]:::working
    OW2["POST /admin/sites"]:::working
    OW3["POST /admin/sites/:id/bindings"]:::working
    OW4["POST /admin/policy"]:::broken
    OW5["GET /owner/kpi"]:::planned
    OW6["GET /owner/digest/:id"]:::planned
    OW7["POST /owner/settings/bank"]:::planned
    OW8["POST /complaints/:id/resolve"]:::working
  end

  subgraph HR[HR Kavitha - pod-scoped]
    direction TB
    HR1["POST /admin/memberships (shared with OWNER)"]:::working
    HR2["POST /admin/workers"]:::working
    HR3["POST /admin/workers/:id/anonymize"]:::working
    HR4["POST /admin/sites (shared)"]:::working
    HR5["POST /admin/sites/:id/bindings (shared)"]:::working
    HR6["POST /admin/policy (shared)"]:::broken
    HR7["POST /leave-requests/:id/approve"]:::working
    HR8["POST /leave-requests/:id/reject"]:::working
    HR9["POST /complaints/:id/resolve (shared)"]:::working
  end

  subgraph SV[SUPERVISOR Lakshmi - site-bound]
    direction TB
    SV1["GET /supervisor/today"]:::working
    SV2["GET /supervisor/context"]:::working
    SV3["POST /supervisor/replacement-invites"]:::working
    SV4["POST /swap-requests"]:::working
    SV5["POST /visits/:id/transition (shared)"]:::working
    SV6["POST /chat/messages"]:::working
    SV7["POST /chat/apply"]:::working
    SV8["POST /leave-requests/:id/approve (acting)"]:::working
    SV9["POST /complaints/:id/resolve (shared)"]:::working
  end

  subgraph WK[WORKER Suresh - self-only]
    direction TB
    WK1["GET /worker/today"]:::working
    WK2["POST /worker/submit"]:::working
    WK3["POST /worker/captures"]:::working
    WK4["POST /worker/consent"]:::working
    WK5["POST /leave-requests"]:::working
    WK6["POST /swap-requests (shared)"]:::working
    WK7["POST /visits/:id/transition (shared)"]:::working
  end

  subgraph SHARED[Shared infra - all personas]
    direction TB
    SH1["POST /auth/otp/request"]:::working
    SH2["POST /auth/otp/verify"]:::working
    SH3["POST /auth/refresh"]:::working
    SH4["GET /me"]:::working
    LOCK["docs/locked/hiring-hierarchy.md"]:::locked
  end

  %% ============ cross-persona edges ============
  SA1 -- "bootstraps OWNER row for new tenant"               --> OW
  OW1 -- "OWNER hires HR (HIRING_AUTHORITY)"                 --> HR
  HR1 -. "HR hires SUPERVISOR + binds to site"               .-> SV
  HR2 -- "HR onboards WORKER; invite outbox -> OTP verify"   --> WK
  WK2 -- "submission becomes supervisor's review queue"      --> SV
  WK5 -- "worker leave-request lands in HR queue"            --> HR
  SV6 -- "AI cost (costInr) aggregates -> OWNER budget"      --> OW
  HR7 -- "HR decisions feed OWNER monthly digest"            --> OW
  SV3 -- "same-day replacement invite -> new worker"         --> WK
  OW7 -. "bank/tenant settings -> SA compliance review"      .-> SA
  WK7 -- "visit completion = billing unit (Rs8/visit)"       --> OW
  SA2 -. "SA cross-tenant write (unaudited GAP-SA-08)"       .-> HR

  %% ============ status classes ============
  classDef working fill:#dcfce7,stroke:#16a34a,color:#14532d
  classDef broken  fill:#fee2e2,stroke:#dc2626,color:#7f1d1d
  classDef planned fill:#fef3c7,stroke:#f59e0b,color:#78350f
  classDef locked  fill:#e5e7eb,stroke:#6b7280,color:#1f2937,stroke-dasharray:4 3

  %% ============ persona subgraph styling ============
  style SA fill:#fef2f2,stroke:#dc2626,stroke-width:2px
  style OW fill:#f0f9ff,stroke:#0ea5e9,stroke-width:2px
  style HR fill:#f5f3ff,stroke:#7c3aed,stroke-width:2px
  style SV fill:#fffbeb,stroke:#f59e0b,stroke-width:2px
  style WK fill:#f0fdf4,stroke:#16a34a,stroke-width:2px
  style SHARED fill:#fafafa,stroke:#a1a1aa,stroke-width:1px,stroke-dasharray:2 2
```

## Route contracts (the data Mermaid cannot show)

This table carries the reads/writes/side-effects that the diagram drops.

| route                                   | reads                             | writes                             | side-effects                                | status  |
| --------------------------------------- | --------------------------------- | ---------------------------------- | ------------------------------------------- | ------- |
| POST /super-admin/memberships           | Company                           | User, Membership, AuditLog         | AuditLog kind=MEMBERSHIP_CREATED            | working |
| POST /auth/otp/request                  | User                              | OtpAttempt                         | SMS send                                    | working |
| POST /auth/otp/verify                   | User, Membership, OtpAttempt      | RefreshToken                       | JWT issuance + isPlatformAdmin claim        | working |
| POST /auth/refresh                      | RefreshToken, User, Membership    | RefreshToken (rotation)            | F1-b family-rotation                        | working |
| GET /me                                 | User, Membership                  | -                                  | -                                           | working |
| POST /admin/memberships                 | Membership, User, Pod             | Membership, User, AuditLog         | Invite outbox                               | working |
| POST /admin/workers                     | Pod, User                         | Worker, User, AuditLog             | Worker invite outbox                        | working |
| POST /admin/workers/:id/anonymize       | Worker                            | Worker (PII redact), AuditLog      | Audit chain                                 | working |
| POST /admin/sites                       | Site (uniqueness)                 | Site, AuditLog                     | -                                           | working |
| POST /admin/sites/:id/bindings          | Site, Membership                  | SiteSupervisorBinding, AuditLog    | -                                           | working |
| POST /admin/policy                      | Policy (version chain)            | Policy (new version), AuditLog     | policy-changed outbox; SA bypass UNAUDITED  | broken  |
| POST /leave-requests                    | Worker                            | LeaveRequest                       | HR notification                             | working |
| POST /leave-requests/:id/approve        | LeaveRequest, Worker              | LeaveRequest.status, AuditLog      | Worker notification; schedule reflow        | working |
| POST /leave-requests/:id/reject         | LeaveRequest                      | LeaveRequest.status, AuditLog      | Worker notification                         | working |
| GET /worker/today                       | Visit, Site, Assignment           | -                                  | -                                           | working |
| POST /worker/submit                     | Visit, Capture                    | Visit.status, Submission, AuditLog | Verification pipeline trigger; billing unit | working |
| POST /worker/captures                   | Visit                             | Capture, S3 object                 | Photo upload                                | working |
| POST /worker/consent                    | Worker                            | WorkerConsent, AuditLog            | -                                           | working |
| GET /supervisor/today                   | Site, Visit, Worker               | -                                  | -                                           | working |
| GET /supervisor/context                 | Site, Binding                     | -                                  | -                                           | working |
| POST /supervisor/replacement-invites    | Visit                             | ReplacementInvite                  | SMS to candidate worker                     | working |
| POST /swap-requests                     | Assignment                        | SwapRequest                        | Notification                                | working |
| POST /visits/:id/transition             | Visit                             | Visit.status, AuditLog             | State machine; billing-unit increment       | working |
| POST /complaints/:id/resolve            | Complaint                         | Complaint.status, AuditLog         | Reporter notification                       | working |
| POST /chat/messages                     | Policy, LivingDoc                 | ChatMessage, AiUsage               | OpenAI call; cost tracked in costInr        | working |
| POST /chat/apply                        | ChatMessage                       | Policy / LivingDoc edit, AuditLog  | LivingDoc update                            | working |
| GET /api/graph (admin-web)              | KnowledgeGraph (raw pg, x-tenant) | -                                  | NO AuditLog (invariant violation GAP-SA-05) | broken  |
| GET /owner/kpi                          | Visit aggregates, AiUsage agg.    | -                                  | -                                           | planned |
| GET /owner/digest/:id                   | Digest                            | -                                  | WhatsApp send (via cron upstream)           | planned |
| POST /owner/settings/bank               | Company                           | Company.bankAccount, AuditLog      | 2-step OTP confirm                          | planned |
| GET /super-admin/audit                  | AuditLog (x-tenant), SAAccessLog  | SuperAdminAccessLog                | Per-tenant access audit                     | planned |
| POST /super-admin/hard-delete/:type/:id | target row                        | delete + AuditLog + SAAccessLog    | Irreversible                                | planned |
| docs/locked/hiring-hierarchy.md         | -                                 | -                                  | Drift-tested by role-gates.test.ts          | locked  |

## Summary

- **Personas:** 5
- **Routes shown:** 30 + 1 locked constitutional doc + 4 shared auth/me infra = 35 nodes
- **Cross-persona edges:** 12
- **Status mix:** 26 working, 3 broken/invariant-gap, 5 planned (gaps from EVIDs), 1 locked
