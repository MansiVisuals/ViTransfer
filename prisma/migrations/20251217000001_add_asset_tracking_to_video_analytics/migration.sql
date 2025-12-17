-- Add asset tracking fields to VideoAnalytics table
-- assetId: tracks individual asset downloads
-- assetIds: tracks multiple assets downloaded as ZIP (JSON array)

ALTER TABLE "VideoAnalytics" ADD COLUMN "assetId" TEXT;
ALTER TABLE "VideoAnalytics" ADD COLUMN "assetIds" TEXT;

-- Create index for efficient asset download lookups
CREATE INDEX "VideoAnalytics_assetId_idx" ON "VideoAnalytics"("assetId");
