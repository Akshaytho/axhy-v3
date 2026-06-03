# Worker App Canon — What's Missing

Captured 2026-06-01 after the first implementation pass against the canon design.

## Worker-MVP scope items present in plans but absent from canon

The canon design covers 9 screens (Home, QR, Camera×2, Gallery×2, Timer, Review, Success, History, Profile). The following worker-MVP items are NOT in the canon. They are now reachable from the **WorkerDrawer** (left slide-in via hamburger on Home / History / Profile headers):

| Scope item                           | Where it lives now                                                      |
| ------------------------------------ | ----------------------------------------------------------------------- |
| Leave request flow                   | Drawer → "Leave request" (Alert placeholder; slice 3 builds it)         |
| Swap / replacement-invite acceptance | Drawer → "Swap / replacement invites" (Alert placeholder; slice 3)      |
| Help & support                       | Drawer → "Help & support" → `Linking.openURL('https://axhy.app/help')`  |
| Sign out                             | Drawer → "Sign out" (real onAppLogout) AND a Sign out button on Profile |
| Language switcher (en / hi / te)     | Not yet wired into Profile; planned addition in slice 3                 |

## Canon elements present but not yet wired to live data

| Canon element                        | Current state                                         | Why                                                              |
| ------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Avg score on Home stats strip        | Renders "—"                                           | No `/worker/avg-score` endpoint yet                              |
| "Done" count on Home                 | Counts visits in `VERIFIED` state                     | Works against current `/worker/today` shape                      |
| Timer "% OF SLOT"                    | Hardcoded 30-minute reference slot                    | Visit `slot.durationMin` not on schema                           |
| GPS points counter                   | Approximate (1 at start + 1 every 30s on native)      | Real watchPosition cadence is TODO                               |
| Verification score on Submit success | Hardcoded `92` placeholder                            | `/worker/visits/:id/verify-status` has no score field yet (2b-4) |
| "Site verified" subtitle on success  | Hardcoded "Phoenix Mall — B1 · Whitefield, Bangalore" | Submit screen has no visit query wired in                        |
| History timeline rows                | 4-row mock                                            | No `/worker/history?week=...` endpoint yet                       |
| Profile quality score / 64px circle  | Hardcoded 87                                          | Same blocker as Home's Avg score                                 |
| Profile name                         | JWT `name` claim with "Worker" fallback               | JWT doesn't always include name; needs `/worker/me`              |
| Profile "Member since" footer        | Hardcoded "January 2024"                              | Will swap when `/worker/me.createdAt` is exposed                 |
| APPEARANCE preset chips              | Visual only                                           | Theme picker cut per `DO_NOT_BUILD_MVP.md`                       |

## States the design does NOT show — what I built as fallback

| State                                                      | Fallback                                                                           |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Loading (initial fetch)                                    | `ActivityIndicator` in terracotta — canon-safe palette                             |
| Error (fetch fails)                                        | Centered "Couldn't load today's plan." + pull-to-refresh hint                      |
| Empty Home (no visits)                                     | "No visits today / Enjoy the rest. Come back tomorrow."                            |
| Account paused (`worker.state ∈ {ON_SUSPENSION, BLOCKED}`) | Red banner "Account paused / Contact your supervisor to resume work."              |
| Sync: queued / failed uploads                              | `SyncPill` flips Synced → Syncing…. Offline variant ready but not wired to NetInfo |
| Submit error                                               | Centered `alert-circle` + "Try again" button                                       |
| Submit polling                                             | Centered spinner + "Verifying photos…" + "Check N of 40" counter                   |

## Hard product questions for the founder

1. **Quality score backend.** Canon shows `92/100` AI score (Success) and `87` average (Profile). No `Visit.qualityScore` or `Worker.avgQualityScore` in Prisma. Add and surface from `/worker/visits/:id/verify-status` + `/worker/me`?
2. **Per-row score badge on History.** Same blocker. Store per-visit or compute on the fly?
3. **History endpoint.** Should `/worker/history?from=YYYY-MM-DD&to=YYYY-MM-DD` return the same `VisitRow` shape as `/worker/today` (unfiltered by date)?
4. **Distance on "NEXT SITE" card.** Canon shows "180 m away". Compute via `expo-location` or include `distanceMeters` in `/worker/today`?
5. **Slot duration.** No `slot.durationMin` today; timer "% OF SLOT" needs it. Add to `Visit` or compute from adjacent `scheduledFor`?
6. **APPEARANCE theme presets.** Canon shows 5 presets — purely decorative for MVP, OK?
7. **Camera viewport.** Canon shows mode pill, photo counter, GPS chip, rule-of-thirds grid, 78px shutter. Existing `PhasePhotoCapture` + `CameraView` are real `expo-camera` integrations with upload state. Layer canon overlay on top OR rewrite to canon controls bar + gallery thumb? (First preserves queue logic; second is what the design literally shows.)
8. **Drawer hamburger placement.** Canon Home shows only Sync pill on the right; I added a hamburger on the left so drawer is one-tap from every tab. Keep, or move drawer access into long-press on Profile tab?

## Decisions I made without founder input

- Kept 3 tabs (Today / History / You). Canon 4-tab "Capture" tab is redundant with Home CTA — folded in.
- Hamburger on the left of Home/History header (canon shows none); Profile gets a small menuBar above the full-bleed header card.
- Visit Detail screen between Home and QR is NOT in canon — kept existing impl, full restyle deferred to a follow-up iteration (it uses canon tokens so the visual drift is small).
- Submit success uses canon visual + hardcoded `92` until the verify-status payload gains a quality field.
