-- Add foreign key from Comment to Video with ON DELETE CASCADE
-- This ensures comments are automatically deleted when their video is deleted

-- First, clean up any orphaned comments (videoId references non-existent videos)
DELETE FROM "Comment" WHERE "videoId" NOT IN (SELECT "id" FROM "Video");

-- Add the foreign key constraint with cascade delete
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_videoId_fkey"
    FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
