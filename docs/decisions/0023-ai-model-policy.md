# ADR-0023: Per-surface AI model selection policy

- **Status:** Accepted
- **Date:** 2026-04-29
- **Master plan §:** §E (thin-AI rule), §B (pricing — AI cost cap)
- **Panel debate:** 2026-04-29-model-policy
- **Supersedes:** the implicit assumption that one model serves all surfaces

## Context

Axhy v3 invokes AI at multiple surfaces with very different cost-vs-quality profiles. Founder noticed GPT-5.4-nano at $0.25/1M input — 60× cheaper than Opus 4.7. Naive "one model everywhere" wastes 5–10× on cheap surfaces or under-delivers on critical ones.

V2 used GPT-5.1 broadly. v3.0 lands with current-gen models tiered per surface.

## Decision

Pick the model per surface, not per project. Hard cost-ceiling per call enforced at `@axhy/ai-tools` boundary.

| Surface                                    | Model                                 | Reason                                      |
| ------------------------------------------ | ------------------------------------- | ------------------------------------------- |
| Voice change-capture parse (supervisor)    | Claude Sonnet 4.6                     | Mix-language NLP, high quality, mid cost    |
| AI verification (worker photo + voice)     | GPT-5.4 (multimodal)                  | Multimodal reasoning, mid cost              |
| AI conversational onboarding               | Claude Opus 4.7                       | 50-question setup; quality wins; low volume |
| Alias map / nickname matching              | GPT-5.4-nano                          | Cheap text similarity, high volume          |
| Sarvam transcript cleanup (low confidence) | Claude Haiku 4.5                      | Cheap, fast, just polishing                 |
| STT — monolingual Indian language          | Sarvam.ai                             | India residency, accent quality             |
| STT — code-switched                        | OpenAI Whisper                        | Mixed-language handling                     |
| Embeddings — our code + general            | OpenAI text-embedding-3-small         | Cheap, high quality                         |
| Embeddings — customer voice transcripts    | Cohere multilingual v3 (India region) | DPDP residency                              |

## Hard rules

1. **Surface declares its model**, not the calling code. Calling `@axhy/ai-tools` passes a `surface` enum; the model is resolved by policy.
2. **Per-call cost ceiling**: each surface has a max cost-per-call. If exceeded, gateway throws `AICostBudgetError`. No silent overspend.
3. **No surface uses Opus 4.7 in a hot loop**. Opus is reserved for AI onboarding (per-customer one-time) or escalation paths (rare).
4. **Audit log includes `model_used`** on every AI invocation so cost can be reconstructed retroactively.
5. **Tenant tier may override downward** (cheap pilot tenant may use cheaper model on a surface), never upward without ADR amendment.

## Consequences

### Positive

- ~85% AI cost reduction at scale (~₹820K/month savings vs naive Opus-everywhere)
- Each surface picks the right tradeoff
- Cost regressions caught at gateway, not in monthly bill review

### Negative

- More configuration; can't change one model and have it propagate
- Per-surface tuning needed when models upgrade

### Neutral

- Re-evaluate every 6 months as Anthropic / OpenAI pricing changes
- Each surface owns its own evaluation suite to verify the chosen model still passes

## Cost impact at 5 customers / 5000 workers / 1 year scale

|                      | Per-surface policy | Naive Opus 4.7 everywhere |
| -------------------- | ------------------ | ------------------------- |
| AI cost / year       | ~₹1.35M            | ~₹11.16M                  |
| AI cost / month      | ~₹112K             | ~₹930K                    |
| Per customer / month | ~₹22K              | ~₹186K                    |

Master plan §B AI cost cap is ₹5K/month per customer in pricing. Per-surface policy gets us 4× over cap on heaviest customers. Naive choice would be 37× over cap — uneconomic.

## Lineage

- **Derives from:** master plan §E (thin-AI rule), §B (pricing model)
- **Affects packages:** @axhy/ai-tools (primary)
- **Implementation tracked in:** ai-tools model-policy.ts (lands Day 3 of evidence sprint)
