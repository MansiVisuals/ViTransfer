-- Add admin UI session timeout settings (inactivity logout)
ALTER TABLE "SecuritySettings"
  ADD COLUMN "adminSessionTimeoutValue" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "adminSessionTimeoutUnit" TEXT NOT NULL DEFAULT 'MINUTES';

