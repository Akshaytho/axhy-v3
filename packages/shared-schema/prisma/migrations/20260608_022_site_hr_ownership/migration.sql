-- Site-anchored HR ownership (doc 15 §3, founder-simplified 2026-06-08 to one-worker-one-HR).
-- Adds Site.ownerHrUserId: the single HR (User.id) that owns each site. NULL = unassigned.
-- ON DELETE SET NULL: deleting an HR user unassigns their sites (OWNER reassigns), never cascades.
-- Replaces the dead HRPod / Membership.podId machinery, which is LEFT IN PLACE (no destructive drop).
-- Reversible — see rollback at the bottom.

ALTER TABLE "axhy"."Site" ADD COLUMN "ownerHrUserId" UUID;

ALTER TABLE "axhy"."Site"
  ADD CONSTRAINT "Site_ownerHrUserId_fkey"
  FOREIGN KEY ("ownerHrUserId") REFERENCES "axhy"."User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Site_companyId_ownerHrUserId_idx" ON "axhy"."Site"("companyId", "ownerHrUserId");

-- Backfill (prevents a day-one HR-portal blackout): a tenant with EXACTLY ONE active HR
-- gets all its sites auto-assigned to that HR. Tenants with 0 or >1 HRs keep NULL and the
-- OWNER assigns sites explicitly via PATCH /admin/sites/:id/hr.
UPDATE "axhy"."Site" s
SET "ownerHrUserId" = sole.user_id
FROM (
  SELECT m."companyId" AS company_id, MIN(m."userId") AS user_id
  FROM "axhy"."Membership" m
  WHERE m.role = 'HR' AND m.status = 'ACTIVE'
  GROUP BY m."companyId"
  HAVING COUNT(*) = 1
) sole
WHERE s."companyId" = sole.company_id AND s."ownerHrUserId" IS NULL;

-- ============================================================================
-- ROLLBACK (documented, reversible — run in this order to undo):
--   DROP INDEX "axhy"."Site_companyId_ownerHrUserId_idx";
--   ALTER TABLE "axhy"."Site" DROP CONSTRAINT "Site_ownerHrUserId_fkey";
--   ALTER TABLE "axhy"."Site" DROP COLUMN "ownerHrUserId";
-- ============================================================================
