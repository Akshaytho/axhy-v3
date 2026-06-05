# 15 — Ownership Model Decision: Site-Anchored (supersedes Pods)

**Status:** DECISION (founder, 2026-06-04) · **Supersedes:** the HR Pod model in `docs/specs/2026-05-15-workflow-design-closure.md` §4 and every pod reference in this doc set. · **Authority:** this doc + `99_CANON_FACTS.md` win over any older pod text.

> This is a constitutional-level change made deliberately in a founder session. It overrides the closure spec's pod decision. The closure spec is **stale on HR ownership** from this date; treat its §4 (pods) as historical.

---

## 1. The decision

**HR ownership is SITE-ANCHORED, not pod-anchored.** An HR person owns a set of **sites** (a territory). Everything at those sites — the workers assigned there, the supervisors bound there, and the work they generate (leave, complaints, terminations, document/KYC, coverage) — routes to that HR person's queue.

There is **no `HRPod` abstraction.** `HRPod` and `Membership.podId` are **dropped** (they exist in schema today with zero business logic — removing them now is nearly free).

## 2. Why (three independent confirmations)

1. **Design panel (6 lenses + devil's advocate), 2026-06-04:** site-anchored won every lens — code complexity 9 vs 3, scaling 9 vs 4, ops/3am 9 vs 3, customer mental-model 9 vs 3, extensibility 8 vs 5. The devil's advocate, after steelmanning pods, concluded _"site-still-wins."_
2. **The code already agrees.** The worker/supervisor audit (`AUDIT-worker-supervisor/05_VERDICT.md`) verified that the **site-anchored substrate already exists and works in production**: `SiteSupervisorBinding`, `effective-responsibility.ts` (derive-primary-site, acting-beats-permanent, point-in-time), and `same-day-freeze.ts`. The supervisor decision plane is 100% site-anchored end-to-end. Pods are only a half-built read-gate (`Membership.podId` in `getMyPodIds`) that **already caused a bug** (`leave-requests.ts:168`, the `workerId`-as-`User.id` silent-null).
3. **Founder philosophy:** convert complex/real-time logic into daily-batch + a manual escape hatch. Pods' `auto-rebalance on >30% cross-pod split` is exactly the fragile real-time logic to avoid. Site-anchored is the simple model.

## 3. The model (concretely)

- **Ownership object:** a nullable **`ownerHrUserId`** (+ optional **`backupHrUserId`**) column on **`Site`** — each site has exactly one owning HR. (Graduate to a thin `HrSiteOwnership` binding table, shaped like `SiteSupervisorBinding`, only if/when time-bounded "acting HR coverage" is needed.)
- **A worker's HR** = the HR owning the worker's **primary site**. Primary site is **deterministic and frozen daily**: snapshot `Worker.primarySiteId` nightly (most-contracted-hours; tie → lowest `siteId`), reusing the existing `effective-responsibility.ts` derivation. Routing uses the snapshot, not a live recompute.
- **A decision routes by its SUBJECT's site:** a leave/termination goes to the HR of the _worker's_ primary site; coverage routes by the _site_. (Actor vs subject can differ — a supervisor decides, the subject's HR owns the queue row. This is already how `leave-requests.ts:242-258` works.)
- **The HR queue = a filtered query:** `unresolved rows (leave / complaint / decision / doc-pending / coverage) WHERE site ∈ my owned sites`, computed on page load over the existing `@@index([siteId, ...])`. **No `QueueItem` table. No projection. No escalation cron.**
- **Ownership changes take effect next tenant-midnight** — reuse `same-day-freeze.ts`. Default is "effective tomorrow."
- **"Locks" = a soft optimistic claim:** a `claimedBy/claimedAt` column, expired _on read_ (`claimedAt > now() - 10min`), reusing the proven first-writer-wins `updateMany`. **No pessimistic 15-min locks, no force-unlock subsystem.** A dead claim is simply stealable.
- **Escalation = a daily filtered query** ("unresolved AND older-than-3d AND owner unavailable → notify backup"), not a cron subsystem.
- **Urgent immediate-effect = the founder's notification + manual escape hatch** (the supervisor "reload context 0/3" pattern), not real-time propagation.

## 4. The 3 small rules that make it bulletproof (the entire cost)

1. **Deterministic, daily-frozen primary site** — snapshot `Worker.primarySiteId` nightly; show the routing in plain text on each queue row ("routed to you — Ravi's main site this month is Madhapur Tower") + one-tap reassign.
2. **Snapshot the owner onto open matters at creation** — add `routedSiteId` to `LeaveRequest`/`Complaint`/termination decisions, set at create, so a worker moving sites mid-case doesn't yank the case to a new HR. _(Pods have this same bug unless they snapshot — so it's not a site-only cost.)_
3. **One nullable `hrTerritoryId`/per-worker HR override** — covers the only two cases pods were nicer at: a **giant single site bigger than one HR** (override a handful of workers, or split the site row) and **deliberate HR load-balancing** ("move 200 workers from HR-A to HR-B" = a next-day batch override).

## 5. What this deletes from the build (the simplification win)

Gone, with no real loss at ~5K-worker / ~5-HR scale: **HRPod CRUD, pod-assignment logic, the >30% auto-rebalance, the pod-migration script + 30-day transition, the QueueItem projection table, the age-escalation cron, and the pessimistic-lock + force-unlock subsystem.** A large chunk of closure-spec machinery — deleted.

## 6. Role clarification (founder, 2026-06-04)

| Product term      | Code role     | Who                                                                                                                                                                                                                                                  |
| ----------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Super Admin**   | `SUPER_ADMIN` | **The founder / Axhy team.** Internal, cross-tenant, system console. Not a customer.                                                                                                                                                                 |
| **Owner / Admin** | `OWNER`       | **One persona, one portal.** The client company's owner. "Admin" and "Owner" are the same person — never two portals. (Docs sometimes write "COMPANY_ADMIN" — that is just the doc-name for `OWNER`; the code enum has no separate `COMPANY_ADMIN`.) |
| **HR**            | `HR`          | HR (+ accounts).                                                                                                                                                                                                                                     |
| **Supervisor**    | `SUPERVISOR`  | mobile.                                                                                                                                                                                                                                              |
| **Worker**        | `WORKER`      | mobile.                                                                                                                                                                                                                                              |

Hiring chain unchanged: **SUPER_ADMIN (you) → Owner → HR → Supervisor + Worker.** Roadmap after HR: **one Owner/Admin portal**, then **your internal SuperAdmin console** — not "Admin then Owner."

## 7. What's superseded in this doc set

Wherever these docs still say "pod," read it as the site-anchored equivalent per this doc:

- `99_CANON_FACTS.md` §4/§5 — rewritten to site-anchored (done in this pass).
- `05_FEATURE_INVENTORY.md` C1 "Pod home" → **Territory home**; C2 queue = filtered query; C4 lock → soft claim.
- `06_INFORMATION_ARCHITECTURE.md` "Pod home" landing → **Territory home** (my sites at a glance).
- `07_SCREENS_SPEC.md` S1 Pod home → Territory home; S2a pessimistic lock → soft claim.
- `08_DATA_MODEL.md` `HRPod`/`Membership.podId` → `Site.ownerHrUserId` (+ `backupHrUserId`), `Worker.primarySiteId`, `routedSiteId` on open matters.
- `10_API_CONTRACTS.md` `/hr-pods*` and `/hr-queue` lock endpoints → territory-ownership + filtered-query queue + soft-claim endpoints.
- `12_OPEN_QUESTIONS_AND_FOUNDER_PICKS.md` F-P-1 (pod size) → **resolved/void** (no pods); F-P-8 fallback simplified to backup-HR + owner-reassign.
- `14_BUILD_ORDER_AND_ACCEPTANCE.md` Wave-0 "HRPod CRUD / pod migration / QueueItem / lock subsystem" → deleted; replaced by the `Site.ownerHrUserId` column + filtered query + soft claim.

## 8. Audit-verified foundation this sits on (from `AUDIT-worker-supervisor/`)

Confirmed present and working in code: `SiteSupervisorBinding` + `effective-responsibility.ts` + `same-day-freeze.ts` + `handoff-package-*` + outbox/dispatcher/notifications + `audit-event.ts` + tenant-scoping + the daily-living-doc + `reload-context-counter.ts` pattern. **The HR site-anchored model reuses these — it invents nothing new.** Open fix the HR build must fold in (per the audit): centralize the `Worker.id` ↔ `User.id` contract (HR leave/anonymize/payroll key on `Worker.id`).
