-- Phase A baseline (Day-3 era foundational tables)
--
-- Reconstructed 2026-05-15 from git history to close the migration baseline gap.
-- The 8 tables below (Company, User, Membership, Site, Worker, Visit, LeaveRequest,
-- otp_attempts) were originally created via `prisma db push` during the Day-2/Day-3
-- evidence sprint (commits 7298fc3 + 3556a3f + 6da84fb), never captured as a formal
-- migration. Later migrations (20260508_phase_b_*, 20260509_phase_c_wave_1_calendar,
-- etc.) assume these tables exist via ADD CONSTRAINT and ALTER TABLE statements,
-- so the migration history could not be applied to a fresh database.
--
-- Schema source: state at commit b9058b6 (parent of 6da84fb) + OtpAttempt model from
-- 6da84fb itself. Generated via `prisma migrate diff --from-empty --to-schema-datamodel`.
--
-- On production: mark this migration as already-applied (it must NOT be re-run on prod
-- since the tables already exist there with their post-Day-3 ALTER history). Use:
--     prisma migrate resolve --applied 20260507_phase_a_baseline_day3
--
-- On a fresh local Postgres: this runs cleanly, creates the 8 tables, and later
-- migrations apply on top (adding correctsVisitId, aiSpendDailyInr, etc.).
--
-- See: docs/plans/2026-05-15-migration-baseline-recovery.md

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "axhy";

-- CreateTable
CREATE TABLE "axhy"."Company" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerPhone" VARCHAR(16) NOT NULL,
    "ownerName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "axhy"."User" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(16) NOT NULL,
    "name" TEXT,
    "locale" VARCHAR(8) NOT NULL DEFAULT 'en',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" UUID,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "axhy"."Membership" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "axhy"."Site" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "workdays" VARCHAR(7) NOT NULL DEFAULT 'MTWTFS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "axhy"."Worker" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID,
    "name" TEXT NOT NULL,
    "phone" VARCHAR(16) NOT NULL,
    "bankIfsc" VARCHAR(16),
    "bankAcct" TEXT,
    "state" TEXT NOT NULL DEFAULT 'INVITED',
    "baseSalaryPaise" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "axhy"."Visit" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "photosBefore" INTEGER NOT NULL DEFAULT 0,
    "photosAfter" INTEGER NOT NULL DEFAULT 0,
    "voiceKey" TEXT,
    "verificationText" TEXT,
    "verificationModel" TEXT,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "axhy"."LeaveRequest" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'REQUESTED',
    "decidedBy" UUID,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "axhy"."otp_attempts" (
    "phone" VARCHAR(16) NOT NULL,
    "code_hash" TEXT NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "otp_attempts_pkey" PRIMARY KEY ("phone","issued_at")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "axhy"."Company"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "axhy"."User"("phone");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "axhy"."User"("companyId");

-- CreateIndex
CREATE INDEX "Membership_companyId_idx" ON "axhy"."Membership"("companyId");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "axhy"."Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_companyId_userId_role_key" ON "axhy"."Membership"("companyId", "userId", "role");

-- CreateIndex
CREATE INDEX "Site_companyId_idx" ON "axhy"."Site"("companyId");

-- CreateIndex
CREATE INDEX "Site_companyId_state_idx" ON "axhy"."Site"("companyId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_userId_key" ON "axhy"."Worker"("userId");

-- CreateIndex
CREATE INDEX "Worker_companyId_idx" ON "axhy"."Worker"("companyId");

-- CreateIndex
CREATE INDEX "Worker_companyId_state_idx" ON "axhy"."Worker"("companyId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_companyId_phone_key" ON "axhy"."Worker"("companyId", "phone");

-- CreateIndex
CREATE INDEX "Visit_companyId_scheduledFor_idx" ON "axhy"."Visit"("companyId", "scheduledFor");

-- CreateIndex
CREATE INDEX "Visit_companyId_state_idx" ON "axhy"."Visit"("companyId", "state");

-- CreateIndex
CREATE INDEX "Visit_workerId_scheduledFor_idx" ON "axhy"."Visit"("workerId", "scheduledFor");

-- CreateIndex
CREATE INDEX "Visit_siteId_scheduledFor_idx" ON "axhy"."Visit"("siteId", "scheduledFor");

-- CreateIndex
CREATE INDEX "visit_flagged_idx" ON "axhy"."Visit"("companyId", "flagged");

-- CreateIndex
CREATE INDEX "LeaveRequest_companyId_state_idx" ON "axhy"."LeaveRequest"("companyId", "state");

-- CreateIndex
CREATE INDEX "LeaveRequest_workerId_idx" ON "axhy"."LeaveRequest"("workerId");

-- CreateIndex
CREATE INDEX "LeaveRequest_companyId_fromDate_idx" ON "axhy"."LeaveRequest"("companyId", "fromDate");

-- CreateIndex
CREATE INDEX "otp_phone_recent_idx" ON "axhy"."otp_attempts"("phone", "issued_at" DESC);

-- AddForeignKey
ALTER TABLE "axhy"."User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."Membership" ADD CONSTRAINT "Membership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "axhy"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."Site" ADD CONSTRAINT "Site_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."Worker" ADD CONSTRAINT "Worker_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."Worker" ADD CONSTRAINT "Worker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "axhy"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."Visit" ADD CONSTRAINT "Visit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."Visit" ADD CONSTRAINT "Visit_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "axhy"."Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."Visit" ADD CONSTRAINT "Visit_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "axhy"."Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."LeaveRequest" ADD CONSTRAINT "LeaveRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."LeaveRequest" ADD CONSTRAINT "LeaveRequest_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "axhy"."Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

