-- Add default comment timestamp display to global settings
ALTER TABLE "Settings"
  ADD COLUMN "defaultTimestampDisplay" TEXT NOT NULL DEFAULT 'TIMECODE';

-- Add per-project timestamp display mode (stored on the project)
ALTER TABLE "Project"
  ADD COLUMN "timestampDisplay" TEXT NOT NULL DEFAULT 'TIMECODE';
