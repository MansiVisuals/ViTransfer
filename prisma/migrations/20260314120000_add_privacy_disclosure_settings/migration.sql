-- Add privacy disclosure settings
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "privacyDisclosureEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "privacyDisclosureText" TEXT;
