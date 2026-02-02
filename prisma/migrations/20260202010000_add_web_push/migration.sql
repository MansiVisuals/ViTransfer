-- Add VAPID key fields to Settings table for Web Push notifications
ALTER TABLE "Settings" ADD COLUMN "vapidPublicKey" TEXT;
ALTER TABLE "Settings" ADD COLUMN "vapidPrivateKey" TEXT;

-- Create PushSubscription table for browser push notification subscriptions
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "deviceName" TEXT,
    "subscribedEvents" TEXT[] DEFAULT ARRAY['FAILED_LOGIN', 'UNAUTHORIZED_OTP', 'SHARE_ACCESS', 'CLIENT_COMMENT', 'VIDEO_APPROVAL']::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint on endpoint (one subscription per browser)
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- Create index on userId for efficient lookups
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- Add foreign key constraint to User table
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
