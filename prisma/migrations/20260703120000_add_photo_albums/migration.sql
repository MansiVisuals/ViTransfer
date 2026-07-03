-- Photo gallery: per-project albums with photos

ALTER TABLE "Project" ADD COLUMN "allowPhotoDownload" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "PhotoAlbum" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhotoAlbum_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "fileType" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "thumbnailPath" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "uploadedBy" TEXT,
    "uploadedByName" TEXT,
    "uploadCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PhotoAlbum" ADD CONSTRAINT "PhotoAlbum_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Photo" ADD CONSTRAINT "Photo_albumId_fkey"
    FOREIGN KEY ("albumId") REFERENCES "PhotoAlbum"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "PhotoAlbum_projectId_idx" ON "PhotoAlbum"("projectId");
CREATE INDEX "Photo_albumId_idx" ON "Photo"("albumId");
CREATE INDEX "Photo_albumId_uploadCompletedAt_idx" ON "Photo"("albumId", "uploadCompletedAt");
