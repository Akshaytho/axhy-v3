# 03 — Derivation Method (how HR screens were derived)

> Source of truth: `99_CANON_FACTS.md` §14. This doc makes the _method_ explicit so (a) you can trust the HR screens weren't invented, and (b) the same method produces the Admin and SuperAdmin portals next with zero re-learning.

This is the house method that produced the worker and supervisor surfaces. Applied to HR, it is the bridge between "Kavitha's year" and "a screen with states."

---

## 1. The derivation chain

```
persona  →  need  →  feature  →  screen  →  screen-states
```

- **persona → need** comes from the lived simulation, not a feature wishlist. Every need in `02_PERSONA_AND_JOBS.md §4` is a real month. (`docs/audits/2026-05-15-1yr-sim-hr-kavitha.md`)
- **need → feature** is the closure spec's job: it froze the HR model (pods, SLA queue, fallback, decision-support, handoff) after the simulation surfaced the needs. (`docs/specs/2026-05-15-workflow-design-closure.md`)
- **feature → screen** is this doc set's job (`06`/`07`): map each of the 11 surfaces to concrete admin-web routes.
- **screen → states** is the discipline that separates a real design from a mockup (see §4).

**The load-bearing rule (inherited from worker):** _the client reads server state; it never simulates it._ A button's legality (can I approve? is this locked? is the company suspended?) comes from a server-provided `canX` boolean in the response, not from the browser re-deriving it. The HR portal renders truth; it does not compute truth. (`docs/personas/worker/WORKER_MVP_SPRINT_PLAN.md:95`)

---

## 2. The source-hierarchy (whose word wins)

When two sources disagree, authority is resolved top-down. This is the same tier table that governed worker/supervisor. (`WORKER_MVP_SPRINT_PLAN.md:60-69`)

| Tier | Source                                   | Role                                                                |
| ---: | ---------------------------------------- | ------------------------------------------------------------------- |
|    1 | Locked docs (`docs/locked/*`), ADRs      | Constitutional — overrides everything                               |
|    2 | Live state machines + Prisma schema      | Existing architecture — design must not contradict it               |
|    3 | Closure spec + canonical product framing | The frozen HR product design                                        |
|    4 | Persona sim + HR specs/plans             | Reference for _what HR does_, not implementation truth              |
|    5 | This doc set                             | Generated; lowest authority among the above                         |
|    — | Founder, this session                    | New decisions (e.g., discard the old UI) override stale lower tiers |

`99_CANON_FACTS.md` is the precipitate of running this resolution over every source. Where a fact appears there, it has already won its tier fight (e.g., salary-on-Membership beat the stale payment memo because the live schema (tier 2) + ADR-0025 (tier 1) outrank an older note).

---

## 3. The three-layer information hierarchy (per screen)

Every HR screen is laid out in the supervisor R3 pattern. This is what keeps a dense operational tool scannable. (`docs/specs/2026-05-11-supervisor-mobile-r3-design.md:24-31`)

- **SCAN** — the main surface answers "what matters in 3 seconds": counts, breaches, the one thing that needs me now. Badges, not paragraphs.
- **ACT** — the next screen has _one purpose, one primary action_: approve this leave; confirm this binding; ack this termination.
- **INSPECT** — detail/metadata/proof is _hidden by default_, one tap away: the audit trail, the origin context, the full worker history.

For HR specifically: the **pod home** is SCAN, the **queue item** is ACT, and the **audit-chain/decision-support panels** are INSPECT.

---

## 4. States per screen (the non-negotiable checklist)

A screen is not designed until every state is named and given a treatment. The worker canon found that designs routinely ship the "happy" state and forget the rest, so the states are enumerated explicitly. For the HR portal, every screen in `07_SCREENS_SPEC.md` must cover this set (omit only with a stated reason):

| State                   | When                                            | HR-portal treatment                                                                                  |
| ----------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **loading**             | data in flight                                  | skeleton rows / spinner                                                                              |
| **empty**               | no rows (e.g., empty pod, no pending leave)     | plain empty copy + what to do next                                                                   |
| **error**               | request failed                                  | inline error + retry                                                                                 |
| **success / populated** | the normal case                                 | the SCAN/ACT/INSPECT layout                                                                          |
| **forbidden**           | wrong role / out-of-pod                         | closed-by-default redirect to `/forbidden` (never leak existence — return 404 for out-of-pod detail) |
| **locked**              | another HR user holds the row lock              | "locked by [user], auto-release [time]" + wait / request-unlock                                      |
| **company-suspended**   | `Company.status != ACTIVE`                      | writes blocked with a clear banner; reads still allowed                                              |
| **stale / superseded**  | the row changed under you (e.g., binding ended) | refuse the action + explain, don't silently overwrite                                                |

The **locked** and **company-suspended** states are HR-specific additions the worker app didn't need; they fall straight out of the pod-lock model and INV 2. Two of these are distinct and must both be proven where both apply: **`forbidden`** (wrong _role_ → redirect to `/forbidden`) and the **out-of-pod existence cloak** (right role, wrong _pod_ → return `404`, never `403`, so HR can't probe which workers exist in another pod).

**Gate rule:** the acceptance matrix in `07_SCREENS_SPEC.md` must contain **one row per screen ID**; a screen with no row is non-compliant by definition, and a cell may be `—` only with a stated reason. This is what makes "every screen names every state" auditable rather than aspirational.

---

## 5. Operations Reality Review (the stress test before a feature is "done")

Before a feature is accepted, it is run through five lenses — the same review that caught the supervisor-sick gap late in supervisor design. (`docs/specs/2026-05-14-supervisor-responsibility-model.md:13`)

1. **Persona-stress-test** — walk Kavitha's worst month through it. (Does the SLA queue actually float the 9pm medical leave?)
2. **Exception-first** — design the failure path before the happy path. (What happens when two HR users open the same row?)
3. **Ownership model** — who is responsible, and is attribution immutable? (Origin vs. current-responsible.)
4. **Time-window** — what does the same-day freeze / SLA / lock TTL do here?
5. **Control-plane** — is HR the right authority, or does this belong to owner/supervisor? (Bank changes → owner. Leave → HR.)

`05_FEATURE_INVENTORY.md` records the result of this review per feature as its "why / depth / risk" block.

---

## 6. "No build without the full case"

Per founder standing rule, no feature enters the inventory without a complete case: **why, how, depth, profit, risk, and a real-life narrative.** A feature that can't produce a Kavitha scenario isn't ready. This is why `05_FEATURE_INVENTORY.md` carries a scenario for every capability — the scenario _is_ the justification. (memory `feedback_no_build_without_full_case`)

---

## 7. Default-deny scope ("Do Not Build")

Symmetrically, anything **not** traceable to a need in `02` and a surface in the closure spec is excluded by default and recorded in `13_DO_NOT_BUILD.md` with its reason. Scope grows only by adding a cited need, never by "this would be nice." (`docs/personas/worker/DO_NOT_BUILD_MVP.md:4`)

---

## 8. UX house style (admin-web)

Inherited conventions the fresh HR UI follows (`99_CANON_FACTS.md §14`; brain `ad3bc8b9`, `ad464e5f`):

- **Visual-first, minimal text.** Badges and counts over sentences. No state-machine jargon in the UI (a worker is "on leave," not `ON_LEAVE`).
- **Design for scanning.** Dense but legible; the eye finds the breach first.
- **The human decides.** Show 2-3 options; the AI does not propose a "smart pick." HR picks the cover, HR types the ack.
- **One primary action per ACT screen.** Secondary actions are demoted or hidden.
- **Stack:** Next.js 15 App Router, Tailwind 4 + `@axhy/ui-tokens` + `@axhy/ui-web`, server components for reads, server actions for writes, httpOnly-cookie JWT, closed-by-default role gating. (Details in `11_ARCHITECTURE.md`.)

---

## 9. Why this method, restated

The worker and supervisor surfaces are trusted because they were derived this way: lived need → frozen design → screen → every state → stress test → cut list. The HR portal earns the same trust by following the same path. And because the method is explicit here, the **Admin** and **SuperAdmin** portals (next) **reuse the _method_ verbatim** — the _content_ still needs each persona's own simulation (the owner sim `owner-reddy` exists; a SUPER_ADMIN sim does not yet, `12 §D`). The method transfers; the persona truth must be earned per role.
