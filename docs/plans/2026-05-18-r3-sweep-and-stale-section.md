# R3 sweep + STALE section + Cluster A re-eval — plan

**Date:** 2026-05-18 | **Author:** Claude (Opus 4.7) | **Founder approval pending**

## Context

Round-3 QA walk landed `ff7a4fe` (4 empathy copy fixes). Round-3 surfaced ~10 remaining items + 2 founder-locked product calls. The Cluster A "decisions endpoint perf rewrite" from the Sprint-2 deep-review needs re-evaluation because warm-load measured 2993ms (passes 6000ms target).

## What the founder locked 2026-05-18

1. **R3-14 Namaste brand anchor** — `feedback_namaste_brand_anchor.md`. Never localise greetings. **No code change** — current behaviour is correct.
2. **R3-05 STALE section after 48h** — `feedback_stale_decisions_section_after_48h.md`. New section between NEEDS_YOU_NOW/ROUTINE and FAILED_REVIEW for items > 48h old.

## Slices

### Slice 1 — R3 P1/P2 cosmetic sweep (~30 min, ship as one commit)

| Item                              | Surface                     | Fix                                                                                                                                        |
| --------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| R3-08 filter chips wrap           | `activity.tsx` chip row     | Group time chips + site chip + action chips into 2 visual rows max; if overflow → horizontal scroll on action row                          |
| R3-09 FAB icon FOIT               | `app/_layout.tsx` web entry | Preload `@expo/vector-icons` Feather woff via `<link rel=preload>` so the FAB renders with icon on first paint                             |
| R3-10 hamburger ≡ FOIT            | same fix as R3-09           | One change covers both                                                                                                                     |
| R3-11 "0/4" badge ambiguous       | `SiteCard.tsx`              | Replace bare "0/4" with "0 of 4 here" — explicit, ~5 chars wider, no hidden meaning                                                        |
| R3-12 expand affordance asymmetry | `SiteCard.tsx`              | When expanded, change "TAP TO VIEW WORKERS →" hint to "TAP TO HIDE WORKERS ↑" (symmetry) — or drop the hint entirely on expanded (simpler) |

**Verification:** typecheck + visual diff on Today/Activity + 4th walk

### Slice 2 — STALE section (medium, founder-locked)

**Backend:**

- Add `'STALE'` literal to `DecisionSectionT` in `packages/shared-schema/src/decisions.ts`
- Update `SECTION_PRIORITY` in `decisions-service.ts` (NEEDS_YOU_NOW=0, ROUTINE=1, STALE=2, FAILED_REVIEW=3)
- Add `applyStaleness` helper: after sources load rows, any row with `proposedAt > 48h` ago gets section flipped to STALE
- Counts in response include `stale` field

**Mobile:**

- `decisions.tsx` renders new section between ROUTINE and FAILED_REVIEW
- `SectionHeader.tsx` adds "STALE" variant (gray, not red)
- `DecisionCard` in STALE section uses muted left-border + gray pendingTag (no red dot)

**Tests:**

- Backend: real-DB test — create decision with `proposedAt = now - 49h`, assert section=STALE; `now - 47h`, assert NOT stale.
- Mobile: Playwright snapshot of 3-section layout.

**Verification:** real-DB regression test + typecheck + 4th walk

### Slice 3 — Cluster A re-eval (skipped unless needed)

Current `/supervisor/decisions` warm-load: **2993ms**. Target was <6000ms. Passes.

**Recommend:** profile only — don't rewrite. Add `console.time` around each source's `loadRows`. If one source is >1500ms, optimise that one. If all are <500ms, the cost is parse/serialise overhead — bigger architectural change, defer.

Skip the raw-SQL UNION rewrite. The current `Promise.all` shape already gets parallel queries across the pool; rewriting to single raw SQL is a large diff with no proven win.

## Discipline gates

- [x] Empathy + simplicity lens applied to every item
- [x] Founder-locked the two product decisions in memory before planning code
- [ ] Panel review on slice 2 (STALE) before code — dispatch adversarial subagent
- [ ] Typecheck after each slice
- [ ] Walk every screen as real user after each slice
- [ ] Done-memo with spec coverage matrix at wave end

## Risks

- STALE section changes the response shape — any consumer reading `counts.routine + counts.needsYouNow` as total will be wrong. Check call sites.
- 48h cutoff is timezone-sensitive — use UTC `now - 48h` regardless of supervisor TZ to keep behavior consistent across India + future markets.
- Icon FOIT preload only works on web (Expo web entry). Native iOS/Android won't have FOIT (fonts ship in bundle).
