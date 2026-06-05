# 06 — Information Architecture & Navigation

> Source of truth: `99_CANON_FACTS.md` §6, §14; `05_FEATURE_INVENTORY.md`. The fresh UI replaces the discarded HR-A1 pages (`§11`) but keeps the route _namespace_ (`/hr/*`) and the closed-by-default role gate.

This doc defines the shape of the portal: the navigation model, the route map, and how every feature lands as a screen. It is the bridge from features (`05`) to screen specs (`07`).

---

## 1. Navigation model

The HR portal is a **left-sidebar admin-web app** (not a mobile tab bar — HR works on a laptop). The sidebar is the SCAN-level map of HR's world; the content area is where ACT and INSPECT happen.

```
┌────────────────────────────────────────────────────────────┐
│  Axhy · HR            [company]            Kavitha ▾  [bell] │  top bar
├──────────────┬─────────────────────────────────────────────┤
│ ▸ Pod home   │                                             │
│ ▸ Queue  (7) │      content area                           │
│ ▸ People     │      (SCAN list → ACT detail → INSPECT)     │
│ ▸ Sites      │                                             │
│ ▸ Updates    │                                             │
│ ▸ Audit      │                                             │
│ ─────────    │                                             │
│ ▸ Payroll    │                                             │
│ ▸ Settings   │                                             │
└──────────────┴─────────────────────────────────────────────┘
```

- **Landing = Pod home** (the 3-second answer). Not a generic dashboard — a pod-scoped operational summary.
- **Queue carries a live count badge** (open items in my pods) — the single most-checked number.
- **Two bands:** the top band is daily operations (Pod home, Queue, People, Sites, Updates, Audit); the lower band is periodic/admin (Payroll, Settings). This mirrors the supervisor drawer's INBOX / WORKSPACE / PERSONAL banding.
- **The bell** surfaces notifications addressed to this HR user (owner-notify echoes, fallback pings, lock-release requests).
- **Company + user menu** in the top bar; the user menu holds language, notification prefs, and sign-out.

**Why sidebar, not tabs:** HR's job is cross-cutting and reference-heavy (jump from a queue item to the worker to the audit chain). A persistent sidebar keeps all of HR's world one click away; a mobile tab bar would hide it. (`99_CANON_FACTS.md §14`; admin-web is laptop-first.)

---

## 2. Route map

All routes are under `/hr/*`, gated by `requireRole('HR')` at `app/hr/layout.tsx` (closed-by-default: no session → `/login`; wrong role → `/forbidden`). `OWNER` may also reach these (full-tenant, no pod filter) per the kept GET gating, but the _navigation_ is HR-shaped.

| Nav item    | Route                                       | Screen(s)                                          | Feature(s) |
| ----------- | ------------------------------------------- | -------------------------------------------------- | ---------- |
| Pod home    | `/hr`                                       | Pod home (landing)                                 | C1         |
| Queue       | `/hr/queue`                                 | Queue list                                         | C2, C3, C4 |
|             | `/hr/queue/[itemId]`                        | Queue item detail (routes to the right ACT screen) | C2         |
| People      | `/hr/people`                                | Members + Workers tabs                             | A3         |
|             | `/hr/people/members/new`                    | Invite member                                      | A1         |
|             | `/hr/people/workers/new`                    | Invite worker                                      | A2         |
|             | `/hr/people/workers/[workerId]`             | Worker detail (+ anonymize)                        | A3, D3     |
| Sites       | `/hr/sites`                                 | Sites list                                         | B1         |
|             | `/hr/sites/new`                             | Create site                                        | B1         |
|             | `/hr/sites/[siteId]`                        | Site detail (+ bindings)                           | B1, B2     |
|             | `/hr/sites/[siteId]/bindings/new`           | Create binding                                     | B2         |
| Coverage    | `/hr/coverage/acting/new`                   | Acting-cover wizard                                | B3         |
|             | `/hr/coverage/reassign`                     | Permanent reassign                                 | B4         |
|             | `/hr/people/supervisors/[userId]/portfolio` | Supervisor portfolio + switch-all-sites            | B5         |
| Leave       | `/hr/leave`                                 | Leave inbox                                        | D1         |
|             | `/hr/leave/[id]`                            | Leave detail (approve/reject)                      | D1         |
| Termination | `/hr/terminations/[decisionId]`             | Termination ack (decision-support)                 | D2         |
| Complaints  | `/hr/complaints/[id]`                       | Complaint detail — reply/resolve (S23)             | C5         |
| (top bar)   | `/hr/notifications`                         | Notifications bell panel (S25)                     | §3.4       |
| Updates     | `/hr/updates`                               | HR Updates composer + sent list                    | E2         |
|             | `/hr/rules`                                 | HR rules editor (Layer-2 policy)                   | E1         |
| Audit       | `/hr/audit-chain`                           | Audit-chain reconstruction                         | F2         |
| Bootstrap   | `/hr/bootstrap-review`                      | Bootstrap review (one-time)                        | F1         |
| Payroll     | `/hr/payroll-close`                         | Payroll-close (prep)                               | G1         |
| Settings    | `/hr/settings`                              | Language, notification prefs, sign-out             | —          |
| —           | `/forbidden`                                | Access-denied                                      | governance |
| —           | `/login`                                    | Phone + OTP (shared)                               | auth       |

> **IA note:** "Coverage," "Leave," "Termination," and "Bootstrap" are _work_, not standing nav — most are reached **through the Queue or a person/site**, not from a top-level menu. The sidebar shows the standing destinations; the queue is the front door for episodic work. Acting-cover and reassign also appear as actions on a supervisor's portfolio and a site's detail.

---

## 3. The Queue as the front door

Most episodic HR work does not start from the sidebar — it starts from the **Queue** or from a **person/site**. The queue item knows its kind and routes to the correct ACT screen:

```
Queue item (kind)            →  ACT screen
─────────────────────────────────────────────
LEAVE_REQUEST                →  /hr/leave/[id]                  (S15)
TERMINATION_ACK_PENDING      →  /hr/terminations/[decisionId]   (S16)
BOOTSTRAP_SEED_PENDING       →  /hr/bootstrap-review            (S19, focused row)
COVERAGE_NEEDED              →  /hr/coverage/acting/new         (S11, prefilled)
DOC_PENDING_WORKER           →  /hr/people/workers/[workerId]   (S6 — has a "resolve document" action that clears DOC_PENDING)
COMPLAINT_HR                 →  /hr/complaints/[id]             (S23 — reply + resolve)
BANK_BOUNCE / KYC_FLAG       →  /hr/people/workers/[workerId]   (S6 doc/bank panel — accounts-side lane)
```

Every queue kind resolves to a real S-numbered screen with an action that clears it (no dead-end routes; no action-less destinations).

This keeps the SCAN→ACT path short: see it in the queue, open it, do the one thing, return.

---

## 4. Screen inventory (fresh)

Twenty-five surfaces (S1–S23 + S25, including the lock state S2a; there is no S24), grouped by SCAN / ACT / INSPECT. Some screens carry their own INSPECT panel, so the layer groups overlap. Full specs in `07_SCREENS_SPEC.md`; the authoritative count and per-screen state coverage live in 07's matrix.

**SCAN (lists / summaries):**

1. Pod home (landing)
2. Queue list
3. Members list / Workers list (People, tabbed)
4. Sites list
5. HR Updates — sent list
6. Supervisor portfolio

**ACT (one purpose, one action):** 7. Invite member 8. Invite worker 9. Create site 10. Create binding (acting/permanent) 11. Acting-cover wizard (create / cancel / re-pick) 12. Permanent reassign 13. Switch-all-sites 14. Leave detail (approve/reject) 15. Termination ack (decision-support) 16. Worker detail → anonymize 17. HR Updates composer 18. HR rules editor 19. Bootstrap review 20. Payroll-close (prep)

**INSPECT (read-only depth):** 21. Audit-chain 22. Queue item detail (thin router + context) 23. Site detail (with bindings + handoff view) 24. Notifications panel (S25, top-bar bell)

**ACT (added in review):** 25. Complaint detail — reply/resolve (S23)

(Counts overlap because some screens carry their own INSPECT panel — e.g., the termination ack screen embeds the decision-support INSPECT.)

---

## 5. Cross-screen elements (present on many screens)

- **Lock banner** — appears on any ACT screen for a queue-backed row when another HR user holds the lock (C4).
- **SLA badge** — on every queue item and on the ACT screen header for queue-backed work (C3).
- **Same-day-freeze notice** — on every binding-mutating screen: "Takes effect tomorrow ([tenant-midnight]). Same-day emergencies: handle off-system." (§7)
- **Company-suspended banner** — on every write screen when `Company.status != ACTIVE`; writes disabled (INV 2).
- **Pod-scope chip** — shows which pod context the current view is in (my pod / backing up / cross-pod).
- **Owner-notify hint** — on member-create and policy-write screens: "The owner will be notified" (GAP 7).

---

## 6. What's deliberately not in the IA

- No tenant/company switcher (single ACTIVE membership; HR is one company).
- No bank-account-change screen (owner surface, 2-step OTP).
- No bulk-export / "download all" button (INV 13).
- No "smart pick" / AI-suggests-the-cover affordance (the human decides).
- No owner KPI / compliance pages (separate owner portal project).

(Reasons in `13_DO_NOT_BUILD.md`.)
