-- CreateTable
CREATE TABLE "VideoAsset" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "fileType" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "category" TEXT,
    "uploadedBy" TEXT,
    "uploadedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoAsset_videoId_idx" ON "VideoAsset"("videoId");

-- CreateIndex
CREATE INDEX "VideoAsset_videoId_category_idx" ON "VideoAsset"("videoId", "category");

-- AddForeignKey
ALTER TABLE "VideoAsset" ADD CONSTRAINT "VideoAsset_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add allowAssetDownload field to Project table
ALTER TABLE "Project" ADD COLUMN "allowAssetDownload" BOOLEAN NOT NULL DEFAULT true;
