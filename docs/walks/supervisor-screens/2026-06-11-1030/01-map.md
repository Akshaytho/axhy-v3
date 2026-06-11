# 01 — Map (built from code BEFORE walking)

**Mapped at:** 2026-06-11 10:30 IST · Snapshot of [../MAP.md](../MAP.md) at commit `fb6f635`. Code-traced phase only; live walk-order log lands in 02 during the emulator phase.

## Screens (11) + reachability

| Screen             | In tab bar?        | Reached by                                                |
| ------------------ | ------------------ | --------------------------------------------------------- |
| today              | tab                | tab                                                       |
| decisions          | tab                | tab + router.push from today                              |
| activity           | tab                | tab                                                       |
| chat (AI)          | tab                | tab + router.push('/(supervisor)/chat') (\_layout.tsx:95) |
| me                 | tab                | tab + drawer (My profile / Language / Notifications)      |
| memory             | hidden (href:null) | drawer "Memory & rules" (Drawer.tsx:267) — OK             |
| sites              | hidden             | drawer "My sites" (Drawer.tsx:275) — OK                   |
| replacement-picker | hidden             | SiteActionSheet.tsx:72 + WorkerActionSheet.tsx:62 — OK    |
| **summary**        | hidden             | **NOTHING — orphan (Step 1b-1)**                          |
| **updates**        | hidden             | **NOTHING — orphan (Step 1b-2)**                          |

## Drawer items (Drawer.tsx:255-295) — every-button-real check (LH-2)

| Label           | Action                                 | Verdict                                                                                                    |
| --------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| My profile      | → /me                                  | OK                                                                                                         |
| Memory & rules  | → /memory                              | OK                                                                                                         |
| Reload context  | handleReloadContext() (toast in place) | OK                                                                                                         |
| My sites        | → /sites                               | OK                                                                                                         |
| Language        | → /me (picker lives there)             | OK (indirect but real)                                                                                     |
| Notifications   | → /me (toggles there)                  | OK (indirect but real)                                                                                     |
| How to use Axhy | openURL('https://axhy.app/help')       | **was broken (worker bug #3 twin); FIXED by this session's F3 /help page — activates at admin-web deploy** |
| Temporary mode  | opens pause modal                      | OK (verify live)                                                                                           |
| Sign out        | handleSignOut() → /(auth)              | OK                                                                                                         |

## Step 1b — Orphan & dead-wiring findings (code-traced)

| Type            | Item                            | Evidence                                                                                                                                       | Verdict                                                                                 |
| --------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| ORPHAN SCREEN   | (supervisor)/summary.tsx        | only ref is `_layout.tsx:157` href:null; zero push/href/pathname/Link across app/(supervisor)+components; backend supervisor-summary.ts EXISTS | bug #1 — built + backend-backed but unreachable; live-confirm + placement in live phase |
| ORPHAN SCREEN   | (supervisor)/updates.tsx        | only ref is `_layout.tsx:158` href:null; zero nav; backend supervisor-updates.ts EXISTS (HR updates digest)                                    | bug #2 — same; HR-update notifications a supervisor can never open                      |
| SHARED LINK BUG | Drawer "How to use Axhy"        | Drawer.tsx:289 → axhy.app/help                                                                                                                 | already FIXED this session (F3) — sibling win; verify post-deploy                       |
| OK              | memory/sites/replacement-picker | reachable (table above)                                                                                                                        | wired                                                                                   |

## Next (live phase — needs emulator)

Login as a supervisor (OTP bypass), drive today → decisions → activity → chat → me + drawer, 4-layer DB proof per step, decide summary/updates placement from what they actually render, run bad-day scenarios. Heaviest surface = AI chat (chat.ts).
