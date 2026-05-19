---
Status: LOCKED
Locked by: Founder (Akshay Thota)
Locked at: 2026-05-19
Category: architecture_lock
---

# Chat Error Scenarios and Multi-Language Handling

## Error Scenarios

Every error has a specific response. The AI never returns generic messages.

| Scenario                               | AI behavior                                                                         | HTTP status         |
| -------------------------------------- | ----------------------------------------------------------------------------------- | ------------------- |
| Worker not found                       | "I couldn't find [name]. Did you mean..." + options from find_workers               | 200 (clarification) |
| Site not found                         | "I don't see a site called [name]. Your sites are..." + list                        | 200 (clarification) |
| Budget exhausted (company cap)         | "Daily AI limit reached. Try again tomorrow."                                       | 429                 |
| Budget exhausted (supervisor messages) | "You've reached your daily message limit (200). Try again tomorrow."                | 429                 |
| Server error (500)                     | Mobile shows retry button. AI response is NOT cached (no idempotency).              | 500                 |
| Network timeout (50s)                  | Mobile shows "Connection timed out. Tap to retry."                                  | 504                 |
| 50-concurrent limit hit                | 503 + auto-retry once after Retry-After: 5. Still blocked: "System busy."           | 503                 |
| Ambiguous intent (confidence < 0.7)    | propose_clarify with tappable option chips                                          | 200                 |
| Contradicts company rule (Layer 1)     | Explain the rule, refuse the action, suggest alternatives                           | 200                 |
| Contradicts HR rule (Layer 2)          | Explain the HR policy, offer to request exception                                   | 200                 |
| Supervisor asks off-topic question     | "I can help with attendance, assignments, complaints, and leave. What do you need?" | 200                 |
| Supervisor swears/threatens            | Neutral response. Log severity=HIGH. Don't mirror tone.                             | 200                 |
| Supervisor tries SQL injection         | Input is parameterized. Raw text goes to AI, not DB queries. No effect.             | 200                 |
| Supervisor shares password in chat     | "Please don't share passwords in chat. I can't store or use them."                  | 200                 |
| Company is SUSPENDED                   | "Your company account is suspended. Contact your administrator."                    | 403                 |
| Worker already marked absent today     | "Ravi is already marked absent for today." (idempotent)                             | 200                 |
| Same Idempotency-Key sent twice        | Return cached response from first request. Never reprocess.                         | 200                 |
| Tool loop exceeds 6 iterations         | Return partial result: "I ran out of time. Here's what I have so far."              | 200                 |

## Multi-Language Handling

The Product AI handles 4 language modes:

1. **Pure Hindi**: "Ravi aaj nahi aaya"
2. **Pure Telugu**: "Ravi ippudu raaledu"
3. **Pure English**: "Ravi didn't come today"
4. **Code-switched**: "Ravi absent hai aaj, mark karo"

### Language Rules

- The AI responds in the SAME language the supervisor used
- If supervisor uses Hindi, AI responds in Hindi (Devanagari or romanized, matching the supervisor's style)
- Decision card labels are ALWAYS bilingual: supervisor's language + English
- Worker names are matched via alias_map (handles nicknames, transliterations)
- The AI never corrects the supervisor's grammar
- The AI never transliterates without being asked

### Voice Input Pipeline

```
Voice → STT → Transcript → AI processes text
```

- stt_monolingual: for pure Hindi, Telugu, or English
- stt_codeswitched: for mixed-language input
- STT choice is per-supervisor based on their language preference setting
- STT errors (garbled transcription) should trigger propose_clarify, not a guess

### Name Matching

Workers often go by nicknames, short forms, or transliterations:

- "Ravi" = "Ravinder" = "Ravi Kumar"
- "Suresh bhai" = "Suresh"
- The AI uses find_workers which searches the alias_map
- If multiple matches: "I found 2 workers named Ravi. Which one? [options]"
- If zero matches: "I couldn't find [name]. Did you mean [closest options]?"
- NEVER guess. NEVER create a decision for a worker that wasn't found in the DB.
