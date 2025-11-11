-- v0.2.5 Migration: Remove General Comments & Migrate Recipient IDs

-- Step 1: Delete all general comments (where videoId IS NULL)
DELETE FROM "Comment" WHERE "videoId" IS NULL;

-- Step 2: Make Comment.videoId required (NOT NULL)
ALTER TABLE "Comment" ALTER COLUMN "videoId" SET NOT NULL;

-- Step 3: Remove notification fields from Comment table
ALTER TABLE "Comment" DROP COLUMN IF EXISTS "notifyByEmail";
ALTER TABLE "Comment" DROP COLUMN IF EXISTS "notificationEmail";

-- Step 4: Migrate all UUID format recipient IDs to CUID format
-- This ensures consistency with the schema's @default(cuid())
UPDATE "ProjectRecipient"
SET id = CONCAT('c', SUBSTRING(MD5(RANDOM()::TEXT || id::TEXT), 1, 24))
WHERE id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
