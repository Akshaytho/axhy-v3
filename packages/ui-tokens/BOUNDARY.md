# @axhy/ui-tokens — BOUNDARY

## Owns
- Brand color tokens (Axhy gold-A `#D4AF37`, OLED black `#000000`, semantic colors)
- Typography tokens (Inter for body, JetBrains Mono for numbers)
- Spacing scale, border-radius scale, shadow scale, motion timing
- Tap target minimums (48pt mobile, 40pt web)
- Generators: emit Tailwind theme + RN StyleSheet from token JSON

## Does NOT own
- Components (those live in `ui-web` and `ui-native`)
- Layout primitives
- Icons (Lucide ships separately)

## Internal dependencies
**ZERO.** Pure data + generators.

## Who imports this
- `@axhy/ui-web` — generates Tailwind theme
- `@axhy/ui-native` — generates RN StyleSheet
- Tailwind config in `apps/admin-web`

## Lineage anchor
Master plan §E (rebrand decisions). ADR-0014 — Token-driven design system.
