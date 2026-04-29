# @axhy/business-rules — BOUNDARY

## Owns
- Pure functions for pricing calculations (₹8/visit, ₹2k/mo floor, AI cost cap)
- Worker-shift eligibility checks
- Site-conflict detection
- Assignment validity rules
- Per-rule visibility ACL evaluation

## Does NOT own
- Database I/O (functions take data as inputs, return decisions)
- HTTP layer
- AI calls
- Caching

## Internal dependencies
- `@axhy/shared-schema` — for entity types

## NEVER imports
- `apps/*`
- `@axhy/ai-tools` (rules are deterministic)
- Anything with side effects

## Who imports this
- `apps/backend` — primary
- `apps/mobile` — same rules apply offline
- `@axhy/state-machines` — for guard predicates

## Lineage anchor
Master plan §B (pricing) + §G (locked rules). ADR-0008 — pure-function rules over service classes.
