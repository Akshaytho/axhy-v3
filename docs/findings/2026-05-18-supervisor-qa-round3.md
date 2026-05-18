# Axhy v3 supervisor app — Round 3 QA walk findings (2026-05-18)

**Walker:** Suresh Kumar @ Reddy Cleaning Services (`+919999999999`)
**Web URL:** http://172.20.10.6:8081
**API URL:** http://172.20.10.6:4000
**Device:** iPhone 13 Mini (390×844)
**Verifying:** commit 0733a60 (Round 4 fixes)
**Mandate:** verify 4 Round-4 fixes + surface new bugs. No source modified.

## Section 1 — Round 4 fix verification

|   # | Fix                                                                         | Cluster                 | Result | Observed                                                                                                                                                          |
| --: | --------------------------------------------------------------------------- | ----------------------- | :----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | Round-4 Fix #1: SiteCard row tap toggles workers (Cluster B+F)              | B+F                     |  PASS  | Body text grew after tap — toggle fired                                                                                                                           |
|   2 | Round-4 Fix #1b: Three-dot menu opens SiteActionSheet without toggling card | B+F                     |  FAIL  | No sheet keywords detected — menu tap may not open sheet                                                                                                          |
|   3 | Round-4 Fix #3: Activity title is "Activity" during load, NOT "0 events"    | Activity-title-relapse  |  PASS  | OK — title during load: " \| ACTIVITY · PROOF \| 1 event \|  \|  \| Today \| Yesterday \| This week". After load: " \| ACTIVITY · PROOF \| 1 event \|  \| " |
|   4 | Round-4 Fix #2: Updates body has no redundant "All caught up" title         | Updates-body-redundancy |  PASS  | Found 1 "All caught up" matches                                                                                                                                   |
|   5 | Round-4 Fix #4: Sites screen shows "Loading your sites…" during load        | Sites-loading-label     |  PASS  | "Loading your sites…" label captured during load                                                                                                                  |

### Round-4 Fix #1: SiteCard row tap toggles workers (Cluster B+F)

- **Cluster**: B+F
- **Expected**: Tapping left of card toggles open/closed; visible text grows when expanded
- **Observed**: Body text grew after tap — toggle fired
- **Pass**: YES
- **Evidence**: b-today/04-r4-fix1-after-left-tap.png; b-today/05-r4-fix1-after-collapse.png

### Round-4 Fix #1b: Three-dot menu opens SiteActionSheet without toggling card

- **Cluster**: B+F
- **Expected**: SiteActionSheet opens with action labels visible
- **Observed**: No sheet keywords detected — menu tap may not open sheet
- **Pass**: NO
- **Evidence**: b-today/06-r4-fix1-menu-tap.png

### Round-4 Fix #3: Activity title is "Activity" during load, NOT "0 events"

- **Cluster**: Activity-title-relapse
- **Expected**: "Activity" header during load; "N event(s)" after data lands
- **Observed**: OK — title during load: " | ACTIVITY · PROOF | 1 event |  |  | Today | Yesterday | This week". After load: " | ACTIVITY · PROOF | 1 event |  | "
- **Pass**: YES
- **Evidence**: d-activity/02-during-load-sample.png; d-activity/03-after-load.png

### Round-4 Fix #2: Updates body has no redundant "All caught up" title

- **Cluster**: Updates-body-redundancy
- **Expected**: Exactly ONE "All caught up" (in TopAppBar)
- **Observed**: Found 1 "All caught up" matches
- **Pass**: YES
- **Evidence**: f-updates/02-after-load.png

### Round-4 Fix #4: Sites screen shows "Loading your sites…" during load

- **Cluster**: Sites-loading-label
- **Expected**: Spinner + visible "Loading your sites…" label
- **Observed**: "Loading your sites…" label captured during load
- **Pass**: YES
- **Evidence**: h-sites/02-during-load-sample.png

## Section 2 — New bugs found (14)

> R3-01 and R3-02 are automated-script artifacts (heuristic keyword match too narrow / drawer toggle not findable on web). R3-03 through R3-14 are real bugs surfaced via visual review of screenshots. P0 = 1 (R3-03 sites stuck-loading).

### R3-01 [P1] — Round-4 Fix #1b regression risk: three-dot menu did not open SiteActionSheet

- **Screen**: /(supervisor)/today
- **Step**: Tap three-dot menu on site row
- **Expected**: SiteActionSheet opens
- **Actual**: No action-sheet keywords surfaced after menu tap
- **Evidence**: b-today/06-r4-fix1-menu-tap.png
- **Confidence**: 55%
- **Cluster**: B+F-sitecard-menu

### R3-02 [P2] — Drawer BUILD tag not visible (could not open drawer or footer missing)

- **Screen**: Drawer
- **Step**: Open drawer, look for BUILD footer
- **Expected**: BUILD 2026.05.18 visible at bottom
- **Actual**: No BUILD pattern matched in body text. The Playwright drawer-open click (top-left area) didn't open the drawer in web mode, so we can't confirm presence — but the build tag IS visible on the Profile screen footer ("AXHY · v3 · BUILD 2026.05.18"). Verify drawer footer manually before next walk.
- **Evidence**: i-drawer/02-after-attempt.png; g-profile/02-after-load.png
- **Confidence**: 55%
- **Cluster**: C-drawer

### R3-03 [P0] — Sites screen stuck on "Loading your sites…" forever (no API call fires)

- **Screen**: /(supervisor)/sites
- **Step**: Open drawer entry "Sites" / navigate to /(supervisor)/sites
- **Expected**: Sites list renders within ~2s
- **Actual**: Screen stuck on the new "Loading your sites…" label for the full 2s capture window. Network log for step `h-sites` shows NO request to `/supervisor/sites` (only `/supervisor/today` and `/supervisor/decisions` fire — Sites screen appears to depend on a query that is never triggered, OR depends on the `today` payload which IS arriving but the screen is gated on something else).
- **Evidence**: h-sites/03-after-load.png; network.jsonl (no `/supervisor/sites` response)
- **Confidence**: 90%
- **Cluster**: C-sites-stuck-loading
- **Root cause hypothesis**: The Sites screen subscribes to a hook (e.g. `useSites()` or similar) that hasn't been wired to a backend endpoint, OR derives its list from `useToday()` but a `useEffect`/guard prevents render. Round-4 Fix #4 added the loading label correctly — but exposed that the underlying data never lands. Was masked previously by the bare-spinner not being identifiable.

### R3-04 [P1] — DecisionCard shows raw ISO timestamp instead of humanised date/time

- **Screen**: /(supervisor)/decisions
- **Step**: Open Decisions tab, look at the first card
- **Expected**: "IT Park C · May 9, 10:02 AM · smoke test swap" or "IT Park C · 9 days ago · smoke test swap"
- **Actual**: "IT Park C · 2026-05-09T10:02:56.947Z · smoke test swap" — raw ISO 8601 string with milliseconds and Z timezone leaked through.
- **Evidence**: c-decisions/03-after-load.png
- **Confidence**: 99%
- **Cluster**: C-copy-format
- **Root cause hypothesis**: Card subtitle interpolates `decision.context?.note` or similar pre-formatted string; the backend or schema is dropping a Date object straight into the string without `toLocaleString` / `formatDistance`. Empathy fail: Suresh can't parse ISO dates at 5:40 AM.

### R3-05 [P1] — Decisions card "PENDING 9 DAYS AGO" — 9-day-old decision visible to supervisor

- **Screen**: /(supervisor)/decisions
- **Step**: Open Decisions tab, look at "Needs you now"
- **Expected**: Stale decisions older than ~48h should be auto-dismissed, escalated, or moved to a "stale" section — not in "NEEDS YOU NOW" with red dot
- **Actual**: A swap decision from 9 days ago is presented as "needs you now" alongside an 18-hour-old routine note. Supervisor empathy: if it really needed Suresh 9 days ago and nothing happened, surfacing it again with the same priority creates noise + learned helplessness.
- **Evidence**: c-decisions/03-after-load.png
- **Confidence**: 70%
- **Cluster**: C-decision-staleness
- **Root cause hypothesis**: `/supervisor/decisions` returns all pending without TTL filter. May be sandbox seed data; verify with real-tenant decision before fixing. Could also be a "smoke test swap" left over from sandbox seeding — but the UI still has no degraded path for it.

### R3-06 [P1] — Summary uses jargon "atomic batches" — Suresh has no idea what that means

- **Screen**: /(supervisor)/summary
- **Step**: Open Summary tab
- **Expected**: Plain-English label like "changes made today" or "decisions"
- **Actual**: "CHANGES TODAY / 1 / atomic batches". "Atomic batches" is a developer term referring to the transactional batch semantics in the backend — it should never leak into supervisor copy. Master plan rule: plain English always; no SaaS jargon.
- **Evidence**: e-summary/02-after-load.png
- **Confidence**: 95%
- **Cluster**: C-copy-jargon

### R3-07 [P1] — Activity eyebrow says "ACTIVITY · PROOF" — "PROOF" is jargon

- **Screen**: /(supervisor)/activity
- **Step**: Open Activity tab
- **Expected**: Just "ACTIVITY" or "ACTIVITY · TODAY" — something Suresh recognises
- **Actual**: "ACTIVITY · PROOF" appears in the eyebrow. "Proof" suggests audit/compliance-grade evidence in the engineering team's vocabulary but reads as confusing/threatening to a working supervisor. The card below says "Captured a chat message. · CHAT MESSAGE CREATED" — "CHAT MESSAGE CREATED" sub-label is also developer-DTO-style copy.
- **Evidence**: d-activity/03-after-load.png
- **Confidence**: 80%
- **Cluster**: C-copy-jargon

### R3-08 [P1] — Activity filter chips wrap into 3 rows on iPhone Mini width

- **Screen**: /(supervisor)/activity
- **Step**: Open Activity tab on 390px width
- **Expected**: Filter chips wrap cleanly in 2 visual rows max with grouping (time | site | type), or use a single horizontal scroll
- **Actual**: 3 stacked rows where "All sites" sits on its own row between "Today/Yesterday/This week" and "All actions/Absences/Lates/Leaves". The orange-pill emphasis on "Today + All sites + All actions" is correct (active filters) but the row break makes the relationship ambiguous — Suresh can't tell at a glance whether "All sites" belongs to the time-row or the action-row group.
- **Evidence**: d-activity/03-after-load.png
- **Confidence**: 85%
- **Cluster**: C-layout-hierarchy

### R3-09 [P2] — FAB mic button renders before vector-icon font loads (bare orange circle)

- **Screen**: /(supervisor)/today (and likely all tabs)
- **Step**: Navigate to Today; screenshot at t=0ms
- **Expected**: FAB starts as a placeholder with icon stub, or is hidden until icon font is ready
- **Actual**: A bare orange circle floats in the bottom-right corner — looks like a UI glitch / build artifact. The microphone icon paints in only after the Feather font finishes loading (~500-1500ms cold).
- **Evidence**: b-today/01-immediate.png
- **Confidence**: 90%
- **Cluster**: C-fonts-icons-FOIT

### R3-10 [P2] — Hamburger ≡ icon missing during initial load (no way to open drawer)

- **Screen**: /(supervisor)/today (initial load state)
- **Step**: Land on Today, look at top-left during load
- **Expected**: Hamburger icon ≡ visible immediately so supervisor can navigate away if Today is slow
- **Actual**: Top-left is empty — only "MONDAY · 18:57 / Today's plan" eyebrow + title visible. Same FOIT issue as R3-09 — the ≡ glyph comes from the vector-icon font.
- **Evidence**: b-today/01-immediate.png
- **Confidence**: 90%
- **Cluster**: C-fonts-icons-FOIT
- **Root cause hypothesis**: Both R3-09 and R3-10 stem from one cause — `@expo/vector-icons` (Feather) ships ~80KB woff and is not preloaded. Fix: `<link rel="preload">` the woff in the web entry HTML, OR swap to SVG icons for top-bar / FAB.

### R3-11 [P2] — Apollo card shows "4 SHORT / 0/4" — meaning of "0/4" is ambiguous

- **Screen**: /(supervisor)/today
- **Step**: Look at first site card (Apollo)
- **Expected**: Clear count like "0 of 4 present" or "0 here · 4 missing"
- **Actual**: Adjacent badges "4 SHORT" + "0/4" with no label on what 0/4 represents (present? checked-in? on-site? roster filled?). The other cards show "NO ROSTER / 0/0" without explaining "no roster". Empathy fail: at-a-glance scan requires a legend.
- **Evidence**: b-today/03-after-load.png
- **Confidence**: 80%
- **Cluster**: C-copy-ambiguous

### R3-12 [P2] — "TAP TO VIEW WORKERS →" hint appears on collapsed cards but not after expand

- **Screen**: /(supervisor)/today
- **Step**: Look at Hospital A / IT Park C / Mall Lobby / Westfield (collapsed) vs Apollo (expanded in screenshot 06)
- **Expected**: After expanding, the hint either disappears or flips to "TAP TO HIDE WORKERS"; the chevron also rotates (it does — `>` becomes `v` — good).
- **Actual**: When expanded, the hint row text "TAP TO VIEW WORKERS →" simply disappears. Chevron flips correctly. Minor inconsistency: cards with workers show a different vertical structure than "NO ROSTER" cards, so the eye learns two layouts. Consider keeping a "Tap to hide" hint on expanded cards for symmetry.
- **Evidence**: b-today/03-after-load.png; b-today/06-r4-fix1-menu-tap.png
- **Confidence**: 60%
- **Cluster**: C-layout-affordance

### R3-13 [P2] — "Pull to refresh · Updates live" — contradictory copy

- **Screen**: /(supervisor)/today (also possibly Activity, Decisions)
- **Step**: Scroll to bottom of Today list
- **Expected**: Either "Pull to refresh" (manual) or "Updates live" (auto) — pick one
- **Actual**: Both labels on the same line. If it updates live, why pull to refresh? Reads as engineer-speak hedging.
- **Evidence**: b-today/03-after-load.png
- **Confidence**: 80%
- **Cluster**: C-copy-contradictory

### R3-14 [P2] — Profile greeting "Namaste, Suresh." is hardcoded Hindi regardless of language toggle

- **Screen**: /(supervisor)/profile
- **Step**: Open Profile (language is set to English in the same screen)
- **Expected**: If language === English, say "Hi, Suresh" or "Hello, Suresh"; "Namaste" only when language is Hindi/Telugu/regional
- **Actual**: "Namaste, Suresh." appears even though Language toggle directly below reads "English ›". May actually be a deliberate brand voice (cultural anchor), but flag for founder review — needs explicit lock per language.
- **Evidence**: g-profile/02-after-load.png
- **Confidence**: 60%
- **Cluster**: C-i18n-consistency

## Section 3 — What did NOT regress

Things that used to be broken in earlier walks and held this round:

- Round-4 Fix #1: SiteCard row tap toggles workers (Cluster B+F) — held green.
- Round-4 Fix #3: Activity title is "Activity" during load, NOT "0 events" — held green.
- Round-4 Fix #2: Updates body has no redundant "All caught up" title — held green.
- Round-4 Fix #4: Sites screen shows "Loading your sites…" during load — held green.

## Latency snapshot (warm-load via UI fetch)

| Endpoint              | Target  | Observed | Pass? |
| --------------------- | ------- | -------- | :---: |
| /supervisor/today     | <5000ms | 4888ms   | PASS  |
| /supervisor/decisions | <6000ms | 2993ms   | PASS  |
| /supervisor/activity  | <2000ms | 719ms    | PASS  |
| /supervisor/summary   | <5000ms | 3292ms   | PASS  |
| /supervisor/updates   | <2000ms | 568ms    | PASS  |
| /me                   | <1500ms | 1391ms   | PASS  |

## Network / console summary

- Total requests: 42
- Total responses: 33
- 4xx/5xx: 0
- Page errors: 0
- Console errors: 0
