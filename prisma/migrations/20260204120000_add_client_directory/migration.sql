-- CreateTable: ClientCompany (client directory)
CREATE TABLE "ClientCompany" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ClientContact (contacts linked to companies)
CREATE TABLE "ClientContact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);

-- Add foreign key for ClientContact -> ClientCompany
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "ClientCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add optional link from Project to ClientCompany
ALTER TABLE "Project" ADD COLUMN "clientCompanyId" TEXT;

-- Add foreign key for Project -> ClientCompany
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientCompanyId_fkey"
    FOREIGN KEY ("clientCompanyId") REFERENCES "ClientCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create indexes
CREATE UNIQUE INDEX "ClientCompany_name_key" ON "ClientCompany"("name");
CREATE INDEX "ClientContact_companyId_idx" ON "ClientContact"("companyId");
CREATE INDEX "ClientContact_email_idx" ON "ClientContact"("email");
CREATE INDEX "Project_clientCompanyId_idx" ON "Project"("clientCompanyId");
