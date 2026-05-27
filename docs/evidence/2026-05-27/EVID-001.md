# EVID-001 | test-run | F1-a full matrix 39/39 green | 2026-05-27 18:38 IST

**Slice:** f1-a-trust-model-schema-and-requireauth
**Branch:** feat/f1-a-trust-model-schema-and-requireauth
**Commits:** 46f5abe..eed65ee (6 commits)

## Command

```
DATABASE_URL=$DATABASE_PUBLIC_URL pnpm vitest run --no-file-parallelism \
  test/jwt-claims-extension.test.ts \
  test/tenant-context-legacy-mode.test.ts \
  test/tenant-context-strict-mode.test.ts \
  test/tenant-context-epoch-mismatch.test.ts \
  test/tenant-context-platform-admin.test.ts \
  test/auth-flow-new-format.test.ts \
  test/mint-token-prod-guard.test.ts \
  test/role-gates.test.ts \
  test/auth-flow.test.ts \
  test/leave-requests-authorization-regression.test.ts
```

## Result

```
 ✓ test/auth-flow.test.ts                              (9 tests)
 ✓ test/leave-requests-authorization-regression.test.ts (1 test)
 ✓ test/tenant-context-strict-mode.test.ts             (5 tests)
 ✓ test/auth-flow-new-format.test.ts                   (1 test)
 ✓ test/role-gates.test.ts                             (7 tests)
 ✓ test/jwt-claims-extension.test.ts                   (6 tests)
 ✓ test/tenant-context-epoch-mismatch.test.ts          (2 tests)
 ✓ test/tenant-context-platform-admin.test.ts          (2 tests)
 ✓ test/tenant-context-legacy-mode.test.ts             (3 tests)
 ✓ test/mint-token-prod-guard.test.ts                  (3 tests)

 Test Files  10 passed (10)
      Tests  39 passed (39)
   Duration  163.58s
```

## Coverage map

| File                                    | Cases | Layer                                                       |
| --------------------------------------- | ----- | ----------------------------------------------------------- |
| jwt-claims-extension                    | 6     | unit Zod + JWT helpers                                      |
| tenant-context-legacy-mode              | 3     | real-DB middleware (no DB call when epoch absent)           |
| tenant-context-strict-mode              | 5     | real-DB middleware (Membership.findUnique path)             |
| tenant-context-epoch-mismatch           | 2     | real-DB middleware (revoke + forged-future epoch)           |
| tenant-context-platform-admin           | 2     | real-DB middleware (SUPER_ADMIN via User.is_platform_admin) |
| auth-flow-new-format                    | 1     | real-DB end-to-end (login → decoded JWT)                    |
| mint-token-prod-guard                   | 3     | script-level (spawnSync, 2 guards + happy path)             |
| role-gates (regression)                 | 7     | unit                                                        |
| auth-flow (regression)                  | 9     | real-DB                                                     |
| leave-requests-authorization-regression | 1     | real-DB                                                     |
