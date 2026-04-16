-- Add uploadCompletedAt to ProjectUpload
-- Existing records remain NULL (treated as incomplete/orphaned).
-- The application now only shows records where uploadCompletedAt IS NOT NULL
-- to admins, ensuring phantom records from failed uploads are never surfaced.

ALTER TABLE "ProjectUpload" ADD COLUMN "uploadCompletedAt" TIMESTAMP(3);

-- Index to speed up the admin list query (WHERE projectId = ? AND uploadCompletedAt IS NOT NULL)
CREATE INDEX "ProjectUpload_projectId_uploadCompletedAt_idx" ON "ProjectUpload"("projectId", "uploadCompletedAt");
