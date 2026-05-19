---
Status: LOCKED
Locked by: Founder (Akshay Thota)
Locked at: 2026-05-19
Category: architecture_lock
---

# LivingDoc Extraction Rules

## What LivingDoc IS

LivingDoc is the supervisor's personal knowledge base — patterns, preferences, and site-specific rules that the AI learns from chat over time. It is Layer 3 in the rule hierarchy (overridden by Company and HR rules).

Each supervisor has ONE LivingDoc per company. It is stored as JSON in the LivingDoc table.

## The 5 Sections

Every LivingDoc has exactly these sections:

1. **siteRules** — rules tied to a specific site ("3rd floor bathrooms first at Apollo")
2. **workerNotes** — notes about individual workers ("Ravi is slow on Mondays")
3. **clientPreferences** — client-specific preferences ("BigCorp wants lobby done before 8am")
4. **recurringTasks** — tasks that repeat on a schedule ("Deep clean kitchen every Friday")
5. **freeNotes** — anything that doesn't fit the above ("Monsoon season: carry extra mops")

## Extraction Rules

When the AI detects a pattern in the supervisor's chat that could become a rule, it uses propose_living_doc_update to suggest it.

### What to Extract

Only CONCRETE, ACTIONABLE patterns:

GOOD:

- "Ravi always does 3rd floor bathrooms first at Apollo hospital"
- "When it rains, send 2 extra mops to BigCorp"
- "Suresh should never be assigned to night shifts"

BAD:

- "things should be better" (too vague)
- "I like Ravi" (not an operational rule)
- "okay" (acknowledgment, not a rule)

### Rule States

```
PENDING → ACTIVE    (supervisor confirms)
PENDING → REJECTED  (supervisor rejects)
PENDING → EXPIRED   (30 days without decision)
ACTIVE  → EXPIRED   (manual expire or cap overflow)
```

No other transitions. REJECTED rules cannot become ACTIVE. EXPIRED rules cannot become ACTIVE. To re-activate an expired rule, create a new rule with the same text.

PENDING rules are NOT used in prompt composition. Only ACTIVE rules affect AI behavior.

### Required Fields

Every rule MUST have:

- **ruleText** — the actual rule (min 1 char, max 300 chars)
- **description** — why this rule exists (min 1 char)
- **visibility** — COMPANY, SUPERVISOR_OWN, or WORKER_OWN
- **section** — one of the 5 sections above
- **scope** — optional: which worker, site, or client this applies to
- **createdBy** — 'supervisor' if typed directly, 'ai_inferred' if extracted from chat

### Limits

- **MAX 100 ACTIVE rules per LivingDoc.** When limit reached, oldest ACTIVE rules auto-EXPIRE. Supervisor can manually EXPIRE rules they no longer need.
- **MAX 300 characters per ruleText.** If supervisor describes a complex pattern, the AI splits it into multiple focused rules.

### Modification Rules

- The AI NEVER modifies an ACTIVE rule without supervisor confirmation
- To update a rule: propose a new version -> supervisor confirms -> old one EXPIRES
- Rules with personal data (salary, phone, medical) MUST be tagged visibility: SUPERVISOR_OWN. They are never exposed to other supervisors or workers.

## Prompt Composition

Only ACTIVE rules are loaded into the prompt at Tier 3 (below Company and HR rules). The prompt composition order enforces the hierarchy: even if a LivingDoc rule contradicts a Company rule, the Company rule wins because it appears first and at higher priority.

LivingDoc.version bumps on every rule add/update, busting the Tier 2 prompt cache automatically.
