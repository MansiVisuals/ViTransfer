-- Add project setting for approved playback source
ALTER TABLE "Project" ADD COLUMN "usePreviewForApprovedPlayback" BOOLEAN NOT NULL DEFAULT false;

-- Add clean preview paths to Video for non-watermarked approved playback
ALTER TABLE "Video" ADD COLUMN "cleanPreview1080Path" TEXT;
ALTER TABLE "Video" ADD COLUMN "cleanPreview720Path" TEXT;

-- Add default setting for approved playback in global Settings
ALTER TABLE "Settings" ADD COLUMN "defaultUsePreviewForApprovedPlayback" BOOLEAN NOT NULL DEFAULT false;
