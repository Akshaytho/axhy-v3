# MAP — supervisor-screens (LIVING file — feature level)

> Editable across walks. Next walk reads THIS instead of re-reading the codebase.
> Scope: the supervisor mobile persona surface — today, decisions, activity, chat (AI), me, + hidden screens (summary, updates, memory, sites, replacement-picker) + drawer.

**Created:** 2026-06-11 10:30 IST · **Last verified against code:** 2026-06-11 10:30 IST (walk [2026-06-11-1030](2026-06-11-1030/)) · **Verified at commit:** `fb6f635`

## 1. Footprint — files this feature touches (THE staleness list)

| Kind          | Path                                                                                                                                                                                                                                                                                                    | Note                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| screen        | apps/mobile/app/(supervisor)/\_layout.tsx                                                                                                                                                                                                                                                               | 5 tabs + 6 hidden (href:null) screens             |
| screen        | apps/mobile/app/(supervisor)/{today,decisions,activity,chat,me}.tsx                                                                                                                                                                                                                                     | tab screens                                       |
| screen        | apps/mobile/app/(supervisor)/{summary,updates,memory,sites,replacement-picker}.tsx                                                                                                                                                                                                                      | hidden screens                                    |
| component     | apps/mobile/components/Drawer.tsx                                                                                                                                                                                                                                                                       | supervisor drawer menu                            |
| component     | apps/mobile/components/today/ (UrgencyBanner, SiteActionSheet, WorkerActionSheet, …)                                                                                                                                                                                                                    | today surface                                     |
| client lib    | apps/mobile/lib/chat-api.ts, lib/queries/use-{today,summary,activity,decisions,decision-action,hr-updates,supervisor-context,supervisor-living-doc,reload-context,replacement-invites}.ts                                                                                                               | supervisor data hooks                             |
| backend route | apps/backend/src/routes/supervisor-{today,decisions,activity,context,living-doc,summary,updates}.ts, decisions.ts, chat.ts, chat-history.ts, chat-reload-context.ts, chat-transcribe.ts, complaints.ts, swap-requests.ts, leave-requests.ts, replacement-invites.ts, calendar.ts, sites.ts, activity.ts |                                                   |
| service       | apps/backend/src/lib/services/{today,summary,decisions,activity,activity-reverse,supervisor-context,hr-updates,replacement-invite,swap-request,complaint}-service.ts                                                                                                                                    |                                                   |
| lib           | apps/backend/src/lib/{living-doc,calendar-context,effective-responsibility,supervisor-decision-writer,semantic-context,prompt-composer,supervisor-token-cap}.ts                                                                                                                                         |                                                   |
| state machine | packages/state-machines/src/{assignment,worker}.ts (read for conflict/decisions)                                                                                                                                                                                                                        | leave/swap/complaint have NO machine (ledger #20) |

## 2. Personas connected

| Persona    | Touchpoint                                                    | When                 |
| ---------- | ------------------------------------------------------------- | -------------------- |
| Supervisor | every screen                                                  | always               |
| Worker     | mark-absent/leave/swap targets; replacement invites           | on supervisor action |
| HR         | complaints routed to HR; HR updates feed supervisor `updates` | cross                |
| Owner      | AI cost from supervisor chat (aiSpendDailyInr)                | per chat turn        |

## 3. Known sharp edges (re-check first every walk)

1. **AI chat path** (chat.ts, 2078 lines) — the most complex surface; budget/circuit/idempotency/concurrency gates; UTC-date default fixed C1 this session.
2. **Leave/swap/complaint have no state machines** (ledger #20) — transitions inline, race-safe-verified but duplicated.
3. **Orphan screens** summary + updates (this walk Step 1b).
4. **Shared help-link bug** (Drawer.tsx → axhy.app/help) — same as worker #3, FIXED by this session's F3 /help page (activates at admin-web deploy).
5. RLS activation gap touches supervisor reads (supervisor-today/summary/activity/context bare prisma) — findings §1.

## Change log (never delete lines)

| At (IST)             | By                   | What changed                                          |
| -------------------- | -------------------- | ----------------------------------------------------- |
| 2026-06-11 10:30 IST | walk 2026-06-11-1030 | created; footprint + nav graph from code-traced phase |
