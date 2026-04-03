-- Add maxReverseShareFiles field to Settings table
ALTER TABLE "Settings" ADD COLUMN "maxReverseShareFiles" INTEGER NOT NULL DEFAULT 10;
