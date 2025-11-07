-- AlterTable
ALTER TABLE "SecuritySettings" ADD COLUMN "sessionTimeoutValue" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "SecuritySettings" ADD COLUMN "sessionTimeoutUnit" TEXT NOT NULL DEFAULT 'MINUTES';
