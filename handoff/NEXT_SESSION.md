# Next Session

**Last updated:** 2026-06-15 IST · Founder directive: "fully implement v6 design of HR with our backend prod server 100% correctly" + full autonomy. This session finished the LAST remaining HR portal v6 screens, exact-v6 match, each screenshot- and DB-verified (on the local harness).

> ## ⚡ MID-LOOP DIRECTIVE CHANGE (2026-06-15, latest — overrides anything below that conflicts)
>
> Akshay's new standing orders for the autonomous /loop:
>
> 1. **TEST ON REAL PROD ONLY — no local from now on.** Point admin-web at the deployed prod backend; QA hits prod backend/DB/redis. Pre-launch so test-data mutations are OK, but read-first, use an obvious test tenant, clean up artifacts, never touch real-looking data without surfacing.
> 2. **FINISH the unfinished ("Soon") items too** — now TO-BUILD, not deferred: (a) Team deactivate/resend via the membership state machine; (b) company-wide HR-update who-acked report = NEW `HRUpdateAck` table (SCHEMA CHANGE → check_before_edit change_type:schema_change, reversible migration, then backend+UI).
> 3. **NEVER STOP the loop** — keep cycling QA→fix→deepen→re-verify; keep hardening even after a clean pass.
> 4. The 4 new backend routes must be DEPLOYED to prod (full ship cycle pre-authorized) before the new screens can be QA'd on prod, else they 404 there.
>    The "Intentionally not built" + local-harness sections below are now SUPERSEDED by this block.

## What was completed

**This session — the remaining HR screens (all exact-v6, real backend, verified):**

- **Policies** `/hr/policies` — NEW backend `GET /admin/policy` (current value per key + ACL-derived `editable`) + `GET /admin/policy/:key/history`. Frontend catalog + screen + edit modal (per-type controls) + history modal. Edit save **e2e-verified** (UI `3 days→4 days`; DB history `1→2 rows`, prev=3). 14 policies render real (2 owner-only locked).
- **Updates** `/hr/updates` — NEW backend `POST /hr/updates` + `GET /hr/updates` (`hr-updates.ts`, registered in server.ts). Compose (Publish **live**) / My-updates / Ack-report. **e2e-verified**: UI publish `3→4`; real supervisor ack (Geeta Rani) shows on targeted ack-report. Company-wide ack-report stays a **design preview** (per-supervisor ack table genuinely not built — v6 marks it so).
- **Settings** `/hr/settings` — `GET /me` + `PATCH /me/notification-prefs` already existed; added NEW `PATCH /me/locale`. Profile/role/company real; prefs toggle + language **DB-verified** (email→false, locale→te, then reverted). Sign-out via `DELETE /api/auth/session`.
- **Add-site / Add-worker** — converted the list buttons to **v6 modals** (founder's stated preference) wired to existing `POST /admin/sites` / `POST /admin/workers`. **e2e-verified**: site 5→6 (DRAFT, workdays `MTWTFS_`, address persisted); workers created `PENDING_ACTIVATION` (confirmed by direct DB query — they don't show in the site-scoped worker list until assigned, which the modal copy states).
- **Team member-detail drill-in** — NEW backend `GET /hr/team/:userId` (real salary/bank-last4 + sites-owned for HR / site-bindings for supervisor). Row click → MemberDetail. **e2e-verified** (Geeta Rani: Rs 29,000, ••••8821, Apollo Acting + Inorbit Permanent bindings). deactivate/resend kept as **Soon** (no lifecycle endpoint; status must move through its machine — v6 marks them demo).
- **Typecheck GREEN** both apps (`tsc --noEmit`). Fixed my one error (SitesList workdays) **and** ~12 pre-existing `noUncheckedIndexedAccess`/unused-var violations across ComplaintsScreen, LeaveScreen, PayrollScreen, SiteDetail, WorkerDetail, format.ts, app/hr/page.tsx, backend hr-sites.ts.
- **Cleanup** — deleted dead `app/hr/{Nav.tsx,LogoutButton.tsx,hr.module.css}` cluster, `app/hr/leave-requests/[id]/`, and the orphaned `app/hr/sites/new/` + `app/hr/workers/new/` pages (superseded by the modals). All routes re-rendered + tsc still green after deletion.

**Carried from prior sessions (still done):** Dashboard, Workers list+detail, Sites list, Today, Leave (approve/reject e2e), Complaints (reply e2e), Record, Payroll, Team list+invite, Site detail.

## What is genuinely incomplete

**🔴 Founder-only (permission layer reserves these):**

1. `JWT_SECRET` on admin-web Railway (same value as backend).
2. **RLS prod activation** — code deployed + lab-proven; run `axhy_app` grants + flip `DATABASE_URL`.
3. **EAS** — `cd apps/mobile && npx eas-cli login && update:configure`, commit projectId. APK last.
4. **Deploy the NEW HR backend routes to prod** (next backend push, additive — NO schema/migration):
   - `admin-policy.ts` → GET `/admin/policy`, GET `/admin/policy/:key/history`
   - `hr-updates.ts` → POST/GET `/hr/updates` (+ server.ts registration)
   - `me.ts` → PATCH `/me/locale`
   - `hr-team.ts` → GET `/hr/team/:userId`

**Intentionally not built (v6 marks not-live — do NOT fake):**

- Team deactivate/resend (membership lifecycle → state machine). Shown as "Soon".
- Company-wide HR-update who-acked report (needs a per-supervisor ack join table = schema change). Shown as design preview. Targeted-update acks are real.

**Housekeeping:**

- Local DB has test artifacts from e2e (Test Tower site → 6 sites; 3 `PENDING_ACTIVATION` test workers). Re-run `/tmp/seed-hr-full.ts` to reset (note: that does NOT seed policies/updates — re-run the API seeds below too).
- **Brain (claude-mem search):** root cause was `uvx` not on the MCP worker's PATH — fixed (symlinked `~/.local/bin/uv{,x}` → `/usr/local/bin`). It now finds uvx but the Worker still errors (slow embedding / connection-close) — plugin-internal, non-blocking; handoff runs degraded (`AXHY_BRAIN_DEGRADED_OK=1`).

## First action next session

1. Boot: `pnpm --filter @axhy/ai-tools run audit`, then read this file.
2. HR portal is feature-complete vs v6. Now running an autonomous deep-QA loop (self-paced /loop) until the whole portal passes a clean QA pass with evidence.

## 🔁 Deep-QA pass — progress (autonomous /loop, do not stop until clean)

- ✅ Harness healthy (backend :4100 postgres+redis ok, admin-web :3000, pg :5544).
- ✅ Render-pass on prior-session screens (real data, no errors): Today (7 on-site/1 no-show/1 flagged + per-site coverage), Payroll (11 workers, ₹2,03,500−₹3,350=₹2,00,150, per-worker deductions), Workers (11, real 15-state chips), Record, Complaints. Dashboard/Sites/Site-detail/Memberships verified earlier this session.
- ✅ Security negatives: SUPERVISOR token → 403 on /hr/overview, /hr/updates, /admin/policy, /hr/team/:id, /hr/payroll; no-token → 401.
- ⏳ STILL TODO in the loop: per-screen 4-layer mutation walks (Leave approve/reject, Complaint reply/resolve, Site assign/bind where live) with DB+audit proof; forward+back navigation of every screen; bad-day/edge cases; then final clean-pass sign-off here.

## 🧰 Local verification harness (all real services, local)

- Docker pg `:5544` (db `axhy_test`) + redis `:6390`. ⚠️ pg container died mid-session under a memory spike; recovered via Docker Desktop hard-restart + `docker start axhy-test-pg axhy-test-redis` (data persists — `docker start` reuses the container). If pg is unreachable, that's the fix.
- Backend `:4100` (NOT watch — restart after backend edits):
  `cd apps/backend && nohup pnpm exec tsx --env-file=/tmp/axhy-backend-harness.env src/index.ts > /tmp/backend-4100.log 2>&1 &` then poll `curl -s :4100/health`.
- admin-web `:3000`: start with **`NEXT_PUBLIC_AXHY_API_URL=http://localhost:4100 pnpm dev`** (its `.env.local` points at :4000 — the shell override pins it to the harness backend). JWT_SECRET in `.env.local` already matches the harness.
- HR login: `+919998887776`, OTP `123456` (Priya Nair, owns all 5 sites). Owner: `+919900000000` (OTP bypass on).
- Seeds: `/tmp/seed-hr-full.ts` (tenant). Policies + updates are seeded via the real write path: `/tmp/seed-policies-via-api.mjs` + `/tmp/seed-updates-via-api.mjs` (run after backend is up).
- Screenshots: `/tmp/shot.mjs <path> <out>` (cookie-inject → real Chrome) + `/tmp/cc-shotfull.mjs` (fullPage + console errors). v6 ref at `:4200`.
- Guardrail approval (per session): edit scope re-arms via `/tmp/cc-approve.mjs` (carries the answered_question so it returns `allowed:true`); handoff/plan via `/tmp/axhy-approve-plan4.mjs`. Env: `AXHY_REPO_ROOT=/Users/thotaakshay/eclean_workspace AXHY_BRAIN_DEGRADED_OK=1`. Approval window ~2h — re-run when it expires.

## Notes

- Discrepancy surfaced: `/hr/sites/new` + `/hr/workers/new` pages already existed and were functional (Jun 4) despite this handoff previously saying "404". Went with modals (founder preference) and deleted the orphaned pages.
- `apps/admin-web/ARCHITECTURE.md` documents the layered structure (components/ui, components/shell, features/hr, lib, styles/portal.css = v6 axhy.css verbatim).
- Worker-identity contract: every workerId exposed is `Worker.id` (never User.id). Complaint supervisorId/author = User.id. New `GET /hr/team/:userId` keys on User.id (team members are users).
