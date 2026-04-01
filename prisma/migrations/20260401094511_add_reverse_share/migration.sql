-- Add reverse share fields to Project
ALTER TABLE "Project" ADD COLUMN "allowReverseShare" BOOLEAN NOT NULL DEFAULT false;

-- Create ProjectUpload table for client-submitted files
CREATE TABLE "ProjectUpload" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "fileType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "storagePath" TEXT NOT NULL,
    "category" TEXT,
    "uploadedBySessionId" TEXT,
    "uploadedByName" TEXT,
    "uploadedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectUpload_pkey" PRIMARY KEY ("id")
);

-- Foreign key
ALTER TABLE "ProjectUpload" ADD CONSTRAINT "ProjectUpload_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE;

-- Indexes
CREATE INDEX "ProjectUpload_projectId_idx" ON "ProjectUpload"("projectId");
CREATE INDEX "ProjectUpload_projectId_createdAt_idx" ON "ProjectUpload"("projectId", "createdAt");
CREATE INDEX "ProjectUpload_uploadedBySessionId_idx" ON "ProjectUpload"("uploadedBySessionId");
