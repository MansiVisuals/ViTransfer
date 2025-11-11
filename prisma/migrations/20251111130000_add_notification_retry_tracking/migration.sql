-- v0.2.5 Phase 3: Add Retry and Failure Tracking to NotificationQueue

-- Add retry attempt counters
ALTER TABLE "NotificationQueue" ADD COLUMN "clientAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "NotificationQueue" ADD COLUMN "adminAttempts" INTEGER NOT NULL DEFAULT 0;

-- Add failure flags
ALTER TABLE "NotificationQueue" ADD COLUMN "clientFailed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "NotificationQueue" ADD COLUMN "adminFailed" BOOLEAN NOT NULL DEFAULT false;

-- Add error tracking
ALTER TABLE "NotificationQueue" ADD COLUMN "lastError" TEXT;

-- Create index for failed notifications (for monitoring/cleanup)
CREATE INDEX "NotificationQueue_clientFailed_adminFailed_idx" ON "NotificationQueue"("clientFailed", "adminFailed");
