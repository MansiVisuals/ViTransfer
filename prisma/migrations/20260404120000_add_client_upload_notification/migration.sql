-- Add CLIENT_UPLOAD notification event type

-- 1. Add CLIENT_UPLOAD subscription for every existing notification destination
INSERT INTO "NotificationSubscription" ("id", "destinationId", "eventType", "enabled", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  d."id",
  'CLIENT_UPLOAD',
  true,
  NOW(),
  NOW()
FROM "NotificationDestination" d
WHERE NOT EXISTS (
  SELECT 1 FROM "NotificationSubscription" s
  WHERE s."destinationId" = d."id" AND s."eventType" = 'CLIENT_UPLOAD'
);

-- 2. Add CLIENT_UPLOAD to all existing push subscriptions
UPDATE "PushSubscription"
SET "subscribedEvents" = array_append("subscribedEvents", 'CLIENT_UPLOAD')
WHERE NOT ('CLIENT_UPLOAD' = ANY("subscribedEvents"));
