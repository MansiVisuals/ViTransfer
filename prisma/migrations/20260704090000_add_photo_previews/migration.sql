-- Web-sized photo previews for lightbox viewing (originals stay download-only)

ALTER TABLE "Photo" ADD COLUMN "previewPath" TEXT;
