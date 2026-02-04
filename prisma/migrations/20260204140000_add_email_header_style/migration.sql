-- Add email header style setting (LOGO_ONLY or LOGO_AND_NAME)
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "emailHeaderStyle" TEXT NOT NULL DEFAULT 'LOGO_AND_NAME';
