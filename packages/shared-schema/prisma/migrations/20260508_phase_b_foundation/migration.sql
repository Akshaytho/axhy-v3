-- CreateTable
CREATE TABLE "axhy"."AuditEvent" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "targetId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "axhy"."Outbox" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "topic" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "processedAt" TIMESTAMP(3),
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "axhy"."Device" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'REGISTERED',
    "phoneModel" TEXT,
    "osVersion" TEXT,
    "appVersion" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditEvent_companyId_idx" ON "axhy"."AuditEvent"("companyId");

-- CreateIndex
CREATE INDEX "AuditEvent_companyId_kind_idx" ON "axhy"."AuditEvent"("companyId", "kind");

-- CreateIndex
CREATE INDEX "AuditEvent_companyId_createdAt_idx" ON "axhy"."AuditEvent"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_idx" ON "axhy"."AuditEvent"("actorId");

-- CreateIndex
CREATE INDEX "Outbox_companyId_idx" ON "axhy"."Outbox"("companyId");

-- CreateIndex
CREATE INDEX "Outbox_processedAt_nextRetryAt_idx" ON "axhy"."Outbox"("processedAt", "nextRetryAt");

-- CreateIndex
CREATE INDEX "Outbox_topic_idx" ON "axhy"."Outbox"("topic");

-- CreateIndex
CREATE INDEX "Device_companyId_idx" ON "axhy"."Device"("companyId");

-- CreateIndex
CREATE INDEX "Device_userId_idx" ON "axhy"."Device"("userId");

-- CreateIndex
CREATE INDEX "Device_companyId_state_idx" ON "axhy"."Device"("companyId", "state");

-- AddForeignKey
ALTER TABLE "axhy"."AuditEvent" ADD CONSTRAINT "AuditEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."Outbox" ADD CONSTRAINT "Outbox_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."Device" ADD CONSTRAINT "Device_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "axhy"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

