-- Add clientCanApprove field to Project
-- When false, only admins can approve videos (clients can only comment and download)
-- Default is true to maintain backwards compatibility with existing projects

ALTER TABLE "Project" ADD COLUMN "clientCanApprove" BOOLEAN NOT NULL DEFAULT true;
