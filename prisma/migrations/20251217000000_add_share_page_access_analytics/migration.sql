-- CreateTable
-- Add SharePageAccess table for tracking share page authentication events
CREATE TABLE "SharePageAccess" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "accessMethod" TEXT NOT NULL,
    "email" TEXT,
    "sessionId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharePageAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SharePageAccess_projectId_createdAt_idx" ON "SharePageAccess"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "SharePageAccess_projectId_accessMethod_idx" ON "SharePageAccess"("projectId", "accessMethod");

-- CreateIndex
CREATE INDEX "SharePageAccess_sessionId_idx" ON "SharePageAccess"("sessionId");

-- AddForeignKey
ALTER TABLE "SharePageAccess" ADD CONSTRAINT "SharePageAccess_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Remove PAGE_VISIT events from VideoAnalytics (keep DOWNLOAD_COMPLETE)
DELETE FROM "VideoAnalytics" WHERE "eventType" = 'PAGE_VISIT';
