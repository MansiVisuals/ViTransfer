-- Add default watermark enabled field to Settings table
ALTER TABLE "Settings" ADD COLUMN "defaultWatermarkEnabled" BOOLEAN NOT NULL DEFAULT true;
