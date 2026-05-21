# Done memo — `worker-d1-s2a-2-mobile-home`

**Status:** DONE 2026-05-22
**Gate:** L3 Senior (2 HIGH remaining — production-capable with known risks)
**Commits:**

- `2e876a6` feat(worker-mvp): sub-slice 2a-2 mobile Worker Home + Assignment Detail
- `f6de5dd` docs(handoff): sub-slice 2a-2 EXECUTED — point NEXT_SESSION at 2b-1
- `5b9d445` refactor(worker-mvp): 2a-2 quality fixes — magic-number constants + role enum

**Scope:** Mobile half of slice 2a — consumes `GET /worker/today` + `GET /worker/visits/:id` shipped in 2a-1. Worker Home rewritten from slice-1 placeholder; new Assignment Detail screen as the first Expo Router dynamic route under `(worker)/visit/[id].tsx`. 4 reusable components, 2 React Query hooks, 1 Playwright capture suite, 4 screenshots, 1 side-by-side DELTA.html.

## Files

| Path                                                    | Status   | Purpose                                                                          |
| ------------------------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| `apps/mobile/components/worker/ResumeCaptureBanner.tsx` | created  | Sticky banner for in-flight visits (`EN_ROUTE` / `ON_SITE` / etc.)               |
| `apps/mobile/components/worker/StateBadge.tsx`          | created  | Visit-state pill mapping `visit.state` → label + tone                            |
| `apps/mobile/components/worker/AssignmentCard.tsx`      | created  | Site card with NEXT pill + terracotta border on first not-completed              |
| `apps/mobile/components/worker/HomeBellIcon.tsx`        | created  | Bell + static red dot (real notif count ships slice 3)                           |
| `apps/mobile/lib/queries/use-worker-today.ts`           | created  | React Query hook for `GET /worker/today`                                         |
| `apps/mobile/lib/queries/use-worker-visit.ts`           | created  | React Query hook for `GET /worker/visits/:id`                                    |
| `apps/mobile/app/(worker)/index.tsx`                    | rewrite  | Worker Home — placeholder replaced with real Home consuming `/today`             |
| `apps/mobile/app/(worker)/visit/[id].tsx`               | created  | Assignment Detail — first dynamic route under `(worker)`                         |
| `apps/mobile/scripts/qa-worker-d1-s2a-home-detail.ts`   | created  | Playwright captures 3 Home states + Detail (gitignored per `**/scripts/qa-*.ts`) |
| `apps/mobile/lib/api-routes.ts`                         | modified | Added `workerToday`, `workerVisit`, `NAV_ROUTES.workerVisitDetail`               |

## Verification

| Check                                  | Result | Detail                                                                     |
| -------------------------------------- | ------ | -------------------------------------------------------------------------- |
| `pnpm --filter @axhy/mobile typecheck` | green  | `tsc --noEmit` no errors                                                   |
| Lint                                   | green  | eslint exit 0 for the 4 new + 2 modified files                             |
| Playwright captures                    | green  | 4 PNGs in `screenshots-worker-d1-s2a/` (empty / typical / resume / detail) |
| Side-by-side DELTA                     | green  | 8 PASS / 2 LOCKED / 5 DEFER / 1 PLACEHOLDER / 0 DRIFT / 0 BROKEN           |
| Real-DB tests                          | n/a    | 2a-2 is mobile-only — no backend tests added. 2a-1's 8/8 still green.      |
| Quality gate                           | **L3** | 2 HIGH remaining (carried, non-blocking at Senior)                         |

## State-machine discipline (§0)

Zero state transitions fire client-side in 2a-2. Every badge and banner predicate is driven by backend response values:

- `StateBadge` maps `visit.state` → label/tone (label vocab matches `visitMachine.VisitStateValue`).
- Resume banner predicate runs server-side and arrives as `WorkerTodayOutput.resumeCapture`.
- Account-paused banner predicate uses `worker.state IN (ON_SUSPENSION, BLOCKED)` from `/worker/today`.
- `nextVisitId` for the NEXT pill filters out `VERIFIED | CANCELLED | NO_SHOW | ARCHIVED` — these are visitMachine **terminal** states, not invented client labels.

## Source coverage matrix

| Spec item                       | Spec source                                                             | This slice                                                        |
| ------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Worker Home real implementation | `WORKER_MVP_SLICE_2A_PLAN.md` §1 #1                                     | `(worker)/index.tsx` rewrite + 4 components consumed              |
| Resume-capture banner           | `WORKER_MVP_SLICE_2A_PLAN.md` §1 + decision 2026-05-21                  | `ResumeCaptureBanner.tsx` + predicate derived server-side         |
| Assignment Detail screen        | `WORKER_MVP_SLICE_2A_PLAN.md` §1 #2 + persona `08_assignment_detail.md` | `(worker)/visit/[id].tsx`                                         |
| Tap-to-call supervisor          | Slice 1 §4 Q6 (phone hidden, behind button)                             | `onCall = Linking.openURL('tel:...')`; disabled fallback for null |
| "Can't make this" disabled stub | `DO_NOT_BUILD_MVP.md` (real flow → 2c)                                  | `<Pressable disabled>` + "Coming with leave & swap support"       |
| 3-tab nav                       | Founder lock 2026-05-21                                                 | Carried from slice 1 `_layout.tsx`; no 4th tab added              |
| Pull-to-refresh                 | Slice 2a plan §4 default #10                                            | `<RefreshControl onRefresh={refetch} />`                          |
| Empty state                     | Slice 2a plan §4 default #2                                             | "No visits today. Enjoy the rest. Come back tomorrow."            |

## Known divergences (intentional)

| Element                    | Status      | Why                                                      |
| -------------------------- | ----------- | -------------------------------------------------------- |
| 4-tab → 3-tab              | LOCKED      | Founder 2026-05-21 — capture surfaces as Home banner     |
| "Can't make this" stub     | LOCKED      | Real swap flow + `swapRequestMachine` ships in 2c        |
| Greeting "Today" (no name) | DEFER       | `/me` hydration on Home — slice 3 polish                 |
| "Synced" pill              | DEFER       | Background-sync state infra not in tree yet — slice 3    |
| NEXT SITE hero card        | DEFER       | QR scan + check-in is capture-flow entrypoint — slice 2b |
| KPI tiles                  | DEFER       | Stats aggregator + scoring not defined — slice 3         |
| Map preview                | PLACEHOLDER | Needs `expo-location` permission — slice 2b              |
| Photos summary             | PLACEHOLDER | Real photo count lands with capture pipeline — slice 2b  |

## Coverage notes for the next session

Slice 2a is now fully shipped (both 2a-1 backend + 2a-2 mobile). Next sub-slice is **2b-1** (capture-flow scaffold + `expo-location` install + per-user partition under `documentDirectory`). See `handoff/NEXT_SESSION.md` for the full brief.

## Self-reasoning recap

- impactCheck was not re-queried for 2a-2 because the slice 2a plan (with full impactCheck pass) was approved 2026-05-21, and 2a-2 is a pure UI consumption of the contract shipped in 2a-1.
- Verified `visitMachine` + `workerMachine` are read-only in this slice (no `actor.send(...)` calls anywhere in mobile).
- Verified `api-routes.ts` path-builder is used (no hardcoded endpoint strings).
- Verified `apiFetch` wrapper handles auth + 401 → routes back to phone screen.
- Verified tokens (terracotta-paper, semantic.bad, etc.) reused from existing scaffold.
- Risk: rewriting Home placeholder could regress cold-start — mitigated by typecheck pass + Playwright screenshot validation pre-commit.
- No locked-doc conflicts surfaced.
