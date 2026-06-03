# 07 — Final Review screen

Reached after the worker finishes After Review.

## Purpose

This is the one deliberate review checkpoint before submit. The worker sees the whole evidence set together and the app enforces truth around photo counts and uploads.

## What the screen does

- shows before and after groups together on one scrollable screen
- shows real upload status per photo
- enables or disables submit in real time
- lets the worker retake from either group

## What the worker sees

- header: **Final review**
- site name
- short summary line:
  - cleaned duration
  - total photos captured
- **Before** section
- **After** section
- clear primary CTA: **Submit work**

## What the worker can do

| Action                | Result                                              |
| --------------------- | --------------------------------------------------- |
| Tap a photo tile      | Preview, retake, or remove that photo               |
| Retake a before-photo | Return to Before Photos with after-photos preserved |
| Retake an after-photo | Return to After Photos with before-photos preserved |
| Tap back              | Return to After Review with current draft preserved |
| Tap **Submit work**   | Move to Submit & Status                             |

## When Submit is disabled

Submit is disabled if any of these is true:

- fewer than 3 before-photos
- fewer than 3 after-photos
- any photo is still uploading
- any photo has failed and not been retried or removed

The reason must be explicit, for example:

- `Waiting for 2 uploads`
- `1 photo failed — retry or remove it`
- `Need 1 more after photo`

## Anti-gaming rule

Final Review is where the product protects against “minimum count but weak proof.”

This screen should help catch:

- three near-identical photos
- missing main area coverage
- obviously broken before/after comparison
- one side having enough count but poor evidence value

If the job template defines expected shots or zones, Final Review should make missing coverage obvious before submit.

The system does not need to insult the worker or over-automate judgment, but it should not pretend that count alone equals good evidence.

## Why upload gating happens here

Earlier screens optimize worker speed. This screen is where the product becomes strict, because submission must only happen once the evidence set is complete and durable.

## Visit state

Entry: PHOTOS_PENDING  
Leaving to retake: stays PHOTOS_PENDING or safely reopens the right capture path without lying  
Submitting: AWAITING_VERIFICATION
