-- Add optional companyName field to Project table
-- Display priority: companyName → primary recipient → 'Client'

ALTER TABLE "Project" ADD COLUMN "companyName" TEXT;
