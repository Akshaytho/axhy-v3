# 01 — Vision & Why

> Source of truth: `99_CANON_FACTS.md` §1, §3, §6, §11. Read that for citations.

## The one-line thesis

**The HR control plane is data-complete and surface-empty.** The database rows, state machines, and backend contracts that HR needs mostly exist. What does not exist is the place where a real HR person does HR work. The HR portal builds that place. (`docs/audits/2026-05-15-1yr-sim-hr-kavitha.md:273`)

## What the HR portal is

The HR portal is the **admin-web home for the people who keep the workforce running** — hiring, leave, supervisor coverage, terminations, payroll preparation, and the company-wide rules and updates that flow down to supervisors. In Axhy's hierarchy it is the **middle layer of authority and the highest-volume one**: HR creates supervisors and workers, approves their leave, manages who covers which site, and confirms the hard employment decisions. Owners sit above it and rarely act; supervisors sit below it and run the daily floor.

It is **not** a generic HR-information-system clone. It is the operational coordination surface that turns today's spreadsheet-and-curl reality into a system that holds the constraints for HR the way the supervisor app holds them for supervisors. The same governing rule applies: **add intelligence before adding surfaces** — show what matters, project the consequence, let HR act fast.

## Who it's for

**Mrs. Kavitha**, 41 — HR + accounts manager at a ~5,000-worker cleaning company, the owner's sister-in-law. She runs the company today on three Excel sheets, Tally, Gmail, and WhatsApp. Her named primary fear is the only one that matters to her: **"Will this make payroll easier?"** Around her sits a five-person HR team — payroll, onboarding, compliance, and a general queue. At scale, **Kavitha is the operational center of the whole system.** (`...kavitha.md:18-21,271`)

The portal is designed for _her_ day, not for an org chart. Every screen answers a question she actually asks: who needs covering, whose leave is waiting, which termination is sitting too long, what did my teammate already touch, is this month's payroll going to reconcile.

## Why now

Three forces converge:

1. **Worker and supervisor are nearly done.** Their cross-role seams — leave approval, supervisor coverage, terminations, HR updates — all terminate in an HR surface that does not yet exist. Finishing those personas exposes the HR-shaped hole. (`99_CANON_FACTS.md §14`; supervisor digest §6)
2. **The _model_ is frozen; the surfaces and several backend drivers are not.** The workflow-design closure spec froze the HR model — pods, SLA queue, fallback chain, decision-support, handoff packages — after a year-long persona simulation. We are not inventing that model; we are rendering it. But "rendering" still has real open work: ~20 backend endpoints to build, the termination ack-driver to wire, the QueueItem and api-client forks to settle, and the accounts half of HR (payroll/statutory/advances) to scope. The honest forks are tracked in `12_OPEN_QUESTIONS_AND_FOUNDER_PICKS.md`. (`docs/specs/2026-05-15-workflow-design-closure.md`)
3. **Today HR runs through the founder.** Every HR action — posting an update, approving leave, acking a termination, creating a binding — currently routes through Akshay via curl or direct DB access. The portal removes the founder from the HR critical path. (`...kavitha.md:71,174`)

## The shape of the problem (what makes HR hard here)

The HR sim surfaced failure modes that a naive CRUD admin panel would walk straight into. The portal is shaped by them:

- **Multiple HR people, one queue, no coordination.** Two HR users approving the same row produces a silent state-machine race. → **Pods** partition ownership; **locks** prevent collisions. (`...kavitha.md:89-97`)
- **HR goes on leave and work stops.** A 3-day absence parks an urgent termination for 72 hours. → A **structural fallback chain** (backup → cross-pod → owner emergency grant), not heroics. (`...kavitha.md:99-107`)
- **A flat chronological queue buries the urgent thing.** A Friday medical-leave request unseen until 9pm strands a worker on Saturday. → **SLA tiers + age-escalation**, not first-in-first-out. (`...kavitha.md:119-127`)
- **Hard decisions arrive without context.** A termination is just a row and a typed phrase; HR defers it for months. → **Decision-support** travels with the decision (origin context, worker history, the supervisor's words). (`...kavitha.md:129-137`)
- **Corrections leave no readable trail.** Rolling back eight bindings and re-creating eight more produces confusing pushes and an unreadable audit chain. → **Audit-chain reconstruction** + a **notification text on cancel-and-repick**. (`...kavitha.md:139-157`)
- **Payroll is the fear, and Axhy currently makes it worse.** Kavitha is HR **and accounts**; today Axhy adds a reconciliation step without replacing the spreadsheet. → A **payroll-close workflow** that prepares the **attendance + base** summary from real data, pro-rated for mid-month joiners/leavers. **Honest scope:** v1 _eases_ the fear (the attendance reconciliation that ate her evenings is gone) but does **not solve** it — statutory deductions (PF/ESI/PT/TDS), an advances ledger, and full-and-final settlement are named and deferred (`05` G2–G5, `13` D9), so v1 _reduces_ the Tally work without replacing Tally. The payment _engine_ stays deferred entirely. (`...kavitha.md:79-87`)

## What success looks like

When the portal is done, Kavitha:

- opens **one screen** and sees her pods, her queue, and what's breaching SLA — no SQL, no Gmail partitioning;
- approves leave, arranges cover, and reassigns sites **without touching the database** or asking the founder;
- acks a termination **with the context in front of her**, not on intuition;
- reconstructs "what happened to this site" as a **readable timeline**;
- runs a month-end close that **reads from the system she already trusts** instead of a hand-built Excel reconciliation;
- and never collides silently with Anita, Vikram, Priya, or Deepak again.

The measure is not feature count. It is whether Kavitha's real year — the one simulated month by month — stops producing stranded workers, parked terminations, and unreadable audit chains. (`docs/audits/2026-05-15-1yr-sim-system-combined.md:220-229`)

## What this is explicitly not (yet)

- **Not a payment engine.** Payroll-close prepares; it does not disburse. (`99_CANON_FACTS.md §6.10`)
- **Not a tenant or owner console.** HR cannot create companies or owners; bank-account changes are an owner surface. Owner and SuperAdmin portals are the next two projects. (`§2`, `§10`)
- **Not a bulk-export tool.** The accumulated rules and history are the moat; there is no "download everything." (`§10`, INV 13)
- **Not an AI that decides.** The portal shows options and the human decides; the AI does not propose a "smart pick." (`§14`)
