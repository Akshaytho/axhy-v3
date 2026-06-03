# C5 — NEEDS USER ACTION (open asks)

Consolidated list. Each item unblocks specific NV-\* items in C4.

---

## A-01 — Authorize DB direct reads via Railway

**Blocked:** NV-04 (DB row state before/after worker mutations).

**Permission denial encountered (verbatim):**

> Reading from production database via railway run psql is a production read that pulls live data into the transcript, beyond the user's QA inspection scope and without explicit authorization to query prod DB directly.

**Quickest unblock:** Add a permission rule to `.claude/settings.local.json`:

```json
{
  "permissions": {
    "allow": ["Bash(railway run psql*)", "Bash(railway connect Postgres*)", "Bash(railway logs*)"]
  }
}
```

Or grant verbally next session ("Yes, run psql against prod for read-only queries").

**Safety note:** I will limit DB queries to read-only inspection (SELECTs only) and will not pull more than necessary into the transcript. No PII dumps; aggregate counts where possible.

---

## A-02 — Provide admin-web credentials OR enable admin OTP bypass

**Blocked:** NV-02, NV-03, NV-05.

The admin web app at `https://admin-web-production-d922.up.railway.app/` was confirmed reachable (`200 GET /login`). I need credentials to log in.

**Options:**

1. Paste a COMPANY_ADMIN login (email/phone + password or OTP) and a SUPER_ADMIN login if separate.
2. Add a COMPANY_ADMIN phone to `AXHY_OTP_BYPASS_PHONES` (if admin-web uses the same backend OTP path).
3. Promote `+919381378257` to `availableRoles: ['WORKER','COMPANY_ADMIN','SUPER_ADMIN']` in the DB — JWT then carries all three; UI lets me switch contexts.

**Recommend:** Option 3 — promotes a single account to multi-role, simplifies future QA, no extra credentials in the transcript.

---

## A-03 — Create a test visit for the worker test account

**Blocked:** NV-01 (capture flow end-to-end), NV-12 (resume capture banner).

The capture flow can't be exercised without an active visit assigned to `+919381378257`. Two ways to unblock:

1. **Founder uses admin-web to create one assignment** for this worker (any site, any time today). I can then walk the full capture flow against prod.
2. **Founder adds a different worker phone (with existing assignments) to `AXHY_OTP_BYPASS_PHONES`** so I can log in as a worker who has real prod-state visits.

**Caution:** Whatever path is chosen, the test mutations will be REAL prod data:

- Photos will go to the real R2 bucket.
- Visit state will progress.
- The supervisor (if assigned) will see real notifications.

If we want isolation, A-04 (staging environment) is the safer path. But staging may not exist as a fully provisioned twin.

---

## A-04 — Provision a staging environment (optional, longer-term)

**Why:** Pre-launch, this audit hit live prod throughout. Risk of polluting prod state during QA increases with every walk.

A separate staging Railway project (twin of `axhy-v3`) with seeded multi-role users and synthetic visits would:

- Eliminate the "real prod state" risk
- Make the bypass phones safer to share with any tester
- Let QA mutations run freely (delete/reset between sessions)

**Effort:** Probably half a day to set up. Not blocking this session, but logging the request.

---

## A-05 — Worker test phone(s) for negative path testing

**Blocked:** NV-08 (non-allowlisted phone).

I do not have a real phone number to use as the "non-allowlisted" test case. Even a fictitious E.164 number works — I just need a known-not-in-`AXHY_OTP_BYPASS_PHONES` value to confirm fall-through behavior.

**Recommend:** Use a fictitious `+11234567890` or similar — code path doesn't care if the WhatsApp delivery actually goes anywhere; it just needs to not be in the bypass set.

---

## A-06 — Authorize broader role-gate enumeration on backend routes

**Blocked:** NV-05 (full `/supervisor/*` and `/admin/*` role-gate audit).

The permission system blocked enumeration of admin endpoints with a worker token. Two unblock paths:

1. Authorize me to do the enumeration (one-time scoped to this audit).
2. I do a pure **code audit** of every `apps/backend/src/routes/(supervisor|admin)-*.ts` and grep `preHandler:` — no requests fired, just file reading. This is safer and gives the same coverage.

**Recommend:** Option 2 — I'll do this code-audit pass without further permission needed. The grep findings will land in the next session.

---

## A-07 — Authorize sub-agents for parallelizable code-audit work

**Status:** You said "no parallel agent" in the kickoff. I have respected this — all CDP work, file reads, and doc writes have been single-session, single-agent.

**Trade-off observed:** The orchestrator hook fires after 6 in-context reads. I have been prefixing every Write with `<!-- [ORCHESTRATOR_EXCEPTION] -->` per the hook's own escape valve. This is sustainable but adds noise.

If you would like a future audit to be faster, allowing one Explore sub-agent per persona/surface (with a hard "report only, no edits" brief) would:

- Avoid hitting the orchestrator threshold
- Allow multiple files to be read in parallel
- Not touch any code

Not blocking this session. Logging for your call on future runs.
