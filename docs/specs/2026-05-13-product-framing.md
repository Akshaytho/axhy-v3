---
Status: Active
Last validated against code: 2026-05-13
Validated branch: feat/phase-c-wave-4b-chat-completion
Validated commit: c11fb68
Primary owner: founder (Akshay Thota)
Replaces: nothing — first-version
---

# Product Framing — Supervisor Operating Brain

This document captures the binding product interpretation that all v3 supervisor-app implementation work must anchor against. It exists to prevent implementation drift away from the product as it has been understood across the R3 → R6 design arc and the D.1 / HR Updates / Wave-4b chat lock-in.

This doc is **Active but contract-incomplete** (per `docs/index/canonical-truth.md`). It governs product framing across the supervisor app: downstream specs MUST align with the principles named here unless a principle is explicitly relocked by a later spec.

This framing does **not** replace the authority of downstream specs over their own domains:

- `docs/specs/2026-05-12-decision-entity-lock.md` (D.1) still owns the decision-entity contract shape, schema, lifecycle, and writers.
- `docs/specs/2026-05-12-supervisor-mobile-r6-design.md` (R6) still owns the supervisor mobile surface design (5 tabs, 2 secondary surfaces, 5 sub-screens, contradiction catalogue).
- `docs/specs/2026-05-12-hr-updates-spec.md` (HR Updates) still owns the HR route surface, notification fan-out, audience model, and HR-launch policy details.

The framing governs principles; downstream specs govern contracts. Where a principle and a contract appear to conflict, consult the contract spec first to clarify scope before assuming the framing has been violated.

## §1 Status

**Active but contract-incomplete** (per `docs/index/canonical-truth.md`). Promoted 2026-05-13 after panel review of all 20 sections.

Core principles (§§3–§18) are authoritative. §20 names deferred implementation/detail follow-ups that do NOT reopen the core principles.

Existing soft cross-references in D.1 / R6 / HR Updates (commit `d48dafb`) remain soft and informational. Tightening or rewriting those references is a separate downstream decision; this promotion does not propagate stronger language into Active specs.

## §2 Why this doc exists

The R6 design + D.1 contract lock + HR Updates spec each capture a piece of the supervisor product. None of them, on their own, names the underlying product principle that ties them together. Without that principle, implementation work tends to drift toward:

- Treating chat as the primary surface (overturned by R6) → reverts in mobile builds.
- Treating Decisions as a notification inbox → loses lifecycle semantics.
- Treating HR ack as compliance theater → degrades context-loading value.
- Treating tomorrow/week as new tabs → bloats the surface.
- Treating Claude-managed agents as truth-producers → invented facts in audit trail.

This doc names the principle and the contracts that follow from it.

## §3 The supervisor operating brain principle

The supervisor's job is **operational decision-making across today, tomorrow, and this week**, under conditions where:

- Workers are interchangeable, sites are not.
- Plans break in real time (absences, swaps, terminations, walk-offs).
- The supervisor cannot hold every constraint in working memory.
- The owner / HR cannot be in the loop for every decision.

The app's purpose is to be the **operating brain that holds the constraints, projects consequences, and lets the supervisor act on them quickly**. The minimum surface area for that brain is 5 tabs (Today / Decisions / Activity / Chat / Profile per R6). The maximum intelligence under those surfaces is what makes the product valuable.

**Add intelligence before adding surfaces.**

## §4 Three layers of truth

The supervisor product operates on three distinct layers. Conflating them is the most common source of drift.

### §4.1 Layer A — stored truth (persistent rows)

Authoritative facts about the world. Lives in Postgres.

- Domain entities: `User`, `Membership`, `Site`, `Assignment`, `Visit`, `Attendance`, `LeaveRequest`, `SwapRequest`, `DecisionWorkspaceItem`, `ReplacementInvite`, `HRUpdate`, `HRUpdateRule`, `CalendarEntry`, audit rows.
- Every write goes through a route handler. No tool writes directly to Layer A; every write is an effect of an accepted Decision or a direct supervisor action.
- Layer A is the only layer whose contents survive across sessions, devices, and supervisors.

### §4.2 Layer B — computed proposed plan (no storage)

Read-time projection. Never persisted.

- Inputs: Layer A rows + AssignmentConfig defaults + recurrence rules + open Decisions.
- Outputs: a typed representation of what tomorrow / this week looks like if no further changes are made.
- **No tables.** There is no `WeeklyPlan`, `TomorrowPlan`, `ProposedAssignment`, or equivalent. Forbidden.
- Caching Layer B reads (in-memory, Redis, etc.) is allowed for perf. **Treating the cache as truth is not.** Every Layer A write must invalidate the relevant cache key.
- Layer B is consumed by UI preview blocks, chat answers ("what does Thursday look like?"), and `propose_*` tools that need to project consequences.

### §4.3 Layer C — daily supervisor-day context (scratch, TTL'd)

Per-supervisor working scratch. Volatile.

- Inputs: decisions opened today, HR rules acked today, recent chat turns, recent tool outputs, recent overrides.
- Storage shape: in-memory or short-lived cache, scoped by `(companyId, supervisorId, localDate)`. Persistence beyond the day boundary is forbidden except as audit log in Layer A.
- TTL: resets on new local-day boundary (per supervisor's TZ), on explicit `clear_context` tool, or after N minutes of inactivity (initial N = 30; tunable).
- Layer C is the AI's working memory for the current session — what the supervisor has loaded today.

## §5 AI memory model

The AI does not have free-form long-term memory. It composes its understanding from the three layers:

- **Permanent truth** — Layer A rows, re-read at turn start where relevant.
- **Temporary supervisor-day context** — Layer C, patched after each tool call.
- **Computed proposed plan** — Layer B, requested on demand.
- **Inter-turn visibility** — When a tool call writes to Layer A (via accept), the next AI turn (a) re-reads the affected rows from Layer A and (b) patches Layer C with a delta event ("decision X accepted at HH:MM, replacement Y invited").
- **Reset / eviction** — Layer C entries past TTL are dropped silently. New day = fresh Layer C. Layer A audit rows preserve what happened.

What this is **not**:

- Not first-chat magic memory ("the AI remembered everything from January").
- Not vector RAG over chat history.
- Not infinite session context.
- Not a long-running supervisor profile that learns preferences across months (deferred indefinitely; revisit only if real product need emerges).

## §6 Consequence-awareness mechanism

Every `propose_*` AI tool MUST emit a `consequences[]` field. Tools that do not are not allowed to surface to the supervisor.

```ts
type ToolConsequence = {
  kind: 'WORKER_AFFECTED' | 'SITE_AFFECTED' | 'COST_DELTA' | 'COMPLIANCE_FLAG' | 'CASCADE_DECISION';
  summary: string; // human-readable, one line
  refs: { entity: string; id: string }[]; // every claim cites a Layer A row
  severity: 'info' | 'warn' | 'block';
};

type ToolOutput<T> = {
  proposal: T;
  consequences: ToolConsequence[];
  layer: 'B'; // proposals are always Layer B
};
```

The supervisor sees consequences inline on the DecisionCard before accepting. Acceptance is the moment Layer B → Layer A. Until then, the proposal does not exist as truth.

**Implementation gate:** CI lint rejects any tool whose name starts with `propose_` and which does not declare a `consequences` field on its return type.

## §7 Daily AI context shape

Concrete sketch of Layer C as the AI sees it on each turn:

```ts
type SupervisorDayContext = {
  companyId: string;
  supervisorId: string; // User.id (per supervisor_id_is_user_id lock)
  localDate: string; // YYYY-MM-DD in supervisor TZ
  loadedAt: number; // epoch ms
  ttlMs: number; // default 30 * 60 * 1000

  recentDecisions: {
    // patched as decisions move state
    id: string;
    state: 'PROPOSED' | 'APPLIED' | 'FAILED' | 'DISMISSED' | 'EXPIRED' | 'UNDONE';
    kind: string;
    movedAt: number;
  }[];

  ackedRulesToday: {
    // patched on HR rule ack
    ruleId: string;
    hrUpdateId: string;
    ackedAt: number;
  }[];

  recentToolOutputs: {
    // last K tool calls, lightweight
    toolName: string;
    summary: string;
    refs: { entity: string; id: string }[];
    at: number;
  }[];

  recentOverrides: {
    // supervisor manually overrode a default
    kind: string;
    appliedAt: number;
    reason?: string;
  }[];
};
```

Layer C is composed at turn start: re-fetch acks-today and decisions-today from Layer A, merge with in-memory recents. If the in-memory store is gone (server restart), Layer C is rebuilt from Layer A queries on `localDate`.

## §8 Agent invocation budget and triggers

Claude-managed agents (the AI loop inside chat + any background Decision-summarisation agents) operate under explicit triggers and budgets.

**Triggers (per supervisor, per day):**

- Supervisor sends a chat turn — 1 agent invocation.
- A Decision moves state via supervisor action — 0 background invocations by default; chat may surface a summary on next turn.
- HR Updates digest published — 0 agent invocations; ack is supervisor-driven.
- Time-based summary / morning brief — 1 invocation per supervisor per day, max.
- Webhook from OpenAI / Anthropic / third-party — never; agents are pulled, not pushed.

**Budget (initial; revisit at Wave 4c per `project_wave_4b_advisory_review`):**

- Hard cap: 50 agent invocations per supervisor per local day.
- Soft warn: 30.
- Per-tool retries: max 2.
- Idempotency: every agent invocation carries an idempotency key (`(supervisorId, traceId, turnId)`); duplicate keys return the prior result.

**Scope:**

- An "agent invocation" is one model call from the chat loop OR one background-summarisation call. Tool calls within a single agent loop are not separate invocations.
- Cost-per-invocation is observed via the cost-cap ledger; framing does not duplicate that contract.

## §9 Tenant boundary on Layer C

Layer C is volatile, but tenant isolation still applies.

- Layer C entries are keyed by `(companyId, supervisorId, localDate)`. Cross-tenant reads return empty; there is no "global" Layer C.
- Layer C is never serialised across tenants, never logged to a shared store without companyId scoping, never included in cross-tenant analytics.
- If Layer C is implemented in Redis or similar, key prefix MUST include `companyId` and the access wrapper MUST enforce it. This is identical to the Layer A multi-tenant invariant captured in `docs/invariants/multi-tenant.md` (which itself needs Phase B audit, but the rule is load-bearing).
- Persistence past the day boundary is forbidden. Only the audit row in Layer A persists.

## §10 Agent grounding rule

AI agents never invent facts.

- Every factual claim in an AI response cites a Layer A row, OR is explicitly marked as a proposal (Layer B).
- Tool outputs that summarise data MUST include the `refs[]` array used to compose the summary.
- Speculative or hypothetical text ("if you swap Rajesh for Suresh") MUST be wrapped in proposal framing and surfaced through a `propose_*` tool, not free text.
- Hallucinated worker names, fabricated site IDs, invented past decisions = release blockers; CI gates and panel review must catch them.

This rule is foundational. Implementations that allow free-text chat without grounding produce audit failures that erode supervisor trust permanently.

## §11 Today / Tomorrow / Week as capabilities (NOT surfaces)

The product supports planning across today, tomorrow, and this week. This is a **capability requirement**, not a surface requirement.

- **Today** = Layer A truth; surfaced on the Today tab.
- **Tomorrow** = Layer B projection for `localDate + 1`; surfaced inline as a preview block on Today / Summary, and answerable via Chat.
- **This week** = Layer B projection across `localDate` + 6; surfaced as a small Summary block and answerable via Chat.

**No mandatory new tabs.** R6's 5-tab structure is sufficient. Future R-versions may add inline previews or chat-driven surfaces, but must not add new tabs without explicit founder approval and a panel pass.

## §12 Default daily plan generation

The supervisor should not assemble every day from scratch.

- Default-plan generators (deterministic logic + optional Claude-managed agents) produce a proposed plan for tomorrow / this week from Layer A + AssignmentConfig defaults + recurrence rules.
- Generated plans live entirely in Layer B. They are proposals.
- **Acceptance is the only bridge from Layer B → Layer A.** A proposal becomes truth only when the supervisor accepts it through a DecisionWorkspaceItem or direct accept route. There is no implicit materialisation.
- UI always badges proposed-plan content as "Proposed — accept to commit" (or equivalent). Layer B reads are wrapped in proposal-typed returns at the API boundary.

## §13 HR ack as operational attention

HR Update acknowledgement is **primarily an operational attention / context-loading mechanism**. Compliance audit is a secondary side-effect.

- On ack, the rule's effective state immediately patches Layer C: the AI starts citing it, conflict detection starts honouring it, UI starts showing it.
- The "5+ words in own voice" requirement is a context-loading gate. It forces actual reading, not muscle-memory tap. It is not compliance theater; it is an attention forcing function.
- Compliance evidence is produced as a side effect (audit rows in Layer A). It is not the purpose.
- If ack quality degrades (5-word spam, copy-paste), the gate must be revised. Initial review trigger: 30 days of usage; measure ack content entropy.

**Drift to avoid:** treating ack as "compliance accept" with binary semantics. Ack must always carry the supervisor's own reading of the rule into Layer C.

## §14 Serial replacement as intentional simplification

ReplacementInvite is single-invite-at-a-time **by design at launch**.

- One outstanding invite per Decision at any time.
- 2-minute TTL per invite.
- On expiry/reject: retry same worker (configurable) OR proceed to next worker.
- No parallel invites at launch.

**Why intentional:**

- State machine stays deterministic.
- Audit trail stays linear.
- Supervisor sees one decision tree at a time.
- "Race two workers" is a 2026 product question, not a launch question.

**Revisit trigger:** median end-to-end replacement time > 6 minutes sustained for 2+ weeks across 5+ tenants. Until then, do not re-debate.

## §15 Low-UI / high-intelligence rule

**Add intelligence before adding surfaces.**

- Default: chat, overlays, inline previews, smart Today / Summary blocks.
- New tab requires: a real founder-validated scenario where existing surfaces fail.
- New screen requires: cognitive-load justification that existing surfaces cannot absorb.

**Reviewer checklist (run on every R-version bump and every major plan):**

- [ ] Did this revision propose any new tab? If yes, what existing tab failed?
- [ ] Did this revision propose any new screen? If yes, what existing surface was insufficient?
- [ ] Could the new capability live as an inline preview, chat answer, or overlay instead?
- [ ] Has the founder validated the new surface against the cognitive-load principle?

## §16 Surface-expression gaps

Known gaps where Active specs do not yet make the framing explicit. Not contradictions in the contradiction-catalogue sense; gaps in product expression. To be addressed in a subsequent R-version pass, not by reopening R6 §4.

- **Today / Tomorrow / Week preview blocks.** R6 mentions Summary, but does not explicitly call out the tomorrow-preview / week-preview inline blocks. Should be added when next R-version lands.
- **DecisionCard `consequences[]` rendering.** D.1 §2.7 mentions option-picker but does not show consequence rendering. Should be added to DecisionCard spec in a future detail pass.
- **AI memory shape disclosure.** R6 Chat tab does not show how Layer C composes; not user-visible, but the spec should reference §5 / §7.
- **Default-plan generator UI surface.** No current spec captures how a generator surfaces proposals — likely a Today tab "generate tomorrow's plan" CTA + a Decisions tab review queue.

## §17 Implementation rules that MUST NOT drift

The following are binding once this framing is Active. Listed here for visibility:

1. No `WeeklyPlan` / `TomorrowPlan` / `ProposedAssignment` tables. Ever.
2. Every `propose_*` tool declares `consequences[]` or is rejected at CI.
3. Layer C persistence past local day boundary = forbidden (audit row only).
4. Every Layer C key contains `companyId` and `supervisorId`.
5. AI factual claims cite Layer A refs or are marked as proposals.
6. Acceptance is the only Layer B → Layer A bridge.
7. HR ack always patches Layer C in the same transaction as audit write.
8. ReplacementInvite remains serial until trigger metric is hit.
9. No new tabs without panel + founder approval.
10. Agent invocations capped per supervisor per day with idempotency keys.

## §18 Anti-patterns

Refuse these in code review and panel:

- **Storing tomorrow's plan in a table** "for performance" or "for audit". Use Layer B + Layer A audit on accept.
- **AI chat that summarises without `refs[]`.** Every claim grounds.
- **Long-term per-supervisor memory** ("the AI remembers Mukesh prefers Tuesdays"). Out of scope until product trigger.
- **Cross-supervisor visibility into Layer C.** Layer C is per-supervisor. HR Update digest is Layer A.
- **Treating accept as advisory.** Accept = Layer A write. Never optional.
- **Auto-accepting proposals.** Every proposal needs explicit supervisor accept.
- **5+ word ack spam ("ok ok ok ok ok").** Trip wire; revise gate when observed.
- **New tab "because the founder mentioned Thursday once".** Capability, not surface.

## §19 Panel verification questions

For any future spec / plan / R-version touching the supervisor app, panel must answer:

1. Does this introduce a new Layer A entity? If yes, is it for stored truth or accidentally for proposed plan? (Reject if the latter.)
2. Does this introduce a new UI surface? If yes, did the §15 reviewer checklist pass?
3. Does this introduce a new AI tool? If yes, does it declare `consequences[]` for `propose_*`?
4. Does this expand Layer C? If yes, does it respect TTL and tenant boundary?
5. Does this change HR ack semantics? If yes, does it preserve operational-attention framing?
6. Does this introduce parallel ReplacementInvites? If yes, has the trigger metric been hit?
7. Does this introduce free-text AI claims without grounding? (Reject.)
8. Does this add per-supervisor long-term memory? (Reject unless product trigger.)

## §20 Open / deferred

**These deferred items do not reopen the core product principles in §§3–§18.** They are implementation/detail follow-ups under the framing — not reasons to weaken the framing itself.

Items raised in panel review on 2026-05-13 that need explicit decisions but do not block Active promotion:

- **Cache invalidation contract for Layer B.** Allowed but unspecified. Need explicit "every Layer A write of kind X invalidates Layer B keys Y, Z" mapping before Wave 4c.
- **Anti-coercion clause for HR ack quality.** Initial 5+ word gate; revisit at 30-day usage review. Specify measurement (content entropy? word overlap with rule body?).
- **Layer C eviction tuning.** Initial 30-min idle TTL is a guess. Measure actual session lengths post-launch and tune.
- **Default-plan generator surface.** Needs UI spec — Today tab CTA + Decisions review queue. Deferred to R-version after R6.
- **Agent invocation budget tuning.** Initial 50/day cap is a guess. Reconcile with `UserDailyAiSpend` table planned for Wave 4c per advisory review.

---

_This Draft was authored 2026-05-13 under doc-discipline protocol §9 and §11. Promotion to Active requires a separate review pass and a separate atomic commit that propagates cross-references into D.1 / R6 / HR Updates._
