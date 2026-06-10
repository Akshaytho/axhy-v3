# LOOPHOLES — things the AI was not considering

**Created:** 2026-06-10 16:55 IST · **Last updated: 2026-06-10 16:55 IST**

## Rules for this file (founder-mandated, 2026-06-10)

1. **This is the ONLY always-editable file in docs/walks/.** Walk folders are touched only during their walk — but THIS file may be updated in the middle of ANY session, any day, the moment the founder or the AI catches a blind spot: something the AI is not considering, a check the method misses, a kind of lie a walk could be fooled by.
2. **Every entry gets a date+time (`YYYY-MM-DD HH:MM IST`)** when found and when its status changes.
3. **Every new walk MUST read this file at Step 0** and explicitly check every OPEN entry during the walk (listed in that walk's `00-scope.md`).
4. An entry closes one of two ways, never silently:
   - **FOLDED** — it became a permanent rule in `docs/protocols/dual-lens-review.md` (note where), or
   - **CHECKED** — a walk verified it / fixed it (link the walk folder).
5. Never delete entries. Closed entries stay as history at the bottom.

Entry format:

```
### LH-<number> — <short name>
- Found: YYYY-MM-DD HH:MM IST, by <founder|AI>, during <session/walk>
- What the AI was missing: <plain words>
- Status: OPEN | FOLDED (where, when) | CHECKED (walk link, when)
```

---

## OPEN loopholes

_(none right now — add the moment one is found)_

---

## CLOSED loopholes (history — never delete)

### LH-1 — Code review never sees the human

- Found: 2026-06-10 ~15:30 IST, by founder, during the dual-lens discussion session
- What the AI was missing: it reviewed code quality (syntax, bugs, production-grade) but never connected features to personas, screens, feelings, real-life days — never walked a feature as the person living it.
- Status: FOLDED — became the entire Lens 2 method in `docs/protocols/dual-lens-review.md`, 2026-06-10 ~16:00 IST.

### LH-2 — Screens can show fake things

- Found: 2026-06-10 ~15:50 IST, by founder, same session
- What the AI was missing: it didn't verify that every button does what it promises and every word/number shown is real and executed — dead buttons, fake indicators, placeholder text could pass review.
- Status: FOLDED — Step 4 of `dual-lens-review.md` ("everything shown must be REAL"), 2026-06-10 ~16:00 IST.

### LH-3 — Screen success can lie; DB rows are the truth

- Found: 2026-06-10 ~15:40 IST, by founder, same session
- What the AI was missing: walks judged screens without opening the database to confirm every table the step touches got filled correctly with no missing values.
- Status: FOLDED — Step 5 of `dual-lens-review.md` (four-layer DB proof), 2026-06-10 ~16:00 IST.

### LH-4 — Patch-per-symptom instead of common root cause

- Found: 2026-06-10 ~15:40 IST, by founder, same session
- What the AI was missing: fixing bugs one-by-one as found, instead of collecting all bugs, clustering by shared root, and fixing the few roots — patches break when new changes come; root fixes don't.
- Status: FOLDED — Steps 7-8 of `dual-lens-review.md`, 2026-06-10 ~16:00 IST.

### LH-5 — Shortcut navigation hides unreachable screens

- Found: 2026-06-10 ~16:20 IST, by founder, same session
- What the AI was missing: QA driven by deep links / uiautomator proves screens WORK but never that a human can REACH them by real taps; orphan screens, dead routes, broken links, and ghost UI pass unnoticed.
- Status: FOLDED — Step 1b + the no-shortcut hard rule in `dual-lens-review.md`, 2026-06-10 ~16:30 IST.
