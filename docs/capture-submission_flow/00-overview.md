# 00 — Overview: target worker capture-to-submission journey

This folder defines the **target contract** for the worker flow we want to build and lock for QA. It is not a copy of today's code. It keeps the stronger founder UX decisions, but trims anything that adds friction without improving truth.

The target worker journey has **8 screens**, always in this order:

1. **QR Scan** — worker proves they are at the site, or skips if the site has no QR.
2. **Before Photos — Capture** — worker captures the before state.
3. **Before Photos — Review** — worker removes blurry or wrong before photos and adds replacements if needed.
4. **Cleaning Timer** — worker does the work while the app tracks time.
5. **After Photos — Capture** — worker captures the after state.
6. **After Photos — Review** — worker removes blurry or wrong after photos and adds replacements if needed.
7. **Final Review** — worker sees before and after together, with upload truth.
8. **Submit & Status** — worker submits and is free to leave once submission lands.

After step 8, the visit ends as **Verified**, **Flagged**, **Closed**, or **Still processing** — see [09-outcomes.md](09-outcomes.md).

---

## Visit state at each step

| Step                          | Visit state                              |
| ----------------------------- | ---------------------------------------- |
| 1 — QR Scan                   | SCHEDULED / NOTIFIED / EN_ROUTE          |
| 2-3 — Before capture + review | ON_SITE                                  |
| 4 — Timer                     | IN_PROGRESS                              |
| 5-6 — After capture + review  | IN_PROGRESS                              |
| 7 — Final review              | PHOTOS_PENDING                           |
| 8 — Submit + status           | AWAITING_VERIFICATION → terminal outcome |

State should move forward with intent:

- QR success or QR skip moves the visit to **ON_SITE**.
- Starting cleaning moves it to **IN_PROGRESS**.
- Continuing from After Review into Final Review moves it to **PHOTOS_PENDING**.
- Submitting moves it to **AWAITING_VERIFICATION**.

The worker may move backward inside a safe checkpoint, but the system must never lie about what has already been durably saved.

---

## Non-negotiable operating rules

These rules exist to stop the product from slowly drifting into something easy to game.

### Rule A — One active timer per worker

A worker may have many visits in flight, but only **one** visit may be actively timing at once.

If the worker tries to start cleaning on another visit while one timer is already active:

- the app must block the new timer start
- the app must show which visit is already active
- the app must offer a clear path back to that active visit

This keeps labor truth, worker memory, and supervisor trust intact.

### Rule B — Minimum photo count is a floor, not proof

`3 photos` means the worker has met the minimum count, not that the evidence is automatically good enough.

The product contract assumes:

- no duplicate-angle spam
- no obviously blurry proof set
- no three photos of the same small area

Where possible, the app should help the worker capture coverage, not just count.

### Rule C — Quality corrections must be cheap

Review screens exist so the worker can quickly remove bad photos and add replacements without losing the rest of the visit.

### Rule D — Submit success frees the worker

Once submission lands, the worker is done with the visit unless a later human process says otherwise.

---

## Why the review screens stay

The Before Review and After Review screens are kept on purpose.

Reason:

- workers can take blurry or wrong-angle photos
- workers need one clean checkpoint to remove them
- workers need one clean path to add replacements before moving on
- this is especially important before starting cleaning and before final submit

So the target is **not** “remove review to save taps.” The target is:

- capture fast
- review fast
- final review strict

The review screens must stay lightweight. They exist for quality control, not for extra ceremony.

---

## Workers can run multiple visits in parallel

A worker may pause a visit at site A, start site B, finish B, then return to A. This is normal and supported.

The home screen must show every assigned visit with its real next action:

- Start capture
- Resume cleaning
- Finish photos
- Submit pending
- Verifying

Photos, timer progress, and upload state are isolated per visit.

### Home card priority

When multiple visits exist, Home should prioritize them in this order:

1. active timer visit
2. submit pending visit
3. verifying visit that needs no action
4. next scheduled visit
5. completed visits

The worker should never need to guess which visit needs attention first.

---

## What the supervisor sees

Supervisor home is not a live wall of 200 raw visit states. It is AI-curated:

- **Flagged visits** at the top
- **Site-level progress summary** below
- **Drill-in** only when the supervisor opens a site

Normal worker progress is not what the supervisor should watch all day. Their attention is reserved for exceptions and site-level coordination.

---

## Supervisor cancellation

If a supervisor cancels a visit mid-flow:

- the server moves the visit to CANCELLED
- the worker is moved to the **Closed** outcome on the next relevant poll or API call
- already uploaded evidence is kept for audit
- the worker is told plainly that the visit was closed

---

## Three rules that apply everywhere

### Rule 1 — The worker never waits unless there is a real reason

Screen-to-screen movement should feel immediate. If the next screen needs data, its own loading state appears there.

### Rule 2 — The worker does not wait for AI after submit

Once submission lands, the worker can leave. Verification continues in the background. If a verdict returns while they are still on-screen, the UI may update live, but staying is optional.

### Rule 3 — Screens never lie

- Verified only when the database says VERIFIED
- Flagged only when the database says FLAGGED
- Closed only when the database says terminally closed
- Still processing only when verification has not finished yet

---

## File index

| File                                                       | Contract               |
| ---------------------------------------------------------- | ---------------------- |
| [01-qr-scan.md](01-qr-scan.md)                             | QR screen              |
| [02-before-photos-capture.md](02-before-photos-capture.md) | Before capture screen  |
| [03-before-photos-review.md](03-before-photos-review.md)   | Before review screen   |
| [04-cleaning-timer.md](04-cleaning-timer.md)               | Timer screen           |
| [05-after-photos-capture.md](05-after-photos-capture.md)   | After capture screen   |
| [06-after-photos-review.md](06-after-photos-review.md)     | After review screen    |
| [07-final-review.md](07-final-review.md)                   | Final review screen    |
| [08-submit-and-status.md](08-submit-and-status.md)         | Submit + status screen |
| [09-outcomes.md](09-outcomes.md)                           | Outcome screens        |
| [10-edge-cases.md](10-edge-cases.md)                       | Edge-case behavior     |
