-- Migration: add_photo_support
-- Adds Photo model, project type field, photo comment support, and photo analytics

-- Project type (VIDEO or PHOTO)
ALTER TABLE "Project" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'VIDEO';

-- Photo model
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "versionLabel" TEXT NOT NULL DEFAULT 'v1',
    "originalFileName" TEXT NOT NULL,
    "originalFileSize" BIGINT NOT NULL,
    "originalStoragePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "width" INTEGER,
    "height" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'UPLOADING',
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Photo_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Photo_projectId_version_idx" ON "Photo"("projectId", "version");
CREATE INDEX "Photo_projectId_name_idx" ON "Photo"("projectId", "name");
CREATE INDEX "Photo_projectId_sortOrder_idx" ON "Photo"("projectId", "sortOrder");

-- Comment: make videoId and timecode nullable for photo comments
ALTER TABLE "Comment" ALTER COLUMN "videoId" DROP NOT NULL;
ALTER TABLE "Comment" ALTER COLUMN "timecode" DROP NOT NULL;

-- Comment: add photo comment fields
ALTER TABLE "Comment" ADD COLUMN "photoId" TEXT;
ALTER TABLE "Comment" ADD COLUMN "pinX" DOUBLE PRECISION;
ALTER TABLE "Comment" ADD COLUMN "pinY" DOUBLE PRECISION;

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_photoId_fkey"
    FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Comment_photoId_idx" ON "Comment"("photoId");

-- VideoAnalytics: make videoId nullable, add photoId for photo analytics
ALTER TABLE "VideoAnalytics" ALTER COLUMN "videoId" DROP NOT NULL;

ALTER TABLE "VideoAnalytics" ADD COLUMN "photoId" TEXT;
ALTER TABLE "VideoAnalytics" ADD CONSTRAINT "VideoAnalytics_photoId_fkey"
    FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "VideoAnalytics_photoId_createdAt_idx" ON "VideoAnalytics"("photoId", "createdAt");
