-- Add guest mode field to Project table
ALTER TABLE "Project" ADD COLUMN "guestMode" BOOLEAN NOT NULL DEFAULT false;
