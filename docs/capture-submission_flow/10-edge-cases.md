# 10 — Edge cases

The rule across all edge cases is simple:

**the worker's effort is preserved, and the UI stays honest.**

---

## Bad or no network

- QR scan should still work locally; server write can happen on forward action or explicit skip flow
- capture screens still work; photos save locally and queue
- review screens still work; worker can remove bad photos and add replacements
- timer still works
- final review blocks submit until the required evidence is ready
- submit failure offers **Try again** and **Save and exit**

## App crash, force-kill, restart

- captured photos survive locally
- upload queue survives
- visit state on the server remains the last successful transition
- reopening the app returns the worker to the real next step for that visit

## Low battery

- capture and review screens should warn early if battery is critically low
- timer state must survive battery-related interruption
- the worker should not be forced into risky extra taps just because the phone is dying

## Low storage

- the app should warn before capture fails completely
- if one photo cannot be saved, that photo must not be counted
- the worker should get a plain explanation, not a silent broken shutter

## Worker leaves mid-timer

- visit stays IN_PROGRESS
- timer resumes honestly later
- worker is never forced to restart the visit

## Worker tries to start a second timer

- the new timer start is blocked
- the app tells the worker which visit is already timing
- the worker can jump back to that active visit immediately

## Worker takes partial after-photos, then realizes more cleaning is needed

- going back from After Photos must require a clear confirmation
- timer resumes
- partial after-photo draft from that pass may be discarded
- worker can continue cleaning and come back again

## Photo upload fails

- affected tile shows failed state
- worker can retry or remove it
- final review remains blocked until the evidence set is valid again

## Restricted, unsafe, or inaccessible photo area

If a required area cannot be photographed because of privacy, safety, locked access, or site policy:

- the worker must not be forced to fake a replacement photo
- the app should allow an exception reason tied to the relevant missing shot
- that exception should stay visible in review and supervisor follow-up

## Verification takes too long

- worker can leave once submit landed
- screen or home state becomes **Still processing**
- no fake verified outcome appears

## AI cannot verify confidently

- visit goes to FLAGGED, not VERIFIED
- worker sees a neutral flagged outcome
- supervisor gets the visit in flagged review

## Supervisor cancels a visit mid-flow

- next relevant poll or API call moves the worker to Closed
- already uploaded evidence is kept for audit
- worker is told plainly what happened

## Shared or reassigned phone

- unfinished visit drafts must stay isolated to the correct worker identity
- one worker must never see another worker's draft photos or resumable timer
- sign-out or worker-switch must not silently attach old local drafts to the new person

## Supervisor interruption

If a supervisor calls or messages and tells the worker to stop, move, or switch sites mid-flow:

- the worker must be able to leave safely
- the visit must reopen at the correct next step later
- the app should not trap the worker in a “finish this first” dead end unless submit is actively sending

## Multiple visits in parallel

- each visit is isolated by visit ID
- photos, queue state, timer state, and verification state do not leak across visits
- submitting one visit never blocks another

## Auth expiry mid-flow

- client refreshes silently if possible
- if refresh fails, worker signs in again
- on return, unfinished visits are still resumable

## Five things that must always hold

1. Captured evidence is preserved unless the worker explicitly removes it.
2. Server visit state is the source of truth.
3. Worker speed matters until final review; truth matters most at final review and submit.
4. The worker may leave after submit succeeds.
5. Screens never show a better result than the server actually returned.
6. A worker can have many visits in flight, but only one active timer.
