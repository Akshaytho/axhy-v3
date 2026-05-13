---
Status: Active
Last validated against code: 2026-05-12
Validated branch: feat/phase-c-wave-4b-chat-completion
Validated commit: 9ff6e26
Primary owner: founder (Akshay Thota)
Replaces: nothing — first-version
Replaced by: nothing — current Active
---

> **Active 2026-05-12 (Stage 2 of Draft → Active promotion).** Launch policy is locked: push-only notifications, audience = all supervisors in `companyId`, mixed-tier digests forbidden, no reminder/escalation, no per-rule viewed tracking, soft cap 10 child rules with warning header (no hard reject). Schema source (`HRUpdate`, `HRUpdateRule`, `ackedAt`, `ackText`) is D.1 §2.9. Contradiction #11 from R6 §4 is now **Resolved** by this Active spec. Classified **Active but contract-incomplete** in `canonical-truth.md` — 10+ launch gaps named in §10 out-of-scope list.

# HR Updates Spec (companion to D.1 §2.5 + §2.9)

## 1. What this spec covers

This spec specifies the HR Updates **route surface, notification fan-out, audience model, and launch policy decisions** for the supervisor-facing HR Updates tab (R6 prototype `updates.jsx`).

**Already locked in `docs/specs/2026-05-12-decision-entity-lock.md` (Active):**

- §2.5 HR row: HR is direct APPLIED in `DecisionWorkspaceItem`; ack is a parallel lifecycle (no DWI state transition)
- §2.9: parent `HRUpdate` + child `HRUpdateRule` schema; three update shapes (standalone body-only, digest, digest-with-summary); append-only/immutable; `ackedAt + ackText` on `HRUpdate`; single ack covers all child rules
- Audit kinds (named): `HR_UPDATE_POSTED`, `HR_UPDATE_ACKED`

**This spec adds:**

- Routes for HR posting + supervisor ack + supervisor inbox
- Notification fan-out semantics (push only at launch)
- Audience model (all supervisors in `companyId` at launch)
- Mixed-tier digest policy (forbid mixing at launch)
- Reminder / escalation policy (none at launch)
- Per-rule viewed tracking policy (skip at launch)
- HR-side admin validation rules
- Soft digest size cap

This spec **does NOT** re-derive D.1's schema. Schema changes go in D.1.

## 2. Routes

### 2.1 `POST /hr-updates` — HR creates an update

**Caller:** HR admin (via admin-web HR portal — future surface; for launch, this route exists and is callable but the admin-web UI may not yet expose it).

**Body shape:**

```jsonc
{
  "title": "string", // required, max 200 chars
  "body": "string | null", // optional summary or single-rule content
  "rules": [
    // optional; if present, this is a digest
    {
      "title": "string", // required, max 200 chars
      "body": "string", // required, max 5000 chars
      "tier": "NOTE | OPERATIONAL | PERSONNEL | EMPLOYMENT", // per launch policy, all rules must share tier (see §5)
    },
  ],
  "ackRequired": true, // defaults to true; locked at launch
}
```

**Tx scope:**

1. Validate caller is HR admin (`Membership.role = HR_ADMIN` or equivalent).
2. Validate audience (per §4) — at launch, defaults to all supervisors in caller's `companyId`.
3. Validate mixed-tier digest policy (per §5): if `rules[]` present, ALL rules MUST share the same `tier`. Reject with `MIXED_TIER_NOT_ALLOWED` on mismatch.
4. Validate digest size: if `rules.length > 10`, return a warning header (`X-HR-Update-Warning: SOFT_CAP_EXCEEDED`) but do NOT reject. Soft cap, per Phase B pick.
5. Create `HRUpdate` row + `N` `HRUpdateRule` child rows in one tx.
6. Write `AuditEvent(kind = 'HR_UPDATE_POSTED', actorId = $auth.userId)` with payload referencing the HRUpdate id and (if digest) child rule count.
7. Fire outbox topic `hr_update.posted` for fan-out (per §3).

**Failure modes:**

- `MIXED_TIER_NOT_ALLOWED` (per §5)
- `BAD_INPUT` (title length, missing required fields)
- `PERMISSION_DENIED` (caller is not HR admin)
- `TENANT_CONTEXT_MISMATCH` (caller's `companyId` doesn't match audience scope — should never happen at launch since audience always equals caller's company)

### 2.2 `POST /hr-updates/:id/ack` — Supervisor acknowledges

**Caller:** any supervisor in the HRUpdate's audience.

**Body:**

```jsonc
{
  "ackText": "string", // required; must contain ≥5 words after trim
}
```

**Tx scope:**

1. Load HRUpdate by id; validate `companyId` matches caller's `auth.companyId` (reject with `TENANT_CONTEXT_MISMATCH` if not).
2. Validate caller is in audience (per §4) — at launch, all supervisors in `companyId` qualify.
3. Validate `ackText.trim().split(/\s+/).filter(Boolean).length >= 5`. Reject with `ACK_TEXT_TOO_SHORT` if not.
4. If `HRUpdate.ackedAt IS NOT NULL` AND `HRUpdate.ackText === $ackText` (same content), return cached success (idempotent retry).
5. If `HRUpdate.ackedAt IS NOT NULL` AND `HRUpdate.ackText !== $ackText` (different content), reject with `ALREADY_ACKED`.
6. Single tx: set `HRUpdate.ackedAt = now()`, `HRUpdate.ackText = $ackText`. Write `AuditEvent(kind = 'HR_UPDATE_ACKED', actorId = $auth.userId)`.
7. Per D.1 §2.5, this does NOT trigger a `DecisionWorkspaceItem` state transition; ack is a parallel lifecycle.

**Failure modes:**

- `TENANT_CONTEXT_MISMATCH`
- `NOT_IN_AUDIENCE` (rare at launch since audience is all-supervisors)
- `ACK_TEXT_TOO_SHORT`
- `ALREADY_ACKED` (only when retry has different content than the cached ack)

### 2.3 `GET /hr-updates` — Supervisor inbox

**Caller:** any supervisor.

**Query parameters:**

- `status`: `pending | acked | all` (default: `pending`)
- `since`: optional cursor (ISO 8601 timestamp on `postedAt`)
- `limit`: default 50, max 100

**Response:**

```jsonc
{
  "updates": [
    {
      "id": "uuid",
      "title": "...",
      "body": "..." | null,
      "rules": [                          // present only if HRUpdate has children
        { "id": "...", "title": "...", "body": "...", "order": 1 }
      ],
      "postedAt": "...",
      "ackRequired": true,
      "ackedAt": "..." | null,
      "ackText": "..." | null,
      "ackedByMe": true | false           // computed per caller
    }
  ],
  "nextCursor": "..." | null
}
```

**Two list sections rendered client-side** (R6 `updates.jsx` already does this):

- NEEDS YOUR ACK: `WHERE ackedAt IS NULL AND companyId = $auth.companyId`
- RECENT — ACKNOWLEDGED: `WHERE ackedAt IS NOT NULL AND companyId = $auth.companyId ORDER BY ackedAt DESC LIMIT N`

`ackedByMe` is computed per-caller. At launch — where audience is all supervisors — `ackedByMe` reflects whether THIS caller is the one who acked.

### 2.4 Per-rule read endpoint — deferred

**Launch:** no dedicated per-rule endpoint. The `GET /hr-updates` response includes child rules inline (see §2.3). Per-rule client-side rendering is handled by R6 `DigestRuleList`.

**Deferred:** if per-rule "viewed" event tracking becomes a compliance requirement (per §8), introduce `POST /hr-updates/:id/rules/:ruleId/viewed` to write a `HR_UPDATE_RULE_VIEWED` AuditEvent. Not at launch.

## 3. Notification fan-out

### 3.1 Channel choice — push only at launch

Per Phase B pick: **push notifications only.** Supervisors receive a push via the supervisor mobile app's existing push subscription.

**Deferred to v3.1+:** WhatsApp, SMS, email. The outbox/dispatcher architecture supports adding channels, but channel-specific delivery infrastructure (Gupshup, Twilio, SES, etc.) is out of scope here. If founder later wants WhatsApp, that's a separate spec with its own audience preference model.

### 3.2 Trigger semantics

On successful `POST /hr-updates`, the route fires outbox topic `hr_update.posted` (per §2.1 step 7). The dispatcher handler:

1. Loads the HRUpdate.
2. Resolves the audience (per §4) — at launch: all supervisors in `companyId`.
3. For each supervisor in audience: look up push subscription token; enqueue push send.
4. If a supervisor has no push subscription (e.g., they haven't enabled push or the token has expired): log silently. No fallback to other channels at launch.

**Push payload:**

```
Title: "New HR update: <HRUpdate.title>"  (truncate to 60 chars)
Body:  digest? "<rules.length> rules · needs your ack"
              : "needs your ack"
Deep link: opens supervisor app → Updates tab → focus on this HRUpdate
```

### 3.3 Outbox topics emitted by HR routes

- `hr_update.posted` — fired by `POST /hr-updates` on success. Consumer: notification dispatcher.
- `hr_update.acked` — fired by `POST /hr-updates/:id/ack` on success. Consumer: observability (admin-web HR portal renders ack rate). **No notification fan-out at launch** — HR admin checks the portal; supervisors don't need cross-supervisor ack visibility.

## 4. Audience model

### 4.1 Launch — all supervisors in `companyId`

When HR posts an HRUpdate, **every active supervisor (`Membership.role = SUPERVISOR AND status = active`) in the company's tenant** is in the audience. No filtering by role, site, geography, or any other dimension.

**Audience resolution query:**

```sql
SELECT u.id
FROM User u
JOIN Membership m ON m.userId = u.id
WHERE m.companyId = $hrUpdate.companyId
  AND m.role = 'SUPERVISOR'
  AND m.status = 'active'
```

Push fan-out hits `N` notifications where `N` = active supervisor count.

### 4.2 Deferred — scoped audience

If HR needs to target a role subset (e.g., only floor supervisors) or specific sites (e.g., only Apollo Hospital supervisors), the audience model gains a filter parameter on `POST /hr-updates`. **Deferred to v3.1+.** Resolution shape would be: add optional `audience: {role?: string, siteIds?: string[]}` to the request body; route validates and resolves the filtered audience query.

## 5. Mixed-tier digest policy

### 5.1 Launch — forbid mixing (per Phase B pick)

An `HRUpdate` digest MUST have all child `HRUpdateRule` rows sharing the same `tier`. If HR tries to post a digest with mixed tiers (e.g., 4 OPERATIONAL + 1 EMPLOYMENT rule), `POST /hr-updates` rejects with `MIXED_TIER_NOT_ALLOWED`.

**Workaround for HR:** post two separate digests (one per tier).

### 5.2 Deferred — three viable alternatives

D.1 §2.9 named three resolutions: forbid mixing, escalate ack to highest tier, or per-rule ack. Launch picks `forbid`. The other two remain available as future amendments to this spec. Founder revisits if HR feedback demands flexibility.

## 6. Reminder / escalation — none at launch

Per Phase B pick: no automatic reminder or escalation logic at launch. If a supervisor doesn't ack within any time window, the system does nothing. Founder follows up out-of-band (e.g., WhatsApp message to the supervisor).

**Deferred:** push reminder after N days, owner alert after N days, escalation chains. v3.1+.

## 7. HR-side admin route + validation

`POST /hr-updates` is the HR admin route (exposed via admin-web). Validation rules summarised:

| Field      | Constraint                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `title`    | required, 1–200 chars                                                                                            |
| `body`     | optional, max 5,000 chars                                                                                        |
| `rules`    | optional array; if present, each item has `title` (1–200 chars), `body` (1–5,000 chars), `tier` (enum)           |
| Cross-rule | all rules in one digest share `tier` (per §5)                                                                    |
| Size       | soft cap at 10 rules per digest — exceed triggers `X-HR-Update-Warning: SOFT_CAP_EXCEEDED` header but NOT reject |
| Caller     | must be HR admin (`Membership.role = HR_ADMIN` or similar)                                                       |

Admin-web UI (when built) should pre-validate before submission to give HR fast feedback. The route's server-side validation is the authoritative gate.

## 8. Per-rule "viewed" tracking — skip at launch (per Phase B pick)

No per-rule view event tracking at launch. Audit log only emits:

- `HR_UPDATE_POSTED` (granularity: HRUpdate)
- `HR_UPDATE_ACKED` (granularity: HRUpdate)

**Deferred:** if compliance audit later requires "did supervisor expand and view rule #3?" granularity, add the `POST /hr-updates/:id/rules/:ruleId/viewed` route + `HR_UPDATE_RULE_VIEWED` audit kind. v3.1+.

## 9. Cross-references

- Schema source: `docs/specs/2026-05-12-decision-entity-lock.md` §2.5 (HR row in writer table), §2.9 (HRUpdate + HRUpdateRule schema + ack flow)
- Surface design: `docs/specs/2026-05-12-supervisor-mobile-r6-design.md` (R6 prototype `updates.jsx`)
- Prototype: `docs/prototypes/supervisor-mobile-r6/project/src/updates.jsx`
- Doc discipline: `docs/protocols/doc-discipline.md`
- Canonical index: `docs/index/canonical-truth.md`
- R6 contradiction #11 (which this Draft addresses; full Resolution waits on this spec flipping Active)
- Product framing (Draft): `docs/specs/2026-05-13-product-framing.md` §13 — clarifying product-framing under review on HR ack as primarily operational attention / context-loading (compliance evidence secondary). Does not yet govern this spec; ack semantics here remain authoritative until that Draft is promoted to Active.

## 10. Out-of-scope / known launch gaps

This Draft intentionally defers (each named so future review can confirm or revise):

- WhatsApp / SMS / email notification channels (push-only at launch per §3.1)
- Scoped audience filtering beyond `all supervisors in companyId` (per §4.2)
- Reminder / escalation logic (per §6)
- Per-rule "viewed" event tracking (per §8)
- Mixed-tier digest behavior beyond forbidding (per §5.2)
- Hard digest size limits (soft cap only per §7)
- Admin-web HR portal UI design (this spec specifies the route contract, not the UI)
- Future HRUpdate optional fields: severity, category, deadline, attribution beyond audit metadata
- Cross-supervisor ack visibility (other supervisors do not see who has/hasn't acked)
- HRUpdate retraction / correction flows (append-only at launch per D.1 §2.9 immutability rule)

## 11. Approval gate

This spec flips Status: Draft → Active only after:

1. External advisor pressure-test review (forwarded by founder)
2. Founder explicit approval
3. Decision entity lock D.1 itself reaching at least review-confirmed status on the §2.9 schema shape (since this spec depends on those fields being stable)

Until then, do not implement the route surface or fan-out infrastructure. R6 §4 row #11 is **addressed** (in this Draft) but not yet fully **Resolved** — that flip waits for this spec to itself flip Active.
