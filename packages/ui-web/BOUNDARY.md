# @axhy/ui-web — BOUNDARY

## Owns
- shadcn/ui-style components customized for Axhy brand
- Built on Radix Primitives + Tailwind
- Atoms (Button, Input), molecules (Card, Toast), organisms (DataTable)
- Storybook stories for each component

## Does NOT own
- Pages or routes (those live in `apps/admin-web/app/*`)
- Business logic
- Data fetching (use TanStack Query hooks from `@axhy/api-client`)

## Internal dependencies
- `@axhy/ui-tokens`

## Who imports this
- `apps/admin-web` — only consumer

## Lineage anchor
ADR-0015 — shadcn/ui (own-the-code) over Material UI.
