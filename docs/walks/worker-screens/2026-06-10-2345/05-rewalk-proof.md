# 05 — Re-walk proof

**PARTIAL — covers root C-B only** (C-A fixes await founder placement choices + capture phase; this file completes when the full walk re-runs).

**Re-walk started:** 2026-06-11 01:36 IST · **Finished:** 2026-06-11 01:39 IST

Same path, same persona, same scenario as the 01:18 IST failure — after the root fix (`lib/api.ts:283` path-guard, mirroring :261).

| Step                                         | Previously failed bug #                      | Re-walk result                                                                                                                             | DB proof                                                         | Screenshot           |
| -------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | -------------------- |
| Wrong OTP (999999) on /auth/otp/verify       | #5 (silent bounce to phone screen, no error) | **FIXED** — stays on Enter OTP screen, inline red error "Wrong code. Check the SMS and try again.", code editable, resend countdown intact | no row changes expected (negative path) — none observed          | evidence/walk_42.png |
| Correct OTP (123456) after the wrong attempt | — (regression check)                         | **PASS** — login proceeds normally to permissions screen; success path unaffected                                                          | new RefreshToken family on login (same contract as Step 3 proof) | evidence/walk_44.png |

Unit suite: `npx vitest run lib/api.test.ts lib/api-budget.test.ts` → **11/11 pass** (01:35 IST), including both refresh-interceptor contracts ("transient refresh failure … without logging out", "refresh failing on every attempt surfaces the error WITHOUT logging out") — authenticated-path 401 behavior provably unchanged.

## Regression sweep

Did the root fix break anything that PASSED before? Steps re-checked:

| Step                                                                                                         | Still PASS?  |
| ------------------------------------------------------------------------------------------------------------ | ------------ |
| Correct-code login (Step 3 path)                                                                             | ✅ (walk_44) |
| Sign-out → Sign in (Step 21 path, exercised during re-walk setup)                                            | ✅ (walk_41) |
| api.test.ts refresh-interceptor contracts (authenticated 401 → refresh → retry → wipe-on-definitive-failure) | ✅ 11/11     |

**Evidence note:** durable copies of all proof screenshots live in `evidence/` inside this walk folder (12 files; /tmp copies are session-scoped).
