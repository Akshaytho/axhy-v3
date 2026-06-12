-- 031 — Restrict company-delete cascade on the legal-trail tables (C2, ADR-context: deep review 2026-06-10 §4)
--
-- WHY: locked INVARIANT 9 (AuditEvent is INSERT-only/immutable) and INVARIANT 11
-- (worker history retained forever; offboarding = status change, never row
-- deletion). The schema's own comments already promise persistence
-- (AuditEvent.actorId "audit must persist"; Attendance.markedBySupervisorId
-- "fact must persist (DPDP archive)") — but the Company FK carried ON DELETE
-- CASCADE, so one company hard-delete would erase the entire legal trail.
-- After this migration the DB refuses it loudly (FK restrict error).
--
-- App impact: NONE — no code path deletes Company rows (verified: zero
-- .company.delete/.worker.delete/.site.delete calls in apps/backend/src and
-- apps/admin-web). This is defense-in-depth at the DB layer.
--
-- ROLLBACK (one ALTER per constraint — re-add CASCADE):
--   ALTER TABLE "axhy"."Visit"      DROP CONSTRAINT "Visit_companyId_fkey";
--   ALTER TABLE "axhy"."Visit"      ADD CONSTRAINT "Visit_companyId_fkey"      FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--   ALTER TABLE "axhy"."AuditEvent" DROP CONSTRAINT "AuditEvent_companyId_fkey";
--   ALTER TABLE "axhy"."AuditEvent" ADD CONSTRAINT "AuditEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--   ALTER TABLE "axhy"."Attendance" DROP CONSTRAINT "Attendance_companyId_fkey";
--   ALTER TABLE "axhy"."Attendance" ADD CONSTRAINT "Attendance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "axhy"."Visit" DROP CONSTRAINT "Visit_companyId_fkey";

-- DropForeignKey
ALTER TABLE "axhy"."AuditEvent" DROP CONSTRAINT "AuditEvent_companyId_fkey";

-- DropForeignKey
ALTER TABLE "axhy"."Attendance" DROP CONSTRAINT "Attendance_companyId_fkey";

-- AddForeignKey
ALTER TABLE "axhy"."Visit" ADD CONSTRAINT "Visit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."AuditEvent" ADD CONSTRAINT "AuditEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axhy"."Attendance" ADD CONSTRAINT "Attendance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "axhy"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
