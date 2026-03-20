-- GDPR compliance: Change SecurityEvent.projectId from SET NULL to CASCADE
-- When a project is deleted, all related security events are now fully removed
-- instead of being orphaned with a NULL projectId.

-- Drop existing foreign key constraint
ALTER TABLE "SecurityEvent" DROP CONSTRAINT IF EXISTS "SecurityEvent_projectId_fkey";

-- Re-add with CASCADE on delete
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
