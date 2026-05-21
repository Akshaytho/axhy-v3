-- F-006b worker-shell relaxation (2026-05-21) — DPDP one-page consent.
-- Cross-tenant: workers consent to the Axhy platform privacy policy, not to
-- the cleaning company, so there's no companyId column. Append-only.
--
-- Reversible: DROP TABLE "axhy"."ConsentLog" CASCADE will undo with no
-- inbound FK references from any other table.

-- CreateTable
CREATE TABLE "axhy"."ConsentLog" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "policyVersion" VARCHAR(32) NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentLog_userId_idx" ON "axhy"."ConsentLog"("userId");

-- CreateIndex
CREATE INDEX "ConsentLog_userId_acceptedAt_idx" ON "axhy"."ConsentLog"("userId", "acceptedAt" DESC);

-- AddForeignKey
ALTER TABLE "axhy"."ConsentLog" ADD CONSTRAINT "ConsentLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "axhy"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
