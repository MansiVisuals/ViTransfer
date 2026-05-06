-- Adds an optional path to a custom uploaded favicon (svg/png/ico).
-- Mirrors brandingLogoPath. Nullable: when null, layout falls back to the
-- built-in /brand/icon.svg endpoint.

ALTER TABLE "Settings" ADD COLUMN "brandingFaviconPath" TEXT;
