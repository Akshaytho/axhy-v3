# Project Status — Axhy v3

> **Living document.** Update at every major phase shift (per the Mandatory Update Order in `README.md`).

**Last updated:** 2026-05-15 (PR 1 code complete; migration ready-to-apply but not applied)
**Active phase:** Layer 1 PR 1 schema-only — **code complete, migration NOT yet applied to any DB.** Branch `feat/layer-1-core-primitives` open with 2 commits (215c208 schema + be954a2 PolicyValue doc reconciliation). Blocked from non-prod verification because there is no separate Railway dev DB (per project memory the only Railway Postgres is production-tagged). Awaiting either (a) explicit founder approval for a production migration window, (b) provisioning of a separate dev DB, or (c) local Postgres verification path. PR 2 NOT started.

## Authority Snapshot

Scan this in 20 seconds. Answers: what governs design? what governs build? what is still Draft?

| Authority role                                       | File                                                      | Status                                                                                                                                                                                                     |
| ---------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cross-cutting design authority**                   | `docs/specs/2026-05-15-workflow-design-closure.md`        | **Active but contract-incomplete** (promoted 2026-05-15). Binding for the 10 cross-cutting picks + 6 primitives + 4 persona surfaces. Open: 8 founder-pick flags + 5 partial items + 6 explicit deferrals. |
| **Current layer sequencing authority**               | `docs/plans/2026-05-15-implementation-kickoff-layer-1.md` | **Draft kickoff memo.** Authoritative for Layer 1 sequencing now that closure spec is Active. Branch `feat/layer-1-core-primitives` ready to open.                                                         |
| **Canonical binding docs today**                     | `docs/index/canonical-truth.md`                           | The authoritative list of Active docs. Closure-spec row added 2026-05-15.                                                                                                                                  |
| **Finished audit artifacts (Round 1–5)**             | `done/2026-05-15-audit-phase.md`                          | All 5 audits locked as `Audit draft`; reviewable artifacts, not governing specs.                                                                                                                           |
| **Active workflow specs (7 now, including closure)** | `docs/specs/2026-05-1{2,3,4,5}-*.md`                      | All Active. The 6 prior Active specs now carry 2026-05-15 cross-refs pointing to the closure spec.                                                                                                         |

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
- **Layer 1 build branch not yet opened.** Next concrete action: `git checkout -b feat/layer-1-core-primitives` + first PR per kickoff memo §7.
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
