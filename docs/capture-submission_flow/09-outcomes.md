# 09 — Outcome screens

A visit ends in one of four worker-visible outcomes. The screen shown must always match the real server state.

| Outcome              | Meaning                                       |
| -------------------- | --------------------------------------------- |
| **Verified**         | AI approved the work                          |
| **Flagged**          | AI flagged it or could not verify confidently |
| **Closed**           | Visit was cancelled, no-showed, or archived   |
| **Still processing** | Verification has not finished yet             |

---

## 9A — Verified

- heading: `Site verified`
- site name
- short note: `Photos accepted, work logged.`
- primary CTA: **Back to home →**

The worker cannot re-enter the capture flow for that visit.

## 9B — Flagged

- heading: `Flagged for review`
- site name
- reasoning text from verification if available
- fallback text if no reason is available
- primary CTA: **Back to home →**

Tone stays neutral. The worker is not blamed.

## 9C — Closed

- heading: `Visit closed`
- site name
- sub-label such as `Cancelled`, `Marked no-show`, or `Archived`
- plain body telling the worker to check with the supervisor if needed
- primary CTA: **Back to home →**

## 9D — Still processing

- heading: `Still processing`
- site name
- body: `Your work was submitted. Verification is still running.`
- primary CTA: **Back to home →**

When the worker goes home, the visit continues to show a verifying-style state until the final verdict lands.

---

## Common rules

- Back navigation goes home
- Primary button is always **Back to home →**
- Site name is always visible
- No optimistic verdicts
