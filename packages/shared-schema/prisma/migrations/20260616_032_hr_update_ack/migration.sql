-- Migration 032 — HRUpdateAck: per-supervisor acknowledgement of an HRUpdate.
--
-- ADDITIVE. Adds one new tenant table so a company-wide HRUpdate can be
-- acknowledged by many supervisors (one row per update × supervisor), powering
-- the HR "who-acked" report. The legacy HRUpdate.acknowledgedBy /
-- acknowledgmentPhrase columns are left untouched (back-compat: the existing
-- targeted single-ack path keeps working). No existing table or column changes.
--
-- RLS: HRUpdateAck carries companyId, so it joins the tenant-isolation slice from
-- migration 023 — ENABLE + FORCE ROW LEVEL SECURITY + the tenant_isolation policy
-- (GUC predicate axhy.current_company_id), plus the axhy_app DML grant. This is a
-- no-op for the current postgres (superuser) connection and takes effect once
-- DATABASE_URL is switched to axhy_app (founder-gated, exactly as in 023). The
-- ALTER DEFAULT PRIVILEGES from 023 already grants axhy_app on new tables; the
-- explicit GRANT below is belt-and-braces and idempotent.
--
-- Reversible. Rollback (full):
--   DROP POLICY IF EXISTS tenant_isolation ON "axhy"."HRUpdateAck";
--   DROP TABLE IF EXISTS "axhy"."HRUpdateAck";  -- drops table + its indexes, FK, policy
--
-- @derives(packages/shared-schema/prisma/migrations/20260609_023_rls_tenant_isolation)
-- @derives(docs/locked/operational-invariants.md INVARIANT 1)

-- CreateTable
CREATE TABLE "axhy"."HRUpdateAck" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "hrUpdateId" UUID NOT NULL,
    "supervisorUserId" UUID NOT NULL,
    "ackText" TEXT NOT NULL,
    "ackedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HRUpdateAck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HRUpdateAck_hrUpdateId_supervisorUserId_key" ON "axhy"."HRUpdateAck"("hrUpdateId", "supervisorUserId");

-- CreateIndex
CREATE INDEX "HRUpdateAck_companyId_hrUpdateId_idx" ON "axhy"."HRUpdateAck"("companyId", "hrUpdateId");

-- AddForeignKey
ALTER TABLE "axhy"."HRUpdateAck" ADD CONSTRAINT "HRUpdateAck_hrUpdateId_fkey" FOREIGN KEY ("hrUpdateId") REFERENCES "axhy"."HRUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS — extend the migration-023 tenant_isolation slice to the new table.
GRANT SELECT, INSERT, UPDATE, DELETE ON "axhy"."HRUpdateAck" TO axhy_app;
ALTER TABLE "axhy"."HRUpdateAck" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "axhy"."HRUpdateAck" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "axhy"."HRUpdateAck";
CREATE POLICY tenant_isolation ON "axhy"."HRUpdateAck"
  USING ("companyId"::text = current_setting('axhy.current_company_id', true))
  WITH CHECK ("companyId"::text = current_setting('axhy.current_company_id', true));
