-- Migration 015 — ChatMessage.tokensIn + tokensOut for per-supervisor
-- token cap (replaces the message-count cap from the original Wave A plan).
--
-- Founder design change 2026-05-19: per-supervisor daily cap moves from
-- "200 messages/day" to "50000 tokens/day" because a 30-second voice note
-- with photos burns ~10× the tokens of a 3-word "Mukesh absent" — the
-- previous cap was unfair to short-form users and too generous to
-- long-form users.
--
-- The columns are nullable + default 0 so existing rows are unaffected.
-- New chat turns will populate them from openaiToolLoop's usage block
-- (`response.usage.prompt_tokens` + `completion_tokens`).
--
-- Rollback:
--   ALTER TABLE "axhy"."ChatMessage"
--     DROP COLUMN "tokensIn", DROP COLUMN "tokensOut";
--
-- @derives(plans/abstract-wandering-kazoo.md Wave A follow-on)
-- @derives(docs/locked/chat-abuse-prevention.md — supersedes the
--   message-count cap in §"Budget Abuse Prevention" §1)

ALTER TABLE "axhy"."ChatMessage"
  ADD COLUMN IF NOT EXISTS "tokensIn" INTEGER,
  ADD COLUMN IF NOT EXISTS "tokensOut" INTEGER;

-- Composite index for the cap query: "sum tokens per supervisor on today's
-- IST date". The supervisor's chat history already orders by createdAt so
-- this index pays off the cap check without adding write cost.
--
-- We can't filter on `transcript IS NOT NULL` in the index without making
-- it a partial expression on a JOIN — the cap query joins ChatThread to
-- get the supervisorId, so the index on (companyId, threadId, createdAt)
-- (already present) does the heavy lifting. This new index helps the
-- additive sum on tokensIn + tokensOut.

CREATE INDEX IF NOT EXISTS
  "ChatMessage_companyId_role_createdAt_idx"
  ON "axhy"."ChatMessage" ("companyId", "role", "createdAt");
