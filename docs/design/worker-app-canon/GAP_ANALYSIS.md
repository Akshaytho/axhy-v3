[ORCHESTRATOR_EXCEPTION] gap doc must stay in-session — drives the implementation plan in the same context

# Worker App Canon — Gap Analysis

Captured 2026-06-01. Compares the 9 canon screens against `apps/mobile/app/(worker)/` + `(auth)/`.

## Screens

| #   | Canon design       | Existing path                                                                        | State                                        |
| --- | ------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------- |
| 1   | WorkerToday (Home) | `apps/mobile/app/(worker)/index.tsx`                                                 | exists with different layout — full redesign |
| 2   | WorkerQRScan       | `apps/mobile/app/(worker)/capture/[visitId]/qr-scan.tsx`                             | exists — re-skin                             |
| 3   | WorkerCamera       | `apps/mobile/app/(worker)/capture/[visitId]/before-photos.tsx`, `…/after-photos.tsx` | exists — re-skin                             |
| 4   | WorkerGallery      | (same files)                                                                         | needs gallery sub-view                       |
| 5   | WorkerTimer        | `apps/mobile/app/(worker)/capture/[visitId]/timer.tsx`                               | exists — replace with ring + mono            |
| 6   | WorkerFinalReview  | `apps/mobile/app/(worker)/capture/[visitId]/review.tsx`                              | exists — re-skin                             |
| 7   | WorkerSuccess      | `apps/mobile/app/(worker)/capture/[visitId]/submit.tsx`                              | exists — re-skin                             |
| 8   | WorkerHistory      | `apps/mobile/app/(worker)/history.tsx`                                               | placeholder — BUILD                          |
| 9   | WorkerProfile      | `apps/mobile/app/(worker)/profile.tsx`                                               | placeholder — BUILD                          |

Visit Detail (`(worker)/visit/[id].tsx`) is NOT in canon — keep, restyle to canon. Auth screens stay as-is.

## Components

| Canon                 | Existing                                | State                                                                     |
| --------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| `WPhone`              | `SafeAreaView` + paper bg               | OK                                                                        |
| `WTabs` (4 tabs)      | 3-tab `Tabs` (Home / History / Profile) | KEEP 3-tab; canon "Capture" tab is a passthrough to QR — Home CTA does it |
| `WCard`               | none                                    | BUILD `components/worker/WCard.tsx`                                       |
| `WGlyph`              | Feather                                 | use Feather + custom SVG (shutter, corner brackets)                       |
| `TimerRing`           | none                                    | BUILD `components/worker/TimerRing.tsx`                                   |
| `AssignmentCard`      | exists                                  | REWRITE to canon row                                                      |
| `ResumeCaptureBanner` | exists                                  | KEEP                                                                      |
| `HomeBellIcon`        | exists                                  | REPLACE with sync pill                                                    |

## Tokens

Already 1:1. No changes.

## Supervisor sidebar pattern (mirror for worker)

`apps/mobile/components/Drawer.tsx` — left slide-in `Modal` + `Animated.Value` -280→0. Provided via `DrawerContext.openDrawer()` at layout level. We will mirror with a `WorkerDrawer` and `WorkerDrawerContext`.

## Sidebar items for worker (not in canon)

1. My profile → drills to language / account
2. Leave request
3. Swap / replacement invites
4. Help / Support → `Linking.openURL('https://axhy.app/help')`
5. Sign out

## Decisions made without founder input

- KEEP 3-tab; canon Capture tab is redundant with Home CTA.
- Sync pill on the right, hamburger on the left of the canon Home header.
- Keep Visit Detail screen between Home and QR, restyle to canon.
