# Bug Log — Worker + Supervisor Production-Release QA Walk

Date: 2026-06-05
Target env: emulator app (`app.axhy.mobile`, dev client) → local Fastify backend on host `192.168.1.6:4000` → **Railway prod DB** (`switchback.proxy.rlwy.net`, real data). `OTP_BYPASS=1`, `NODE_ENV=development`.
Method: QA Enterprise Walk SOP — four-layer verification, capture-don't-fix, RCA cluster + batch fix.
Demo supervisor: `+919900112233` / OTP `123456` ("Emulator Demo Co").

> Discipline: log every issue here with severity + evidence. **Do NOT fix mid-walk.** RCA after the full pass.

---

## Verified GREEN this session (closes prior pending items)

- **Notification prefs persistence** (supervisor `me.tsx`) — 4-layer PASS. UI showed persisted `{push:false}`; toggled Push ON → optimistic; `GET /me` returned `{push:true,whatsapp:true,email:true}` (DB write confirmed); full `am force-stop` + relaunch → Push still ON (server is the only post-kill source). Screenshots `02-current`,`03-push-toggled`,`04-reload-profile`.
- **Supervisor Memory & rules screen** (`memory.tsx`) — 4-layer PASS. `GET /supervisor/living-doc` → `{siteRules:2,workerNotes:1,recurringTasks:1,clientPreferences:0,freeNotes:0}`; UI renders exactly those sections (empty sections hidden), Company/Private chips correct, honest loading→loaded, no fabricated counts. Screenshot `06-memory-loaded-3`.

---

## BUG LOG

### BUG-001 [supervisor/drawer + profile] [low] version string inconsistency

- Symptom: Drawer footer shows `AXHY · v0.0.1`; Profile screen footer shows `AXHY · v3 · BUILD 2026.05.18`. Two different hardcoded version/build strings.
- Layer: UI
- Severity: low (cosmetic, but a hardcoded stale build date is a doc-truth smell E10)
- Evidence: `05-drawer.png` footer vs `02-current.png` footer; `apps/mobile/app/(supervisor)/me.tsx:583` `AXHY · v3 · BUILD 2026.05.18`.
- Suspected cause: build label hardcoded in `me.tsx` rather than read from app config/version.

<!-- append findings below -->
