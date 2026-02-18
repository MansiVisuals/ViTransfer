-- Add configurable max comment attachments per batch
ALTER TABLE "Settings" ADD COLUMN "maxCommentAttachments" INTEGER NOT NULL DEFAULT 10;
