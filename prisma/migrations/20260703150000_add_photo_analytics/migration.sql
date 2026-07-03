-- Photo download analytics: allow project-level events without a video

ALTER TABLE "VideoAnalytics" ALTER COLUMN "videoId" DROP NOT NULL;
ALTER TABLE "VideoAnalytics" ADD COLUMN "albumId" TEXT;
ALTER TABLE "VideoAnalytics" ADD COLUMN "photoIds" TEXT;
