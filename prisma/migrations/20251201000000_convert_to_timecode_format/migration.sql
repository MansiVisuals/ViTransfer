-- Convert timestamp (seconds) to timecode (HH:MM:SS:FF) format
-- Migration: Convert old seconds-based timestamps to timecode with :00 frames
-- Example: 36 seconds → "00:00:36:00" (migration rounds to :00 frames)
-- NEW comments going forward will store actual frame-accurate timecodes

-- Add timecode column
ALTER TABLE "Comment" ADD COLUMN "timecode" TEXT;

-- Convert all existing timestamps to timecode format
-- Old format: Float seconds (e.g., 36.5)
-- New format: HH:MM:SS:00 (rounded to :00 frames for migration)
-- Note: Cast to INTEGER for modulo operator compatibility
UPDATE "Comment"
SET "timecode" =
  LPAD(FLOOR(COALESCE(timestamp, 0) / 3600)::TEXT, 2, '0') || ':' ||  -- Hours
  LPAD(FLOOR((FLOOR(COALESCE(timestamp, 0))::INTEGER % 3600) / 60)::TEXT, 2, '0') || ':' ||  -- Minutes
  LPAD((FLOOR(COALESCE(timestamp, 0))::INTEGER % 60)::TEXT, 2, '0') || ':' ||  -- Seconds
  '00'  -- Frames (always 00 for migrated data)
WHERE "timecode" IS NULL;

-- Drop the old timestamp column
ALTER TABLE "Comment" DROP COLUMN "timestamp";

-- Make timecode NOT NULL (all comments must have a timecode)
ALTER TABLE "Comment" ALTER COLUMN "timecode" SET NOT NULL;
