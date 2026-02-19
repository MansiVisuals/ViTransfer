-- Add annotation support to comments
-- timecodeEnd: optional end timecode for time range comments
-- annotations: JSONB storing drawing overlay data (keyframes with shapes)

ALTER TABLE "Comment" ADD COLUMN "timecodeEnd" TEXT;
ALTER TABLE "Comment" ADD COLUMN "annotations" JSONB;
