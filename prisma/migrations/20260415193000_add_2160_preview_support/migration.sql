-- Add 2160p preview columns for watermarked and clean playback variants
ALTER TABLE "Video" ADD COLUMN IF NOT EXISTS "preview2160Path" TEXT;
ALTER TABLE "Video" ADD COLUMN IF NOT EXISTS "cleanPreview2160Path" TEXT;
