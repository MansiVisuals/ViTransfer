-- Add default client access settings to the global Settings model
ALTER TABLE "Settings" ADD COLUMN "defaultAllowReverseShare"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Settings" ADD COLUMN "defaultShowClientTutorial" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "defaultAllowAssetDownload" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "defaultClientCanApprove"   BOOLEAN NOT NULL DEFAULT true;
