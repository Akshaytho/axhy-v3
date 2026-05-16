# F-004 — Panel review (round-4 v3 scope) — RESOLVED 2026-05-16

> **Status:** Adversarial panel pass DONE. Both material findings RESOLVED by owner picks 2026-05-16:
>
> - **Material #1 (Maya + Eric — no `schemaVersion`)** → owner picked **γ**. Closure spec §3.7 amended in the same commit chain to add `schemaVersion INT` as the canonical 9th field, locked at 1 for F-004; consumer-handling invariant added.
> - **Material #2 (Suresh Pillai — `clientPreferences` not transferred)** → owner picked **β**. F-004 stays strict (siteRules only). A new slice **F-010 — handoff v2 / client-context expansion** is queued in the feature queue for a clean first-class client-context transfer pattern. Interim guidance recorded in closure §3.7 Invariants + F-004 non-claims: supervisors record client-specific operational points as proper site rules so they transfer via mechanism Z.
>
> Owner verbatim on rejecting option γ for Material #2: "do not stuff client preferences into siteRules.ruleText — that will create semantic mess."
>
> Code-stage notes (3) carry forward into the implementation file: Telugu-complaint-body sizing test, `Promise.all` for the 4 reads, `uuid-v5` namespace constant.
>
> The original panel-pass record (below) is kept verbatim for audit traceability.

---

## Original adversarial panel pass on round-4 v3 (for audit)

Owner directive 2026-05-16: run panel pass BEFORE code starts, do not defer to F-005. Voices below frame the 1-year-horizon question (`feedback_panel_thinks_one_year_horizon.md`) AND the end-of-wave "what's in the spec that didn't ship?" adversarial question (`feedback_adversarial_panel_at_wave_end.md`). Panel voices named per `v3_panel.md` (full bios in master plan §C).

## Method

- Each voice gets ONE sharp critique line, framed at 1-year horizon and against closure spec §3.7 + Decision 8 + audit Ravi Month 9b.
- "No critique" 2+ times = performative panel; re-run sharper. (Avoided here by attacking gaps, not celebrating fit.)
- Findings labeled `[MATERIAL — surface to owner]`, `[CODE-STAGE — note for implementer]`, or `[OBSERVATION — no action]`.

## Voices

### 1. Maya Krishnan (Principal Architect, Stripe + Datadog)

> "Year-365 question: at $10M ARR with tenants on Postgres 16, does the handoffPackage shape evolve safely or are we stuck with the v1 8 fields forever?"

**Finding** `[MATERIAL — surface to owner]`: **No `schemaVersion` field in the payload.** Spec §3.7 locks 8 fields. None of them is a version tag. The package is frozen-on-write and immutable, which is correct — but when (not if) the shape evolves (Open Q5's `kind` resolution; future bucket-4 retrieval hints; new `clientPreferences` field — see Suresh Pillai below), consumers must know which shape they're reading. Without a version field, every consumer must do field-presence sniffing forever.

**Tension:** adding `schemaVersion: number` is an unauthorized 9th field per the round-4 v1/v2/v3 wording cleanups ("no fields added vs the spec list"). Owner has to pick:

- **(α)** Add `schemaVersion` now (small spec deviation; cheap insurance for 10-year arc).
- **(β)** Stay strict to spec; accept future field-sniffing for consumers; revisit at first shape change.
- **(γ)** Open a parallel mini-spec amendment to closure §3.7 to add `schemaVersion` to the canonical 8-field list, making it 9.

### 2. Aanya Mehta (Senior AI/ML, OpenAI + Google, Hindi/Telugu/English)

> "Year-365 question: after 5,000 voice-captured complaints, can the snapshot still carry the bodies, or does truncation strip the most operationally-useful 90-day window?"

**Finding** `[CODE-STAGE — note for implementer]`: voice-captured Telugu complaint bodies tend to be 200–800 chars each. 90 days × even 1 complaint/day = 60+ rows × ~500 chars = ~30KB of body text alone, before counting `id`/`kind`/`state`/`loggedAt`. At 100KB cap (spec §3.7 line 322), one volatile site can crowd out other fields. Truncation order is "oldest complaints first, then activeWorkers field detail" — fine, but verify at code time that the algorithm: (a) serializes JSON once to measure, (b) does NOT drop entire workers (only field detail like `recentFlags` / `recentDecisions`), (c) preserves at least the most-recent N complaints regardless of size. Note for `handoff-package-composer.ts` test plan: add a synthetic "high-complaint-volume" case.

### 3. Naina Bansal (Pricing Strategist, OpenView)

> "Year-365 question: at 1,000 tenants × occasional binding churn, does the synchronous compose-in-tx pattern hold up, or do we bottleneck on the binding-create path?"

**Finding** `[CODE-STAGE — note for implementer]`: composer does 4 reads inside the same Prisma tx (siteRules from outgoing LivingDoc; complaints 90d; active workers; openItems 14d). At 1,000-tenant scale with concurrent binding-creates during festival-overflow / rebalance morning, the tx holds longer than necessary if reads are sequential. Recommend `Promise.all` for the 4 reads within `composeHandoffPackage(tx, args)`. Caveat: ALL reads must be on the same `tx` (the outer one), which is fine — Prisma's `tx` is reentrant for read parallelism. Cost angle: zero AI cost; the cost concern is lock-hold time, not $/request. Not a scope decision; flag for code stage.

### 4. Suresh persona (supervisor, day 365)

> "Year-365 question: when I rebound the Manikonda site to Anjali 4 months ago and now look at her Today site card, am I confident she still has the lobby-mop-twice-daily rule?"

**Finding** `[OBSERVATION — no action — already in pick 8 mechanism Z]`: Mechanism Z copies outgoing's `LivingDoc.siteRules` entries into incoming's LivingDoc, so the rule IS in Anjali's live LivingDoc going forward (bucket 1). The frozen `binding.handoffPackage` is a separate snapshot (bucket 2). Both serve different purposes — F-004 covers both correctly. No gap from this voice.

### 5. Mr. Reddy persona (owner, day 365)

> "Year-365 question: I'm paying for this. Where do I see that handoffs are happening? Where does the monthly digest tell me '12 sites changed hands this month, all packages composed clean'?"

**Finding** `[OBSERVATION — explicitly deferred per F-004 non-claims]`: F-004 explicitly says owner monthly digest is downstream (closure §5.2.6 + F-007 / F-009 territory). The `HANDOFF_PACKAGE_GENERATED` audit emit is the upstream signal a future digest will consume. Not a F-004 gap.

### 6. Vikram Shah (Staff Backend, multi-tenant SaaS, Linear + Notion)

> "Year-365 question: after tenant #100, can a forged or replayed binding-create write a handoffPackage that leaks data from a sibling tenant?"

**Finding** `[OBSERVATION — no action — already in pick 7 + test list]`: pick 7 says all composer reads + writes happen inside ONE `withTenantContext` (RLS-scoped). Test list includes "cross-tenant isolation — package doesn't leak across companyId." Also: the LivingDoc copy on permanent rebind reads outgoing's LivingDoc by `(companyId, supervisorId)` — both supervisors are in the same tenant by construction of the SiteSupervisorBinding row, so no cross-tenant write path exists. Idempotency check (Open Q4 uuid-v5) also prevents replay-duplicates. No gap.

### 7. Eric Chen (Distinguished Engineer, Bell Labs + Google + DeepMind)

> "Year-10 question: which deferral compounds badly if we don't do it now, and which can wait 12 months without consequence?"

**Finding 1** `[MATERIAL — same as Maya]`: schemaVersion absence compounds if we ever change the shape. Concur with Maya — surface to owner.

**Finding 2** `[OBSERVATION — explicitly deferred, bucket-4 future slice]`: pgvector embedding of `recentComplaints[].body` text + `siteRules` text is a future-bucket-4 enhancement, NOT in F-004. Spec §3.7 doesn't require it. The current scope preserves the text verbatim, which keeps the door open. No compounding cost from deferring; the embedding slice can land at any time without F-004 rework. Confirms F-004's bucket-2 framing.

**Finding 3** `[CODE-STAGE — note for implementer]`: idempotency rule-IDs via uuid-v5 (Open Q4) need their hash inputs locked at code time. Standard practice: `uuid-v5(NAMESPACE_AXHY_HANDOVER, "${bindingId}:${outgoingRuleId}")`. NAMESPACE constant needs to exist in shared-schema; will surface during code if it doesn't.

### 8. Sara Park (Staff Product Designer, Linear + Slack + Superhuman)

> "Year-365 question: when Anjali opens the future R6 §5.2.8 'Read the handoff →' panel 4 months after the rebind, what's her felt sense of 'is this still relevant'?"

**Finding** `[OBSERVATION — for future R6 panel slice, NOT a F-004 gap]`: the panel that renders the package must show "this snapshot was captured on `<generatedAt>`; current state may have changed" — design constraint on the future consumer surface. F-004 produces the data the panel will eventually render; `generatedAt` is in the locked 8-field set, so the data is available. No F-004 change; flag for the future R6 slice scope.

### 9. Suresh Pillai (FM Operations Consultant, Sodexo + G4S, 22 yrs field)

> "Year-365 question: when Anjali walks into the building on day-1, does she know about the client side — building manager's name, what gets that manager calling 7 AM angry, the lobby-finish standard the client cares about?"

**Finding** `[MATERIAL — surface to owner]`: **`clientPreferences` not in pick 2's LivingDoc copy.** Per `living-doc.ts:88-119` the LivingDoc has 5 sections: siteRules, workerNotes, **clientPreferences**, recurringTasks, freeNotes. Closure spec §3.7 lists only `siteRules` in the package. Pick 2 follows the spec strictly. But field-ops reality is that "what the client expects / who the client contact is / what triggers the client's complaints" is at least as load-bearing for the incoming supervisor as the operational rules. The audit Ravi Month 9b pain (Anjali rediscovering "lobby-mop-twice-daily" via complaint) generalizes — she'll also rediscover "Mr. Rao calls Reddy directly when the kitchen-floor isn't waxed by 6:30 AM" the same way.

**Tension:** adding `clientPreferences` to F-004's LivingDoc copy on permanent rebind is a deviation from closure spec §3.7's listed `siteRules`-only scope. Three options for owner:

- **(α)** Add `clientPreferences` to F-004's permanent-rebind LivingDoc copy (and consider adding to the package's frozen snapshot too, alongside `siteRules`). Treat as a spec amendment.
- **(β)** Stay spec-strict for F-004; clientPreferences stays with outgoing supervisor only; queue a future "handoff v2" slice that expands to L3-equivalent client/worker context.
- **(γ)** Append client-context lines into the outgoing's `siteRules.ruleText` at write time (no schema change; clientPreferences stays at source; siteRules text grows). This is a workaround — semantic muddle but no spec deviation.

Suresh Pillai's voice favors (α). Sara Park would say (α) keeps the panel design simpler. Vikram Shah would say either (α) or (β) works as long as the boundary is explicit. Owner picks.

---

## Summary table

| #   | Voice              | Finding                                                | Type                              |
| --- | ------------------ | ------------------------------------------------------ | --------------------------------- |
| 1   | Maya Krishnan      | No `schemaVersion` field — long-term evolution risk    | **MATERIAL — surface**            |
| 2   | Aanya Mehta        | Voice-Telugu complaint body sizes vs 100KB cap         | CODE-STAGE — test note            |
| 3   | Naina Bansal       | 4 sequential reads in tx — parallelize via Promise.all | CODE-STAGE — note                 |
| 4   | Suresh (worker)    | LivingDoc copy already covers this                     | observation                       |
| 5   | Mr. Reddy (owner)  | Owner-digest deferred to F-007 / F-009                 | observation — explicitly deferred |
| 6   | Vikram Shah        | Cross-tenant isolation already covered                 | observation                       |
| 7   | Eric Chen          | schemaVersion (concur with Maya) + uuid-v5 namespace   | MATERIAL (1st) + CODE-STAGE (3rd) |
| 8   | Sara Park          | "Snapshot date" UX constraint — future R6 slice        | observation — future slice        |
| 9   | Suresh Pillai (FM) | `clientPreferences` missing from pick 2                | **MATERIAL — surface**            |

**Material findings count: 2 (schemaVersion missing; clientPreferences missing). Both require owner sign-off before code starts.**

**Code-stage notes count: 3 (Telugu complaint sizing test; Promise.all in composer; uuid-v5 namespace constant). Land in implementation, not scope.**

## Owner decision needed

Before `SCOPE: APPROVED (round 4 v3)` and code start, owner picks on the 2 material findings:

**Material #1 — schemaVersion:**

- α: Add `schemaVersion: 1` to the package (9 fields total, one-line spec deviation).
- β: Stay strict-spec (8 fields); accept future field-sniffing.
- γ: Amend closure §3.7 first, then add field (cleaner but slower).

**Material #2 — clientPreferences in pick 2:**

- α: Add `clientPreferences` to F-004's LivingDoc copy on permanent rebind (and to the frozen package alongside `siteRules`). Treat as spec amendment.
- β: Stay strict-spec; queue future "handoff v2" slice for L3-equivalent client/worker context.
- γ: Append client lines into siteRules text (workaround; no schema change; semantic muddle).

## What this pass did NOT do

- Did NOT run all 73 panel members — selected the 9 voices most relevant per `v3_panel.md` "How to invoke" map (Architecture: Maya + Eric + Vivek-by-extension; AI: Aanya; Pricing: Naina; UX: Sara + the 4 personas; Multi-tenant: Vikram; FM ops: Suresh Pillai). Other voices (security/Rohit, compliance/Vinod, mobile/Priya Nair) have nothing material to contribute to a backend-only composer slice with no PII flow change.
- Did NOT re-debate decisions already locked by owner (mechanism Z; CalendarEntry STRICT filter; Q2 = (b); base+delta+live model; pgvector 4-bucket architecture; rule 27).
- Did NOT propose a fourth round of revision based on the material findings — those are owner-decision points, not Claude-decides points.

## Decision (owner + friend)

- `PANEL: NO MATERIAL ISSUE` + acknowledge owner picks on Material #1 + #2 → `SCOPE: APPROVED (round 4 v3)` → code begins immediately on `feat/f-004-handoff-package-composer`. Stop at `AWAITING_APPROVAL` after the new test sweep is green.
- `PANEL: DEFER MATERIAL #1 / #2` → I update the scope artifact accordingly and re-surface for a final check.
- `PANEL: ADDRESS MATERIAL #1 / #2 NOW` → I revise picks 1 + 2 (or 8) and re-surface round-4 v4.
