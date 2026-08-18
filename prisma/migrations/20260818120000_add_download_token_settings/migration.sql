ALTER TABLE "SecuritySettings" ADD COLUMN "downloadTokenTtlSeconds" INTEGER NOT NULL DEFAULT 14400;
ALTER TABLE "SecuritySettings" ADD COLUMN "downloadTokenMaxUses" INTEGER NOT NULL DEFAULT 3;
