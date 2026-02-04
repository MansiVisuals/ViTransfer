-- Add EmailTemplate table for customizable email templates
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "subject" TEXT NOT NULL,
    "bodyContent" TEXT NOT NULL,
    "isCustom" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- Each template type should be unique (only one custom template per type)
CREATE UNIQUE INDEX "EmailTemplate_type_key" ON "EmailTemplate"("type");

-- Index for quick lookups by type and enabled status
CREATE INDEX "EmailTemplate_type_enabled_idx" ON "EmailTemplate"("type", "enabled");
