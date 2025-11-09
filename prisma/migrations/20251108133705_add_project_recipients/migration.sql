-- CreateTable
CREATE TABLE "ProjectRecipient" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectRecipient_projectId_idx" ON "ProjectRecipient"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRecipient_projectId_email_key" ON "ProjectRecipient"("projectId", "email");

-- AddForeignKey
ALTER TABLE "ProjectRecipient" ADD CONSTRAINT "ProjectRecipient_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data Migration: Copy existing clientEmail and clientName to ProjectRecipient table
INSERT INTO "ProjectRecipient" ("id", "projectId", "email", "name", "isPrimary", "createdAt")
SELECT
    gen_random_uuid(),
    "id",
    "clientEmail",
    "clientName",
    true,
    CURRENT_TIMESTAMP
FROM "Project"
WHERE "clientEmail" IS NOT NULL AND "clientEmail" != '';
