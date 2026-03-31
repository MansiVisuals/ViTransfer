-- Add preview LUT toggle to Project and Settings models

ALTER TABLE "Project" ADD COLUMN "applyPreviewLut" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "defaultApplyPreviewLut" BOOLEAN NOT NULL DEFAULT true;
