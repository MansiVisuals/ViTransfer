-- Admin-selectable album cover photo

ALTER TABLE "PhotoAlbum" ADD COLUMN "coverPhotoId" TEXT;

ALTER TABLE "PhotoAlbum" ADD CONSTRAINT "PhotoAlbum_coverPhotoId_fkey"
    FOREIGN KEY ("coverPhotoId") REFERENCES "Photo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
