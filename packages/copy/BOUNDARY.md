# @axhy/copy — BOUNDARY

## Owns
- i18n catalogs in three locales (en, hi, te)
- Content style guide (plain English, no jargon)
- Approved phrases for state transitions ("On the way" not "In transit")
- Approved error tones
- Worker-facing vs admin-facing copy split

## Does NOT own
- UI components
- Translation infrastructure (i18next ships in apps)
- Copy edits to legal docs (those live in `docs/`)

## Internal dependencies
**ZERO.** Pure JSON catalogs.

## Who imports this
- `apps/admin-web`
- `apps/mobile`
- `@axhy/errors` — for translated error messages

## Lineage anchor
Master plan §E (content rules). ADR-0017 — Centralized copy catalog.
