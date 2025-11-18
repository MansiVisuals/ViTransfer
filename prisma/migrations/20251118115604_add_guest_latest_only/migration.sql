-- Add guest latest only restriction field to Project table
ALTER TABLE "Project" ADD COLUMN "guestLatestOnly" BOOLEAN NOT NULL DEFAULT true;
