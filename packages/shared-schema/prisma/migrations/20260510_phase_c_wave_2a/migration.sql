-- Section 1: Assignment table
CREATE TABLE "axhy"."Assignment" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "shiftStart" TEXT NOT NULL,
    "shiftEnd" TEXT NOT NULL,
    "dayMask" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "validUntil" DATE,
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "terminatedReason" TEXT,
    "terminatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Assignment_companyId_state_idx" ON "axhy"."Assignment"("companyId", "state");
CREATE INDEX "Assignment_workerId_state_idx" ON "axhy"."Assignment"("workerId", "state");
CREATE INDEX "Assignment_siteId_state_idx" ON "axhy"."Assignment"("siteId", "state");

ALTER TABLE "axhy"."Assignment" ADD CONSTRAINT "Assignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "axhy"."Assignment" ADD CONSTRAINT "Assignment_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "axhy"."Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "axhy"."Assignment" ADD CONSTRAINT "Assignment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "axhy"."Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Section 2: Attach immutability trigger (function defined in Wave 1 migration)
CREATE TRIGGER assignment_block_past_update
  BEFORE UPDATE ON "axhy"."Assignment"
  FOR EACH ROW
  EXECUTE FUNCTION "axhy"."block_past_assignment_update"();

-- Section 3: ChatThread table
CREATE TABLE "axhy"."ChatThread" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "supervisorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatThread_companyId_supervisorId_key" ON "axhy"."ChatThread"("companyId", "supervisorId");
ALTER TABLE "axhy"."ChatThread" ADD CONSTRAINT "ChatThread_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Section 4: ChatMessage table
CREATE TABLE "axhy"."ChatMessage" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "transcript" TEXT,
    "aiResponseText" TEXT,
    "toolCalls" JSONB,
    "decisionCard" JSONB,
    "voiceConfidence" TEXT,
    "modelUsed" TEXT,
    "costInr" DECIMAL(12,4),
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatMessage_companyId_threadId_createdAt_idx" ON "axhy"."ChatMessage"("companyId", "threadId", "createdAt");
ALTER TABLE "axhy"."ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "axhy"."ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "axhy"."ChatMessage" ADD CONSTRAINT "ChatMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Section 5: ChatRequestLog table (idempotency dedup)
CREATE TABLE "axhy"."ChatRequestLog" (
    "companyId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "responseJson" JSONB NOT NULL,
    "chatMessageId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatRequestLog_pkey" PRIMARY KEY ("companyId", "idempotencyKey")
);

CREATE INDEX "ChatRequestLog_expiresAt_idx" ON "axhy"."ChatRequestLog"("expiresAt");
