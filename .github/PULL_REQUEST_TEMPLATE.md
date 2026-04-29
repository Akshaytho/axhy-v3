# Pull Request

## What changed
<!-- one sentence -->

## Why
<!-- the motivation; reference the master plan section, ADR, or panel debate -->

## Lineage
<!-- which ADR(s) does this derive from or change? -->
- Derives from: ADR-XXXX
- Affects packages: @axhy/foo, @axhy/bar
- Affects apps: apps/backend, apps/mobile

## Test plan
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated (real Postgres)
- [ ] Cross-tenant isolation asserted (if backend change)
- [ ] AI eval fixtures unchanged or improved
- [ ] Manual flow tested as the relevant persona (Mr. Reddy / Kavitha / Ravi / Suresh)

## Graph impact
- [ ] Structural graph regenerates cleanly (CI green)
- [ ] No new orphans (lineage audit green)
- [ ] No version drift on derived ADRs

## Checks
- [ ] No `any` types
- [ ] No `// TODO` / `// FIXME` left in code
- [ ] All exported symbols carry `@derives(ADR-NNNN)`
- [ ] Personal-data fields carry `@personal` annotation
