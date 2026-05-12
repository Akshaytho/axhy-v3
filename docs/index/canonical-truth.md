---
Status: Active
Last validated against code: 2026-05-12
Validated branch: feat/phase-c-wave-4b-chat-completion
Validated commit: 2cd82c8
Primary owner: founder (Akshay Thota)
Replaces: nothing — first-version
---

# Canonical Truth — Axhy v3 Doc Index

This is the single index for "what docs in `axhy-v3/docs/` are authoritative right now."

Before reading any doc in this tree, check its row below. If it's not listed, it's not currently sanctioned for use as truth.

## Scope and semantics

**"Active" does not mean "fully implemented."** A doc can be Active for product direction while the backend contracts that realise it are still incomplete or in flux. Product-surface truth and backend-contract truth are different layers. The status here describes the doc's authority over future decisions — NOT the implementation state of the system it describes.

**Categories:**

| Tier                               | Meaning                                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Active**                         | Authoritative for current work. May still have contract or implementation gaps; those are flagged in the doc's own status header or in a separate locked-decisions spec. |
| **Active but contract-incomplete** | Referenced by ongoing work. Known to have named gaps that must be locked separately. Treat the core content as authoritative, the gap areas as open.                     |
| **Unaudited**                      | Has NOT been validated under doc-discipline protocol §9. Do NOT treat as authoritative until a status header has been added (Phase B work).                              |

External references (outside `axhy-v3/`) are listed in a separate section at the bottom. They are NOT authoritative for current implementation.

---

## Active

| Doc                                                    | One-line rationale                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/protocols/doc-discipline.md`                     | 19-rule meta-protocol governing how all docs in this tree are written, marked stale, and indexed. Read first before producing any doc.                                                                                                                                                                                                                |
| `docs/specs/2026-05-11-supervisor-mobile-r3-design.md` | Canonical product surface design for the supervisor app (Today / Decisions / Activity / Chat / Profile, three-layer hierarchy). Backend/data contracts still incomplete and must be locked separately. **Successor under review:** `docs/specs/2026-05-12-supervisor-mobile-r6-design.md` (Draft) — after R6 review approves, R3 flips to Superseded. |

## Active but contract-incomplete

| Doc                                                        | One-line rationale                                                                                                                                                                                  | Named open gaps                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/specs/2026-05-09-phase-c-spec-2-ai-chat-design.md`   | AI chat schema, idempotency, tool-loop contract, LivingDoc moat, cost-ceiling enforcement.                                                                                                          | Chat-as-primary-surface framing obsolete (r3 replaces it); cost-cap monthly-vs-daily coupling unresolved; tools 9-15 not implemented.                                                                                                                                                        |
| `docs/specs/2026-05-09-phase-c-assignment-design.md`       | Assignment, Visit, CalendarEntry, Attendance table shapes and state machines.                                                                                                                       | `routes/visits.ts:30,74` writes phantom `STARTED`/`ENDED` states the machine doesn't recognise; Attendance writer set incomplete.                                                                                                                                                            |
| `docs/plans/2026-05-10-phase-c-wave-4b-chat-completion.md` | Wave 4b plan; Phases 1+2+2.5 shipped and valid as historical record of those phases.                                                                                                                | Phases 3 and 4 need re-scope under the ops-first frame in r3 design.                                                                                                                                                                                                                         |
| `docs/specs/2026-05-12-decision-entity-lock.md`            | Phase D lock #1 — `DecisionWorkspaceItem` model, lifecycle, 14 resolved R6 §4 contradictions. Authoritative schema source for v3.0 launch. Active 2026-05-12 (Stage 1 of Draft → Active promotion). | Multiple deferred sub-items: mixed-tier HR digest behavior (§2.9), parallel replacement invites (§2.8), retention timing for WORKING_NOTE (§2.10), `payload.options[]` strict validation (§2.11), `resolutionMode` enum unification refactor (§2.11), AI tool surface details (§2.7, §2.11). |

## Draft (under review)

Specs landed in repo but not yet promoted to Active. Implementation should not begin from these until they flip Status to Active. Items here should flip Active or be rejected within 14 days of landing — otherwise re-evaluate the adoption decision.

| Doc                                                    | Reviewing                                                                                  | Rationale                                                                                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/specs/2026-05-12-supervisor-mobile-r6-design.md` | Awaiting evidence-grounded review (iteration trail: r3 → r4 → r5 → r6 in claude.ai/design) | When Active, supersedes R3. Catalogues 15 contradictions vs Decision entity lock; resolution is a separate planning step.                                   |
| `docs/prototypes/supervisor-mobile-r6/`                | Companion artifact to the Draft R6 spec                                                    | Frozen design prototype bundle (16 JSX/CSS/HTML/data files + README + IMPLEMENTATION_WARNING). Do not import into `apps/*`.                                 |
| `docs/specs/2026-05-12-hr-updates-spec.md`             | Awaiting external advisor + panel approval (drafted 2026-05-12 from R6 contradiction #11)  | HR Updates route surface + notification fan-out + audience model + launch policy. Companion to D.1 §2.5 + §2.9. When Active, addresses R6 §4 row #11 fully. |

## Unaudited — needs Phase B status pass

Do NOT treat as authoritative until a §9 status header is added.

### Specs

| Doc                                                                   | Suspected disposition                                                              |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `docs/specs/2026-05-09-phase-c-spec-3-wave-4a-mobile-chat.md`         | Likely supersede or partial — chat-first era                                       |
| `docs/specs/2026-05-09-phase-c-spec-4-wave-4a-pro-chat-domination.md` | Strong supersede candidate (title is from chat-first era; thesis overturned by r3) |
| `docs/specs/2026-05-09-phase-c-vision-narrative.md`                   | Needs rewrite or supersede — vignettes are chat-led                                |

### Architectural Decision Records

All 23 numbered ADRs in `docs/decisions/0001-*.md` through `docs/decisions/0023-*.md`, plus `docs/decisions/README.md` and `docs/decisions/_template.md`. Foundational decisions from the Apr 29 era. Some are likely still load-bearing (e.g. `0006-xstate-v5`, `0008-pure-function-rules`, `0010-ai-thin-boundary`, `0023-ai-model-policy`). Others may be superseded by later work. Audit one-by-one in Phase B.

### Other folders (all contents Unaudited until Phase B)

| Folder               | Notable files                           | Likely role                                                              |
| -------------------- | --------------------------------------- | ------------------------------------------------------------------------ |
| `docs/architecture/` | `README.md`                             | High-level architecture overview                                         |
| `docs/handoffs/`     | `SUPERVISOR_CONTEXT.md`                 | Handoff doc; likely stale per 2026-05-12 session-close findings          |
| `docs/invariants/`   | `multi-tenant.md`                       | Probably load-bearing; needs explicit Active confirmation                |
| `docs/journeys/`     | `README.md`                             | User-journey docs                                                        |
| `docs/master-plan/`  | `README.md`                             | Pointer to master plan in `/Users/thotaakshay/.claude/plans/` (external) |
| `docs/runbooks/`     | `README.md`, `runaway-claude-agents.md` | Operational runbooks                                                     |
| `docs/security/`     | `README.md`                             | Security overview                                                        |
| `docs/workflows/`    | `README.md`                             | Workflow patterns                                                        |

---

## In-repo historical

Audited and tagged Historical under doc-discipline protocol §9 + §13. Preserved for traceability; do not cite as current truth.

| Doc                                                         | Tagged Historical      | Note                                                                                            |
| ----------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| `docs/plans/2026-05-09-phase-c-wave-1-calendar.md`          | Phase B.1 (2026-05-12) | Wave 1 shipped + merged; no successor                                                           |
| `docs/plans/2026-05-09-phase-c-wave-2a-vertical-slice.md`   | Phase B.1 (2026-05-12) | Wave 2a shipped + merged; no successor                                                          |
| `docs/plans/2026-05-09-phase-c-wave-4a-mobile-chat-plan.md` | Phase B.1 (2026-05-12) | Replaced by `docs/plans/2026-05-09-phase-c-wave-4a-pro-plan.md` within Wave 4a era              |
| `docs/plans/2026-05-09-phase-c-wave-4a-pro-plan.md`         | Phase B.1 (2026-05-12) | Replaces `docs/plans/2026-05-09-phase-c-wave-4a-mobile-chat-plan.md`; Wave 4a-PRO shipped       |
| `docs/plans/2026-05-10-phase-c-wave-4b-phase-1-detailed.md` | Phase B.1 (2026-05-12) | Sub-plan of `docs/plans/2026-05-10-phase-c-wave-4b-chat-completion.md`; Phase 1 commits shipped |

---

## External historical references

Outside `axhy-v3/`. **NOT authoritative for current implementation.** Kept for traceability only.

| Path                                                                                 | Era                             | Why kept                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/Users/thotaakshay/eclean_workspace/REBUILD/` (whole folder)                        | Apr 27, pre-pivot               | Founder's pre-v3 design hub: `V3_DESIGN_DECISIONS.md`, `V3_RESOLUTIONS_2026-04-27.md`, `EXEC_SUMMARY_1PAGE.md`, `AI_REVIEWS/`, `01_INTERVIEWS/`, `02_PLAN/`, `_done/`. Contains the chat-first vision. Replaced by the in-repo docs above. Do not cite as current truth. |
| `/Users/thotaakshay/.claude/plans/now-i-think-it-functional-kernighan.md`            | Pre-v3 master plan (~60K words) | Foundational vision document. Specific tactical claims (tool counts, cap numbers, surface details) have been superseded by in-repo specs. Treat as background context, not contract.                                                                                     |
| `/Users/thotaakshay/.claude/projects/-Users-thotaakshay-eclean-workspace/memory/v3/` | Claude memory tree              | Claude's persistent memory for v3 work; mirrors the discipline locks. Repo is now canonical home for `feedback_doc_discipline_protocol.md`; memory copy is a pointer back to this repo.                                                                                  |

---

_Index updated by Claude under doc-discipline protocol §11. Last verified against branch `feat/phase-c-wave-4b-chat-completion` commit `adcb484` on 2026-05-12. Next refresh trigger: end of any session that touches `axhy-v3/docs/`._
