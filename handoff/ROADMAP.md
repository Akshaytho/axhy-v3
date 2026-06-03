# Project Roadmap — Axhy v3

> **Forward look.** Updated when the next phase is named.

**Last updated:** 2026-05-15

## ✅ DONE 2026-05-15 — Closure spec promoted Active

- `docs/specs/2026-05-15-workflow-design-closure.md` Status: `Draft → Active but contract-incomplete`.
- `docs/index/canonical-truth.md` row added (Active but contract-incomplete table).
- 2026-05-15 cross-refs landed in all 6 prior active specs (responsibility model, ops model, D.1, R6, HR Updates, product framing).
- STATUS / NEXT_SESSION / MEMORY_V3 wording updated.

## Immediate next

### 1. Open Layer 1 implementation branch

- Branch: `feat/layer-1-core-primitives`
- Source of sequencing: `docs/plans/2026-05-15-implementation-kickoff-layer-1.md`

### 2. First PR — schema-only migrations

- All 8 migrations (A–H) per kickoff memo §3
- Prisma model changes in `packages/shared-schema`
- Zod schema updates
- AuditEvent kind enum extension (15 new kinds)
- No business logic in PR 1
- Aim: green CI + Railway dev apply

### 3. Founder picks resolution (parallel; doesn't block Layer 1)

- 8 `[founder pick required]` flags in closure spec §12 (F-P-1 through F-P-8).
- None block Layer 1 build (per closure §11 + kickoff memo §6).
- Each pick resolution lands as a one-line commit updating the closure spec.

### 4. Layer 1 build continues per kickoff memo §7 (PRs 2–8)

- PR 2 — audit-emit helpers for all 15 new kinds (real-DB tests).
- PR 3 — Stream B HRPod CRUD.
- PR 4 — Stream C PolicyService + cache + seed defaults.
- PR 5 — Stream D NotificationService + 4 delivery channels.
- PR 6 — Stream E Digest model + stub composers.
- PR 7 — Stream F Cron framework + 4 shell jobs.
- PR 8 — Stream G HandoffPackageComposer + DWI additions.

After PR 8: Layer 1 exit criteria met; draft Layer 2 kickoff memo.

## After Layer 1 lands

### 4. Layer 2 kickoff memo written

- Scope: HR coordination surfaces — admin-web HR portal, pod queue, bootstrap-seed review UI, audit-chain reconstruction.
- File: `docs/plans/<date>-implementation-kickoff-layer-2.md`
- Gated by: closure spec Active + Layer 1 exit criteria met.

### 5. Layer 3 kickoff memo written

- Scope: Supervisor operational surfaces — Today/Decisions HR-pending visibility, absence mode, while-you-were-out digest, handoff-context panel, portfolio-delta, originator-vs-actor rendering.
- File: `docs/plans/<date>-implementation-kickoff-layer-3.md`
- Gated by: Layer 2 exit criteria met.

### 6. Layer 4 kickoff memo written

- Scope: Worker trust surfaces (12 surfaces — home shell, clock-in/out, leave, replacement-invite, dispute, suspension visibility, termination + appeal + records, pay/attendance) + Owner oversight surfaces (7 surfaces — monthly digest, KPI dashboard, incident digest, bank/tenant UI, AI alerts, annual review, compliance lookup).
- File: `docs/plans/<date>-implementation-kickoff-layer-4.md`
- Gated by: Layer 3 exit criteria met.

## After all 4 layers ship

### 7. Validation pass against the audit set

- Run all 5 audit drafts as a checklist against the shipped product.
- Each `[MISSING]` / `[BROKEN]` verdict in the audit set should now have a working surface or an explicit-deferred status with a reason.
- Document gaps surfaced for v3.1.

### 8. v3.0 launch readiness

- Multi-tenant invariant verified at scale.
- Real production tenants onboarded for pilot.
- Master plan §M launch criteria audited.

## How to update this file

1. When a layer ships: mark it `DONE` in `NEXT_SESSION.md` and shift this file's "Immediate next" forward.
2. When a new layer's scope clarifies: tighten the bullet for it.
3. When a founder pick lands: drop F-P-N from the "Founder picks resolution" item; note the resolution in `NEXT_SESSION.md`.

This file is the forward-look companion to `NEXT_SESSION.md`. Both are updated at phase shifts.
