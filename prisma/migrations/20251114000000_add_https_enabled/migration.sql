-- Add HTTPS enforcement toggle to SecuritySettings
-- Default to true for production security (env var HTTPS_ENABLED always takes precedence)
ALTER TABLE "SecuritySettings" ADD COLUMN "httpsEnabled" BOOLEAN NOT NULL DEFAULT true;
