-- Remove currentRevision field from Project table
-- Revisions are now tracked per-video by counting versions in each video group

ALTER TABLE "Project" DROP COLUMN "currentRevision";
