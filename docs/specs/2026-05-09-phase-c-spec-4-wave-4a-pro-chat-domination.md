# Phase C — Spec 4 / Wave 4a-PRO: Chat + Assignment world-domination

> **Status:** DRAFT for founder review (panel-locked inline 2026-05-09)
> **Date:** 2026-05-09
> **Sequence:** Spec 4 — extends Wave 4a (chat MVP) to flagship-quality. Builds on Spec 1 (assignment), Spec 2 (AI chat backend), Spec 3 (chat tab MVP).
> **Depends on:** Wave 1 + Wave 2a + Wave 4a all merged/PR'd to main
> **Driver:** Founder directive 2026-05-09 — "first we need proper assignments and chat because everything else can be easily built right. so make this strongly world domination."

---

## TL;DR

1. **Chat is the moat.** When chat handles 95% of supervisor daily actions, every other surface is trivially built on top.
2. **Wave 4a-PRO wires 4 missing tools** in the chat handler — `mark_absent`, `leave`, `swap`, `termination`. Combined with the existing `create_assignment`, this covers 95% of Mukesh's daily volume.
3. **Conflict detection is plumbed into chat** — currently `detectConflicts()` exists but isn't called by the chat handler. Wave 4a-PRO wires it. Severity colors (gold/orange/red) + override chips render in the UI.
4. **Multi-tool batch UI** — when AI proposes 2+ actions in one turn (Spec 1 §9.6), UI renders batch DecisionCard with single-tap atomic confirm.
5. **Polish gaps closed** — dayMask humanized to "Mon-Sat", severity colors verified, override chips rendered, empty state has welcome hint, skeleton loading replaces spinner, Cancel button contrast fixed.
6. **Dual workflow discipline** — Expo Fast Refresh for live iteration + Playwright for systematic capture. Per `feedback_expo_fast_refresh_plus_playwright.md`.
7. **STILL deferred:** LivingDoc, Sarvam STT, Today/Summary/Updates/Profile tabs, Calendar tab UI, Visit cron, chat history, prompt cache, cost ceiling. All built AFTER chat is flagship.
8. **Estimated effort:** ~7-9 days at AI-codegen + subagent pace.

---

## 1. Why this spec exists

Wave 4a MVP shipped a working chat tab that handles ONE supervisor action: creating an assignment. That's about 10% of a supervisor's daily volume per Suresh Pillai's panel input. The other 90%:

- 50% — marking workers absent / late
- 20% — swapping workers between sites
- 15% — leave decisions
- 5% — terminations

If Mukesh can't do these in chat, he tabs out to WhatsApp and back to the old workflow. The product loses its moat.

Wave 4a-PRO closes the gap. Five tools wired (the existing one + four new), conflict detection plumbed, UI polished. After this, chat is the supervisor's primary surface. Every additional surface (Today's Plan, Summary, Profile, admin web, HR portal) becomes a thin read-view on top of the data the chat creates.

**This is the moat.**

---

## 2. What ships (locks summary)

| Layer      | Item                                                                                            | Source                                          |
| ---------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Backend    | Wire `propose_mark_absent` (Phase B `markWorkerAbsent` pattern, but via AI tool)                | Suresh's #1 daily action                        |
| Backend    | Wire `propose_leave` for ChangeRequest LEAVE                                                    | Spec 1 §6                                       |
| Backend    | Wire `propose_swap` for ChangeRequest SWAP                                                      | Spec 1 §6                                       |
| Backend    | Wire `propose_termination` (probation/permanent — backend resolves)                             | Spec 1 §6 + Spec 1 §9.7                         |
| Backend    | Plumb `detectConflicts()` from `packages/state-machines/conflicts.ts` into chat tool handler    | Spec 1 §7                                       |
| Backend    | Multi-tool-turn handling — batch DecisionCard payload when AI emits >1 propose\_\*              | Spec 1 §9.6                                     |
| Mobile     | `dayMask: "MTWTFS_"` → "Mon-Sat" / day-pill row                                                 | UX panel critique 2026-05-09                    |
| Mobile     | Severity color rendering — gold (CONFIRM) / orange (WARN) / red (BLOCKED, no Apply button)      | Spec 1 §7.1 + Spec 3 §5.1                       |
| Mobile     | Override chip picker (Split shift / Covering for [worker] / Mistake / Other) when SOFT conflict | Spec 1 §7.2                                     |
| Mobile     | Multi-tool batch DecisionCard UI — render as single card with sub-items, atomic confirm         | Spec 1 §9.6                                     |
| Mobile     | Empty state with welcome message                                                                | Tier 2 from Wave 4a panel review                |
| Mobile     | Skeleton loading on first chat-tab open (not raw spinner)                                       | UX polish                                       |
| Mobile     | Cancel button visual contrast fix                                                               | UX polish                                       |
| Discipline | Expo Fast Refresh + Playwright (headed) dual workflow during all iteration                      | `feedback_expo_fast_refresh_plus_playwright.md` |

---

## 3. Backend extensions

### 3.1 Tool handler additions

Current chat handler in `apps/backend/src/routes/chat.ts` only handles 3 tools (`find_workers`, `find_sites`, `propose_create_assignment`). Wave 4a-PRO adds branches for 4 more propose\_\* tools + plumbs conflict detection.

Pattern (extended for each new tool):

```ts
if (name === 'propose_mark_absent') {
  const { workerId, date, reason } = input as { workerId: string; date: string; reason?: string };
  // Validate worker is in tenant
  const worker = await tx.worker.findFirst({ where: { id: workerId, companyId: auth.companyId } });
  if (!worker) return { output: { error: 'WORKER_NOT_FOUND' } };
  // Detect conflicts (e.g., already on leave)
  const conflicts = await detectConflicts(...);
  return {
    output: { proposed: true, fields: input, conflicts },
    decisionCardData: {
      title: 'Mark absent',
      description: `Mark ${worker.name} absent on ${date}?`,
      fields: input,
      severity: conflicts.length > 0 ? 'WARN' : 'CONFIRM',
      conflicts,
      presets: conflicts.length > 0 ? { chips: ['Already on leave — cancel mark', 'Mistake — cancel', 'Confirm anyway'] } : undefined,
    },
  };
}

// Similar branches for: propose_leave, propose_swap, propose_termination
```

### 3.2 Tool surface additions

Add to `packages/ai-tools/src/tools/`:

```ts
// tools/mark-absent.ts
export const proposeMarkAbsentTool = {
  name: 'propose_mark_absent',
  description:
    'Propose marking a worker absent for a specific date. Use when supervisor says "Mukesh is absent today" / "Suresh did not show up" / "Lakshmi called sick".',
  input_schema: {
    type: 'object' as const,
    properties: {
      workerId: { type: 'string', description: 'UUID from find_workers' },
      date: { type: 'string', description: 'ISO date YYYY-MM-DD; default today' },
      reason: { type: 'string', enum: ['sick', 'family', 'transport', 'unknown', 'other'] },
      reasonDetail: { type: 'string' },
    },
    required: ['workerId', 'date'],
  },
} as const;
```

Similar shapes for `proposeLeaveTool`, `proposeSwapTool`, `proposeTerminationTool` (collapsed per Spec 1 §9.7 — backend resolves probation/permanent based on tenure).

### 3.3 Backend routes (POST /chat/apply consumers)

Each tool's `propose_*` returns DecisionCard data without committing. On supervisor's Apply tap, `POST /chat/apply` routes to the underlying domain route:

| Tool                  | Underlying route                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `propose_mark_absent` | `POST /workers/:id/mark-absent` (Phase B route)                                                                                                                                                              |
| `propose_leave`       | `POST /change-requests` (kind=LEAVE) — but Wave 2a's ChangeRequest table doesn't exist yet (Wave 2b territory). **Workaround:** keep using Phase B `LeaveRequest` table for now; migrate when Wave 2b ships. |
| `propose_swap`        | `POST /swap-requests` (Phase B route)                                                                                                                                                                        |
| `propose_termination` | NEW: `POST /change-requests` (kind=TERMINATION\_\*) — but ChangeRequest table not built. **Workaround:** add a temporary `Termination` table or use Worker.state transition + AuditEvent for now.            |

**Decision:** for Wave 4a-PRO, we stay within Phase B's existing schema where possible. LEAVE → existing LeaveRequest. SWAP → existing SwapRequest. MARK_ABSENT → existing Attendance. TERMINATION → Worker state transition (state='TERMINATED'). When Wave 2b builds the unified ChangeRequest, these consolidate.

### 3.4 Conflict detection plumbed

In the chat tool handler, before returning a `propose_*` DecisionCard:

```ts
import { detectConflicts } from '@axhy/state-machines';
// ...
const conflicts = detectConflicts(
  { workerId, dateRange, newShift },
  { activeAssignments, visits, calendarEntries, changeRequests },
);
```

If `conflicts.length > 0`, return DecisionCard with severity matching the highest-severity conflict + presets.chips for SOFT cases.

### 3.5 Multi-tool-turn batch handling

When Anthropic returns multiple `tool_use` blocks in one turn (compound utterance like "demand 5 + tentative Pradeep"), the chat handler iterates through them and builds a batch:

```ts
const decisionCards = []; // per-tool
for (const block of toolUseBlocks) {
  const result = await handler(block.name, block.input);
  if (result.decisionCardData) decisionCards.push(result.decisionCardData);
}
// Return batch
return {
  decisionCards: decisionCards, // array, not single
  ...
};
```

UI renders all cards in one bubble with a single "Apply All" button OR per-card Apply (founder picks during UI iteration via Fast Refresh).

---

## 4. Mobile UI polish

### 4.1 dayMask humanization

Add helper `humanizeDayMask(mask: string): string` in `apps/mobile/lib/format.ts`:

```ts
export function humanizeDayMask(mask: string): string {
  // "MTWTFS_" → "Mon-Sat"
  // "M_W_F__" → "Mon, Wed, Fri"
  // "MTWTFSS" → "Every day"
  // "_______" → "(none)"
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const days = mask
    .split('')
    .map((ch, i) => (ch !== '_' ? labels[i] : null))
    .filter(Boolean) as string[];
  if (days.length === 0) return '(none)';
  if (days.length === 7) return 'Every day';
  if (days.length === 6 && mask === 'MTWTFS_') return 'Mon-Sat';
  if (days.length === 5 && mask === 'MTWTF__') return 'Weekdays';
  return days.join(', ');
}
```

DecisionCard uses this when rendering `dayMask` field.

### 4.2 Severity color verification

Currently `DecisionCard.tsx` uses severity for border color but only CONFIRM is verified in screenshots. Wave 4a-PRO captures Playwright screenshots for all three:

- CONFIRM (gold border) — already verified
- WARN (orange border) — verify by sending message that triggers conflict
- BLOCKED (red border, no Apply button) — verify by sending message for terminated worker

### 4.3 Override chip picker

When severity = WARN and `presets.chips` is set, render:

```
┌─────────────────────────────────┐
│ Confirm anyway?                 │
│                                 │
│ Why:                            │
│ ▢ Split shift                   │
│ ▢ Covering for [Sundeep ▼]      │
│ ▢ Mistake — cancel              │
│ ▢ Other → [text input]          │
│                                 │
│ [ Cancel ]    [ Confirm ]       │
└─────────────────────────────────┘
```

Tap a chip → reveal it as selected. "Covering for" shows a worker picker dropdown. "Other" shows text input. Selected chip's value is sent in `toolInput.overrideReason` to backend.

### 4.4 Multi-tool batch DecisionCard

When response contains `decisionCards: Array<>`, render a parent card with N sub-items:

```
┌─────────────────────────────────┐
│ Apply 2 changes?                │
│                                 │
│ ① Demand 5 workers at Apollo    │
│   Tuesday 9-5                   │
│                                 │
│ ② Tentative: Pradeep at Apollo  │
│   Tuesday                       │
│                                 │
│ [ Cancel All ]  [ Apply All ]   │
└─────────────────────────────────┘
```

`POST /chat/apply` accepts an array of `{toolName, toolInput}` for batch atomic execution.

### 4.5 Empty state welcome

Replace blank canvas with:

```
┌─────────────────────────────────┐
│                                 │
│         👋                      │
│      Hello, Mukesh              │
│                                 │
│ Try saying:                     │
│ • "Mark Suresh absent today"    │
│ • "Add Ravi to Hospital A"      │
│ • "Suresh sick for 3 days"      │
│                                 │
│ Or just type below.             │
│                                 │
└─────────────────────────────────┘
```

(Replace with real supervisor name from auth context.)

### 4.6 Skeleton loading

Replace raw `<ActivityIndicator>` on first chat-tab open with shimmer skeleton in bubble shape. Use `react-native-reanimated` (already in deps) for the shimmer animation.

### 4.7 Cancel button contrast

Current Cancel button: thin border, very low contrast against card background. Fix: increase border width to 1.5, darken border color to `tokens.color.ink.tertiary`.

---

## 5. Dual workflow discipline

Per locked rule `feedback_expo_fast_refresh_plus_playwright.md`:

**During every UI edit:**

1. Three terminals running (backend / Expo dev / Playwright as needed)
2. Persistent Chrome tab at `localhost:8081/`
3. Edit RN component → Fast Refresh re-bundles in 1-3s → see in browser tab
4. Iterate freely with hot-reload feedback
5. When change feels "done", run Playwright (HEADED for visibility, slowMo: 500) for systematic capture
6. Comprehensive flow capture with assertion screenshots

**Subagent dispatch instructions** must include:

- Verify Expo + backend health endpoints
- Make code change
- Curl `localhost:8081` to check Metro is healthy
- Run Playwright in headed mode for visual milestones
- Capture screenshots both during iteration AND at "done" state

---

## 6. Test surface

### 6.1 Backend integration tests (real Railway + real Anthropic)

| Test file                         | Scenarios                                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `chat-mark-absent.test.ts`        | "Mukesh absent today" → propose_mark_absent → DecisionCard → /chat/apply → Attendance row      |
| `chat-leave.test.ts`              | "Suresh sick 3 days" → propose_leave → DecisionCard → LeaveRequest row                         |
| `chat-swap.test.ts`               | "Swap Ravi and Lakshmi at Hospital A tomorrow" → propose_swap → DecisionCard → SwapRequest row |
| `chat-termination.test.ts`        | "Fire Pradeep" → propose_termination → DecisionCard → Worker.state=TERMINATED + AuditEvent     |
| `chat-conflict-detection.test.ts` | "Add Ravi to overlapping site" → SOFT conflict → DecisionCard severity=WARN with chips         |
| `chat-multi-tool-batch.test.ts`   | "Apollo needs 5 + Pradeep tentative Tuesday" → 2 propose\_\* in one turn → batch DecisionCard  |

Total: 6 new backend integration tests.

### 6.2 Mobile unit tests

| Test file                       | Coverage                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| `lib/format.test.ts`            | `humanizeDayMask()` — 6 cases (MTWTFS\_, every day, weekdays, single, multiple, none) |
| `lib/chat-api.test.ts` (extend) | Batch DecisionCard handling — request shape with array                                |

### 6.3 Playwright comprehensive suite (headed during dev, headless for CI)

12 flows, screenshot at each milestone:

1. Login + OTP → chat tab
2. Type message + Send → DecisionCard (CONFIRM/gold) — verified Wave 4a
3. Tap Apply → ✓ Applied state — verified Wave 4a
4. Tap Cancel → card dismissed — verified Wave 4a
5. Multi-message conversation — verified Wave 4a
6. AI clarification (no DecisionCard) — verified Wave 4a
7. **NEW:** Type "Mark Suresh absent today" → CONFIRM card → Apply
8. **NEW:** Type "Add Ravi to overlapping site" → WARN card (orange border) + chip picker
9. **NEW:** Tap a chip → reveal selection state → Confirm → applied
10. **NEW:** Type compound message → batch card with 2 sub-items + Apply All
11. **NEW:** Empty state shows welcome message + suggestion bullets
12. **NEW:** dayMask humanized in DecisionCard ("Mon-Sat" not "MTWTFS\_")

### 6.4 Manual founder iPhone smoke test (final gate)

Founder runs Wave 4a-PRO smoke test sequence:

1. Login on iPhone via Expo Go
2. Run all 5 tool flows (mark-absent, leave, swap, termination, create-assignment)
3. Trigger a conflict (overlap) and use the chip picker
4. Send a compound message
5. Check the empty state on first chat-tab open

This is the GATE before Wave 4b.

---

## 7. What's NOT in Wave 4a-PRO (still deferred)

| Item                                                                     | Wave                 |
| ------------------------------------------------------------------------ | -------------------- |
| LivingDoc rule capture (`propose_living_doc_update`)                     | 2b                   |
| Real Sarvam/Whisper voice                                                | 4b                   |
| Other tabs (Today, Summary, Updates, Profile)                            | 4b                   |
| Calendar tab UI                                                          | 4b                   |
| Chat history scroll-back                                                 | 2c                   |
| Prompt cache 3-tier                                                      | 2d                   |
| Per-tenant cost ceiling                                                  | 2d                   |
| Visit materialization cron                                               | 3                    |
| Other 9 propose\_\* tools (visit_correction, replace_visit_worker, etc.) | as scenarios surface |
| ChangeRequest table consolidation (LEAVE + SWAP unified)                 | 2b                   |

---

## 8. Re-debate triggers

| Signal                                                         | What forces re-debate                             |
| -------------------------------------------------------------- | ------------------------------------------------- |
| Mukesh on iPhone says "I want X" but X isn't in scope          | Add X to a Wave 4a-PRO+1 mini-spec                |
| Conflict detection too aggressive (>30% override rate)         | Tune severity tiers per Spec 1 §7.5               |
| Multi-tool batch UX confusing in pilot                         | Switch to per-card Apply                          |
| Empty state suggestions don't match real supervisor pattern    | Update with real top-5 utterances from pilot data |
| Worker disambiguation chip needs more context (not just phone) | Add recent-action context per Spec 1 §9.4         |

---

## 9. Implementation plan estimate

~25 tasks. Sequential dispatch via subagent-driven-development:

**Backend (8 tasks):**

1. Add `propose_mark_absent` tool schema
2. Wire mark_absent handler in chat.ts + integration test
3. Add `propose_leave` tool schema
4. Wire leave handler + integration test
5. Add `propose_swap` tool schema
6. Wire swap handler + integration test
7. Add `propose_termination` tool schema
8. Wire termination handler + integration test
9. Plumb `detectConflicts()` into all 5 propose\_\* handlers + conflict integration test
10. Multi-tool batch handling in sonnet-tool-loop response shape + integration test

**Mobile UI (10 tasks):** 11. `humanizeDayMask` helper + unit tests 12. Use humanizer in DecisionCard 13. Severity color rendering verified via Playwright (WARN + BLOCKED) 14. Chip picker component 15. Wire chip picker into DecisionCard for SOFT conflict 16. Multi-tool batch UI in MessageBubble + DecisionCard 17. Empty state welcome component 18. Skeleton loading replacement for spinner 19. Cancel button contrast fix 20. Update `chat-api.ts` to handle batch DecisionCard responses

**Test discipline (5 tasks):** 21. Comprehensive Playwright suite — flows 7-12 22. Mobile unit tests for new helpers 23. Run all backend tests against real Railway — verify ~85+ tests green 24. Run Playwright headed suite + capture all 12 milestones — panel review 25. Push branch + open draft PR

**Estimated wall-clock:** 7-9 days at AI-codegen + subagent pace.

---

## 10. Sign-off

> **Founder review:** approve, request changes, or open new questions inline as `> FOUNDER NOTE: …`. Once approved, this spec gets locked and the implementation plan is written via writing-plans skill.

> **Implementation gate:** Wave 4a + Wave 2a tests must remain green. No backend regressions. Mobile UI verified at iPhone-14-Pro viewport.

> **Next step after lock:** writing-plans skill produces `docs/plans/2026-05-09-phase-c-wave-4a-pro-plan.md` (~25 tasks). Then subagent-driven-development with dual-workflow discipline. Then founder iPhone smoke test.

> **After Wave 4a-PRO ships:** Wave 4b (other tabs + Sarvam) → Wave 2b (LivingDoc) → Wave 2c (chat history) → Wave 2d (cost) → Wave 3 (Visit cron) → admin web → real customer pilot.
