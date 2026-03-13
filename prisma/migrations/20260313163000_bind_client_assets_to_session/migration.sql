ALTER TABLE "VideoAsset"
ADD COLUMN "uploadedBySessionId" TEXT;

CREATE INDEX "VideoAsset_videoId_uploadedBySessionId_idx"
ON "VideoAsset"("videoId", "uploadedBySessionId");