# Done memo — GAP 7 second half: owner alert on membership-add

**Date:** 2026-06-12 · **Slice:** `gap7-owner-admin-alerts-2026-06-12` · **Locked source:** `docs/locked/security-gaps-to-fix.md` GAP 7 (MEDIUM).

## The real state of GAP 7 (corrected during implementation)

| Mandated surface                 | State                                                                                                                                                                                                                                                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Policy write (any key)           | **Already implemented** before this slice — `policy-service.ts:96-164` (`emitOwnerNotificationsForPolicyChange`, in-tx, actor-skip, kind `policy_changed`). My earlier "fully open" read was wrong: it uses direct in-tx inserts, not an outbox topic, so the topic-grep missed it.                              |
| Membership change (add admin/HR) | **THIS SLICE** — `adminCreateMembershipService` now emits in the same tx after the `MEMBERSHIP_CREATED` audit: `Notification` rows (kind `membership_created`, `in_app_banner`, `STANDARD`) to every ACTIVE OWNER of the company, skipping the actor.                                                            |
| Membership change (remove)       | N/A-until-built — no remove route exists; add the same emission when it does.                                                                                                                                                                                                                                    |
| "Apply Urgently" push            | **Honestly re-scoped:** `chat-reload-context` is `requireRole('SUPERVISOR')` — a supervisor pulling context, not an admin changing rules. Alerting owners on every supervisor reload would be noise outside GAP 7's intent. If a real admin→supervisors urgent-push surface is ever built, it gets the emission. |
| Company setting changes          | N/A-until-built — no write route exists (`admin-company.ts` is GET-only).                                                                                                                                                                                                                                        |

## Verification

- `test/owner-admin-action-alert.test.ts` **1/1** on the real DB through the real route (`POST /admin/memberships`): owner notified with actor+role payload; **actor-skip** (owner-created membership adds no self-row); **cross-tenant negative control** (tenant-B owner: zero rows).
- One TDD-side correction: the route returns **200** (not 201) — the test was aligned to the route's actual contract.
- Backend `tsc --noEmit` EXIT 0.

## Notes

- Same-tx emission ⇒ rollback leaves no orphan notifications (mirrors the policy pattern byte-for-byte).
- Delivery remains `in_app_banner` rows + the F-011/Phase-D delivery track, identical to every other notification kind today.
