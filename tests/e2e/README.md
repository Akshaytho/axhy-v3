# Cross-app water-flow tests

End-to-end "water-flow" tests — Playwright walks every operational workflow as a real user, hitting real backend, real Postgres `axhy-sandbox`, real Cloudflare R2, real Sarvam.

No mocks. Locked feedback rule.

## Suites

- `worker-flow.spec.ts` — Suresh's full day from clock-in to payslip
- `supervisor-flow.spec.ts` — Ravi's voice change capture → Apply All
- `owner-flow.spec.ts` — Mr. Reddy's spot-check + audit query
- `hr-flow.spec.ts` — Kavitha's payroll generation + leave approval
- `onboarding-flow.spec.ts` — AI conversational onboarding for new tenant
- `multi-tenant-flow.spec.ts` — cross-tenant isolation under load
- `offline-flow.spec.ts` — mobile offline queue + reconnect

## Run

```bash
pnpm test:e2e
```
