# Done memo — Migration 031: company-delete can no longer erase the legal trail

**Date:** 2026-06-12 · **Slice:** `restrict-legal-trail-cascade-2026-06-12` · **Founder ruling:** Telegram (designated command channel): _"we need to follow rule 2 only"_ — history protected forever.

## What changed

- `packages/shared-schema/prisma/schema.prisma` — the **Company** relations on **AuditEvent** (was line 585), **Attendance** (730), **Visit** (328) flip `onDelete: Cascade → Restrict`, each with an in-file comment citing the invariant it enforces.
- `packages/shared-schema/prisma/migrations/20260612_031_restrict_legal_trail_cascade/migration.sql` — generated via `prisma migrate diff` (exact constraint names); header documents why, the zero-app-impact proof, and the one-ALTER-per-constraint rollback.

## The locked-doc conflict (and how it resolved)

The build gate's brain retrieval surfaced that **INVARIANT 4** ("Hard-delete is SUPER_ADMIN only… _Cascade delete removes everything_") directly contradicts **INVARIANT 9** (audit immutable) and **INVARIANT 11** (history forever). Per the locked-docs rule I **stopped before committing**, sent the founder a plain-English KEEP-vs-WIPE decision, and he ruled for protection — explaining the old wording existed only to allow clean-table wipes of QA data before any real customers.

- INV4's **role gate** (hard-delete is SUPER_ADMIN-only) is untouched — only the blast radius is constrained.
- His clean-QA-tables need stays possible: explicit child-first cleanup scripts (e.g. `scripts/cleanup_sandbox_fixtures.ts`) still work; only the silent one-shot cascade is blocked.
- **Founder follow-up (queued in handoff):** one-line constitutional amendment to INVARIANT 4's cascade sentence in `docs/locked/operational-invariants.md` (sessions never edit locked docs).

## Verification

- `prisma validate` clean; `prisma generate` + backend `tsc --noEmit` EXIT 0 (FK actions don't surface in client types).
- App-behavior-neutral: grep-proven **zero** company/worker/site delete calls in `apps/backend/src` + `apps/admin-web` (only idempotency-key expiry cleanup and the designed attendance-reverse compensating delete).
- The RESTRICT behavior itself binds when the migration applies: CI's fresh-Postgres run applies it; optional founder smoke after prod apply = attempt a QA-company delete and expect the FK error (Prisma P2003 naming the constraint).

## Founder apply step (his normal 022-030 flow)

Fresh backup → apply `20260612_031` → `/health` 200. Rollback = the three ALTERs in the migration header.

## Worker→/Site→ cascades (deliberately unchanged)

Worker→Visit/Attendance and Site→Visit remain CASCADE: no worker/site hard-delete path exists anywhere (workers offboard via soft-delete/anonymize), so they're dormant; revisit only if such routes ever appear.
