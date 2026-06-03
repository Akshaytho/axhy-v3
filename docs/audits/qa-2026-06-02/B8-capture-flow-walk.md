<!-- [ORCHESTRATOR_EXCEPTION] capture-flow live walk on prod with seeded visits -->

# B8 — Capture flow live walk

Seeded via `apps/backend/scripts/seed-real-phone-worker.ts` (founder authorized) — created 3 visits for `+919381378257` on `Test Site (Mobile QA)`:

| Visit ID                               | State       | Time                            |
| -------------------------------------- | ----------- | ------------------------------- |
| `7d9c5ec0-3519-4ccb-ad51-836b6da2b4f6` | SCHEDULED   | 12:23 PM                        |
| `8540918b-4b7f-401f-a5ed-0c93d158a590` | IN_PROGRESS | 11:23 AM (resumeCapture target) |
| `983894b5-ea14-443f-a856-c7efd5fec069` | VERIFIED    | 7:53 AM                         |

Worker app reloaded — `/worker/today` returned all 3 visits. Home rendered NextSiteCard hero, ResumeCaptureBanner, stats (1 DONE / 3 PLANNED), grouped sections (IN PROGRESS / UPCOMING / COMPLETED). ✓

## Walk per screen — SCHEDULED visit (`7d9c5ec0…`)

Driven via CDP. Direct URL navigation `/capture/<id>/<step>` for each step. All buttons identified by `aria-label` (kudos — capture screens are properly labeled, unlike `/phone` and `/otp`).

### qr-scan

URL: `/capture/<id>/qr-scan`. Body: "SCAN QR / Test Site (Mobile QA) / Point at the site QR code / Skip QR". No backend call. UI matches code audit.

### before-photos

Web preview banner correctly displayed: **"Web preview uses simulated captures for layout QA."**

Buttons (full inventory):

- `aria-label="Back"` — top-left back arrow
- `aria-label="Take photo"` — round 78×78 shutter at bottom center

**Clicked shutter 3 times.** Each click:

- Triggered `POST /worker/captures/upload-urls` with body `{"visitId":"…","files":[{"phase":"before","index":1,"contentType":"image/jpeg","fileSize":500000}]}` → `200`
- Triggered a `PUT` to R2 (`axhy-worker-photos.a24d2fa15ed41fab6a27bbeaf526db7c.r2.cloudflarestorage.com/v3-captures/<userId>/<visitId>/…`)

**🚨 BLOCKER finding (NEW):**

```
OPTIONS https://axhy-worker-photos.a24d2fa15ed41fab6a27bbeaf526db7c.r2.cloudflarestorage.com/...
→ 403
```

The R2 bucket's CORS configuration rejects the preflight from origin `http://localhost:8081`. The actual PUT never goes through. **Photo uploads silently fail on every web origin.**

Confirmed downstream:

- Review screen later shows "0 UPLOADED" / "Upload failed — tap retry" / "Uploading…" / "Queued" — the upload queue knows it failed.
- DB query: `VisitPhoto.count = 0` for this visit. **No DB record was created even though upload-urls returned 200.**

**Severity:** BLOCKER for any web-shipped worker app or QA-on-web walk. On native, no preflight + native R2 SDK paths — would likely work. Not tested on native this session.

**Fix:** Add CORS rule to the `axhy-worker-photos` R2 bucket allowing the worker app origins (Expo Web dev: `http://localhost:8081`, future prod web origins). Required headers: `Authorization`, `Content-Type`, `x-amz-*`. Methods: `PUT`, `GET`, `HEAD`.

### Shutter button UX

The shutter's `aria-label` **dynamically updates** from `"Take photo"` → `"Review photos"` after the minimum-photos threshold (3) is met. Tapping the (now-"Review photos") button advances to the next step. **Excellent UX touch.**

### timer

URL: `/capture/<id>/timer`. Body: "Cleaning in progress / 00:01 / ELAPSED · 0% OF SLOT / GPS tracking active / 0 POINTS COLLECTED / CLEANING AT / Test Site (Mobile QA) / Done — take AFTER photos".

The timer **auto-starts** on screen load (00:01 visible immediately). Mat ches code audit.

Button: `aria-label="Done — take AFTER photos"`.

### after-photos

Same UI as before-photos. Phase = "after". Took 3 simulated photos same way. Same R2 CORS 403 pattern. Shutter→Review aria pattern repeated.

### review

URL: `/capture/<id>/review`. Body shows per-photo upload status: "BEFORE · 1: Upload failed — tap retry", "BEFORE · 2: Uploading…", "BEFORE · 3: Queued", etc. Plus top stats: "3 BEFORE / 3 AFTER / **0 UPLOADED**".

Buttons (full inventory):

| `aria-label`                  | Disabled | Position       |
| ----------------------------- | -------- | -------------- |
| `Back to after photos`        | No       | top-left       |
| `Retake before photo 1`       | No       | thumbnail tap  |
| `Retake before photo 2/3`     | No       | thumbnail tap  |
| `Retake after photo 1/2/3`    | No       | thumbnail tap  |
| **`Submit for verification`** | **No**   | full-width CTA |

**🚨 HIGH finding (NEW):**
"Submit for verification" CTA is **clickable** with `disabled=false, aria-disabled=null` despite 0 photos actually uploaded. The button should be gated on the upload queue being drained.

Clicking it navigated to `/submit` screen (no backend call yet — this CTA is a navigation, not the actual submit).

### submit

URL: `/capture/<id>/submit`. Body: "Submit / Submit your work / **Your photos are uploaded.** Tap below to send them for AI verification. / Submit photos".

**🚨 HIGH finding (NEW):**
**"Your photos are uploaded."** is a static string rendered before the actual submit, regardless of whether ANY photos uploaded. With 0 of 6 actually uploaded, this is a lie that misleads the user into tapping the next button.

Clicked `aria-label="Submit photos"`. The flow then transitions to an error state:

> Something went wrong. **No uploaded photos found. Make sure all photos finished uploading.** Try again.

So the **backend rejects the submit with the correct error**. ✓ Server-side validation is the safety net here.

But the user has been led through 4 screens (before → timer → after → review → submit) with misleading positive feedback before being told they failed. UX should fail-fast at the review screen (gate the CTA on upload completion).

**Fix:**

1. On `/review` screen, disable the "Submit for verification" button until `uploadStatusCount.uploaded === photos.total`.
2. On `/submit` screen, do not render "Your photos are uploaded" if uploads are incomplete. Show "Waiting for X photos to upload" instead.
3. Or — fix the R2 CORS so uploads actually succeed (which also addresses the BLOCKER above).

## DB state — confirmed end-to-end

After full walk attempt:

```
SCHEDULED:    state=SCHEDULED      updatedAt=2026-06-02T06:23:14.885Z  (unchanged from seed)
IN_PROGRESS:  state=IN_PROGRESS    updatedAt=2026-06-02T06:23:15.563Z  (unchanged from seed)
VERIFIED:     state=VERIFIED       updatedAt=2026-06-02T06:23:16.014Z  (unchanged from seed)

VisitPhoto count for all 3: 0
```

**No state transitions, no VisitPhoto records.** Confirms the walk did not mutate prod data. The backend correctly rejected the submit. The seeded visits remain in their seeded states.

## Other captured console signals during the walk

- **`[error] Each child in a list should have a unique "key" prop. … It was passed a child from CameraView.`** — React warning. CameraView renders a list without keys. Causes inefficient re-renders and potential state-corruption bugs when list contents change. **NEW HIGH finding for the codebase.**
- Same RN-Web deprecation warnings as elsewhere (`shadow*`, `pointerEvents`, `useNativeDriver`).

## Positive findings worth keeping

| Surface                   | Observation                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Capture-flow buttons      | All have proper `aria-label` (worker, shutter, retake, submit). Far better than auth screens (M-03).                           |
| Shutter button            | `aria-label` updates dynamically (`Take photo` → `Review photos`) when min threshold met.                                      |
| Web preview banner        | Capture screens correctly tell the user: "Web preview uses simulated captures for layout QA." — honest about the web fallback. |
| Per-photo upload state    | Review screen surfaces "Upload failed", "Uploading…", "Queued" — granular feedback the user can act on.                        |
| Backend submit validation | Server rejects submit with "No uploaded photos found" — defense in depth holds.                                                |
| ResumeCaptureBanner       | Renders for IN_PROGRESS visit on home — points at correct visit. (Resume flow itself not walked end-to-end this session.)      |

## Severity rollup (new findings from B8)

To be merged into C-tier docs:

| ID    | Severity    | Title                                                                                                                                                      |
| ----- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B8-01 | **BLOCKER** | R2 CORS preflight returns 403 — photo uploads silently fail on web                                                                                         |
| B8-02 | HIGH        | "Submit for verification" CTA on /review not gated on upload completion                                                                                    |
| B8-03 | HIGH        | /submit screen displays "Your photos are uploaded" regardless of actual state                                                                              |
| B8-04 | HIGH        | CameraView renders list without unique keys (React error in console)                                                                                       |
| B8-05 | POSITIVE    | Capture-flow has correct `aria-label` coverage + dynamic shutter label + web-preview banner                                                                |
| B8-06 | POSITIVE    | Backend submit validation correctly rejects "no uploaded photos"                                                                                           |
| B8-07 | OBSERVATION | DB state unchanged across walk; no VisitPhoto records created despite 200 on /worker/captures/upload-urls (presigned URL endpoint doesn't pre-create rows) |

## Not walked this session

- Resume flow for IN_PROGRESS visit (`8540918b…`) — banner clicked starts resume but full flow not traced
- /history walk with the VERIFIED visit (`983894b5…`) — should populate the "Completed today" section with real data
- Native iOS/Android camera path — no simulator available
- Submit-success path with actual uploads — gated on R2 CORS fix
- Verify-status polling (`GET /worker/visits/<id>/verify-status`) — only fires after successful submit
