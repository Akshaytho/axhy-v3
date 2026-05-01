# @axhy/supervisor-preview — BOUNDARY

## Purpose

Web-based preview of the supervisor mobile app for founder/sales evaluation. NOT customer-facing. NOT the production supervisor app.

The real supervisor app eventually lives in `apps/mobile/` (RN + Expo), shipped as the worker/supervisor/owner unified mobile app. This preview is the bridge — gives the founder a clickable web prototype to FEEL the supervisor flow before committing to the polished Claude Design + RN implementation.

## Owns

- Phone-frame web layout simulating mobile (375×812 viewport)
- 5 supervisor-app tabs (Chat / Today's Plan / Summary / Updates / Profile)
- Mock data file (sample sites, workers, decisions, HR updates)
- All 4 decision-tier confirmation UIs (NOTE / OPERATIONAL / PERSONNEL / EMPLOYMENT)
- All 5 personal-rule sections in Profile tab
- Demo controls (time-of-day rewind, one-handed-test overlay)
- Phone-grade microcopy in code-switched English/Hindi/Telugu pattern

## Does NOT own

- Real backend calls (no fetch to `apps/backend/`)
- Real AI calls (scripted chat responses only)
- Authentication (open URL, no login required)
- Database connections
- Production-grade RN implementation (lives in `apps/mobile/` later)
- Marketing pages (those are `apps/admin-web/`)

## Deployment

Separate Railway service `supervisor-preview` (panel-locked Railway-only hosting). Reachable at its own URL. Not pointed at axhy.app.

## Lineage

- Master plan §G iteration #5 (supervisor mobile)
- panel-2026-05-01 (supervisor profile + 5 personal-rule sections + emotional-experience prototype)
- feedback_no_ui_code_without_panel_approval.md (Iteration 4 quality bar applies — no hardcoded values, audience-tuned UX)
