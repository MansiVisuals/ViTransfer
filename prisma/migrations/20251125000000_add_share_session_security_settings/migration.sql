-- Add share session rate limiting and token TTL settings
ALTER TABLE "SecuritySettings" ADD COLUMN "shareSessionRateLimit" INTEGER NOT NULL DEFAULT 300;
ALTER TABLE "SecuritySettings" ADD COLUMN "shareTokenTtlSeconds" INTEGER;

-- Add comments for clarity
COMMENT ON COLUMN "SecuritySettings"."shareSessionRateLimit" IS 'Requests per minute per share session (client access)';
COMMENT ON COLUMN "SecuritySettings"."shareTokenTtlSeconds" IS 'Optional override for share JWT expiry (60-86400 seconds, null = use session timeout)';
