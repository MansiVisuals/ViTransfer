-- Add IP and Domain blocklist tables for security management

-- Create BlockedIP table
CREATE TABLE "BlockedIP" (
    "id" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "BlockedIP_pkey" PRIMARY KEY ("id")
);

-- Create BlockedDomain table
CREATE TABLE "BlockedDomain" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "BlockedDomain_pkey" PRIMARY KEY ("id")
);

-- Create unique indexes
CREATE UNIQUE INDEX "BlockedIP_ipAddress_key" ON "BlockedIP"("ipAddress");
CREATE UNIQUE INDEX "BlockedDomain_domain_key" ON "BlockedDomain"("domain");

-- Create lookup indexes
CREATE INDEX "BlockedIP_ipAddress_idx" ON "BlockedIP"("ipAddress");
CREATE INDEX "BlockedDomain_domain_idx" ON "BlockedDomain"("domain");
