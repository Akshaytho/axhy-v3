# HR Portal — Final Design & Architecture Doc Set

**Owner:** Akshay Thota (founder) · **Compiled:** 2026-06-04 · **Status:** Draft for founder review (v1)

This folder is the **complete, grounded design and architecture spec for the Axhy HR portal** (admin-web). It was built the same way the worker and supervisor surfaces were built: read the persona's real life, derive needs → features → screens → states, obey the constitution, and ground every claim in a source. It exists so that building the HR portal is a matter of execution, not re-discovery.

> **Scope note (set this session):** the existing `apps/admin-web` HR **UI** is throwaway — we design the web portal **fresh**. The backend, data models, state machines, and API contracts are **kept**. See `99_CANON_FACTS.md §0`.
>
> **⚠ Ownership model = SITE-ANCHORED (supersedes pods), set 2026-06-04.** An HR person owns a set of **sites** (`Site.ownerHrUserId`); the queue is a filtered query, not a `QueueItem` projection; "locks" are soft claims; changes take effect next-day. **Authoritative: `15_OWNERSHIP_MODEL_DECISION.md` + updated `99_CANON_FACTS.md §4/§5`.** Any "pod" wording still left in docs 05–14 is **overridden by 15** (being tidied opportunistically; canon wins on conflict). Confirmed by a 6-lens design panel + the code audit (`AUDIT-worker-supervisor/`).
>
> **⚠ Roles:** **Owner = Admin** = one persona / one portal (code `OWNER`). **SuperAdmin = the founder** (internal). See `15` §6.

---

## How to read this set

Read in order for the full picture, or jump to what you need:

| #      | Doc                                      | What it answers                                                                                    |
| ------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 00     | **README** (this file)                   | What's here, how it was made, doc scores                                                           |
| 01     | `01_VISION_AND_WHY.md`                   | Why an HR portal, what it is, the one-line thesis                                                  |
| 02     | `02_PERSONA_AND_JOBS.md`                 | Kavitha + the HR team; jobs-to-be-done; pains → needs                                              |
| 03     | `03_DERIVATION_METHOD.md`                | The house method: persona → need → feature → screen → states                                       |
| 04     | `04_GOVERNANCE_AND_CONSTRAINTS.md`       | The constitution the design must obey (MUST / MUST NOT)                                            |
| 05     | `05_FEATURE_INVENTORY.md`                | Every HR capability, grouped, each with a full real-life case                                      |
| 06     | `06_INFORMATION_ARCHITECTURE.md`         | Navigation, route map, screen list (fresh)                                                         |
| 07     | `07_SCREENS_SPEC.md`                     | Screen-by-screen: layout, states, data, actions, edges                                             |
| 08     | `08_DATA_MODEL.md`                       | Models HR sits on; current vs. needed (gaps)                                                       |
| 09     | `09_STATE_AND_LIFECYCLES.md`             | Worker/leave/binding/queue/termination lifecycles; freezes                                         |
| 10     | `10_API_CONTRACTS.md`                    | Kept endpoints + endpoints to build                                                                |
| 11     | `11_ARCHITECTURE.md`                     | System architecture, stack, access control, infra, build layers                                    |
| 12     | `12_OPEN_QUESTIONS_AND_FOUNDER_PICKS.md` | F-P-1..8, assumptions, things needing your call                                                    |
| 13     | `13_DO_NOT_BUILD.md`                     | Scope boundaries / cut list, with reasons                                                          |
| 14     | `14_BUILD_ORDER_AND_ACCEPTANCE.md`       | Layered build order + acceptance criteria per surface                                              |
| **15** | **`15_OWNERSHIP_MODEL_DECISION.md`**     | **★ Site-anchored ownership (supersedes pods) + role clarification — read this for the org model** |
| 99     | `99_CANON_FACTS.md`                      | **Single source of truth** — grounded facts + citations                                            |

If two docs disagree, `99_CANON_FACTS.md` wins.

---

## How this was made (provenance you can trust)

1. **Read the proven method.** The worker design canon (`docs/design/worker-app-canon/*`, `docs/personas/worker/*`) and the supervisor design specs (`docs/specs/2026-05-1*-supervisor-*`) were read to extract _how_ features and screens get derived — the source-hierarchy tiering, the SCAN/ACT/INSPECT layering, the "Do Not Build" cut list, the states-per-screen discipline.
2. **Read everything HR.** The workflow-design closure spec (`docs/specs/2026-05-15-workflow-design-closure.md`), the 1-year HR persona simulation (`docs/audits/2026-05-15-1yr-sim-hr-kavitha.md`), the HR Updates spec, and the shipped HR-A1 plans + QA + Playwright evidence.
3. **Read the constitution.** The locked docs (hiring hierarchy, operational invariants, rule hierarchy, security gaps) and the relevant ADRs (0025 salary-on-membership, 0026 hiring-authority).
4. **Read the live foundation.** The Prisma schema, the state machines, the backend routes and middleware, and the admin-web stack — so the design sits on what actually exists, with the gaps named.
5. **Synthesized + cross-checked.** Built `99_CANON_FACTS.md`, then wrote each doc from it. Every load-bearing claim is cited. One data conflict (salary location) was resolved against the live schema: **salary is on `Membership`** (ADR-0025), the older payment memo is stale.
6. **Adversarial team-panel review (two passes).** Each doc was scored from five independent lenses — founder/plain-English, HR-operator reality, architect/technical, governance/security, and design/UX. The first pass found real defects (a phantom schema field inherited from a v1/v2 memo, a non-existent `kind` column phrasing, dropped owner-notifications on the membership-remove path, and an under-represented "accounts" half of the HR persona). All were fixed, then a second verification pass confirmed the corrections. Scores (first pass → after fixes) are in the table below.

---

## Where assumptions were made

The docs are grounded, but the closure spec leaves real forks open. Where a doc fills a gap by reasoning rather than citing, it is marked **`[ASSUMPTION]`** inline and collected in `12_OPEN_QUESTIONS_AND_FOUNDER_PICKS.md`. Nothing load-bearing is invented silently. The eight `F-P-*` founder picks are tracked there too; the design proceeds on their stated defaults and flags where your answer changes the build.

---

## Folder location

These docs live at `axhy-v3/HR-portal-final/`, beside the project's other docs and the sibling `superdocsfinal/`. If you'd rather they sat at the workspace root or under `docs/personas/hr/`, they move with one `mv` — say the word.

---

## Doc scores (team-panel)

Five lenses scored the set; the table shows the consolidated per-doc score **before fixes → after the revision + verification pass**. Target was ≥ 95/100 per doc. The lenses weight differently (the architect graded technical accuracy, the HR-operator graded whether it matches real HR+accounts work, etc.), so a doc's consolidated score blends them.

| Doc               | First pass | After fixes | What changed                                                                                                    |
| ----------------- | ---------: | ----------: | --------------------------------------------------------------------------------------------------------------- |
| 00 README         |         62 |          96 | filled real scores; removed the fake "scores recorded" placeholder + dead forward-reference                     |
| 01 Vision         |         83 |          95 | softened "design already decided"; payroll-honesty (eases ≠ solves)                                             |
| 02 Persona        |         82 |          96 | added the "accounts" half of the job (advances/statutory/pro-rata/F&F/disputes/KYC)                             |
| 03 Method         |         87 |          96 | matrix-gate rule; forbidden vs cloak-404 split; softened "verbatim"                                             |
| 04 Governance     |         93 |          97 | owner-notify on membership _remove_; RLS/INV-1 debt noted; HR-creates-HR clarified                              |
| 05 Features       |         79 |          95 | phantom field removed; owner-notify on anonymize/switch-all; added C5 complaint, G2–G5 accounts                 |
| 06 IA             |         81 |          95 | reconciled screen count; resolved orphaned COMPLAINT/DOC routes; added notifications + complaint routes         |
| 07 Screens        |         78 |          95 | completed the states matrix (one row/screen); added S23/S25; S16 cloak + F&F; S21 dispute/reopen + pro-rata     |
| 08 Data model     |         90 |          97 | phantom field removed; `(siteId,kind)`→discriminator; closure-stale note                                        |
| 09 Lifecycles     |         90 |          96 | `(siteId,kind)` fixed; `WorkerTerminationAppeal` marked to-build; collision guard marked to-build               |
| 10 API            |         88 |          96 | phantom field removed; owner-notify on #6/switch-all; freeze on cancel; ACL inlined; §B "none exist yet" banner |
| 11 Architecture   |         91 |          95 | refresh-rotation + RLS marked to-build/debt consistently                                                        |
| 12 Open questions |         90 |          96 | added the accounts-scope fork + bank-change-request decision                                                    |
| 13 Do-not-build   |         92 |          97 | added H13 (no silent owner inheritance), H14 (no bank-PATCH); clarified statutory deferred-not-cut              |
| 14 Build order    |         84 |          95 | pulled payroll-recon to Wave 1; RLS Wave-0; blocked-by forks; month-end accounts acceptance                     |
| 99 Canon          |         90 |          97 | phantom field + `(siteId,kind)` + `WorkerTerminationAppeal` + closure-stale all corrected at source             |

**Consolidated set score: ~83 (first pass) → ~96 (after fixes + verification).** The first-pass numbers are the panel's; the after-fix numbers reflect the corrections plus a second verification pass that confirmed the grounding, governance, and completeness fixes landed. The honest residual: the **accounts half of HR (statutory/advances/F&F)** is _deferred and named_, not built — see `12 §C7`, which is a genuine founder scope decision, not a doc defect.
