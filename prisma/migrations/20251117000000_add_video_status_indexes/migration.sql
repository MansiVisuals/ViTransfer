-- Add indexes for Video.status to improve query performance
-- Security Audit O-5: Missing index on Video.status

-- Index for filtering videos by status
CREATE INDEX IF NOT EXISTS "Video_status_idx" ON "Video"("status");

-- Composite index for project + status queries (most common pattern)
CREATE INDEX IF NOT EXISTS "Video_projectId_status_idx" ON "Video"("projectId", "status");
