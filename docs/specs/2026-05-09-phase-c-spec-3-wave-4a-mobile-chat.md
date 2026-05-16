# Phase C — Spec 3 / Wave 4a: Supervisor mobile chat tab (founder-test MVP)

> **Status:** DRAFT for founder review (panel-sanity-checked 2026-05-09)
> **Date:** 2026-05-09
> **Sequence:** Spec 3 (Mobile UI) — first vertical slice (4a). Wave 4b/c follow.
> **Depends on:** Wave 1 + Wave 2a both merged to main (commits cc3a045, e4e1a4e). 79/79 tests green.
> **Authors:** Akshay (founder) + panel sanity-check (2026-05-09 session)

> **How to give async feedback:** anywhere in this doc, leave `> FOUNDER NOTE: …` lines. Save and push. I integrate next session.

---

## TL;DR (lock from your phone in 30 seconds)

1. **Goal:** founder dogfood-tests the magic loop on his iPhone via Expo Go within ~1 week.
2. **Scope:** ONLY the chat tab. Today's Plan, Summary, Updates, Profile tabs stay as stubs (Wave 4b).
3. **Voice input:** iOS keyboard's built-in dictation. **NO Sarvam/Whisper wiring in 4a** — deferred to Wave 4b. Bypasses STT entirely; iOS converts speech to text natively.
4. **DecisionCard rendering:** title + description + field table + Apply / Cancel buttons. Severity color: gold (CONFIRM) / orange (WARN) / red (BLOCKED, no Apply).
5. **Hardened sync** flow per Spec 2 Q1: Idempotency-Key on every request, 3 client retries on network fail with exponential backoff (2s, 4s, 8s).
6. **No chat history persistence** — refresh tab = lose messages. Acceptable for MVP testing. Wave 4c after Wave 2c.
7. **No new packages** — uses existing `apps/mobile/` Expo + RN scaffold + design tokens.

---

## 1. Why this spec exists

Wave 2a merged the AI chat backend into main. The magic loop works against real Anthropic — verified by 79/79 integration tests. **But there's no UI for it.** Founder can't actually test it on his iPhone yet.

Wave 4a builds the MINIMUM mobile UI surface that lets founder test the magic loop end-to-end on a real device:

- Type or dictate a chat message → see DecisionCard → tap Apply → see Assignment in Prisma Studio.

Why not finish Wave 2b (LivingDoc) or 2c (chat history) first? Because they're polish, not loop-completion. Founder wants visceral "it works on my phone" confirmation FAST, then we polish before pilot.

**Scope rule:** Wave 4a = ONLY the chat tab. Anything else = scope creep, deferred.

---

## 2. What ships (locks summary)

| Component          | Behavior                                                                       |
| ------------------ | ------------------------------------------------------------------------------ |
| Chat tab UI        | Replaces existing stub at `apps/mobile/app/(supervisor)/chat.tsx`              |
| Voice input        | iOS keyboard dictation only (no custom mic button, no Sarvam, no Whisper)      |
| Send               | POST /chat/messages with mandatory `Idempotency-Key` header                    |
| Optimistic UI      | User bubble appears instantly, "thinking..." indicator while waiting           |
| AI response render | Assistant bubble + DecisionCard (if present)                                   |
| DecisionCard       | Title + description + field table + Apply/Cancel buttons                       |
| Apply              | POST /chat/apply → success toast → card collapses                              |
| Severity color     | gold (CONFIRM) / orange (WARN) / red (BLOCKED — no Apply button)               |
| Retries            | 3 retries on network fail with exponential backoff, same Idempotency-Key       |
| Storage            | NONE in 4a — local React state, refresh = lose messages                        |
| Auth               | Existing phone+OTP flow; sandbox tenant `axhy-sandbox`                         |
| Other tabs         | Untouched stubs (Today's Plan, Summary, Updates, Profile remain `Coming soon`) |

---

## 3. File structure

### New files (5)

| Path                                       | Responsibility                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| `apps/mobile/lib/chat-api.ts`              | Typed wrappers: `sendChatMessage()` + `applyDecisionCard()` with retry-with-key |
| `apps/mobile/lib/idempotency-key.ts`       | `generateIdempotencyKey()` returning UUID v4                                    |
| `apps/mobile/components/MessageBubble.tsx` | Renders user / assistant / system bubbles                                       |
| `apps/mobile/components/DecisionCard.tsx`  | Renders the proposed-action card with Apply/Cancel buttons                      |
| `apps/mobile/components/ChatInput.tsx`     | Text input + Send button (iOS dictation mic on keyboard, no extra UI)           |

### Modified files (2)

| Path                                    | Change                                                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `apps/mobile/lib/api.ts`                | Extend `apiFetch()` to accept custom headers (currently hardcodes only `Content-Type` + `Authorization`) |
| `apps/mobile/app/(supervisor)/chat.tsx` | Replace 30-line stub with full chat screen (~250 lines)                                                  |

---

## 4. Architecture

### 4.1 Component tree

```
ChatScreen (chat.tsx)
├── FlatList (inverted, scrolls newest at bottom)
│   └── MessageBubble (per message)
│       └── DecisionCard (if message.decisionCard exists)
└── ChatInput
    ├── TextInput (with iOS dictation enabled by default)
    └── SendButton (disabled while sending; shows spinner)
```

### 4.2 State shape

```ts
type ChatMessageLocal = {
  id: string; // client-generated UUID
  role: 'user' | 'assistant';
  text: string;
  decisionCard?: DecisionCardData; // present on assistant messages with a proposed action
  status: 'pending' | 'sent' | 'failed';
  idempotencyKey?: string;
};

const [messages, setMessages] = useState<ChatMessageLocal[]>([]);
const [thinking, setThinking] = useState(false);
const [error, setError] = useState<string | null>(null);
```

### 4.3 Send flow

```
User taps Send (or iOS keyboard "Enter")
  ↓
chat.tsx:
  1. Generate idempotencyKey via generateIdempotencyKey()
  2. Append user bubble (status='pending')
  3. setThinking(true)
  4. await chatApi.sendChatMessage({ text, idempotencyKey })
       └─ chat-api.ts:
            ├─ POST /chat/messages with Idempotency-Key header
            ├─ Network fail → retry 3x with backoff (2s, 4s, 8s) using SAME key
            └─ Returns { chatMessageId, assistantText, decisionCard }
  5. Append assistant bubble with decisionCard
  6. setThinking(false)
  7. Update user bubble status='sent'

On error:
  - 503 BUSY → toast "Backend busy, retry in a moment" + leave user bubble status='failed'
  - 504 timeout → auto-retry covered by network-fail handler
  - >3 retries OR 5xx → red banner with "Retry" button
```

### 4.4 Apply flow

```
User taps Apply on a DecisionCard
  ↓
DecisionCard:
  1. Disable buttons (prevent double-tap)
  2. await chatApi.applyDecisionCard({ chatMessageId, toolName, toolInput })
       └─ POST /chat/apply
  3. On 200 → show success toast + collapse card (replace with "✓ Applied" inline)
  4. On error → re-enable buttons + red caption "Apply failed: <message>"
```

---

## 5. UI specifications

### 5.1 Color tokens (from `@axhy/ui-tokens`)

Already locked: gold #FACC15 on OLED black. Use existing tokens — no new colors:

- Background: `tokens.color.surface.paper` (OLED black)
- Bubble user: `tokens.color.surface.elevated` with gold accent border
- Bubble assistant: `tokens.color.surface.muted`
- Bubble system/error: red token
- Primary CTA (Apply, Send): gold #FACC15
- Severity color map per DecisionCard:
  - `CONFIRM` → gold border on card
  - `WARN` → orange border
  - `BLOCKED` → red border + Apply button hidden (only Cancel)

### 5.2 DecisionCard layout (per the magic moment)

```
┌─────────────────────────────────┐
│ Confirm assignment              │  card.title (size: heading.medium)
├─────────────────────────────────┤
│ Create assignment with these    │  card.description (size: body)
│ fields?                         │
│                                 │
│  Worker:    Pradeep             │  card.fields rendered as 2-col table
│  Site:      Apollo Hospital     │
│  Days:      Mon-Sat (MTWTFS_)   │
│  Hours:     09:00 - 17:00       │
│  From:      2026-05-12          │
├─────────────────────────────────┤
│ [ Cancel ]      [ Apply ]       │  Apply = gold primary; Cancel = ghost
└─────────────────────────────────┘
```

Field rendering: iterate `card.fields` as a key-value table. For UUID values, render the resolved name from the loop's earlier tool calls (e.g., `find_workers` returned `Pradeep`).

### 5.3 ChatInput layout

```
┌────────────────────────────────────────┐
│ ┌──────────────────────────────────┐   │
│ │ Type or 🎤 dictate...            │   │  TextInput (multiline=false in 4a)
│ └──────────────────────────────────┘   │
│                            [ Send ]    │  gold primary, disabled if input empty
└────────────────────────────────────────┘
```

Note: iOS keyboard's mic icon appears automatically when TextInput is focused. No custom button.

---

## 6. Error handling

| Error                        | UX                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Network fail (no response)   | Auto-retry 3x with backoff (2s, 4s, 8s) using same Idempotency-Key. After 3 → red banner "No connection. Retry?" |
| 401 UNAUTHORIZED             | apiFetch already redirects to phone screen via auth-store                                                        |
| 400 IDEMPOTENCY_KEY_REQUIRED | Should never happen (we always send key); log + show generic error                                               |
| 400 BAD_INPUT                | "Couldn't understand your message" toast                                                                         |
| 503 CHAT_BUSY (Retry-After)  | Toast "Backend busy, retry in a moment" + auto-retry after Retry-After seconds                                   |
| 504 TIMEOUT                  | Auto-retry via network-fail handler, same key                                                                    |
| 500 AI_NOT_CONFIGURED        | "AI not configured" alert (backend missing key)                                                                  |
| 500 generic                  | Red banner + Retry button                                                                                        |
| Apply 200                    | Green toast "Assignment created" + card collapses to "✓ Applied" inline tag                                      |
| Apply 4xx/5xx                | Re-enable buttons + red inline caption                                                                           |

---

## 7. Auth

No new auth code. Use existing flow:

1. Founder logs in via `(auth)/phone.tsx` with sandbox supervisor's phone
2. Receives JWT in `auth-store.ts`
3. apiFetch reads JWT and adds `Bearer` header

Sandbox tenant: `axhy-sandbox`. Supervisor seed phone: per `apps/backend/scripts/seed-sandbox.ts`. Founder uses Expo Go login with that phone + OTP bypass key from `.env.local`.

---

## 8. Test surface

Mobile UI is harder to integration-test than backend. Wave 4a's test discipline is intentionally minimal:

### 8.1 Unit tests (cheap, useful)

- `apps/mobile/lib/idempotency-key.test.ts` — generates UUID v4 format, distinct values
- `apps/mobile/lib/chat-api.test.ts` — retry-with-key behavior on simulated network fails (3 retries, exponential backoff, same key reused)

### 8.2 Manual water-flow (the main verification)

**Founder runs this on his iPhone via Expo Go:**

1. Install Expo Go from App Store on iPhone (if not already)
2. From repo root: `pnpm --filter @axhy/mobile dev` to start the Expo Metro bundler
3. Scan QR code with iPhone camera → opens app in Expo Go
4. Login screen → enter sandbox supervisor's phone
5. OTP screen → enter dev OTP bypass code
6. Lands on Today's Plan tab (existing stub) — tap Chat tab
7. Type "Add Pradeep to Apollo Hospital, Mon-Sat 9 to 5, starting Monday" (or use iOS keyboard mic to dictate)
8. Tap Send
9. See user bubble → "thinking..." → assistant bubble + DecisionCard appears (5-15s)
10. Verify card shows Pradeep + Apollo + Mon-Sat + 09:00-17:00
11. Tap Apply
12. Verify success toast
13. Open Prisma Studio in browser → axhy.Assignment table → see new row

**This is the GATE before Wave 4b / pilot work begins.**

### 8.3 Optional component tests

If quick: 1-2 React Testing Library tests for DecisionCard rendering (with mock card data, assert title + Apply button render). Skip if it slows down ship.

---

## 9. What's NOT in Wave 4a (deferred)

| Feature                                           | Wave                               |
| ------------------------------------------------- | ---------------------------------- |
| Custom voice button + Sarvam/Whisper integration  | 4b                                 |
| Today's Plan tab (live worker list)               | 4b                                 |
| Summary / Updates / Profile tabs                  | 4b                                 |
| Calendar tab (read-only soft-state planning view) | 4b                                 |
| LivingDoc UI (rules + sitePrefs management)       | 4c (after Wave 2b backend)         |
| Chat history scroll-back / pagination             | 4c (after Wave 2c backend)         |
| Push notifications                                | Phase D                            |
| Pull-to-refresh on Today                          | Wave 4b                            |
| Offline mode + queue                              | Phase D (per master plan §G.5 Q10) |
| Multi-supervisor conflict UX                      | Phase D (per Q11)                  |
| Full message persistence + chat-state-machine     | Wave 4c                            |

---

## 10. Re-debate triggers

| Signal                                                             | What forces re-debate                                                      |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| iOS dictation accuracy <70% on common Indian-name+site phrases     | Pull Wave 4b voice integration forward                                     |
| 5xx rate >5% during founder testing                                | Inspect backend; investigate DB / Anthropic latency                        |
| Founder hates the DecisionCard layout in real use                  | Polish in Wave 4b before pilot                                             |
| Idempotency dedup fires unexpectedly (different request, same key) | Bug in client UUID generation; tighten                                     |
| Apply button shows >2s lag after tap                               | Add optimistic UI to Apply (mark applied immediately, rollback on failure) |
| Test with Mukesh persona on real iPhone reveals voice issue        | Wave 4b priority bump                                                      |

---

## 11. Implementation plan estimate

~10 tasks for Wave 4a:

1. Branch `feat/phase-c-wave-4a-mobile-chat` from main
2. `idempotency-key.ts` + unit test
3. Extend `apiFetch` to accept custom headers
4. `chat-api.ts` wrappers with retry-with-key + tests
5. `MessageBubble` component
6. `DecisionCard` component
7. `ChatInput` component
8. Replace `chat.tsx` stub with full screen
9. (Optional) component tests
10. Manual smoke test on Expo Go + push branch + open draft PR

~1 week solo + AI codegen pace.

---

## 12. Sign-off

> **Founder review:** approve, request changes, or open new questions inline as `> FOUNDER NOTE: …`. Once approved, this spec gets locked and the implementation plan is written via writing-plans skill.

> **Implementation gate:** Wave 1 + Wave 2a tests (79/79) must remain green throughout. Mobile UI work doesn't touch backend; regression risk is zero.

> **Next step after lock:** writing-plans skill produces `docs/plans/2026-05-09-phase-c-wave-4a-mobile-chat-plan.md` (~10 tasks). Then subagent-driven-development. Then founder tests on iPhone.

> **After 4a:** Wave 4b (other tabs + real Sarvam/Whisper voice) → Wave 2b (LivingDoc backend + UI) → Wave 2c (chat history) → Wave 2d (cost ceiling + prompt cache) → Wave 3 (Visit cron) → Admin web → HR portal → real customer pilot. Estimated 3-4 weeks total at current pace.
