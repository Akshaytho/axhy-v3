-- CreateTable
CREATE TABLE "axhy"."Attendance" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "markedBySupervisorId" UUID NOT NULL,
    "reason" TEXT,
    "payDeductPaise" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "axhy"."Complaint" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "supervisorId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'LOW',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "axhy"."SwapRequest" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "supervisorId" UUID NOT NULL,
    "fromWorkerId" UUID NOT NULL,
    "toWorkerId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SwapRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "axhy"."SupervisorDecision" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "supervisorId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "targetId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "appliedAt" TIMESTAMP(3),
    "ackRequired" BOOLEAN NOT NULL DEFAULT false,
    "ackedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupervisorDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "axhy"."SupervisorDailyContext" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "supervisorId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "snapshot" JSONB NOT NULL DEFAULT '{}',
    "chatHistory" JSONB NOT NULL DEFAULT '[]',
    "loadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupervisorDailyContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "axhy"."HRUpdate" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "hrId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "targetSupervisorId" UUID,
    "acknowledgmentRequired" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgmentPhrase" TEXT,
    "acknowledgedBy" UUID,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HRUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "axhy"."VisitPhoto" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "visitId" UUID NOT NULL,
    "side" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "pHash" TEXT,
    "aiVerifyStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "aiVerifyText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attendance_companyId_idx" ON "axhy"."Attendance"("companyId");

-- CreateIndex
CREATE INDEX "Attendance_companyId_date_idx" ON "axhy"."Attendance"("companyId", "date");

-- CreateIndex
CREATE INDEX "Attendance_companyId_status_idx" ON "axhy"."Attendance"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_workerId_date_key" ON "axhy"."Attendance"("workerId", "date");

-- CreateIndex
CREATE INDEX "Complaint_companyId_idx" ON "axhy"."Complaint"("companyId");

-- CreateIndex
CREATE INDEX "Complaint_companyId_siteId_idx" ON "axhy"."Complaint"("companyId", "siteId");

-- CreateIndex
CREATE INDEX "Complaint_companyId_resolvedAt_idx" ON "axhy"."Complaint"("companyId", "resolvedAt");

-- CreateIndex
CREATE INDEX "SwapRequest_companyId_idx" ON "axhy"."SwapRequest"("companyId");

-- CreateIndex
CREATE INDEX "SwapRequest_companyId_state_idx" ON "axhy"."SwapRequest"("companyId", "state");

-- CreateIndex
CREATE INDEX "SwapRequest_siteId_effectiveAt_idx" ON "axhy"."SwapRequest"("siteId", "effectiveAt");

-- CreateIndex
CREATE INDEX "SupervisorDecision_companyId_idx" ON "axhy"."SupervisorDecision"("companyId");

-- CreateIndex
CREATE INDEX "SupervisorDecision_companyId_supervisorId_createdAt_idx" ON "axhy"."SupervisorDecision"("companyId", "supervisorId", "createdAt");

-- CreateIndex
CREATE INDEX "SupervisorDecision_companyId_tier_idx" ON "axhy"."SupervisorDecision"("companyId", "tier");

-- CreateIndex
CREATE INDEX "SupervisorDecision_companyId_appliedAt_idx" ON "axhy"."SupervisorDecision"("companyId", "appliedAt");

-- CreateIndex
CREATE INDEX "SupervisorDailyContext_companyId_idx" ON "axhy"."SupervisorDailyContext"("companyId");

-- CreateIndex
CREATE INDEX "SupervisorDailyContext_companyId_date_idx" ON "axhy"."SupervisorDailyContext"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SupervisorDailyContext_supervisorId_date_key" ON "axhy"."SupervisorDailyContext"("supervisorId", "date");

-- CreateIndex
CREATE INDEX "HRUpdate_companyId_idx" ON "axhy"."HRUpdate"("companyId");

-- CreateIndex
CREATE INDEX "HRUpdate_companyId_targetSupervisorId_idx" ON "axhy"."HRUpdate"("companyId", "targetSupervisorId");

-- CreateIndex
CREATE INDEX "HRUpdate_companyId_acknowledgedAt_idx" ON "axhy"."HRUpdate"("companyId", "acknowledgedAt");

-- CreateIndex
CREATE INDEX "VisitPhoto_companyId_idx" ON "axhy"."VisitPhoto"("companyId");

-- CreateIndex
CREATE INDEX "VisitPhoto_visitId_idx" ON "axhy"."VisitPhoto"("visitId");

-- CreateIndex
CREATE INDEX "VisitPhoto_companyId_aiVerifyStatus_idx" ON "axhy"."VisitPhoto"("companyId", "aiVerifyStatus");

-- AddForeignKey
ALTER TABLE "axhy"."Attendance" ADD CONSTRAINT "Attendance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."Attendance" ADD CONSTRAINT "Attendance_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "axhy"."Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."Complaint" ADD CONSTRAINT "Complaint_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."Complaint" ADD CONSTRAINT "Complaint_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "axhy"."Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."SwapRequest" ADD CONSTRAINT "SwapRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."SwapRequest" ADD CONSTRAINT "SwapRequest_fromWorkerId_fkey" FOREIGN KEY ("fromWorkerId") REFERENCES "axhy"."Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."SwapRequest" ADD CONSTRAINT "SwapRequest_toWorkerId_fkey" FOREIGN KEY ("toWorkerId") REFERENCES "axhy"."Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."SwapRequest" ADD CONSTRAINT "SwapRequest_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "axhy"."Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."SupervisorDecision" ADD CONSTRAINT "SupervisorDecision_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."SupervisorDailyContext" ADD CONSTRAINT "SupervisorDailyContext_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."HRUpdate" ADD CONSTRAINT "HRUpdate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."VisitPhoto" ADD CONSTRAINT "VisitPhoto_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."VisitPhoto" ADD CONSTRAINT "VisitPhoto_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "axhy"."Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

