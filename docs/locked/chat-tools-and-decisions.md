---
Status: LOCKED
Locked by: Founder (Akshay Thota)
Locked at: 2026-05-19
Category: architecture_lock
---

# Chat Tools and Decision Flow

## The 10 Tools

The Product AI has exactly these 10 tools. No more. No fewer.

| Tool                      | What it does                                  | Creates decision card? |
| ------------------------- | --------------------------------------------- | ---------------------- |
| find_workers              | Search workers by name/alias/site             | No                     |
| find_sites                | Search sites by name/client                   | No                     |
| propose_create_assignment | Propose assigning a worker to a site          | Yes                    |
| propose_mark_absent       | Propose marking a worker absent today         | Yes                    |
| propose_leave             | Propose leave request for a worker            | Yes                    |
| propose_living_doc_update | Add/update a supervisor rule in LivingDoc     | Yes                    |
| propose_swap              | Propose swapping two workers' assignments     | Yes                    |
| propose_termination       | Propose terminating a worker                  | Yes                    |
| propose_log_complaint     | Log a complaint (fire-and-display, immediate) | Yes                    |
| propose_clarify           | Ask supervisor a clarifying question          | No (shows chips)       |

The AI CANNOT call tools not in this whitelist. No hidden tools. No admin-only tools accessible via chat.

## Decision Card Flow

Every propose\_\* tool creates a SupervisorDecision in PROPOSED state.

```
AI proposes → Decision card rendered → Supervisor sees Apply/Dismiss
  ├─ Apply tap → Decision APPLIED → Domain effect happens (DB write)
  └─ Dismiss tap → Decision DISMISSED → Nothing happens
```

NOTHING happens in the database until the supervisor taps Apply. The AI is a PROPOSAL MACHINE. It suggests. The supervisor confirms. This flow is non-negotiable.

### Exception: Complaints

propose_log_complaint is fire-and-display. The complaint record is created immediately because complaints are time-sensitive evidence. The supervisor can still dismiss the card to cancel, but the initial record exists from the moment the tool is called.

## Amend Flow

When a supervisor corrects a previous decision ("no, I meant 3 workers not 2"):

1. Mobile detects this is an amendment
2. Sends the original decision ID in the request
3. AI gets injected context: "Supervisor is correcting decision X"
4. AI proposes a NEW decision card with the correction
5. Old decision stays PROPOSED (supervisor can dismiss it)
6. Mobile celebrates only when didAmend=true in response

The AI never silently modifies a PROPOSED decision. It always creates a new one.

## Tool Usage Rules

- find*workers and find_sites MUST be called before any propose*\* tool that references a worker or site. The AI never creates a decision card with a worker/site that doesn't exist in the DB.
- If find_workers returns no match: "I couldn't find a worker named [name]. Did you mean [options]?"
- If find_sites returns no match: "I don't see a site called [name]. Your sites are: [list]"
- propose_clarify is used when confidence < 0.7 on intent classification. It shows tappable option chips, not free text.

## Max Tool Iterations

- Max 6 tool calls per turn
- 50-second timeout per turn
- If the tool loop exceeds either limit, the AI returns what it has so far with a note: "I ran out of time processing your request. Here's what I have so far."

## Transaction Discipline

When a decision is APPLIED:

- ChatMessage + SupervisorDecision + incrementSpend all happen in ONE transaction
- If any write fails, ALL roll back
- No partial state (message saved but decision lost)
- Idempotency-Key prevents duplicate processing
