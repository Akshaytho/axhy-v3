# 05 — After Photos Capture screen

Reached when the worker taps **Done — take after photos →** on the timer.

## Purpose

Capture the after state clearly enough that the system and the supervisor can compare the result against the before state.

Target photo rule:

- minimum: **3**
- maximum: **8**

## Coverage rule

At minimum, the after set should usually include:

- one wide post-clean shot
- one shot proving the main problem area is now clean
- one alternate angle or secondary cleaned area

Where possible, after photos should roughly match the before angles so the comparison feels fair and easy to trust.

Where companies or site types need more structure, the app may show an **expected shot checklist** driven by the job template so the worker knows what “complete coverage” means at that site.

## What the screen does

This screen behaves like Before Photos Capture, but in the after phase:

- real camera
- local save
- background upload queue
- inline preview / retake / remove
- keep-awake while open

## What the worker sees

- live camera viewport
- header: **After photos**
- counter: `N of 8`
- after-photo thumbnails
- **Done →** disabled until 3 photos exist
- back control
- flash toggle

Optionally, the product may show a lightweight before-photo reference overlay to help the worker match angles, but the worker must not be forced into a split-screen or confusing compare mode.

## What the worker can do

| Action           | Result                                                                             |
| ---------------- | ---------------------------------------------------------------------------------- |
| Tap shutter      | Capture one after-photo                                                            |
| Tap thumbnail    | Preview with retake or remove                                                      |
| Tap **Done →**   | Move to After Review                                                               |
| Tap back / close | Confirm return to timer; current after-photo draft for this round may be discarded |

## Back behavior

Back from this screen is allowed because the worker may realize they are not truly done cleaning yet.

If the worker chooses to go back:

- timer resumes
- visit stays IN_PROGRESS
- any partial after-photo draft from this pass may be discarded

This must be explained plainly in the confirmation.

## Visit state

Entry: IN_PROGRESS  
Forward move to After Review: stays IN_PROGRESS
