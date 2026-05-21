# DO NOT BUILD — Worker MVP Cut List

**Authority:** Founder directive 2026-05-21 + Critic-MVP-Scope round 1 + `MVP_V2_ALIGNED_PLAN.md` §11.
**Scope:** Anything on this list is OUT of the worker MVP. If it's not on this list and not in `MVP_V2_ALIGNED_PLAN.md` §2–§8, ask the founder before building.

Source repos:

- Design + specs: `https://github.com/Akshaytho/persona-worker.git` (canonical: `MVP_V2_ALIGNED_PLAN.md`, navigation: `00_INDEX.md`, other 86 files = deferred reference only)
- Cognitive system: `https://github.com/Akshaytho/axhy-cognitive-system.git`
- Visual reference: `file:///Users/thotaakshay/Downloads/Axhy Worker App _standalone_.html` (the only canonical color/UI source)

---

## Hard cuts (do not build, do not stub, do not scaffold)

### Old 57-screen scope

- All 86 files in `persona-worker/` outside `MVP_V2_ALIGNED_PLAN.md` and `00_INDEX.md` are **reference only** — do not implement them.
- Only the 17 screens in `MVP_V2_ALIGNED_PLAN.md §2` ship. Everything else is deferred.

### Tabs / navigation

- **Chat tab** — deleted. Replaced by tap-to-call (`tel:` link) from Assignment Detail and Notifications rows.
- **Pay tab** — deleted. Earnings summary folds into History tab.
- **Decision inbox** — deleted. Notifications list covers it.
- Old 5-tab layout (Today / History / Pay / Chat / Me) — rolled back to V2's 3 tabs (Home / History / Profile).

### Onboarding / verification

- **Aadhaar UIDAI verification** — HR collects offline. No `User.aadhaarHash`, no UIDAI integration.
- **Bank account NPCI penny-drop** — HR types IFSC + account on admin side. No `Worker.bankAcctEncrypted`.
- **Face enrollment** — deleted. No selfie capture, no face-match.
- **Training modules** — deleted. No completion tracking, no `WorkerTrainingCompletion` table.
- **Multi-page DPDP consent carousel** — replace with one consent screen at first run (`ConsentLog` row).

### Chat / messaging

- **Voice messages** — deleted (Critic-Field-Ops F-voice-default-on; safety risk for women workers).
- **Worker chat (T9)** — deleted. Tap-to-call only.
- **Read receipts, typing indicators, DND policy** — deleted.

### Dispute / grievance

- **Dispute UX** — deleted. Grievance form covers everything.
- **External ombuds** — deleted (P1 if regulator asks).
- **Confidentiality picker on grievance** — deleted.
- **Date-window restriction on grievance** — explicitly NOT enforced; payday-discovery grievances must work back ≥90 days.

### Site / assignment

- **Site rules viewer** — deleted. Supervisor briefs verbally.
- **Issue capture screen** — deleted. Grievance form covers post-visit issues.
- **Pre-checkin brief screen** (`09_pre_checkin_brief.md`) — deleted; folds into Assignment Detail.

### Leave / swap / replacement

- **Multi-day leave** — single-day only at MVP.
- **Urgency-tiered swap / emergency-bypass** (F-31) — deleted. Workers call supervisor when sick.
- **Replacement-invite full-screen takeover with 120s countdown ring** — deleted. List row + 5-min server TTL only.
- **`WorkerDispute` table** — deleted. `Grievance` replaces it.

### QR / location

- **Full QR infrastructure** — deferred until first site requests it. No QR scan screen wired by default (conditional on site flag only).
- **`expo-task-manager`, `expo-background-fetch`** — deleted. Foreground sync only at MVP.

### Telemetry / storage

- **PostHog** — deleted. Sentry custom events only.
- **MMKV migration** (and MMKV encryption) — deleted. AsyncStorage stays.
- **`expo-secure-store` for full session migration** — keep for tokens only; do not migrate broader state.

### Visual / theming

- **Theme picker (4-preset HSL Default/Dim/Warm/Bright)** — deleted. Auto-respect OS `Appearance.colorScheme`.
- **Plus Jakarta Sans** — swap to Inter + Noto Sans Devanagari + Noto Sans Telugu.
- **Lucide icons** — use existing `@axhy/ui-native` icons.

### Account / data

- **Self-service account delete** — email `support@axhy.app` instead.
- **Self-service data export** — email `support@axhy.app` instead.
- **Team directory** — deleted.
- **Emergency contact fields** — deleted.
- **App lock (PIN / biometric)** — deleted.

### Endpoints cut (vs 70 in `10_API_ENDPOINTS.md`)

All chat endpoints, all dispute endpoints, all decision-inbox endpoints, all training endpoints, Aadhaar verify, bank verify, face enroll, account-delete, self-data-export, team directory, payroll statement PDF, incident report (folds into grievance), all QR endpoints (except scan helper if/when a site enables it), missed-call OTP, membership switch, kill-switch, brief-ack, decisions-ack, escalate-to-hr, site rules, look-later.

### Tables cut (vs 11 in `09_DATABASE_SCHEMA.md`)

`WorkerAccountStatus`, `ReplacementInviteResponse`, `WorkerNotificationsRead`, `WorkerDispute`, `WorkerIncident`, `WorkerOnboardingChecklist`, `WorkerTrainingCompletion`, `WorkerVoiceCapture`. Column extensions: `Worker.bankAcctEncrypted`, `Worker.emergencyContact*`, `Worker.appLockEnabled`, `Worker.themePreference`.

### State machines cut (vs 6 in `11_STATE_MACHINES.md`)

Client-side simulation of `WorkerState`, `LeaveRequestState`, `SwapRequestState`, `AssignmentState`. Worker app **reads server state**; never simulates. Only `VisitState` + `ReplacementInviteState` run client-side.

### Phase cuts (vs `26_ROLLOUT_PLAN.md`)

Phase 3 (5 companies) and Phase 4 (25 companies) are deleted from the MVP-aligned plan. Re-plan after pilot data lands. Schedule: 6 weeks build + 2 weeks pilot, not 20.

---

## What this means for AI behavior

1. If any user-visible request implies a cut feature, surface the cut + ask before building.
2. If a code review or panel suggests "while you're here, add X" and X is on this list → reject with a pointer to this doc.
3. If a critic agent re-raises a cut feature in Round 2, route to founder for explicit override.
4. `check_before_edit` intent text for any worker file MUST include "MVP cut list verified" if the change touches a screen/endpoint/table boundary.

---

**Last modified:** 2026-05-21. **Owner:** founder. **Locked:** yes — modifications require explicit founder sign-off in a constitutional session.
