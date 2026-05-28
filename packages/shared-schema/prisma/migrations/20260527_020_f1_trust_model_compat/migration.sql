-- F1-a Trust Model (compatibility window)
-- Adds Membership.token_epoch + User.is_platform_admin. Both default to safe
-- values so every existing row works without a backfill except the founder.

ALTER TABLE "axhy"."Membership"
  ADD COLUMN "token_epoch" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "axhy"."User"
  ADD COLUMN "is_platform_admin" BOOLEAN NOT NULL DEFAULT false;

-- Founder bootstrap (single hard-coded UUID — see NEXT_SESSION.md §F1).
UPDATE "axhy"."User"
   SET "is_platform_admin" = true
 WHERE "id" = '17285e17-9434-4522-9ac1-1cec1cbea31f';
