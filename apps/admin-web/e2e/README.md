# HR A1 — Playwright water-flow

## Run

```
pnpm --filter admin-web add -D @playwright/test
pnpm --filter admin-web exec playwright install --with-deps chromium

# In one terminal — backend
railway run --service Postgres -- pnpm --filter @axhy/backend dev

# In another — admin-web
pnpm --filter admin-web dev

# Seed an HR account in DB, set env:
export E2E_HR_PHONE='+15551234567'
export E2E_SEEDED_SUPERVISOR_USER_ID='<uuid>'
export E2E_SEEDED_LEAVE_REQUEST_ID='<uuid>'

# Run the test
pnpm --filter admin-web exec playwright test
```

Requires backend `AXHY_OTP_BYPASS=1` so the OTP step accepts code `000000`.

## Why this spec ships before its dependencies

The spec file is committed without `@playwright/test` in `devDependencies` so
the artifact lives in the repo while execution is deferred. The main
`apps/admin-web/tsconfig.json` excludes `e2e/` so `pnpm --filter admin-web
typecheck` stays green. A scoped `e2e/tsconfig.json` with `skipLibCheck`
keeps the spec syntactically valid for IDEs.

When the operator installs `@playwright/test`, remove the
`// @ts-expect-error` comments at the top of `playwright.config.ts` and
`e2e/hr-water-flow.spec.ts`.
