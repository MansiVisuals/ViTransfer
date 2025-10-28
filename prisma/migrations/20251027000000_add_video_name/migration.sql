-- AlterTable
-- Add Video.name column and index
ALTER TABLE "Video" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT 'Untitled';

-- Create index for projectId and name
CREATE INDEX IF NOT EXISTS "Video_projectId_name_idx" ON "Video"("projectId", "name");
