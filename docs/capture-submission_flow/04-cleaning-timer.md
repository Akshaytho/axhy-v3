# 04 — Cleaning Timer screen

Reached when the worker taps **Start cleaning →**.

## Purpose

Track cleaning time honestly while staying simple enough that the worker can mostly ignore the phone and do the actual work.

## What the screen does

- starts and shows a count-up timer
- survives app backgrounding, reopen, and short interruptions without losing meaningful time
- keeps the phone awake while visible
- may sample GPS in the background if company policy enables it

The timer's job is to represent the work session, not to become a task manager.

## One-active-timer rule

Only one visit may be actively timing for a worker at a time.

If another visit is already timing:

- the worker may still open other visits
- the worker may review or submit other finished visits
- the worker may not start a second timer

Trying to start a second timer should redirect the worker back to the already-active timer with a plain explanation.

## What the worker sees

- large elapsed time
- clear site label
- one primary button: **Done — take after photos →**
- one top-left exit control

## What the worker can do

| Action                             | Result                                                 |
| ---------------------------------- | ------------------------------------------------------ |
| Let the timer run                  | Elapsed time continues                                 |
| Tap **Done — take after photos →** | Move to After Photos Capture                           |
| Tap exit / system back             | Open a small confirmation sheet                        |
| Confirm leave                      | Return to home with visit still resumable at the timer |
| Cancel leave                       | Stay on timer                                          |

## What the worker should NOT be able to do

- silently lose the timer on exit
- reset the visit back to SCHEDULED
- delete visit evidence from the timer screen
- be forced to keep the app open for the timer to remain truthful

## State model

Entry: IN_PROGRESS  
Leaving to home: stays IN_PROGRESS  
Moving forward to After Photos: stays IN_PROGRESS

The visit should not become PHOTOS_PENDING until the worker has finished after-photos and entered final review.

## Resume rule

If the worker leaves and returns later, the app must reopen the timer with the real elapsed session preserved.

The worker must never feel afraid to exit the timer briefly. If the product makes leaving feel risky, workers will keep the screen open artificially or avoid honest interruption behavior.
