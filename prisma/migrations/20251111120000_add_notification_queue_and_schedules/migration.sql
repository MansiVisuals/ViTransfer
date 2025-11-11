-- v0.2.5 Phase 2: Add Notification Queue and Schedule Settings

-- Step 1: Add receiveNotifications to ProjectRecipient (default true)
ALTER TABLE "ProjectRecipient" ADD COLUMN "receiveNotifications" BOOLEAN NOT NULL DEFAULT true;

-- Step 2: Add admin notification schedule fields to Settings
ALTER TABLE "Settings" ADD COLUMN "adminNotificationSchedule" TEXT NOT NULL DEFAULT 'IMMEDIATE';
ALTER TABLE "Settings" ADD COLUMN "adminNotificationTime" TEXT;
ALTER TABLE "Settings" ADD COLUMN "adminNotificationDay" INTEGER;
ALTER TABLE "Settings" ADD COLUMN "lastAdminNotificationSent" TIMESTAMP(3);

-- Step 3: Add client notification schedule fields to Project
ALTER TABLE "Project" ADD COLUMN "clientNotificationSchedule" TEXT NOT NULL DEFAULT 'IMMEDIATE';
ALTER TABLE "Project" ADD COLUMN "clientNotificationTime" TEXT;
ALTER TABLE "Project" ADD COLUMN "clientNotificationDay" INTEGER;
ALTER TABLE "Project" ADD COLUMN "lastClientNotificationSent" TIMESTAMP(3);

-- Step 4: Create NotificationQueue table
CREATE TABLE "NotificationQueue" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sentToClients" BOOLEAN NOT NULL DEFAULT false,
    "sentToAdmins" BOOLEAN NOT NULL DEFAULT false,
    "clientSentAt" TIMESTAMP(3),
    "adminSentAt" TIMESTAMP(3),
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationQueue_pkey" PRIMARY KEY ("id")
);

-- Step 5: Add foreign key constraint
ALTER TABLE "NotificationQueue" ADD CONSTRAINT "NotificationQueue_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 6: Create indexes for NotificationQueue
CREATE INDEX "NotificationQueue_projectId_sentToClients_idx" ON "NotificationQueue"("projectId", "sentToClients");
CREATE INDEX "NotificationQueue_projectId_sentToAdmins_idx" ON "NotificationQueue"("projectId", "sentToAdmins");
CREATE INDEX "NotificationQueue_sentToAdmins_createdAt_idx" ON "NotificationQueue"("sentToAdmins", "createdAt");
