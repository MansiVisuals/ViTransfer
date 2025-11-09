-- Make ProjectRecipient fields optional for v0.2.0
-- Allow recipients with just name, just email, or both

-- Drop the unique constraint on projectId + email
DROP INDEX "ProjectRecipient_projectId_email_key";

-- Make email nullable
ALTER TABLE "ProjectRecipient" ALTER COLUMN "email" DROP NOT NULL;

-- Create new index for email lookups (non-unique)
CREATE INDEX "ProjectRecipient_projectId_email_idx" ON "ProjectRecipient"("projectId", "email");
