# 01 — QR Scan screen

First screen of the visit. Reached by tapping a scheduled visit from worker home.

## Purpose

Confirm the worker is at the right site. If the company does not use QR codes at that site, the worker skips and continues without penalty.

This screen should be extremely fast:

- normal case: successful scan in 3–10 seconds
- no-QR case: one tap on **Skip**

## What the screen does

- turns on the real camera
- scans continuously on-device
- validates whether the QR belongs to:
  - the expected site
  - a different Axhy site
  - a non-Axhy code
- writes a real server event for:
  - successful QR check-in
  - QR skipped

## What the worker sees

- full camera viewport
- short header: **Scan site QR**
- centered guide showing where to aim
- **Skip** button at the bottom
- close/back control
- flash toggle

The screen stays minimal. No long explanation text.

## What the worker can do

| Action                        | Result                                                                      |
| ----------------------------- | --------------------------------------------------------------------------- |
| Scan the correct site QR      | Visit moves to ON_SITE and advances immediately to Before Photos            |
| Scan a different Axhy site QR | Show a plain mismatch message and keep scanning                             |
| Scan a random non-Axhy QR     | Ignore it and keep scanning                                                 |
| Tap **Skip**                  | Advance immediately and record `qrSkipped=true` or equivalent on the server |
| Tap close / system back       | Return to worker home with visit unchanged                                  |
| Tap flash                     | Toggle flashlight                                                           |

## Wrong-site handling

If the worker scans the wrong Axhy site QR, the screen should say:

`This QR belongs to [Other Site]. You are scheduled for [Expected Site].`

The worker then either scans the correct code or skips.

## Skip governance

Skip must stay easy for legitimate cases, but it must not become invisible.

For sites configured as **QR expected**, skip should capture a short reason:

- QR missing
- QR damaged
- QR unreachable
- camera problem
- supervisor told me to skip

For sites configured as **no QR used**, skip should remain one tap.

Repeated skip patterns should be visible in supervisor or ops reporting. The product should not punish a single legitimate skip, but it also should not let QR quietly become meaningless over time.

## Permissions

Camera permission should already have been requested earlier in onboarding or first use. If it was revoked later, this screen shows one clear recovery action to reopen Settings.

## Visit state

Entry: SCHEDULED / NOTIFIED / EN_ROUTE  
Forward move: ON_SITE

Once the visit is ON_SITE, this screen should not be the worker's next-action route anymore.

## What this screen must not do

- block the worker on network for scan itself
- require a manual Confirm tap after a successful scan
- punish QR skip
- pretend a site match happened when it did not
- hide repeated skip behavior from operational review
