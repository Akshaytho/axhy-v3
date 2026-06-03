# 06 — After Photos Review screen

Reached after the worker taps **Done →** on After Photos Capture.

## Purpose

Give the worker one quick quality checkpoint before the combined final review.

This is where they catch:

- blurry after photos
- duplicate angles
- wrong photos
- too few after photos

## What the screen does

- shows every after-photo together
- keeps background uploads running
- lets the worker remove a bad photo
- lets the worker go back and add replacements
- preserves every good after-photo while the worker fixes the bad ones

## What the worker sees

- header: **After review**
- grid of after-photos
- upload status per photo
- **+ Add more** if under the max
- **Continue to final review →** as the primary action

## What the worker can do

| Action                             | Result                                                      |
| ---------------------------------- | ----------------------------------------------------------- |
| Tap a photo                        | Preview it and decide whether to keep it                    |
| Remove a photo                     | Photo is removed from the after set                         |
| Tap **+ Add more**                 | Return to After Capture with existing good photos preserved |
| Tap **Continue to final review →** | Move to Final Review                                        |
| Tap back / system back             | Same as **+ Add more**                                      |

If removal drops the count below 3, **Continue to final review** disables until the worker adds enough replacements.

## Replacement loop

When the worker removes one or more bad after photos:

- the remaining good after photos stay preserved
- the missing slot is obvious
- returning to capture is for replacement, not a full restart
- when capture is finished again, the worker returns here before final review

This matters because workers are tired at this stage. The fix flow must feel obvious.

## Upload behavior

Uploads continue in the background. This screen does not wait for them to finish.

## Visit state

Entry: IN_PROGRESS  
Forward move on **Continue to final review →**: PHOTOS_PENDING
