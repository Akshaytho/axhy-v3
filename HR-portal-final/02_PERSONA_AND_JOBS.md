# 02 — Persona & Jobs-to-be-Done

> Source of truth: `99_CANON_FACTS.md` §3, §4. Primary evidence: `docs/audits/2026-05-15-1yr-sim-hr-kavitha.md` (a month-by-month, one-year simulation of the HR persona).

The HR portal is designed for one real person's real year. This doc is that person, her team, and the work they actually do — so that every feature later can be checked against a job that exists, not an org chart that sounds right.

---

## 1. The primary persona — Mrs. Kavitha

|                        |                                                                        |
| ---------------------- | ---------------------------------------------------------------------- |
| **Name / age**         | Mrs. Kavitha, 41                                                       |
| **Title**              | HR + Accounts Manager, Surya Cleaning                                  |
| **Relationship**       | The owner's (Reddy's) sister-in-law — trusted, not a hired stranger    |
| **Devices**            | Office laptop (primary), phone (offline contact)                       |
| **Tools today**        | 3 Excel sheets + Tally (accounts) + Gmail + WhatsApp                   |
| **Named primary fear** | _"Will this make payroll easier?"_                                     |
| **Role in the system** | At 5,000-worker scale, **the operational center of the whole company** |

She is not a software person. She is competent, overloaded, and personally accountable. She does not want features; she wants her month to stop hurting. The single sentence that should govern every design call: _would this make Kavitha's payroll-close easier, or her queue calmer, or her absence safer?_ If not, it is probably not for her. (`...kavitha.md:18-21,271`)

---

## 2. The HR team (5 users at scale)

HR is not one person; it is a small team sharing one workload. The system has **no HR role subtypes** — they are all `role=HR` — so the _portal_, not the schema, expresses the division of labor (via pods). (`...kavitha.md:21`)

| Person      | De-facto focus                           | Why it matters to the design                                 |
| ----------- | ---------------------------------------- | ------------------------------------------------------------ |
| **Kavitha** | Lead; payroll + accounts; the hard calls | Needs cross-pod visibility and the decision-support surfaces |
| **Anita**   | Payroll                                  | Collides with Kavitha on the same rows today → pods + locks  |
| **Vikram**  | Onboarding (hiring workers/supervisors)  | High-volume membership creation; needs fast invite flow      |
| **Priya**   | Compliance                               | Needs audit-chain + termination-reason capture               |
| **Deepak**  | General queue                            | Needs the scoped queue with clear ownership                  |

The team divides work today by **informally partitioning over Gmail** ("I'll take Banjara, you take Madhapur"). The portal replaces that with **pods** — a primary owner and a backup owner per partition — so the division is explicit, visible, and collision-safe. (`...kavitha.md:89-97`; `99_CANON_FACTS.md §4`)

---

## 3. Jobs-to-be-done, by cadence

This is the spine of the feature inventory. Each job maps to one or more surfaces (cross-referenced in `05_FEATURE_INVENTORY.md`).

### Daily

- **Triage the leave-request queue** — approve/reject worker leave, pod-scoped. Today: SQL + curl. → _Scoped queue, leave decide._
- **Chase documents / KYC** — Aadhaar, PAN, bank passbook, police verification, ESI/UAN for new and pending workers; a worker can't be paid or insured without them. This is the real content of the `DOC_PENDING` state, not just "remind the supervisor." → _Worker document/KYC checklist (G2)._
- **Watch auto-events** — site suspensions, AI flags — and decide who needs telling. → _Queue + notifications + HR Updates._
- **Onboard** — create new worker and supervisor memberships as hiring happens. → _Invite member / invite worker._

### Weekly / burst

- **Absorb leave spikes** — festival weeks push 80+ requests/week, ~250 company-wide at Diwali. Today: Gmail partitioning. → _Pod-scoped queue + SLA tiers so the urgent one isn't buried._ (`...kavitha.md:89-97`)

### Monthly

- **Payroll close for ~5,000 workers.** Today: pull an Excel attendance export, reconcile against Tally, build the bank file by hand — Axhy currently _adds a reconciliation step without replacing anything_. → _Payroll-close workflow (prep, not disbursement)._ (`...kavitha.md:79-87`)

### Yearly

- **Year-end attestation** (a company-wide HR Update with ack) and an **annual payroll true-up**, still on Excel. → _HR Updates + payroll-close._ (`...kavitha.md:187-193`)

### Episodic (event-driven, the hardest)

- **Arrange supervisor coverage** when a supervisor is sick/away → _Acting-cover create/cancel/re-pick._
- **Permanently reassign** a site or a whole portfolio (e.g., a supervisor quits) → _Permanent reassign + switch-all-sites._
- **Correct a wrong binding** → _Audit-chain reconstruction._
- **Confirm a termination** — type the final ack on an EMPLOYMENT-tier decision → _Decision-support ack._
- **Confirm the bootstrap seed** on Day 1 → _Bootstrap review._

### Accounts (the second half of her title — easy to forget, half her week)

Kavitha is **HR _and accounts_**. A design that only does coordination solves half her job. These are real and recurring; some ship in v1 (document/KYC tracking, pro-rata), most are **deferred beyond v1** but **named here so they aren't silently dropped** (scoping in `05` G1–G5, `13` D9, `14`):

- **Advances / loans** — issue ₹2,000 mid-month, recover ₹500/month over four months; payroll must read the _outstanding balance_, not a one-off note. → _Advances ledger (G3)._
- **Statutory deductions** — PF, ESI, Professional Tax, TDS are mandatory line-items for a registered employer; without them the "file" is a gross estimate she re-keys into Tally. → _Statutory config (G4)._
- **Pro-rata / mid-month joiners & leavers** — at 5K scale, dozens each month; pro-rata salary from `joinedAt` / termination date is the most error-prone calc. → _Payroll-close pro-rata (G1, v1)._
- **Full-and-final settlement** — terminating a worker triggers F&F: pending salary, advance recovery, leave encashment, gratuity-if-eligible. → _F&F worksheet (G5), tied to termination._
- **Festival bonus + annual true-up** — predictable yearly runs, still on Excel today. → _deferred bonus run._
- **Attendance disputes during the run** — supervisors WhatsApp corrections _while_ she's closing payroll; she must reopen-and-correct before the bank file. → _Payroll-close dispute/reopen states (S21)._

**Honest line for the founder:** v1 makes Kavitha's _coordination_ year stop hurting and _eases_ (does not solve) her _accounts_ year. The named fear — "will this make payroll easier?" — is answered "easier, yes; finished, not yet." See `14` for why a thin reconciliation slice is pulled early.

---

## 4. Pains → needs map (the design's backbone)

Each row is a real month from the simulation. The "need" column is what the portal must provide. This table is the acceptance test for the whole portal: when it's done, none of these pains recur.

| Month | Pain (what actually happened)                                                                      | Need (what the portal provides)                                                    | Surface                        |
| ----: | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------ |
|     1 | 100-binding bootstrap seed triaged via Sequel Pro + Gmail, mid-payroll; 6 ambiguities              | A one-time review screen that shows each seeded binding with confirm/reassign/flag | Bootstrap review (`§5.3.7`)    |
|     2 | Kavitha + Anita both approve the same leave → silent state-machine race, found 2 days later        | Pod ownership + pessimistic locks so two HR users can't collide silently           | Pods + lock UI                 |
|     4 | 3-day wedding absence → urgent termination ack parked 72h                                          | Structural fallback: backup → cross-pod → owner emergency grant                    | HR-absent fallback (`§6`)      |
|     6 | 47-item Friday queue, chronological → urgent Saturday leave unseen until 9pm; worker stranded      | SLA tiers + age-escalation so urgent floats up                                     | SLA queue (`§5.3.3`)           |
|     7 | Termination = a bare row + typed phrase, no context → deferred 4 days (then 4 months)              | Decision-support travels with the decision (origin context, worker history, words) | EMPLOYMENT-tier ack (`§5.3.9`) |
|     8 | 8 bindings created then rolled back, 8 more created → confusing pushes, no apology channel         | Cancel-and-repick prompts for an affected-supervisor notification                  | Acting-cover (`§5.3.4`)        |
|     9 | Multi-direction permanent rebalance under concurrent action → unreadable audit chain               | Search-and-timeline reconstruction of who-was-responsible-when                     | Audit-chain (`§5.3.8`)         |
|    11 | Quitting supervisor's portfolio liquidated by hand (8 binding rows + Membership INACTIVE) via curl | One atomic "reassign all N sites" + the final ack with context                     | Switch-all-sites + ack         |

(`...kavitha.md:59-185`)

---

## 5. The cross-persona stakes

Kavitha's saturation is not contained to HR — it radiates:

- **Workers lose wages** when an absent worker can't be marked or a leave is missed.
- **Supervisors fly blind** — they can't see how deep the HR queue is, so an unexplained 4-month termination wait looks like neglect.
- **The owner sees nothing** — high-stakes events reach Reddy only through Kavitha's WhatsApp discretion.

So the HR portal is not an HR convenience; it is the **load-bearing center** whose health determines whether the worker and supervisor surfaces actually deliver. (`docs/audits/2026-05-15-1yr-sim-system-combined.md:220-229`)

---

## 6. Anti-persona (who this is _not_ for)

To keep scope honest:

- **Not the owner.** Reddy is hands-off; he gets digests and holds bank/emergency authority. His portal is a separate project.
- **Not the worker or supervisor.** They have their own apps; HR sees the _other side_ of their leave/coverage/termination seams.
- **Not an Axhy-team SuperAdmin.** Cross-tenant observability and tenant bootstrap are SUPER_ADMIN, a later project.
- **Not a payroll clerk in a payment system.** HR prepares the disbursement; the payment engine is deferred. The fear is acknowledged, not yet solved.

(`99_CANON_FACTS.md §0, §2, §6.10`)
