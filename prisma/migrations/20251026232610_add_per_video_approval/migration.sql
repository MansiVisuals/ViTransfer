-- AlterTable
-- Add per-video approval columns (name and index already exist from previous migration)
ALTER TABLE "Video" ADD COLUMN IF NOT EXISTS "approved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Video" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
