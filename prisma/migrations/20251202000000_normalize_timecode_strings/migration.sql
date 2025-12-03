-- Comprehensive normalization pass for Comment time references
-- 1) If the legacy "timestamp" column still exists (on restored backups), fill timecode and drop it.
-- 2) Convert any numeric timecode strings (e.g., "36" or "36.5") to HH:MM:SS:00.
-- Safe to run once; guards against re-running on already-migrated schemas.

DO $$
BEGIN
  -- Step 1: If legacy "timestamp" exists, backfill timecode and drop it.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Comment' AND column_name = 'timestamp'
  ) THEN
    -- Add timecode if missing (idempotent protection)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'Comment' AND column_name = 'timecode'
    ) THEN
      ALTER TABLE "Comment" ADD COLUMN "timecode" TEXT;
    END IF;

    -- Fill timecode from timestamp (seconds) → HH:MM:SS:00
    UPDATE "Comment"
    SET "timecode" =
      LPAD(FLOOR(COALESCE(timestamp, 0) / 3600)::TEXT, 2, '0') || ':' ||
      LPAD(FLOOR((FLOOR(COALESCE(timestamp, 0))::INTEGER % 3600) / 60)::TEXT, 2, '0') || ':' ||
      LPAD((FLOOR(COALESCE(timestamp, 0))::INTEGER % 60)::TEXT, 2, '0') || ':' ||
      '00'
    WHERE "timecode" IS NULL;

    -- Drop legacy column
    ALTER TABLE "Comment" DROP COLUMN "timestamp";

    -- Ensure NOT NULL on timecode
    ALTER TABLE "Comment" ALTER COLUMN "timecode" SET NOT NULL;
  END IF;
END $$;

-- Step 2: Normalize numeric timecode strings (e.g., "36" or "36.5") → HH:MM:SS:00
WITH numeric_timecodes AS (
  SELECT
    id,
    CAST(timecode AS NUMERIC) AS seconds
  FROM "Comment"
  WHERE timecode ~ '^[0-9]+(\\.[0-9]+)?$'
)
UPDATE "Comment" AS c
SET timecode =
  LPAD(FLOOR(n.seconds / 3600)::TEXT, 2, '0') || ':' || -- Hours
  LPAD(FLOOR((n.seconds % 3600) / 60)::TEXT, 2, '0') || ':' || -- Minutes
  LPAD(FLOOR(n.seconds % 60)::TEXT, 2, '0') || ':' || -- Seconds
  '00' -- Frames
FROM numeric_timecodes AS n
WHERE c.id = n.id;
