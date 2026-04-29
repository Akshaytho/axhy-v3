# @axhy/ui-native — BOUNDARY

## Owns
- React Native Reusables-style components customized for Axhy brand
- Built on RN primitives, gesture handler, reanimated
- 48pt minimum tap targets (locked)
- expo-keep-awake integration helpers for work screens

## Does NOT own
- Screens (those live in `apps/mobile/app/*`)
- Business logic
- Voice recording (lives in `apps/mobile`)

## Internal dependencies
- `@axhy/ui-tokens`

## Who imports this
- `apps/mobile` — only consumer

## NEVER imports
- `@axhy/ui-web` — strict separation between web and native components

## Lineage anchor
ADR-0016 — RN Reusables (shadcn-for-RN) for mobile UI.
