# Runbooks

One runbook per operational concern. Format: trigger, diagnostic steps, fix steps, verification, escalation.

## Initial set (Day 6 of evidence sprint)

- `database-migration-failure.md`
- `ai-cost-spike.md`
- `voice-pipeline-degradation.md`
- `cross-tenant-leak-suspected.md`
- `outbox-backlog-growing.md`
- `mobile-app-crash-spike.md`
- `r2-upload-failures.md`
- `msg91-otp-delivery-degraded.md`
- `dpdp-data-deletion-request.md`
- `super-admin-emergency-tenant-suspend.md`

## Live runbooks

- [`runaway-claude-agents.md`](./runaway-claude-agents.md) — When Anthropic / Claude bill spikes unexpectedly. Walks through routines, orphan sessions, Railway cron, Console usage. Companion script: `scripts/stop-all-claude-routines.mjs`.
