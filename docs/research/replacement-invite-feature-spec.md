# Replacement Invite Feature — PUBG-Style Multi-Worker Invite System

**Document status:** Research synthesis (2026-05-18)  
**Confidence:** High (80%+ across sections; deferred sections noted)

## 1. SUMMARY — What We Found

The **replacement-invite feature** (canonical name: `replacement_invite`) is **specced but not built** in Axhy v3. It's a critical supervisor-to-worker broadcast invite system that fires when a worker no-shows or requests leave, allowing a supervisor to invite multiple eligible candidates with a 2-minute countdown to cover the shift — "first to accept gets the slot."

**Status by layer:**

- ✅ **Master plan** (`now-i-think-it-functional-kernighan.md`): Full Prisma schema + interaction spec (P.4).
- ✅ **Workflow spec** (`workflow-design-closure.md`): Worker surface + acceptance flow (§5.1.6 + Decision 4).
- ✅ **Audit evidence**: 5 persona audits document realistic scenarios (Ravi 8g, Suresh W-6).
- ✅ **Notification enum**: Kind = `replacement_invite` in schema + Zod validation.
- ⚠️ **Backend routes**: No `POST /replacement-invite` endpoint exists.
- ⚠️ **Database model**: `ReplacementInvite` table not in active `schema.prisma`.
- ⚠️ **Mobile UI**: Stub in `ReplacementPicker` component (lines 105–107 in `done-memo-supervisor-sprint-2026-05-17.md`); deferred.
- ⚠️ **State machine**: No transitions defined yet in `packages/state-machines/`.

**Layer status**: Deferred from Layer 1. Slated for **Layer 4** (worker trust surfaces) after Layers 2–3 complete.

---

## 2. EXISTING REFERENCES — Every File Touched

### 2.1 Core Design Documents

| File                                                                                             | Lines                      | Content                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/Users/thotaakshay/.claude/plans/now-i-think-it-functional-kernighan.md`                        | 976, 1282, 1864–1887, 3250 | Master plan: "PUBG-style invite system"; Prisma schema P.4 with `ReplacementInvite` model (fields: id, companyId, fromSupervisorId, toWorkerId, visitId, siteId, scheduledStart, status [PENDING/ACCEPTED/DECLINED/EXPIRED], sentAt, expiresAt, respondedAt, respondReason); 2-min TTL; indexes on (toWorkerId, status) and (fromSupervisorId, sentAt). |
| `/Users/thotaakshay/eclean_workspace/axhy-v3/docs/specs/2026-05-15-workflow-design-closure.md`   | 396, 398, 674              | Closure spec §5.1.5–5.1.6: "Replace invites per affected site-shift"; §5.1.6 worker surface (6): "Push with site/shift/pay/countdown; Accept button ≤2min (notification-action); fires `ReplacementInvite.state=ACCEPTED` + new Assignment + notification to supervisor"; Decision 4 (supervisor-change notifications) applies.                         |
| `/Users/thotaakshay/eclean_workspace/axhy-v3/docs/specs/2026-05-14-operations-workflow-model.md` | 99, 102                    | Ops model: Worker authority includes "accepting...replacement invites"; Notification sourceEntity enum includes `replacement_invite`.                                                                                                                                                                                                                   |

### 2.2 Audit & Scenario Documents

| File                                                                                            | Lines                     | Content                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/Users/thotaakshay/eclean_workspace/axhy-v3/docs/audits/2026-05-14-1yr-sim-supervisor-ravi.md` | 57, 67, 285–293, 406, 536 | Ravi audit: Month 8a (voice-captured leave sends replacement invite for Lakeview Friday only); Month 8g (Workflow 8g — replacement invite live across binding boundary: Ravi sends 6:58am, acting-binding+TTL overlap 7am, Lakshmi inherits live pending invite, candidate accepts 7:01am); Decision-verdict `[WORKS]` operationally but `[CONFUSING]` for inherited supervisor context. |
| `/Users/thotaakshay/eclean_workspace/axhy-v3/docs/audits/2026-05-14-1yr-sim-worker-suresh.md`   | 273, 381                  | Suresh audit: W-6 "Accept a replacement invite" surface; referenced as Day 7 implementation missing.                                                                                                                                                                                                                                                                                     |
| `/Users/thotaakshay/eclean_workspace/axhy-v3/docs/audits/2026-05-15-1yr-sim-system-combined.md` | 120, 122, 237, 338, 350   | Combined audit: ~12 affected supervisors mic-capturing simultaneously (Day 3 cluster); 50+ in-flight replacement invites (2-min TTL each); worker-side surfaces cluster.                                                                                                                                                                                                                 |

### 2.3 Handoff & Roadmap

| File                                                                                            | Lines | Content                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/Users/thotaakshay/eclean_workspace/axhy-v3/handoff/ROADMAP.md`                                | 64    | Layer 4 scope: "12 worker trust surfaces — home shell, clock-in/out, leave, **replacement-invite**, dispute, suspension, termination + appeal + records, pay/attendance." |
| `/Users/thotaakshay/eclean_workspace/axhy-v3/handoff/done-memo-supervisor-sprint-2026-05-17.md` | 129   | ReplacementPicker (105–107) ⚠️ **DEFERRED** — "replacement-invite write path not built."                                                                                  |
| `/Users/thotaakshay/eclean_workspace/axhy-v3/handoff/execution-state/combined.md`               | 202   | "Plus per-site complaint button, **replacement-invite UI** — Coming soon (Slice 2+)."                                                                                     |
| `/Users/thotaakshay/eclean_workspace/axhy-v3/handoff/execution-state/supervisor-ravi.md`        | 458   | "Next required step: Design wave 5 — **replacement invite flow** (worker-app dependent)."                                                                                 |
| `/Users/thotaakshay/eclean_workspace/axhy-v3/handoff/workflow-maps/supervisor-ravi.md`          | 71–82 | Workflow diagram: `Replace →                                                                                                                                              | "yes — F28" | InviteRoute[POST replacement-invite]` ⚠️ **notstarted**. "What's intended but missing: Replacement invite (F28): no backend route, no UI, no worker-side response surface." |

### 2.4 Schema & Types

| File                                                                                         | Lines     | Content                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema/src/zod/notification.ts` | 25, 20–35 | NotificationKindSchema includes `'replacement_invite'` enum variant (line 25). Full list: supervisor_change, termination_applied, termination_notified_to_subject, leave_status, **replacement_invite**, flag_alert, hr_update, ai_budget_alert, binding_change, site_state_change, worker_activation_complete, doc_pending_reminder, worker_appeal_resolved, hr_fallback_invoked. |
| `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema/prisma/schema.prisma`    | 938       | Notification model comment lists kind enum: `` `replacement_invite` `` as valid. Model itself exists (lines 931–960) for persistence.                                                                                                                                                                                                                                              |

### 2.5 Mobile Components (Stub)

| File                                                                                           | Lines            | Content                                                                                                                                 |
| ---------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/mobile/components/today/SiteActionSheet.tsx` | 4, 34            | Action sheet comment: "Opens with 4 actions: Mark as priority, Add site rule, **Send replacement**, ..."; label defined but no handler. |
| `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/mobile/components/today/SiteCard.tsx`        | (found via grep) | Component exists but replacement surface deferred.                                                                                      |

---

## 3. RECOMMENDED SPEC (If Absent) — Comprehensive Feature Design

### 3.1 Entity Model

**ReplacementInvite (to be added to schema.prisma)**

```prisma
model ReplacementInvite {
  id              String    @id @default(uuid()) @db.Uuid
  companyId       String    @db.Uuid
  /// Supervisor who initiated the invite
  fromSupervisorId String   @db.Uuid
  /// Worker being invited (must have active Assignment on same site)
  toWorkerId      String    @db.Uuid
  /// The Visit that needs covering (links back to attendance/shift context)
  visitId         String    @db.Uuid
  siteId          String    @db.Uuid
  /// Shift start time (context for worker)
  scheduledStart  DateTime
  /// Status: PENDING → (ACCEPTED | DECLINED | EXPIRED)
  status          String    @default("PENDING")  // Enum: PENDING | ACCEPTED | DECLINED | EXPIRED
  /// Sent timestamp
  sentAt          DateTime  @default(now())
  /// expiresAt = sentAt + 2 minutes (180 seconds)
  expiresAt       DateTime
  /// When worker accepted/declined
  respondedAt     DateTime?
  /// Reason if declined (optional; e.g. "Already scheduled", "Too far")
  respondReason   String?
  /// When TTL cron expired the row (if not responded)
  expiredAt       DateTime?

  // Relations
  fromSupervisor  User      @relation("ReplacementInvite_SentBy", fields: [fromSupervisorId], references: [id], onDelete: Cascade)
  toWorker        Worker    @relation("ReplacementInvite_ReceivedBy", fields: [toWorkerId], references: [id], onDelete: Cascade)
  visit           Visit     @relation(fields: [visitId], references: [id], onDelete: Cascade)
  site            Site      @relation(fields: [siteId], references: [id])

  // Indexes: (1) fast lookup for worker's pending invites; (2) supervisor audit trail
  @@index([toWorkerId, status, expiresAt])
  @@index([fromSupervisorId, sentAt(sort: Desc)])
  @@index([companyId, siteId, status, expiresAt])
  @@schema("axhy")
}
```

**Decision state machine:**

- `PENDING` → `ACCEPTED` (worker taps "Accept"; fires Assignment creation)
- `PENDING` → `DECLINED` (worker taps "Decline"; captures respondReason)
- `PENDING` → `EXPIRED` (TTL cron fires at expiresAt; auto-transition)

**Concurrency & idempotency:**

- Unique constraint on `(companyId, visitId, toWorkerId)` (only one invite per worker per visit).
- First to ACCEPTED wins (if multiple workers somehow bypass, last-write-wins on Assignment creation due to Visit's existing uniqueness on (visitId, workerId) → conflict caught at Assignment layer).
- TTL expiry is cron-based (like F-003 `binding-expire-sweep.ts`); no race because row is immutable once status ≠ PENDING.

### 3.2 Routes & Handlers

**Supervisor-side (backend)**

```ts
// POST /supervisor/replacement-invites
// Input: { visitId, toWorkerIds[], siteSupervisorId }
// Validates: visit exists + shifts in next 8h + workers have active Assignment on siteId
// Action: Creates N ReplacementInvite rows (bulk fan-out)
// Output: { inviteIds[], broadcastStarted, expiresAt: now + 2min }
// Side effects:
//   - Insert Notification rows (kind: 'replacement_invite') for each toWorkerId
//   - Enqueue outbox: topic 'notification.replacement_invite_sent'
//   - AuditEvent: REPLACEMENT_INVITE_SENT (supervisor, visitId, candidateCount)

// DELETE /supervisor/replacement-invites/:inviteId
// Action: Supervisor can cancel a pending invite before TTL (before own cascade ends)
// Output: { status: "CANCELLED", cancelledAt }
// Side effects: Notification cancel (kind: 'replacement_invite_cancelled') to affected worker
```

**Worker-side (backend)**

```ts
// POST /worker/replacement-invites/:inviteId/accept
// Input: { inviteId }
// Validates: invite exists + status='PENDING' + not expired + worker matches toWorkerId
// Action:
//   1. Transition ReplacementInvite.status to ACCEPTED
//   2. Create new Assignment (workerId, visitId, siteId, status='CONFIRMED_REPLACEMENT')
//   3. Enqueue outbox: topic 'notification.replacement_invite_accepted'
// Output: { assignmentId, shift }
// Side effects:
//   - Notification to fromSupervisor (kind: 'replacement_invite_accepted'; payload: worker name, shift time)
//   - AuditEvent: REPLACEMENT_INVITE_ACCEPTED (workerId, inviteId, supervisorId)

// POST /worker/replacement-invites/:inviteId/decline
// Input: { inviteId, reason?: string }
// Action: Transition status to DECLINED; capture respondReason
// Side effects:
//   - Notification to supervisor (kind: 'replacement_invite_declined'; worker name, reason)
//   - AuditEvent: REPLACEMENT_INVITE_DECLINED
```

**TTL sweep (cron)**

```ts
// Job: replacement-invite-expire-sweep (runs every 30s or per-minute)
// Query: SELECT * FROM ReplacementInvite WHERE status='PENDING' AND expiresAt < now()
// Action: Bulk update status to 'EXPIRED', set expiredAt = now()
// Side effects:
//   - Enqueue notification (kind: 'replacement_invite_expired') for each affected toWorkerId
//   - AuditEvent: REPLACEMENT_INVITE_EXPIRED (per row)
```

### 3.3 Mobile UI — Worker Surface

**Home shell — replacement invite card (if PENDING invites exist)**

```
┌─ REPLACEMENT OFFER ─────────────┐
│ From: Ravi (Supervisor)          │
│ Site: Lakeview Tower             │
│ Time: 7:00 AM – 2:00 PM (Today)  │
│ Offer: ₹200 bonus                │
│ Expires in: 1:47 (countdown)     │
│                                   │
│  [ACCEPT] [DECLINE]              │
└─────────────────────────────────┘
```

**Tap → full detail panel:**

- Site map/address
- Co-workers on the same shift
- Supervisor name + phone call button
- Supervisor's note (optional; captured at invite time)
- Accept/Decline buttons
- Fine-print: "Offer expires in X minutes"

**Post-accept confirmation:**

```
✓ Shift confirmed for [Site] [Time]
  Supervisor will contact you if needed.
  [Close] [View Shift Details]
```

**Push notification (lock-screen action on iOS 10+):**

```
"Replacement offer at Lakeview Tower — 7 AM today. Accept? (Expires in 2 min)"
[Accept]  [Decline]  [View]
```

### 3.4 Supervisor Surface — Replacement Picker (R6 follow-up)

**Today tab → site card → "Send replacement" action → modal:**

1. **Candidate selector:** List of eligible workers (Assignment active on same site; not on leave; not flagged suspended; preferred language for context).
   - Sort: (a) primary assignment priority, (b) recent-shift frequency, (c) distance from site
   - Allow multi-select (broadcast invite to top N).
   - Show: name, distance, last shift at this site, favorability score (optional AI pre-rank).

2. **Shift details auto-filled:** Visit shift time, pay amount, bonus prompt.

3. **Optional note field:** Supervisor can add "This is urgent — Lakshmi is covering, need ASAP" (context for inherited scenarios per 8g audit).

4. **Send button:** Creates N ReplacementInvite rows; shows countdown "2-min timer started; check Decisions for accepts."

5. **Live status (Decisions tab expansion):** Workers' responses stream in real-time (if connected). ACCEPTED → Today card updates immediately. DECLINED → crossed out. EXPIRED → grayed out.

### 3.5 Notification Payload Schema

```ts
// Zod schema for Notification.payload when kind='replacement_invite'
export const ReplacementInviteNotificationPayloadSchema = z.object({
  inviteId: z.string().uuid(),
  fromSupervisorId: z.string().uuid(),
  fromSupervisorName: z.string(),
  siteId: z.string().uuid(),
  siteName: z.string(),
  scheduledStart: z.string().datetime(), // ISO
  scheduledEnd: z.string().datetime(), // ISO
  paymentAmount: z.number(), // in paise
  bonusAmount: z.number().optional(),
  expiresAt: z.string().datetime(),
  messageKey: z.string(), // 'replacement_invite.offer' | 'replacement_invite.expired' | 'replacement_invite.accepted'
  messageVars: z.record(z.string()), // { siteName, supervisorName, shift_time, bonus, expires_in_minutes }
  schemaVersion: z.literal(1),
});
```

**Localization:** messageVars rendered in `Worker.preferredLanguage` (default 'hi').

---

## 4. INTERACTION WITH EXISTING SURFACES

### 4.1 Decisions Queue (Supervisor)

- When an invite is **sent**: AuditEvent `REPLACEMENT_INVITE_SENT` lands; supervisor sees badge "2 pending accepts" in Decisions tab.
- When **accept** occurs: Real-time update (via WebSocket or polling) shows "✓ Ramu accepted at 6:47am" in the same Decisions row.
- When **decline**: "✗ Ramu declined (reason: too far)" appears; supervisor can immediately send to next candidate or manually reassign.
- When **expired**: Auto-grayed out; supervisor prompted "Lakeview shift still open — send another round?" with one-tap quick-resend.

### 4.2 Leave Request Lifecycle

- Worker submits leave → `LeaveRequest.state = REQUESTED`.
- Leave **APPROVED** → for each affected site-shift on affected dates:
  - Trigger `LEAVE_APPROVED` AuditEvent.
  - **Create** ReplacementInvite rows (one per site if worker is multi-site).
  - Per closure spec §5.1.5: "replacement-invite cascade fires per affected site-shift, not just primary site."
  - **Example:** Suresh on leave Fri–Sun covers Lakeview + Manikonda shifts → 6 invites (2 sites × 3 days).

### 4.3 AuditEvent Integration

New audit kinds (closure spec §9):

- `REPLACEMENT_INVITE_SENT` — payload: { inviteId, fromSupervisorId, toWorkerIds[], siteId, visitId, candidateCount }
- `REPLACEMENT_INVITE_ACCEPTED` — payload: { inviteId, workerId, assignmentId, acceptedAt }
- `REPLACEMENT_INVITE_DECLINED` — payload: { inviteId, workerId, reason }
- `REPLACEMENT_INVITE_EXPIRED` — payload: { inviteId, toWorkerId }
- `REPLACEMENT_INVITE_CANCELLED` — payload: { inviteId, fromSupervisorId, cancelledAt }

### 4.4 OneSignal Push Delivery (F-011 scope)

- F-007 writes `Notification` rows with `kind='replacement_invite'` and `channel='push'`.
- F-011 (OneSignal adapter) reads the row + discovers `expiresAt`.
- F-011 delivers via OneSignal SDK; honors 2-min TTL (if expiresAt < now(), skip delivery with `failureReason='invite_expired'`).
- **Lock-screen actions (iOS 10+):** NotificationService specifies two UNNotificationAction buttons: "Accept" (green) + "Decline" (gray).
- **Accept action tap** → worker app wakes up with deeplink `/replacement-invite/:inviteId/accept` → calls POST endpoint above.

### 4.5 Swap Request Flow (Reference)

Replacement invites are **different** from swap requests:

- **Swap:** worker A ↔ worker B (bilateral negotiation; both must agree).
- **Replacement invite:** supervisor → worker (one-way broadcast to eligible candidates; first to accept wins).

Both feed the Decisions queue but have separate state machines.

---

## 5. DECISION LIFECYCLE — State Transitions & Race Conditions

### 5.1 Happy Path

```
User (Supervisor)                  System                         Worker
═════════════════════             ══════════════════             ═══════════════
Opens site card
├─ "Send replacement"
└─ Modal opens
     │
     ├─ Select workers (Ramu, Vikram)
     │
     ├─ [Send]
     │    │
     │    └──→ POST /supervisor/replacement-invites
     │         ├─ Create ReplacementInvite row (Ramu)
     │         ├─ Create ReplacementInvite row (Vikram)
     │         ├─ Create Notification rows (push + in_app_banner) × 2
     │         ├─ Emit AuditEvent: REPLACEMENT_INVITE_SENT
     │         ├─ Enqueue notification dispatch
     │         └─ Response: { expiresAt: 2026-05-18 06:02:00Z }
     │              (2 min from now)
     │
     └─ "2-min countdown started"  ←─────────────────────────────┐
                                                                   │
                                                     Push arrives on Ramu's phone:
                                                     "Replacement: Lakeview 7-2 PM"
                                                     Tap → app opens
                                                          │
                                                          ├─ In-app banner displays
                                                          │  (countdown: 1:53 remaining)
                                                          │
                                                          ├─ Tap [ACCEPT]
                                                          │  │
                                                          │  └──→ POST /worker/replacement-invites/:inviteId/accept
                                                          │       ├─ Check: status='PENDING'
                                                          │       ├─ Check: expiresAt > now()
                                                          │       ├─ Update ReplacementInvite.status='ACCEPTED'
                                                          │       ├─ Create Assignment row (CONFIRMED_REPLACEMENT)
                                                          │       ├─ Emit AuditEvent: REPLACEMENT_INVITE_ACCEPTED
                                                          │       └─ Response: { assignmentId, confirmationText }
                                                          │
                                                          └─ Screen: "✓ Shift Confirmed"
                                                             (Ramu done; app returns to home)
     │
     └─ [Decisions tab] receives update:
        "✓ Ramu ACCEPTED at 6:47 AM"
        (Vikram's invite auto-expires in 1:13)
        [Revert] [Mark confirmed] [Send more]
```

### 5.2 Expired TTL Path

```
expiresAt (now + 2 min)  ← cron runs (every 30s)
      │                      │
      ├──────────────────────┤
      │                      │
      │               Query: PENDING rows with expiresAt < now()
      │               │
      │               ├─ Find ReplacementInvite(Vikram) — expiresAt=6:02, now=6:03
      │               │
      │               ├─ UPDATE status='EXPIRED', expiredAt=6:03
      │               │
      │               ├─ Emit AuditEvent: REPLACEMENT_INVITE_EXPIRED
      │               │
      │               └─ Create Notification: kind='replacement_invite_expired'
      │                  to Vikram (optional: in_app_banner only, no push)
      │
      └─ Supervisor sees grayed-out row in Decisions:
         "Vikram — EXPIRED (no response)"
         [Send to more] [Manually assign]
```

### 5.3 Race Conditions

**Scenario A: Multiple workers click Accept within milliseconds**

- Worker 1 POSTs accept at 6:47:31.000Z.
- Worker 2 POSTs accept at 6:47:31.010Z.
- **Handling:** Unique constraint on `(visitId, workerId)` in Assignment table catches Worker 2's attempt.
- **Behavior:** Worker 2's POST returns 409 Conflict. Client shows: "Someone else already accepted this shift."

**Scenario B: Worker accepts after TTL has expired**

- ReplacementInvite status is PENDING; expiresAt = 6:02:00Z.
- Worker clicks at 6:02:15Z (15 seconds late).
- **Handling:** POST checks `expiresAt > now()`. Fails. Returns 400 Bad Request: "Offer expired."
- **Client:** Shows expired banner; no accept button available.

**Scenario C: Supervisor cancels invite while worker is accepting**

- Supervisor clicks [Revert] on live pending invite at 6:47:45Z.
- Worker's Accept POST arrives at 6:47:46Z.
- **Handling:** Both operations read/write the same ReplacementInvite row. Last-write-wins: if cancel committed first, Accept sees status='CANCELLED' and rejects. If Accept committed first, cancel sees status='ACCEPTED' and silently completes (idempotent cancel).
- **Serialization:** Wrap both in a DB transaction or rely on UPDATE's WHERE clause: `UPDATE ReplacementInvite SET status=? WHERE id=? AND status='PENDING'`.

---

## 6. OPEN QUESTIONS & DEFERRED DECISIONS

| #   | Question                                                                                                                                                                     | Status   | Note                                                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Eligible worker selection logic.** How does supervisor see candidate list? Distance-based? Skill-based? Availability heuristic?                                            | OPEN     | Default recommendation: "workers with active Assignment on same site, not on leave, not suspended; sort by (assignment.priority DESC, recent_shift_frequency DESC, distance ASC)." Owner may prefer AI pre-ranking via assignment-history embeddings. |
| 2   | **Bonus / pay supplement flow.** Closure spec mentions "pay supplement" — is this auto-calculated or supervisor-entered? Audit trail?                                        | OPEN     | Design decision: suggest supervisor enters override if desired; AuditEvent captures it. Default: base shift pay (from Visit.rateAmount).                                                                                                              |
| 3   | **Cancellation authority.** Can supervisor cancel a PENDING invite? Only before expiry, or any time?                                                                         | OPEN     | Recommendation: allow until expiresAt; if accepted, cannot cancel (Assignment already created).                                                                                                                                                       |
| 4   | **Multi-accept edge case.** If supervisor sends 1 invite to 1 worker (not broadcast), but invite status='PENDING' and worker clicks accept twice (double-tap), what happens? | CLOSED   | Handled: POST is idempotent. Second POST finds Assignment already exists (unique constraint); returns 200 with existing assignmentId.                                                                                                                 |
| 5   | **Declined reason capture.** Worker declines with reason "too far" — store as free text or enum? Audit surface?                                                              | OPEN     | Recommendation: free text for v1; if volume justifies, create enum ['too_far', 'already_scheduled', 'unwell', 'other'] in v3.1.                                                                                                                       |
| 6   | **Worker who received invite but didn't respond after TTL expires.** Do they see an expired banner in home?                                                                  | OPEN     | Recommendation: no persistent banner; Decisions tab shows "EXPIRED — no response" for supervisor only. Worker sees nothing post-expiry.                                                                                                               |
| 7   | **Cross-tenant isolation.** ReplacementInvite row created for CompanyA — can Workers from CompanyB see it?                                                                   | CLOSED   | All queries filter by `companyId`. Schema enforces via Foreign Key to `Company`.                                                                                                                                                                      |
| 8   | **WhatsApp deeplink fallback (if push fails).** Does F-012 SMS integration apply?                                                                                            | DEFERRED | Per closure spec §7 channel fallback: push → SMS → WhatsApp. F-012 handles SMS/WhatsApp. F-007 (notification persistence) handles the first try.                                                                                                      |

---

## 7. CONFIDENCE ASSESSMENT

| Section                                       | Confidence | Basis                                                                                                                                                                      |
| --------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Feature exists specced.**                   | 95%        | Master plan P.4 explicit + closure spec §5.1.6 + audit evidence (Ravi 8g scene).                                                                                           |
| **State machine transitions.**                | 85%        | Audit describes observed behavior; no existing state-machine file yet. Transitions inferred from closure spec + master plan.                                               |
| **2-min TTL design.**                         | 95%        | Master plan specifies `expiresAt = sentAt + 2 min`; Ravi audit 8g validates scenario. Cron-sweep pattern borrowed from F-003 (binding-expire-sweep.ts).                    |
| **Notification.kind = 'replacement_invite'.** | 100%       | Already in `notification.ts` schema.                                                                                                                                       |
| **Supervisor route location.**                | 85%        | Should land in `/supervisor-*` routes (per existing pattern); exact naming TBD.                                                                                            |
| **Worker route location.**                    | 85%        | Should land in `/worker` routes; exact naming TBD.                                                                                                                         |
| **Mobile UI design.**                         | 70%        | Closure spec §5.1.6 describes feature; R6 prototype and handoff note `ReplacementPicker` stub but deferred. UI surface inferred from closure spec narrative + master plan. |
| **Interaction with leave request.**           | 90%        | Closure spec §5.1.5 explicit: "replacement-invite cascade fires per affected site-shift." Multi-site leave scenario documented in Ravi audit Month 8a.                     |
| **Slot filled on Accept.**                    | 95%        | Closure spec: "fires...new Assignment row."                                                                                                                                |
| **OneSignal integration path.**               | 80%        | F-007 writes rows; F-011 will deliver. Per F-007 scope (F-007.md), OneSignal is locked as managed provider. Exact deeplink handling deferred to F-011.                     |

---

## 8. NEXT STEPS FOR IMPLEMENTATION

1. **Add `ReplacementInvite` to `schema.prisma`** — include in Layer 1 migration batch (if Layer 1 hasn't shipped) or Layer 4 migration.
2. **Create state-machine file** — `packages/state-machines/replacement-invite.ts` with transition matrix.
3. **Write routes** — `apps/backend/src/routes/replacement-invites-supervisor.ts` + `...worker.ts`.
4. **Implement cron sweep** — `apps/backend/src/jobs/replacement-invite-expire-sweep.ts`.
5. **Add AuditEvent kinds** — extend enum in closure spec + Zod schema.
6. **Wire Notification dispatch** — ensure `replacement_invite` kind is handled by F-007 + F-011.
7. **Mobile UI** — unblock `ReplacementPicker` stub (Layer 4 gate).

---

**Document prepared by:** Code search agent  
**Date:** 2026-05-18  
**Next review:** When Layer 4 implementation kickoff memo is drafted.
