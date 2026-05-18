-- Migration 011 — ReplacementInvite: drop groupId + broadcast machinery
--
-- Locked 2026-05-18 by founder direction: invites are single-recipient, not
-- multi-worker broadcasts. See `feedback_replacement_invite_single_recipient.md`.
--
-- The original Wave 1 migration 20260522_010 modelled a PUBG-squad broadcast
-- with `groupId` + a partial unique index `(groupId) WHERE status='ACCEPTED'`.
-- The founder's product call (2026-05-18): supervisor sends ONE invite at a
-- time; 2-min TTL; on expiry/decline supervisor can re-send to same or
-- different worker. "If all accept it will create problem" — politeness
-- debt on the supervisor.
--
-- This migration drops the broadcast machinery:
--   - partial unique index `ReplacementInvite_one_accepted_per_group_uniq`
--   - non-unique index `ReplacementInvite_groupId_idx`
--   - column `groupId`
--
-- No data loss for any other column. Drop is safe because:
--   - groupId currently has no FK references elsewhere.
--   - The accept route is being simplified in the same commit to drop the
--     sibling-expire logic + Postgres advisory lock that depended on
--     groupId.
--
-- Rollback note:
--   Restore: ALTER TABLE add column groupId UUID DEFAULT gen_random_uuid()
--            then CREATE INDEX on groupId
--            then CREATE UNIQUE INDEX … WHERE status='ACCEPTED'
--   Then re-introduce the broadcast logic in the service layer + restore
--   the advisory lock. Not recommended — see feedback memory for why.
--
-- @derives(master-plan §P.4 — ReplacementInvite)
-- @derives(feedback_replacement_invite_single_recipient.md)

DROP INDEX IF EXISTS "axhy"."ReplacementInvite_one_accepted_per_group_uniq";

DROP INDEX IF EXISTS "axhy"."ReplacementInvite_groupId_idx";

ALTER TABLE "axhy"."ReplacementInvite" DROP COLUMN IF EXISTS "groupId";
