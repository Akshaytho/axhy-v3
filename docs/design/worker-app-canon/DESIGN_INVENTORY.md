[ORCHESTRATOR_EXCEPTION] inventory doc must stay in-session — drives subsequent implementation decisions; spawning a subagent to write a markdown summary I already authored in head would be silly.

# Worker App Canon — Design Inventory

Source: `Axhy Worker App.html` + companion JSX (`worker-screens.jsx`, `phone-atoms.jsx`, `tokens.css`).
Captured 2026-06-01 from Claude Design handoff bundle `axhyv3-2`.

## Screens present (9 total)

| #   | Component                             | One-liner                                                                                                                                                                                                                                                              |
| --- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `WorkerToday`                         | Home: greeting, sync chip, big "Next site" ink card with terracotta CTA "Scan QR · check in", 3-stat strip (Done / Planned / Avg score), Today's plan list with NEXT badge                                                                                             |
| 2   | `WorkerQRScan`                        | Black overlay viewfinder, terracotta site pill, 240x240 cut-out with corner brackets + scan line, "Skip QR" pill button                                                                                                                                                |
| 3   | `WorkerCamera` (mode=before / after)  | Faux camera viewfinder, rule-of-thirds grid, BEFORE/AFTER pill (terracotta vs ok-green), site strip, photo counter "PHOTO N OF M", flash OFF, GPS-locked chip, 78px terracotta shutter, gallery thumb with count, photo-dots row, ink "Review photos" CTA when min met |
| 4   | `WorkerGallery` (mode=before / after) | Back arrow + title + count chip, 2-col grid of photo tiles with left terracotta/ok border + number badge + delete X, "+ take more" dashed tile, ink CTA "Confirm — start cleaning"                                                                                     |
| 5   | `WorkerTimer`                         | Top-bar with home + "Cleaning in progress" pill, large 240px terracotta progress ring with mm:ss in center, "ELAPSED · 42% OF SLOT" mono caption, GPS card "26 POINTS COLLECTED", site name, big terracotta CTA "Done — take AFTER photos"                             |
| 6   | `WorkerFinalReview`                   | Back arrow + title, stats card (Photos / Duration / GPS), BEFORE/AFTER label row, 4 paired tiles with left border accent, fixed CTA "Submit for verification" + "AI will verify within 30 seconds" hint                                                                |
| 7   | `WorkerSuccess`                       | Concentric rings burst with terracotta check, "Site verified" title, score card (AI VERIFICATION SCORE / 92/100 / Excellent work / stats row), terracotta "SITE COMPLETED · WORK LOGGED" strip, "Back to home" outline button                                          |
| 8   | `WorkerHistory`                       | "History" title + "May 2026" mono caption, week selector, summary card, vertical timeline rail of visit cards with scored chip                                                                                                                                         |
| 9   | `WorkerProfile`                       | Full-bleed header card with 80px avatar circle (terracotta-soft), name + phone, "Verified" ok pill, performance card, stats row, Synced card, APPEARANCE preset chips, "Member since … / Axhy v1.0.0" footer                                                           |

Bottom tabs (`WTabs`) on Home / History / Profile: **Today / Capture / History / You** — active terracotta, inactive ink-3.

## Palette (verbatim from tokens.css)

- `--paper: #f6f1e8`, `--paper-2: #efe7d8`, `--paper-3: #e6dcc8`, `--card: #fdfaf3`, `--card-edge: rgba(40,30,20,0.08)`
- `--ink: #1a1612`, `--ink-2: #4a3f33`, `--ink-3: #7a6b58`, `--ink-4: #a89880`
- `--accent: #c0492a`, `--accent-2: #a83d20`, `--accent-soft: #f5dac9`, `--accent-ink: #6e2410`
- `--ok: #4a7c59`, `--ok-soft: #d6e5d0`, `--warn: #b8860b`, `--warn-soft: #f0e2b6`, `--bad: #a8341d`, `--bad-soft: #f0c8bd`
- Camera overlay base: `#1a1612` with `#2a221a` viewport tint

1:1 match to `@axhy/ui-tokens` — no token changes required.

## Typography

- Body / UI: `Inter` (Noto Sans Devanagari fallback)
- Mono (time, GPS, photo counts, badges, scores): `JetBrains Mono`
- Scale: display 56–64, heading 22–28, body 14–15, mono caption 10–13 (letterSpacing 0.08–0.1em, uppercase)

## Spacing

4 / 6 / 8 / 12 / 14 / 16 / 18 / 20 / 24 / 28 / 32 — maps onto `tokens.space[1..7]`.

## Reusable components

- `WPhone` shell, `WTabs` (4-tab bottom), `WCard` (card surface + edge + r3), `WGlyph` (single-line SVG), `TimerRing` (SVG circle dashoffset), `Avatar`, tag pills.

## Navigation

- Bottom 4-tab bar on Home / History / Profile. No tab bar inside capture flow.
- Capture tab launches QR-scan directly. No sidebar in the canon.

## States covered

Sync pill, capture states implicit in screens 2–7, History day selection states, photo-counter under-min vs met, gallery with photos vs empty, score thresholds (≥80 accent vs <80 warn).

## States NOT shown by design

Loading skeletons, error states, empty Home, "Account paused" (`worker.state ∈ {ON_SUSPENSION, BLOCKED}`), offline sync variants, AI verification failure / retake, Visit Detail, auth flow, Leave / Swap / Replacement / Settings deep pages.
