-- Worker-generated preview thumbnails for client uploads (images + videos)

ALTER TABLE "ProjectUpload" ADD COLUMN "thumbnailPath" TEXT;
