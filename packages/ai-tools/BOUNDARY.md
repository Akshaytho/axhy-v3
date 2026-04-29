# @axhy/ai-tools — BOUNDARY

## Owns
- Anthropic SDK wrapper (Claude calls)
- OpenAI SDK wrapper (Whisper + embeddings)
- Sarvam.ai client (monolingual STT, India region)
- Per-tenant rate limit enforcement
- AI cost tracking (per call, per tenant, per day)
- Prompt versioning + registry
- `<untrusted_user_content>` tag enforcement on user input
- STT routing: Sarvam for monolingual, Whisper for code-switched

## Does NOT own
- Business decisions (AI suggests, business-rules + state-machines decide)
- Database persistence
- Direct user input handling (always called from backend)

## Internal dependencies
- `@axhy/shared-schema`
- `@axhy/errors`

## NEVER imports
- `@axhy/state-machines` — strict separation: AI at boundary, machines as spine
- `apps/*`

## Who imports this
- `apps/backend` — only consumer (mobile + web NEVER call AI directly)

## Lineage anchor
Master plan §E (thin-AI rule) + §G (AI architecture). ADR-0010 — AI at boundary only.
