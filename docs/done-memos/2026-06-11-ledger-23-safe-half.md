# Done memo — ledger #23 safe half (default-deny CI check)

**Date:** 2026-06-11 09:35 IST · **Slice:** ledger-23-safe-half-default-deny-ci-check

## What shipped

- `scripts/check-default-deny.mjs` — CI-failing scan: every `apps/backend/src/routes/*.ts` must reference `requireAuth`/`requireWorkerRole` OR carry a justified `auth-exempt — <reason>` marker (the auth-refresh.ts:1 convention).
- `routes/auth.ts` — gained the justified marker (login bootstrap is deliberately public; guarded by OTP issuance limits + S1 attempt cap + per-IP edge limiter). Handlers untouched.
- `.github/workflows/ci.yml` — new independent `default-deny` job (migration-safety shape; static run command, no untrusted interpolation).

## Proofs (executed)

- Clean tree: exit 0 — `40 route modules checked: 39 gated, 1 justified-exempt, 0 violations`.
- Mutation: temp gate-less `routes/zz-fake.ts` → exit 1 naming exactly that file; removed; clean re-run exit 0.
- Backend tsc 0.

## Deliberate limits (per the 06-09 handoff #23 decision)

Runtime global `onRequest` default-deny hook deferred (the risky half). Scan covers `src/routes/` only — the sole registration surface (server.ts:215-253).
