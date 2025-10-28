-- Remove ProjectSecuritySettings table (unused feature)
DROP TABLE IF EXISTS "ProjectSecuritySettings";

-- Remove securitySettings relation from Project (no longer needed)
-- (Prisma will handle this automatically)

-- Update SecuritySettings with correct defaults and new field
-- Add viewSecurityEvents field
ALTER TABLE "SecuritySettings" ADD COLUMN IF NOT EXISTS "viewSecurityEvents" BOOLEAN NOT NULL DEFAULT false;

-- Update default rate limits to correct values for video streaming
-- Only update if still at old defaults (300, 120)
UPDATE "SecuritySettings"
SET
  "ipRateLimit" = 1000,
  "sessionRateLimit" = 600
WHERE id = 'default'
  AND "ipRateLimit" = 300
  AND "sessionRateLimit" = 120;
