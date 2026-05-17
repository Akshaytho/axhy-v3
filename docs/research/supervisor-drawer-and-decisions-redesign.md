# Supervisor Drawer + Decisions Queue + Chat-to-Complaint Redesign

**Date:** 2026-05-18
**Audience:** v3 supervisor-mobile build team, panel, founder
**Status:** Spec — not yet panel-locked
**Touches:** `apps/mobile/app/(supervisor)/`, `apps/mobile/components/`, `apps/backend/src/routes/`, `packages/shared-schema/src/zod/supervisor-decision-kinds.ts`, `packages/shared-schema/prisma/schema.prisma`

---

## 0. Confidence ledger

| Claim / decision                                                                                                                             | Confidence           | Basis                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Current 5 tabs (Today / Decisions / Activity / Chat / Profile) stay as-is                                                                    | 99% own              | Read `_layout.tsx` (lines 113–155)                                                                                          |
| Current Drawer items are profile/memory/sites/language/notifications/help/temporary-mode/sign-out                                            | 99% own              | Read `Drawer.tsx` (lines 79–88)                                                                                             |
| `LOG_COMPLAINT` already exists in registry as `site-targeted`, NOTE-tier, no toolName                                                        | 99% own              | `supervisor-decision-kinds.ts` lines 96–102                                                                                 |
| `Complaint` Prisma model exists with id/siteId/supervisorId/text/severity/resolvedAt/resolvedBy                                              | 99% own              | `schema.prisma` lines 598–623                                                                                               |
| `Complaint` model has NO `kind` / `threadId` / `hrReplies[]` fields today                                                                    | 99% own              | Same read; absence is verifiable                                                                                            |
| Existing `POST /sites/:id/complaints` route already creates Complaint rows                                                                   | 98% own              | `sites.ts` lines 38–125                                                                                                     |
| `SwapRequest` model exists; `decideSwap` endpoint pattern matches leave-requests                                                             | 95% own              | Confirmed `swap-requests.ts` is registered; read schema lines 634–664                                                       |
| `ChatMessage` has `threadId`, `decisionCard JSON`, no `complaintId` FK today                                                                 | 99% own              | `schema.prisma` lines 330–364                                                                                               |
| Decision queue today renders by `section` (NEEDS_YOU_NOW / ROUTINE / FAILED_REVIEW) not by `kind` — kind-specific UIs need new card variants | 99% own              | `decisions.tsx` + `DecisionCard.tsx`                                                                                        |
| Intercom/Zendesk thread tickets on a `conversationId`/`ticketId` foreign key into messages                                                   | 96% research-derived | Intercom Inbox & Zendesk Support API docs (`conversation_id`, `ticket.comment` array, replies attached to parent ticket id) |
| Slack uses `thread_ts` to anchor child messages to a parent message id                                                                       | 97% research-derived | Slack `chat.postMessage` API contract                                                                                       |
| Voice-to-ticket (HappyFox/Zoho) flow: transcribe → NLP intent → auto-fill ticket form → human confirms                                       | 95% research-derived | HappyFox AI Assist + Zoho Desk Zia patterns                                                                                 |
| BookMyBai / UrbanCompany supervisor flows are mostly call-centre + manual ticket entry (no published API) — limited prior art                | 88% research-derived | Public help-centre articles; product walkthroughs on YouTube. Treat as weak prior art; we innovate.                         |
| Founder's intent: drawer = entry points, queue = decision surface, chat = capture surface — three roles, no overlap                          | 97% own              | Direct quote in task brief                                                                                                  |

---

## A. Drawer redesign

### A.1 Current state (read from `Drawer.tsx`)

| #   | Label           | Sub                                  | Route                                      |
| --- | --------------- | ------------------------------------ | ------------------------------------------ |
| 1   | My profile      | Stats · streaks · prefs              | `/(supervisor)/profile`                    |
| 2   | Memory & rules  | 23 rules · 12 aliases · 8 site notes | `/(supervisor)/memory`                     |
| 3   | My sites        | {N} sites · {M} with active rules    | `/(supervisor)/sites`                      |
| 4   | Language        | English · हिन्दी · తెలుగు            | `/(supervisor)/profile` (section)          |
| 5   | Notifications   | Push · WhatsApp · Email              | `/(supervisor)/profile` (section)          |
| 6   | How to use Axhy | 60-sec video · examples              | `Linking.openURL('https://axhy.app/help')` |
| 7   | Temporary mode  | Pause AI for the day                 | inline modal                               |
| 8   | Sign out        | —                                    | `onAppLogout`                              |

### A.2 New drawer structure

Drawer is split into THREE bands. Inbox band on top (new), Workspace band middle (existing reorganised), Personal band bottom (existing).

| Band          | Item                | Sub line                            | Badge                                                              | Route (list screen)                               | Notes                              |
| ------------- | ------------------- | ----------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------- | ---------------------------------- |
| **INBOX**     | Leave requests      | "{N} pending"                       | count of `LeaveRequest.state='REQUESTED'` for caller's bound sites | `/(supervisor)/inbox/leave-requests`              | NEW                                |
| **INBOX**     | Swap requests       | "{N} pending"                       | count of `SwapRequest.state='SENT'` for caller's bound sites       | `/(supervisor)/inbox/swap-requests`               | NEW                                |
| **INBOX**     | Replacement invites | "{N} open · {M} expiring soon"      | count of open replacement broadcasts for caller's bound sites      | `/(supervisor)/inbox/replacement-invites`         | NEW (spec'd by other subagent)     |
| **INBOX**     | Complaints          | "{N} open · {M} HR replies unread"  | open complaints for caller's bound sites + unread HR replies       | `/(supervisor)/inbox/complaints`                  | NEW                                |
| **WORKSPACE** | My sites            | "{N} sites · {M} with active rules" | none                                                               | `/(supervisor)/sites`                             | existing                           |
| **WORKSPACE** | Memory & rules      | "23 rules · 12 aliases"             | none                                                               | `/(supervisor)/memory`                            | existing                           |
| **WORKSPACE** | Summary             | "Last 7 days"                       | none                                                               | `/(supervisor)/summary`                           | existing, was tab-hidden — promote |
| **WORKSPACE** | Updates             | "{N} unread"                        | unread Updates count                                               | `/(supervisor)/updates`                           | existing, was tab-hidden — promote |
| **PERSONAL**  | My profile          | "Stats · streaks · prefs"           | none                                                               | `/(supervisor)/profile`                           | existing                           |
| **PERSONAL**  | Language            | "English · हिन्दी · తెలుగు"         | none                                                               | `/(supervisor)/profile` (anchor `#language`)      | existing                           |
| **PERSONAL**  | Notifications       | "Push · WhatsApp · Email"           | none                                                               | `/(supervisor)/profile` (anchor `#notifications`) | existing                           |
| **PERSONAL**  | Temporary mode      | "Pause AI for the day"              | none                                                               | inline modal                                      | existing                           |
| **PERSONAL**  | How to use Axhy     | "60-sec video · examples"           | none                                                               | `Linking.openURL('https://axhy.app/help')`        | existing                           |
| **PERSONAL**  | Sign out            | —                                   | none                                                               | `onAppLogout`                                     | existing                           |

**Layout rules:**

- Band labels are 10px uppercase mono in `tokens.color.ink.tertiary`, no border.
- Badge: pill, `tokens.color.brand.accent` background, mono digits, max width 3 chars (`99+` after that).
- Inbox items show TWO sub-lines if there's an "expiring soon" or "HR replied" sub-state — visual urgency cue.
- Tapping an inbox row → list screen. Tapping a row inside the list → Decisions tab with the matching decision card auto-scrolled-to + briefly highlighted (200ms accent flash).

### A.3 List-screen contract (shared shell)

All four inbox list screens use one component `<InboxListScreen kind="leave|swap|invite|complaint" />`:

- **TopAppBar** with the inbox name + count.
- **Tabs**: `Pending` (default) / `History` (decided last 30 days).
- **Row**: site name (mono caps) · worker name · short context · "{N} hr ago" · right-chevron.
- **Tap** → `router.push('/(supervisor)/decisions?focus=<decisionId>')`.
- Pull-to-refresh; React Query cache keyed on `[inbox, kind, tab]`.
- Empty state: "All clear. {kind} will appear here when they come in."

These list screens are READ-ONLY (no decide buttons). All decide actions happen on the Decisions tab.

---

## B. Decisions queue — the single decision surface

### B.1 Current decision-kind registry (read from `supervisor-decision-kinds.ts`)

| Kind                | Tier        | RoutingMode     | toolName                    | ackRequired |
| ------------------- | ----------- | --------------- | --------------------------- | ----------- |
| `MARK_ABSENT`       | OPERATIONAL | worker-targeted | `propose_mark_absent`       | false       |
| `APPROVE_LEAVE`     | OPERATIONAL | worker-targeted | `propose_leave`             | false       |
| `LOG_COMPLAINT`     | OPERATIONAL | site-targeted   | —                           | false       |
| `SWAP_WORKER`       | OPERATIONAL | site-targeted   | `propose_swap`              | false       |
| `TERMINATE_WORKER`  | EMPLOYMENT  | worker-targeted | `propose_termination`       | true        |
| `CREATE_ASSIGNMENT` | OPERATIONAL | worker-targeted | `propose_create_assignment` | false       |
| `LIVING_DOC_RULE`   | NOTE        | origin-only     | `propose_living_doc_update` | false       |

### B.2 NEW decision kinds to add

| Kind                         | Tier        | RoutingMode                          | toolName                                          | ackRequired | Card variant                                                                                               | Backend POST                                                |
| ---------------------------- | ----------- | ------------------------------------ | ------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `LEAVE_APPROVAL_PENDING`     | PERSONNEL   | worker-targeted                      | — (created by leave-request POST, not chat)       | false       | TwoButton (Approve / Reject) + reason text on Reject                                                       | `POST /leave-requests/:id/approve` and `/reject`            |
| `SWAP_REQUEST_PENDING`       | OPERATIONAL | site-targeted                        | — (created when worker submits a swap)            | false       | TwoButton (Accept / Reject); shows skill-mismatch warning → "Accept anyway" one-button                     | `POST /swap-requests/:id/decide` (new)                      |
| `REPLACEMENT_INVITE_OUTCOME` | OPERATIONAL | site-targeted                        | — (created by dispatcher when broadcast resolves) | false       | InfoOnly (worker accepted or "no acceptance — re-broadcast?") with one button: Acknowledge or Re-broadcast | `POST /replacement-invites/:id/ack` or `/rebroadcast` (new) |
| `COMPLAINT_HR_REPLY`         | NOTE        | site-targeted (origin-only fallback) | — (created when HR sends a complaint message)     | false       | InfoOnly with 5-word ack textinput (Updates-style)                                                         | `POST /complaints/:id/ack-reply` (new)                      |

**Naming rule:** existing `APPROVE_LEAVE` is the chat-extracted decision ("supervisor said `approve Suresh's leave` in chat"); `LEAVE_APPROVAL_PENDING` is the worker-initiated leave-request that needs supervisor's decision. Both flow into the same queue; one is supervisor-driven, the other is worker-driven.

Founder may prefer merging them; flag this as **open question O-1**: do we keep two kinds or fold both into `APPROVE_LEAVE` and discriminate by `origin: 'CHAT' | 'WORKER_APP'`?

### B.3 Section assignment

| Kind                         | Section                                                           |
| ---------------------------- | ----------------------------------------------------------------- |
| `LEAVE_APPROVAL_PENDING`     | `NEEDS_YOU_NOW` if `fromDate <= today + 2 days`, else `ROUTINE`   |
| `SWAP_REQUEST_PENDING`       | `NEEDS_YOU_NOW` if `effectiveAt <= today + 1 day`, else `ROUTINE` |
| `REPLACEMENT_INVITE_OUTCOME` | `NEEDS_YOU_NOW` if shift is today, else `ROUTINE`                 |
| `COMPLAINT_HR_REPLY`         | `ROUTINE` always                                                  |

### B.4 Card variants (NEW)

Today there are 2 variants in `DecisionCard.tsx`: standard dismiss-only footer, and EMPLOYMENT typed-phrase confirm. We need three new variants:

1. **TwoButton** — `[Approve|Accept] [Reject]`. Reject opens an inline `<RejectReasonSheet>` (mandatory single-line reason, 1–200 chars).
2. **TwoButtonWithWarning** — TwoButton + a warning strip above the buttons: "Skill mismatch: Suresh has Floor cert; site needs Glass cert. Continue?" — left button label becomes "Accept anyway" (per master-plan one-button-assign-anyway lock + scenario #44).
3. **InfoOnly** — title + body + single "Acknowledge" button. For `REPLACEMENT_INVITE_OUTCOME` add an optional secondary "Re-broadcast" button when outcome is `EXPIRED`.
4. **InfoOnlyWithAck5** — InfoOnly + the existing Updates-style 5-word ack TextInput (per `updates.tsx` pattern). Used for `COMPLAINT_HR_REPLY`.

EMPLOYMENT typed-phrase stays as-is for `TERMINATE_WORKER`. `LEAVE_APPROVAL_PENDING` reject does NOT typed-phrase (PERSONNEL tier; the existing pattern from master-plan locks employment-only typed-phrase).

### B.5 `focus` query-param routing

`/(supervisor)/decisions?focus=<decisionId>` opens the queue and:

- scrolls the matching card into view (FlatList `scrollToIndex` with section-aware offset)
- animates a 200ms accent ring on the card
- React Query refetches `useDecisionsQuery()` on focus so a freshly-created decision is present

### B.6 Backend POST endpoints

| Kind                                      | Endpoint                                    | Status                                      |
| ----------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| `LEAVE_APPROVAL_PENDING` approve          | `POST /leave-requests/:id/approve`          | EXISTS (`leave-requests.ts`)                |
| `LEAVE_APPROVAL_PENDING` reject           | `POST /leave-requests/:id/reject`           | EXISTS                                      |
| `SWAP_REQUEST_PENDING` accept             | `POST /swap-requests/:id/accept`            | NEEDS audit — confirm in `swap-requests.ts` |
| `SWAP_REQUEST_PENDING` reject             | `POST /swap-requests/:id/reject`            | NEEDS audit                                 |
| `SWAP_REQUEST_PENDING` accept-anyway      | same `accept` with `body.acceptAnyway=true` | NEW flag on existing endpoint               |
| `REPLACEMENT_INVITE_OUTCOME` ack          | `POST /replacement-invites/:id/ack`         | NEW (other subagent owns the route file)    |
| `REPLACEMENT_INVITE_OUTCOME` re-broadcast | `POST /replacement-invites/:id/rebroadcast` | NEW                                         |
| `COMPLAINT_HR_REPLY` ack                  | `POST /complaints/:id/messages/:msgId/ack`  | NEW                                         |

### B.7 File-level changes — Decisions queue

**Modify:**

- `packages/shared-schema/src/zod/supervisor-decision-kinds.ts` — add 4 entries to `DECISION_KIND_REGISTRY`
- `packages/shared-schema/src/zod/decisions.ts` — extend `DecisionRow` schema with optional `actions: { kind, label, endpoint, requiresReason?, isPrimary? }[]` so backend can drive button rendering instead of hard-coding in mobile
- `packages/shared-schema/src/zod/audit-payloads.ts` — extend `SupervisorDecisionKindSchema` validation if it's enum-shaped today
- `packages/shared-schema/prisma/schema.prisma` — Complaint model needs:
  - new fields: `kind String` (photo_mismatch|missed_area|attitude|theft|hygiene|noise|damage|other), `state String` (OPEN|RESOLVED|DISMISSED — currently inferred from `resolvedAt`), `lastHrReplyAt DateTime?`, `unreadHrReplies Int @default(0)`
  - new model: `ComplaintMessage` (id, complaintId, companyId, authorRole 'SUPERVISOR'|'HR'|'AI', text, createdAt, ackedAt, ackedBy)
- `apps/backend/src/lib/services/decisions-service.ts` — `buildDecisionsForSupervisor` must `UNION ALL`:
  1. existing `SupervisorDecision` rows (chat-extracted)
  2. `LeaveRequest WHERE state='REQUESTED' AND supervisor-bound`
  3. `SwapRequest WHERE state='SENT' AND supervisor-bound`
  4. `ReplacementInvite WHERE state IN ('ACCEPTED','EXPIRED') AND ackedAt IS NULL`
  5. `ComplaintMessage WHERE authorRole='HR' AND ackedAt IS NULL`
     Each mapped into a `DecisionRowT`-shaped row with the new kind enum.
- `apps/backend/src/routes/swap-requests.ts` — add `acceptAnyway` body flag; emit skill-mismatch warning in queue payload
- `apps/backend/src/routes/sites.ts` — `POST /sites/:id/complaints` extended to accept new `kind` + `description` fields (kind defaults to `other` for backwards compat)

**Add:**

- `apps/backend/src/routes/complaints.ts` — `GET /complaints?status=`, `POST /complaints/:id/messages` (HR reply ingestion; gated to HR-role JWT once HR portal exists; for now: internal-only used by chat-tool flow), `POST /complaints/:id/messages/:msgId/ack`
- `apps/mobile/components/decisions/variants/TwoButtonFooter.tsx`
- `apps/mobile/components/decisions/variants/TwoButtonWithWarningFooter.tsx`
- `apps/mobile/components/decisions/variants/InfoOnlyFooter.tsx`
- `apps/mobile/components/decisions/variants/InfoOnlyWithAck5Footer.tsx`
- `apps/mobile/components/decisions/RejectReasonSheet.tsx`
- `apps/mobile/components/inbox/InboxListScreen.tsx`
- `apps/mobile/app/(supervisor)/inbox/leave-requests.tsx`
- `apps/mobile/app/(supervisor)/inbox/swap-requests.tsx`
- `apps/mobile/app/(supervisor)/inbox/replacement-invites.tsx`
- `apps/mobile/app/(supervisor)/inbox/complaints.tsx`
- `apps/mobile/lib/queries/use-inbox.ts` — query hooks for the four list screens + badge counts
- `apps/mobile/lib/queries/use-decide-leave.ts`, `use-decide-swap.ts`, `use-ack-invite.ts`, `use-ack-complaint-reply.ts`

**Modify mobile:**

- `apps/mobile/components/Drawer.tsx` — replace `DRAWER_ITEMS` flat array with banded structure; add badge rendering; wire new routes
- `apps/mobile/components/decisions/DecisionCard.tsx` — dispatch to variant footer based on `row.kind` + `row.actions`
- `apps/mobile/app/(supervisor)/decisions.tsx` — read `focus` query param, scroll-to-index, accent-flash
- `apps/mobile/app/(supervisor)/_layout.tsx` — register the four new `/inbox/*` routes with `href: null` (drawer-only, not tab-bar)

---

## C. Chat-to-Complaint flow

### C.1 Sequence diagram (text)

```
Supervisor          ChatInput            POST /chat/messages       OpenAI tool-loop          Prisma           Outbox
─────────           ─────────            ─────────────────────     ──────────────────        ──────           ──────
  | speaks/types       |                                                                                         |
  | "lobby at Aparna   |                                                                                         |
  |  A-block was missed|                                                                                         |
  |  at 11 AM"         |                                                                                         |
  |───────────────────>|                                                                                         |
  |                    | transcribe (if voice)                                                                   |
  |                    |───────────────────>                                                                     |
  |                    |                    | tool_choice='auto',                                                |
  |                    |                    | tools incl propose_log_complaint                                   |
  |                    |                    |─────────────────────>                                              |
  |                    |                    |                    | classifies intent='log_complaint'             |
  |                    |                    |                    | extracts {siteName, severity, kind, desc, ts} |
  |                    |                    |                    | calls find_sites(name='Aparna A-block')       |
  |                    |                    |                    |───────────────────────────────────────────────>
  |                    |                    |                    |<──── matched siteId ───────────────────────── |
  |                    |                    |                    | tool: propose_log_complaint(siteId, kind,     |
  |                    |                    |                    |       severity, description)                  |
  |                    |                    |                    |───────────────────────────────────────────────>
  |                    |                    |                    |                              | INSERT Complaint
  |                    |                    |                    |                              | (state=OPEN)    |
  |                    |                    |                    |                              | INSERT          |
  |                    |                    |                    |                              |  ComplaintMessage
  |                    |                    |                    |                              |  authorRole=SUPERVISOR
  |                    |                    |                    |                              | enqueue          ──>
  |                    |                    |                    |                              | hr.complaint_filed
  |                    |                    |<──── tool result: ok, complaintId ─────────────── |                  |
  |                    |                    | AI assistant text:                                                  |
  |                    |                    | "Logged complaint at Aparna A-block · LOW                           |
  |                    |                    |  · missed_area · sent to HR for review."                            |
  |                    |<───── 200 OK with message + confirmation bubble ─────                                    |
  |<─── render bubble ─|                                                                                          |
  |                    |                                                                                          |
  | (later)            |                                                                                          |
  | HR replies via portal or webhook → POST /complaints/:id/messages with authorRole=HR                           |
  |                    |                                                                                          |
  |                    | (push notification + WS) ChatMessage appears in scoped thread,                           |
  |                    | Decisions queue gets COMPLAINT_HR_REPLY row, drawer Complaints badge +1                  |
```

### C.2 AI intent classifier — prompt spec

System prompt addendum (added to `packages/ai-tools/src/openai-tool-loop.ts` prompt):

```
You are also responsible for classifying supervisor messages into one
of these intents and acting accordingly:

  - log_complaint     → call propose_log_complaint when the supervisor
                        describes a quality issue / missed work / damage
                        / theft / hygiene / noise / attitude / photo-mismatch
                        at a site, or quotes a client complaint.
  - mark_absent       → propose_mark_absent
  - request_leave_decision → propose_leave
  - escalate          → propose_termination (EMPLOYMENT — only on explicit
                        firing language)
  - general           → no tool call; respond conversationally

For log_complaint, extract:
  siteId       — match the site name in the message against the
                 supervisor's bound sites via find_sites; if ambiguous,
                 ask one clarifying question instead of guessing.
  severity     — LOW / MEDIUM / HIGH from language cues:
                 LOW: "minor", "small", "today", single occurrence
                 MEDIUM: "again", "second time", "client noticed"
                 HIGH: "client threatening to cancel", "damage", "theft",
                       "injury", "very angry"
  kind         — one of: photo_mismatch | missed_area | attitude | theft |
                 hygiene | noise | damage | other
  description  — supervisor's words, cleaned of filler ("um", "you know"),
                 max 280 chars.
```

### C.3 New AI tool — `propose_log_complaint`

```ts
{
  name: 'propose_log_complaint',
  description: 'Logs a complaint about a site. Routes to HR for review.',
  inputSchema: {
    siteId: z.string().uuid(),
    kind: z.enum(['photo_mismatch','missed_area','attitude','theft','hygiene','noise','damage','other']),
    severity: z.enum(['LOW','MEDIUM','HIGH']),
    description: z.string().min(1).max(280),
    observedAt: z.string().datetime().optional(),
  },
}
```

Tool handler creates `Complaint` row + `ComplaintMessage` (authorRole=SUPERVISOR) + `hr.complaint_filed` outbox event in one tx.

### C.4 Drawer Complaints tab → chat thread navigation

Tapping a complaint row in `inbox/complaints.tsx` does NOT go to Decisions — it goes to:

`/(supervisor)/chat?complaintId=<id>`

`chat.tsx` reads the query param and:

- filters `ChatMessage` query to only messages where `metadata.complaintId === id` (requires new `metadata Json?` field on `ChatMessage` OR a join through `ComplaintMessage.chatMessageId` FK — **open question O-2**: which is cleaner?)
- shows a top sticky strip: "Complaint · {site} · {kind} · {severity} · {state}" with a "back to inbox" button
- ChatInput is scoped — sending a message here appends a `ComplaintMessage` (authorRole=SUPERVISOR) instead of an unscoped `ChatMessage` and does NOT trigger the full chat tool-loop (no risk of AI logging a complaint-of-a-complaint).

### C.5 HR reply ingestion

Phase 1 (pre-HR-portal):

- Internal endpoint `POST /complaints/:id/messages` accepts an admin JWT and creates the ComplaintMessage.
- This is wired up first so the founder can simulate HR replies in dev.

Phase 2 (HR portal ships):

- HR uses the portal, hits the same endpoint with HR-role JWT.
- Real-time delivery: push notification + WS event `complaint.message.created`.

In both phases, the same backend hook fires:

- Creates `ComplaintMessage` row
- Increments `Complaint.unreadHrReplies`
- Inserts a virtual decision row of kind `COMPLAINT_HR_REPLY` (no real `SupervisorDecision` row; surfaced via the UNION-ALL pattern in §B.7)
- Sends push to supervisor

---

## D. Prior art — what we adopt, what we don't

| Source                   | Pattern                                                                                                      | Adopt?                                                                                                                                                                                                                                                                                          | Reason                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Intercom Inbox           | `conversation_id` FK ties replies to ticket; "unassigned/yours/mentions" inbox views                         | YES — drives our `Complaint` ↔ `ComplaintMessage` FK + the four-band drawer inbox views                                                                                                                                                                                                         | Battle-tested model, maps cleanly to our multi-tenant constraints                         |
| Zendesk Support          | Ticket has fixed `status` machine (new → open → pending → solved → closed); reply increments `comment_count` | YES — adopt the explicit `Complaint.state` enum (replaces today's `resolvedAt IS NULL` proxy); adopt `unreadHrReplies` counter                                                                                                                                                                  | Counter on parent row beats `COUNT(*)` per badge query                                    |
| Slack threads            | `thread_ts` anchors children to parent message; parent unaffected by replies                                 | PARTIAL — we use the same shape but `Complaint` is the parent, not a `ChatMessage`, because complaints have a lifecycle and threads don't                                                                                                                                                       | Complaints need HR routing, threads don't                                                 |
| HappyFox / Zoho Desk Zia | Voice-to-ticket: transcribe → NLP fills form fields → human confirms before submit                           | NO confirm step — founder wants chat-to-complaint to be **fire-and-display**, not fire-and-confirm. The confirmation bubble IS the confirmation; cancellation = "actually no, ignore that" in the next message which the AI classifies as `cancel_last_action` (future tool, not in this slice) | Founder's "no per-action friction" rule + master-plan one-button-assign-anyway philosophy |
| BookMyBai / UrbanCompany | Call-centre logs complaint into CRM; supervisor not in the loop directly                                     | NO — Axhy's whole pitch is "supervisor IS the loop"; routing to HR is async + visible to supervisor                                                                                                                                                                                             | Direct opposite of our positioning                                                        |

---

## E. Risks

### E.1 Race conditions

| Race                                                                 | Impact                   | Mitigation                                                                                                                                           |
| -------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two supervisors approve same leave-request                           | Double-update            | `LeaveRequest.state='REQUESTED'` precondition already in `leave-requests.ts:135`; returns 409 on second                                              |
| Worker submits swap while supervisor opens decisions queue           | Stale view               | React Query refetch on focus + WS event `swap.created` invalidates queue                                                                             |
| HR sends 3 replies in 30s                                            | Badge over-counts        | Increment counter atomically inside the same tx that creates `ComplaintMessage`                                                                      |
| Supervisor acks an HR reply on mobile A while reading it on mobile B | Double-ack               | Idempotency key on `POST /complaints/:id/messages/:msgId/ack` keyed on `(msgId, userId)`                                                             |
| Chat AI fires `propose_log_complaint` twice (network retry)          | Duplicate Complaint rows | Re-use existing chat idempotency-key mechanism (`chat-idempotency.ts`); tool-level dedupe on `(siteId, supervisorId, hash(description), within-60s)` |

### E.2 Badge-count update lag

- Drawer badges fetched via dedicated `GET /supervisor/inbox-badges` (cheap query, COUNT only, no row payload).
- Refetch triggers: drawer open, app foregrounded, push notification received, mutation success.
- Stale window acceptable: 30s on idle. Push notification short-circuits.
- Don't poll. WS subscription `inbox.badge.changed` is the v3.1 upgrade.

### E.3 AI intent misclassification

| Failure mode                                                                 | Likely cause                                        | Mitigation                                                                                                                                                                             |
| ---------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Suresh missed today" classified as `log_complaint` instead of `mark_absent` | Both about a missed-something                       | Prompt examples in system message; few-shot pairs; explicit rule "worker absence = mark_absent, work-quality absence = log_complaint"                                                  |
| Site name ambiguous ("Aparna" matches 3 sites)                               | Multiple bound sites                                | AI must ask one clarifying question, never guess; `find_sites` returns ranked candidates with confidence scores                                                                        |
| Severity inflated/deflated                                                   | LLM calibration drift                               | Severity is editable in the confirmation bubble (tap chip to change); audit-logged                                                                                                     |
| False positive: supervisor venting "everything's terrible today" gets logged | Sentiment ≠ intent                                  | Tool description explicitly requires a concrete site + concrete event; loop instruction "if no site or no event, do not call propose_log_complaint, ask a clarifying question instead" |
| AI logs against wrong site                                                   | Supervisor said "Aparna" but meant building B not A | Confirmation bubble shows site name boldly; supervisor can tap it to fix; 2-min "undo" window writes `Complaint.state='DISMISSED'` cleanly                                             |

### E.4 HR reply latency

- No SLA. HR portal does not exist yet.
- Pre-HR-portal: founder/admin simulates HR replies via internal endpoint. Document this in `/docs/integrations/hr-stub.md` (out of scope here).
- Once HR portal ships: surface SLA in Updates tab — "Avg HR reply: 4h 12m (last 7d)" — not as a complaint property, as a tenant-level metric.

### E.5 Schema-evolution risks

- Adding `kind` to `Complaint` is a non-default-nullable column — migration must default to `'other'` for existing rows (there are likely zero rows in dev today, but lock the migration shape).
- Adding `metadata Json?` to `ChatMessage` is forward-compat — old rows just have `NULL`.
- New `ComplaintMessage` model: index `(companyId, complaintId, createdAt)` for thread loading; index `(companyId, ackedAt) WHERE ackedAt IS NULL` (partial) for badge-count queries.

---

## F. Open questions for panel

1. **O-1** — Merge `APPROVE_LEAVE` (chat-extracted) and `LEAVE_APPROVAL_PENDING` (worker-initiated) into one kind with an `origin` discriminator? Or keep two? My recommendation: merge (one less variant; same UI; origin is metadata).
2. **O-2** — Scope chat-to-complaint threading via `ChatMessage.metadata.complaintId` OR a separate `ComplaintMessage` model with FK? My recommendation: separate model (clean lifecycle, easier RLS, no overload of the chat ledger).
3. **O-3** — When an HR reply lands, do we surface it as BOTH a chat bubble (in scoped thread) AND a decision card? Or one or the other? My recommendation: both — decision card forces ack; chat bubble preserves narrative.
4. **O-4** — Reject-reason on `LEAVE_APPROVAL_PENDING`: free text vs. dropdown vs. typed-phrase? Master-plan only mandates typed-phrase for EMPLOYMENT; PERSONNEL lower-stakes. Recommend free text (200 chars).
5. **O-5** — Re-broadcast button on `REPLACEMENT_INVITE_OUTCOME` when invite expired: same N workers, or AI re-selects? Defer to other subagent's spec.
6. **O-6** — When supervisor logs a complaint via chat, should we ALSO create a `SupervisorDecision` row of kind `LOG_COMPLAINT` (currently the kind has no toolName)? My recommendation: yes — gives a single audit trail and lets the existing `LOG_COMPLAINT` queue plumbing surface it identically to chat-extracted mark-absents etc. The `Complaint` row is the domain table; the `SupervisorDecision` row is the lifecycle/audit envelope. This is the canonical F-002 pattern.

---

## G. Build order (if this gets locked)

1. **Wave A** — schema migration (Complaint extensions + ComplaintMessage + ChatMessage.metadata).
2. **Wave B** — backend routes (complaints CRUD + messages + ack endpoints + swap-decide + decisions UNION-ALL).
3. **Wave C** — `propose_log_complaint` AI tool + prompt addendum + chat-idempotency wiring.
4. **Wave D** — mobile drawer redesign (banded structure + badges + four inbox routes).
5. **Wave E** — DecisionCard variants + RejectReasonSheet + focus-query-param routing.
6. **Wave F** — chat thread scoping (complaintId param) + scoped ChatInput.
7. **Wave G** — Playwright + panel review per `feedback_playwright_panel_review_before_founder.md` before founder sees pixels.

Each wave gets its own done-memo with spec-coverage matrix (per `feedback_done_memo_requires_spec_coverage_matrix.md`).

---

_End of spec. No source code modified. ~3200 words._
