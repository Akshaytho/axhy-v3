-- AlterTable: add Visit correction columns
ALTER TABLE "axhy"."Visit" ADD COLUMN     "correctsVisitId" UUID,
ADD COLUMN     "originalVisitId" UUID,
ADD COLUMN     "correctionReason" TEXT,
ADD COLUMN     "correctionNote" TEXT;

-- CreateTable
CREATE TABLE "axhy"."CalendarEntry" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "supervisorId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "editableUntil" TIMESTAMP(3) NOT NULL,
    "promotedToKind" TEXT,
    "promotedToId" UUID,
    "promotedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarEntry_companyId_supervisorId_date_idx" ON "axhy"."CalendarEntry"("companyId", "supervisorId", "date");

-- CreateIndex
CREATE INDEX "CalendarEntry_companyId_date_idx" ON "axhy"."CalendarEntry"("companyId", "date");

-- AddForeignKey
ALTER TABLE "axhy"."CalendarEntry" ADD CONSTRAINT "CalendarEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Section 6: latest_visit view
-- Returns the most-recent (uncorrected) row in each correction chain.
-- Reporting queries in services/payroll/* and services/billing/* MUST use this view.
CREATE VIEW "axhy"."latest_visit" AS
  SELECT v.*
  FROM "axhy"."Visit" v
  WHERE NOT EXISTS (
    SELECT 1 FROM "axhy"."Visit" v2
    WHERE v2."correctsVisitId" = v.id
  );

-- Section 7: partial unique index on Visit correction chain
-- Guarantees one canonical (uncorrected) row per chain.
CREATE UNIQUE INDEX "Visit_canonical_per_chain"
  ON "axhy"."Visit" ("originalVisitId")
  WHERE "correctsVisitId" IS NULL;

-- Section 8: past-Assignment immutability trigger function placeholder.
-- The Assignment table is created in Wave 2. The trigger function is defined here
-- so Wave 2 only needs to attach it via CREATE TRIGGER.
CREATE OR REPLACE FUNCTION "axhy"."block_past_assignment_update"()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."validUntil" IS NOT NULL
     AND OLD."validUntil" < CURRENT_DATE
     AND OLD.state != 'TERMINATED' THEN
    RAISE EXCEPTION 'past-immutability: Assignment validUntil < today and state != TERMINATED'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Section 9: pendingAssignmentPayload column for Wave 1 deferred Assignment promotion
-- Wave 2 reads this column and creates real Assignment rows.
ALTER TABLE "axhy"."CalendarEntry" ADD COLUMN "pendingAssignmentPayload" JSONB;
