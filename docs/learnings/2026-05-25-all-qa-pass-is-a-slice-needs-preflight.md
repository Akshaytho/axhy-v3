---
broken_rule: 'feedback_multi_role_review.md — Test as worker, supervisor, COMPANY_ADMIN, SUPER_ADMIN, developer, founder'
persona: all
date: 2026-05-25
session: 'Worker QA pass against production — discovered scope gap mid-flight'
check_pattern: '_QA_FINDINGS|_QA_REPORT|test-pass-findings'
check_paths: 'handoff'
check_expect: 'exists'
---

# Learning: A QA / verification pass is a slice, not ad-hoc exploration

## What happened

The 2026-05-25 session ran an "end-to-end QA pass against production" of the worker app. The pass:

- Ran `check_before_build` for 3 code slices (Cluster B, WhatsApp pivot, phone-allowlist bypass) — correctly.
- Ran `check_before_plan` for the QA findings doc — correctly.
- Did **NOT** run `check_before_build` for the QA slice itself. Treated QA as informal investigation.
- Did **NOT** run `check_before_done` before declaring QA complete.
- Did **NOT** call `impactCheck()` on "how to QA a multi-persona system."
- Walked ~10 worker screens via Playwright. Captured 16 screenshots. Stopped.

The founder asked: _"did you clearly check all screens like a user and not only about worker — about how worker is connected to other personas?"_ The honest answer was NO. Major gaps:

- **Camera capture flow** — never tested (headless browser limitation). The single most important worker flow.
- **AI verification polling** — never reached.
- **Supervisor app** — never opened (it lives in the same Expo repo at `apps/mobile/app/(supervisor)/`).
- **Admin web** — never opened (it lives at `apps/admin-web/`).
- **Cross-persona scenarios** — HR creates worker; supervisor verifies photos; worker requests leave→supervisor approves; admin assigns; chat from supervisor; push notification → bell badge; decision card; complaint flow. Zero of these tested.
- **Worker state edge cases** — never exercised ON_LEAVE / BLOCKED / TERMINATED / ARCHIVED states.
- **Logout / re-login / wrong OTP / rate limit / offline mode / empty day** — none exercised.

## Root cause

Three failures braided:

1. **Treated QA as a different kind of work.** The cognitive system has clear gates for "build / fix / refactor" slices, and I applied them rigorously for the 3 code slices. QA felt like exploration, so I started a Playwright script without invoking the preflight. The system doesn't know it should fail me — it can only fail me at gates I invoke.

2. **Did not consult memory.** `feedback_multi_role_review.md` is in `MEMORY.md` and loads at session start. It literally says: _"Test as worker, supervisor, COMPANY_ADMIN, SUPER_ADMIN, developer, founder."_ I had this loaded. I did not apply it. Loading memory is not the same as using it.

3. **`affected_personas` field would have caught it.** `check_before_build`'s `affected_personas` requires listing every persona the slice affects. For a QA pass of a multi-persona system, the answer is "worker, supervisor, HR, COMPANY_ADMIN, SUPER_ADMIN" — not "worker." If I had invoked the gate, the single field would have surfaced the scope gap before any clicking happened.

## Prevention rule

1. **A QA / verification / test / smoke / walkthrough pass IS a slice.** It needs the same gates as a build slice:
   - `check_before_build` with `affected_personas` listing **every persona the system has**, not just the obvious target.
   - `affected_platforms` listing native + web + admin if any of those persona surfaces exist.
   - `required_tests` field naming the specific cross-persona flows that must be walked.
   - `check_before_done` with `flow_completeness` array enumerating every expected behavior, verified=true only when actually exercised.

2. **For multi-persona systems, the default scope of a QA pass is multi-persona.** If you're only walking one persona, that has to be an explicit founder-approved deferral in the preflight, not a silent omission.

3. **Headless-browser QA is incomplete by definition for any mobile app.** Camera, GPS, native deep-links, push notifications, biometrics, file system access — none of these work in a headless browser. If the slice plan includes "QA the mobile app", it must also specify how to test the native-only surfaces:
   - Real device via USB / LAN to Expo
   - Maestro / Detox on a simulator
   - OR explicit founder-approved deferral with "native-only surfaces will be QA'd on real device in session N+K"

4. **For cross-persona scenario walks, bootstrap richer test data.** A single Worker + a single Supervisor in a single Company is enough to render screens but NOT enough to walk realistic flows (chat conversations, decision cards, complaint threads, multi-day history). The fixture bootstrap step in the QA preflight should describe the FULL dataset needed: assignments across the week, prior visits in every state, supervisor activity, HR onboarding artifacts, etc.

5. **Multiple persona tokens are part of the toolchain.** Minting test JWTs for each persona is a one-time helper-script effort. Do not skip cross-persona testing because token-minting is awkward — fix the toolchain (write `scripts/qa/mint-token.ts` that takes `--role SUPERVISOR --user X --company Y` and outputs a token).

## Detection

- **Pre-commit:** This learning's `check_pattern: '_QA_FINDINGS|_QA_REPORT|test-pass-findings'` greps the `handoff/` directory. Any committed QA findings doc fires the learning surface in Phase 0 audit output of the NEXT session — reminding the writer to verify the preflight was run.
- **Manual gate:** Before starting any session-task whose intent contains "QA", "test", "verify", "smoke", "walkthrough", or "fall test", the AI must explicitly invoke `check_before_build` with the full persona list, OR document a founder-approved deferral.
- **Done-time gate:** Before writing a QA findings doc, the AI must invoke `check_before_done` with `flow_completeness` listing every expected cross-persona behavior. Items with `verified: false` MUST be carried forward as next-session debt.

## Related

- `axhy-cognitive-system/memory/base/feedback_multi_role_review.md` — the rule this learning enforces.
- `axhy-cognitive-system/memory/base/feedback_integration_vs_water_flow.md` — water-flow tests are explicitly multi-persona; this learning extends that to all QA passes.
- `axhy-cognitive-system/memory/base/feedback_simulator_non_negotiables.md` — 12 rules for scenario simulation runs; applies to any cross-persona walkthrough.
- `handoff/WORKER_QA_FINDINGS_2026-05-25.md` — the QA pass this learning was extracted from; the "What was NOT exercised" section is the canonical list of gaps to address in the next QA wave.
