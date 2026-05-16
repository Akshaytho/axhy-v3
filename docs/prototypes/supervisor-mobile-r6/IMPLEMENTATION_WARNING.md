# ⚠️ FROZEN DESIGN PROTOTYPE — DO NOT IMPORT

This folder contains a frozen design prototype bundle exported from `claude.ai/design` on 2026-05-12.

**Companion spec:** [`../../specs/2026-05-12-supervisor-mobile-r6-design.md`](../../specs/2026-05-12-supervisor-mobile-r6-design.md) — currently Status: Draft.

## Do NOT:

- Import any file from `project/src/` into `apps/*`. These are design artifacts, not buildable code. Implementation builds match the visual output; they do not import this JSX.
- Edit files here to "improve" the design. The bundle is frozen. New iterations should produce a new dated prototype folder (e.g. `supervisor-mobile-r7`).
- Render the prototype as authoritative output. Read the source directly per the bundle's own `README.md`.

## What's here

- `README.md` — original handoff bundle README from claude.ai/design
- `project/Supervisor mobile.html` — rendered HTML output
- `project/src/*` — 16 files: React JSX components (10 screens), CSS tokens, demo data, icons, app shell

## What's NOT here

- The redacted chat transcript (`chats/chat1.md` in the original snapshot) was excluded — content was 99% `_[tool: snip]_` placeholders with near-zero narrative value.

## Iteration trail

R3 (2026-05-11) → R4 → R5 → R6 (2026-05-12). See the companion spec §3 for iteration-by-iteration change list.

## Original snapshot location

`/Users/thotaakshay/eclean_workspace/_supervisor-design-r6-snapshot-2026-05-12/` — preserved outside the repo as the immutable export. Founder may delete that folder after this in-repo copy is reviewed.
