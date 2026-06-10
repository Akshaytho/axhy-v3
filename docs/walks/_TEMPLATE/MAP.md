# MAP — <feature-slug> (LIVING file — feature level, NOT inside a walk folder)

> Copy this to `docs/walks/<feature-slug>/MAP.md` when a feature gets its first walk.
> This file is EDITABLE across walks (it and LOOPHOLES.md are the only living files in docs/walks/).
> Purpose: the next walk reads THIS small file instead of re-reading the whole codebase.
> Every update gets a timestamp in the change log at the bottom.

**Created:** YYYY-MM-DD HH:MM IST · **Last verified against code:** YYYY-MM-DD HH:MM IST (by walk <link>) · **Verified at commit:** <hash>

## 1. Footprint — files this feature touches (THE staleness list)

Any commit touching these paths makes the latest walk STALE.

| Kind              | Path                              | Note |
| ----------------- | --------------------------------- | ---- |
| screen            | apps/mobile/app/...               |      |
| component         | apps/mobile/components/...        |      |
| client lib/store  | apps/mobile/lib/...               |      |
| backend route     | apps/backend/src/routes/...       |      |
| service           | apps/backend/src/lib/services/... |      |
| lib/helper        | apps/backend/src/lib/...          |      |
| dispatcher/job    | apps/backend/src/dispatcher/...   |      |
| state machine     | packages/state-machines/src/...   |      |
| shared schema/zod | packages/shared-schema/...        |      |
| admin-web page    | apps/admin-web/app/...            |      |

## 2. API surface

| Route | Method | Called from (screen/file) | Auth/role gate |
| ----- | ------ | ------------------------- | -------------- |

## 3. Functions / services / external services

| Name | File | What it does for this feature | External? (R2/OpenAI/WhatsApp/Redis/...) |
| ---- | ---- | ----------------------------- | ---------------------------------------- |

## 4. DB — tables, models, key columns

| Table/model | Columns this feature writes | Columns it reads | State machine? | RLS? |
| ----------- | --------------------------- | ---------------- | -------------- | ---- |

## 5. Data flow (plain words, in order)

user action → screen → route → service → tables written → side-effects (audit/outbox/queue) → who sees the result where.

## 6. Personas / profiles connected

| Persona | Touchpoint | When |
| ------- | ---------- | ---- |

## 7. Connected features

| Feature | Direction (feeds us / we feed it) | Through what (table/route/event) |
| ------- | --------------------------------- | -------------------------------- |

## 8. Known sharp edges

Things past walks proved fragile here (timezones, races, offline, idempotency) — so the next walk re-checks them first.

## Change log (never delete lines)

| At (IST)             | By (walk/session) | What changed in this map and why |
| -------------------- | ----------------- | -------------------------------- |
| YYYY-MM-DD HH:MM IST |                   | created from template            |
