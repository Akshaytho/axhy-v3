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
