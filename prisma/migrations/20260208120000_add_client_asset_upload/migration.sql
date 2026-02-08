-- AlterTable
ALTER TABLE "VideoAsset" ADD COLUMN "commentId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "allowClientAssetUpload" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "defaultAllowClientAssetUpload" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "VideoAsset" ADD CONSTRAINT "VideoAsset_commentId_fkey"
  FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "VideoAsset_commentId_idx" ON "VideoAsset"("commentId");
