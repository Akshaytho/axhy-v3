---
Status: LOCKED
Locked by: Founder (Akshay Thota)
Locked at: 2026-05-19
Category: architecture_lock
---

# Chat Sidebar — Daily Context Loading Flow

## The Supervisor's Morning Open

Every day, first time a supervisor opens chat:

```
1. Load ChatThread (one per supervisor per company)
2. Load last N turns (CHAT_HISTORY_TURN_WINDOW)
3. Load LivingDoc (all 5 sections, ACTIVE rules only)
4. Load CalendarEntry last 30 days
5. Load Company + HR rules from Policy table (keys: ai.rules.company, ai.rules.hr)
6. Compose prompt in this EXACT order:
   [System] Intent classifier + disambiguation rules + language note
   [Tier 1] Company rules (Layer 1) — HIGHEST PRIORITY
   [Tier 2] HR rules (Layer 2) — overrides supervisor rules
   [Tier 3] LivingDoc rules (Layer 3) — supervisor's personal patterns
   [Tier 4] Calendar context (last 30 days)
   [Tier 5] Chat history (last N turns)
   [User message]
7. Assert daily budget not exceeded
8. Call model (gpt-5.4-nano, surface: voice_change_parse)
9. Tool loop: max 6 iterations, 50s timeout
10. Persist: user message + assistant response + decisions in ONE transaction
```

## Why the Order Matters

The prompt composition order IS the rule hierarchy. Company rules appear FIRST. The AI sees them as highest-priority instructions.

If a supervisor says something that contradicts a company rule, the AI must follow the company rule and explain why.

## Prompt Caching

Three-tier cache (Spec 2 §Q5):

- Tier 1: System prompt (stable across all supervisors) — cache forever
- Tier 2: LivingDoc (per-supervisor, changes when version bumps) — cache until version changes
- Tier 3: Calendar + chat history (changes every turn) — never cached

LivingDoc.version bumps on every rule add/update → busts Tier 2 cache automatically.

## Model and Surface

- Model: gpt-5.4-nano (founder-locked 2026-05-10, assigned by model-policy.ts)
- Surface: voice_change_parse (enables daily-budget gate)
- Max iterations: 6 tool calls per turn
- Timeout: 50 seconds per turn
- Concurrent limit: 50 supervisors across all companies

## Reload Context Button

Supervisors can press "Reload Context" to force-refresh LivingDoc + Calendar. Limited to 3 presses per day per supervisor. Counter resets at IST midnight (server-side, not device timezone).
