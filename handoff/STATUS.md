# Project Status — Axhy v3

> **Living document.** Update at every major phase shift (per the Mandatory Update Order in `README.md`).

**Last updated:** 2026-05-15 (execution-state tracker built; routing slice paused at WIP commit `84ae39c`)
**Active phase:** **Layer 1 implementation — routing slice paused for execution-state tracker.** PR 1 + PR 2 + P1.5 all accepted and locally real-DB verified. Routing slice (foundation read APIs — `getEffectiveBinding`, `deriveWorkerPrimarySiteId`, `GET /sites/:id/effective-supervisor`, `GET /decisions/proposed-for-me`) started, then paused mid-way at WIP commit `84ae39c` so the durable execution-state tracker could be built. **Workflow-truth surface now lives at `handoff/execution-state/`** (INDEX + 4 personas + combined). Resume routing slice after friend approves the tracker. Migration is **NOT** yet applied to Railway prod.

## Authority Snapshot

Scan this in 20 seconds. Answers: what governs design? what governs build? what is still Draft?

| Authority role                                       | File                                                      | Status                                                                                                                                                                                                         |
| ---------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cross-cutting design authority**                   | `docs/specs/2026-05-15-workflow-design-closure.md`        | **Active but contract-incomplete** (promoted 2026-05-15). Binding for the 10 cross-cutting picks + 6 primitives + 4 persona surfaces. Open: 8 founder-pick flags + 5 partial items + 6 explicit deferrals.     |
| **Current layer sequencing authority**               | `docs/plans/2026-05-15-implementation-kickoff-layer-1.md` | **Draft kickoff memo.** Authoritative for Layer 1 sequencing. PR 1 (schema-only) + PR 2 (audit-emit helpers + real-DB tests) both locally real-DB verified 2026-05-15. Next slice: P1.5 SiteSupervisorBinding. |
| **Migration baseline recovery (implemented)**        | `docs/plans/2026-05-15-migration-baseline-recovery.md`    | **Implemented 2026-05-15** on parent `feat/phase-c-wave-4b-chat-completion` at `1dbf951`. Day-3 era foundational tables baselined; fresh local replay verified. Prod apply deferred to later supervised step.  |
| **Canonical binding docs today**                     | `docs/index/canonical-truth.md`                           | The authoritative list of Active docs. Closure-spec row added 2026-05-15.                                                                                                                                      |
| **Workflow-truth surface (execution state)**         | `handoff/execution-state/INDEX.md`                        | **NEW 2026-05-15.** Per-workflow build state across all 4 personas + combined. Mandatory entry point for every coding slice. Strict enums (Design verdict / Implementation state / Verification state).        |
| **Finished audit artifacts (Round 1–5)**             | `done/2026-05-15-audit-phase.md`                          | All 5 audits locked as `Audit draft`; reviewable artifacts, not governing specs.                                                                                                                               |
| **Active workflow specs (7 now, including closure)** | `docs/specs/2026-05-1{2,3,4,5}-*.md`                      | All Active. The 6 prior Active specs now carry 2026-05-15 cross-refs pointing to the closure spec.                                                                                                             |

## Where we are right now

### Audit + closure phase — DONE (2026-05-15)

Five persona audits + one cross-cutting design closure spec + one Layer 1 kickoff memo all landed today. The audit set + closure spec define the cross-cutting workflow design decisions; the kickoff memo defines the build sequencing for Layer 1.

#### Artifacts produced

**5 audit drafts** (Status: `Audit draft` — reviewable, not governing; not in canonical-truth):

- `docs/audits/2026-05-14-1yr-sim-supervisor-ravi.md` — Ravi (SUPERVISOR)
- `docs/audits/2026-05-14-1yr-sim-worker-suresh.md` — Suresh (WORKER)
- `docs/audits/2026-05-15-1yr-sim-hr-kavitha.md` — Kavitha (HR)
- `docs/audits/2026-05-15-1yr-sim-owner-reddy.md` — Reddy (OWNER)
- `docs/audits/2026-05-15-1yr-sim-system-combined.md` — All 4 personas at 5K-employee scale

**1 design closure spec** (Status: `Active but contract-incomplete` — promoted 2026-05-15):

- `docs/specs/2026-05-15-workflow-design-closure.md`

**1 implementation kickoff memo** (Status: `Draft kickoff memo`):

- `docs/plans/2026-05-15-implementation-kickoff-layer-1.md`

### What the closure spec freezes (10 cross-cutting decisions)

1. **Multi-HR coordination** → HR pod model (default ≈ 200 workers / 4 supervisors per pod, with Policy-configurable thresholds + override rules).
2. **HR-absent fallback (G-1)** → tiered (backup 24h → cross-pod 48h → owner emergency-override 72h, explicit invocation).
3. **HR queue priority / SLA** → 3 tiers (URGENT 2h / NEXT-DAY 24h / STANDARD 7d) + DIGEST, with age-based auto-escalation.
4. **Worker supervisor-change notification (W-1/W-2/W-3/W-7 / G-8)** → mandatory push + in-app banner + SMS fallback, localised.
5. **Worker termination notification + records (W-4)** → in-app + 7-day appeal window + on-demand records export.
6. **Bootstrap correction + audit-chain reconstruction (G-4 / G-5)** → two surfaces (seed-review UI + audit-chain timeline).
7. **EMPLOYMENT-tier across binding changes** → `originContext` snapshot + decision-support panel + 3-audience push + sick-author safeguard.
8. **Site handoff context migration** → auto-generated `HandoffPackage` on every binding change (§3.7 of closure spec).
9. **AI backlog visibility under burst** → 3-stage processing chip + global busy banner.
10. **Owner digest + bank-authority surface** → 7 owner surfaces (4 admin-web + 3 off-app), Telugu + English digests.

### What's still open

- **8 `[founder pick required]` flags** (closure spec §12 F-P-1 through F-P-8) — commercial/strategic; **none block Layer 1**, but Layers 2–4 will need them.
- **PR 1 prod apply.** Migration chain is locally verified but NOT yet applied to Railway prod. Gated on `prisma migrate resolve --applied 20260507_phase_a_baseline_day3` + supervised window. Treated as a later supervised step, not part of any PR's local-verification gate.
- **P1.5 — SiteSupervisorBinding slice.** Next slice on `feat/layer-1-core-primitives`. Scope: SiteSupervisorBinding table + migration + Zod schemas, only the BINDING\_\* audit helpers actually needed by this slice, real-DB lifecycle tests (creation / no-overlap invariant / acting window basics / permanent reassignment basics). No Layer 2 surface work; no prod migration; no unrelated cleanup; no cosmetic drift fix.
- **Two cosmetic drift items surfaced during baseline drift check, deferred:** `ChatMessage.costInr` missing `@db.Decimal(12, 4)` annotation in schema.prisma (prod is correct); `LivingDoc_pkey` + `LivingDoc_companyId_fkey` constraints carry the old `SupervisorDailyContext_*` names from an earlier rename. Both deferred to a separate small cleanup migration after PR 2.
- **Layers 2–4 kickoff memos** — not yet written; will be drafted after each prior layer ships.

### What stopped being binding (as of 2026-05-15 promotion)

The closure spec now supersedes these deferred items in the 6 prior active specs. Cross-refs landed in each spec in the same 2026-05-15 promotion commit:

- **Responsibility model §10 deferred items** → answered by Decisions 6, 7, 8 + §3.7 HandoffPackage.
- **Operations workflow model §12 open questions** → 7 of 10 answered (G-1, G-2, G-3, G-4, G-5, G-9, G-10); 3 remain genuinely deferred (cross-tenant transfer, payroll handler, cross-supervisor portfolio visibility).
- **D.1 §2.11 EMPLOYMENT-tier HR ack surface** → specified in closure §5.3.9 + originContext + decision-support panel.
- **HR Updates spec §4.1 audience model** → amended via Policy `audienceWorkers=true` for pay-affecting updates.
- **R6 §4 #1 reverse-window contradiction** → proposed pick (5-min hard + 30-min soft-flag). Final founder pick: §12 F-P-4.

## Memory pointers (auto-loaded by new sessions)

- v3 memory index: `~/.claude/projects/-Users-thotaakshay-eclean-workspace/memory/v3/MEMORY_V3.md` (points back here)
- Workspace rules: `~/eclean_workspace/CLAUDE.md`
- v3 master plan: `~/.claude/plans/now-i-think-it-functional-kernighan.md`

## How to update this file

1. When a phase shifts (new artifact lands, founder approves a spec, layer starts/ends): edit the "Active phase" line + the "Where we are right now" section.
2. When something becomes binding: add it to the "What stops being binding" section.
3. Keep "Artifacts produced" current.
4. Keep this scannable in ≤2 minutes.

The companion file `done/2026-05-15-audit-phase.md` archives the deep detail of the just-completed phase.
