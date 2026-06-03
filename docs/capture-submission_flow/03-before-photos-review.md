# 03 — Before Photos Review screen

Reached after the worker taps **Done →** on Before Photos Capture.

## Purpose

Give the worker one quick quality checkpoint before cleaning starts.

This is where they catch:

- blurry photos
- duplicate angles
- wrong photos
- too few photos

## What the screen does

- shows every before-photo together
- keeps background uploads running
- lets the worker remove a bad photo
- lets the worker go back and add replacements
- preserves every good photo while the worker fixes the bad ones

## What the worker sees

- header: **Before review**
- grid of before-photos
- upload status per photo
- **+ Add more** if under the max
- **Start cleaning →** as the primary action

## What the worker can do

| Action                   | Result                                                       |
| ------------------------ | ------------------------------------------------------------ |
| Tap a photo              | Preview it and decide whether to keep it                     |
| Remove a photo           | Photo is removed from the before set                         |
| Tap **+ Add more**       | Return to Before Capture with existing good photos preserved |
| Tap **Start cleaning →** | Move to Timer                                                |
| Tap back / system back   | Same as **+ Add more**                                       |

If removal drops the count below 3, **Start cleaning** disables until the worker adds enough replacements.

## Replacement loop

When the worker removes one or more bad photos:

- the remaining good photos stay locked in place
- the missing slot is obvious
- returning to capture is for replacement, not for rebuilding from zero
- when the worker taps Done in capture again, they return to this review screen first

This keeps quality correction cheap and predictable.

## Upload behavior

Uploads continue in the background. This screen does not wait for them to finish.

## Visit state

Entry: ON_SITE  
Forward move on **Start cleaning →**: IN_PROGRESS
