# 08 — Submit & Status screen

Reached the moment the worker taps **Submit work**.

## Core rule

The worker does **not** wait for AI once submission has landed.

They may stay and watch if they want, but leaving must be the default safe behavior.

## Purpose

- confirm that submit succeeded
- show verification progress honestly
- let the worker leave immediately after the submit is durable

## The four states on this screen

| State                        | Meaning                               |
| ---------------------------- | ------------------------------------- |
| **A — Sending**              | Submit request is in flight           |
| **B — Submitted, verifying** | Submit landed; verification continues |
| **C — Outcome**              | Verification returned a real verdict  |
| **D — Submit failed**        | Submit itself did not land            |

## State A — Sending

- spinner
- short line: `Sending your work…`
- no back escape

This should normally last less than a second.

## State B — Submitted, verifying

This is the default success state after the POST lands.

The worker sees:

- `Work submitted`
- short note that AI is still checking
- primary CTA: **Back to home →**
- optional secondary text action: **Stay and watch**

If the worker leaves:

- the visit shows **Verifying** on home
- background verification continues
- notification may be sent later if enabled

If the worker stays:

- the screen may live-update into a terminal outcome
- the worker may still leave at any time

### Home behavior after leaving

Once the worker goes home from this state:

- this visit shows **Verifying**
- that card does not outrank an actively running timer
- that card does outrank fully completed visits
- the worker can continue other non-blocked visits normally

## State C — Outcome

If verification finishes while the worker is still here, the screen transitions to the matching outcome in [09-outcomes.md](09-outcomes.md).

## State D — Submit failed

If the POST itself fails:

- plain message: `Couldn't send your work. Your photos are still safe.`
- **Try again**
- **Save and exit**

Save and exit sends the worker home with the visit still resumable at Final Review / Submit Pending.

On Home, that visit should show a clear `Submit pending` style state so the worker knows this visit still needs one more action.

## What the screen does

- sends the submit request
- starts verification polling only after the submit succeeded
- stops polling when the worker leaves
- times out into **Still processing** if there is no verdict after a reasonable window

## Back navigation

- State A: locked
- State B: worker exits via **Back to home →**
- State C: back goes home
- State D: worker can retry or save and exit

## Visit state

Entry: PHOTOS_PENDING  
After submit lands: AWAITING_VERIFICATION  
Then: VERIFIED / FLAGGED / CLOSED-like terminal state / still processing
