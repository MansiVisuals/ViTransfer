-- AddTable NotificationDestination
CREATE TABLE "NotificationDestination" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "secretsEncrypted" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDestination_pkey" PRIMARY KEY ("id")
);

-- AddTable NotificationSubscription
CREATE TABLE "NotificationSubscription" (
    "id" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSubscription_pkey" PRIMARY KEY ("id")
);

-- AddTable NotificationDeliveryLog
CREATE TABLE "NotificationDeliveryLog" (
    "id" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "statusCode" INTEGER,
    "error" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDeliveryLog_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "NotificationSubscription" ADD CONSTRAINT "NotificationSubscription_destinationId_fkey"
    FOREIGN KEY ("destinationId") REFERENCES "NotificationDestination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationDeliveryLog" ADD CONSTRAINT "NotificationDeliveryLog_destinationId_fkey"
    FOREIGN KEY ("destinationId") REFERENCES "NotificationDestination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "NotificationDestination_provider_idx" ON "NotificationDestination"("provider");
CREATE INDEX "NotificationDestination_enabled_idx" ON "NotificationDestination"("enabled");
CREATE INDEX "NotificationDestination_createdAt_idx" ON "NotificationDestination"("createdAt");

CREATE UNIQUE INDEX "NotificationSubscription_destinationId_eventType_key"
    ON "NotificationSubscription"("destinationId", "eventType");
CREATE INDEX "NotificationSubscription_eventType_enabled_idx" ON "NotificationSubscription"("eventType", "enabled");

CREATE INDEX "NotificationDeliveryLog_destinationId_sentAt_idx" ON "NotificationDeliveryLog"("destinationId", "sentAt");
CREATE INDEX "NotificationDeliveryLog_eventType_sentAt_idx" ON "NotificationDeliveryLog"("eventType", "sentAt");
CREATE INDEX "NotificationDeliveryLog_success_sentAt_idx" ON "NotificationDeliveryLog"("success", "sentAt");

