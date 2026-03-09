-- Add language setting to Settings table
ALTER TABLE "Settings" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
