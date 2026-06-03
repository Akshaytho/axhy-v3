# 11 — Implementation Order and Reviewer Contract

This file exists to keep the Claude-write / Codex-review loop efficient.

Claude should implement **one bounded slice at a time**.
Codex reviews, tests, and either accepts or sends back a narrow correction.

Do not attempt the whole worker flow in one giant pass.

---

## Working mode

- Claude edits code.
- Codex reviews code, runs tests, and compares behavior against the target contract in this folder.
- Each slice should be small enough to verify in one pass.
- If a slice touches multiple layers, it should still have one clear outcome.

---

## Priority order

### Slice 1 — Route/state foundation

Goal:

- align visit-state progression with the target flow
- enforce one active timer per worker
- make resume routing deterministic

Must cover:

- worker visit state transitions
- home-card priority
- capture-step routing
- timer exclusivity enforcement

Accept only if:

- one worker cannot start two active timers
- resumable visits reopen at the correct step
- home prioritizes active timer > submit pending > verifying > next scheduled

### Slice 2 — QR screen

Goal:

- replace visual-only QR behavior with real product behavior

Must cover:

- real scan path
- wrong-site message
- skip governance
- QR-expected vs no-QR-config behavior

Accept only if:

- correct-site QR advances cleanly
- wrong-site QR does not advance
- skip is recorded honestly
- repeated skip behavior is visible in data for ops/supervisor

### Slice 3 — Before capture + before review

Goal:

- make before-photo flow match the target contract

Must cover:

- 3 to 8 photos
- preview/remove/retake
- lightweight review checkpoint
- replacement loop preserving good photos
- coverage guidance or shot checklist support

Accept only if:

- worker can remove one bad photo without losing the good set
- replacing a bad photo returns to before review
- start cleaning is blocked below minimum

### Slice 4 — Timer

Goal:

- make timer durable and honest under interruption

Must cover:

- persistence across background/reopen
- safe exit confirmation
- no silent timer loss
- no second active timer

Accept only if:

- timer survives interruption
- leaving returns later to the same timer
- worker cannot accidentally destroy progress

### Slice 5 — After capture + after review

Goal:

- mirror the before-side quality loop with after-side rules

Must cover:

- 3 to 8 photos
- preview/remove/retake
- return-to-timer confirmation
- after review replacement loop

Accept only if:

- worker can go back to timer safely
- partial after-photo draft behavior is honest
- after replacements return to after review

### Slice 6 — Final review

Goal:

- make final review the strict quality and upload gate

Must cover:

- before/after combined review
- explicit disable reasons
- anti-gaming checks
- shot checklist visibility if configured

Accept only if:

- submit blocks for real missing evidence
- worker sees why submit is blocked
- retake paths preserve the opposite side

### Slice 7 — Submit/status/outcomes

Goal:

- let worker leave once submit lands
- keep verification honest

Must cover:

- sending
- submitted/verifying
- stay and watch
- save and exit on submit failure
- terminal outcomes
- home-card verifying behavior

Accept only if:

- worker can leave after durable submit
- failed submit is resumable
- no fake verified state appears

### Slice 8 — Edge-case hardening

Goal:

- harden the flow against real field problems

Must cover:

- low battery
- low storage
- shared device isolation
- restricted-photo exceptions
- supervisor interruption

Accept only if:

- no edge case forces fake compliance
- no edge case silently loses worker evidence

---

## Reviewer contract

Codex should reject a Claude slice if any of these happen:

- comments or placeholders instead of real implementation
- behavior claimed but not wired
- happy-path only, no failure path
- fake state progression
- route changes without resume logic
- UI done but backend truth missing

Codex should ask Claude for the next slice only after:

- code review passes
- targeted tests pass or the missing test is called out explicitly
- the slice matches the target contract in this folder

---

## Token-efficiency rule

Every Claude prompt should include only:

- the target slice
- the exact files likely involved
- the acceptance rules for that slice

Do not send the whole repo.
Do not send the whole flow every time.
Do not ask Claude to “fix everything.”
