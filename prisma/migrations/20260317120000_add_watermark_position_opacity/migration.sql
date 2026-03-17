-- Add watermark position, opacity, and font size settings to Settings (global defaults)
ALTER TABLE "Settings" ADD COLUMN "defaultWatermarkPositions" TEXT NOT NULL DEFAULT 'center';
ALTER TABLE "Settings" ADD COLUMN "defaultWatermarkOpacity" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Settings" ADD COLUMN "defaultWatermarkFontSize" TEXT NOT NULL DEFAULT 'medium';

-- Add watermark position, opacity, and font size settings to Project (per-project override)
ALTER TABLE "Project" ADD COLUMN "watermarkPositions" TEXT NOT NULL DEFAULT 'center';
ALTER TABLE "Project" ADD COLUMN "watermarkOpacity" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Project" ADD COLUMN "watermarkFontSize" TEXT NOT NULL DEFAULT 'medium';
