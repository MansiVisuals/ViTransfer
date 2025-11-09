-- AlterTable: Remove deprecated clientName and clientEmail columns
-- v0.2.0: Data has been migrated to ProjectRecipient table in previous migration (20251108133705)
-- All projects now use the recipients relation instead of these legacy fields

ALTER TABLE "Project" DROP COLUMN "clientName";
ALTER TABLE "Project" DROP COLUMN "clientEmail";
