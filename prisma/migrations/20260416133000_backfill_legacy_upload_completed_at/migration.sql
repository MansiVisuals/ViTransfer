-- Backfill legacy records created before uploadCompletedAt rollout so existing files stay visible
-- in admin/share views that now filter on uploadCompletedAt IS NOT NULL.

UPDATE "ProjectUpload"
SET "uploadCompletedAt" = COALESCE("updatedAt", "createdAt")
WHERE "uploadCompletedAt" IS NULL
  AND "createdAt" < TIMESTAMP '2026-04-16 12:00:00';

UPDATE "VideoAsset"
SET "uploadCompletedAt" = COALESCE("updatedAt", "createdAt")
WHERE "uploadCompletedAt" IS NULL
  AND "createdAt" < TIMESTAMP '2026-04-16 12:00:00';
