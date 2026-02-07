-- Restructure notification event types:
-- FAILED_LOGIN → ADMIN_ACCESS
-- UNAUTHORIZED_OTP → SHARE_ACCESS (merge with existing)
-- New: SECURITY_ALERT

-- 1. NotificationSubscription: rename FAILED_LOGIN → ADMIN_ACCESS
UPDATE "NotificationSubscription"
SET "eventType" = 'ADMIN_ACCESS', "updatedAt" = NOW()
WHERE "eventType" = 'FAILED_LOGIN';

-- 2. NotificationSubscription: rename UNAUTHORIZED_OTP → SHARE_ACCESS
-- If a SHARE_ACCESS row already exists for the same destination, delete the UNAUTHORIZED_OTP row
-- Otherwise rename it
DELETE FROM "NotificationSubscription"
WHERE "eventType" = 'UNAUTHORIZED_OTP'
  AND "destinationId" IN (
    SELECT "destinationId" FROM "NotificationSubscription" WHERE "eventType" = 'SHARE_ACCESS'
  );

UPDATE "NotificationSubscription"
SET "eventType" = 'SHARE_ACCESS', "updatedAt" = NOW()
WHERE "eventType" = 'UNAUTHORIZED_OTP';

-- 3. Add SECURITY_ALERT subscription for every destination that doesn't have one
INSERT INTO "NotificationSubscription" ("id", "destinationId", "eventType", "enabled", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  d."id",
  'SECURITY_ALERT',
  true,
  NOW(),
  NOW()
FROM "NotificationDestination" d
WHERE NOT EXISTS (
  SELECT 1 FROM "NotificationSubscription" s
  WHERE s."destinationId" = d."id" AND s."eventType" = 'SECURITY_ALERT'
);

-- 4. Add ADMIN_ACCESS subscription for every destination that doesn't have one
INSERT INTO "NotificationSubscription" ("id", "destinationId", "eventType", "enabled", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  d."id",
  'ADMIN_ACCESS',
  true,
  NOW(),
  NOW()
FROM "NotificationDestination" d
WHERE NOT EXISTS (
  SELECT 1 FROM "NotificationSubscription" s
  WHERE s."destinationId" = d."id" AND s."eventType" = 'ADMIN_ACCESS'
);

-- 5. NotificationDeliveryLog: update old eventType references (for historical accuracy)
UPDATE "NotificationDeliveryLog"
SET "eventType" = 'ADMIN_ACCESS'
WHERE "eventType" = 'FAILED_LOGIN';

UPDATE "NotificationDeliveryLog"
SET "eventType" = 'SHARE_ACCESS'
WHERE "eventType" = 'UNAUTHORIZED_OTP';

-- 6. PushSubscription: replace old event types in subscribedEvents arrays
-- Replace FAILED_LOGIN with ADMIN_ACCESS
UPDATE "PushSubscription"
SET "subscribedEvents" = array_replace("subscribedEvents", 'FAILED_LOGIN', 'ADMIN_ACCESS');

-- Replace UNAUTHORIZED_OTP with SHARE_ACCESS (avoid duplicates by removing first if SHARE_ACCESS exists)
UPDATE "PushSubscription"
SET "subscribedEvents" = array_remove("subscribedEvents", 'UNAUTHORIZED_OTP')
WHERE 'SHARE_ACCESS' = ANY("subscribedEvents")
  AND 'UNAUTHORIZED_OTP' = ANY("subscribedEvents");

UPDATE "PushSubscription"
SET "subscribedEvents" = array_replace("subscribedEvents", 'UNAUTHORIZED_OTP', 'SHARE_ACCESS')
WHERE 'UNAUTHORIZED_OTP' = ANY("subscribedEvents");

-- Add SECURITY_ALERT to all push subscriptions that don't have it
UPDATE "PushSubscription"
SET "subscribedEvents" = array_append("subscribedEvents", 'SECURITY_ALERT')
WHERE NOT ('SECURITY_ALERT' = ANY("subscribedEvents"));

-- Add ADMIN_ACCESS to all push subscriptions that don't have it
UPDATE "PushSubscription"
SET "subscribedEvents" = array_append("subscribedEvents", 'ADMIN_ACCESS')
WHERE NOT ('ADMIN_ACCESS' = ANY("subscribedEvents"));
