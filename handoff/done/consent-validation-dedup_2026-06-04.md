# Done memo — consent policyVersion validation + dedup (2026-06-04)

**Slice:** harden `POST /worker/consent` (DPDP first-run consent).

## What shipped (NOT pushed — fix-only)

- **`packages/shared-schema/src/zod/worker-consent.ts`** — new `ACCEPTED_POLICY_VERSIONS = ['2026-05-21']` (the one real version the client sends) + `SubmitConsentInput.policyVersion` now `.refine()`s against it. An unknown/garbage version (`v999`) fails parse → route returns **400 BAD_INPUT** before any write. Closes an integrity hole where an authenticated/tampered client could persist an arbitrary string as a legal consent record.
- **`apps/backend/src/routes/worker-consent.ts`** — before `consentLog.create`, `findFirst` the caller's exact `(userId, policyVersion)`; if it exists, return **409 ALREADY_CONSENTED** (no insert). This activates the mobile client's already-present 409 handler (`consent.tsx:52-56` → "already consented, proceed") instead of silently appending a duplicate row on every reinstall/refocus. Also fixed a stale inline comment (`schema.prisma:1337` → `1390`).
- **`apps/backend/test/worker-consent.test.ts`** — replaced the fabricated `'2026-05-22'` append test with a same-version dedup test; added an unknown-version 400 test.

## Compliance (INV 9 / INV 11)

The dedup **never deletes or mutates** an existing `ConsentLog` row — it only declines a redundant same-version insert and returns 409. So the immutable-legal-record posture (INV 9) and DPDP keep-record-structure (INV 11) are preserved. A **different** allowed version still appends (real history of accepting v1 then a later v2).

## Verification (Railway prod DB)

- `worker-consent.test.ts` — **6/6 green**: allowed `2026-05-21` → 200 + exactly 1 row; same-version re-submit → 409 + still 1 row; unknown `v999` → 400 + count unchanged; unauth 401; missing policyVersion 400.
- `pnpm --filter @axhy/shared-schema run build` + backend typecheck — **clean**.

## Decisions

- **No DB unique constraint** on `(userId, policyVersion)` — would require cleaning pre-existing prod duplicates first (real risk). App-layer check-then-insert is the simple, compliance-safe fix now.
- **Allowed list = current real version only** (`2026-05-21`). When a new policy ships, add its version to `ACCEPTED_POLICY_VERSIONS`; append-on-new-version then works automatically.

## Known gaps

- App-layer dedup has a tiny race window (two truly-concurrent identical submits) — benign (both valid append-only records; 10/min limit + once-per-install usage make it near-impossible).
- The mobile client's 409→success path was confirmed by the scout+verify workflow (consent.tsx:52-56), not re-exercised on-device in this slice.
