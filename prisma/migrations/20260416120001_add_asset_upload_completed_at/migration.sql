-- Add uploadCompletedAt to VideoAsset
-- Existing records remain NULL (treated as incomplete/orphaned).
-- All asset list and download queries now filter WHERE uploadCompletedAt IS NOT NULL
-- so phantom records from failed uploads are never surfaced.

ALTER TABLE "VideoAsset" ADD COLUMN "uploadCompletedAt" TIMESTAMP(3);

-- Index to speed up asset list queries
CREATE INDEX "VideoAsset_videoId_uploadCompletedAt_idx" ON "VideoAsset"("videoId", "uploadCompletedAt");
