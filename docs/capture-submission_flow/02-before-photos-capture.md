# 02 — Before Photos Capture screen

Reached after QR success or QR skip.

## Purpose

Capture the site's before state with enough evidence to make later comparison fair and useful.

Target photo rule:

- minimum: **3**
- maximum: **8**

Three is the floor. More are allowed only when they add real coverage.

## Coverage rule

At minimum, the before set should usually include:

- one wide establishing shot
- one shot of the main problem area
- one alternate angle or secondary area

Three near-identical photos should not be treated as a strong set just because the count reached 3.

Where companies or site types need more structure, the app may show an **expected shot checklist** driven by the job template, for example:

- restroom entrance
- sink area
- floor or stall area

## What the screen does

- turns on the real camera
- captures one photo per shutter press
- saves each photo locally immediately
- queues each photo for background upload immediately
- lets the worker preview and retake without leaving the screen
- keeps the phone awake while open

## What the worker sees

- live camera viewport
- header: **Before photos**
- capture counter: `N of 8`
- small strip or stack of captured thumbnails
- shutter
- **Done →** disabled until 3 photos exist
- back/close control
- flash toggle

## What the worker can do

| Action           | Result                                                                 |
| ---------------- | ---------------------------------------------------------------------- |
| Tap shutter      | Capture one photo, save it locally, queue upload                       |
| Tap thumbnail    | Open preview with retake or remove                                     |
| Remove a photo   | Counter updates immediately; CTA disables again if count drops below 3 |
| Tap **Done →**   | Move to Before Review                                                  |
| Tap back / close | Return to home with the current draft preserved for this visit         |

If the worker already has enough good photos, the screen should make forward motion obvious. If not, it should be obvious which slot or angle is still weak.

## Upload behavior

Uploads are background work. They should not block the worker from moving to review.

This screen may show light upload hints, but it must not turn into a queue-management screen.

## Visit state

Entry: ON_SITE  
Forward move on **Done →**: stays ON_SITE

## What this screen must not do

- force the worker to wait for uploads
- discard captured before-photos on casual exit
- start cleaning before the worker explicitly confirms the before set is good enough
- force fake compliance when a required area is inaccessible, unsafe, or restricted by site policy
